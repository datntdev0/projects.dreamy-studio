from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.shared.downloads import Download

DownloadState = Literal["none", "downloading", "installed", "error"]
Device = Literal["cpu", "cuda"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


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
