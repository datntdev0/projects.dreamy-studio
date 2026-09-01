import hashlib
import json
import logging
import shutil
import threading
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

MANIFEST_NAME = "manifest.json"
INTERRUPTED_ERROR = "Download interrupted"
CHUNK_SIZE = 1024 * 1024
USER_AGENT = "dreamy-studio-backend"

logger = logging.getLogger("downloads")


class DownloadCancelled(Exception):
    pass


class DownloadBusy(Exception):
    pass


@dataclass(frozen=True)
class Download:
    state: str
    received_bytes: int
    total_bytes: int
    error: str = ""


class DownloadJob:
    def __init__(self, total_bytes: int) -> None:
        self.cancelled = threading.Event()
        self.total_bytes = total_bytes
        self.error = ""
        self.thread: threading.Thread | None = None

    @property
    def running(self) -> bool:
        return self.thread is not None and self.thread.is_alive()

    def check_cancelled(self) -> None:
        if self.cancelled.is_set():
            raise DownloadCancelled


DownloadWorker = Callable[[DownloadJob], dict[str, Any]]


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def directory_size(path: Path) -> int:
    total = 0
    try:
        for item in path.rglob("*"):
            if item.is_file():
                total += item.stat().st_size
    except OSError:
        return total
    return total


def has_files(path: Path) -> bool:
    try:
        return path.is_dir() and any(path.iterdir())
    except OSError:
        return False


def read_manifest(target: Path) -> dict[str, Any] | None:
    try:
        manifest = json.loads((target / MANIFEST_NAME).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return manifest if isinstance(manifest, dict) else None


def write_manifest(target: Path, manifest: dict[str, Any]) -> None:
    partial = target / f"{MANIFEST_NAME}.part"
    partial.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    partial.replace(target / MANIFEST_NAME)


def remove_tree(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)


def describe_error(error: BaseException) -> str:
    return str(error) or type(error).__name__


def open_url(url: str, headers: dict[str, str] | None = None, timeout: float = 60):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    return urllib.request.urlopen(request, timeout=timeout)


def fetch_json(url: str) -> Any:
    with open_url(url, {"Accept": "application/json"}) as response:
        return json.loads(response.read().decode("utf-8"))


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(CHUNK_SIZE):
            digest.update(chunk)
    return digest.hexdigest()


def stream_to_file(url: str, partial: Path, job: DownloadJob) -> None:
    offset = partial.stat().st_size if partial.exists() else 0
    headers = {"Range": f"bytes={offset}-"} if offset else {}
    with open_url(url, headers) as response:
        mode = "ab" if offset and response.status == 206 else "wb"
        with partial.open(mode) as file:
            while chunk := response.read(CHUNK_SIZE):
                job.check_cancelled()
                file.write(chunk)


def fetch_file(url: str, destination: Path, size: int, sha256: str, job: DownloadJob) -> None:
    if destination.is_file() and destination.stat().st_size == size:
        return
    partial = destination.with_name(f"{destination.name}.part")
    if not partial.exists() or partial.stat().st_size < size:
        stream_to_file(url, partial, job)
    if sha256 and file_sha256(partial) != sha256:
        partial.unlink(missing_ok=True)
        raise ValueError(f"Checksum mismatch for {destination.name}")
    partial.replace(destination)


class DownloadSlot:
    def __init__(
        self,
        name: str,
        target: Path,
        estimate: int,
        worker: DownloadWorker,
        staging_dir: Path | None = None,
    ) -> None:
        self.name = name
        self.target = target
        self.estimate = estimate
        self.worker = worker
        self.staging_dir = staging_dir
        self.lock = threading.Lock()
        self.job: DownloadJob | None = None

    @property
    def progress_dir(self) -> Path:
        return self.staging_dir or self.target

    def status(self) -> Download:
        with self.lock:
            return self.snapshot()

    def manifest(self) -> dict[str, Any] | None:
        return read_manifest(self.target)

    def snapshot(self) -> Download:
        job = self.job
        if job is not None and job.running:
            if job.cancelled.is_set():
                return Download("none", 0, self.estimate)
            received = min(directory_size(self.progress_dir), job.total_bytes)
            return Download("downloading", received, job.total_bytes)
        if job is not None and job.error:
            return Download("error", directory_size(self.progress_dir), job.total_bytes, job.error)
        manifest = self.manifest()
        if manifest is not None:
            size = int(manifest.get("totalBytes", self.estimate))
            return Download("installed", size, size)
        if has_files(self.target):
            return Download(
                "error", directory_size(self.progress_dir), self.estimate, INTERRUPTED_ERROR
            )
        return Download("none", 0, self.estimate)

    def start(self) -> Download:
        with self.lock:
            current = self.snapshot()
            if current.state in ("downloading", "installed"):
                return current
            if self.job is not None and self.job.thread is not None:
                self.job.thread.join()
            job = DownloadJob(self.estimate)
            job.thread = threading.Thread(
                target=self.run, args=(job,), name=f"download-{self.name}", daemon=True
            )
            self.job = job
            job.thread.start()
            return self.snapshot()

    def run(self, job: DownloadJob) -> None:
        logger.info("Download %s started", self.name)
        try:
            self.target.mkdir(parents=True, exist_ok=True)
            details = self.worker(job)
            job.check_cancelled()
            write_manifest(
                self.target, {**details, "totalBytes": job.total_bytes, "completedAt": utc_now()}
            )
            if self.staging_dir is not None:
                remove_tree(self.staging_dir)
            logger.info("Download %s completed", self.name)
        except DownloadCancelled:
            logger.info("Download %s cancelled", self.name)
        except Exception as error:
            logger.error("Download %s failed", self.name, exc_info=error)
            job.error = describe_error(error)
        finally:
            if job.cancelled.is_set():
                remove_tree(self.target)

    def cancel(self) -> Download:
        with self.lock:
            job = self.job
            if job is not None and job.running:
                job.cancelled.set()
                return self.snapshot()
            self.job = None
            if self.manifest() is None:
                remove_tree(self.target)
            return self.snapshot()

    def remove(self) -> Download:
        with self.lock:
            job = self.job
            if job is not None and job.running:
                if not job.cancelled.is_set():
                    raise DownloadBusy(self.name)
                return self.snapshot()
            self.job = None
            (self.target / MANIFEST_NAME).unlink(missing_ok=True)
            remove_tree(self.target)
            return self.snapshot()
