import platform
import sys
from dataclasses import dataclass
from fnmatch import fnmatch

MACHINE_ALIASES = {"amd64": "x86_64", "x64": "x86_64", "aarch64": "arm64"}
GLIBC_MINOR = 28
LEGACY_MANYLINUX = ("manylinux2014", "manylinux2010", "manylinux1")


def manylinux_tags(arch: str) -> tuple[str, ...]:
    modern = [f"manylinux_2_{minor}_{arch}" for minor in range(GLIBC_MINOR, 4, -1)]
    return (*modern, *(f"{name}_{arch}" for name in LEGACY_MANYLINUX))


@dataclass(frozen=True)
class Platform:
    name: str
    system: str
    pip_tags: tuple[str, ...]
    wheel_tags: tuple[str, ...]
    library_dir: str
    library_path_env: str

    def accepts_wheel(self, filename: str) -> bool:
        tags = filename.removesuffix(".whl").rsplit("-", 1)[-1].split(".")
        return any(fnmatch(tag, pattern) for tag in tags for pattern in self.wheel_tags)


WINDOWS_X64 = Platform(
    name="win_amd64",
    system="win32",
    pip_tags=("win_amd64",),
    wheel_tags=("win_amd64",),
    library_dir="bin",
    library_path_env="PATH",
)
LINUX_X64 = Platform(
    name="linux_x86_64",
    system="linux",
    pip_tags=manylinux_tags("x86_64"),
    wheel_tags=manylinux_tags("x86_64"),
    library_dir="lib",
    library_path_env="LD_LIBRARY_PATH",
)
PLATFORMS = {item.name: item for item in (WINDOWS_X64, LINUX_X64)}


def normalized_machine(machine: str) -> str:
    value = machine.lower()
    return MACHINE_ALIASES.get(value, value)


def platform_name(system: str, machine: str) -> str:
    arch = normalized_machine(machine)
    if system == "win32":
        return "win_amd64" if arch == "x86_64" else f"win_{arch}"
    if system.startswith("linux"):
        return f"linux_{arch}"
    if system == "darwin":
        return f"macos_{arch}"
    return f"{system}_{arch}"


def host_platform_name() -> str:
    return platform_name(sys.platform, platform.machine())


def current_platform() -> Platform | None:
    return PLATFORMS.get(host_platform_name())
