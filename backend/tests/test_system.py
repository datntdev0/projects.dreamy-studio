import os
import platform
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from support import asgi_request, write_fake_smi

from app import __main__ as cli
from app.features.system.cuda import configure_dll_search
from app.features.system.gpu import parse_nvidia_smi, query_nvidia_smi
from app.main import create_app
from app.shared.config import Settings
from app.shared.downloads import write_manifest


class GpuTests(unittest.TestCase):
    def test_parse_output(self):
        gpu = parse_nvidia_smi("\nNVIDIA GeForce RTX 3060, 12288, 560.94\nOther, 1, 2\n")
        self.assertEqual(
            (gpu.found, gpu.name, gpu.vram_mb, gpu.driver),
            (True, "NVIDIA GeForce RTX 3060", 12288, "560.94"),
        )
        self.assertFalse(parse_nvidia_smi("").found)
        self.assertEqual(parse_nvidia_smi("Card, N/A, 1.0").vram_mb, 0)

    def test_missing_and_failing_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertFalse(query_nvidia_smi(str(Path(directory) / "missing.exe")).found)
            failing = write_fake_smi(Path(directory), "No devices were found", exit_code=9)
            self.assertFalse(query_nvidia_smi(str(failing)).found)

    def test_system_and_scan(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            smi = write_fake_smi(root, "NVIDIA RTX A2000, 6138, 551.61")
            app = create_app(Settings(data_dir=root / "data", nvidia_smi=str(smi)))
            status, body = asgi_request(app, "GET", "/system")
            self.assertEqual(status, 200)
            self.assertEqual(
                body["gpu"],
                {"found": True, "name": "NVIDIA RTX A2000", "vramMb": 6138, "driver": "551.61"},
            )
            self.assertEqual(
                body["cuda"],
                {
                    "state": "none",
                    "receivedBytes": 0,
                    "totalBytes": 1077700558,
                    "error": "",
                    "version": "12.4",
                },
            )
            write_fake_smi(root, "NVIDIA RTX 5000, 16380, 570.10")
            self.assertEqual(
                asgi_request(app, "GET", "/system")[1]["gpu"]["name"], "NVIDIA RTX A2000"
            )
            status, body = asgi_request(app, "POST", "/system/gpu/scan")
            self.assertEqual((status, body["gpu"]["name"]), (200, "NVIDIA RTX 5000"))


class HealthTests(unittest.TestCase):
    def test_health_reports_effective_device(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(data_dir=Path(directory), device="cuda")
            status, body = asgi_request(create_app(settings), "GET", "/health")
            self.assertEqual(status, 200)
            self.assertEqual(body["status"], "ok")
            self.assertEqual(body["device"], "cpu")
            self.assertEqual(body["pythonVersion"], platform.python_version())
            self.assertRegex(body["startedAt"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
            self.assertTrue(body["version"])

            settings.cuda_dir.mkdir(parents=True)
            write_manifest(settings.cuda_dir, {"version": "12.4", "totalBytes": 1})
            self.assertEqual(
                asgi_request(create_app(settings), "GET", "/health")[1]["device"], "cuda"
            )


class CudaDllTests(unittest.TestCase):
    def test_bin_directories_are_added_when_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            cuda_dir = Path(directory)
            for name in ("cublas", "cudnn"):
                (cuda_dir / "nvidia" / name / "bin").mkdir(parents=True)
            added = []
            with (
                patch.dict(os.environ, {"PATH": "original"}),
                patch("os.add_dll_directory", added.append, create=True),
            ):
                self.assertEqual(configure_dll_search(cuda_dir), [])
                write_manifest(cuda_dir, {"totalBytes": 0})
                directories = configure_dll_search(cuda_dir)
                path = os.environ["PATH"]
            expected = [str(cuda_dir / "nvidia" / n / "bin") for n in ("cublas", "cudnn")]
            self.assertEqual([str(d) for d in directories], expected)
            self.assertEqual(added, expected)
            self.assertEqual(path, os.pathsep.join([*expected, "original"]))


class RuntimeTests(unittest.TestCase):
    def test_arguments_are_passed_through_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            argv = [
                "app",
                "--port",
                "5123",
                "--log-dir",
                str(Path(directory) / "logs"),
                "--data-dir",
                directory,
                "--device",
                "cuda",
                "--worker-python",
                str(Path(directory) / "python.exe"),
            ]
            with (
                patch.object(sys, "argv", argv),
                patch.dict(os.environ, {}),
                patch.object(cli, "setup_logging"),
                patch.object(cli, "install_excepthook"),
                patch.object(cli.uvicorn, "run") as run,
            ):
                cli.main()
                data_dir = os.environ["DREAMY_BACKEND_DATA_DIR"]
                device = os.environ["DREAMY_BACKEND_DEVICE"]
                worker_python = os.environ["DREAMY_WORKER_PYTHON"]
            self.assertEqual(Path(data_dir), Path(directory).resolve())
            self.assertEqual(device, "cuda")
            self.assertEqual(Path(worker_python), (Path(directory) / "python.exe").resolve())
            self.assertEqual(run.call_args.kwargs["port"], 5123)
