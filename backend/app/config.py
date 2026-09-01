import os
from dataclasses import dataclass
from pathlib import Path

DATA_DIR_ENV = "DREAMY_BACKEND_DATA_DIR"
DEVICE_ENV = "DREAMY_BACKEND_DEVICE"
DEFAULT_PYPI_URL = "https://pypi.org"


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    device: str = "cpu"
    pypi_url: str = DEFAULT_PYPI_URL
    nvidia_smi: str = "nvidia-smi"
    hf_endpoint: str | None = None

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def cuda_dir(self) -> Path:
        return self.data_dir / "runtime" / "cuda"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data_dir=Path(os.environ.get(DATA_DIR_ENV, "data")).resolve(),
            device=os.environ.get(DEVICE_ENV, "cpu"),
            pypi_url=os.environ.get("DREAMY_PYPI_URL", DEFAULT_PYPI_URL).rstrip("/"),
            nvidia_smi=os.environ.get("DREAMY_NVIDIA_SMI", "nvidia-smi"),
            hf_endpoint=os.environ.get("HF_ENDPOINT") or None,
        )
