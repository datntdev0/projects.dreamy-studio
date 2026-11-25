import json
import sys
import tempfile
import unittest
import wave
from pathlib import Path

from app.features.speeches.worker_host import WorkerError, WorkerHost, WorkerSpec

FAKE_FACTORY = """
import json
import os
import wave

from vieneu._v3_turbo_engine import onnx_runtime_lite

CALLS = os.environ.get("FAKE_VIENEU_CALLS")


def record(entry):
    with open(CALLS, "a", encoding="utf-8") as output:
        output.write(json.dumps(entry) + "\\n")


class FakeTts:
    def __init__(self, mode, kwargs, sample_rate):
        self.mode = mode
        self.kwargs = kwargs
        self.sample_rate = sample_rate
        if mode == "v3turbo":
            self.engine = onnx_runtime_lite.OnnxV3LiteEngine(checkpoint_path=kwargs["backbone_repo"])

    def list_preset_voices(self):
        return [("Hải Đăng (Nam)", "Hải Đăng"), ("Mai Anh (Nữ)", "Mai Anh")]

    def encode_reference(self, ref_audio):
        record({"op": "enroll", "ref_audio": ref_audio})
        return [0.5, 0.25], [[1, 2], [3, 4]]

    def infer(self, text, **kwargs):
        record({"op": "infer", "text": text, "kwargs": kwargs})
        return [0.0] * (self.sample_rate // 2)

    def save(self, audio, path):
        with wave.open(path, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(self.sample_rate)
            output.writeframes(b"\\x00\\x00" * len(audio))


def Vieneu(mode="v3turbo", **kwargs):
    record({"op": "create", "mode": mode, "kwargs": kwargs})
    return FakeTts(mode, kwargs, 48_000 if mode == "v3turbo" else 24_000)
"""

FAKE_LITE = """
import json
import os


class OnnxV3LiteEngine:
    def __init__(self, checkpoint_path=None, codec_dir=None, **kwargs):
        with open(os.environ["FAKE_VIENEU_CALLS"], "a", encoding="utf-8") as output:
            output.write(json.dumps({"op": "lite", "codec_dir": codec_dir}) + "\\n")
"""


FAKE_NUMPY = """
import json


class Archive(dict):
    @property
    def files(self):
        return list(self)

    def __enter__(self):
        return self

    def __exit__(self, *details):
        return False


def savez(output, **arrays):
    output.write(json.dumps(arrays).encode("utf-8"))


def load(path, allow_pickle=True):
    if allow_pickle:
        raise AssertionError("pickled arrays must stay disabled")
    with open(path, "rb") as source:
        return Archive(json.loads(source.read()))
"""


ENROLLED = {"speaker_emb": [0.5, 0.25], "codes": [[1, 2], [3, 4]]}


def write_fake_vieneu(site: Path) -> None:
    package = site / "vieneu"
    (package / "_v3_turbo_engine").mkdir(parents=True)
    (site / "numpy.py").write_text(FAKE_NUMPY, encoding="utf-8")
    (package / "__init__.py").write_text(FAKE_FACTORY, encoding="utf-8")
    (package / "_v3_turbo_engine" / "__init__.py").write_text("", encoding="utf-8")
    (package / "_v3_turbo_engine" / "onnx_runtime_lite.py").write_text(FAKE_LITE, encoding="utf-8")


class VieneuEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        site = self.root / "site"
        write_fake_vieneu(site)
        self.calls = self.root / "calls.jsonl"
        self.spec = WorkerSpec(
            key="vieneu-cpu",
            engine="engine_vieneu",
            site_dirs=(site,),
            env={"FAKE_VIENEU_CALLS": str(self.calls)},
        )
        self.host = WorkerHost(sys.executable, self.root / "logs")
        self.addCleanup(self.host.close)
        self.turbo_dir = self.root / "models" / "vieneu-turbo"
        self.nano_dir = self.root / "models" / "vieneu-nano"
        self.turbo_dir.mkdir(parents=True)
        self.nano_dir.mkdir(parents=True)
        self.reference = self.root / "reference.wav"
        self.reference.write_bytes(b"RIFF")

    def call(self, op: str, payload: dict) -> dict:
        return self.host.call(self.spec, op, payload, 30)

    def recorded(self) -> list[dict]:
        return [json.loads(line) for line in self.calls.read_text(encoding="utf-8").splitlines()]

    def load(self, mode: str, model_dir: Path) -> dict:
        return self.call("load", {"modelDir": str(model_dir), "options": {"mode": mode}})

    def test_turbo_loads_local_onnx_and_codec(self):
        self.assertEqual(self.load("v3turbo", self.turbo_dir), {"sampleRate": 48_000})
        self.load("v3turbo", self.turbo_dir)
        create, lite = self.recorded()
        self.assertEqual(
            create,
            {
                "op": "create",
                "mode": "v3turbo",
                "kwargs": {
                    "backbone_repo": str(self.turbo_dir),
                    "onnx_dir": str(self.turbo_dir / "onnx_update"),
                    "backend": "onnx",
                    "device": "cpu",
                },
            },
        )
        self.assertEqual(lite, {"op": "lite", "codec_dir": str(self.turbo_dir / "codec")})

    def test_nano_and_model_switch(self):
        self.load("v3turbo", self.turbo_dir)
        self.assertEqual(self.load("v3nano", self.nano_dir), {"sampleRate": 24_000})
        nano = self.recorded()[-1]
        self.assertEqual(
            nano["kwargs"], {"backbone_repo": str(self.nano_dir), "onnx_dir": str(self.nano_dir)}
        )

    def test_preset_and_clone_synthesis(self):
        self.load("v3turbo", self.turbo_dir)
        output = self.root / "preset.wav"
        result = self.call(
            "synthesize",
            {
                "text": " Xin chào ",
                "voice": {"source": "preset", "preset": "Mai Anh"},
                "outPath": str(output),
            },
        )
        self.assertEqual(result, {"durationMs": 500, "sampleRate": 48_000})
        with wave.open(str(output)) as audio:
            self.assertEqual(audio.getframerate(), 48_000)
        self.call(
            "synthesize",
            {
                "text": "Một hai ba",
                "voice": {"source": "clone", "referencePath": str(self.reference)},
                "outPath": str(self.root / "clone.wav"),
            },
        )
        preset, clone = (entry for entry in self.recorded() if entry["op"] == "infer")
        self.assertEqual(
            preset, {"op": "infer", "text": "Xin chào", "kwargs": {"voice": "Mai Anh"}}
        )
        self.assertEqual(clone["kwargs"], {"voice": ENROLLED})

    def clone(self, text: str, voice: dict) -> None:
        payload = {"text": text, "voice": voice, "outPath": str(self.root / "clone.wav")}
        self.call("synthesize", payload)

    def operations(self, op: str) -> list[dict]:
        return [entry for entry in self.recorded() if entry["op"] == op]

    def test_clone_voices_persist_across_workers(self):
        self.load("v3nano", self.nano_dir)
        stored = self.root / "prompts" / "voice.prompt"
        voice = {
            "source": "clone",
            "referencePath": str(self.reference),
            "promptPath": str(stored),
        }
        self.clone("Một", voice)
        self.clone("Hai", voice)
        self.assertEqual(json.loads(stored.read_bytes()), ENROLLED)
        self.host.close()
        self.host = WorkerHost(sys.executable, self.root / "logs")
        self.addCleanup(self.host.close)
        self.load("v3nano", self.nano_dir)
        self.clone("Ba", voice)
        self.assertEqual(len(self.operations("enroll")), 1)
        self.assertEqual(
            [entry["kwargs"] for entry in self.operations("infer")], [{"voice": ENROLLED}] * 3
        )
        self.assertEqual(list(stored.parent.iterdir()), [stored])

    def test_rejected_requests(self):
        cases = [
            ({"source": "design", "prompt": "warm"}, "SOURCE_UNSUPPORTED"),
            ({"source": "preset", "preset": "Nobody"}, "PRESET_UNKNOWN"),
            (
                {"source": "clone", "referencePath": str(self.root / "missing.wav")},
                "REFERENCE_MISSING",
            ),
        ]
        with self.assertRaises(WorkerError) as not_loaded:
            self.call("synthesize", {"text": "a", "voice": cases[0][0], "outPath": "x.wav"})
        self.assertEqual(not_loaded.exception.code, "MODEL_NOT_LOADED")
        self.load("v3turbo", self.turbo_dir)
        for voice, code in cases:
            with self.assertRaises(WorkerError) as rejected:
                self.call("synthesize", {"text": "a", "voice": voice, "outPath": "x.wav"})
            self.assertEqual(rejected.exception.code, code)
        with self.assertRaises(WorkerError) as missing:
            self.load("v3turbo", self.root / "nowhere")
        self.assertEqual(missing.exception.code, "MODEL_NOT_INSTALLED")
        with self.assertRaises(WorkerError) as unknown:
            self.load("v9", self.turbo_dir)
        self.assertEqual(unknown.exception.code, "MODEL_UNSUPPORTED")
