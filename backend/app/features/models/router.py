from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.features.models.schemas import TtsModelResponse
from app.features.models.service import ModelService

router = APIRouter()


def get_models(request: Request) -> ModelService:
    return request.app.state.container.models


ModelsDep = Annotated[ModelService, Depends(get_models)]


@router.get("/models", response_model=list[TtsModelResponse])
def model_list(models: ModelsDep) -> list[TtsModelResponse]:
    return models.model_list()


@router.post("/models/{model_id}/download", response_model=TtsModelResponse, status_code=202)
def model_download(model_id: str, models: ModelsDep) -> TtsModelResponse:
    return models.start_model(model_id)


@router.post("/models/{model_id}/cancel", response_model=TtsModelResponse)
def model_cancel(model_id: str, models: ModelsDep) -> TtsModelResponse:
    return models.cancel_model(model_id)


@router.delete("/models/{model_id}", response_model=TtsModelResponse)
def model_remove(model_id: str, models: ModelsDep) -> TtsModelResponse:
    return models.remove_model(model_id)
