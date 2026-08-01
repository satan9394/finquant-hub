"""Persist and apply the small allowlist of browser-editable runtime settings."""
from __future__ import annotations

import json
from typing import Any

from .. import config, database


SETTING_ATTRIBUTES = {
    "scheduler_enabled": "SCHEDULER_ENABLED",
    "scheduler_concurrency": "SCHEDULER_CONCURRENCY",
    "scheduler_max_targets": "SCHEDULER_MAX_TARGETS",
    "scheduler_hour": "SCHEDULER_HOUR",
    "scheduler_minute": "SCHEDULER_MINUTE",
}
DEFAULT_SETTINGS = {
    key: getattr(config, attribute)
    for key, attribute in SETTING_ATTRIBUTES.items()
}


def current_system_settings() -> dict[str, bool | int]:
    return {
        key: getattr(config, attribute)
        for key, attribute in SETTING_ATTRIBUTES.items()
    }


def _apply(values: dict[str, Any]) -> None:
    for key, value in values.items():
        attribute = SETTING_ATTRIBUTES.get(key)
        if attribute is not None:
            setattr(config, attribute, value)


async def load_system_settings() -> dict[str, bool | int]:
    """Reset to environment defaults, then overlay persisted values."""
    values = dict(DEFAULT_SETTINGS)
    rows = await database.query_all("SELECT key, value_json FROM system_settings")
    for row in rows:
        if row["key"] not in SETTING_ATTRIBUTES:
            continue
        try:
            values[row["key"]] = json.loads(row["value_json"])
        except (TypeError, json.JSONDecodeError):
            continue
    _apply(values)
    return current_system_settings()


async def save_system_settings(values: dict[str, bool | int]) -> dict[str, bool | int]:
    for key, value in values.items():
        if key not in SETTING_ATTRIBUTES:
            raise ValueError(f"不支持的系统配置：{key}")
        await database.execute(
            """
            INSERT INTO system_settings (key, value_json) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value_json=excluded.value_json,
                updated_at=datetime('now')
            """,
            (key, json.dumps(value)),
        )
    _apply(values)
    return current_system_settings()
