import logging
import os
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.shared.catalog import CudaCatalog, CudaPackage
from app.shared.downloads import DownloadJob, DownloadSlot, fetch_file, fetch_json, read_manifest
from app.shared.platforms import Platform, current_platform

STAGING_NAME = ".wheels"

logger = logging.getLogger("cuda")
dll_directories: list[Any] = []


@dataclass(frozen=True)
class Wheel:
    filename: str
    url: str
    size: int
    sha256: str


def cuda_installed(cuda_dir: Path) -> bool:
    return read_manifest(cuda_dir) is not None


def cuda_library_dirs(cuda_dir: Path, target: Platform) -> list[Path]:
    return sorted(path for path in cuda_dir.rglob(target.library_dir) if path.is_dir())


def prepend_search_path(name: str, directories: list[Path]) -> None:
    existing = [os.environ[name]] if os.environ.get(name) else []
    os.environ[name] = os.pathsep.join([*(str(path) for path in directories), *existing])


def configure_dll_search(cuda_dir: Path, target: Platform | None = None) -> list[Path]:
    target = target or current_platform()
    if target is None or not cuda_installed(cuda_dir):
        return []
    directories = cuda_library_dirs(cuda_dir, target)
    if not directories:
        return []
    for directory in directories:
        if hasattr(os, "add_dll_directory"):
            dll_directories.append(os.add_dll_directory(str(directory)))
    prepend_search_path(target.library_path_env, directories)
    logger.info("CUDA library directories: %s", [str(directory) for directory in directories])
    return directories


def resolve_wheel(pypi_url: str, package: CudaPackage, target: Platform) -> Wheel:
    release = fetch_json(f"{pypi_url}/pypi/{package.name}/{package.version}/json")
    for item in release.get("urls", []):
        if target.accepts_wheel(item.get("filename", "")):
            return Wheel(
                filename=item["filename"],
                url=item["url"],
                size=int(item["size"]),
                sha256=item.get("digests", {}).get("sha256", ""),
            )
    raise ValueError(f"No {target.name} wheel for {package.name} {package.version}")


def extract_wheel(wheel: Path, target: Path, job: DownloadJob) -> None:
    with zipfile.ZipFile(wheel) as archive:
        for member in archive.infolist():
            job.check_cancelled()
            if ".dist-info/" not in member.filename:
                archive.extract(member, target)


class CudaInstaller:
    def __init__(self, cuda_dir: Path, pypi_url: str, catalog: CudaCatalog) -> None:
        self.cuda_dir = cuda_dir
        self.pypi_url = pypi_url
        self.catalog = catalog
        self.staging_dir = cuda_dir / STAGING_NAME
        self.slot = DownloadSlot(
            "cuda", cuda_dir, catalog.size_bytes, self.install, staging_dir=self.staging_dir
        )

    def version(self) -> str:
        manifest = self.slot.manifest() or {}
        return str(manifest.get("version", self.catalog.version))

    def resolve_wheels(self) -> list[Wheel]:
        target = self.catalog.platform
        if not self.catalog.packages:
            return []
        if target is None:
            raise ValueError("CUDA runtime is not available on this platform")
        return [resolve_wheel(self.pypi_url, package, target) for package in self.catalog.packages]

    def install(self, job: DownloadJob) -> dict[str, Any]:
        wheels = self.resolve_wheels()
        job.total_bytes = sum(wheel.size for wheel in wheels)
        self.staging_dir.mkdir(parents=True, exist_ok=True)
        for wheel in wheels:
            job.check_cancelled()
            fetch_file(wheel.url, self.staging_dir / wheel.filename, wheel.size, wheel.sha256, job)
        for wheel in wheels:
            extract_wheel(self.staging_dir / wheel.filename, self.cuda_dir, job)
        return {
            "version": self.catalog.version,
            "packages": [
                {"name": package.name, "version": package.version}
                for package in self.catalog.packages
            ],
        }
