import asyncio
import hashlib
import io
import json
import os
import re
import sys
import tempfile
import threading
import time
import unittest
import zipfile
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI

GPU_LINE = "NVIDIA GeForce RTX 4090, 24564, 566.03"
COMMIT = "0123456789abcdef0123456789abcdef01234567"
TREE_PATH = re.compile(r"^/api/models/(?P<repo>[^/]+/[^/]+)/tree/[^/?]+")
RESOLVE_PATH = re.compile(r"^/(?P<repo>[^/]+/[^/]+)/resolve/[^/]+/(?P<file>[^?]+)")
PYPI_PATH = re.compile(r"^/pypi/(?P<name>[^/]+)/(?P<version>[^/]+)/json$")
WHEEL_PATH = re.compile(r"^/files/(?P<file>[^/?]+)$")


class AsgiCall:
    def __init__(self, method: str, path: str, body: bytes = b"") -> None:
        self.body = body
        self.scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": [(b"content-type", b"application/json")] if body else [],
            "server": ("localhost", 80),
            "client": ("127.0.0.1", 1),
        }
        self.messages: list[dict] = []

    async def receive(self) -> dict:
        return {"type": "http.request", "body": self.body, "more_body": False}

    async def send(self, message: dict) -> None:
        self.messages.append(message)

    async def run(self, app: FastAPI) -> None:
        try:
            await app(self.scope, self.receive, self.send)
        except RuntimeError:
            pass

    def content(self) -> bytes:
        return b"".join(
            m.get("body", b"") for m in self.messages if m["type"] == "http.response.body"
        )

    def headers(self) -> dict[str, str]:
        return {
            name.decode().lower(): value.decode() for name, value in self.messages[0]["headers"]
        }

    def result(self) -> tuple[int, object]:
        return self.messages[0]["status"], json.loads(self.content())


def run_call(app: FastAPI, method: str, path: str, payload: object | None) -> AsgiCall:
    body = json.dumps(payload).encode() if payload is not None else b""
    call = AsgiCall(method, path, body)
    asyncio.run(call.run(app))
    return call


def asgi_request(
    app: FastAPI, method: str, path: str, payload: object | None = None
) -> tuple[int, object]:
    return run_call(app, method, path, payload).result()


def asgi_raw(
    app: FastAPI, method: str, path: str, payload: object | None = None
) -> tuple[int, dict[str, str], bytes]:
    call = run_call(app, method, path, payload)
    return call.messages[0]["status"], call.headers(), call.content()


def wait_until(condition: Callable[[], bool], timeout: float = 15) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return
        time.sleep(0.02)
    raise AssertionError("Condition was not met in time")


def build_wheel(name: str, version: str) -> bytes:
    module = name.removeprefix("nvidia-").removesuffix("-cu12").replace("-", "_")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(f"nvidia/{module}/bin/{module}64_12.dll", f"{name}-{version}" * 4000)
        archive.writestr(f"nvidia/{module}/include/{module}.h", "header")
        archive.writestr(f"{name.replace('-', '_')}-{version}.dist-info/METADATA", "meta")
    return buffer.getvalue()


class FakeRemote:
    def __init__(self) -> None:
        self.repos: dict[str, dict[str, bytes]] = {}
        self.wheels: dict[str, bytes] = {}
        self.failing: set[str] = set()
        self.gates: dict[str, threading.Event] = {}
        self.entered: dict[str, threading.Event] = {}
        self.requests: list[tuple[str, str, str]] = []
        self.lock = threading.Lock()

    def gate(self, name: str) -> threading.Event:
        self.entered[name] = threading.Event()
        self.gates[name] = threading.Event()
        return self.gates[name]

    def record(self, method: str, path: str, range_header: str) -> None:
        with self.lock:
            self.requests.append((method, path, range_header))

    def gets(self, suffix: str) -> list[tuple[str, str, str]]:
        with self.lock:
            return [r for r in self.requests if r[0] == "GET" and r[1].endswith(suffix)]

    def tree(self, repo: str) -> list[dict]:
        return [
            {"type": "file", "oid": hashlib.sha1(data).hexdigest(), "size": len(data), "path": path}
            for path, data in self.repos[repo].items()
        ]

    def release(self, name: str, version: str, base: str) -> dict:
        data = build_wheel(name, version)
        stem = f"{name.replace('-', '_')}-{version}-py3-none"
        self.wheels[f"{stem}-win_amd64.whl"] = data
        self.wheels[f"{stem}-manylinux2014_x86_64.whl"] = b"linux"
        return {
            "urls": [
                {
                    "filename": f"{stem}-manylinux2014_x86_64.whl",
                    "url": f"{base}/files/{stem}-manylinux2014_x86_64.whl",
                    "size": 5,
                    "digests": {"sha256": hashlib.sha256(b"linux").hexdigest()},
                },
                {
                    "filename": f"{stem}-win_amd64.whl",
                    "url": f"{base}/files/{stem}-win_amd64.whl",
                    "size": len(data),
                    "digests": {"sha256": hashlib.sha256(data).hexdigest()},
                },
            ]
        }


