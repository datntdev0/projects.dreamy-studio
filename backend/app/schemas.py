from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.catalog import CatalogModel, VoicePreset
from app.downloads import Download
from app.gpu import Gpu
from app.synthesis import SynthesisRequest

VoiceSource = Literal["preset", "clone", "design"]
DownloadState = Literal["none", "downloading", "installed", "error"]
Device = Literal["cpu", "cuda"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class HealthResponse(CamelModel):
    status: Literal["ok"]
    version: str
    python_version: str
    started_at: str
    device: Device


class GpuResponse(CamelModel):
    found: bool
    name: str
    vram_mb: int
    driver: str

    @classmethod
    def of(cls, gpu: Gpu) -> "GpuResponse":
        return cls(found=gpu.found, name=gpu.name, vram_mb=gpu.vram_mb, driver=gpu.driver)


class DownloadResponse(CamelModel):
    state: DownloadState
    received_bytes: int
    total_bytes: int
    error: str


def download_fields(download: Download) -> dict:
    return {
        "state": download.state,
        "received_bytes": download.received_bytes,
        "total_bytes": download.total_bytes,
        "error": download.error,
    }


class CudaResponse(DownloadResponse):
    version: str

    @classmethod
    def of(cls, download: Download, version: str) -> "CudaResponse":
        return cls(**download_fields(download), version=version)


class SystemResponse(CamelModel):
    gpu: GpuResponse
    cuda: CudaResponse


class VoicePresetResponse(CamelModel):
    id: str
    name: str
    gender: str
    region: str
    style: str

    @classmethod
    def of(cls, preset: VoicePreset) -> "VoicePresetResponse":
        return cls(
            id=preset.id,
            name=preset.name,
            gender=preset.gender,
            region=preset.region,
            style=preset.style,
        )


class TtsModelResponse(DownloadResponse):
    id: str
    name: str
    source: str
    languages: list[str]
    cloning: bool
    gpu_recommended: bool
    sources: list[str]
    presets: list[VoicePresetResponse]

    @classmethod
    def of(cls, model: CatalogModel, download: Download) -> "TtsModelResponse":
        return cls(
            **download_fields(download),
            id=model.id,
            name=model.name,
            source=model.source,
            languages=list(model.languages),
            cloning=model.cloning,
            gpu_recommended=model.gpu_recommended,
            sources=list(model.sources),
            presets=[VoicePresetResponse.of(preset) for preset in model.presets],
        )


class SynthesizeRequest(CamelModel):
    model: str
    text: str
    source: VoiceSource
    language: str = ""
    gender: str = ""
    preset: str = ""
    prompt: str = ""
    reference_path: str = ""

    def to_request(self) -> SynthesisRequest:
        return SynthesisRequest(
            model=self.model,
            text=self.text,
            source=self.source,
            language=self.language,
            gender=self.gender,
            preset=self.preset,
            prompt=self.prompt,
            reference_path=self.reference_path,
        )
