import logging
import platform
from importlib import metadata

from app.features.system.gpu import Gpu, GpuDetector
from app.features.system.schemas import GpuResponse, HealthResponse, SystemResponse
from app.shared.catalog import CPU_VARIANT, CU126_VARIANT, CUDA_VARIANT
from app.shared.config import Settings
from app.shared.downloads import utc_now

PACKAGE_NAME = "dreamy-studio-backend"
CPU_DEVICE = "cpu"
CUDA_DEVICE = "cuda"
CU128_MIN_CAPABILITY = (7, 5)

logger = logging.getLogger("system")


def package_version() -> str:
    try:
        return metadata.version(PACKAGE_NAME)
    except metadata.PackageNotFoundError:
        return "0.0.0"


def cuda_variant(gpu: Gpu) -> str:
    capability = gpu.capability
    if capability is not None and capability < CU128_MIN_CAPABILITY:
        return CU126_VARIANT
    return CUDA_VARIANT


def pick_variant(requested: str | None, gpu: Gpu) -> str:
    if requested == CPU_DEVICE:
        return CPU_VARIANT
    if requested == CUDA_DEVICE or gpu.cuda_supported:
        return cuda_variant(gpu)
    return CPU_VARIANT


class SystemService:
    def __init__(self, settings: Settings) -> None:
        self.models_dir = settings.models_dir
        self.started_at = utc_now()
        self.version = package_version()
        self.gpu = GpuDetector(settings.nvidia_smi)
        self.variant = pick_variant(settings.device, self.gpu.get())
        self.device = CPU_DEVICE if self.variant == CPU_VARIANT else CUDA_DEVICE
        logger.info("Runtime variant %s selected for %s", self.variant, self.gpu.get())

    def health(self) -> HealthResponse:
        return HealthResponse(
            status="ok",
            version=self.version,
            python_version=platform.python_version(),
            started_at=self.started_at,
            device=self.device,
        )

    def system_view(self) -> SystemResponse:
        return SystemResponse(
            gpu=GpuResponse.of(self.gpu.get()),
            device=self.device,
            models_dir=str(self.models_dir),
        )
