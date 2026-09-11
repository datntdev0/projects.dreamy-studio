import functools
import logging
import uuid
from collections import OrderedDict
from collections.abc import Callable
from pathlib import Path
from typing import Any

ENGINE_FAILED = "ENGINE_FAILED"
UNKNOWN_OP = "UNKNOWN_OP"
INVALID_REQUEST = "INVALID_REQUEST"
SHUTDOWN = "shutdown"
PING = "ping"
ENGINE_OPS = ("load", "synthesize", "unload")
PARTIAL_SUFFIX = ".partial"

logger = logging.getLogger("worker")

ReferenceKey = tuple[str, int, int]
PromptBuilder = Callable[[Path], Any]
PromptReader = Callable[[str], Any]
PromptWriter = Callable[[Any, str], None]


class EngineError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def success(request_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"id": request_id, "ok": True, "result": result}


def failure(request_id: Any, code: str, message: str) -> dict[str, Any]:
    return {"id": request_id, "ok": False, "error": {"code": code, "message": message}}


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


def reference_key(path: Path) -> ReferenceKey:
    stat = path.stat()
    return str(path), stat.st_size, stat.st_mtime_ns


def prompt_path(voice: dict[str, Any]) -> Path | None:
    value = voice.get("promptPath")
    return Path(str(value)) if value else None


def restore_prompt(path: Path | None, read: PromptReader) -> Any:
    if path is None or not path.is_file():
        return None
    try:
        return read(str(path))
    except Exception:
        logger.warning("Ignoring unreadable voice prompt %s", path, exc_info=True)
        return None


def store_prompt(path: Path, prompt: Any, write: PromptWriter) -> None:
    partial = path.with_name(f"{path.name}.{uuid.uuid4().hex}{PARTIAL_SUFFIX}")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        write(prompt, str(partial))
        partial.replace(path)
    except (OSError, RuntimeError):
        logger.warning("Could not store voice prompt %s", path, exc_info=True)
    finally:
        partial.unlink(missing_ok=True)


def persisted_prompt(
    path: Path | None, build: Callable[[], Any], read: PromptReader, write: PromptWriter
) -> Any:
    restored = restore_prompt(path, read)
    if restored is not None:
        return restored
    prompt = build()
    if path is not None:
        store_prompt(path, prompt, write)
    return prompt


class PromptStore:
    def __init__(self, capacity: int, read: PromptReader, write: PromptWriter) -> None:
        self.capacity = capacity
        self.read = read
        self.write = write
        self.items: OrderedDict[ReferenceKey, Any] = OrderedDict()

    def get(self, voice: dict[str, Any], build: PromptBuilder) -> Any:
        reference = reference_path(voice)
        key = reference_key(reference)
        if key in self.items:
            self.items.move_to_end(key)
            return self.items[key]
        builder = functools.partial(build, reference)
        prompt = persisted_prompt(prompt_path(voice), builder, self.read, self.write)
        self.items[key] = prompt
        while len(self.items) > self.capacity:
            self.items.popitem(last=False)
        return prompt

    def clear(self) -> None:
        self.items.clear()
