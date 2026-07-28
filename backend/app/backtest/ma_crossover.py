"""Deterministic long-only MA crossover backtest with explicit trading costs."""
from __future__ import annotations

import math

import numpy as np

from ..services.indicators import sma


def validate_bars(bars: list[dict], long_window: int) -> None:
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
    bars: list[dict],
    *,
    short_window: int,
    long_window: int,
    initial_capital: float,
    commission_bps: float,
    slippage_bps: float,
) -> dict:
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
    if commission_bps < 0 or slippage_bps < 0:
        raise ValueError("手续费和滑点不能为负数")
    validate_bars(bars, long_window)

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
    cash = float(initial_capital)
    shares = 0.0
    entry: dict | None = None
    trades: list[dict] = []
    order_marks: list[dict] = []
    turnover_notional = 0.0
    equity_values: list[float] = []

    for index, day in enumerate(days):
        target = int(targets[index - 1]) if index > 0 else 0
        open_price = float(opens[index])

        if target == 1 and shares == 0:
            fill_price = open_price * (1.0 + slippage)
            shares = cash / (fill_price * (1.0 + commission))
            notional = shares * fill_price
            fee = notional * commission
            cash -= notional + fee
            turnover_notional += notional
            entry = {
                "entry_time": day,
                "entry_price": fill_price,
                "quantity": shares,
                "entry_fee": fee,
                "entry_notional": notional,
                "entry_slippage_cost": shares * (fill_price - open_price),
            }
            order_marks.append({"time": day, "price": fill_price, "side": "buy"})

        elif target == 0 and shares > 0 and entry is not None:
            fill_price = open_price * (1.0 - slippage)
            notional = shares * fill_price
            fee = notional * commission
            cash += notional - fee
            turnover_notional += notional
            pnl = (notional - fee) - (entry["entry_notional"] + entry["entry_fee"])
            trades.append({
                **entry,
                "exit_time": day,
                "exit_price": fill_price,
                "exit_fee": fee,
                "exit_notional": notional,
                "exit_slippage_cost": shares * (open_price - fill_price),
                "pnl": pnl,
                "return": pnl / (entry["entry_notional"] + entry["entry_fee"]),
                "forced_exit": False,
            })
            order_marks.append({"time": day, "price": fill_price, "side": "sell"})
            shares = 0.0
            entry = None

        equity_values.append(cash + shares * float(closes[index]))

    warnings: list[str] = []
    if shares > 0 and entry is not None:
        market_price = float(closes[-1])
        fill_price = market_price * (1.0 - slippage)
        notional = shares * fill_price
        fee = notional * commission
        cash += notional - fee
        turnover_notional += notional
        pnl = (notional - fee) - (entry["entry_notional"] + entry["entry_fee"])
        trades.append({
            **entry,
            "exit_time": days[-1],
            "exit_price": fill_price,
            "exit_fee": fee,
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

    equity = np.asarray(equity_values, dtype=float)
    benchmark = initial_capital * closes / closes[0]
    running_peak = np.maximum.accumulate(equity)
    drawdown = equity / running_peak - 1.0
    daily_returns = np.diff(equity, prepend=equity[0]) / np.maximum(
        np.roll(equity, 1), 1e-12
    )
    daily_returns[0] = 0.0

    total_return = equity[-1] / initial_capital - 1.0
    benchmark_return = benchmark[-1] / initial_capital - 1.0
    periods = max(len(equity) - 1, 1)
    annualized_return = (max(equity[-1], 1e-12) / initial_capital) ** (252.0 / periods) - 1.0
    volatility = float(np.std(daily_returns, ddof=1)) if len(daily_returns) > 1 else 0.0
    sharpe = float(np.mean(daily_returns) / volatility * math.sqrt(252)) if volatility > 0 else None
    downside = daily_returns[daily_returns < 0]
    downside_dev = float(np.std(downside, ddof=1)) if len(downside) > 1 else 0.0
    sortino = float(np.mean(daily_returns) / downside_dev * math.sqrt(252)) if downside_dev > 0 else None

    wins = [trade["pnl"] for trade in trades if trade["pnl"] > 0]
    losses = [trade["pnl"] for trade in trades if trade["pnl"] < 0]
    win_rate = len(wins) / len(trades) if trades else None
    profit_factor = sum(wins) / abs(sum(losses)) if losses else None
    if not trades:
        warnings.append("no_trades_in_period")
    if profit_factor is None and wins:
        warnings.append("profit_factor_undefined_without_losses")

    def curve(values: np.ndarray) -> list[dict]:
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
            "total_return": round(float(total_return), 8),
            "annualized_return": round(float(annualized_return), 8),
            "benchmark_return": round(float(benchmark_return), 8),
            "excess_return": round(float(total_return - benchmark_return), 8),
            "max_drawdown": round(float(np.min(drawdown)), 8),
            "sharpe_ratio": round(sharpe, 8) if sharpe is not None else None,
            "sortino_ratio": round(sortino, 8) if sortino is not None else None,
            "win_rate": round(float(win_rate), 8) if win_rate is not None else None,
            "profit_factor": round(float(profit_factor), 8) if profit_factor is not None else None,
            "turnover": round(float(turnover_notional / initial_capital), 8),
            "trade_count": len(trades),
        },
        "equity_curve": curve(equity),
        "benchmark_curve": curve(benchmark),
        "drawdown_curve": curve(drawdown),
        "trades": cleaned_trades,
        "order_marks": order_marks,
        "warnings": warnings,
    }
