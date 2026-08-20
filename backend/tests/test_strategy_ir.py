from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.main import app
from app.routers.backtests import (
    StrategyIRCompileInput,
    StrategyIRInput,
    compile_strategy_description,
    parse_strategy_description,
)
from app.services.strategy_ir import (
    StrategyIRCompileError,
    StrategyIRParseError,
    compile_strategy_ir,
    parse_strategy_ir,
    restore_strategy_ir,
)


def test_chinese_and_english_descriptions_produce_the_same_canonical_ir() -> None:
    chinese = parse_strategy_ir(
        "标的 600519，日线 MA20 上穿 MA50 时买入，MA20 下穿 MA50 时卖出；"
        "收盘确认信号，下一交易日开盘执行。"
    )
    english = parse_strategy_ir(
        "Symbol 600519, daily: buy when MA20 crosses above MA50 and sell when "
        "MA20 crosses below MA50; confirm at close and execute at next open."
    )

    assert chinese == english
    assert chinese["schema_version"] == "strategy-ir/v1"
    assert chinese["strategy_type"] == "ma_crossover"
    assert chinese["instrument"] == {"symbol": "600519"}
    assert chinese["data"] == {"frequency": "1d", "price_field": "close"}
    assert chinese["conditions"] == [
        {
            "id": "entry",
            "left": {"indicator": "sma", "window": 20, "price_field": "close"},
            "operator": "crosses_above",
            "right": {"indicator": "sma", "window": 50, "price_field": "close"},
            "target_position": "long",
            "explanation": "收盘价 MA20 上穿 MA50 后，目标仓位变为 long。",
        },
        {
            "id": "exit",
            "left": {"indicator": "sma", "window": 20, "price_field": "close"},
            "operator": "crosses_below",
            "right": {"indicator": "sma", "window": 50, "price_field": "close"},
            "target_position": "flat",
            "explanation": "收盘价 MA20 下穿 MA50 后，目标仓位变为 flat。",
        },
    ]
    assert chinese["execution"] == {
        "signal_at": "close", "execute_at": "next_open", "position_mode": "long_only",
    }
    assert "commission_bps" in chinese["requires_confirmation"]
    assert len(chinese["canonical_key"]) == 64


@pytest.mark.parametrize(
    ("description", "field", "code"),
    [
        (
            "日线 MA20 上穿 MA50 买入，下穿卖出，收盘确认，下一交易日开盘执行。",
            "instrument.symbol", "missing",
        ),
        (
            "标的 AAPL，日线 MA20 或 MA30 上穿 MA50 买入，下穿卖出，收盘确认，下一交易日开盘执行。",
            "description", "ambiguous",
        ),
        (
            "标的 AAPL，日线 RSI 低于 30 买入，高于 70 卖出，收盘确认，下一交易日开盘执行。",
            "strategy_type", "unsupported",
        ),
        (
            "标的 AAPL，日线 MA20 上穿 MA50 买入，下穿卖出。",
            "execution", "missing",
        ),
        (
            "标的 AAPL，日线 MA50 上穿 MA20 买入，MA50 下穿 MA20 卖出，收盘确认，下一交易日开盘执行。",
            "windows", "invalid_relationship",
        ),
        (
            "标的 AAPL，日线 MA1 上穿 MA300 买入，下穿卖出，收盘确认，下一交易日开盘执行。",
            "windows", "out_of_range",
        ),
        (
            "标的 AAPL，日线 MA20 上穿 MA50 买入，下穿卖出；import os；收盘确认，下一交易日开盘执行。",
            "description", "executable_content",
        ),
    ],
)
def test_parser_rejects_ambiguity_unsupported_rules_and_executable_content(
    description: str, field: str, code: str,
) -> None:
    with pytest.raises(StrategyIRParseError) as exc_info:
        parse_strategy_ir(description)
    assert {issue["field"]: issue["code"] for issue in exc_info.value.issues}[field] == code


def test_ir_is_data_only_and_request_rejects_extra_fields() -> None:
    ir = parse_strategy_ir(
        "标的 00700.HK，日线 MA10 上穿 MA30 时买入，MA10 下穿 MA30 时卖出；"
        "收盘确认信号，下一交易日开盘执行。"
    )
    serialized = json.dumps(ir, ensure_ascii=False)
    assert ir["instrument"]["symbol"] == "00700.HK"
    assert not any(token in serialized for token in ("eval(", "exec(", "import ", "SELECT "))

    with pytest.raises(ValidationError):
        StrategyIRInput.model_validate({"description": "valid later", "ticker": "AAPL"})


