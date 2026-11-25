import os
import sys
from dataclasses import dataclass
from pathlib import Path

DATA_DIR_ENV = "DREAMY_BACKEND_DATA_DIR"
DEVICE_ENV = "DREAMY_BACKEND_DEVICE"
WORKER_PYTHON_ENV = "DREAMY_BACKEND_WORKER_PYTHON"
LOG_DIR_ENV = "DREAMY_BACKEND_LOG_DIR"
PORT_ENV = "DREAMY_BACKEND_PORT"
RUN_MODE_ENV = "DREAMY_BACKEND_RUN_MODE"
API_KEY_ENV = "DREAMY_BACKEND_API_KEY"
PYPI_URL_ENV = "DREAMY_BACKEND_PYPI_URL"
NVIDIA_SMI_ENV = "DREAMY_BACKEND_NVIDIA_SMI"
WHEEL_MIRROR_ENV = "DREAMY_BACKEND_WHEEL_MIRROR"
TTS_ENGINE_ENV = "DREAMY_BACKEND_TTS_ENGINE"

DEFAULT_PORT = 8765
DEFAULT_RUN_MODE = "prod"
DEFAULT_LOG_DIR = "logs"
DEFAULT_DATA_DIR = "data"
RUN_MODES = ("dev", "test", "prod")


def optional_path(value: str | None) -> Path | None:
    return Path(value) if value else None


def read_port(value: str | None) -> int:
    if not value:
        return DEFAULT_PORT
    if not value.isdigit() or not 0 < int(value) < 65536:
        raise ValueError(f"{PORT_ENV} must be a port number between 1 and 65535, got {value!r}")
    return int(value)


def read_run_mode(value: str | None) -> str:
    mode = value or DEFAULT_RUN_MODE
    if mode not in RUN_MODES:
        raise ValueError(f"{RUN_MODE_ENV} must be one of {', '.join(RUN_MODES)}, got {mode!r}")
    return mode


@dataclass(frozen=True)
class ServerOptions:
    port: int = DEFAULT_PORT
    run_mode: str = DEFAULT_RUN_MODE
    log_dir: Path = Path(DEFAULT_LOG_DIR)

    @property
    def log_level(self) -> str:
        return "INFO" if self.run_mode == "prod" else "DEBUG"

    @classmethod
    def from_env(cls) -> "ServerOptions":
        return cls(
            port=read_port(os.environ.get(PORT_ENV)),
            run_mode=read_run_mode(os.environ.get(RUN_MODE_ENV)),
            log_dir=Path(os.environ.get(LOG_DIR_ENV) or DEFAULT_LOG_DIR).resolve(),
        )


DEFAULT_PYPI_URL = "https://pypi.org"


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    device: str = "cpu"
    pypi_url: str = DEFAULT_PYPI_URL
    nvidia_smi: str = "nvidia-smi"
    hf_endpoint: str | None = None
    worker_python: str = sys.executable
    wheel_mirror: str | None = None
    log_dir: Path | None = None
    tts_engine: str | None = None
    api_key: str | None = None

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def runtime_dir(self) -> Path:
        return self.data_dir / "runtime"

    @property
    def tts_cache_dir(self) -> Path:
        return self.data_dir / "cache" / "tts"

    @property
    def references_dir(self) -> Path:
        return self.data_dir / "references"

    @property
    def cuda_dir(self) -> Path:
        return self.runtime_dir / "cuda"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data_dir=Path(os.environ.get(DATA_DIR_ENV) or DEFAULT_DATA_DIR).resolve(),
            device=os.environ.get(DEVICE_ENV) or "cpu",
            pypi_url=(os.environ.get(PYPI_URL_ENV) or DEFAULT_PYPI_URL).rstrip("/"),
            nvidia_smi=os.environ.get(NVIDIA_SMI_ENV) or "nvidia-smi",
            hf_endpoint=os.environ.get("HF_ENDPOINT") or None,
            worker_python=os.environ.get(WORKER_PYTHON_ENV) or sys.executable,
            wheel_mirror=os.environ.get(WHEEL_MIRROR_ENV) or None,
            log_dir=optional_path(os.environ.get(LOG_DIR_ENV)),
            tts_engine=os.environ.get(TTS_ENGINE_ENV) or None,
            api_key=os.environ.get(API_KEY_ENV) or None,
        )
