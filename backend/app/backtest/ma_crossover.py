"""Deterministic long-only MA crossover backtest with explicit trading costs."""
from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any, cast

import numpy as np

from ..services.indicators import sma
from .execution_rules import execution_rules_for
from .metrics import calculate_performance, calculate_trade_metrics, calculate_trade_quality

JSONDict = dict[str, Any]


def validate_bars(bars: list[JSONDict], long_window: int) -> None:
    if not bars:
        raise ValueError("回测区间没有可用行情数据")
    if len(bars) < long_window + 2:
        raise ValueError(f"K线数据不足：需要至少 {long_window + 2} 条，实际 {len(bars)} 条")
    for index, bar in enumerate(bars):
        for field in ("open", "high", "low", "close"):
            value = bar.get(field)
            if value is None or not math.isfinite(float(value)) or float(value) <= 0:
                raise ValueError(f"第 {index + 1} 条K线的 {field} 无效")


def run_ma_crossover(
    bars: list[JSONDict],
    *,
    short_window: int,
    long_window: int,
    initial_capital: float,
    commission_bps: float,
    slippage_bps: float,
    sell_stamp_duty_bps: float = 0,
    minimum_commission_cny: float = 0,
    symbol: str | None = None,
    period: str = "1d",
    market_rules: str = "auto",
    price_limit_ratio: float | None = None,
    max_drawdown_stop_pct: float = 0,
) -> JSONDict:
    """Run a no-lookahead, next-open execution simulation.

    A cross observed on day T's close changes the target position at day T+1's
    open. The final open position is closed at the last close so all reported
    trade metrics include both entry and exit costs.
    """
    if short_window < 2:
        raise ValueError("short_window 必须大于等于 2")
    if long_window <= short_window:
        raise ValueError("long_window 必须大于 short_window")
    if initial_capital <= 0:
        raise ValueError("initial_capital 必须大于 0")
    if min(commission_bps, slippage_bps, sell_stamp_duty_bps, minimum_commission_cny) < 0:
        raise ValueError("交易成本不能为负数")
    if not 0 <= max_drawdown_stop_pct < 1:
        raise ValueError("回撤止损必须在 0% 到 100% 之间")
    validate_bars(bars, long_window)
    rules = execution_rules_for(
        symbol,
        mode=market_rules,
        price_limit_ratio=price_limit_ratio,
    )

    days = [str(bar["day"]) for bar in bars]
    opens = np.asarray([bar["open"] for bar in bars], dtype=float)
    closes = np.asarray([bar["close"] for bar in bars], dtype=float)
    short_ma = sma(closes, short_window)
    long_ma = sma(closes, long_window)

    targets = np.zeros(len(bars), dtype=int)
    valid = ~(np.isnan(short_ma) | np.isnan(long_ma))
    targets[valid & (short_ma > long_ma)] = 1

    commission = commission_bps / 10_000.0
    slippage = slippage_bps / 10_000.0
    stamp_duty = sell_stamp_duty_bps / 10_000.0 if rules.market == "CN" else 0.0
    minimum_commission = minimum_commission_cny if rules.market == "CN" else 0.0

    def commission_fee(notional: float) -> float:
        if commission <= 0:
            return 0.0
        return max(notional * commission, minimum_commission)
    cash = float(initial_capital)
    shares = 0.0
    entry: JSONDict | None = None
    trades: list[JSONDict] = []
    order_marks: list[JSONDict] = []
    rejected_orders: list[JSONDict] = []
    turnover_notional = 0.0
    total_commission_cost = 0.0
    total_stamp_duty_cost = 0.0
    total_slippage_cost = 0.0
    equity_values: list[float] = []
    exposure_flags: list[bool] = []
    peak_equity = float(initial_capital)
    risk_stop_pending = False
    risk_stop_locked = False
    risk_stop_dates: list[str] = []

    for index, day in enumerate(days):
        target = int(targets[index - 1]) if index > 0 else 0
        if risk_stop_pending:
            target = 0
        elif risk_stop_locked and target == 0:
            risk_stop_locked = False
        open_price = float(opens[index])
        previous_close = float(closes[index - 1]) if index > 0 else None

        if target == 1 and shares == 0 and not risk_stop_locked:
            allowed, reason = rules.check_fill(
                "buy", bars[index], previous_close=previous_close
            )
            if not allowed:
                rejected_orders.append({"time": day, "side": "buy", "reason": reason})
                equity_values.append(cash)
                exposure_flags.append(False)
                continue
            fill_price = open_price * (1.0 + slippage)
            shares = cash / (fill_price * (1.0 + commission))
            if commission > 0 and minimum_commission > 0 and shares * fill_price * commission < minimum_commission:
                shares = max(0.0, (cash - minimum_commission) / fill_price)
            notional = shares * fill_price
            fee = commission_fee(notional)
            cash -= notional + fee
            turnover_notional += notional
            total_commission_cost += fee
            total_slippage_cost += shares * (fill_price - open_price)
            entry = {
                "entry_time": day,
                "entry_price": fill_price,
                "quantity": shares,
                "entry_fee": fee,
                "entry_commission": fee,
                "entry_stamp_duty": 0.0,
                "entry_notional": notional,
                "entry_slippage_cost": shares * (fill_price - open_price),
            }
            order_marks.append({"time": day, "price": fill_price, "side": "buy"})

        elif target == 0 and shares > 0 and entry is not None:
            stopped_for_drawdown = risk_stop_pending
            allowed, reason = rules.check_fill(
                "sell",
                bars[index],
                previous_close=previous_close,
                entry_date=_trade_date(entry["entry_time"]),
            )
            if not allowed:
                rejected_orders.append({"time": day, "side": "sell", "reason": reason})
                equity_values.append(cash + shares * float(closes[index]))
                exposure_flags.append(True)
                continue
            fill_price = open_price * (1.0 - slippage)
            notional = shares * fill_price
            commission_fee_value = commission_fee(notional)
            stamp_duty_fee = notional * stamp_duty
            fee = commission_fee_value + stamp_duty_fee
            cash += notional - fee
            turnover_notional += notional
            total_commission_cost += commission_fee_value
            total_stamp_duty_cost += stamp_duty_fee
            total_slippage_cost += shares * (open_price - fill_price)
            pnl = (notional - fee) - (entry["entry_notional"] + entry["entry_fee"])
            trades.append({
                **entry,
                "exit_time": day,
                "exit_price": fill_price,
                "exit_fee": fee,
                "exit_commission": commission_fee_value,
                "exit_stamp_duty": stamp_duty_fee,
                "exit_notional": notional,
                "exit_slippage_cost": shares * (open_price - fill_price),
                "pnl": pnl,
                "return": pnl / (entry["entry_notional"] + entry["entry_fee"]),
                "forced_exit": False,
                "risk_stop_triggered": stopped_for_drawdown,
            })
            order_marks.append({"time": day, "price": fill_price, "side": "sell"})
            shares = 0.0
            entry = None
            if stopped_for_drawdown:
                risk_stop_pending = False
                risk_stop_locked = True

        equity_value = cash + shares * float(closes[index])
        equity_values.append(equity_value)
        exposure_flags.append(shares > 0)
        peak_equity = max(peak_equity, equity_value)
        if (
            max_drawdown_stop_pct > 0
            and shares > 0
            and not risk_stop_pending
            and not risk_stop_locked
            and equity_value / peak_equity - 1.0 <= -max_drawdown_stop_pct
        ):
            risk_stop_pending = True
            risk_stop_dates.append(day)

    warnings: list[str] = []
    if shares > 0 and entry is not None:
        market_price = float(closes[-1])
        previous_close = float(closes[-2]) if len(closes) > 1 else None
        allowed, reason = rules.check_fill(
            "sell",
            {**bars[-1], "open": market_price},
            previous_close=previous_close,
            entry_date=_trade_date(entry["entry_time"]),
        )
        if allowed:
            fill_price = market_price * (1.0 - slippage)
            notional = shares * fill_price
            commission_fee_value = commission_fee(notional)
            stamp_duty_fee = notional * stamp_duty
            fee = commission_fee_value + stamp_duty_fee
            cash += notional - fee
            turnover_notional += notional
            total_commission_cost += commission_fee_value
            total_stamp_duty_cost += stamp_duty_fee
            total_slippage_cost += shares * (market_price - fill_price)
            pnl = (notional - fee) - (entry["entry_notional"] + entry["entry_fee"])
            trades.append({
                **entry,
                "exit_time": days[-1],
                "exit_price": fill_price,
                "exit_fee": fee,
                "exit_commission": commission_fee_value,
                "exit_stamp_duty": stamp_duty_fee,
                "exit_notional": notional,
                "exit_slippage_cost": shares * (market_price - fill_price),
                "pnl": pnl,
                "return": pnl / (entry["entry_notional"] + entry["entry_fee"]),
                "forced_exit": True,
            })
            order_marks.append({"time": days[-1], "price": fill_price, "side": "sell"})
            shares = 0.0
            equity_values[-1] = cash
            warnings.append("position_forced_closed_at_end")
        else:
            rejected_orders.append({"time": days[-1], "side": "sell", "reason": reason})
            warnings.append(f"position_open_at_end_due_to_{reason}")

    equity = np.asarray(equity_values, dtype=float)
    benchmark = initial_capital * closes / closes[0]
    running_peak = np.maximum.accumulate(equity)
    drawdown = equity / running_peak - 1.0
    performance = calculate_performance(
        cast(Sequence[float], equity),
        cast(Sequence[float], benchmark),
        252,
    )
    trade_metrics = calculate_trade_metrics([trade["pnl"] for trade in trades])
    day_indices = {day: index for index, day in enumerate(days)}
    trade_quality = calculate_trade_quality(
        [trade["return"] for trade in trades],
        [
            day_indices[str(trade["exit_time"])] - day_indices[str(trade["entry_time"])]
            for trade in trades
        ],
    )
    total_trading_cost = total_commission_cost + total_stamp_duty_cost + total_slippage_cost
    if not trades:
        warnings.append("no_trades_in_period")
    if risk_stop_dates:
        warnings.append("max_drawdown_stop_triggered")
    if trade_metrics["profit_factor"] is None and any(trade["pnl"] > 0 for trade in trades):
        warnings.append("profit_factor_undefined_without_losses")

    def curve(values: np.ndarray) -> list[JSONDict]:
        return [
            {"time": days[index], "value": round(float(value), 6)}
            for index, value in enumerate(values)
        ]

    cleaned_trades = []
    for trade in trades:
        cleaned_trades.append({
            key: round(float(value), 8) if isinstance(value, (float, np.floating)) else value
            for key, value in trade.items()
        })

    return {
        "metrics": {
            **{
                key: value if value is None or isinstance(value, (bool, int)) else round(value, 8)
                for key, value in performance.items()
            },
            "win_rate": round(float(trade_metrics["win_rate"]), 8)
            if trade_metrics["win_rate"] is not None else None,
            "profit_factor": round(float(trade_metrics["profit_factor"]), 8)
            if trade_metrics["profit_factor"] is not None else None,
            "turnover": round(float(turnover_notional / initial_capital), 8),
            "trade_count": trade_metrics["trade_count"],
            **{
                key: round(value, 8) if value is not None else None
                for key, value in trade_quality.items()
            },
            "market_exposure": round(sum(exposure_flags) / len(exposure_flags), 8),
            "total_commission_cost": round(total_commission_cost, 8),
            "total_stamp_duty_cost": round(total_stamp_duty_cost, 8),
            "total_slippage_cost": round(total_slippage_cost, 8),
            "total_trading_cost": round(total_trading_cost, 8),
            "trading_cost_ratio": round(total_trading_cost / initial_capital, 8),
        },
        "equity_curve": curve(equity),
        "benchmark_curve": curve(benchmark),
        "drawdown_curve": curve(drawdown),
        "trades": cleaned_trades,
        "order_marks": order_marks,
        "rejected_orders": rejected_orders,
        "execution_rules": {**rules.metadata(), "period": period},
        "risk_controls": {
            "max_drawdown_stop_pct": max_drawdown_stop_pct or None,
            "trigger_count": len(risk_stop_dates),
            "trigger_dates": risk_stop_dates,
            "execution": "close_threshold_then_next_open_exit",
        },
        "warnings": warnings,
    }


def _trade_date(value: object) -> str:
    return str(value)[:10]
