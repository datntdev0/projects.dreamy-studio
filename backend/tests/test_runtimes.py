import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from support import FakeRemote, FakeServer, asgi_request, wait_until, write_fake_smi

from app.catalog import (
    Catalog,
    CatalogModel,
    CatalogRuntime,
    RuntimeVariant,
    RuntimeWheel,
    cuda_catalog,
)
from app.config import Settings
from app.downloads import DownloadCancelled, DownloadJob
from app.main import create_app
from app.runtimes import RuntimeInstaller, mirrored_url, wheel_destination

CURRENT_PYTHON = f"{sys.version_info.major}.{sys.version_info.minor}"
PUBLIC_HOST = "https://files.example"
FIRST_REPO = "fake/first-voice"
SECOND_REPO = "fake/second-voice"
GPU_LINE = "NVIDIA GeForce RTX 4090, 24564, 566.03"


def build_runtime_wheel(name: str, version: str) -> bytes:
    module = name.replace("-", "_")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(f"{module}/__init__.py", f"VERSION = '{version}'\n" * 2000)
        archive.writestr(f"{module}-{version}.dist-info/METADATA", f"Name: {name}\n")
        archive.writestr(f"{module}-{version}.data/purelib/{module}_extra.py", "EXTRA = 1\n")
        archive.writestr(f"{module}-{version}.data/scripts/{module}.exe", "binary")
    return buffer.getvalue()


def publish_wheel(remote: FakeRemote, name: str, version: str) -> RuntimeWheel:
    data = build_runtime_wheel(name, version)
    filename = f"{name.replace('-', '_')}-{version}-py3-none-any.whl"
    remote.wheels[filename] = data
    return RuntimeWheel(
        name=name,
        version=version,
        url=f"{PUBLIC_HOST}/files/{filename}",
        sha256=hashlib.sha256(data).hexdigest(),
        size=len(data),
    )


def voice_model(model_id: str, source: str) -> CatalogModel:
    return CatalogModel(
        id=model_id,
        name=model_id.title(),
        source=source,
        languages=("vi",),
        cloning=True,
        gpu_recommended=False,
        size_bytes=1_000,
        runtime="voice",
    )


class RuntimeTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.remote = FakeRemote()
        self.remote.repos[FIRST_REPO] = {"config.json": b"{}", "model.onnx": b"m" * 5_000}
        self.remote.repos[SECOND_REPO] = {"config.json": b"{}", "model.onnx": b"n" * 3_000}
        self.server = FakeServer(self.remote)
        self.server.start()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.server.stop)
        proxy = patch.dict(os.environ, {"NO_PROXY": "127.0.0.1,localhost", "no_proxy": "*"})
        proxy.start()
        self.addCleanup(proxy.stop)
        self.smi = write_fake_smi(self.root, GPU_LINE)
        self.wheels = (
            publish_wheel(self.remote, "voice-core", "1.0.0"),
            publish_wheel(self.remote, "voice-codec", "2.1.0"),
        )
        self.cuda_wheels = (publish_wheel(self.remote, "voice-core-gpu", "1.0.0"),)
        self.app = self.make_app()

    def variant(self, name: str, wheels: tuple[RuntimeWheel, ...], python: str) -> RuntimeVariant:
        return RuntimeVariant(runtime="voice", variant=name, python=python, wheels=wheels)

    def catalog(self, python: str = CURRENT_PYTHON) -> Catalog:
        runtime = CatalogRuntime(
            id="voice",
            variants={
                "cpu": self.variant("cpu", self.wheels, python),
                "cuda": self.variant("cuda", self.cuda_wheels, python),
            },
        )
        return Catalog(
            models=(voice_model("first", FIRST_REPO), voice_model("second", SECOND_REPO)),
            cuda=cuda_catalog(),
            runtimes={"voice": runtime},
        )

    def make_app(self, python: str = CURRENT_PYTHON):
        settings = Settings(
            data_dir=self.root / "data",
            pypi_url=self.server.url,
            nvidia_smi=str(self.smi),
            hf_endpoint=self.server.url,
            worker_python=sys.executable,
            wheel_mirror=self.server.url,
        )
        return create_app(settings, self.catalog(python))

    def call(self, method: str, path: str, app=None) -> tuple[int, object]:
        return asgi_request(app or self.app, method, path)

    def model(self, model_id: str = "first", app=None) -> dict:
        status, body = self.call("GET", "/models", app)
        self.assertEqual(status, 200)
        return next(item for item in body if item["id"] == model_id)

    def wait_model(self, state: str, model_id: str = "first", app=None) -> dict:
        wait_until(lambda: self.model(model_id, app)["state"] == state)
        return self.model(model_id, app)

    @property
    def runtime_dir(self) -> Path:
        return self.root / "data" / "runtime" / "voice-cpu"

    @property
    def runtime_bytes(self) -> int:
        return sum(wheel.size for wheel in self.wheels)

    def wheel_gets(self) -> list[tuple[str, str, str]]:
        return [request for request in self.remote.requests if request[1].startswith("/files/")]


