import logging
import sys
from collections.abc import Callable
from functools import partial
from types import TracebackType

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("errors")

ExceptHook = Callable[[type[BaseException], BaseException, TracebackType | None], object]


class BackendError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"code": code, "message": message, "details": None}
    )


async def on_backend_error(request: Request, error: BackendError) -> JSONResponse:
    return error_response(error.status, error.code, error.message)


async def on_http_error(request: Request, error: StarletteHTTPException) -> JSONResponse:
    return error_response(error.status_code, f"HTTP_{error.status_code}", str(error.detail))


async def on_validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
    return error_response(422, "HTTP_422", "Invalid request")


async def on_unexpected_error(request: Request, error: Exception) -> JSONResponse:
    logger.error("Unhandled error on %s %s", request.method, request.url.path, exc_info=error)
    return error_response(500, "BACKEND_UNEXPECTED", "Unexpected backend error")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(BackendError, on_backend_error)
    app.add_exception_handler(StarletteHTTPException, on_http_error)
    app.add_exception_handler(RequestValidationError, on_validation_error)
    app.add_exception_handler(Exception, on_unexpected_error)


def log_startup_error(
    previous: ExceptHook,
    kind: type[BaseException],
    error: BaseException,
    trace: TracebackType | None,
) -> None:
    logger.critical("Unhandled startup error", exc_info=(kind, error, trace))
    previous(kind, error, trace)


def install_excepthook() -> None:
    sys.excepthook = partial(log_startup_error, sys.excepthook)
