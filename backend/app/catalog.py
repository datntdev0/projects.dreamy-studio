import json
from dataclasses import dataclass, field
from functools import cache
from importlib import resources
from typing import Any

CPU_VARIANT = "cpu"
CUDA_VARIANT = "cuda"


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


@dataclass(frozen=True)
class CudaPackage:
    name: str
    version: str


@dataclass(frozen=True)
class CudaCatalog:
    version: str
    size_bytes: int
    packages: tuple[CudaPackage, ...]


@dataclass(frozen=True)
class RuntimeWheel:
    name: str
    version: str
    url: str
    sha256: str
    size: int

    @property
    def filename(self) -> str:
        return self.url.rsplit("/", 1)[-1].split("#", 1)[0]


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

    def variant_for(self, device: str) -> RuntimeVariant:
        if device == CUDA_VARIANT and CUDA_VARIANT in self.variants:
            return self.variants[CUDA_VARIANT]
        return self.variants[CPU_VARIANT]


@dataclass(frozen=True)
class Catalog:
    models: tuple[CatalogModel, ...]
    cuda: CudaCatalog
    runtimes: dict[str, CatalogRuntime] = field(default_factory=dict)


def read_resource(path: str) -> Any:
    return json.loads(resources.files("app").joinpath(path).read_text(encoding="utf-8"))


@cache
def read_catalog() -> dict[str, Any]:
    return read_resource("catalog.json")


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


def parse_runtime(entry: dict[str, Any]) -> CatalogRuntime:
    return CatalogRuntime(
        id=entry["id"],
        variants={
            variant: parse_variant(entry["id"], variant, read_resource(path))
            for variant, path in entry["variants"].items()
        },
    )


def model_catalog() -> tuple[CatalogModel, ...]:
    return tuple(parse_model(entry) for entry in read_catalog()["models"])


def cuda_catalog() -> CudaCatalog:
    entry = read_catalog()["cuda"]
    return CudaCatalog(
        version=entry["version"],
        size_bytes=int(entry["sizeBytes"]),
        packages=tuple(CudaPackage(item["name"], item["version"]) for item in entry["packages"]),
    )


def runtime_catalog() -> dict[str, CatalogRuntime]:
    return {
        runtime.id: runtime
        for runtime in (parse_runtime(entry) for entry in read_catalog().get("runtimes", []))
    }


def load_catalog() -> Catalog:
    return Catalog(models=model_catalog(), cuda=cuda_catalog(), runtimes=runtime_catalog())
