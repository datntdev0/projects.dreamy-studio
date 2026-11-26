import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.container import Container
from app.features.models.router import router as models_router
from app.features.speeches.router import router as speeches_router
from app.features.system.router import router as system_router
from app.shared.auth import protect_with_api_key
from app.shared.catalog import Catalog
from app.shared.config import DATA_DIR_ENV, ServerOptions, Settings
from app.shared.errors import register_error_handlers
from app.shared.log import setup_logging


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    yield
    application.state.container.close()


def create_app(settings: Settings, catalog: Catalog | None = None) -> FastAPI:
    application = FastAPI(title="Dreamy Studio Local Backend", lifespan=lifespan)
    register_error_handlers(application)
    protect_with_api_key(application, settings.api_key)
    application.include_router(system_router)
    application.include_router(models_router)
    application.include_router(speeches_router)
    application.state.container = Container(settings, catalog)
    return application


if os.environ.get(DATA_DIR_ENV):
    options = ServerOptions.from_env()
    setup_logging(options.log_dir, options.log_level)

settings = Settings.from_env()
app = create_app(settings)
