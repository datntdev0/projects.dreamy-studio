import logging
import subprocess
import threading
from dataclasses import dataclass

from app.shared.processes import NO_WINDOW_FLAGS

QUERY_ARGS = (
    "--query-gpu=name,memory.total,driver_version,compute_cap",
    "--format=csv,noheader,nounits",
)

MIN_CUDA_CAPABILITY = (7, 0)

logger = logging.getLogger("gpu")


def parse_capability(value: str) -> tuple[int, int] | None:
    major, _, minor = value.partition(".")
    if not major.isdigit() or not minor.isdigit():
        return None
    return int(major), int(minor)


@dataclass(frozen=True)
class Gpu:
    found: bool = False
    name: str = ""
    vram_mb: int = 0
    driver: str = ""
    compute_capability: str = ""

    @property
    def cuda_supported(self) -> bool:
        capability = parse_capability(self.compute_capability)
        return self.found and capability is not None and capability >= MIN_CUDA_CAPABILITY


def parse_nvidia_smi(output: str) -> Gpu:
    for line in output.splitlines():
        fields = [field.strip() for field in line.split(",")]
        if len(fields) < 4 or not fields[0]:
            continue
        try:
            vram_mb = int(float(fields[1]))
        except ValueError:
            vram_mb = 0
        return Gpu(
            found=True,
            name=fields[0],
            vram_mb=vram_mb,
            driver=fields[2],
            compute_capability=fields[3],
        )
    return Gpu()


def query_nvidia_smi(executable: str) -> Gpu:
    try:
        result = subprocess.run(
            [executable, *QUERY_ARGS],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
            creationflags=NO_WINDOW_FLAGS,
        )
    except (OSError, subprocess.SubprocessError) as error:
        logger.info("nvidia-smi is not available: %s", error)
        return Gpu()
    if result.returncode != 0:
        logger.info("nvidia-smi exited with %s: %s", result.returncode, result.stderr.strip())
        return Gpu()
    return parse_nvidia_smi(result.stdout)


class GpuDetector:
    def __init__(self, executable: str) -> None:
        self.executable = executable
        self.lock = threading.Lock()
        self.cached: Gpu | None = None

    def get(self) -> Gpu:
        with self.lock:
            if self.cached is None:
                self.cached = query_nvidia_smi(self.executable)
            return self.cached
