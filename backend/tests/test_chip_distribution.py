from __future__ import annotations

from typing import Any

import pytest

from app.services import chip_distribution
from app.services.chip_distribution import ChipDistributionUnavailable


ROWS: list[dict[str, Any]] = [{
    "日期": "2026-07-31",
    "获利比例": 0.4321,
    "平均成本": 1450.5,
    "90成本-低": 1390.0,
    "90成本-高": 1520.0,
    "90集中度": 0.0447,
    "70成本-低": 1410.0,
    "70成本-高": 1490.0,
    "70集中度": 0.0276,
}]


@pytest.mark.asyncio
async def test_chip_distribution_preserves_provider_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(chip_distribution, "_load_records", lambda symbol, adjustment: ROWS)

    result = await chip_distribution.fetch_chip_distribution("600519")

    assert result["symbol"] == "600519"
    assert result["provider"] == "akshare.stock_cyq_em"
    assert result["source"] == "eastmoney.kline"
    assert result["methodology"] == "akshare_cyq_calculator_120_day_turnover_decay"
    assert result["as_of"] == "2026-07-31"
    assert result["latest"]["profit_ratio"] == 0.4321
    assert result["latest"]["cost_90"] == {
        "low": 1390.0, "high": 1520.0, "concentration": 0.0447,
    }
    assert result["latest"]["chip_peak"] is None
    assert result["quality_flags"] == [
        "derived_from_price_volume_turnover",
        "chip_peak_not_exposed_by_provider",
    ]


@pytest.mark.asyncio
async def test_chip_distribution_rejects_non_a_share() -> None:
    with pytest.raises(ValueError, match="仅支持 A 股"):
        await chip_distribution.fetch_chip_distribution("AAPL")


@pytest.mark.asyncio
async def test_chip_distribution_rejects_changed_provider_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(chip_distribution, "_load_records", lambda symbol, adjustment: [{"日期": "2026-07-31"}])

    with pytest.raises(ChipDistributionUnavailable, match="缺少字段"):
        await chip_distribution.fetch_chip_distribution("600519")


@pytest.mark.asyncio
async def test_chip_distribution_rejects_impossible_ratios(monkeypatch: pytest.MonkeyPatch) -> None:
    invalid = [{**ROWS[0], "获利比例": 1.2}]
    monkeypatch.setattr(chip_distribution, "_load_records", lambda symbol, adjustment: invalid)

    with pytest.raises(ChipDistributionUnavailable, match="超出 0-1 范围"):
        await chip_distribution.fetch_chip_distribution("600519")
