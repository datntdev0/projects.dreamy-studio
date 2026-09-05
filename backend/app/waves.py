import io
import wave
from dataclasses import dataclass
from pathlib import Path

from app.errors import BackendError

PCM_8_BIT_SILENCE = b"\x80"
PCM_SILENCE = b"\x00"


@dataclass(frozen=True)
class WaveFormat:
    channels: int
    sample_width: int
    sample_rate: int


@dataclass(frozen=True)
class WaveClip:
    format: WaveFormat
    frames: bytes

    @property
    def frame_count(self) -> int:
        return len(self.frames) // (self.format.channels * self.format.sample_width)


@dataclass(frozen=True)
class CombinedWave:
    content: bytes
    duration_ms: int
    sample_rate: int
    spans: list[tuple[int, int]]


def combine_failure(message: str) -> BackendError:
    return BackendError(500, "SYNTHESIS_FAILED", message)


def read_clip(path: Path) -> WaveClip:
    try:
        with wave.open(str(path), "rb") as source:
            fmt = WaveFormat(source.getnchannels(), source.getsampwidth(), source.getframerate())
            return WaveClip(fmt, source.readframes(source.getnframes()))
    except (OSError, EOFError, wave.Error) as error:
        raise combine_failure(f"Engine produced unreadable audio: {error}") from error


def frames_to_ms(frames: int, sample_rate: int) -> int:
    return frames * 1000 // sample_rate


def silence(fmt: WaveFormat, pause_ms: int) -> bytes:
    sample = PCM_8_BIT_SILENCE if fmt.sample_width == 1 else PCM_SILENCE
    frames = fmt.sample_rate * pause_ms // 1000
    return sample * (frames * fmt.channels * fmt.sample_width)


def check_formats(clips: list[WaveClip]) -> WaveFormat:
    formats = {clip.format for clip in clips}
    if len(formats) != 1:
        raise combine_failure("Sentence audio formats do not match")
    return formats.pop()


def encode_wave(fmt: WaveFormat, frames: bytes) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(fmt.channels)
        output.setsampwidth(fmt.sample_width)
        output.setframerate(fmt.sample_rate)
        output.writeframes(frames)
    return buffer.getvalue()


def combine_waves(paths: list[Path], pause_ms: int) -> CombinedWave:
    clips = [read_clip(path) for path in paths]
    fmt = check_formats(clips)
    gap = silence(fmt, pause_ms)
    gap_frames = len(gap) // (fmt.channels * fmt.sample_width)
    spans: list[tuple[int, int]] = []
    position = 0
    for index, clip in enumerate(clips):
        if index:
            position += gap_frames
        start = position
        position += clip.frame_count
        spans.append(
            (frames_to_ms(start, fmt.sample_rate), frames_to_ms(position, fmt.sample_rate))
        )
    content = encode_wave(fmt, gap.join(clip.frames for clip in clips))
    return CombinedWave(content, frames_to_ms(position, fmt.sample_rate), fmt.sample_rate, spans)