def test_openapi_exposes_authenticated_non_executing_parse_endpoint() -> None:
    operation = app.openapi()["paths"]["/api/backtests/strategy-ir/parse"]["post"]
    assert operation["tags"] == ["backtests"]
    assert operation["responses"]["200"]


@pytest.mark.asyncio
async def test_endpoint_returns_structured_valid_and_invalid_states_without_execution() -> None:
    valid = await parse_strategy_description(
        StrategyIRInput(description=(
            "标的 AAPL，日线 MA20 上穿 MA50 买入，下穿卖出，"
            "收盘确认，下一交易日开盘执行。"
        )),
        {"id": 1},
    )
    invalid = await parse_strategy_description(
        StrategyIRInput(description="用 RSI 做一个差不多的策略"),
        {"id": 1},
    )
    assert valid["status"] == "valid"
    assert invalid["status"] == "invalid"
    assert invalid["code"] == "strategy_ir_invalid"
    assert any(issue["field"] == "strategy_type" for issue in invalid["issues"])


def test_compile_produces_reversible_draft_without_unconfirmed_values_or_look_ahead() -> None:
    ir = parse_strategy_ir(
        "标的 AAPL，日线 MA20 上穿 MA50 买入，下穿卖出，"
        "收盘确认，下一交易日开盘执行。"
    )

    draft = compile_strategy_ir(ir)

    assert draft == {
        "schema_version": "ma-crossover-draft/v1",
        "source_ir_version": "strategy-ir/v1",
        "source_canonical_key": ir["canonical_key"],
        "capability": "backtests.ma_crossover",
        "parameters": {"symbol": "AAPL", "short_window": 20, "long_window": 50},
        "data": {"frequency": "1d", "price_field": "close"},
        "execution": {
            "signal_at": "close", "execute_at": "next_open", "position_mode": "long_only",
        },
        "requires_confirmation": ir["requires_confirmation"],
    }
    serialized = json.dumps(draft)
    assert not any(field in draft["parameters"] for field in ir["requires_confirmation"])
    assert "same_close" not in serialized
    assert restore_strategy_ir(draft) == ir


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.update({"unexpected": True}),
        lambda value: value["parameters"].update({"short_window": 50}),
        lambda value: value["execution"].update({"execute_at": "same_close"}),
        lambda value: value.update({"source_canonical_key": "0" * 64}),
    ],
)
def test_compile_and_restore_reject_tampering_and_semantic_drift(mutate) -> None:
    ir = parse_strategy_ir(
        "标的 600519，日线 MA10 上穿 MA30 买入，下穿卖出，"
        "收盘确认，下一交易日开盘执行。"
    )
    draft = compile_strategy_ir(ir)
    mutate(draft)

    with pytest.raises(StrategyIRCompileError) as exc_info:
        restore_strategy_ir(draft)
    assert exc_info.value.issues


@pytest.mark.asyncio
async def test_compile_endpoint_returns_data_draft_and_structured_invalid_state() -> None:
    ir = parse_strategy_ir(
        "标的 00700.HK，日线 MA10 上穿 MA30 买入，下穿卖出，"
        "收盘确认，下一交易日开盘执行。"
    )
    valid = await compile_strategy_description(StrategyIRCompileInput(ir=ir), {"id": 1})
    tampered = {**ir, "strategy_type": "rsi"}
    invalid = await compile_strategy_description(StrategyIRCompileInput(ir=tampered), {"id": 1})

    assert valid["status"] == "valid"
    assert valid["draft"]["parameters"] == {
        "symbol": "00700.HK", "short_window": 10, "long_window": 30,
    }
    assert invalid["status"] == "invalid"
    assert invalid["code"] == "strategy_ir_compile_invalid"
    assert invalid["issues"]


def test_openapi_exposes_non_executing_compile_endpoint() -> None:
    operation = app.openapi()["paths"]["/api/backtests/strategy-ir/compile"]["post"]
    assert operation["tags"] == ["backtests"]
    assert operation["responses"]["200"]
