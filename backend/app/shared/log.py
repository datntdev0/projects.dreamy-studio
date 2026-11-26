import logging
import re
import sys
from collections.abc import Callable
from datetime import date, datetime
from pathlib import Path

LEVEL_NAMES = {
    logging.DEBUG: "DEBUG",
    logging.INFO: "INFO",
    logging.WARNING: "WARN",
    logging.ERROR: "ERROR",
    logging.CRITICAL: "ERROR",
}


class LineFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        time = (
            datetime.fromtimestamp(record.created).astimezone().isoformat(timespec="milliseconds")
        )
        level = LEVEL_NAMES.get(record.levelno, record.levelname.upper())
        head = f"{time} {level} {record.name} {record.getMessage()}"
        if record.exc_info:
            return f"{head}\n{self.formatException(record.exc_info)}"
        return head


DATED_LOG = re.compile(r"^(\d{4}-\d{2}-\d{2})\.log$")


def delete_old_logs(log_dir: Path, today: date, keep_days: int) -> None:
    if not log_dir.is_dir():
        return
    for path in log_dir.iterdir():
        match = DATED_LOG.fullmatch(path.name)
        if not match:
            continue
        try:
            age = (today - date.fromisoformat(match.group(1))).days
            if age >= keep_days:
                path.unlink()
        except (ValueError, OSError):
            continue


class DailyFileHandler(logging.FileHandler):
    def __init__(
        self,
        log_dir: Path,
        keep_days: int = 7,
        clock: Callable[[], datetime] = datetime.now,
    ) -> None:
        self.log_dir = log_dir
        self.keep_days = keep_days
        self.clock = clock
        log_dir.mkdir(parents=True, exist_ok=True)
        self.current_day = clock().date()
        delete_old_logs(log_dir, self.current_day, keep_days)
        super().__init__(self.dated_file(self.current_day), encoding="utf-8")

    def dated_file(self, day: date) -> Path:
        return self.log_dir / f"{day.isoformat()}.log"

    def emit(self, record: logging.LogRecord) -> None:
        day = self.clock().date()
        if day != self.current_day:
            self.current_day = day
            if self.stream:
                self.stream.close()
                self.stream = None
            self.baseFilename = str(self.dated_file(day))
            delete_old_logs(self.log_dir, day, self.keep_days)
        super().emit(record)


def setup_logging(log_dir: Path, level: str) -> bool:
    root = logging.getLogger()
    for handler in root.handlers[:]:
        if getattr(handler, "_dreamy_backend", False):
            root.removeHandler(handler)
            handler.close()
    try:
        handler: logging.Handler = DailyFileHandler(log_dir)
        writable = True
    except OSError as error:
        handler = logging.StreamHandler(sys.stderr)
        writable = False
        sys.stderr.write(f"Could not write Dreamy Studio backend logs to {log_dir}: {error}\n")
    handler.setFormatter(LineFormatter())
    handler._dreamy_backend = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(level.upper())
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).setLevel(level.upper())
    return writable
