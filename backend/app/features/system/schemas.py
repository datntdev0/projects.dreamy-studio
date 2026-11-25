from typing import Literal

from app.features.system.gpu import Gpu
from app.shared.downloads import Download
from app.shared.schemas import CamelModel, Device, DownloadResponse, download_fields


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


class CudaResponse(DownloadResponse):
    version: str

    @classmethod
    def of(cls, download: Download, version: str) -> "CudaResponse":
        return cls(**download_fields(download), version=version)


class SystemResponse(CamelModel):
    gpu: GpuResponse
    cuda: CudaResponse
    models_dir: str = ""


class DeviceRequest(CamelModel):
    device: Device
