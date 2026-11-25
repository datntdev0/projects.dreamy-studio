from typing import Literal

from app.features.system.gpu import Gpu
from app.shared.schemas import CamelModel, Device


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
    compute_capability: str
    cuda_supported: bool

    @classmethod
    def of(cls, gpu: Gpu) -> "GpuResponse":
        return cls(
            found=gpu.found,
            name=gpu.name,
            vram_mb=gpu.vram_mb,
            driver=gpu.driver,
            compute_capability=gpu.compute_capability,
            cuda_supported=gpu.cuda_supported,
        )


class SystemResponse(CamelModel):
    gpu: GpuResponse
    device: Device
    models_dir: str = ""
