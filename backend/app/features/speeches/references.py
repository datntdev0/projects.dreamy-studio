import base64
import binascii
import hashlib
from pathlib import Path

from app.features.speeches.synthesis import reject

MAX_REFERENCE_BYTES = 50 * 1024 * 1024
DEFAULT_SUFFIX = ".wav"
AUDIO_SUFFIXES = frozenset({".wav", ".mp3", ".flac", ".ogg", ".opus", ".m4a", ".aac", ".webm"})


def reference_suffix(name: str) -> str:
    suffix = Path(name).suffix.lower()
    return suffix if suffix in AUDIO_SUFFIXES else DEFAULT_SUFFIX


def decode_reference(data: str) -> bytes:
    try:
        content = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as error:
        raise reject("REFERENCE_INVALID", "Reference audio is not valid base64") from error
    if not content:
        raise reject("REFERENCE_MISSING", "Reference audio is missing")
    if len(content) > MAX_REFERENCE_BYTES:
        raise reject("REFERENCE_INVALID", "Reference audio is too large")
    return content


class ReferenceStore:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def store(self, data: str, name: str) -> Path:
        content = decode_reference(data)
        digest = hashlib.sha256(content).hexdigest()
        path = self.directory / f"{digest}{reference_suffix(name)}"
        if not path.is_file():
            self.directory.mkdir(parents=True, exist_ok=True)
            partial = path.with_suffix(f"{path.suffix}.part")
            partial.write_bytes(content)
            partial.replace(path)
        return path
