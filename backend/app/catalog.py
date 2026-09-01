import json
from dataclasses import dataclass
from functools import cache
from importlib import resources
from typing import Any


@dataclass(frozen=True)
class CatalogModel:
    id: str
    name: str
    source: str
    languages: tuple[str, ...]
    cloning: bool
    gpu_recommended: bool
    size_bytes: int


@dataclass(frozen=True)
class CudaPackage:
    name: str
    version: str


@dataclass(frozen=True)
class CudaCatalog:
    version: str
    size_bytes: int
    packages: tuple[CudaPackage, ...]


@cache
def read_catalog() -> dict[str, Any]:
    return json.loads(resources.files("app").joinpath("catalog.json").read_text(encoding="utf-8"))


def model_catalog() -> tuple[CatalogModel, ...]:
    return tuple(
        CatalogModel(
            id=entry["id"],
            name=entry["name"],
            source=entry["source"],
            languages=tuple(entry["languages"]),
            cloning=bool(entry["cloning"]),
            gpu_recommended=bool(entry["gpuRecommended"]),
            size_bytes=int(entry["sizeBytes"]),
        )
        for entry in read_catalog()["models"]
    )


def cuda_catalog() -> CudaCatalog:
    entry = read_catalog()["cuda"]
    return CudaCatalog(
        version=entry["version"],
        size_bytes=int(entry["sizeBytes"]),
        packages=tuple(CudaPackage(item["name"], item["version"]) for item in entry["packages"]),
    )
