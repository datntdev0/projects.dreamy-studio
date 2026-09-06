import io
import tempfile
import unittest
import wave
from pathlib import Path

from app.features.speeches.subtitles import Cue, build_srt, srt_time
from app.features.speeches.waves import combine_waves
from app.shared.errors import BackendError


def write_clip(path: Path, frames: int, rate: int = 1000, channels: int = 1) -> Path:
    with wave.open(str(path), "wb") as output:
        output.setnchannels(channels)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(b"\x01\x02" * frames * channels)
    return path


class WaveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_combine_inserts_pause_between_clips(self):
        paths = [write_clip(self.root / f"{index}.wav", 500) for index in range(3)]
        combined = combine_waves(paths, 250)
        self.assertEqual(combined.spans, [(0, 500), (750, 1250), (1500, 2000)])
        self.assertEqual((combined.duration_ms, combined.sample_rate), (2000, 1000))
        with wave.open(io.BytesIO(combined.content)) as audio:
            self.assertEqual(audio.getnframes(), 2000)
            frames = audio.readframes(2000)
        self.assertEqual(frames[1000:1500], b"\x00" * 500)
        self.assertEqual(frames[:1000], b"\x01\x02" * 500)

    def test_combine_without_pause(self):
        paths = [write_clip(self.root / f"{index}.wav", 300) for index in range(2)]
        self.assertEqual(combine_waves(paths, 0).spans, [(0, 300), (300, 600)])

    def test_mismatched_formats_fail(self):
        paths = [
            write_clip(self.root / "a.wav", 100),
            write_clip(self.root / "b.wav", 100, rate=2000),
        ]
        with self.assertRaises(BackendError) as raised:
            combine_waves(paths, 100)
        self.assertEqual(raised.exception.code, "SYNTHESIS_FAILED")

    def test_unreadable_audio_fails(self):
        broken = self.root / "broken.wav"
        broken.write_bytes(b"not a wave")
        with self.assertRaises(BackendError) as raised:
            combine_waves([write_clip(self.root / "a.wav", 10), broken], 100)
        self.assertEqual(raised.exception.code, "SYNTHESIS_FAILED")


class SubtitleTests(unittest.TestCase):
    def test_srt_time(self):
        self.assertEqual(srt_time(0), "00:00:00,000")
        self.assertEqual(srt_time(3_723_045), "01:02:03,045")

    def test_build_srt(self):
        cues = [Cue("Xin chào.", 0, 1020), Cue("Tạm biệt!", 1320, 2000)]
        self.assertEqual(
            build_srt(cues),
            "1\n00:00:00,000 --> 00:00:01,020\nXin chào.\n\n"
            "2\n00:00:01,320 --> 00:00:02,000\nTạm biệt!\n",
        )
