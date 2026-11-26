import logging
import platform
from importlib import metadata

from app.features.system.gpu import Gpu, GpuDetector
from app.features.system.schemas import GpuResponse, HealthResponse, SystemResponse
from app.shared.config import Settings
from app.shared.downloads import utc_now

PACKAGE_NAME = "dreamy-studio-backend"

logger = logging.getLogger("system")


def package_version() -> str:
    try:
        return metadata.version(PACKAGE_NAME)
    except metadata.PackageNotFoundError:
        return "0.0.0"


def pick_device(requested: str | None, gpu: Gpu) -> str:
    if requested is not None:
        return requested
    return "cuda" if gpu.cuda_supported else "cpu"


class SystemService:
    def __init__(self, settings: Settings) -> None:
        self.started_at = utc_now()
        self.version = package_version()
        self.gpu = GpuDetector(settings.nvidia_smi)
        self.device = pick_device(settings.device, self.gpu.get())
        logger.info("Device %s selected for %s", self.device, self.gpu.get())

    def health(self) -> HealthResponse:
        return HealthResponse(
            status="ok",
            version=self.version,
            python_version=platform.python_version(),
            started_at=self.started_at,
            device=self.device,
        )

    def system_view(self) -> SystemResponse:
        return SystemResponse(gpu=GpuResponse.of(self.gpu.get()), device=self.device)
