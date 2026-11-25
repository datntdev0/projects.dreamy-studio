import sys
import tempfile
import threading
import time
import unittest
import wave
from pathlib import Path

from support import wait_until

from app.features.speeches.worker_host import (
    WorkerCrashed,
    WorkerError,
    WorkerHost,
    WorkerSpec,
    WorkerTimeout,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROBE_ENGINE = """
import os
import sys
import time

from protocol import EngineError


class ProbeEngine:
    def load(self, payload):
        print("noisy library output on stdout")
        return {"loaded": payload.get("model")}

    def unload(self, payload):
        return {}

    def synthesize(self, payload):
        action = payload.get("action")
        if action == "sleep":
            time.sleep(payload["seconds"])
        if action == "crash":
            os._exit(3)
        if action == "fail":
            raise EngineError("VOICE_UNSUPPORTED", "Design is not supported")
        if action == "explode":
            raise RuntimeError("boom")
        return {"path": sys.path, "offline": os.environ.get("HF_HUB_OFFLINE")}


def create_engine():
    return ProbeEngine()
"""


class WorkerHostTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.site = self.root / "site"
        self.site.mkdir()
        (self.site / "engine_probe.py").write_text(PROBE_ENGINE, encoding="utf-8")
        self.logs = self.root / "logs"
        self.host = WorkerHost(sys.executable, self.logs)
        self.addCleanup(self.host.close)
        self.probe = WorkerSpec(key="probe-cpu", engine="engine_probe", site_dirs=(self.site,))
        self.tone = WorkerSpec(key="tone", engine="engine_tone")

    def call(self, spec: WorkerSpec, op: str, payload: dict, timeout: float = 30) -> dict:
        return self.host.call(spec, op, payload, timeout)

    def test_tone_engine_writes_wave_and_reuses_process(self):
        self.call(self.tone, "load", {"model": "tone"})
        first_pid = self.host.active("tone").pid
        output = self.root / "out" / "sample.wav"
        result = self.call(self.tone, "synthesize", {"text": "Xin chào", "outPath": str(output)})
        self.assertEqual(result, {"durationMs": 500, "sampleRate": 24_000})
        with wave.open(str(output)) as audio:
            self.assertEqual((audio.getnchannels(), audio.getframerate()), (1, 24_000))
            self.assertEqual(audio.getnframes(), 12_000)
        self.assertEqual(self.host.active("tone").pid, first_pid)

    def test_engine_errors_are_reported(self):
        with self.assertRaises(WorkerError) as empty:
            self.call(self.tone, "synthesize", {"text": "hi", "outPath": "x.wav"})
        self.assertEqual(empty.exception.code, "MODEL_NOT_LOADED")
        with self.assertRaises(WorkerError) as unknown:
            self.call(self.tone, "format_disk", {})
        self.assertEqual(unknown.exception.code, "UNKNOWN_OP")
        with self.assertRaises(WorkerError) as declined:
            self.call(self.probe, "synthesize", {"action": "fail"})
        self.assertEqual(
            (declined.exception.code, declined.exception.message),
            ("VOICE_UNSUPPORTED", "Design is not supported"),
        )
        with self.assertRaises(WorkerError) as exploded:
            self.call(self.probe, "synthesize", {"action": "explode"})
        self.assertEqual(
            (exploded.exception.code, exploded.exception.message), ("ENGINE_FAILED", "boom")
        )
        self.assertIn("RuntimeError: boom", (self.logs / "worker-probe-cpu.log").read_text())

    def test_stdout_noise_and_isolation(self):
        self.assertEqual(self.call(self.probe, "load", {"model": "m"}), {"loaded": "m"})
        result = self.call(self.probe, "synthesize", {})
        paths = [Path(item).resolve() for item in result["path"] if item]
        self.assertIn(self.site.resolve(), paths)
        self.assertNotIn(BACKEND_ROOT, paths)
        self.assertEqual(result["offline"], "1")
        self.assertIn("noisy library output", (self.logs / "worker-probe-cpu.log").read_text())

    def test_timeout_kills_worker_and_next_call_restarts(self):
        self.call(self.probe, "load", {})
        pid = self.host.active("probe-cpu").pid
        with self.assertRaises(WorkerTimeout):
            self.call(self.probe, "synthesize", {"action": "sleep", "seconds": 30}, timeout=0.5)
        self.assertIsNone(self.host.active("probe-cpu"))
        self.call(self.probe, "load", {})
        self.assertNotEqual(self.host.active("probe-cpu").pid, pid)

    def test_crash_is_reported(self):
        with self.assertRaises(WorkerCrashed) as crashed:
            self.call(self.probe, "synthesize", {"action": "crash"})
        self.assertIn("code 3", crashed.exception.message)
        self.assertIsNone(self.host.active("probe-cpu"))

    def test_only_one_worker_runs_at_a_time(self):
        self.call(self.probe, "load", {})
        probe = self.host.active("probe-cpu")
        self.call(self.tone, "load", {})
        self.assertIsNone(self.host.active("probe-cpu"))
        self.assertFalse(probe.alive())
        self.assertIsNotNone(self.host.active("tone"))

    def test_idle_worker_is_reaped(self):
        host = WorkerHost(sys.executable, idle_seconds=0.2)
        self.addCleanup(host.close)
        host.call(self.tone, "load", {}, 30)
        worker = host.active("tone")
        wait_until(lambda: host.active("tone") is None, timeout=10)
        self.assertFalse(worker.alive())

    def test_missing_python_fails_to_start(self):
        host = WorkerHost(str(self.root / "missing-python.exe"))
        with self.assertRaises(WorkerError) as failed:
            host.call(self.tone, "load", {}, 5)
        self.assertEqual(failed.exception.code, "WORKER_START_FAILED")

    def test_close_stops_workers(self):
        self.call(self.tone, "load", {})
        worker = self.host.active("tone")
        self.host.close()
        self.assertFalse(worker.alive())


def run_into(host: WorkerHost, spec: WorkerSpec, steps: list, results: list[dict]) -> None:
    results.append(host.run(spec, steps))


class WorkerPoolTests(unittest.TestCase):
    def setUp(self) -> None:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        (self.root / "engine_probe.py").write_text(PROBE_ENGINE, encoding="utf-8")
        self.probe = WorkerSpec(key="probe-cpu", engine="engine_probe", site_dirs=(self.root,))
        self.tone = WorkerSpec(key="tone", engine="engine_tone")

    def host(self, size: int) -> WorkerHost:
        host = WorkerHost(sys.executable, pool_size=size)
        self.addCleanup(host.close)
        host.call(self.probe, "load", {}, 30)
        return host

    def sleep_in_parallel(self, host: WorkerHost, requests: int) -> float:
        sleep = {"action": "sleep", "seconds": 1.0}
        threads = [
            threading.Thread(target=host.call, args=(self.probe, "synthesize", sleep, 30))
            for _ in range(requests)
        ]
        started = time.monotonic()
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        return time.monotonic() - started

    def test_requests_share_one_worker_by_default(self):
        host = self.host(1)
        self.assertGreaterEqual(self.sleep_in_parallel(host, 2), 2.0)
        self.assertEqual(host.count("probe-cpu"), 1)

    def test_a_pool_runs_requests_on_separate_workers(self):
        host = self.host(2)
        elapsed = self.sleep_in_parallel(host, 2)
        self.assertLess(elapsed, 1.9)
        self.assertEqual(host.count("probe-cpu"), 2)
        self.assertGreaterEqual(self.sleep_in_parallel(host, 3), 2.0)
        self.assertEqual(host.count("probe-cpu"), 2)

    def test_steps_of_one_run_stay_on_the_same_worker(self):
        host = WorkerHost(sys.executable, pool_size=3)
        self.addCleanup(host.close)
        output = self.root / "out.wav"
        steps = [
            ("load", {"model": "tone"}, 30),
            ("synthesize", {"text": "Xin chào", "outPath": str(output)}, 30),
        ]
        results: list[dict] = []
        threads = [
            threading.Thread(target=run_into, args=(host, self.tone, steps, results))
            for _ in range(3)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(results, [{"durationMs": 500, "sampleRate": 24_000}] * 3)

    def test_switching_runtime_stops_the_whole_pool(self):
        host = self.host(2)
        self.sleep_in_parallel(host, 2)
        host.call(self.tone, "load", {}, 30)
        self.assertEqual(host.count("probe-cpu"), 0)
        self.assertEqual(host.count("tone"), 1)
