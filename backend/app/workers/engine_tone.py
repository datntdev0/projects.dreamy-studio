import hashlib
import math
import struct
import wave
from pathlib import Path
from typing import Any

from protocol import EngineError

SAMPLE_RATE = 24_000
MS_PER_CHARACTER = 60
MIN_DURATION_MS = 500
MAX_DURATION_MS = 10_000
AMPLITUDE = 0.3
BASE_FREQUENCY = 180
FREQUENCY_SPAN = 240


def duration_ms(text: str) -> int:
    return max(MIN_DURATION_MS, min(MAX_DURATION_MS, len(text) * MS_PER_CHARACTER))


def frequency(voice: dict[str, Any]) -> float:
    digest = hashlib.sha256(repr(sorted(voice.items())).encode("utf-8")).digest()
    return BASE_FREQUENCY + digest[0] / 255 * FREQUENCY_SPAN


def tone_frames(hertz: float, samples: int) -> bytes:
    scale = AMPLITUDE * 32767
    step = 2 * math.pi * hertz / SAMPLE_RATE
    return b"".join(
        struct.pack("<h", int(scale * math.sin(step * index))) for index in range(samples)
    )


def write_wave(path: Path, frames: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames)


class ToneEngine:
    def __init__(self) -> None:
        self.model: str | None = None

    def load(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.model = str(payload.get("model", "tone"))
        return {"model": self.model}

    def unload(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.model = None
        return {}

    def synthesize(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.model is None:
            raise EngineError("MODEL_NOT_LOADED", "No model is loaded")
        text = str(payload.get("text", "")).strip()
        if not text:
            raise EngineError("TEXT_EMPTY", "Text is empty")
        length = duration_ms(text)
        samples = SAMPLE_RATE * length // 1000
        write_wave(
            Path(payload["outPath"]), tone_frames(frequency(payload.get("voice", {})), samples)
        )
        return {"durationMs": length, "sampleRate": SAMPLE_RATE}


def create_engine() -> ToneEngine:
    return ToneEngine()
