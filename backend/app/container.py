from dataclasses import replace

from app.features.models.service import ModelService
from app.features.speeches.cache import TtsCache
from app.features.speeches.service import SpeechService
from app.features.system.cuda import configure_dll_search
from app.features.system.service import SystemService
from app.shared.catalog import Catalog, load_catalog
from app.shared.config import Settings
from app.shared.errors import BackendError


class Container:
    def __init__(self, settings: Settings, catalog: Catalog | None = None) -> None:
        self.settings = settings
        self.catalog = catalog or load_catalog()
        self.system = SystemService(settings, self.catalog.cuda)
        self.device = self.system.device
        cache = TtsCache(settings.tts_cache_dir)
        self.models = ModelService(settings, self.catalog, self.device, cache.clear)
        self.speeches = SpeechService(settings, self.device, cache, self.models)

    def close(self) -> None:
        self.speeches.close()

    def downloading(self) -> bool:
        return self.system.downloading() or self.models.downloading()

    def switch_device(self, device: str) -> "Container":
        if device == self.device:
            return self
        self.system.check_device(device)
        if self.downloading():
            raise BackendError(409, "DEVICE_BUSY", "Wait for downloads to finish first")
        self.close()
        configure_dll_search(self.settings.cuda_dir)
        return Container(replace(self.settings, device=device), self.catalog)
