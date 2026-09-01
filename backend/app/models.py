from pathlib import Path
from typing import Any

from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.hf_api import RepoFile
from huggingface_hub.utils import tqdm as hf_tqdm

from app.catalog import CatalogModel
from app.downloads import Download, DownloadCancelled, DownloadJob, DownloadSlot

REVISION = "main"


class CancellableProgress(hf_tqdm):
    job: DownloadJob | None = None

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs["disable"] = True
        super().__init__(*args, **kwargs)

    def update(self, n: float | None = 1) -> bool | None:
        if self.job is not None and self.job.cancelled.is_set():
            raise DownloadCancelled
        return super().update(n)


def progress_class(job: DownloadJob) -> type[CancellableProgress]:
    return type("JobProgress", (CancellableProgress,), {"job": job})


class ModelDownloader:
    def __init__(self, model: CatalogModel, models_dir: Path, endpoint: str | None) -> None:
        self.model = model
        self.endpoint = endpoint
        self.target = models_dir / model.id
        self.slot = DownloadSlot(model.id, self.target, model.size_bytes, self.download)

    def status(self) -> Download:
        return self.slot.status()

    def list_files(self) -> list[RepoFile]:
        api = HfApi(endpoint=self.endpoint)
        tree = api.list_repo_tree(self.model.source, recursive=True, revision=REVISION)
        return [item for item in tree if isinstance(item, RepoFile)]

    def remove_stale_parts(self) -> None:
        for stale in (self.target / ".cache").rglob("*.incomplete"):
            stale.unlink(missing_ok=True)

    def download(self, job: DownloadJob) -> dict[str, Any]:
        self.remove_stale_parts()
        files = self.list_files()
        job.total_bytes = sum(item.size for item in files) or self.model.size_bytes
        progress = progress_class(job)
        for item in files:
            job.check_cancelled()
            hf_hub_download(
                self.model.source,
                item.path,
                revision=REVISION,
                local_dir=self.target,
                endpoint=self.endpoint,
                tqdm_class=progress,
            )
        return {
            "id": self.model.id,
            "source": self.model.source,
            "files": [item.path for item in files],
        }
