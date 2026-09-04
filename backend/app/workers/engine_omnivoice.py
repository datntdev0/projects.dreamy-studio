import gc
from collections import OrderedDict
from pathlib import Path
from typing import Any

import soundfile
from protocol import EngineError

ASR_DIR = "asr"
CUDA_DEVICE = "cuda"
GPU_DEVICE_MAP = "cuda:0"
CPU_DEVICE_MAP = "cpu"
CLONE_SOURCE = "clone"
GENDERS = ("female", "male")
AUTO_LANGUAGES = ("", "multi", "mul")
PROMPT_CACHE_SIZE = 8


def model_path(payload: dict[str, Any]) -> Path:
    path = Path(str(payload.get("modelDir", "")))
    if not path.is_dir():
        raise EngineError("MODEL_NOT_INSTALLED", f"Model folder is missing: {path}")
    return path


def reference_path(voice: dict[str, Any]) -> Path:
    path = Path(str(voice.get("referencePath") or ""))
    if not path.is_file():
        raise EngineError("REFERENCE_MISSING", "Reference audio is missing")
    return path


def reference_key(path: Path) -> tuple[str, int, int]:
    stat = path.stat()
    return str(path), stat.st_size, stat.st_mtime_ns


def with_gender(prompt: str, gender: str) -> str:
    items = [item.strip() for item in prompt.split(",") if item.strip()]
    if gender in GENDERS and not any(item.lower() in GENDERS for item in items):
        items.insert(0, gender)
    return ", ".join(items)


def cuda_supported(torch: Any) -> bool:
    if not torch.cuda.is_available():
        return False
    major, minor = torch.cuda.get_device_capability(0)
    return f"sm_{major}{minor}" in torch.cuda.get_arch_list()


def language_of(voice: dict[str, Any]) -> str | None:
    language = str(voice.get("language") or "")
    return None if language in AUTO_LANGUAGES else language


class OmniVoiceEngine:
    def __init__(self) -> None:
        self.model: Any = None
        self.loaded: tuple[str, str] | None = None
        self.prompts: OrderedDict[tuple[str, int, int], Any] = OrderedDict()
        self.device = CPU_DEVICE_MAP

    def create(self, model_dir: Path, device: str) -> Any:
        import torch
        from omnivoice import OmniVoice

        gpu = device == CUDA_DEVICE and cuda_supported(torch)
        self.device = CUDA_DEVICE if gpu else CPU_DEVICE_MAP
        return OmniVoice.from_pretrained(
            str(model_dir),
            device_map=GPU_DEVICE_MAP if gpu else CPU_DEVICE_MAP,
            dtype=torch.float16 if gpu else torch.float32,
            asr_model_name=str(model_dir / ASR_DIR),
        )

    def load(self, payload: dict[str, Any]) -> dict[str, Any]:
        model_dir = model_path(payload)
        key = (str(model_dir), str(payload.get("device", "cpu")))
        if self.loaded != key:
            self.unload({})
            self.model = self.create(model_dir, key[1])
            self.loaded = key
        return {"sampleRate": int(self.model.sampling_rate), "device": self.device}

    def unload(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.model = None
        self.loaded = None
        self.prompts.clear()
        gc.collect()
        return {}

    def clone_prompt(self, voice: dict[str, Any]) -> Any:
        key = reference_key(reference_path(voice))
        if key in self.prompts:
            self.prompts.move_to_end(key)
            return self.prompts[key]
        try:
            prompt = self.model.create_voice_clone_prompt(ref_audio=key[0])
        except ValueError as error:
            raise EngineError("REFERENCE_INVALID", str(error)) from error
        self.prompts[key] = prompt
        while len(self.prompts) > PROMPT_CACHE_SIZE:
            self.prompts.popitem(last=False)
        return prompt

    def voice_arguments(self, voice: dict[str, Any]) -> dict[str, Any]:
        if voice.get("source") == CLONE_SOURCE:
            return {"voice_clone_prompt": self.clone_prompt(voice)}
        prompt = with_gender(str(voice.get("prompt") or ""), str(voice.get("gender") or ""))
        return {"instruct": prompt or None}

    def synthesize(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.model is None:
            raise EngineError("MODEL_NOT_LOADED", "No model is loaded")
        text = str(payload.get("text", "")).strip()
        if not text:
            raise EngineError("TEXT_EMPTY", "Text is empty")
        voice = payload.get("voice") or {}
        arguments = self.voice_arguments(voice)
        try:
            audio = self.model.generate(text=text, language=language_of(voice), **arguments)[0]
        except ValueError as error:
            code = "PROMPT_INVALID" if arguments.get("instruct") else "ENGINE_FAILED"
            raise EngineError(code, str(error)) from error
        rate = int(self.model.sampling_rate)
        soundfile.write(str(payload["outPath"]), audio, rate)
        return {"durationMs": round(len(audio) * 1000 / rate), "sampleRate": rate}


def create_engine() -> OmniVoiceEngine:
    return OmniVoiceEngine()
