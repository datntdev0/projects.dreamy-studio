import os
import platform
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import ANY, patch

from support import asgi_request, write_fake_smi

from app import __main__ as cli
from app.features.system.cuda import configure_dll_search
from app.features.system.gpu import parse_nvidia_smi, query_nvidia_smi
from app.main import create_app
from app.shared.catalog import load_catalog
from app.shared.config import (
    API_KEY_ENV,
    DATA_DIR_ENV,
    DEFAULT_PORT,
    DEVICE_ENV,
    LOG_DIR_ENV,
    PORT_ENV,
    RUN_MODE_ENV,
    WORKER_PYTHON_ENV,
    ServerOptions,
    Settings,
)
from app.shared.dotenv import load_env_file
from app.shared.downloads import write_manifest
from app.shared.platforms import WINDOWS_X64


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
            settings = Settings(data_dir=root / "data", nvidia_smi=str(smi))
            app = create_app(settings, load_catalog(WINDOWS_X64))
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


class DeviceSwitchTests(unittest.TestCase):
    def setUp(self) -> None:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.settings = Settings(data_dir=Path(temp.name))
        self.app = create_app(self.settings)
        self.addCleanup(self.close)

    def close(self) -> None:
        self.app.state.container.close()

    def install_cuda(self) -> None:
        self.settings.cuda_dir.mkdir(parents=True)
        write_manifest(self.settings.cuda_dir, {"version": "12.8", "totalBytes": 0})

    def switch(self, device: str) -> tuple[int, dict]:
        return asgi_request(self.app, "PUT", "/system/device", {"device": device})

    def test_cuda_needs_the_runtime(self):
        self.assertEqual(self.switch("cuda"), (409, self.error("CUDA_NOT_INSTALLED")))
        self.assertEqual(self.app.state.container.device, "cpu")

    def test_switching_rebuilds_the_services_on_the_new_device(self):
        self.install_cuda()
        previous = self.app.state.container
        status, body = self.switch("cuda")
        self.assertEqual((status, body["device"]), (200, "cuda"))
        self.assertIsNot(self.app.state.container, previous)
        self.assertEqual(self.app.state.container.speeches.synthesizer.device, "cuda")
        self.assertEqual(asgi_request(self.app, "GET", "/health")[1]["device"], "cuda")
        self.assertEqual(self.switch("cpu")[1]["device"], "cpu")

    def test_same_device_keeps_the_services(self):
        previous = self.app.state.container
        self.assertEqual(self.switch("cpu")[0], 200)
        self.assertIs(self.app.state.container, previous)

    def test_busy_downloads_block_the_switch(self):
        self.install_cuda()
        with patch.object(type(self.app.state.container), "downloading", return_value=True):
            self.assertEqual(self.switch("cuda"), (409, self.error("DEVICE_BUSY")))

    def test_unknown_device_is_rejected(self):
        self.assertEqual(self.switch("tpu")[0], 422)

    def test_system_reports_the_models_folder(self):
        body = asgi_request(self.app, "GET", "/system")[1]
        self.assertEqual(body["modelsDir"], str(self.settings.models_dir))

    @staticmethod
    def error(code: str) -> dict:
        return {"code": code, "message": ANY, "details": None}


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
                self.assertEqual(configure_dll_search(cuda_dir, WINDOWS_X64), [])
                write_manifest(cuda_dir, {"totalBytes": 0})
                directories = configure_dll_search(cuda_dir, WINDOWS_X64)
                path = os.environ["PATH"]
            expected = [str(cuda_dir / "nvidia" / n / "bin") for n in ("cublas", "cudnn")]
            self.assertEqual([str(d) for d in directories], expected)
            self.assertEqual(added, expected)
            self.assertEqual(path, os.pathsep.join([*expected, "original"]))


