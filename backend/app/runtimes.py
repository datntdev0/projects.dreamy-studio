import logging
import shutil
import subprocess
import threading
import zipfile
from functools import cache
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlsplit

from app.catalog import RuntimeVariant, RuntimeWheel
from app.downloads import (
    DownloadJob,
    directory_size,
    fetch_file,
    read_manifest,
    remove_tree,
    utc_now,
    write_manifest,
)
from app.processes import NO_WINDOW_FLAGS

SITE_DIR = "site-packages"
STAGING_NAME = ".wheels"
LIBRARY_SCHEMES = ("purelib", "platlib")
VERSION_SCRIPT = "import sys; print('%d.%d' % sys.version_info[:2])"
LOCK_WAIT_SECONDS = 0.2

logger = logging.getLogger("runtimes")


class RuntimePythonMismatch(Exception):
    pass


@cache
def python_version(executable: str) -> str:
    result = subprocess.run(
        [executable, "-c", VERSION_SCRIPT],
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
        creationflags=NO_WINDOW_FLAGS,
    )
    return result.stdout.strip()


def mirrored_url(url: str, mirror: str | None) -> str:
    if not mirror:
        return url
    parts = urlsplit(url)
    suffix = parts.path + (f"?{parts.query}" if parts.query else "")
    return mirror.rstrip("/") + suffix


def relative_parts(name: str) -> tuple[str, ...]:
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in ("", "..") for part in path.parts) or ":" in name:
        raise ValueError(f"Unsafe path in wheel: {name}")
    return path.parts


def wheel_destination(name: str, target: Path) -> Path | None:
    parts = relative_parts(name)
    if parts[0].endswith(".data"):
        if len(parts) < 3 or parts[1] not in LIBRARY_SCHEMES:
            return None
        parts = parts[2:]
    return target.joinpath(*parts)


def install_wheel(wheel: Path, target: Path, job: DownloadJob) -> None:
    with zipfile.ZipFile(wheel) as archive:
        for member in archive.infolist():
            job.check_cancelled()
            destination = wheel_destination(member.filename, target)
            if destination is None or member.is_dir():
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, destination.open("wb") as output:
                shutil.copyfileobj(source, output)


class RuntimeInstaller:
    def __init__(
        self,
        variant: RuntimeVariant,
        runtime_dir: Path,
        worker_python: str,
        wheel_mirror: str | None,
    ) -> None:
        self.variant = variant
        self.target = runtime_dir / variant.key
        self.staging_dir = self.target / STAGING_NAME
        self.worker_python = worker_python
        self.wheel_mirror = wheel_mirror
        self.lock = threading.Lock()

    @property
    def key(self) -> str:
        return self.variant.key

    @property
    def size_bytes(self) -> int:
        return self.variant.size_bytes

    @property
    def site_dir(self) -> Path:
        return self.target / SITE_DIR

    def installed(self) -> bool:
        return read_manifest(self.target) is not None

    def missing_bytes(self) -> int:
        return 0 if self.installed() else self.size_bytes

    def progress_bytes(self) -> int:
        if self.installed():
            return self.size_bytes
        return min(directory_size(self.staging_dir), self.size_bytes)

    def check_python(self) -> None:
        actual = python_version(self.worker_python)
        if actual != self.variant.python:
            raise RuntimePythonMismatch(
                f"Runtime {self.key} requires Python {self.variant.python}, found {actual}"
            )

    def acquire(self, job: DownloadJob) -> None:
        while not self.lock.acquire(timeout=LOCK_WAIT_SECONDS):
            job.check_cancelled()

    def ensure(self, job: DownloadJob) -> None:
        self.acquire(job)
        try:
            if not self.installed():
                self.install(job)
        finally:
            self.lock.release()

    def install(self, job: DownloadJob) -> None:
        self.check_python()
        logger.info("Runtime %s install started", self.key)
        remove_tree(self.site_dir)
        self.staging_dir.mkdir(parents=True, exist_ok=True)
        for wheel in self.variant.wheels:
            job.check_cancelled()
            self.fetch(wheel, job)
        for wheel in self.variant.wheels:
            install_wheel(self.staging_dir / wheel.filename, self.site_dir, job)
        write_manifest(self.target, self.manifest())
        remove_tree(self.staging_dir)
        logger.info("Runtime %s installed", self.key)

    def fetch(self, wheel: RuntimeWheel, job: DownloadJob) -> None:
        url = mirrored_url(wheel.url, self.wheel_mirror)
        fetch_file(url, self.staging_dir / wheel.filename, wheel.size, wheel.sha256, job)

    def manifest(self) -> dict[str, Any]:
        return {
            "runtime": self.variant.runtime,
            "variant": self.variant.variant,
            "python": self.variant.python,
            "packages": [
                {"name": wheel.name, "version": wheel.version} for wheel in self.variant.wheels
            ],
            "totalBytes": self.size_bytes,
            "completedAt": utc_now(),
        }

    def remove(self) -> None:
        with self.lock:
            remove_tree(self.target)
            logger.info("Runtime %s removed", self.key)
