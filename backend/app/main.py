import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app.container import Container
from app.features.models.router import router as models_router
from app.features.speeches.router import router as speeches_router
from app.features.system.cuda import configure_dll_search
from app.features.system.router import router as system_router
from app.shared.catalog import Catalog
from app.shared.config import Settings
from app.shared.errors import register_error_handlers
from app.shared.log import setup_logging


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    yield
    application.state.container.close()


def create_app(settings: Settings, catalog: Catalog | None = None) -> FastAPI:
    application = FastAPI(title="Dreamy Studio Local Backend", lifespan=lifespan)
    register_error_handlers(application)
    application.include_router(system_router)
    application.include_router(models_router)
    application.include_router(speeches_router)
    application.state.container = Container(settings, catalog)
    return application


if log_dir := os.environ.get("DREAMY_BACKEND_LOG_DIR"):
    setup_logging(Path(log_dir), os.environ.get("DREAMY_BACKEND_LOG_LEVEL", "INFO"))

settings = Settings.from_env()
configure_dll_search(settings.cuda_dir)
app = create_app(settings)
