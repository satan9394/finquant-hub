"""信号检测：金叉/死叉/背离/突破/放量/RSI超买超卖。

输入为 indicators.compute 输出的原始指标序列，
返回信号列表（信号名、位置、方向、置信度）。
"""
import numpy as np


def _to_arr(v: list) -> np.ndarray:
    return np.asarray(v, dtype=float)


def golden_cross(macd: dict) -> list[dict]:
    """MACD 金叉：DIF 上穿 DEA。"""
    dif = _to_arr(macd["dif"])
    dea = _to_arr(macd["dea"])
    signals = []
    for i in range(1, len(dif)):
        if np.isnan(dif[i]) or np.isnan(dea[i]):
            continue
        prev_d, prev_da = dif[i - 1], dea[i - 1]
        if (not np.isnan(prev_d) and not np.isnan(prev_da)
                and prev_d <= prev_da and dif[i] > dea[i]):
            signals.append({
                "type": "golden_cross",
                "index": i,
                "direction": "bullish",
                "confidence": "high",
                "description": f"MACD金叉：DIF={dif[i]:.2f}上穿DEA={dea[i]:.2f}",
            })
    return signals


def death_cross(macd: dict) -> list[dict]:
    """MACD 死叉：DIF 下穿 DEA。"""
    dif = _to_arr(macd["dif"])
    dea = _to_arr(macd["dea"])
    signals = []
    for i in range(1, len(dif)):
        if np.isnan(dif[i]) or np.isnan(dea[i]):
            continue
        prev_d, prev_da = dif[i - 1], dea[i - 1]
        if (not np.isnan(prev_d) and not np.isnan(prev_da)
                and prev_d >= prev_da and dif[i] < dea[i]):
            signals.append({
                "type": "death_cross",
                "index": i,
                "direction": "bearish",
                "confidence": "high",
                "description": f"MACD死叉：DIF={dif[i]:.2f}下穿DEA={dea[i]:.2f}",
            })
    return signals


def divergence(macd: dict, close: list[float]) -> list[dict]:
    """MACD 顶背离/底背离：价格与 DIF 反向运动。

    顶背离：价格新高，DIF 未新高 → 看跌
    底背离：价格新低，DIF 未新低 → 看涨
    """
    dif = _to_arr(macd["dif"])
    c = _to_arr(close)
    signals = []
    window = 20  # 检测窗口

    for i in range(window, len(dif)):
        if np.isnan(dif[i]) or np.isnan(c[i]):
            continue
        # 找窗口内最高点/最低点
        prev_high_idx = i - int(np.argmax(c[i - window:i]))
        prev_low_idx = i - int(np.argmin(c[i - window:i]))

        # 顶背离：价格创 window 新高，DIF 未同步新高
        if c[i] > c[prev_high_idx] and dif[i] < dif[prev_high_idx]:
            signals.append({
                "type": "top_divergence",
                "index": i,
                "direction": "bearish",
                "confidence": "medium",
                "description": f"MACD顶背离：价格新高{c[i]:.2f}但DIF未新高{dif[i]:.2f}",
            })

        # 底背离：价格创 window 新低，DIF 未同步新低
        if c[i] < c[prev_low_idx] and dif[i] > dif[prev_low_idx]:
            signals.append({
                "type": "bottom_divergence",
                "index": i,
                "direction": "bullish",
                "confidence": "medium",
                "description": f"MACD底背离：价格新低{c[i]:.2f}但DIF未新低{dif[i]:.2f}",
            })

    return signals


def breakout(close: list[float], high: list[float], low: list[float], period: int = 20) -> list[dict]:
    """突破信号：收盘价突破period内最高价（向上突破）或跌破period内最低价（向下突破）。"""
    c = _to_arr(close)
    h = _to_arr(high)
    lo = _to_arr(low)
    signals = []

    for i in range(period, len(c)):
        if np.isnan(c[i]):
            continue
        high_since = np.max(h[i - period:i])
        low_since = np.min(lo[i - period:i])

        # 向上突破
        if c[i] > high_since and c[i - 1] <= high_since:
            signals.append({
                "type": "breakout_up",
                "index": i,
                "direction": "bullish",
                "confidence": "high",
                "description": f"向上突破{period}日高点{high_since:.2f}，收盘{c[i]:.2f}",
            })
        # 向下突破
        if c[i] < low_since and c[i - 1] >= low_since:
            signals.append({
                "type": "breakout_down",
                "index": i,
                "direction": "bearish",
                "confidence": "high",
                "description": f"向下突破{period}日低点{low_since:.2f}，收盘{c[i]:.2f}",
            })

    return signals


