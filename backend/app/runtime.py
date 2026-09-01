import argparse
import logging
import os
from pathlib import Path

import uvicorn

from app.config import DATA_DIR_ENV, DEVICE_ENV
from app.errors import install_excepthook
from app.log import setup_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Dreamy Studio local backend")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--run-mode", choices=("dev", "test", "prod"), default="prod")
    parser.add_argument("--log-dir", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    # The reload worker inherits these values and configures logging when it imports app.main.
    os.environ["DREAMY_BACKEND_LOG_DIR"] = str(args.log_dir)
    os.environ["DREAMY_BACKEND_LOG_LEVEL"] = "INFO" if args.run_mode == "prod" else "DEBUG"
    os.environ[DATA_DIR_ENV] = str(args.data_dir.resolve())
    os.environ[DEVICE_ENV] = args.device
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
