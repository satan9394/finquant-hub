"""向量化回测引擎：策略信号生成 + P&L 计算 + 绩效指标。

内置策略：
- ma_cross: 双均线金叉/死叉
- rsi_reversal: RSI 超买超卖反转
- bollinger_breakout: 布林带突破（价格突破上/下轨后回归）

所有计算基于 numpy 向量化，输入 OHLCV list[dict]。
"""
from collections.abc import Callable, Sequence
from typing import Any, cast

import numpy as np

from .metrics import calculate_performance, calculate_trade_metrics

# ---------------------------------------------------------------------------
# 信号生成
# ---------------------------------------------------------------------------


JSONDict = dict[str, Any]


def _to_arr(v: list[float]) -> np.ndarray:
    return np.asarray(v, dtype=float)


def _sma(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full_like(x, np.nan, dtype=float)
    if len(x) >= n:
        cumsum = np.cumsum(np.insert(x, 0, 0.0))
        out[n - 1:] = (cumsum[n:] - cumsum[:-n]) / n
    return out


def _ema(x: np.ndarray, n: int) -> np.ndarray:
    out = np.empty_like(x, dtype=float)
    out[0] = x[0]
    alpha = 2.0 / (n + 1)
    for i in range(1, len(x)):
        out[i] = alpha * x[i] + (1 - alpha) * out[i - 1]
    return out


def _rolling_std(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full_like(x, np.nan, dtype=float)
    for i in range(n - 1, len(x)):
        out[i] = np.std(x[i - n + 1: i + 1], ddof=0)
    return out


# ===================================================================
# 策略信号
# ===================================================================

def _signal_ma_cross(close: np.ndarray, fast: int = 10, slow: int = 30) -> np.ndarray:
    """双均线交叉策略：
    - 金叉 (fast 上穿 slow) → +1 (买入)
    - 死叉 (fast 下穿 slow) → -1 (卖出)
    - 其余 → 0 (持仓/空仓)
    """
    ma_fast = _sma(close, fast)
    ma_slow = _sma(close, slow)
    signals = np.zeros_like(close)
    for i in range(1, len(close)):
        if np.isnan(ma_fast[i]) or np.isnan(ma_slow[i]):
            continue
        prev_f, prev_s = ma_fast[i - 1], ma_slow[i - 1]
        if not np.isnan(prev_f) and not np.isnan(prev_s):
            if prev_f <= prev_s and ma_fast[i] > ma_slow[i]:
                signals[i] = 1.0   # 金叉买入
            elif prev_f >= prev_s and ma_fast[i] < ma_slow[i]:
                signals[i] = -1.0  # 死叉卖出
    return signals


def _signal_rsi_reversal(close: np.ndarray, period: int = 14,
                         oversold: float = 30.0, overbought: float = 70.0) -> np.ndarray:
    """RSI 反转策略：
    - RSI 从超卖区上穿 → +1 (买入)
    - RSI 从超买区下穿 → -1 (卖出)
    """
    diff = np.diff(close, prepend=close[0])
    up = np.maximum(diff, 0.0)
    dn = np.abs(np.minimum(diff, 0.0))

    avg_gain = np.full_like(close, np.nan, dtype=float)
    avg_loss = np.full_like(close, np.nan, dtype=float)

    # Wilder 平滑 RSI
    avg_gain[0] = up[0]
    avg_loss[0] = dn[0] if dn[0] != 0 else 0.001
    alpha = 1.0 / period
    for i in range(1, len(close)):
        avg_gain[i] = alpha * up[i] + (1 - alpha) * avg_gain[i - 1]
        avg_loss[i] = alpha * dn[i] + (1 - alpha) * avg_loss[i - 1]

    with np.errstate(invalid="ignore", divide="ignore"):
        rs = np.where(avg_loss == 0, 100.0, avg_gain / avg_loss)
        rsi = 100.0 - (100.0 / (1.0 + rs))

    signals = np.zeros_like(close)
    for i in range(1, len(close)):
        if np.isnan(rsi[i]) or np.isnan(rsi[i - 1]):
            continue
        # 从超卖区上穿
        if rsi[i - 1] <= oversold and rsi[i] > oversold:
            signals[i] = 1.0
        # 从超买区下穿
        elif rsi[i - 1] >= overbought and rsi[i] < overbought:
            signals[i] = -1.0
    return signals


def _signal_bollinger_breakout(close: np.ndarray, period: int = 20, k: float = 2.0) -> np.ndarray:
    """布林带突破策略：
    - 收盘价跌破下轨 → +1 (买入，预期回归)
    - 收盘价突破上轨 → -1 (卖出，预期回归)
    """
    mid = _sma(close, period)
    std = _rolling_std(close, period)
    upper = mid + k * std
    lower = mid - k * std

    signals = np.zeros_like(close)
    for i in range(1, len(close)):
        if np.isnan(close[i]) or np.isnan(upper[i]) or np.isnan(lower[i]):
            continue
        if close[i] < lower[i] and not (np.isnan(close[i-1]) or np.isnan(lower[i-1])) and close[i-1] >= lower[i-1]:
            signals[i] = 1.0   # 跌破下轨买入
        elif close[i] > upper[i] and not (np.isnan(close[i-1]) or np.isnan(upper[i-1])) and close[i-1] <= upper[i-1]:
            signals[i] = -1.0  # 突破上轨卖出
    return signals


# 策略注册表
_STRATEGIES: dict[str, Callable[..., np.ndarray]] = {
    "ma_cross": _signal_ma_cross,
    "rsi_reversal": _signal_rsi_reversal,
    "bollinger_breakout": _signal_bollinger_breakout,
}

SUPPORTED_STRATEGIES = list(_STRATEGIES.keys())


# ===================================================================
# 回测核心
# ===================================================================

def _calc_positions(signals: np.ndarray) -> np.ndarray:
    """信号转持仓：+1 全仓买入，-1 清仓，0 保持。
    注意：信号只在变化时触发，其余时间 direction=0 表示维持。
    """
    pos = np.zeros_like(signals)
    in_position = False
    for i in range(len(signals)):
        if signals[i] == 1.0:
            in_position = True
        elif signals[i] == -1.0:
            in_position = False
        pos[i] = 1.0 if in_position else 0.0
    return pos


def run_backtest(
    kline: list[JSONDict],
    strategy_type: str = "ma_cross",
    params: JSONDict | None = None,
    periods: int | None = None,
) -> JSONDict:
    """执行向量化回测。

    参数：
        kline: OHLCV 列表，每项含 day/open/high/low/close/volume
        strategy_type: 策略名（ma_cross / rsi_reversal / bollinger_breakout）
        params: 策略参数，如 {"fast": 10, "slow": 30}
        periods: 可选，限制回测周期数

    返回：
        dict 包含 equity_curve、trades、绩效指标
    """
    if not kline or len(kline) < 50:
        return {"error": "K线数据不足（至少50个交易日）"}

    # 截取 periods
    if periods and periods < len(kline):
        kline = kline[-periods:]

    close = _to_arr([k["close"] for k in kline])
    days = [k["day"] for k in kline]

    strategy_fn = _STRATEGIES.get(strategy_type)
    if strategy_fn is None:
        return {"error": f"未知策略：{strategy_type}，支持 {SUPPORTED_STRATEGIES}"}

    p = params or {}
    if strategy_type == "ma_cross":
        signals = strategy_fn(close, fast=p.get("fast", 10), slow=p.get("slow", 30))
    elif strategy_type == "rsi_reversal":
        signals = strategy_fn(close, period=p.get("period", 14),
                              oversold=p.get("oversold", 30.0), overbought=p.get("overbought", 70.0))
    elif strategy_type == "bollinger_breakout":
        signals = strategy_fn(close, period=p.get("period", 20), k=p.get("k", 2.0))
    else:
        signals = strategy_fn(close)

    positions = _calc_positions(signals)
    # 策略收益 = 持仓 * 当日收益率
    strat_returns = positions * np.diff(close, prepend=close[0]) / np.maximum(close, 0.001)

    # 初始净值 1.0
    equity = 1.0 + np.cumsum(strat_returns)

    # 记录交易
    trades: list[JSONDict] = []
    entry_price = 0.0
    entry_day = ""
    for i in range(len(signals)):
        if signals[i] == 1.0:
            entry_price = close[i]
            entry_day = days[i]
        elif signals[i] == -1.0 and entry_price > 0:
            exit_price = close[i]
            ret = (exit_price - entry_price) / entry_price * 100
            trades.append({
                "entry_day": entry_day,
                "exit_day": days[i],
                "entry_price": round(float(entry_price), 2),
                "exit_price": round(float(exit_price), 2),
                "return_pct": round(float(ret), 2),
            })
            entry_price = 0.0

    # 绩效指标
    metrics = _calc_metrics(equity, strat_returns, close, trades)

    # 准备权益曲线
    equity_curve = [
        {"day": days[i], "equity": round(float(equity[i]), 4),
         "signal": int(signals[i]), "position": int(positions[i])}
        for i in range(len(equity))
    ]
    benchmark_equity = close / close[0]
    benchmark_curve = [
        {"day": days[index], "equity": round(float(value), 4)}
        for index, value in enumerate(benchmark_equity)
    ]

    buy_hold_return = (benchmark_equity[-1] - 1.0) * 100

    return {
        "strategy": strategy_type,
        "params": p,
        "period": {"from": days[0], "to": days[-1], "days": len(days)},
        "metrics": metrics,
        "buy_hold_return_pct": round(float(buy_hold_return), 2),
        "trades": trades,
        "equity_curve": equity_curve,
        "benchmark_curve": benchmark_curve,
    }


def _calc_metrics(
    equity: np.ndarray,
    strat_returns: np.ndarray,
    close: np.ndarray,
    trades: list[JSONDict],
) -> JSONDict:
    """计算绩效指标。"""
    benchmark = close / close[0]
    performance = calculate_performance(
        cast(Sequence[float], equity),
        cast(Sequence[float], benchmark),
        252,
    )
    trade_metrics = calculate_trade_metrics([trade["return_pct"] for trade in trades])
    total_return = float(performance["total_return"] or 0.0) * 100
    ann_return = float(performance["annualized_return"] or 0.0) * 100

    # 年化波动率
    non_zero = strat_returns[strat_returns != 0]
    if len(non_zero) > 1:
        daily_vol = float(np.std(non_zero))
    else:
        daily_vol = float(np.nanstd(strat_returns)) if np.nanstd(strat_returns) > 0 else 0.001
    ann_vol = daily_vol * np.sqrt(252) * 100

    # Sharpe ratio (无风险利率 0)
    if ann_vol > 0:
        sharpe = ann_return / ann_vol
    else:
        sharpe = 0.0

    max_drawdown = round(float(performance["max_drawdown"] or 0.0) * 100, 2)

    # 胜率
    non_zero_returns = strat_returns[strat_returns != 0]
    win_rate = float(np.mean(non_zero_returns > 0)) * 100 if len(non_zero_returns) > 0 else 0.0

    return {
        "total_return_pct": round(total_return, 2),
        "annual_return_pct": round(ann_return, 2),
        "annual_volatility_pct": round(ann_vol, 2),
        "sharpe_ratio": round(sharpe, 3),
        "sortino_ratio": round(float(performance["sortino_ratio"]), 3)
        if performance["sortino_ratio"] is not None else None,
        "calmar_ratio": round(float(performance["calmar_ratio"]), 3)
        if performance["calmar_ratio"] is not None else None,
        "information_ratio": round(float(performance["information_ratio"]), 3)
        if performance["information_ratio"] is not None else None,
        "profit_factor": round(float(trade_metrics["profit_factor"]), 3)
        if trade_metrics["profit_factor"] is not None else None,
        "max_drawdown_pct": max_drawdown,
        "win_rate_pct": round(win_rate, 1),
        "trade_count": trade_metrics["trade_count"],
    }