def volume_surge(volume: list[float], multiplier: float = 2.0, window: int = 20) -> list[dict]:
    """放量信号：成交量超过过去window日均量的multiplier倍。"""
    v = _to_arr(volume)
    signals = []

    for i in range(window, len(v)):
        if np.isnan(v[i]):
            continue
        avg_vol = np.mean(v[i - window:i])
        if avg_vol == 0:
            continue
        ratio = v[i] / avg_vol
        if ratio >= multiplier:
            signals.append({
                "type": "volume_surge",
                "index": i,
                "direction": "neutral",
                "confidence": "medium",
                "description": f"放量信号：当日量{v[i]:.0f}是{window}日均量{avg_vol:.0f}的{ratio:.1f}倍",
            })

    return signals


def rsi_oversold(rsi: list[float], threshold: float = 30.0) -> list[dict]:
    """RSI 进入超卖区：只在穿越阈值时记录一次。"""
    r = _to_arr(rsi)
    signals = []
    for i in range(len(r)):
        if np.isnan(r[i]):
            continue
        previous = r[i - 1] if i else np.nan
        if r[i] < threshold and (i == 0 or np.isnan(previous) or previous >= threshold):
            signals.append({
                "type": "rsi_oversold",
                "index": i,
                "direction": "bullish",
                "confidence": "medium",
                "description": f"RSI超卖：RSI={r[i]:.1f}，低于{threshold}",
            })
    return signals


def rsi_overbought(rsi: list[float], threshold: float = 70.0) -> list[dict]:
    """RSI 进入超买区：只在穿越阈值时记录一次。"""
    r = _to_arr(rsi)
    signals = []
    for i in range(len(r)):
        if np.isnan(r[i]):
            continue
        previous = r[i - 1] if i else np.nan
        if r[i] > threshold and (i == 0 or np.isnan(previous) or previous <= threshold):
            signals.append({
                "type": "rsi_overbought",
                "index": i,
                "direction": "bearish",
                "confidence": "medium",
                "description": f"RSI超买：RSI={r[i]:.1f}，高于{threshold}",
            })
    return signals


def _recent_unique(sigs: list[dict], latest_index: int, lookback: int = 20) -> list[dict]:
    """保留最近窗口内每类最新事件，避免历史状态淹没当前决策。"""
    minimum_index = max(0, latest_index - lookback + 1)
    newest_by_type: dict[str, dict] = {}
    for signal in sigs:
        if signal["index"] < minimum_index:
            continue
        previous = newest_by_type.get(signal["type"])
        if previous is None or signal["index"] >= previous["index"]:
            newest_by_type[signal["type"]] = signal
    return sorted(newest_by_type.values(), key=lambda signal: signal["index"])


def detect_all(indicators: dict, close: list[float], high: list[float],
               low: list[float], volume: list[float]) -> list[dict]:
    """运行全部信号检测，返回近期且每类唯一的事件。"""
    sigs = []

    macd = indicators.get("macd", {})
    if macd.get("dif") and macd.get("dea"):
        sigs.extend(golden_cross(macd))
        sigs.extend(death_cross(macd))
        sigs.extend(divergence(macd, close))

    sigs.extend(breakout(close, high, low))

    if volume:
        sigs.extend(volume_surge(volume))

    rsi = indicators.get("rsi", {})
    for key, vals in rsi.items():
        if vals:
            sigs.extend(rsi_oversold(vals))
            sigs.extend(rsi_overbought(vals))

    return _recent_unique(sigs, len(close) - 1)
