from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.features.models.downloader import ModelDownloader
from app.features.speeches.cache import CachedAudio, TtsCache, cache_key
from app.features.speeches.sentences import normalize_text, split_sentences
from app.features.speeches.subtitles import Cue, build_srt
from app.features.speeches.waves import combine_waves
from app.features.speeches.worker_host import WorkerError, WorkerHost, WorkerSpec
from app.shared.catalog import CatalogModel, VoicePreset
from app.shared.downloads import file_sha256
from app.shared.errors import BackendError

MAX_TEXT_LENGTH = 5000
DEFAULT_SENTENCE_PAUSE_MS = 300
MAX_SENTENCE_PAUSE_MS = 2000
LOAD_TIMEOUT = 600.0
SYNTHESIZE_TIMEOUT = 300.0
PRESET_SOURCE = "preset"
CLONE_SOURCE = "clone"
ERROR_STATUS = {
    "TEXT_EMPTY": 422,
    "PRESET_UNKNOWN": 422,
    "SOURCE_UNSUPPORTED": 422,
    "REFERENCE_MISSING": 422,
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
    reference_path: str = ""
    sentence_pause_ms: int = DEFAULT_SENTENCE_PAUSE_MS


@dataclass(frozen=True)
class SentenceAudio:
    text: str
    audio: CachedAudio
    cached: bool


@dataclass(frozen=True)
class SynthesisResult:
    content: bytes
    duration_ms: int
    sample_rate: int
    cached: bool
    subtitles: str


def reject(code: str, message: str) -> BackendError:
    return BackendError(ERROR_STATUS.get(code, 422), code, message)


def check_text(text: str) -> list[str]:
    normalized = normalize_text(text)
    if not normalized:
        raise reject("TEXT_EMPTY", "Sample text is empty")
    if len(normalized) > MAX_TEXT_LENGTH:
        raise reject("TEXT_TOO_LONG", f"Sample text exceeds {MAX_TEXT_LENGTH} characters")
    return split_sentences(text)


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
    return voice


def with_reference_digest(voice: dict[str, Any]) -> dict[str, Any]:
    reference = voice.get("referencePath")
    if reference is None:
        return voice
    return {**voice, "referenceSha256": file_sha256(Path(reference))}


def fingerprint(voice: dict[str, Any]) -> dict[str, Any]:
    if voice.get("referencePath") is None:
        return voice
    return {**voice, "referencePath": None}


def worker_failure(error: WorkerError) -> BackendError:
    return BackendError(ERROR_STATUS.get(error.code, 500), error.code, error.message)


def single_result(sentence: SentenceAudio) -> SynthesisResult:
    audio = sentence.audio
    cue = Cue(sentence.text, 0, audio.duration_ms)
    return SynthesisResult(
        content=audio.path.read_bytes(),
        duration_ms=audio.duration_ms,
        sample_rate=audio.sample_rate,
        cached=sentence.cached,
        subtitles=build_srt([cue]),
    )


def combined_result(sentences: list[SentenceAudio], pause_ms: int) -> SynthesisResult:
    combined = combine_waves([sentence.audio.path for sentence in sentences], pause_ms)
    cues = [
        Cue(sentence.text, start, end)
        for sentence, (start, end) in zip(sentences, combined.spans, strict=True)
    ]
    return SynthesisResult(
        content=combined.content,
        duration_ms=combined.duration_ms,
        sample_rate=combined.sample_rate,
        cached=all(sentence.cached for sentence in sentences),
        subtitles=build_srt(cues),
    )


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

    def worker_voice(
        self, downloader: ModelDownloader, spec: WorkerSpec, voice: dict[str, Any]
    ) -> dict[str, Any]:
        digest = voice.get("referenceSha256")
        if digest is None:
            return voice
        model = downloader.model
        key = cache_key(
            {
                "model": model.id,
                "revision": self.revision(downloader),
                "engine": spec.engine,
                "referenceSha256": digest,
            }
        )
        return {**voice, "promptPath": str(self.cache.prompt_path(model.id, key))}

    def synthesize(self, downloader: ModelDownloader, request: SynthesisRequest) -> SynthesisResult:
        model = downloader.model
        spec = self.spec(downloader)
        self.check_installed(downloader)
        sentences = check_text(request.text)
        voice = with_reference_digest(check_voice(model, request))
        rendered = [self.sentence(downloader, spec, text, voice) for text in sentences]
        if len(rendered) == 1:
            return single_result(rendered[0])
        return combined_result(rendered, request.sentence_pause_ms)

    def sentence(
        self,
        downloader: ModelDownloader,
        spec: WorkerSpec,
        text: str,
        voice: dict[str, Any],
    ) -> SentenceAudio:
        model = downloader.model
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
                return SentenceAudio(text, cached, cached=True)
            return SentenceAudio(text, self.render(downloader, spec, key, text, voice), False)

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
        job = {
            "text": text,
            "voice": self.worker_voice(downloader, spec, voice),
            "outPath": str(partial),
        }
        try:
            result = self.workers.run(
                spec, [("load", load, LOAD_TIMEOUT), ("synthesize", job, SYNTHESIZE_TIMEOUT)]
            )
        except WorkerError as error:
            partial.unlink(missing_ok=True)
            raise worker_failure(error) from error
        if not partial.is_file():
            raise BackendError(500, "SYNTHESIS_FAILED", "Engine did not produce audio")
        meta = {"durationMs": int(result["durationMs"]), "sampleRate": int(result["sampleRate"])}
        return self.cache.put(model.id, key, partial, meta)
