from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.features.system.schemas import HealthResponse, SystemResponse
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
