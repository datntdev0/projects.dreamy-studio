from app.shared.catalog import CatalogModel, VoicePreset
from app.shared.downloads import Download
from app.shared.schemas import CamelModel, DownloadResponse, download_fields


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
    license: str
    commercial_use: bool

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
            license=model.license,
            commercial_use=model.commercial_use,
        )
