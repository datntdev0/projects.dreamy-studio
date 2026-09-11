import os
import sys
from dataclasses import dataclass
from pathlib import Path

DATA_DIR_ENV = "DREAMY_BACKEND_DATA_DIR"
DEVICE_ENV = "DREAMY_BACKEND_DEVICE"
WORKER_PYTHON_ENV = "DREAMY_BACKEND_WORKER_PYTHON"
PORT_ENV = "DREAMY_BACKEND_PORT"
RUN_MODE_ENV = "DREAMY_BACKEND_RUN_MODE"
API_KEY_ENV = "DREAMY_BACKEND_API_KEY"
NVIDIA_SMI_ENV = "DREAMY_BACKEND_NVIDIA_SMI"
WHEEL_MIRROR_ENV = "DREAMY_BACKEND_WHEEL_MIRROR"
TTS_ENGINE_ENV = "DREAMY_BACKEND_TTS_ENGINE"
WORKERS_ENV = "DREAMY_BACKEND_WORKERS"

DEFAULT_PORT = 8765
DEFAULT_RUN_MODE = "prod"
DEFAULT_DATA_DIR = "data"
LOGS_DIR = "logs"
DEFAULT_WORKERS = 1
MAX_WORKERS = 8
RUN_MODES = ("dev", "test", "prod")
DEVICES = ("cpu", "cuda")


def read_data_dir(value: str | None) -> Path:
    return Path(value or DEFAULT_DATA_DIR).resolve()


def read_port(value: str | None) -> int:
    if not value:
        return DEFAULT_PORT
    if not value.isdigit() or not 0 < int(value) < 65536:
        raise ValueError(f"{PORT_ENV} must be a port number between 1 and 65535, got {value!r}")
    return int(value)


def read_workers(value: str | None) -> int:
    if not value:
        return DEFAULT_WORKERS
    if not value.isdigit() or not 0 < int(value) <= MAX_WORKERS:
        raise ValueError(f"{WORKERS_ENV} must be between 1 and {MAX_WORKERS}, got {value!r}")
    return int(value)


def read_device(value: str | None) -> str | None:
    if not value:
        return None
    if value not in DEVICES:
        raise ValueError(f"{DEVICE_ENV} must be one of {', '.join(DEVICES)}, got {value!r}")
    return value


def read_run_mode(value: str | None) -> str:
    mode = value or DEFAULT_RUN_MODE
    if mode not in RUN_MODES:
        raise ValueError(f"{RUN_MODE_ENV} must be one of {', '.join(RUN_MODES)}, got {mode!r}")
    return mode


@dataclass(frozen=True)
class ServerOptions:
    port: int = DEFAULT_PORT
    run_mode: str = DEFAULT_RUN_MODE
    data_dir: Path = Path(DEFAULT_DATA_DIR)

    @property
    def log_dir(self) -> Path:
        return self.data_dir / LOGS_DIR

    @property
    def log_level(self) -> str:
        return "INFO" if self.run_mode == "prod" else "DEBUG"

    @classmethod
    def from_env(cls) -> "ServerOptions":
        return cls(
            port=read_port(os.environ.get(PORT_ENV)),
            run_mode=read_run_mode(os.environ.get(RUN_MODE_ENV)),
            data_dir=read_data_dir(os.environ.get(DATA_DIR_ENV)),
        )


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    device: str | None = None
    nvidia_smi: str = "nvidia-smi"
    hf_endpoint: str | None = None
    worker_python: str = sys.executable
    wheel_mirror: str | None = None
    tts_engine: str | None = None
    api_key: str | None = None
    workers: int = DEFAULT_WORKERS

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def runtime_dir(self) -> Path:
        return self.data_dir / "runtime"

    @property
    def caches_dir(self) -> Path:
        return self.data_dir / "caches"

    @property
    def tts_cache_dir(self) -> Path:
        return self.caches_dir / "tts"

    @property
    def log_dir(self) -> Path:
        return self.data_dir / LOGS_DIR

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data_dir=read_data_dir(os.environ.get(DATA_DIR_ENV)),
            device=read_device(os.environ.get(DEVICE_ENV)),
            nvidia_smi=os.environ.get(NVIDIA_SMI_ENV) or "nvidia-smi",
            hf_endpoint=os.environ.get("HF_ENDPOINT") or None,
            worker_python=os.environ.get(WORKER_PYTHON_ENV) or sys.executable,
            wheel_mirror=os.environ.get(WHEEL_MIRROR_ENV) or None,
            tts_engine=os.environ.get(TTS_ENGINE_ENV) or None,
            api_key=os.environ.get(API_KEY_ENV) or None,
            workers=read_workers(os.environ.get(WORKERS_ENV)),
        )
