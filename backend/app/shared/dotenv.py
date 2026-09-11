import os
from collections.abc import Iterator, MutableMapping
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = BACKEND_ROOT / ".env"
QUOTES = ('"', "'")


def unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in QUOTES:
        return value[1:-1]
    return value


def parse_line(line: str) -> tuple[str, str] | None:
    text = line.strip()
    if not text or text.startswith("#") or "=" not in text:
        return None
    name, value = text.removeprefix("export ").split("=", 1)
    name = name.strip()
    if not name:
        return None
    return name, unquote(value.strip())


def parse_env_file(path: Path) -> Iterator[tuple[str, str]]:
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        entry = parse_line(line)
        if entry:
            yield entry


def load_env_file(
    path: Path = DEFAULT_ENV_FILE, environment: MutableMapping[str, str] = os.environ
) -> list[str]:
    if not path.is_file():
        return []
    loaded = []
    for name, value in parse_env_file(path):
        if name not in environment:
            environment[name] = value
            loaded.append(name)
    return loaded