class RuntimeTests(unittest.TestCase):
    def run_cli(self, argv: list[str], environment: dict[str, str]):
        with (
            patch.object(sys, "argv", ["app", *argv]),
            patch.dict(os.environ, environment, clear=True),
            patch.object(cli, "load_env_file"),
            patch.object(cli, "setup_logging") as logging,
            patch.object(cli, "install_excepthook"),
            patch.object(cli.uvicorn, "run") as run,
        ):
            cli.main()
            exported = dict(os.environ)
        return run, logging, exported

    def test_server_options_are_read_from_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {
                PORT_ENV: "5123",
                RUN_MODE_ENV: "dev",
                LOG_DIR_ENV: str(Path(directory) / "logs"),
                DATA_DIR_ENV: directory,
            }
            argv = ["--device", "cuda", "--worker-python", str(Path(directory) / "python.exe")]
            run, logging, exported = self.run_cli(argv, environment)
            self.assertEqual(run.call_args.kwargs["port"], 5123)
            self.assertEqual(
                logging.call_args.args, ((Path(directory) / "logs").resolve(), "DEBUG")
            )
            self.assertEqual(exported[DEVICE_ENV], "cuda")
            self.assertEqual(
                Path(exported[WORKER_PYTHON_ENV]), (Path(directory) / "python.exe").resolve()
            )

    def test_device_argument_overrides_environment_only_when_given(self):
        _, _, exported = self.run_cli([], {DEVICE_ENV: "cuda"})
        self.assertEqual(exported[DEVICE_ENV], "cuda")
        _, _, exported = self.run_cli(["--device", "cpu"], {DEVICE_ENV: "cuda"})
        self.assertEqual(exported[DEVICE_ENV], "cpu")

    def test_server_options_fall_back_to_defaults(self):
        run, logging, exported = self.run_cli([], {})
        self.assertEqual(run.call_args.kwargs["port"], DEFAULT_PORT)
        self.assertEqual(logging.call_args.args, (Path("logs").resolve(), "INFO"))
        self.assertEqual(Path(exported[LOG_DIR_ENV]), Path("logs").resolve())

    def test_invalid_server_options_are_rejected(self):
        for environment in ({PORT_ENV: "abc"}, {PORT_ENV: "70000"}, {RUN_MODE_ENV: "debug"}):
            with patch.dict(os.environ, environment, clear=True):
                self.assertRaises(ValueError, ServerOptions.from_env)


class ApiKeyTests(unittest.TestCase):
    def test_every_endpoint_requires_the_api_key_when_configured(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(Settings(data_dir=Path(directory), api_key="secret"))
            for path in ("/health", "/system", "/models", "/docs", "/openapi.json"):
                status, body = asgi_request(app, "GET", path)
                self.assertEqual((status, body["code"]), (401, "UNAUTHORIZED"))
            status, _ = asgi_request(app, "GET", "/health", headers={"X-API-Key": "wrong"})
            self.assertEqual(status, 401)
            status, body = asgi_request(app, "GET", "/health", headers={"X-API-Key": "secret"})
            self.assertEqual((status, body["status"]), (200, "ok"))

    def test_endpoints_are_open_without_an_api_key(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(Settings(data_dir=Path(directory)))
            self.assertEqual(asgi_request(app, "GET", "/health")[0], 200)

    def test_api_key_is_read_from_environment(self):
        with patch.dict(os.environ, {API_KEY_ENV: "secret"}, clear=True):
            self.assertEqual(Settings.from_env().api_key, "secret")
        with patch.dict(os.environ, {API_KEY_ENV: ""}, clear=True):
            self.assertIsNone(Settings.from_env().api_key)


class EnvFileTests(unittest.TestCase):
    def test_env_file_fills_only_missing_variables(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text(
                "\n".join(
                    [
                        "# comment",
                        "",
                        f"{PORT_ENV}=9000",
                        f"export {RUN_MODE_ENV}='dev'",
                        f'{API_KEY_ENV}="from-file"',
                        "not a variable",
                        "=orphan",
                    ]
                ),
                encoding="utf-8",
            )
            environment = {API_KEY_ENV: ""}
            loaded = load_env_file(path, environment)
            self.assertEqual(loaded, [PORT_ENV, RUN_MODE_ENV])
            self.assertEqual(environment, {API_KEY_ENV: "", PORT_ENV: "9000", RUN_MODE_ENV: "dev"})

    def test_missing_env_file_is_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            environment: dict[str, str] = {}
            self.assertEqual(load_env_file(Path(directory) / ".env", environment), [])
            self.assertEqual(environment, {})
