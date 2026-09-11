import json
from dataclasses import dataclass, field
from functools import cache
from importlib import resources
from typing import Any
from urllib.parse import unquote

from app.shared.platforms import Platform, current_platform

CPU_VARIANT = "cpu"
CUDA_VARIANT = "cuda"
CU126_VARIANT = "cu126"


@dataclass(frozen=True)
class VoicePreset:
    id: str
    name: str
    gender: str
    region: str = ""
    style: str = ""
    prompt: str = ""


@dataclass(frozen=True)
class ExtraSource:
    source: str
    dir: str
    size_bytes: int


@dataclass(frozen=True)
class CatalogModel:
    id: str
    name: str
    source: str
    languages: tuple[str, ...]
    cloning: bool
    gpu_recommended: bool
    size_bytes: int
    runtime: str | None = None
    engine: str | None = None
    engine_options: dict[str, Any] = field(default_factory=dict)
    sources: tuple[str, ...] = ()
    presets: tuple[VoicePreset, ...] = ()
    extra_sources: tuple[ExtraSource, ...] = ()
    license: str = ""
    commercial_use: bool = True


@dataclass(frozen=True)
class RuntimeWheel:
    name: str
    version: str
    url: str
    sha256: str
    size: int

    @property
    def filename(self) -> str:
        return unquote(self.url.rsplit("/", 1)[-1].split("#", 1)[0])


@dataclass(frozen=True)
class RuntimeVariant:
    runtime: str
    variant: str
    python: str
    wheels: tuple[RuntimeWheel, ...]

    @property
    def key(self) -> str:
        return f"{self.runtime}-{self.variant}"

    @property
    def size_bytes(self) -> int:
        return sum(wheel.size for wheel in self.wheels)


@dataclass(frozen=True)
class CatalogRuntime:
    id: str
    variants: dict[str, RuntimeVariant]

    def variant_for(self, name: str) -> RuntimeVariant:
        return self.variants.get(name) or self.variants[CPU_VARIANT]


@dataclass(frozen=True)
class Catalog:
    models: tuple[CatalogModel, ...]
    runtimes: dict[str, CatalogRuntime] = field(default_factory=dict)


def resource_exists(path: str) -> bool:
    return resources.files("app.shared.resources").joinpath(path).is_file()


def read_resource(path: str) -> Any:
    return json.loads(
        resources.files("app.shared.resources").joinpath(path).read_text(encoding="utf-8")
    )


def runtime_lock_path(target: Platform, name: str) -> str:
    return f"runtimes/{target.name}/{name}.json"


@cache
def read_catalog() -> dict[str, Any]:
    return read_resource("catalog.json")


def parse_preset(entry: dict[str, Any]) -> VoicePreset:
    return VoicePreset(
        id=entry["id"],
        name=entry["name"],
        gender=entry["gender"],
        region=entry.get("region", ""),
        style=entry.get("style", ""),
        prompt=entry.get("prompt", ""),
    )


def parse_extra_source(entry: dict[str, Any]) -> ExtraSource:
    return ExtraSource(source=entry["source"], dir=entry["dir"], size_bytes=int(entry["sizeBytes"]))


def parse_model(entry: dict[str, Any]) -> CatalogModel:
    return CatalogModel(
        id=entry["id"],
        name=entry["name"],
        source=entry["source"],
        languages=tuple(entry["languages"]),
        cloning=bool(entry["cloning"]),
        gpu_recommended=bool(entry["gpuRecommended"]),
        size_bytes=int(entry["sizeBytes"]),
        runtime=entry.get("runtime"),
        engine=entry.get("engine"),
        engine_options=dict(entry.get("engineOptions", {})),
        sources=tuple(entry.get("sources", [])),
        presets=tuple(parse_preset(item) for item in entry.get("presets", [])),
        extra_sources=tuple(parse_extra_source(item) for item in entry.get("extraSources", [])),
        license=entry.get("license", ""),
        commercial_use=bool(entry.get("commercialUse", True)),
    )


def parse_wheel(entry: dict[str, Any]) -> RuntimeWheel:
    return RuntimeWheel(
        name=entry["name"],
        version=entry["version"],
        url=entry["url"],
        sha256=entry["sha256"],
        size=int(entry["size"]),
    )


def parse_variant(runtime: str, variant: str, lock: dict[str, Any]) -> RuntimeVariant:
    return RuntimeVariant(
        runtime=runtime,
        variant=variant,
        python=lock["python"],
        wheels=tuple(parse_wheel(item) for item in lock["wheels"]),
    )


def parse_runtime(entry: dict[str, Any], target: Platform) -> CatalogRuntime | None:
    paths = {
        variant: runtime_lock_path(target, name) for variant, name in entry["variants"].items()
    }
    variants = {
        variant: parse_variant(entry["id"], variant, read_resource(path))
        for variant, path in paths.items()
        if resource_exists(path)
    }
    if CPU_VARIANT not in variants:
        return None
    return CatalogRuntime(id=entry["id"], variants=variants)


def model_catalog() -> tuple[CatalogModel, ...]:
    return tuple(parse_model(entry) for entry in read_catalog()["models"])


def runtime_catalog(target: Platform | None = None) -> dict[str, CatalogRuntime]:
    target = target or current_platform()
    if target is None:
        return {}
    entries = read_catalog().get("runtimes", [])
    runtimes = (parse_runtime(entry, target) for entry in entries)
    return {runtime.id: runtime for runtime in runtimes if runtime is not None}


def supported_models(
    models: tuple[CatalogModel, ...], runtimes: dict[str, CatalogRuntime]
) -> tuple[CatalogModel, ...]:
    return tuple(model for model in models if model.runtime is None or model.runtime in runtimes)


def load_catalog(target: Platform | None = None) -> Catalog:
    runtimes = runtime_catalog(target)
    return Catalog(
        models=supported_models(model_catalog(), runtimes),
        runtimes=runtimes,
    )
