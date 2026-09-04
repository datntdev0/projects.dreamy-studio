import argparse
import importlib
import json
import logging
import os
import platform
import site
import sys
from typing import Any, TextIO

from protocol import (
    ENGINE_FAILED,
    ENGINE_OPS,
    INVALID_REQUEST,
    PING,
    SHUTDOWN,
    UNKNOWN_OP,
    EngineError,
    failure,
    success,
)

logger = logging.getLogger("worker")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dreamy Studio engine worker")
    parser.add_argument("--engine", required=True)
    parser.add_argument("--site", action="append", default=[])
    return parser.parse_args()


def open_channel() -> TextIO:
    sys.stdout.flush()
    channel = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1)
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    return channel


def add_sites(directories: list[str]) -> None:
    for directory in directories:
        site.addsitedir(directory)


def ping(engine_name: str) -> dict[str, Any]:
    return {"engine": engine_name, "python": platform.python_version(), "pid": os.getpid()}


def run_engine(engine: Any, op: str, payload: dict[str, Any]) -> dict[str, Any]:
    if op not in ENGINE_OPS:
        raise EngineError(UNKNOWN_OP, f"Unknown operation '{op}'")
    return getattr(engine, op)(payload) or {}


def dispatch(engine: Any, engine_name: str, request: dict[str, Any]) -> dict[str, Any]:
    request_id = request.get("id")
    op = str(request.get("op", ""))
    payload = request.get("payload") or {}
    try:
        if op in (PING, SHUTDOWN):
            return success(request_id, ping(engine_name))
        return success(request_id, run_engine(engine, op, payload))
    except EngineError as error:
        return failure(request_id, error.code, error.message)
    except Exception as error:
        logger.exception("Operation %s failed", op)
        return failure(request_id, ENGINE_FAILED, str(error) or type(error).__name__)


def parse_request(line: str) -> dict[str, Any] | None:
    try:
        request = json.loads(line)
    except ValueError:
        return None
    return request if isinstance(request, dict) else None


def serve(engine: Any, engine_name: str, channel: TextIO) -> None:
    for line in sys.stdin:
        request = parse_request(line)
        if request is None:
            response = failure(None, INVALID_REQUEST, "Request is not a JSON object")
        else:
            response = dispatch(engine, engine_name, request)
        channel.write(json.dumps(response) + "\n")
        if request is not None and request.get("op") == SHUTDOWN:
            return


def main() -> None:
    args = parse_args()
    channel = open_channel()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    add_sites(args.site)
    engine = importlib.import_module(args.engine).create_engine()
    serve(engine, args.engine, channel)


if __name__ == "__main__":
    main()
