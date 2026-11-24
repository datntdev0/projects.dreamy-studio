import secrets
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response

from app.shared.errors import error_response

API_KEY_HEADER = "X-API-Key"

NextHandler = Callable[[Request], Awaitable[Response]]


def has_valid_key(request: Request, api_key: str) -> bool:
    provided = request.headers.get(API_KEY_HEADER, "")
    return secrets.compare_digest(provided.encode(), api_key.encode())


class ApiKeyGuard:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def __call__(self, request: Request, call_next: NextHandler) -> Response:
        if has_valid_key(request, self.api_key):
            return await call_next(request)
        return error_response(401, "UNAUTHORIZED", "Missing or invalid API key")


def protect_with_api_key(app: FastAPI, api_key: str | None) -> None:
    if api_key:
        app.middleware("http")(ApiKeyGuard(api_key))
