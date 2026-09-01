from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.catalog import CatalogModel
from app.downloads import Download
from app.gpu import Gpu

DownloadState = Literal["none", "downloading", "installed", "error"]
Device = Literal["cpu", "cuda"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class HealthResponse(CamelModel):
    status: Literal["ok"]
    version: str
    python_version: str
    started_at: str
    device: Device


class GpuResponse(CamelModel):
    found: bool
    name: str
    vram_mb: int
    driver: str

    @classmethod
    def of(cls, gpu: Gpu) -> "GpuResponse":
        return cls(found=gpu.found, name=gpu.name, vram_mb=gpu.vram_mb, driver=gpu.driver)


class DownloadResponse(CamelModel):
    state: DownloadState
    received_bytes: int
    total_bytes: int
    error: str


def download_fields(download: Download) -> dict:
    return {
        "state": download.state,
        "received_bytes": download.received_bytes,
        "total_bytes": download.total_bytes,
        "error": download.error,
    }


class CudaResponse(DownloadResponse):
    version: str

    @classmethod
    def of(cls, download: Download, version: str) -> "CudaResponse":
        return cls(**download_fields(download), version=version)


class SystemResponse(CamelModel):
    gpu: GpuResponse
    cuda: CudaResponse


class TtsModelResponse(DownloadResponse):
    id: str
    name: str
    source: str
    languages: list[str]
    cloning: bool
    gpu_recommended: bool

    @classmethod
    def of(cls, model: CatalogModel, download: Download) -> "TtsModelResponse":
        return cls(
            **download_fields(download),
            id=model.id,
            name=model.name,
            source=model.source,
            languages=list(model.languages),
            cloning=model.cloning,
            gpu_recommended=model.gpu_recommended,
        )
