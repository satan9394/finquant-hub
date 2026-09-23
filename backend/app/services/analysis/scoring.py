"""综合指标评分：趋势强度、动量评分、成交量评分 → 综合评分 -100~+100。

分项满分 100，方向为 bullish(+) / bearish(-)，加权合成综合分。
"""
from typing import Any

import numpy as np

JSONDict = dict[str, Any]


def _skip_nan(arr: np.ndarray) -> np.ndarray:
    return arr[~np.isnan(arr)]


def trend_strength(close: list[float], ma_short: list[float | None],
                   ma_long: list[float | None]) -> JSONDict:
    """趋势强度评分（-100~+100）。

    判断依据：
    - 均线排列（多头/空头排列强度）
    - 价格与均线的乖离率
    """
    c = np.asarray(close, dtype=float)
    s = np.asarray([v if v is not None else np.nan for v in ma_short], dtype=float)
    l = np.asarray([v if v is not None else np.nan for v in ma_long], dtype=float)

    valid = ~(np.isnan(s) | np.isnan(l))
    if valid.sum() < 5:
        return {"score": 0, "detail": "数据不足"}

    c_v, s_v, l_v = c[valid], s[valid], l[valid]

    # 均线排列强度：short > long 的比例
    bullish_ratio = float(np.mean(s_v > l_v))

    # 价格位置：price > short_ma 的比例
    above_ma_ratio = float(np.mean(c_v > s_v))

    # 乖离率均值
    bias = np.mean((c_v - s_v) / s_v) * 100

    # 合成评分
    score = (bullish_ratio - 0.5) * 100 + (above_ma_ratio - 0.5) * 100
    score = max(-100, min(100, score + bias))

    return {
        "score": round(score, 1),
        "detail": {
            "bullish_ratio": round(bullish_ratio, 3),
            "above_ma_ratio": round(above_ma_ratio, 3),
            "avg_bias_pct": round(float(bias), 2),
        },
    }


def momentum_score(
    close: list[float],
    rsi_vals: list[float | None] | None = None,
) -> JSONDict:
    """动量评分（-100~+100）。

    使用 N 日收益率和 RSI 综合判断。
    """
    c = np.asarray(close, dtype=float)

    if len(c) < 21:
        return {"score": 0, "detail": "数据不足（至少21个交易日）"}

    # 多周期收益率
    ret_5 = (c[-1] - c[-5]) / c[-5] * 100 if len(c) >= 5 else 0
    ret_20 = (c[-1] - c[-20]) / c[-20] * 100 if len(c) >= 20 else 0
    ret_60 = (c[-1] - c[-60]) / c[-60] * 100 if len(c) >= 60 else 0

    # 收益率合成动量分（各周期加权）
    momentum_from_ret = ret_5 * 0.5 + ret_20 * 0.3 + ret_60 * 0.2
    momentum_from_ret = max(-100, min(100, momentum_from_ret))

    # RSI 调整
    rsi_score = 0.0
    if rsi_vals:
        rsi_last = [v for v in rsi_vals if v is not None]
        if rsi_last:
            r = rsi_last[-1]
            # RSI 50 为中轴，向两端线性映射到 -50~+50
            rsi_score = (r - 50) / 50 * 50

    score = momentum_from_ret * 0.6 + rsi_score * 0.4
    score = max(-100, min(100, score))

    return {
        "score": round(score, 1),
        "detail": {
            "ret_5d_pct": round(float(ret_5), 2),
            "ret_20d_pct": round(float(ret_20), 2),
            "ret_60d_pct": round(float(ret_60), 2),
            "rsi_adjustment": round(float(rsi_score), 1),
        },
    }


def volume_score(volume: list[float], volma: list[float | None]) -> JSONDict:
    """成交量评分（-100~+100）。

    放量上涨偏正，放量下跌偏负；缩量横盘中性。
    """
    v = np.asarray(volume, dtype=float)
    vm = np.asarray([x if x is not None else np.nan for x in volma], dtype=float)

    valid = ~np.isnan(vm)
    if valid.sum() < 10:
        return {"score": 0, "detail": "数据不足"}

    v_v, vm_v = v[valid], vm[valid]
    ratios = v_v / np.where(vm_v > 0, vm_v, 1)
    avg_ratio = float(np.mean(ratios))

    # 放量程度评分：ratio 1.0 -> 0, 2.0 -> 50, 3.0 -> 100
    vol_intensity = (avg_ratio - 1.0) * 50
    vol_intensity = max(-100, min(100, vol_intensity))

    score = vol_intensity
    return {
        "score": round(score, 1),
        "detail": {
            "avg_volume_ratio": round(avg_ratio, 2),
            "vol_intensity": round(vol_intensity, 1),
        },
    }


def composite_score(close: list[float],
                    ma_short: list[float | None],
                    ma_long: list[float | None],
                    volume: list[float],
                    volma: list[float | None],
                    rsi_vals: list[float | None] | None = None) -> JSONDict:
    """综合评分 -100~+100。

    权重：趋势 40%，动量 35%，成交量 25%。
    """
    trend = trend_strength(close, ma_short, ma_long)
    momentum = momentum_score(close, rsi_vals)
    vol = volume_score(volume, volma)

    total = trend["score"] * 0.4 + momentum["score"] * 0.35 + vol["score"] * 0.25
    total = max(-100, min(100, total))

    return {
        "composite_score": round(total, 1),
        "components": {
            "trend": trend,
            "momentum": momentum,
            "volume": vol,
        },
    }
