import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from support import FakeRemote, FakeServer, asgi_request, wait_until, write_fake_smi

from app.catalog import cuda_catalog, model_catalog
from app.config import Settings
from app.main import create_app

TURBO = "pnnbao-ump/VieNeu-TTS-v3-Turbo"
GPU_LINE = "NVIDIA GeForce RTX 4090, 24564, 566.03"


class DownloadTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.remote = FakeRemote()
        self.remote.repos[TURBO] = {
            "config.json": b"{}",
            "onnx/model.onnx": b"m" * 300_000,
            "voices/a.bin": b"v" * 2000,
        }
        self.server = FakeServer(self.remote)
        self.server.start()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.server.stop)
        proxy = patch.dict(os.environ, {"NO_PROXY": "127.0.0.1,localhost", "no_proxy": "*"})
        proxy.start()
        self.addCleanup(proxy.stop)
        self.smi = write_fake_smi(self.root, GPU_LINE)
        self.app = self.make_app()

    def make_app(self, device: str = "cpu", smi: Path | None = None):
        settings = Settings(
            data_dir=self.root / "data",
            device=device,
            pypi_url=self.server.url,
            nvidia_smi=str(smi or self.smi),
            hf_endpoint=self.server.url,
        )
        return create_app(settings)

    def call(self, method: str, path: str, app=None) -> tuple[int, object]:
        return asgi_request(app or self.app, method, path)

    def model(self, model_id: str = "vieneu-turbo", app=None) -> dict:
        status, body = self.call("GET", "/models", app)
        self.assertEqual(status, 200)
        return next(item for item in body if item["id"] == model_id)

    def wait_model(self, state: str, model_id: str = "vieneu-turbo") -> dict:
        wait_until(lambda: self.model(model_id)["state"] == state)
        return self.model(model_id)

    def cuda(self) -> dict:
        return self.call("GET", "/system")[1]["cuda"]

    def wait_cuda(self, state: str) -> dict:
        wait_until(lambda: self.cuda()["state"] == state)
        return self.cuda()


class ModelDownloadTests(DownloadTestCase):
    def test_catalog_listing(self):
        status, body = self.call("GET", "/models")
        self.assertEqual(status, 200)
        self.assertEqual(
            [item["id"] for item in body], ["vieneu-turbo", "vieneu-nano", "omnivoice"]
        )
        omnivoice = body[2]
        self.assertEqual(
            omnivoice,
            {
                "state": "none",
                "receivedBytes": 0,
                "totalBytes": model_catalog()[2].size_bytes,
                "error": "",
                "id": "omnivoice",
                "name": "OmniVoice",
                "source": "k2-fsa/OmniVoice",
                "languages": ["mul"],
                "cloning": True,
                "gpuRecommended": True,
            },
        )

    def test_download_install_and_remove(self):
        status, body = self.call("POST", "/models/vieneu-turbo/download")
        self.assertEqual(status, 202)
        self.assertIn(body["state"], ("downloading", "installed"))
        installed = self.wait_model("installed")
        total = 2 + 300_000 + 2000
        self.assertEqual((installed["receivedBytes"], installed["totalBytes"]), (total, total))
        target = self.root / "data" / "models" / "vieneu-turbo"
        self.assertEqual((target / "onnx" / "model.onnx").stat().st_size, 300_000)
        manifest = json.loads((target / "manifest.json").read_text())
        self.assertEqual(manifest["totalBytes"], total)
        self.assertEqual(
            sorted(manifest["files"]), ["config.json", "onnx/model.onnx", "voices/a.bin"]
        )

        gets = len(self.remote.requests)
        self.assertEqual(self.call("POST", "/models/vieneu-turbo/download")[0], 202)
        self.assertEqual(len(self.remote.requests), gets)

        status, body = self.call("DELETE", "/models/vieneu-turbo")
        self.assertEqual((status, body["state"]), (200, "none"))
        self.assertFalse(target.exists())

    def test_unknown_model(self):
        for method, path in (
            ("POST", "/models/nope/download"),
            ("POST", "/models/nope/cancel"),
            ("DELETE", "/models/nope"),
        ):
            status, body = self.call(method, path)
            self.assertEqual((status, body["code"]), (404, "MODEL_NOT_FOUND"))
            self.assertIsNone(body["details"])

    def test_progress_busy_and_cancel(self):
        gate = self.remote.gate("onnx/model.onnx")
        self.call("POST", "/models/vieneu-turbo/download")
        self.assertTrue(self.remote.entered["onnx/model.onnx"].wait(15))
        downloading = self.model()
        self.assertEqual(downloading["state"], "downloading")
        self.assertEqual(downloading["totalBytes"], 302_002)
        self.assertGreaterEqual(downloading["receivedBytes"], 2)

        status, body = self.call("DELETE", "/models/vieneu-turbo")
        self.assertEqual((status, body["code"]), (409, "MODEL_BUSY"))

        status, body = self.call("POST", "/models/vieneu-turbo/cancel")
        self.assertEqual((status, body["state"], body["receivedBytes"]), (200, "none", 0))
        gate.set()
        target = self.root / "data" / "models" / "vieneu-turbo"
        wait_until(lambda: not target.exists())
        self.assertEqual(self.model()["state"], "none")

    def test_error_then_retry_resumes(self):
        self.remote.failing.add("voices/a.bin")
        self.call("POST", "/models/vieneu-turbo/download")
        failed = self.wait_model("error")
        self.assertTrue(failed["error"])
        self.assertEqual(len(self.remote.gets("onnx/model.onnx")), 1)

        self.remote.failing.clear()
        self.call("POST", "/models/vieneu-turbo/download")
        self.wait_model("installed")
        self.assertEqual(len(self.remote.gets("onnx/model.onnx")), 1)

    def test_interrupted_download_after_restart(self):
        target = self.root / "data" / "models" / "vieneu-turbo"
        target.mkdir(parents=True)
        (target / "config.json").write_bytes(b"{}")
        stale = target / ".cache" / "huggingface" / "download" / "voices" / "a.bin.1234.incomplete"
        stale.parent.mkdir(parents=True)
        stale.write_bytes(b"partial")
        app = self.make_app()
        interrupted = self.model(app=app)
        self.assertEqual(
            (interrupted["state"], interrupted["error"]), ("error", "Download interrupted")
        )
        self.assertEqual(self.call("POST", "/models/vieneu-turbo/download", app)[0], 202)
        wait_until(lambda: self.model(app=app)["state"] == "installed")
        self.assertFalse(stale.exists())

    def test_cancel_after_interrupt_removes_partial_files(self):
        target = self.root / "data" / "models" / "vieneu-nano"
        target.mkdir(parents=True)
        (target / "partial.onnx").write_bytes(b"x")
        status, body = self.call("POST", "/models/vieneu-nano/cancel", self.make_app())
        self.assertEqual((status, body["state"]), (200, "none"))
        self.assertFalse(target.exists())


