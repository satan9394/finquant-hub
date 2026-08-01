import io
import json
import logging

from app.services.logging import configure_logging


def test_json_logging_preserves_fields_and_redacts_secrets():
    stream = io.StringIO()
    configure_logging(stream=stream, level="INFO")

    logging.getLogger("app.test").info(
        "research completed",
        extra={"event": "research.completed", "report_id": 7, "api_key": "never-log-this"},
    )

    payload = json.loads(stream.getvalue())
    assert payload["level"] == "INFO"
    assert payload["logger"] == "app.test"
    assert payload["message"] == "research completed"
    assert payload["event"] == "research.completed"
    assert payload["report_id"] == 7
    assert payload["api_key"] == "[REDACTED]"
    configure_logging()
