import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from app.errors import register_error_handlers
from app.log import setup_logging


class HealthResponse(BaseModel):
    status: Literal["ok"]


app = FastAPI(title="Dreamy Studio Local Backend")
register_error_handlers(app)

if log_dir := os.environ.get("DREAMY_BACKEND_LOG_DIR"):
    setup_logging(Path(log_dir), os.environ.get("DREAMY_BACKEND_LOG_LEVEL", "INFO"))


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")
