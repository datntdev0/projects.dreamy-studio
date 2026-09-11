from typing import Literal

from pydantic import Field

from app.features.speeches.synthesis import (
    DEFAULT_SENTENCE_PAUSE_MS,
    MAX_SENTENCE_PAUSE_MS,
    SynthesisRequest,
)
from app.shared.schemas import CamelModel

VoiceSource = Literal["preset", "clone", "design"]


class SynthesizeRequest(CamelModel):
    model: str
    text: str
    source: VoiceSource
    language: str = ""
    gender: str = ""
    preset: str = ""
    prompt: str = ""
    reference_path: str = ""
    reference_audio: str = ""
    reference_name: str = ""
    sentence_pause_ms: int = Field(
        default=DEFAULT_SENTENCE_PAUSE_MS, ge=0, le=MAX_SENTENCE_PAUSE_MS
    )

    def to_request(self) -> SynthesisRequest:
        return SynthesisRequest(
            model=self.model,
            text=self.text,
            source=self.source,
            language=self.language,
            gender=self.gender,
            preset=self.preset,
            prompt=self.prompt,
            reference_path=self.reference_path,
            sentence_pause_ms=self.sentence_pause_ms,
        )
