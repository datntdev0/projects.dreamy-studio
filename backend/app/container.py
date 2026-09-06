from app.features.models.service import ModelService
from app.features.speeches.cache import TtsCache
from app.features.speeches.service import SpeechService
from app.features.system.service import SystemService
from app.shared.catalog import Catalog, load_catalog
from app.shared.config import Settings


class Container:
    def __init__(self, settings: Settings, catalog: Catalog | None = None) -> None:
        catalog = catalog or load_catalog()
        self.system = SystemService(settings, catalog.cuda)
        self.device = self.system.device
        cache = TtsCache(settings.tts_cache_dir)
        self.models = ModelService(settings, catalog, self.device, cache.clear)
        self.speeches = SpeechService(settings, self.device, cache, self.models)

    def close(self) -> None:
        self.speeches.close()
