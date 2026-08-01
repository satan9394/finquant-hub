"""Generate practical FastExpr templates from the bundled BRAIN field catalogue."""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from .alpha_service import list_fields


_TEMPLATE_SPECS = (
    {
        "id": "fundamental_quality",
        "name": "基本面质量",
        "fields": ("operating_income", "equity"),
        "expression": "group_rank(ts_rank({0} / {1}, 126), subindustry)",
        "neutralization": "SUBINDUSTRY",
        "decay": 0,
    },
    {
        "id": "free_cash_flow_yield",
        "name": "自由现金流收益率",
        "fields": ("free_cash_flow_reported_value", "equity"),
        "expression": "group_rank(ts_rank({0} / {1}, 126), industry)",
        "neutralization": "INDUSTRY",
        "decay": 0,
    },
    {
        "id": "analyst_earnings_yield",
        "name": "分析师盈利收益率",
        "fields": ("est_eps", "close"),
        "expression": "group_rank(ts_rank({0} / {1}, 126), industry)",
        "neutralization": "INDUSTRY",
        "decay": 4,
    },
    {
        "id": "price_reversal",
        "name": "短期价格反转",
        "fields": ("close", "open"),
        "expression": "rank(-({0} / {1} - 1))",
        "neutralization": "INDUSTRY",
        "decay": 10,
    },
    {
        "id": "volume_price_divergence",
        "name": "量价背离",
        "fields": ("volume", "vwap"),
        "expression": "-ts_corr(rank({0}), rank({1}), 20)",
        "neutralization": "MARKET",
        "decay": 10,
    },
)


def generate_factor_templates(
    fields: Iterable[Mapping[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Return templates only when every referenced field exists in the catalogue."""
    catalogue = {str(field.get("id")): field for field in (fields if fields is not None else list_fields())}
    templates: list[dict[str, Any]] = []
    for spec in _TEMPLATE_SPECS:
        field_ids = spec["fields"]
        if not all(field_id in catalogue for field_id in field_ids):
            continue
        templates.append(
            {
                "id": spec["id"],
                "name": spec["name"],
                "expression": spec["expression"].format(*field_ids),
                "fields": [
                    {
                        "id": field_id,
                        "description": catalogue[field_id].get("description", ""),
                        "coverage": catalogue[field_id].get("coverage"),
                    }
                    for field_id in field_ids
                ],
                "settings": {
                    "neutralization": spec["neutralization"],
                    "decay": spec["decay"],
                    "delay": 1,
                    "nanHandling": "ON",
                },
            }
        )
    return templates
