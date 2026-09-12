import argparse
import asyncio
import sys
from pathlib import Path

from aiohttp import ClientError
from edge_tts import Communicate, SubMaker
from edge_tts.exceptions import EdgeTTSException

BOUNDARY = "SentenceBoundary"
AUDIO_CHUNK = "audio"
FAILURES = (EdgeTTSException, ClientError, TimeoutError, OSError, ValueError)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--subtitles", required=True)
    return parser.parse_args()


async def speak(text: str, voice: str) -> tuple[bytes, str]:
    communicate = Communicate(text, voice, boundary=BOUNDARY)
    audio = bytearray()
    subtitles = SubMaker()
    async for chunk in communicate.stream():
        if chunk["type"] == AUDIO_CHUNK:
            audio.extend(chunk["data"])
        elif chunk["type"] == BOUNDARY:
            subtitles.feed(chunk)
    return bytes(audio), subtitles.get_srt()


def main() -> int:
    args = parse_args()
    text = sys.stdin.buffer.read().decode("utf-8")
    try:
        audio, subtitles = asyncio.run(speak(text, args.voice))
        Path(args.audio).write_bytes(audio)
        Path(args.subtitles).write_text(subtitles, encoding="utf-8")
    except FAILURES as error:
        sys.stderr.write(f"{type(error).__name__}: {error}\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
