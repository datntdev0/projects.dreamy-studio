import argparse
import logging
import os
from pathlib import Path

import uvicorn

from app.shared.config import (
    API_KEY_ENV,
    DATA_DIR_ENV,
    DEVICE_ENV,
    WORKER_PYTHON_ENV,
    ServerOptions,
    Settings,
)
from app.shared.dotenv import load_env_file
from app.shared.errors import install_excepthook
from app.shared.log import setup_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Dreamy Studio local backend")
    parser.add_argument("--device", choices=("cpu", "cuda"))
    parser.add_argument("--worker-python", type=Path)
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    load_env_file()
    if args.device:
        os.environ[DEVICE_ENV] = args.device
    if args.worker_python:
        os.environ[WORKER_PYTHON_ENV] = str(args.worker_python.resolve())
    options = ServerOptions.from_env()
    os.environ[DATA_DIR_ENV] = str(options.data_dir)
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    setup_logging(options.log_dir, options.log_level)
    install_excepthook()
    settings = Settings.from_env()
    logging.getLogger("startup").info(
        "Backend starting (mode=%s, port=%s, device=%s, data=%s, api_key=%s)",
        options.run_mode,
        options.port,
        settings.device or "auto",
        settings.data_dir,
        "on" if os.environ.get(API_KEY_ENV) else "off",
    )
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=options.port,
        reload=args.reload,
        reload_dirs=[str(Path(__file__).parent)] if args.reload else None,
        log_config=None,
    )


if __name__ == "__main__":
    main()
