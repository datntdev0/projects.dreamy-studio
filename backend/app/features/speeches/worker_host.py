import json
import logging
import os
import queue
import subprocess
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import IO, Any

from app.shared.processes import NO_WINDOW_FLAGS
from app.workers.protocol import SHUTDOWN

WORKERS_DIR = Path(__file__).resolve().parents[2] / "workers"
BOOTSTRAP = WORKERS_DIR / "bootstrap.py"
STOP_TIMEOUT = 5.0
DEFAULT_IDLE_SECONDS = 600.0
MAX_REAP_INTERVAL = 30.0
MAX_LOG_BYTES = 10 * 1024 * 1024
WORKER_ENV = {
    "HF_HUB_OFFLINE": "1",
    "HF_HUB_DISABLE_TELEMETRY": "1",
    "TRANSFORMERS_OFFLINE": "1",
}
STRIPPED_ENV = ("PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP")

logger = logging.getLogger("workers")


class WorkerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class WorkerTimeout(WorkerError):
    def __init__(self, op: str, seconds: float) -> None:
        super().__init__("WORKER_TIMEOUT", f"Worker did not answer '{op}' within {seconds:g}s")


def describe_exit(exit_code: int | None) -> str:
    if exit_code is None:
        return "code None"
    return f"code {exit_code}, 0x{exit_code & 0xFFFFFFFF:08X}"


class WorkerCrashed(WorkerError):
    def __init__(self, exit_code: int | None) -> None:
        super().__init__(
            "WORKER_CRASHED", f"Worker exited unexpectedly ({describe_exit(exit_code)})"
        )


@dataclass(frozen=True)
class WorkerSpec:
    key: str
    engine: str
    site_dirs: tuple[Path, ...] = ()
    env: dict[str, str] = field(default_factory=dict)


def worker_command(python: str, spec: WorkerSpec) -> list[str]:
    command = [python, "-E", "-s", "-B", "-X", "utf8", str(BOOTSTRAP), "--engine", spec.engine]
    for directory in spec.site_dirs:
        command += ["--site", str(directory)]
    return command


def worker_env(spec: WorkerSpec) -> dict[str, str]:
    env = {key: value for key, value in os.environ.items() if key not in STRIPPED_ENV}
    return {**env, **WORKER_ENV, **spec.env}


def open_log(log_dir: Path | None, key: str) -> IO[bytes] | int:
    if log_dir is None:
        return subprocess.DEVNULL
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / f"worker-{key}.log"
    oversized = path.is_file() and path.stat().st_size > MAX_LOG_BYTES
    log = path.open("wb" if oversized else "ab")
    log.write(f"\n===== worker {key} started at {datetime.now().isoformat()} =====\n".encode())
    log.flush()
    return log