class FakeHandler(BaseHTTPRequestHandler):
    server: "FakeServer"

    def log_message(self, format: str, *args: object) -> None:
        return

    def do_HEAD(self) -> None:
        self.handle_request(send_body=False)

    def do_GET(self) -> None:
        self.handle_request(send_body=True)

    def handle_request(self, send_body: bool) -> None:
        remote = self.server.remote
        remote.record(self.command, self.path, self.headers.get("Range", ""))
        if any(self.path.endswith(name) for name in remote.failing):
            self.send_json({"error": "forbidden"}, 403)
            return
        if match := TREE_PATH.match(self.path):
            self.send_json(remote.tree(match["repo"]))
        elif match := RESOLVE_PATH.match(self.path):
            self.send_file(match["file"], remote.repos[match["repo"]][match["file"]], send_body)
        elif match := PYPI_PATH.match(self.path):
            self.send_json(remote.release(match["name"], match["version"], self.server.url))
        elif match := WHEEL_PATH.match(self.path):
            self.send_file(match["file"], remote.wheels[match["file"]], send_body)
        else:
            self.send_json({"error": "not found"}, 404)

    def send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, name: str, data: bytes, send_body: bool) -> None:
        offset = int(self.headers.get("Range", "bytes=0-")[6:].split("-")[0] or 0)
        self.send_response(206 if offset else 200)
        self.send_header("Content-Length", str(len(data) - offset))
        self.send_header("ETag", f'"{hashlib.sha1(data).hexdigest()}"')
        self.send_header("X-Repo-Commit", COMMIT)
        self.end_headers()
        if send_body:
            self.write_body(name, data[offset:])

    def write_body(self, name: str, data: bytes) -> None:
        remote = self.server.remote
        if name not in remote.gates:
            self.wfile.write(data)
            return
        half = len(data) // 2
        self.wfile.write(data[:half])
        self.wfile.flush()
        remote.entered[name].set()
        remote.gates[name].wait(15)
        self.wfile.write(data[half:])


class FakeServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, remote: FakeRemote) -> None:
        super().__init__(("127.0.0.1", 0), FakeHandler)
        self.remote = remote
        self.url = f"http://127.0.0.1:{self.server_address[1]}"
        self.thread = threading.Thread(target=self.serve_forever, daemon=True)

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        for gate in self.remote.gates.values():
            gate.set()
        self.shutdown()
        self.server_close()


def write_fake_smi(directory: Path, output: str, exit_code: int = 0) -> Path:
    if sys.platform == "win32":
        script = directory / "nvidia-smi.cmd"
        script.write_text(f"@echo off\r\necho {output}\r\nexit /b {exit_code}\r\n")
        return script
    script = directory / "nvidia-smi"
    script.write_text(f"#!/bin/sh\necho '{output}'\nexit {exit_code}\n")
    os.chmod(script, 0o755)
    return script


class ServerTestCase(unittest.TestCase):
    default_model = ""
    app: FastAPI

    def start_server(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.remote = FakeRemote()
        self.server = FakeServer(self.remote)
        self.server.start()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.server.stop)
        proxy = patch.dict(os.environ, {"NO_PROXY": "127.0.0.1,localhost", "no_proxy": "*"})
        proxy.start()
        self.addCleanup(proxy.stop)
        self.smi = write_fake_smi(self.root, GPU_LINE)

    def call(self, method: str, path: str, app: FastAPI | None = None) -> tuple[int, object]:
        return asgi_request(app or self.app, method, path)

    def model(self, model_id: str = "", app: FastAPI | None = None) -> dict:
        status, body = self.call("GET", "/models", app)
        self.assertEqual(status, 200)
        return next(item for item in body if item["id"] == (model_id or self.default_model))

    def wait_model(self, state: str, model_id: str = "", app: FastAPI | None = None) -> dict:
        wait_until(lambda: self.model(model_id, app)["state"] == state)
        return self.model(model_id, app)