class RuntimeInstallTests(RuntimeTestCase):
    def test_model_download_installs_runtime_first(self):
        idle = self.model()
        self.assertEqual((idle["state"], idle["totalBytes"]), ("none", 1_000 + self.runtime_bytes))

        self.assertEqual(self.call("POST", "/models/first/download")[0], 202)
        installed = self.wait_model("installed")
        total = 2 + 5_000 + self.runtime_bytes
        self.assertEqual((installed["receivedBytes"], installed["totalBytes"]), (total, total))

        site = self.runtime_dir / "site-packages"
        self.assertTrue((site / "voice_core" / "__init__.py").is_file())
        self.assertTrue((site / "voice_core_extra.py").is_file())
        self.assertTrue((site / "voice_codec-2.1.0.dist-info" / "METADATA").is_file())
        self.assertFalse(any(site.rglob("*.exe")))
        self.assertFalse((self.runtime_dir / ".wheels").exists())
        manifest = json.loads((self.runtime_dir / "manifest.json").read_text())
        self.assertEqual(
            (manifest["runtime"], manifest["variant"], manifest["python"]),
            ("voice", "cpu", CURRENT_PYTHON),
        )
        self.assertEqual(
            manifest["packages"],
            [
                {"name": "voice-core", "version": "1.0.0"},
                {"name": "voice-codec", "version": "2.1.0"},
            ],
        )
        model_manifest = json.loads(
            (self.root / "data" / "models" / "first" / "manifest.json").read_text()
        )
        self.assertEqual(model_manifest["runtime"], "voice-cpu")

    def test_second_model_reuses_runtime(self):
        self.call("POST", "/models/first/download")
        self.wait_model("installed")
        fetched = len(self.wheel_gets())
        self.assertEqual(self.model("second")["totalBytes"], 1_000)

        self.call("POST", "/models/second/download")
        second = self.wait_model("installed", "second")
        self.assertEqual(second["totalBytes"], 2 + 3_000)
        self.assertEqual(len(self.wheel_gets()), fetched)

    def test_runtime_is_removed_with_last_model(self):
        self.call("POST", "/models/first/download")
        self.wait_model("installed")
        self.call("POST", "/models/second/download")
        self.wait_model("installed", "second")

        self.assertEqual(self.call("DELETE", "/models/first")[0], 200)
        self.assertTrue((self.runtime_dir / "manifest.json").is_file())
        self.assertEqual(self.model("second")["state"], "installed")

        cuda_dir = self.root / "data" / "runtime" / "voice-cuda"
        cuda_dir.mkdir(parents=True)
        self.assertEqual(self.call("DELETE", "/models/second")[0], 200)
        self.assertFalse(self.runtime_dir.exists())
        self.assertFalse(cuda_dir.exists())

    def test_missing_runtime_is_reinstalled_without_model_files(self):
        self.call("POST", "/models/first/download")
        self.wait_model("installed")
        model_gets = len(self.remote.gets("model.onnx"))
        (self.runtime_dir / "manifest.json").unlink()

        pending = self.model(app=self.make_app())
        self.assertEqual(
            (pending["state"], pending["totalBytes"]), ("none", 1_000 + self.runtime_bytes)
        )
        app = self.make_app()
        self.call("POST", "/models/first/download", app)
        self.wait_model("installed", app=app)
        self.assertEqual(len(self.remote.gets("model.onnx")), model_gets)

    def test_python_mismatch_fails_download(self):
        app = self.make_app(python="2.7")
        self.call("POST", "/models/first/download", app)
        failed = self.wait_model("error", app=app)
        self.assertIn("requires Python 2.7", failed["error"])
        self.assertFalse(self.wheel_gets())

    def test_checksum_mismatch_fails_download(self):
        filename = self.wheels[1].filename
        self.remote.wheels[filename] = b"tampered" + self.remote.wheels[filename][8:]
        self.call("POST", "/models/first/download")
        failed = self.wait_model("error")
        self.assertIn("Checksum mismatch", failed["error"])
        self.assertFalse((self.runtime_dir / "manifest.json").exists())


class RuntimeUnitTests(unittest.TestCase):
    def test_variant_for_device(self):
        cpu = RuntimeVariant("voice", "cpu", "3.12", ())
        cuda = RuntimeVariant("voice", "cuda", "3.12", ())
        both = CatalogRuntime("voice", {"cpu": cpu, "cuda": cuda})
        only_cpu = CatalogRuntime("voice", {"cpu": cpu})
        self.assertIs(both.variant_for("cuda"), cuda)
        self.assertIs(both.variant_for("cpu"), cpu)
        self.assertIs(only_cpu.variant_for("cuda"), cpu)

    def test_mirrored_url(self):
        url = "https://files.pythonhosted.org/packages/ab/cd/pkg-1.0-py3-none-any.whl"
        self.assertEqual(mirrored_url(url, None), url)
        self.assertEqual(
            mirrored_url(url, "http://mirror.local/"),
            "http://mirror.local/packages/ab/cd/pkg-1.0-py3-none-any.whl",
        )

    def test_wheel_destination(self):
        target = Path("site")
        self.assertEqual(wheel_destination("pkg/a.py", target), target / "pkg" / "a.py")
        self.assertEqual(
            wheel_destination("pkg-1.0.data/platlib/native.pyd", target), target / "native.pyd"
        )
        self.assertIsNone(wheel_destination("pkg-1.0.data/headers/a.h", target))
        for unsafe in ("../evil.py", "/abs.py", "C:/evil.py"):
            with self.assertRaises(ValueError):
                wheel_destination(unsafe, target)

    def test_wheel_filename_ignores_fragment(self):
        wheel = RuntimeWheel("pkg", "1.0", "https://x/pkg-1.0-py3-none-any.whl#sha256=ab", "", 1)
        self.assertEqual(wheel.filename, "pkg-1.0-py3-none-any.whl")

    def test_cancelled_job_stops_waiting_for_runtime_lock(self):
        installer = RuntimeInstaller(
            RuntimeVariant("voice", "cpu", CURRENT_PYTHON, ()), Path("unused"), sys.executable, None
        )
        job = DownloadJob(0)
        job.cancelled.set()
        installer.lock.acquire()
        try:
            with self.assertRaises(DownloadCancelled):
                installer.ensure(job)
        finally:
            installer.lock.release()
