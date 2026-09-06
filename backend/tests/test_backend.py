import logging
import tempfile
import unittest
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from support import asgi_request

from app.shared.errors import register_error_handlers
from app.shared.log import DailyFileHandler, LineFormatter, delete_old_logs, setup_logging


def fail_route():
    raise RuntimeError("secret details")


def item_route(item_id: int):
    return {"item_id": item_id}


class BackendErrorTests(unittest.TestCase):
    def test_http_and_unexpected_errors(self):
        app = FastAPI()
        register_error_handlers(app)
        app.add_api_route("/fail", fail_route)
        app.add_api_route("/items/{item_id}", item_route)

        status, body = asgi_request(app, "GET", "/missing")
        self.assertEqual(
            (status, body), (404, {"code": "HTTP_404", "message": "Not Found", "details": None})
        )

        status, body = asgi_request(app, "GET", "/items/invalid")
        self.assertEqual(
            (status, body),
            (422, {"code": "HTTP_422", "message": "Invalid request", "details": None}),
        )

        with self.assertLogs("errors", level="ERROR") as captured:
            status, body = asgi_request(app, "GET", "/fail")
        self.assertEqual(
            (status, body),
            (
                500,
                {
                    "code": "BACKEND_UNEXPECTED",
                    "message": "Unexpected backend error",
                    "details": None,
                },
            ),
        )
        self.assertIn("Unhandled error on GET /fail", captured.output[0])


class BackendLogTests(unittest.TestCase):
    def test_format_and_daily_rotation_and_retention(self):
        with tempfile.TemporaryDirectory() as directory:
            log_dir = Path(directory)
            day = date(2026, 10, 17)
            old = log_dir / "backend-2026-10-10.log"
            recent = log_dir / "backend-2026-10-11.log"
            unrelated = log_dir / "main-2026-10-10.log"
            for path in (old, recent, unrelated):
                path.write_text("old", encoding="utf-8")
            delete_old_logs(log_dir, "backend", day, 7)
            self.assertFalse(old.exists())
            self.assertTrue(recent.exists())
            self.assertTrue(unrelated.exists())

            now = [datetime(2026, 10, 17, 23, 59)]
            handler = DailyFileHandler(log_dir, clock=lambda: now[0])
            handler.setFormatter(LineFormatter())
            try:
                record = logging.LogRecord(
                    "sample", logging.WARNING, __file__, 1, "first", (), None
                )
                created = datetime(2026, 10, 17, 8, 4, 5, 123000, UTC)
                record.created = created.timestamp()
                expected_time = created.astimezone().isoformat(timespec="milliseconds")
                handler.emit(record)
                now[0] += timedelta(minutes=2)
                handler.emit(
                    logging.LogRecord("sample", logging.INFO, __file__, 1, "second", (), None)
                )
            finally:
                handler.close()
            self.assertIn(
                f"{expected_time} WARN sample first",
                (log_dir / "backend-2026-10-17.log").read_text(),
            )
            self.assertRegex(
                (log_dir / "backend-2026-10-18.log").read_text(),
                r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2} INFO sample second",
            )

    def test_mode_levels_and_fallback(self):
        root = logging.getLogger()
        previous_level = root.level
        with tempfile.TemporaryDirectory() as directory:
            try:
                self.assertTrue(setup_logging(Path(directory), "DEBUG"))
                self.assertEqual(root.level, logging.DEBUG)
                self.assertTrue(setup_logging(Path(directory), "INFO"))
                self.assertEqual(root.level, logging.INFO)
                self.assertEqual(
                    sum(getattr(h, "_dreamy_backend", False) for h in root.handlers), 1
                )
                blocked = Path(directory) / "not-a-directory"
                blocked.write_text("x")
                with patch("sys.stderr"):
                    self.assertFalse(setup_logging(blocked, "INFO"))
            finally:
                for handler in root.handlers[:]:
                    if getattr(handler, "_dreamy_backend", False):
                        root.removeHandler(handler)
                        handler.close()
                root.setLevel(previous_level)


if __name__ == "__main__":
    unittest.main()