class CudaDownloadTests(DownloadTestCase):
    def test_install_extracts_wheels_and_remove(self):
        status, body = self.call("POST", "/cuda/download")
        self.assertEqual(status, 202)
        self.assertEqual(body["version"], "12.4")
        installed = self.wait_cuda("installed")
        self.assertEqual(installed["receivedBytes"], installed["totalBytes"])
        cuda_dir = self.root / "data" / "runtime" / "cuda"
        self.assertTrue((cuda_dir / "nvidia" / "cublas" / "bin" / "cublas64_12.dll").is_file())
        self.assertTrue((cuda_dir / "nvidia" / "cudnn" / "bin" / "cudnn64_12.dll").is_file())
        self.assertFalse(any(cuda_dir.rglob("*.dist-info")))
        self.assertFalse((cuda_dir / ".wheels").exists())
        manifest = json.loads((cuda_dir / "manifest.json").read_text())
        self.assertEqual(manifest["version"], "12.4")
        requested = {p for m, p, _ in self.remote.requests if p.startswith("/pypi/")}
        self.assertEqual(
            requested,
            {f"/pypi/{p.name}/{p.version}/json" for p in cuda_catalog().packages},
        )
        self.assertFalse(self.remote.gets("manylinux2014_x86_64.whl"))

        self.assertEqual(self.make_app(device="cuda").state.services.device, "cuda")

        status, body = self.call("DELETE", "/cuda")
        self.assertEqual((status, body["state"]), (200, "none"))
        self.assertFalse(cuda_dir.exists())

    def test_no_gpu(self):
        app = self.make_app(smi=self.root / "missing-nvidia-smi.exe")
        status, body = self.call("POST", "/cuda/download", app)
        self.assertEqual((status, body["code"]), (409, "CUDA_NO_GPU"))

    def test_busy_cancel_and_range_resume(self):
        wheel = "nvidia_cublas_cu12-12.4.5.8-py3-none-win_amd64.whl"
        gate = self.remote.gate(wheel)
        self.call("POST", "/cuda/download")
        self.assertTrue(self.remote.entered[wheel].wait(15))
        self.assertEqual(self.cuda()["state"], "downloading")
        status, body = self.call("DELETE", "/cuda")
        self.assertEqual((status, body["code"]), (409, "CUDA_BUSY"))
        self.assertEqual(self.call("POST", "/cuda/cancel")[1]["state"], "none")
        gate.set()
        cuda_dir = self.root / "data" / "runtime" / "cuda"
        wait_until(lambda: not cuda_dir.exists())

        self.remote.gates.clear()
        self.remote.failing.add("nvidia_cudnn_cu12-9.1.0.70-py3-none-win_amd64.whl")
        self.call("POST", "/cuda/download")
        self.assertTrue(self.wait_cuda("error")["error"])
        staging = cuda_dir / ".wheels"
        complete = staging / wheel
        partial = staging / f"{wheel}.part"
        data = complete.read_bytes()
        complete.unlink()
        partial.write_bytes(data[:1000])

        restarted = self.make_app()
        self.assertEqual(
            self.call("GET", "/system", restarted)[1]["cuda"]["error"], "Download interrupted"
        )
        self.remote.failing.clear()
        self.call("POST", "/cuda/download", restarted)
        wait_until(
            lambda: self.call("GET", "/system", restarted)[1]["cuda"]["state"] == "installed"
        )
        self.assertEqual(self.remote.gets(wheel)[-1][2], "bytes=1000-")
