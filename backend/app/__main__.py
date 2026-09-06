import argparse
import logging
import os
from pathlib import Path

import uvicorn

from app.shared.config import DATA_DIR_ENV, DEVICE_ENV, WORKER_PYTHON_ENV
from app.shared.errors import install_excepthook
from app.shared.log import setup_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Dreamy Studio local backend")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--run-mode", choices=("dev", "test", "prod"), default="prod")
    parser.add_argument("--log-dir", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--worker-python", type=Path)
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    os.environ["DREAMY_BACKEND_LOG_DIR"] = str(args.log_dir)
    os.environ["DREAMY_BACKEND_LOG_LEVEL"] = "INFO" if args.run_mode == "prod" else "DEBUG"
    os.environ[DATA_DIR_ENV] = str(args.data_dir.resolve())
    os.environ[DEVICE_ENV] = args.device
    if args.worker_python:
        os.environ[WORKER_PYTHON_ENV] = str(args.worker_python.resolve())
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    setup_logging(args.log_dir, os.environ["DREAMY_BACKEND_LOG_LEVEL"])
    install_excepthook()
    logging.getLogger("startup").info(
        "Backend starting (mode=%s, port=%s, device=%s, data=%s)",
        args.run_mode,
        args.port,
        args.device,
        args.data_dir,
    )
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(Path(__file__).parent)] if args.reload else None,
        log_config=None,
    )


if __name__ == "__main__":
    main()
