"""技术指标计算（numpy）。

约定（A 股通用口径）：
- MACD(12,26,9)：DIF=EMA12-EMA26，DEA=EMA9(DIF)，柱=2×(DIF-DEA)
- RSI / KDJ / ATR 使用 SMA(X,N,1) 递推（Wilder 平滑）：Y = (X + (N-1)·Y') / N
- 所有输出与输入等长，warmup 期为 None（JSON 序列化为 null）
"""
import numpy as np


def _to_float_list(arr: np.ndarray, digits: int = 4) -> list[float | None]:
    out = []
    for v in arr:
        out.append(None if np.isnan(v) else round(float(v), digits))
    return out


def sma(x: np.ndarray, n: int) -> np.ndarray:
    """简单移动平均，前 n-1 个为 NaN。"""
    out = np.full_like(x, np.nan, dtype=float)
    if len(x) >= n:
        cumsum = np.cumsum(np.insert(x, 0, 0.0))
        out[n - 1 :] = (cumsum[n:] - cumsum[:-n]) / n
    return out


def ema(x: np.ndarray, n: int) -> np.ndarray:
    """指数平均，alpha=2/(n+1)，首值播种（第 0 项起有值）。"""
    out = np.empty_like(x, dtype=float)
    out[0] = x[0]
    alpha = 2.0 / (n + 1)
    for i in range(1, len(x)):
        out[i] = alpha * x[i] + (1 - alpha) * out[i - 1]
    return out


def sma_cn(x: np.ndarray, n: int, m: int = 1) -> np.ndarray:
    """中国式 SMA(X,N,M)：Y=(M·X+(N-M)·Y')/N，即 alpha=M/N 的递推（Wilder 平滑）。"""
    out = np.empty_like(x, dtype=float)
    out[0] = x[0]
    alpha = m / n
    for i in range(1, len(x)):
        out[i] = alpha * x[i] + (1 - alpha) * out[i - 1]
    return out


def _rolling_std(x: np.ndarray, n: int) -> np.ndarray:
    """总体标准差（ddof=0）滚动窗口，前 n-1 个为 NaN。"""
    out = np.full_like(x, np.nan, dtype=float)
    for i in range(n - 1, len(x)):
        out[i] = np.std(x[i - n + 1 : i + 1], ddof=0)
    return out


def _rolling_max(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full_like(x, np.nan, dtype=float)
    for i in range(n - 1, len(x)):
        out[i] = np.max(x[i - n + 1 : i + 1])
    return out


def _rolling_min(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full_like(x, np.nan, dtype=float)
    for i in range(n - 1, len(x)):
        out[i] = np.min(x[i - n + 1 : i + 1])
    return out


# ----------------------------------------------------------------------
# 各指标：输入 OHLCV dict（open/high/low/close/volume 为等长 list），
# 输出 {指标名: {子序列: [float|None]}}
# ----------------------------------------------------------------------

def calc_ma(close: list[float], windows=(5, 10, 20, 30, 60)) -> dict:
    c = np.asarray(close, dtype=float)
    return {f"ma{w}": _to_float_list(sma(c, w)) for w in windows}


def calc_macd(close: list[float], fast=12, slow=26, signal=9) -> dict:
    c = np.asarray(close, dtype=float)
    dif = ema(c, fast) - ema(c, slow)
    dea = ema(dif, signal)
    hist = 2 * (dif - dea)
    return {"dif": _to_float_list(dif), "dea": _to_float_list(dea), "hist": _to_float_list(hist)}


def calc_rsi(close: list[float], windows=(6, 12, 24)) -> dict:
    c = np.asarray(close, dtype=float)
    diff = np.diff(c, prepend=c[0])
    up = np.maximum(diff, 0.0)
    absdiff = np.abs(diff)
    result = {}
    for w in windows:
        denom = sma_cn(absdiff, w, 1)
        numer = sma_cn(up, w, 1)
        with np.errstate(invalid="ignore", divide="ignore"):
            rsi = np.where(denom == 0, np.nan, numer / denom * 100)
        rsi[0] = np.nan  # 首日无变化量
        result[f"rsi{w}"] = _to_float_list(rsi)
    return result


def calc_kdj(high: list[float], low: list[float], close: list[float], n=9, m1=3, m2=3) -> dict:
    h, l, c = (np.asarray(a, dtype=float) for a in (high, low, close))
    hh = _rolling_max(h, n)
    ll = _rolling_min(l, n)
    with np.errstate(invalid="ignore", divide="ignore"):
        rsv = np.where(hh == ll, 50.0, (c - ll) / (hh - ll) * 100)
    rsv[: n - 1] = 50.0  # warmup 期以中性值播种
    k = sma_cn(rsv, m1, 1)
    d = sma_cn(k, m2, 1)
    j = 3 * k - 2 * d
    return {"k": _to_float_list(k), "d": _to_float_list(d), "j": _to_float_list(j)}


def calc_boll(close: list[float], n=20, k=2.0) -> dict:
    c = np.asarray(close, dtype=float)
    mid = sma(c, n)
    std = _rolling_std(c, n)
    return {
        "upper": _to_float_list(mid + k * std),
        "mid": _to_float_list(mid),
        "lower": _to_float_list(mid - k * std),
    }


def calc_atr(high: list[float], low: list[float], close: list[float], n=14) -> dict:
    h, l, c = (np.asarray(a, dtype=float) for a in (high, low, close))
    prev_c = np.roll(c, 1)
    prev_c[0] = c[0]
    tr = np.maximum(h - l, np.maximum(np.abs(h - prev_c), np.abs(l - prev_c)))
    return {f"atr{n}": _to_float_list(sma_cn(tr, n, 1))}


def calc_volma(volume: list[float], windows=(5, 20)) -> dict:
    v = np.asarray(volume, dtype=float)
    return {f"volma{w}": _to_float_list(sma(v, w), 0) for w in windows}


CALCULATORS = {
    "ma": lambda o: calc_ma(o["close"]),
    "macd": lambda o: calc_macd(o["close"]),
    "rsi": lambda o: calc_rsi(o["close"]),
    "kdj": lambda o: calc_kdj(o["high"], o["low"], o["close"]),
    "boll": lambda o: calc_boll(o["close"]),
    "atr": lambda o: calc_atr(o["high"], o["low"], o["close"]),
    "volma": lambda o: calc_volma(o["volume"]),
}

ALL_INDICATORS = list(CALCULATORS.keys())


def compute(kline: list[dict], names: list[str] | None = None) -> dict:
    """输入 K 线列表（含 day/open/high/low/close/volume），输出各指标序列。"""
    ohlcv = {
        "open": [k["open"] for k in kline],
        "high": [k["high"] for k in kline],
        "low": [k["low"] for k in kline],
        "close": [k["close"] for k in kline],
        "volume": [k["volume"] for k in kline],
    }
    selected = names or ALL_INDICATORS
    unknown = set(selected) - set(ALL_INDICATORS)
    if unknown:
        raise ValueError(f"未知指标：{','.join(sorted(unknown))}（支持 {','.join(ALL_INDICATORS)}）")
    return {name: CALCULATORS[name](ohlcv) for name in selected}
