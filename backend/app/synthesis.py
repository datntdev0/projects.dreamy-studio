import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.catalog import CatalogModel, VoicePreset
from app.downloads import file_sha256
from app.errors import BackendError
from app.models import ModelDownloader
from app.tts_cache import CachedAudio, TtsCache, cache_key
from app.worker_host import WorkerError, WorkerHost, WorkerSpec

MAX_TEXT_LENGTH = 500
LOAD_TIMEOUT = 600.0
SYNTHESIZE_TIMEOUT = 300.0
PRESET_SOURCE = "preset"
CLONE_SOURCE = "clone"
DESIGN_SOURCE = "design"
WHITESPACE = re.compile(r"\s+")
ERROR_STATUS = {
    "TEXT_EMPTY": 422,
    "PRESET_UNKNOWN": 422,
    "SOURCE_UNSUPPORTED": 422,
    "REFERENCE_MISSING": 422,
    "PROMPT_EMPTY": 422,
    "PROMPT_INVALID": 422,
    "REFERENCE_INVALID": 422,
    "MODEL_NOT_INSTALLED": 409,
    "WORKER_TIMEOUT": 504,
}


@dataclass(frozen=True)
class SynthesisRequest:
    model: str
    text: str
    source: str
    language: str = ""
    gender: str = ""
    preset: str = ""
    prompt: str = ""
    reference_path: str = ""


@dataclass(frozen=True)
class SynthesisResult:
    audio: CachedAudio
    cached: bool


def normalize_text(text: str) -> str:
    return WHITESPACE.sub(" ", text).strip()


def reject(code: str, message: str) -> BackendError:
    return BackendError(ERROR_STATUS.get(code, 422), code, message)


def check_text(text: str) -> str:
    normalized = normalize_text(text)
    if not normalized:
        raise reject("TEXT_EMPTY", "Sample text is empty")
    if len(normalized) > MAX_TEXT_LENGTH:
        raise reject("TEXT_TOO_LONG", f"Sample text exceeds {MAX_TEXT_LENGTH} characters")
    return normalized


def check_reference(path: str) -> Path:
    reference = Path(path)
    if not path or not reference.is_absolute() or not reference.is_file():
        raise reject("REFERENCE_MISSING", "Reference audio is missing")
    return reference


def find_preset(model: CatalogModel, preset_id: str) -> VoicePreset:
    for preset in model.presets:
        if preset.id == preset_id:
            return preset
    raise reject("PRESET_UNKNOWN", f"Unknown preset voice '{preset_id}'")


def check_voice(model: CatalogModel, request: SynthesisRequest) -> dict[str, Any]:
    if request.source not in model.sources:
        raise reject("SOURCE_UNSUPPORTED", f"{model.name} does not support {request.source} voices")
    voice: dict[str, Any] = {
        "source": request.source,
        "language": request.language,
        "gender": request.gender,
    }
    if request.source == PRESET_SOURCE:
        preset = find_preset(model, request.preset)
        voice["preset"] = preset.id
        if preset.prompt:
            voice["prompt"] = preset.prompt
    if request.source == CLONE_SOURCE:
        voice["referencePath"] = str(check_reference(request.reference_path))
    if request.source == DESIGN_SOURCE:
        prompt = normalize_text(request.prompt)
        if not prompt:
            raise reject("PROMPT_EMPTY", "Voice description is empty")
        voice["prompt"] = prompt
    return voice


def fingerprint(voice: dict[str, Any]) -> dict[str, Any]:
    reference = voice.get("referencePath")
    if reference is None:
        return voice
    return {**voice, "referencePath": None, "referenceSha256": file_sha256(Path(reference))}


def worker_failure(error: WorkerError) -> BackendError:
    return BackendError(ERROR_STATUS.get(error.code, 500), error.code, error.message)


class Synthesizer:
    def __init__(
        self,
        workers: WorkerHost,
        cache: TtsCache,
        device: str,
        engine_override: str | None = None,
    ) -> None:
        self.workers = workers
        self.cache = cache
        self.device = device
        self.engine_override = engine_override

    def spec(self, downloader: ModelDownloader) -> WorkerSpec:
        if self.engine_override:
            return WorkerSpec(key=self.engine_override, engine=self.engine_override)
        runtime = downloader.runtime
        engine = downloader.model.engine
        if runtime is None or engine is None:
            raise reject("ENGINE_UNSUPPORTED", f"{downloader.model.name} cannot synthesize yet")
        return WorkerSpec(key=runtime.key, engine=engine, site_dirs=(runtime.site_dir,))

    def check_installed(self, downloader: ModelDownloader) -> None:
        state = downloader.status().state
        if state == "downloading":
            raise BackendError(409, "MODEL_BUSY", f"{downloader.model.name} is downloading")
        if state != "installed":
            raise reject("MODEL_NOT_INSTALLED", f"{downloader.model.name} is not installed")

    def revision(self, downloader: ModelDownloader) -> str:
        manifest = downloader.slot.manifest() or {}
        return str(manifest.get("completedAt", ""))

    def synthesize(self, downloader: ModelDownloader, request: SynthesisRequest) -> SynthesisResult:
        model = downloader.model
        spec = self.spec(downloader)
        self.check_installed(downloader)
        text = check_text(request.text)
        voice = check_voice(model, request)
        key = cache_key(
            {
                "model": model.id,
                "revision": self.revision(downloader),
                "engine": spec.engine,
                "text": text,
                "voice": fingerprint(voice),
            }
        )
        with self.cache.key_lock(key):
            cached = self.cache.get(model.id, key)
            if cached is not None:
                return SynthesisResult(cached, cached=True)
            return SynthesisResult(self.render(downloader, spec, key, text, voice), cached=False)

    def render(
        self,
        downloader: ModelDownloader,
        spec: WorkerSpec,
        key: str,
        text: str,
        voice: dict[str, Any],
    ) -> CachedAudio:
        model = downloader.model
        partial = self.cache.partial_path(model.id, key)
        load = {
            "model": model.id,
            "modelDir": str(downloader.target),
            "device": self.device,
            "options": model.engine_options,
        }
        job = {"text": text, "voice": voice, "outPath": str(partial)}
        try:
            self.workers.call(spec, "load", load, LOAD_TIMEOUT)
            result = self.workers.call(spec, "synthesize", job, SYNTHESIZE_TIMEOUT)
        except WorkerError as error:
            partial.unlink(missing_ok=True)
            raise worker_failure(error) from error
        if not partial.is_file():
            raise BackendError(500, "SYNTHESIS_FAILED", "Engine did not produce audio")
        meta = {"durationMs": int(result["durationMs"]), "sampleRate": int(result["sampleRate"])}
        return self.cache.put(model.id, key, partial, meta)
