import json
import sys
import tempfile
import unittest
from pathlib import Path

from app.features.speeches.worker_host import WorkerError, WorkerHost, WorkerSpec

FAKE_TORCH = """
import os

float16 = "float16"
float32 = "float32"


class cuda:
    @staticmethod
    def is_available():
        return os.environ.get("FAKE_CUDA") in ("1", "old")

    @staticmethod
    def get_device_capability(index):
        return (6, 1) if os.environ.get("FAKE_CUDA") == "old" else (8, 6)

    @staticmethod
    def get_arch_list():
        return ["sm_75", "sm_80", "sm_86"]
"""

FAKE_SOUNDFILE = """
def write(path, audio, rate):
    with open(path, "wb") as output:
        output.write(bytes(len(audio)))
"""

FAKE_OMNIVOICE = """
import json
import os


def record(entry):
    with open(os.environ["FAKE_OMNIVOICE_CALLS"], "a", encoding="utf-8") as output:
        output.write(json.dumps(entry, default=str) + "\\n")


class OmniVoice:
    sampling_rate = 24_000

    @classmethod
    def from_pretrained(cls, path, **kwargs):
        record({"op": "load", "path": path, "kwargs": kwargs})
        return cls()

    def create_voice_clone_prompt(self, ref_audio):
        record({"op": "prompt", "ref_audio": ref_audio})
        if ref_audio.endswith("silent.wav"):
            raise ValueError("Reference audio is empty after silence removal.")
        return {"prompt": ref_audio}

    def generate(self, text, language=None, **kwargs):
        record({"op": "generate", "text": text, "language": language, "kwargs": kwargs})
        if kwargs.get("instruct") and "sparkly" in kwargs["instruct"]:
            raise ValueError("Unsupported instruct item 'sparkly'")
        return [[0.0] * 12_000]
"""


def write_fakes(site: Path) -> None:
    (site / "omnivoice").mkdir(parents=True)
    (site / "omnivoice" / "__init__.py").write_text(FAKE_OMNIVOICE, encoding="utf-8")
    (site / "torch.py").write_text(FAKE_TORCH, encoding="utf-8")
    (site / "soundfile.py").write_text(FAKE_SOUNDFILE, encoding="utf-8")


class OmniVoiceEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        site = self.root / "site"
        write_fakes(site)
        self.calls = self.root / "calls.jsonl"
        self.host = WorkerHost(sys.executable, self.root / "logs")
        self.addCleanup(self.host.close)
        self.model_dir = self.root / "models" / "omnivoice"
        self.model_dir.mkdir(parents=True)
        self.reference = self.root / "reference.wav"
        self.reference.write_bytes(b"RIFF")
        self.site = site

    def spec(self, cuda: bool | str = False) -> WorkerSpec:
        flag = cuda if isinstance(cuda, str) else ("1" if cuda else "0")
        return WorkerSpec(
            key=f"torch-{flag}",
            engine="engine_omnivoice",
            site_dirs=(self.site,),
            env={"FAKE_OMNIVOICE_CALLS": str(self.calls), "FAKE_CUDA": flag},
        )

    def call(self, op: str, payload: dict, cuda: bool | str = False) -> dict:
        return self.host.call(self.spec(cuda), op, payload, 30)

    def recorded(self, op: str) -> list[dict]:
        lines = self.calls.read_text(encoding="utf-8").splitlines()
        return [entry for entry in map(json.loads, lines) if entry["op"] == op]

    def load(self, device: str = "cpu", cuda: bool | str = False) -> dict:
        return self.call("load", {"modelDir": str(self.model_dir), "device": device}, cuda)

    def synthesize(self, voice: dict, text: str = "Xin chào") -> dict:
        payload = {"text": text, "voice": voice, "outPath": str(self.root / "out.wav")}
        return self.call("synthesize", payload)

    def test_load_uses_local_asr_and_device(self):
        self.assertEqual(self.load(), {"sampleRate": 24_000, "device": "cpu"})
        cpu = self.recorded("load")[0]
        self.assertEqual(cpu["path"], str(self.model_dir))
        self.assertEqual(
            cpu["kwargs"],
            {
                "device_map": "cpu",
                "dtype": "float32",
                "asr_model_name": str(self.model_dir / "asr"),
            },
        )
        self.assertEqual(self.load("cuda", cuda=True)["device"], "cuda")
        gpu = self.recorded("load")[-1]
        self.assertEqual(
            (gpu["kwargs"]["device_map"], gpu["kwargs"]["dtype"]), ("cuda:0", "float16")
        )
        self.assertEqual(self.load("cuda", cuda="old")["device"], "cpu")
        self.assertEqual(self.recorded("load")[-1]["kwargs"]["device_map"], "cpu")

    def test_preset_and_design_become_instructions(self):
        self.load()
        result = self.synthesize(
            {"source": "preset", "prompt": "male, elderly, low pitch", "language": "vi"}
        )
        self.assertEqual(result, {"durationMs": 500, "sampleRate": 24_000})
        self.synthesize({"source": "design", "prompt": "young adult, whisper", "gender": "female"})
        self.synthesize({"source": "design", "prompt": "male, child", "gender": "female"})
        self.synthesize({"source": "design", "prompt": "", "language": "multi"})
        calls = self.recorded("generate")
        self.assertEqual(
            [(call["language"], call["kwargs"]["instruct"]) for call in calls],
            [
                ("vi", "male, elderly, low pitch"),
                (None, "female, young adult, whisper"),
                (None, "male, child"),
                (None, None),
            ],
        )
        self.assertEqual((self.root / "out.wav").stat().st_size, 12_000)

    def test_clone_prompts_are_reused_per_reference_content(self):
        self.load()
        clone = {"source": "clone", "referencePath": str(self.reference)}
        self.synthesize(clone)
        self.synthesize(clone, text="Lần nữa")
        self.assertEqual(len(self.recorded("prompt")), 1)
        self.reference.write_bytes(b"RIFF-new-take")
        self.synthesize(clone)
        self.assertEqual(len(self.recorded("prompt")), 2)
        generated = self.recorded("generate")[-1]
        self.assertEqual(
            generated["kwargs"], {"voice_clone_prompt": {"prompt": str(self.reference)}}
        )

    def test_rejections(self):
        with self.assertRaises(WorkerError) as not_loaded:
            self.synthesize({"source": "design", "prompt": "female"})
        self.assertEqual(not_loaded.exception.code, "MODEL_NOT_LOADED")
        self.load()
        silent = self.root / "silent.wav"
        silent.write_bytes(b"RIFF")
        cases = [
            ({"source": "design", "prompt": "sparkly"}, "PROMPT_INVALID"),
            ({"source": "clone", "referencePath": str(silent)}, "REFERENCE_INVALID"),
            (
                {"source": "clone", "referencePath": str(self.root / "gone.wav")},
                "REFERENCE_MISSING",
            ),
        ]
        for voice, code in cases:
            with self.subTest(code=code), self.assertRaises(WorkerError) as rejected:
                self.synthesize(voice)
            self.assertEqual(rejected.exception.code, code)
