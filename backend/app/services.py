from importlib import metadata

from app.catalog import cuda_catalog, model_catalog
from app.config import Settings
from app.cuda import CudaInstaller, cuda_installed
from app.downloads import DownloadBusy, utc_now
from app.errors import BackendError
from app.gpu import GpuDetector
from app.models import ModelDownloader
from app.schemas import CudaResponse, GpuResponse, SystemResponse, TtsModelResponse

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


class Services:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.started_at = utc_now()
        self.version = package_version()
        self.device = effective_device(settings)
        self.gpu = GpuDetector(settings.nvidia_smi)
        self.cuda = CudaInstaller(settings.cuda_dir, settings.pypi_url, cuda_catalog())
        self.models = {
            model.id: ModelDownloader(model, settings.models_dir, settings.hf_endpoint)
            for model in model_catalog()
        }

    def cuda_view(self) -> CudaResponse:
        return CudaResponse.of(self.cuda.slot.status(), self.cuda.version())

    def system_view(self) -> SystemResponse:
        return SystemResponse(gpu=GpuResponse.of(self.gpu.get()), cuda=self.cuda_view())

    def scan_gpu(self) -> SystemResponse:
        self.gpu.scan()
        return self.system_view()

    def start_cuda(self) -> CudaResponse:
        if not self.gpu.get().found:
            raise BackendError(409, "CUDA_NO_GPU", "No NVIDIA GPU was detected")
        return CudaResponse.of(self.cuda.slot.start(), self.cuda.version())

    def cancel_cuda(self) -> CudaResponse:
        return CudaResponse.of(self.cuda.slot.cancel(), self.cuda.version())

    def remove_cuda(self) -> CudaResponse:
        try:
            download = self.cuda.slot.remove()
        except DownloadBusy as error:
            raise BackendError(409, "CUDA_BUSY", "CUDA runtime is downloading") from error
        return CudaResponse.of(download, self.cuda.version())

    def model(self, model_id: str) -> ModelDownloader:
        if model_id not in self.models:
            raise BackendError(404, "MODEL_NOT_FOUND", f"Model '{model_id}' was not found")
        return self.models[model_id]

    def model_view(self, model_id: str) -> TtsModelResponse:
        downloader = self.model(model_id)
        return TtsModelResponse.of(downloader.model, downloader.status())

    def model_list(self) -> list[TtsModelResponse]:
        return [self.model_view(model_id) for model_id in self.models]

    def start_model(self, model_id: str) -> TtsModelResponse:
        downloader = self.model(model_id)
        return TtsModelResponse.of(downloader.model, downloader.slot.start())

    def cancel_model(self, model_id: str) -> TtsModelResponse:
        downloader = self.model(model_id)
        return TtsModelResponse.of(downloader.model, downloader.slot.cancel())

    def remove_model(self, model_id: str) -> TtsModelResponse:
        downloader = self.model(model_id)
        try:
            download = downloader.slot.remove()
        except DownloadBusy as error:
            raise BackendError(409, "MODEL_BUSY", f"Model '{model_id}' is downloading") from error
        return TtsModelResponse.of(downloader.model, download)
