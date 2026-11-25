import platform
from importlib import metadata

from app.features.system.cuda import CudaInstaller, cuda_installed
from app.features.system.gpu import GpuDetector
from app.features.system.schemas import (
    CudaResponse,
    GpuResponse,
    HealthResponse,
    SystemResponse,
)
from app.shared.catalog import CudaCatalog
from app.shared.config import Settings
from app.shared.downloads import Download, DownloadBusy, utc_now
from app.shared.errors import BackendError

PACKAGE_NAME = "dreamy-studio-backend"


def package_version() -> str:
    try:
        return metadata.version(PACKAGE_NAME)
    except metadata.PackageNotFoundError:
        return "0.0.0"


def effective_device(settings: Settings) -> str:
    if settings.device == "cuda" and cuda_installed(settings.cuda_dir):
        return "cuda"
    return "cpu"


class SystemService:
    def __init__(self, settings: Settings, cuda: CudaCatalog) -> None:
        self.models_dir = settings.models_dir
        self.cuda_dir = settings.cuda_dir
        self.started_at = utc_now()
        self.version = package_version()
        self.device = effective_device(settings)
        self.gpu = GpuDetector(settings.nvidia_smi)
        self.cuda = CudaInstaller(settings.cuda_dir, settings.pypi_url, cuda)

    def health(self) -> HealthResponse:
        return HealthResponse(
            status="ok",
            version=self.version,
            python_version=platform.python_version(),
            started_at=self.started_at,
            device=self.device,
        )

    def cuda_response(self, download: Download) -> CudaResponse:
        return CudaResponse.of(download, self.cuda.version())

    def cuda_view(self) -> CudaResponse:
        return self.cuda_response(self.cuda.slot.status())

    def system_view(self) -> SystemResponse:
        return SystemResponse(
            gpu=GpuResponse.of(self.gpu.get()),
            cuda=self.cuda_view(),
            models_dir=str(self.models_dir),
        )

    def downloading(self) -> bool:
        return self.cuda.slot.status().state == "downloading"

    def check_device(self, device: str) -> None:
        if device == "cuda" and not cuda_installed(self.cuda_dir):
            raise BackendError(409, "CUDA_NOT_INSTALLED", "Install the CUDA runtime first")

    def scan_gpu(self) -> SystemResponse:
        self.gpu.scan()
        return self.system_view()

    def start_cuda(self) -> CudaResponse:
        if not self.gpu.get().found:
            raise BackendError(409, "CUDA_NO_GPU", "No NVIDIA GPU was detected")
        return self.cuda_response(self.cuda.slot.start())

    def cancel_cuda(self) -> CudaResponse:
        return self.cuda_response(self.cuda.slot.cancel())

    def remove_cuda(self) -> CudaResponse:
        try:
            download = self.cuda.slot.remove()
        except DownloadBusy as error:
            raise BackendError(409, "CUDA_BUSY", "CUDA runtime is downloading") from error
        return self.cuda_response(download)
