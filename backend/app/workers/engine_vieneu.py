import functools
import gc
from pathlib import Path
from typing import Any

from protocol import EngineError, model_path, reference_path

TURBO_MODE = "v3turbo"
NANO_MODE = "v3nano"
TURBO_ONNX_DIR = "onnx_update"
CODEC_DIR = "codec"
PRESET_SOURCE = "preset"
CLONE_SOURCE = "clone"


def preset_ids(tts: Any) -> set[str]:
    return {voice_id for _, voice_id in tts.list_preset_voices()}


class VieneuEngine:
    def __init__(self) -> None:
        self.tts: Any = None
        self.loaded: tuple[str, str] | None = None
        self.presets: set[str] = set()
        self.lite_engine: Any = None

    def use_local_codec(self, model_dir: Path) -> None:
        from vieneu._v3_turbo_engine import onnx_runtime_lite

        if self.lite_engine is None:
            self.lite_engine = onnx_runtime_lite.OnnxV3LiteEngine
        onnx_runtime_lite.OnnxV3LiteEngine = functools.partial(
            self.lite_engine, codec_dir=str(model_dir / CODEC_DIR)
        )

    def create(self, mode: str, model_dir: Path) -> Any:
        from vieneu import Vieneu

        if mode == TURBO_MODE:
            self.use_local_codec(model_dir)
            return Vieneu(
                mode=TURBO_MODE,
                backbone_repo=str(model_dir),
                onnx_dir=str(model_dir / TURBO_ONNX_DIR),
                backend="onnx",
                device="cpu",
            )
        if mode == NANO_MODE:
            return Vieneu(mode=NANO_MODE, backbone_repo=str(model_dir), onnx_dir=str(model_dir))
        raise EngineError("MODEL_UNSUPPORTED", f"Unknown VieNeu mode '{mode}'")

    def load(self, payload: dict[str, Any]) -> dict[str, Any]:
        mode = str((payload.get("options") or {}).get("mode", ""))
        model_dir = model_path(payload)
        key = (mode, str(model_dir))
        if self.loaded != key:
            self.unload({})
            self.tts = self.create(mode, model_dir)
            self.presets = preset_ids(self.tts)
            self.loaded = key
        return {"sampleRate": self.tts.sample_rate}

    def unload(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.tts = None
        self.loaded = None
        self.presets = set()
        gc.collect()
        return {}

    def voice_arguments(self, voice: dict[str, Any]) -> dict[str, Any]:
        source = voice.get("source")
        if source == PRESET_SOURCE:
            preset = str(voice.get("preset") or "")
            if preset not in self.presets:
                raise EngineError("PRESET_UNKNOWN", f"Unknown preset voice '{preset}'")
            return {"voice": preset}
        if source == CLONE_SOURCE:
            return {"ref_audio": str(reference_path(voice))}
        raise EngineError("SOURCE_UNSUPPORTED", f"VieNeu does not support '{source}' voices")

    def synthesize(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.tts is None:
            raise EngineError("MODEL_NOT_LOADED", "No model is loaded")
        text = str(payload.get("text", "")).strip()
        if not text:
            raise EngineError("TEXT_EMPTY", "Text is empty")
        arguments = self.voice_arguments(payload.get("voice") or {})
        audio = self.tts.infer(text, **arguments)
        self.tts.save(audio, str(payload["outPath"]))
        rate = int(self.tts.sample_rate)
        return {"durationMs": round(len(audio) * 1000 / rate), "sampleRate": rate}


def create_engine() -> VieneuEngine:
    return VieneuEngine()
