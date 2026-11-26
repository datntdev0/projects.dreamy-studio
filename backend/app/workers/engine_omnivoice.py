import gc
from pathlib import Path
from typing import Any

import soundfile
from protocol import EngineError, PromptStore, model_path

ASR_DIR = "asr"
CUDA_DEVICE = "cuda"
GPU_DEVICE_MAP = "cuda:0"
CPU_DEVICE_MAP = "cpu"
CLONE_SOURCE = "clone"
GENDERS = ("female", "male")
AUTO_LANGUAGES = ("", "multi", "mul")
PROMPT_CACHE_SIZE = 8


def read_prompt(path: str) -> Any:
    from omnivoice import VoiceClonePrompt

    return VoiceClonePrompt.load(path)


def write_prompt(prompt: Any, path: str) -> None:
    prompt.save(path)


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
        self.prompts = PromptStore(PROMPT_CACHE_SIZE, read_prompt, write_prompt)
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

    def enroll(self, reference: Path) -> Any:
        try:
            return self.model.create_voice_clone_prompt(ref_audio=str(reference))
        except ValueError as error:
            raise EngineError("REFERENCE_INVALID", str(error)) from error

    def voice_arguments(self, voice: dict[str, Any]) -> dict[str, Any]:
        if voice.get("source") == CLONE_SOURCE:
            return {"voice_clone_prompt": self.prompts.get(voice, self.enroll)}
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
