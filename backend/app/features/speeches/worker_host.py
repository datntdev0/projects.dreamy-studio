import json
import logging
import os
import queue
import subprocess
import threading
import time
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Any

from app.shared.processes import NO_WINDOW_FLAGS
from app.workers.protocol import SHUTDOWN

WORKERS_DIR = Path(__file__).resolve().parents[2] / "workers"
BOOTSTRAP = WORKERS_DIR / "bootstrap.py"
STOP_TIMEOUT = 5.0
DEFAULT_IDLE_SECONDS = 600.0
MAX_REAP_INTERVAL = 30.0
WORKER_ENV = {
    "HF_HUB_OFFLINE": "1",
    "HF_HUB_DISABLE_TELEMETRY": "1",
    "TRANSFORMERS_OFFLINE": "1",
}
STRIPPED_ENV = ("PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP")
DEFAULT_POOL_SIZE = 1

WorkerStep = tuple[str, dict[str, Any], float]

logger = logging.getLogger("workers")


class WorkerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class WorkerTimeout(WorkerError):
    def __init__(self, op: str, seconds: float) -> None:
        super().__init__("WORKER_TIMEOUT", f"Worker did not answer '{op}' within {seconds:g}s")


class WorkerCrashed(WorkerError):
    def __init__(self, exit_code: int | None) -> None:
        super().__init__("WORKER_CRASHED", f"Worker exited unexpectedly (code {exit_code})")


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
    return (log_dir / f"worker-{key}.log").open("wb")


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
                raise WorkerCrashed(self.process.wait())
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
        pool_size: int = DEFAULT_POOL_SIZE,
    ) -> None:
        self.python = python
        self.log_dir = log_dir
        self.idle_seconds = idle_seconds
        self.pool_size = max(pool_size, 1)
        self.lock = threading.Lock()
        self.available = threading.Condition(self.lock)
        self.workers: dict[str, list[WorkerProcess]] = {}
        self.closed = threading.Event()
        self.reaper: threading.Thread | None = None

    def call(
        self, spec: WorkerSpec, op: str, payload: dict[str, Any], timeout: float
    ) -> dict[str, Any]:
        return self.run(spec, [(op, payload, timeout)])

    def run(self, spec: WorkerSpec, steps: Sequence[WorkerStep]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        with self.checkout(spec) as worker:
            for op, payload, timeout in steps:
                result = worker.request(op, payload, timeout)
        return result

    @contextmanager
    def checkout(self, spec: WorkerSpec) -> Iterator[WorkerProcess]:
        worker = self.acquire(spec)
        try:
            yield worker
        finally:
            self.release(worker)

    def acquire(self, spec: WorkerSpec) -> WorkerProcess:
        with self.available:
            while True:
                pool = self.pool_for(spec)
                worker = self.claim_idle(pool)
                if worker is not None:
                    return worker
                if len(pool) < self.pool_size:
                    return self.spawn_locked(spec, pool)
                self.available.wait()

    def release(self, worker: WorkerProcess) -> None:
        worker.lock.release()
        with self.available:
            self.available.notify()

    def pool_for(self, spec: WorkerSpec) -> list[WorkerProcess]:
        pool = self.workers.get(spec.key)
        if pool is None or any(worker.spec != spec for worker in pool):
            self.stop_all_locked()
            pool = self.workers[spec.key] = []
        return pool

    def claim_idle(self, pool: list[WorkerProcess]) -> WorkerProcess | None:
        for worker in list(pool):
            if not worker.lock.acquire(blocking=False):
                continue
            if worker.alive():
                return worker
            pool.remove(worker)
            worker.stop()
            worker.lock.release()
        return None

    def spawn_locked(self, spec: WorkerSpec, pool: list[WorkerProcess]) -> WorkerProcess:
        worker = WorkerProcess(self.python, spec, self.log_dir)
        worker.lock.acquire()
        pool.append(worker)
        self.start_reaper()
        return worker

    def stop_all_locked(self) -> None:
        for pool in list(self.workers.values()):
            stop_pool(pool)
        self.workers.clear()

    def stop(self, key: str) -> None:
        with self.lock:
            pool = self.workers.pop(key, [])
        stop_pool(pool)

    def active(self, key: str) -> WorkerProcess | None:
        with self.lock:
            alive = [worker for worker in self.workers.get(key, []) if worker.alive()]
            return alive[0] if alive else None

    def count(self, key: str) -> int:
        with self.lock:
            return sum(worker.alive() for worker in self.workers.get(key, []))

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
            for key, pool in list(self.workers.items()):
                for worker in list(pool):
                    if self.reap_worker(worker):
                        pool.remove(worker)
                if not pool:
                    del self.workers[key]

    def reap_worker(self, worker: WorkerProcess) -> bool:
        if not worker.lock.acquire(blocking=False):
            return False
        try:
            expired = worker.idle_for() >= self.idle_seconds or not worker.alive()
            if expired:
                worker.stop()
            return expired
        finally:
            worker.lock.release()

    def close(self) -> None:
        self.closed.set()
        with self.lock:
            self.stop_all_locked()


def stop_pool(pool: list[WorkerProcess]) -> None:
    for worker in pool:
        with worker.lock:
            worker.stop()
