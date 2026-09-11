from collections.abc import Callable

from app.features.models.downloader import ModelDownloader
from app.features.models.runtimes import RuntimeInstaller
from app.features.models.schemas import TtsModelResponse
from app.shared.catalog import Catalog, CatalogModel, RuntimeVariant
from app.shared.config import Settings
from app.shared.downloads import DownloadBusy
from app.shared.errors import BackendError


class ModelService:
    def __init__(
        self,
        settings: Settings,
        catalog: Catalog,
        variant: str,
        on_removed: Callable[[str], None],
    ) -> None:
        self.settings = settings
        self.catalog = catalog
        self.variant = variant
        self.on_removed = on_removed
        self.runtimes = self.build_runtimes()
        self.models = {
            model.id: ModelDownloader(
                model, settings.models_dir, settings.hf_endpoint, self.runtime_of(model)
            )
            for model in catalog.models
        }

    def installer(self, variant: RuntimeVariant) -> RuntimeInstaller:
        return RuntimeInstaller(
            variant,
            self.settings.runtime_dir,
            self.settings.worker_python,
            self.settings.wheel_mirror,
        )

    def build_runtimes(self) -> dict[str, RuntimeInstaller]:
        return {
            runtime_id: self.installer(runtime.variant_for(self.variant))
            for runtime_id, runtime in self.catalog.runtimes.items()
        }

    def variant_installer(self, variant: RuntimeVariant) -> RuntimeInstaller:
        active = self.runtimes[variant.runtime]
        return active if active.key == variant.key else self.installer(variant)

    def runtime_of(self, model: CatalogModel) -> RuntimeInstaller | None:
        if self.settings.tts_engine or not model.runtime:
            return None
        return self.runtimes.get(model.runtime)

    def runtime_in_use(self, runtime_id: str) -> bool:
        return any(
            downloader.installed() or downloader.status().state == "downloading"
            for downloader in self.models.values()
            if downloader.model.runtime == runtime_id
        )

    def release_runtime(self, model: CatalogModel) -> None:
        runtime_id = model.runtime
        if runtime_id is None or runtime_id not in self.catalog.runtimes:
            return
        if self.runtime_in_use(runtime_id):
            return
        for variant in self.catalog.runtimes[runtime_id].variants.values():
            self.variant_installer(variant).remove()

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
        self.on_removed(model_id)
        self.release_runtime(downloader.model)
        return TtsModelResponse.of(downloader.model, download)
