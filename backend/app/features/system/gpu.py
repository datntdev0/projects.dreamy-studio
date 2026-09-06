import logging
import subprocess
import threading
from dataclasses import dataclass

from app.shared.processes import NO_WINDOW_FLAGS

QUERY_ARGS = (
    "--query-gpu=name,memory.total,driver_version",
    "--format=csv,noheader,nounits",
)

logger = logging.getLogger("gpu")


@dataclass(frozen=True)
class Gpu:
    found: bool = False
    name: str = ""
    vram_mb: int = 0
    driver: str = ""


def parse_nvidia_smi(output: str) -> Gpu:
    for line in output.splitlines():
        fields = [field.strip() for field in line.split(",")]
        if len(fields) < 3 or not fields[0]:
            continue
        try:
            vram_mb = int(float(fields[1]))
        except ValueError:
            vram_mb = 0
        return Gpu(found=True, name=fields[0], vram_mb=vram_mb, driver=fields[2])
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

    def scan(self) -> Gpu:
        with self.lock:
            self.cached = query_nvidia_smi(self.executable)
            logger.info("GPU scan: %s", self.cached)
            return self.cached
