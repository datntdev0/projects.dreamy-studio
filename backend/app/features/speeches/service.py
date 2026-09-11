from app.features.models.service import ModelService
from app.features.speeches.cache import TtsCache
from app.features.speeches.synthesis import SynthesisRequest, SynthesisResult, Synthesizer
from app.features.speeches.worker_host import WorkerHost
from app.shared.config import Settings


class SpeechService:
    def __init__(
        self, settings: Settings, device: str, cache: TtsCache, models: ModelService
    ) -> None:
        self.models = models
        self.workers = WorkerHost(
            settings.worker_python, settings.log_dir, pool_size=settings.workers
        )
        self.synthesizer = Synthesizer(self.workers, cache, device, settings.tts_engine)

    def close(self) -> None:
        self.workers.close()

    def synthesize(self, request: SynthesisRequest) -> SynthesisResult:
        return self.synthesizer.synthesize(self.models.model(request.model), request)
