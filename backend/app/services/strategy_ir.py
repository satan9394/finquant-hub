"""Deterministic natural-language parsing into a finite, non-executable strategy IR."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from .instruments import external_symbol

JSONDict = dict[str, Any]
SCHEMA_VERSION = "strategy-ir/v1"
DRAFT_SCHEMA_VERSION = "ma-crossover-draft/v1"
REQUIRED_CONFIRMATIONS = [
    "start_date", "end_date", "initial_capital", "commission_bps", "slippage_bps",
    "sell_stamp_duty_bps", "minimum_commission_cny", "max_drawdown_stop_pct", "benchmark",
]

_EXECUTABLE = re.compile(
    r"```|`|\b(?:eval|exec|import|select|insert|update|delete|drop|function|lambda)\b|__|=>|[{}]",
    re.IGNORECASE,
)
_AMBIGUOUS = re.compile(
    r"大概|左右|适当|合适|较快|较慢|可能|或者|或|任意|\bor\b|\babout\b|"
    r"\bapproximately\b|\bmaybe\b|\broughly\b",
    re.IGNORECASE,
)
_UNSUPPORTED = re.compile(
    r"\b(?:rsi|macd|bollinger|kdj|pe|pb)\b|布林|成交量|市盈率|市净率|基本面|情绪",
    re.IGNORECASE,
)
_SYMBOL = re.compile(
    r"(?:标的|股票|symbol|ticker)\s*[:：]?\s*"
    r"([A-Z]{1,5}(?:\.[A-Z]{2})?|\d{5,6}(?:\.HK)?)",
    re.IGNORECASE,
)
_WINDOW_PATTERNS = (
    re.compile(r"\bMA\s*(\d{1,3})\b", re.IGNORECASE),
    re.compile(r"(\d{1,3})\s*(?:日|天)(?:简单移动平均|移动平均|均线)"),
    re.compile(r"(\d{1,3})[ -]?(?:day|period) (?:simple )?moving average", re.IGNORECASE),
)


class StrategyIRParseError(ValueError):
    def __init__(self, issues: list[JSONDict]) -> None:
        self.issues = issues
        super().__init__("策略描述无法映射到有限 IR")


class StrategyIRCompileError(ValueError):
    def __init__(self, issues: list[JSONDict]) -> None:
        self.issues = issues
        super().__init__("策略 IR 无法编译到现有回测能力")


def _issue(field: str, code: str, message: str) -> JSONDict:
    return {"field": field, "code": code, "message": message}


def _symbols(description: str) -> list[str]:
    matches = _SYMBOL.findall(description)
    if not matches:
        matches.extend(re.findall(r"\b(\d{5,6}(?:\.HK)?)\s*的", description, re.IGNORECASE))
    normalized: list[str] = []
    for match in matches:
        try:
            value = external_symbol(match)
        except ValueError:
            continue
        if value not in normalized:
            normalized.append(value)
    return normalized


def _windows(description: str) -> list[int]:
    values: list[int] = []
    for pattern in _WINDOW_PATTERNS:
        for raw in pattern.findall(description):
            value = int(raw)
            if value not in values:
                values.append(value)
    return values


def _moving_average(window: int) -> JSONDict:
    return {"indicator": "sma", "window": window, "price_field": "close"}


def _build_ir(symbol: str, fast: int, slow: int) -> JSONDict:
    ir: JSONDict = {
        "schema_version": SCHEMA_VERSION,
        "strategy_type": "ma_crossover",
        "instrument": {"symbol": symbol},
        "data": {"frequency": "1d", "price_field": "close"},
        "conditions": [
            {
                "id": "entry", "left": _moving_average(fast), "operator": "crosses_above",
                "right": _moving_average(slow), "target_position": "long",
                "explanation": f"收盘价 MA{fast} 上穿 MA{slow} 后，目标仓位变为 long。",
            },
            {
                "id": "exit", "left": _moving_average(fast), "operator": "crosses_below",
                "right": _moving_average(slow), "target_position": "flat",
                "explanation": f"收盘价 MA{fast} 下穿 MA{slow} 后，目标仓位变为 flat。",
            },
        ],
        "execution": {
            "signal_at": "close", "execute_at": "next_open", "position_mode": "long_only",
        },
        "requires_confirmation": list(REQUIRED_CONFIRMATIONS),
    }
    canonical = json.dumps(ir, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    ir["canonical_key"] = hashlib.sha256(canonical.encode()).hexdigest()
    return ir


def _validated_ir(value: JSONDict) -> JSONDict:
    try:
        symbol = value["instrument"]["symbol"]
        conditions = value["conditions"]
        fast = conditions[0]["left"]["window"]
        slow = conditions[0]["right"]["window"]
        if not isinstance(symbol, str) or not isinstance(fast, int) or not isinstance(slow, int):
            raise TypeError
        if not (2 <= fast <= 200 and 3 <= slow <= 250 and fast < slow):
            raise ValueError
        expected = _build_ir(external_symbol(symbol), fast, slow)
    except (IndexError, KeyError, TypeError, ValueError) as exc:
        raise StrategyIRCompileError([
            _issue("ir", "invalid_shape", "IR 必须是完整且有界的 strategy-ir/v1。"),
        ]) from exc
    if value != expected:
        raise StrategyIRCompileError([
            _issue("ir", "semantic_drift", "IR 字段、执行语义或 canonical key 已发生漂移。"),
        ])
    return expected


def compile_strategy_ir(ir: JSONDict) -> JSONDict:
    """Compile a canonical IR to a non-executing, incomplete backtest draft."""
    valid = _validated_ir(ir)
    entry = valid["conditions"][0]
    return {
        "schema_version": DRAFT_SCHEMA_VERSION,
        "source_ir_version": valid["schema_version"],
        "source_canonical_key": valid["canonical_key"],
        "capability": "backtests.ma_crossover",
        "parameters": {
            "symbol": valid["instrument"]["symbol"],
            "short_window": entry["left"]["window"],
            "long_window": entry["right"]["window"],
        },
        "data": dict(valid["data"]),
        "execution": dict(valid["execution"]),
        "requires_confirmation": list(valid["requires_confirmation"]),
    }


def restore_strategy_ir(draft: JSONDict) -> JSONDict:
    """Rebuild the canonical IR only when the entire draft contract remains intact."""
    try:
        params = draft["parameters"]
        symbol = params["symbol"]
        fast = params["short_window"]
        slow = params["long_window"]
        if not isinstance(symbol, str) or not isinstance(fast, int) or not isinstance(slow, int):
            raise TypeError
        if not (2 <= fast <= 200 and 3 <= slow <= 250 and fast < slow):
            raise ValueError
        ir = _build_ir(external_symbol(symbol), fast, slow)
    except (KeyError, TypeError, ValueError) as exc:
        raise StrategyIRCompileError([
            _issue("draft", "invalid_shape", "草稿必须包含有效的 symbol、快线和慢线。"),
        ]) from exc
    if draft != compile_strategy_ir(ir):
        raise StrategyIRCompileError([
            _issue("draft", "semantic_drift", "草稿字段、来源或执行语义已发生漂移。"),
        ])
    return ir


def parse_strategy_ir(description: str) -> JSONDict:
    """Parse the MA-crossover allowlist; reject incomplete or executable descriptions."""
    text = " ".join(description.strip().split())
    issues: list[JSONDict] = []
    if _EXECUTABLE.search(text):
        issues.append(_issue("description", "executable_content", "描述不得包含代码或可执行表达式。"))
    if _AMBIGUOUS.search(text):
        issues.append(_issue("description", "ambiguous", "描述包含模糊或备选条件，请只保留一套明确规则。"))
    if _UNSUPPORTED.search(text):
        issues.append(_issue("strategy_type", "unsupported", "当前仅支持简单移动平均线上下穿策略。"))

    symbols = _symbols(text)
    if not symbols:
        issues.append(_issue("instrument.symbol", "missing", "必须显式提供一个 ticker。"))
    elif len(symbols) != 1:
        issues.append(_issue("instrument.symbol", "ambiguous", "一次只能描述一个 ticker。"))

    windows = _windows(text)
    if len(windows) != 2:
        code = "missing" if len(windows) < 2 else "ambiguous"
        issues.append(_issue("windows", code, "必须明确且只使用两个均线窗口。"))
    elif not (2 <= windows[0] <= 200 and 3 <= windows[1] <= 250):
        issues.append(_issue("windows", "out_of_range", "快线须为 2-200，慢线须为 3-250。"))
    elif windows[0] >= windows[1]:
        issues.append(_issue("windows", "invalid_relationship", "描述中的第一条快线必须小于第二条慢线。"))

    has_above = bool(re.search(r"上穿|金叉|cross(?:es)? above", text, re.IGNORECASE))
    has_below = bool(re.search(r"下穿|死叉|cross(?:es)? below", text, re.IGNORECASE))
    has_buy = bool(re.search(r"买入|做多|\bbuy\b|\blong\b", text, re.IGNORECASE))
    has_sell = bool(re.search(r"卖出|平仓|\bsell\b|\bflat\b|\bexit\b", text, re.IGNORECASE))
    if not (has_above and has_buy):
        issues.append(_issue("conditions.entry", "missing", "必须明确快线上穿慢线后转为 long。"))
    if not (has_below and has_sell):
        issues.append(_issue("conditions.exit", "missing", "必须明确快线下穿慢线后转为 flat。"))

    if not re.search(r"日线|daily|\b1d\b", text, re.IGNORECASE):
        issues.append(_issue("data.frequency", "missing", "必须明确使用日线数据。"))
    has_close = bool(re.search(r"收盘|(?:at|on) (?:the )?close|close confirmation", text, re.IGNORECASE))
    has_next_open = bool(re.search(
        r"下一(?:个)?交易日(?:的)?开盘|next (?:trading )?(?:day )?open|next open",
        text,
        re.IGNORECASE,
    ))
    if not (has_close and has_next_open):
        issues.append(_issue("execution", "missing", "必须明确收盘确认、下一交易日开盘执行。"))

    if issues:
        raise StrategyIRParseError(issues)

    fast, slow = windows
    return _build_ir(symbols[0], fast, slow)
