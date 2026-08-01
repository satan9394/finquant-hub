"""Persist market-provider ordering in the existing system_settings table."""

import json
import logging

from .. import database
from .market_data import MarketDataService

LOGGER = logging.getLogger(__name__)
KEYS = {
    "quote": "market_quote_priority",
    "kline": "market_kline_priority",
}


async def restore_source_priorities(market: MarketDataService) -> None:
    rows = await database.query_all(
        "SELECT key, value_json FROM system_settings WHERE key IN (?, ?)",
        tuple(KEYS.values()),
    )
    kind_by_key = {value: key for key, value in KEYS.items()}
    for row in rows:
        try:
            providers = json.loads(row["value_json"])
            market.configure_source_priority(kind_by_key[row["key"]], providers)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            LOGGER.warning("Ignoring invalid persisted source priority: %s", row["key"])


async def save_source_priority(
    market: MarketDataService,
    kind: str,
    providers: list[str],
) -> None:
    market.configure_source_priority(kind, providers)
    await database.execute(
        """
        INSERT INTO system_settings (key, value_json) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value_json=excluded.value_json,
            updated_at=datetime('now')
        """,
        (KEYS[kind], json.dumps(providers)),
    )
