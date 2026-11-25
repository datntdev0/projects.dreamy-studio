from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.features.system.schemas import (
    CudaResponse,
    DeviceRequest,
    HealthResponse,
    SystemResponse,
)
from app.features.system.service import SystemService

router = APIRouter()


def get_system(request: Request) -> SystemService:
    return request.app.state.container.system


SystemDep = Annotated[SystemService, Depends(get_system)]


@router.get("/health", response_model=HealthResponse)
def health(system: SystemDep) -> HealthResponse:
    return system.health()


@router.get("/system", response_model=SystemResponse)
def system_view(system: SystemDep) -> SystemResponse:
    return system.system_view()


@router.post("/system/gpu/scan", response_model=SystemResponse)
def gpu_scan(system: SystemDep) -> SystemResponse:
    return system.scan_gpu()


@router.post("/cuda/download", response_model=CudaResponse, status_code=202)
def cuda_download(system: SystemDep) -> CudaResponse:
    return system.start_cuda()


@router.post("/cuda/cancel", response_model=CudaResponse)
def cuda_cancel(system: SystemDep) -> CudaResponse:
    return system.cancel_cuda()


@router.delete("/cuda", response_model=CudaResponse)
def cuda_remove(system: SystemDep) -> CudaResponse:
    return system.remove_cuda()


@router.put("/system/device", response_model=HealthResponse)
def device_set(body: DeviceRequest, request: Request) -> HealthResponse:
    container = request.app.state.container.switch_device(body.device)
    request.app.state.container = container
    return container.system.health()