class WorkerProcess:
    def __init__(self, python: str, spec: WorkerSpec, log_dir: Path | None) -> None:
        self.spec = spec
        self.lock = threading.Lock()
        self.responses: queue.Queue[str | None] = queue.Queue()
        self.next_id = 0
        self.last_used = time.monotonic()
        self.log = open_log(log_dir, spec.key)
        self.process = self.spawn(python)
        self.reader = threading.Thread(
            target=self.read_responses, name=f"worker-{spec.key}", daemon=True
        )
        self.reader.start()
        logger.info("Worker %s started (pid=%s)", spec.key, self.process.pid)

    def spawn(self, python: str) -> subprocess.Popen[str]:
        try:
            return subprocess.Popen(
                worker_command(python, self.spec),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=self.log,
                env=worker_env(self.spec),
                text=True,
                encoding="utf-8",
                creationflags=NO_WINDOW_FLAGS,
            )
        except OSError as error:
            self.close_log()
            raise WorkerError("WORKER_START_FAILED", f"Cannot start worker: {error}") from error

    @property
    def pid(self) -> int:
        return self.process.pid

    def alive(self) -> bool:
        return self.process.poll() is None

    def read_responses(self) -> None:
        stream = self.process.stdout
        if stream is not None:
            for line in stream:
                self.responses.put(line)
        self.responses.put(None)

    def send(self, message: dict[str, Any]) -> None:
        stream = self.process.stdin
        try:
            if stream is None:
                raise BrokenPipeError
            stream.write(json.dumps(message) + "\n")
            stream.flush()
        except (BrokenPipeError, OSError) as error:
            raise WorkerCrashed(self.process.poll()) from error

    def receive(self, request_id: int, op: str, timeout: float) -> dict[str, Any]:
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            try:
                line = self.responses.get(timeout=max(remaining, 0))
            except queue.Empty as error:
                self.kill()
                raise WorkerTimeout(op, timeout) from error
            if line is None:
                exit_code = self.process.wait()
                logger.error("Worker %s crashed (%s)", self.spec.key, describe_exit(exit_code))
                raise WorkerCrashed(exit_code)
            response = json.loads(line)
            if response.get("id") == request_id:
                return response

    def request(self, op: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
        self.next_id += 1
        request_id = self.next_id
        self.last_used = time.monotonic()
        try:
            self.send({"id": request_id, "op": op, "payload": payload})
            response = self.receive(request_id, op, timeout)
        finally:
            self.last_used = time.monotonic()
        if response.get("ok"):
            return response.get("result") or {}
        error = response.get("error") or {}
        raise WorkerError(str(error.get("code", "WORKER_FAILED")), str(error.get("message", "")))

    def idle_for(self) -> float:
        return time.monotonic() - self.last_used

    def stop(self) -> None:
        if self.alive():
            try:
                self.request(SHUTDOWN, {}, STOP_TIMEOUT)
                self.process.wait(STOP_TIMEOUT)
            except (WorkerError, subprocess.TimeoutExpired, ValueError):
                self.kill()
        self.close_log()
        logger.info("Worker %s stopped", self.spec.key)

    def kill(self) -> None:
        if self.alive():
            self.process.kill()
            self.process.wait()

    def close_log(self) -> None:
        if not isinstance(self.log, int):
            self.log.close()


class WorkerHost:
    def __init__(
        self,
        python: str,
        log_dir: Path | None = None,
        idle_seconds: float = DEFAULT_IDLE_SECONDS,
    ) -> None:
        self.python = python
        self.log_dir = log_dir
        self.idle_seconds = idle_seconds
        self.lock = threading.Lock()
        self.workers: dict[str, WorkerProcess] = {}
        self.closed = threading.Event()
        self.reaper: threading.Thread | None = None

    def call(
        self, spec: WorkerSpec, op: str, payload: dict[str, Any], timeout: float
    ) -> dict[str, Any]:
        worker = self.acquire(spec)
        with worker.lock:
            return worker.request(op, payload, timeout)

    def acquire(self, spec: WorkerSpec) -> WorkerProcess:
        with self.lock:
            worker = self.workers.get(spec.key)
            if worker is not None and worker.alive() and worker.spec == spec:
                return worker
            self.stop_all_locked()
            worker = WorkerProcess(self.python, spec, self.log_dir)
            self.workers[spec.key] = worker
            self.start_reaper()
            return worker

    def stop_all_locked(self) -> None:
        for worker in list(self.workers.values()):
            with worker.lock:
                worker.stop()
        self.workers.clear()

    def stop(self, key: str) -> None:
        with self.lock:
            worker = self.workers.pop(key, None)
        if worker is not None:
            with worker.lock:
                worker.stop()

    def active(self, key: str) -> WorkerProcess | None:
        with self.lock:
            worker = self.workers.get(key)
            return worker if worker is not None and worker.alive() else None

    def start_reaper(self) -> None:
        if self.reaper is not None and self.reaper.is_alive():
            return
        self.reaper = threading.Thread(target=self.reap, name="worker-reaper", daemon=True)
        self.reaper.start()

    def reap_interval(self) -> float:
        return max(min(self.idle_seconds / 2, MAX_REAP_INTERVAL), 0.05)

    def reap(self) -> None:
        while not self.closed.wait(self.reap_interval()):
            self.reap_idle()

    def reap_idle(self) -> None:
        with self.lock:
            for key, worker in list(self.workers.items()):
                if not worker.lock.acquire(blocking=False):
                    continue
                try:
                    if worker.idle_for() >= self.idle_seconds or not worker.alive():
                        worker.stop()
                        del self.workers[key]
                finally:
                    worker.lock.release()

    def close(self) -> None:
        self.closed.set()
        with self.lock:
            self.stop_all_locked()
