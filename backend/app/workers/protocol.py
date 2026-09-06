from pathlib import Path
from typing import Any

ENGINE_FAILED = "ENGINE_FAILED"
UNKNOWN_OP = "UNKNOWN_OP"
INVALID_REQUEST = "INVALID_REQUEST"
SHUTDOWN = "shutdown"
PING = "ping"
ENGINE_OPS = ("load", "synthesize", "unload")


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
