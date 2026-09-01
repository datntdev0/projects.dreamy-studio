import os
import platform
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Request

from app.config import Settings
from app.cuda import configure_dll_search
from app.errors import register_error_handlers
from app.log import setup_logging
from app.schemas import CudaResponse, HealthResponse, SystemResponse, TtsModelResponse
from app.services import Services

router = APIRouter()


def get_services(request: Request) -> Services:
    return request.app.state.services


ServicesDep = Annotated[Services, Depends(get_services)]


@router.get("/health", response_model=HealthResponse)
def health(services: ServicesDep) -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=services.version,
        python_version=platform.python_version(),
        started_at=services.started_at,
        device=services.device,
    )


@router.get("/system", response_model=SystemResponse)
def system(services: ServicesDep) -> SystemResponse:
    return services.system_view()


@router.post("/system/gpu/scan", response_model=SystemResponse)
def gpu_scan(services: ServicesDep) -> SystemResponse:
    return services.scan_gpu()


@router.post("/cuda/download", response_model=CudaResponse, status_code=202)
def cuda_download(services: ServicesDep) -> CudaResponse:
    return services.start_cuda()


@router.post("/cuda/cancel", response_model=CudaResponse)
def cuda_cancel(services: ServicesDep) -> CudaResponse:
    return services.cancel_cuda()


@router.delete("/cuda", response_model=CudaResponse)
def cuda_remove(services: ServicesDep) -> CudaResponse:
    return services.remove_cuda()


@router.get("/models", response_model=list[TtsModelResponse])
def model_list(services: ServicesDep) -> list[TtsModelResponse]:
    return services.model_list()


@router.post("/models/{model_id}/download", response_model=TtsModelResponse, status_code=202)
def model_download(model_id: str, services: ServicesDep) -> TtsModelResponse:
    return services.start_model(model_id)


@router.post("/models/{model_id}/cancel", response_model=TtsModelResponse)
def model_cancel(model_id: str, services: ServicesDep) -> TtsModelResponse:
    return services.cancel_model(model_id)


@router.delete("/models/{model_id}", response_model=TtsModelResponse)
def model_remove(model_id: str, services: ServicesDep) -> TtsModelResponse:
    return services.remove_model(model_id)


def create_app(settings: Settings) -> FastAPI:
    application = FastAPI(title="Dreamy Studio Local Backend")
    register_error_handlers(application)
    application.include_router(router)
    application.state.services = Services(settings)
    return application


if log_dir := os.environ.get("DREAMY_BACKEND_LOG_DIR"):
    setup_logging(Path(log_dir), os.environ.get("DREAMY_BACKEND_LOG_LEVEL", "INFO"))

settings = Settings.from_env()
configure_dll_search(settings.cuda_dir)
app = create_app(settings)
