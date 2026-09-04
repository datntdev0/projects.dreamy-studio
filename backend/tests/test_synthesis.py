import io
import sys
import tempfile
import unittest
import wave
from pathlib import Path

from support import asgi_raw, asgi_request

from app.catalog import (
    Catalog,
    CatalogModel,
    CatalogRuntime,
    RuntimeVariant,
    VoicePreset,
    cuda_catalog,
)
from app.config import Settings
from app.downloads import write_manifest
from app.main import create_app
from app.synthesis import SynthesisRequest, check_voice, worker_failure
from app.tts_cache import TtsCache
from app.worker_host import WorkerTimeout

CURRENT_PYTHON = f"{sys.version_info.major}.{sys.version_info.minor}"
PRESETS = (VoicePreset("Mai Anh", "Mai Anh", "female", "north", "news"),)


def tone_model(model_id: str, **overrides) -> CatalogModel:
    fields = {
        "id": model_id,
        "name": model_id.title(),
        "source": f"fake/{model_id}",
        "languages": ("vi",),
        "cloning": True,
        "gpu_recommended": False,
        "size_bytes": 10,
        "runtime": "voice",
        "engine": "engine_tone",
        "sources": ("preset", "clone", "design"),
        "presets": PRESETS,
    }
    return CatalogModel(**{**fields, **overrides})


def tone_catalog() -> Catalog:
    runtime = CatalogRuntime("voice", {"cpu": RuntimeVariant("voice", "cpu", CURRENT_PYTHON, ())})
    return Catalog(
        models=(
            tone_model("tone"),
            tone_model("pending"),
            tone_model("silent", engine=None),
            tone_model("loose", runtime=None),
        ),
        cuda=cuda_catalog(),
        runtimes={"voice": runtime},
    )


class SynthesisTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.data = self.root / "data"
        self.install("runtime/voice-cpu", {"runtime": "voice"})
        for model_id in ("tone", "silent", "loose"):
            self.install(f"models/{model_id}", {"id": model_id, "totalBytes": 10})
        self.app = self.make_app()
        self.addCleanup(self.app.state.services.close)
        self.reference = self.root / "reference.wav"
        self.reference.write_bytes(b"first take")

    def install(self, relative: str, manifest: dict) -> None:
        target = self.data / relative
        target.mkdir(parents=True)
        write_manifest(target, {**manifest, "completedAt": "2026-11-22T00:00:00Z"})

    def make_app(self, engine: str | None = None):
        settings = Settings(
            data_dir=self.data,
            nvidia_smi=str(self.root / "missing-smi.exe"),
            worker_python=sys.executable,
            tts_engine=engine,
        )
        return create_app(settings, tone_catalog())

    def synthesize(self, app=None, **fields) -> tuple[int, dict[str, str], bytes]:
        payload = {"model": "tone", "text": "Xin chào các bạn", "source": "preset", **fields}
        if payload["source"] == "preset":
            payload.setdefault("preset", "Mai Anh")
        return asgi_raw(app or self.app, "POST", "/tts/synthesize", payload)

    def error(self, **fields) -> tuple[int, str]:
        payload = {"model": "tone", "text": "Xin chào", "source": "preset", **fields}
        status, body = asgi_request(self.app, "POST", "/tts/synthesize", payload)
        return status, body["code"]

    def cached_files(self) -> list[Path]:
        folder = self.data / "cache" / "tts" / "tone"
        return sorted(path for path in folder.glob("*.wav") if ".partial" not in path.name)

    def test_preset_synthesis_returns_wave_and_caches(self):
        status, headers, content = self.synthesize()
        self.assertEqual(status, 200)
        self.assertEqual(headers["content-type"], "audio/wav")
        self.assertEqual(
            (headers["x-cache"], headers["x-duration-ms"], headers["x-sample-rate"]),
            ("miss", "960", "24000"),
        )
        with wave.open(io.BytesIO(content)) as audio:
            self.assertEqual(audio.getnframes(), 24_000 * 960 // 1000)

        status, headers, again = self.synthesize(text="  Xin   chào các bạn ")
        self.assertEqual((status, headers["x-cache"]), (200, "hit"))
        self.assertEqual(again, content)
        self.assertEqual(len(self.cached_files()), 1)

        self.assertEqual(self.synthesize(text="Một câu khác")[1]["x-cache"], "miss")
        self.assertEqual(self.synthesize(gender="male")[1]["x-cache"], "miss")
        self.assertEqual(len(self.cached_files()), 3)

    def test_clone_cache_follows_reference_content(self):
        clone = {"source": "clone", "referencePath": str(self.reference)}
        self.assertEqual(self.synthesize(**clone)[1]["x-cache"], "miss")
        self.assertEqual(self.synthesize(**clone)[1]["x-cache"], "hit")
        self.reference.write_bytes(b"second take")
        self.assertEqual(self.synthesize(**clone)[1]["x-cache"], "miss")

    def test_design_synthesis(self):
        status, headers, _ = self.synthesize(source="design", prompt="female, young adult")
        self.assertEqual((status, headers["x-cache"]), (200, "miss"))

    def test_validation_errors(self):
        cases = [
            ({"model": "nope"}, (404, "MODEL_NOT_FOUND")),
            ({"model": "pending"}, (409, "MODEL_NOT_INSTALLED")),
            ({"model": "silent"}, (422, "ENGINE_UNSUPPORTED")),
            ({"model": "loose"}, (422, "ENGINE_UNSUPPORTED")),
            ({"text": "   "}, (422, "TEXT_EMPTY")),
            ({"text": "a" * 501}, (422, "TEXT_TOO_LONG")),
            ({"preset": "Nobody"}, (422, "PRESET_UNKNOWN")),
            ({"source": "clone", "referencePath": "relative.wav"}, (422, "REFERENCE_MISSING")),
            (
                {"source": "clone", "referencePath": str(self.root / "gone.wav")},
                (422, "REFERENCE_MISSING"),
            ),
            ({"source": "design", "prompt": " "}, (422, "PROMPT_EMPTY")),
            ({"source": "whisper"}, (422, "HTTP_422")),
        ]
        for fields, expected in cases:
            with self.subTest(fields=fields):
                self.assertEqual(self.error(**fields), expected)

    def test_unsupported_source(self):
        app = create_app(
            Settings(data_dir=self.data, worker_python=sys.executable),
            Catalog(
                models=(tone_model("tone", sources=("preset",)),),
                cuda=cuda_catalog(),
                runtimes=tone_catalog().runtimes,
            ),
        )
        self.addCleanup(app.state.services.close)
        payload = {"model": "tone", "text": "a", "source": "design", "prompt": "warm"}
        status, body = asgi_request(app, "POST", "/tts/synthesize", payload)
        self.assertEqual((status, body["code"]), (422, "SOURCE_UNSUPPORTED"))

    def test_engine_override_skips_runtime(self):
        app = self.make_app(engine="engine_tone")
        self.addCleanup(app.state.services.close)
        status, headers, _ = self.synthesize(app, model="loose")
        self.assertEqual((status, headers["x-cache"]), (200, "miss"))
        (self.data / "runtime" / "voice-cpu" / "manifest.json").unlink()
        restarted = self.make_app(engine="engine_tone")
        self.addCleanup(restarted.state.services.close)
        models = asgi_request(restarted, "GET", "/models")[1]
        self.assertEqual(next(m for m in models if m["id"] == "tone")["state"], "installed")
        self.assertEqual(self.synthesize(restarted)[0], 200)

    def test_removing_model_clears_its_cache(self):
        self.synthesize()
        self.assertTrue(self.cached_files())
        self.assertEqual(asgi_request(self.app, "DELETE", "/models/tone")[0], 200)
        self.assertFalse((self.data / "cache" / "tts" / "tone").exists())

    def test_preset_prompt_is_forwarded(self):
        preset = VoicePreset("elderly-man", "Elderly man", "male", prompt="male, elderly")
        model = tone_model("omni", presets=(preset,))
        request = SynthesisRequest(model="omni", text="a", source="preset", preset="elderly-man")
        self.assertEqual(
            check_voice(model, request),
            {
                "source": "preset",
                "language": "",
                "gender": "",
                "preset": "elderly-man",
                "prompt": "male, elderly",
            },
        )

    def test_worker_failure_status(self):
        failure = worker_failure(WorkerTimeout("synthesize", 1))
        self.assertEqual((failure.status, failure.code), (504, "WORKER_TIMEOUT"))


class TtsCacheTests(unittest.TestCase):
    def test_prune_evicts_least_recently_used(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = TtsCache(Path(directory), limit_bytes=2_500)
            meta = {"durationMs": 1, "sampleRate": 1}
            for key in ("old", "used", "new"):
                partial = cache.partial_path("m", key)
                partial.write_bytes(b"x" * 1_000)
                cache.put("m", key, partial, meta)
                if key == "used":
                    self.assertIsNotNone(cache.get("m", "old"))
            self.assertIsNone(cache.get("m", "used"))
            self.assertIsNotNone(cache.get("m", "old"))
            self.assertIsNotNone(cache.get("m", "new"))
            stray = cache.partial_path("m", "stray")
            stray.write_bytes(b"x" * 5_000)
            self.assertNotIn(stray, cache.entries())
