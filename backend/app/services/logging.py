"""Dependency-free JSON logging for application services."""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import UTC, datetime
from typing import Any, TextIO


_STANDARD_FIELDS = frozenset(logging.makeLogRecord({}).__dict__) | {"message", "asctime"}
_SECRET_FRAGMENTS = ("password", "token", "api_key", "authorization", "credential", "secret")


def _safe_value(key: str, value: Any) -> Any:
    if any(fragment in key.casefold() for fragment in _SECRET_FRAGMENTS):
        return "[REDACTED]"
    if value is None or isinstance(value, (str, int, float, bool, list, dict)):
        return value
    return str(value)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        payload.update(
            (key, _safe_value(key, value))
            for key, value in record.__dict__.items()
            if key not in _STANDARD_FIELDS and not key.startswith("_")
        )
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_logging(*, level: str | int | None = None, stream: TextIO | None = None) -> logging.Logger:
    """Configure the ``app`` logger once and return it for tests/introspection."""
    logger = logging.getLogger("app")
    for handler in tuple(logger.handlers):
        if getattr(handler, "_finquant_json", False):
            logger.removeHandler(handler)
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(JsonFormatter())
    setattr(handler, "_finquant_json", True)
    logger.addHandler(handler)
    logger.setLevel(level or os.getenv("LOG_LEVEL", "INFO").upper())
    logger.propagate = False
    return logger
