import argparse
import json
import operator
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

RUNTIMES_DIR = Path(__file__).resolve().parents[1] / "app" / "runtimes"
PLATFORM = "win_amd64"
USER_AGENT = "dreamy-studio-lock"


def pip_report(
    requirements: list[str], python: str, indexes: list[str], extras: list[str], no_deps: bool
) -> Any:
    with tempfile.TemporaryDirectory() as work:
        report = Path(work) / "report.json"
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
            "--platform",
            PLATFORM,
            "--python-version",
            python,
            "--implementation",
            "cp",
            "--target",
            str(Path(work) / "target"),
            "--report",
            str(report),
            *requirements,
        ]
        if no_deps:
            command.append("--no-deps")
        for index in indexes:
            command += ["--index-url", index]
        for extra in extras:
            command += ["--extra-index-url", extra]
        subprocess.run(command, check=True)
        return json.loads(report.read_text(encoding="utf-8"))


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
    report = pip_report(requirements, args.python, args.index_url, args.extra_index_url, no_deps)
    return report["install"]


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
        "platform": PLATFORM,
        "wheels": wheels,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Pin a worker runtime to exact wheels")
    parser.add_argument("runtime")
    parser.add_argument("variant", choices=("cpu", "cuda"))
    parser.add_argument("--requirements", type=Path, required=True)
    parser.add_argument("--standalone", action="append", default=[])
    parser.add_argument("--python", default="3.12")
    parser.add_argument("--index-url", action="append", default=[])
    parser.add_argument("--extra-index-url", action="append", default=[])
    args = parser.parse_args()
    lock = build_lock(args)
    target = RUNTIMES_DIR / f"{args.runtime}-{args.variant}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8", newline="\n")
    total = sum(wheel["size"] for wheel in lock["wheels"])
    print(f"{target.name}: {len(lock['wheels'])} wheels, {total} bytes")


if __name__ == "__main__":
    main()
