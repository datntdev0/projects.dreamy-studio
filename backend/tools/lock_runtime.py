import argparse
import json
import operator
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

from app.shared.platforms import PLATFORMS, Platform

RUNTIMES_DIR = Path(__file__).resolve().parents[1] / "app" / "shared" / "resources" / "runtimes"
USER_AGENT = "dreamy-studio-lock"


def lock_path(platform_name: str, runtime: str, variant: str) -> Path:
    return RUNTIMES_DIR / platform_name / f"{runtime}-{variant}.json"


def ensure_host(target: Platform) -> None:
    if not sys.platform.startswith(target.system):
        raise SystemExit(
            f"Lock {target.name} on a {target.system} host: pip evaluates environment markers "
            f"against the running interpreter, so a {sys.platform} host resolves the wrong "
            "dependencies"
        )


def platform_options(target: Platform) -> list[str]:
    return [option for tag in target.pip_tags for option in ("--platform", tag)]


def pip_command(
    args: argparse.Namespace, work: Path, requirements: list[str], no_deps: bool
) -> list[str]:
    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--dry-run",
        "--ignore-installed",
        "--quiet",
        "--disable-pip-version-check",
        "--only-binary=:all:",
        *platform_options(PLATFORMS[args.platform]),
        "--python-version",
        args.python,
        "--implementation",
        "cp",
        "--target",
        str(work / "target"),
        "--report",
        str(work / "report.json"),
        *requirements,
    ]
    if no_deps:
        command.append("--no-deps")
    if args.constraint:
        command += ["--constraint", str(args.constraint)]
    for index in args.index_url:
        command += ["--index-url", index]
    for extra in args.extra_index_url:
        command += ["--extra-index-url", extra]
    return command


def pip_report(args: argparse.Namespace, requirements: list[str], no_deps: bool) -> Any:
    with tempfile.TemporaryDirectory() as directory:
        work = Path(directory)
        subprocess.run(pip_command(args, work, requirements, no_deps), check=True)
        return json.loads((work / "report.json").read_text(encoding="utf-8"))


def remote_size(url: str) -> int:
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return int(response.headers["Content-Length"])


def sha256_of(archive: dict[str, Any]) -> str:
    hashes = archive.get("hashes") or {}
    if "sha256" in hashes:
        return hashes["sha256"]
    algorithm, _, value = str(archive.get("hash", "")).partition("=")
    if algorithm == "sha256" and value:
        return value
    raise ValueError("Wheel without sha256 hash")


def lock_entry(item: dict[str, Any]) -> dict[str, Any]:
    info = item["download_info"]
    url = info["url"].split("#", 1)[0]
    return {
        "name": item["metadata"]["name"],
        "version": item["metadata"]["version"],
        "url": url,
        "sha256": sha256_of(info.get("archive_info", {})),
        "size": remote_size(url),
    }


def resolve(args: argparse.Namespace, requirements: list[str], no_deps: bool) -> list[Any]:
    if not requirements:
        return []
    return pip_report(args, requirements, no_deps)["install"]


def build_lock(args: argparse.Namespace) -> dict[str, Any]:
    items = [
        *resolve(args, ["-r", str(args.requirements)], no_deps=False),
        *resolve(args, args.standalone, no_deps=True),
    ]
    wheels = sorted((lock_entry(item) for item in items), key=operator.itemgetter("name"))
    return {
        "runtime": args.runtime,
        "variant": args.variant,
        "python": args.python,
        "platform": PLATFORMS[args.platform].pip_tags[0],
        "wheels": wheels,
    }


def write_alignment(args: argparse.Namespace, directory: Path) -> Path:
    source = json.loads(
        lock_path(args.align_with, args.runtime, args.variant).read_text(encoding="utf-8")
    )
    constraint = directory / "constraints.txt"
    lines = [f"{wheel['name']}=={wheel['version']}" for wheel in source["wheels"]]
    constraint.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return constraint


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pin a worker runtime to exact wheels")
    parser.add_argument("runtime")
    parser.add_argument("variant", choices=("cpu", "cuda"))
    parser.add_argument("--platform", choices=sorted(PLATFORMS), required=True)
    parser.add_argument("--requirements", type=Path, required=True)
    parser.add_argument("--standalone", action="append", default=[])
    parser.add_argument("--python", default="3.12")
    parser.add_argument("--index-url", action="append", default=[])
    parser.add_argument("--extra-index-url", action="append", default=[])
    parser.add_argument("--constraint", type=Path)
    parser.add_argument("--align-with", choices=sorted(PLATFORMS))
    return parser.parse_args()


def write_lock(args: argparse.Namespace) -> None:
    lock = build_lock(args)
    target = lock_path(args.platform, args.runtime, args.variant)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8", newline="\n")
    total = sum(wheel["size"] for wheel in lock["wheels"])
    print(f"{args.platform}/{target.name}: {len(lock['wheels'])} wheels, {total} bytes")


def main() -> None:
    args = parse_args()
    ensure_host(PLATFORMS[args.platform])
    with tempfile.TemporaryDirectory() as directory:
        if args.align_with:
            args.constraint = write_alignment(args, Path(directory))
        write_lock(args)


if __name__ == "__main__":
    main()
