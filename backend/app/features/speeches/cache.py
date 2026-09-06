import hashlib
import json
import logging
import os
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.shared.downloads import remove_tree

AUDIO_SUFFIX = ".wav"
META_SUFFIX = ".json"
PARTIAL_SUFFIX = f".partial{AUDIO_SUFFIX}"
DEFAULT_LIMIT_BYTES = 500 * 1024 * 1024

logger = logging.getLogger("tts-cache")


@dataclass(frozen=True)
class CachedAudio:
    path: Path
    duration_ms: int
    sample_rate: int


def cache_key(fields: dict[str, Any]) -> str:
    encoded = json.dumps(fields, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def is_complete(path: Path) -> bool:
    return not path.name.endswith(PARTIAL_SUFFIX)


def modified_at(path: Path) -> float:
    return path.stat().st_mtime


def entry_size(audio: Path) -> int:
    meta = audio.with_suffix(META_SUFFIX)
    return audio.stat().st_size + (meta.stat().st_size if meta.exists() else 0)


def remove_entry(audio: Path) -> bool:
    try:
        audio.unlink(missing_ok=True)
        audio.with_suffix(META_SUFFIX).unlink(missing_ok=True)
    except OSError:
        return False
    return True


def read_meta(audio: Path) -> dict[str, Any] | None:
    try:
        meta = json.loads(audio.with_suffix(META_SUFFIX).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return meta if isinstance(meta, dict) else None


class TtsCache:
    def __init__(self, root: Path, limit_bytes: int = DEFAULT_LIMIT_BYTES) -> None:
        self.root = root
        self.limit_bytes = limit_bytes
        self.lock = threading.Lock()
        self.key_locks: dict[str, threading.Lock] = {}

    def audio_path(self, namespace: str, key: str) -> Path:
        return self.root / namespace / f"{key}{AUDIO_SUFFIX}"

    def key_lock(self, key: str) -> threading.Lock:
        with self.lock:
            return self.key_locks.setdefault(key, threading.Lock())

    def get(self, namespace: str, key: str) -> CachedAudio | None:
        audio = self.audio_path(namespace, key)
        meta = read_meta(audio)
        if meta is None:
            return None
        try:
            os.utime(audio)
        except OSError:
            return None
        return CachedAudio(audio, int(meta["durationMs"]), int(meta["sampleRate"]))

    def partial_path(self, namespace: str, key: str) -> Path:
        directory = self.root / namespace
        directory.mkdir(parents=True, exist_ok=True)
        return directory / f"{key}.{uuid.uuid4().hex}{PARTIAL_SUFFIX}"

    def put(self, namespace: str, key: str, partial: Path, meta: dict[str, Any]) -> CachedAudio:
        audio = self.audio_path(namespace, key)
        audio.with_suffix(META_SUFFIX).write_text(json.dumps(meta), encoding="utf-8")
        partial.replace(audio)
        self.prune()
        return CachedAudio(audio, int(meta["durationMs"]), int(meta["sampleRate"]))

    def entries(self) -> list[Path]:
        if not self.root.is_dir():
            return []
        complete = (path for path in self.root.rglob(f"*{AUDIO_SUFFIX}") if is_complete(path))
        return sorted(complete, key=modified_at)

    def prune(self) -> None:
        with self.lock:
            entries = self.entries()
            total = sum(entry_size(entry) for entry in entries)
            for entry in entries[:-1]:
                if total <= self.limit_bytes:
                    break
                size = entry_size(entry)
                if remove_entry(entry):
                    total -= size
                    logger.info("Evicted %s", entry.name)

    def clear(self, namespace: str) -> None:
        with self.lock:
            remove_tree(self.root / namespace)
