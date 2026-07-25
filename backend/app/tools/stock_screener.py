"""两阶段选股筛选器：动量发现 → 价值评分。

Stage 1 — 动量发现：
  基于多周期收益率和成交量趋势，筛选有动量信号的股票池。
Stage 2 — 价值评分：
  对候选池逐只评分，从估值（PE/PB）、质量（ROE）、成长、股息四个维度加权。

对外暴露 screen() 作为快捷入口。
每个 Stage 可独立调用，支持自定义权重。

移植自 ai-berkshire 工具集，适配 FinQuant Hub 数据服务。
"""
from datetime import datetime

TEN_CENT_QUOTE = "https://qt.gtimg.cn/q={codes}"
SINA_KLINE = (
    "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/"
    "CN_MarketData.getKLineData?symbol={code}&scale=240&ma=no&datalen=120"
)
SINA_HEADERS = {"Referer": "https://finance.sina.com.cn"}
HTTP_TIMEOUT = 10.0


# ===================================================================
# Stage 1: 动量发现
# ===================================================================

async def momentum_discovery(
    candidates: list[dict] | None = None,
    min_return_20d: float = -5.0,
    min_return_60d: float = -10.0,
    max_results: int = 50,
) -> list[dict]:
    """动量发现阶段：从候选池中筛选有动量信号的股票。

    如果未提供 candidates，返回空列表（需对接实时数据源后自动填充）。
    传入 candidates 格式：[{"ticker": "600519", "name": "贵州茅台"}, ...]

    筛选条件：
    - 20 日收益率 > min_return_20d
    - 60 日收益率 > min_return_60d
    - 成交量趋势向上
    """
    if not candidates:
        return []

    import json

    import httpx

    scored = []
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, trust_env=False) as http:
        for item in candidates:
            ticker = item["ticker"]
            code = _normalize_code(ticker)
            # 获取 K 线
            try:
                resp = await http.get(
                    SINA_KLINE.format(code=code, scale=240, datalen=120),
                    headers=SINA_HEADERS,
                )
                kdata = json.loads(resp.text)
            except (httpx.HTTPError, ValueError, json.JSONDecodeError):
                continue

            if not isinstance(kdata, list) or len(kdata) < 60:
                continue

            close_prices = [float(k["close"]) for k in kdata]

            # 计算多周期收益
            def ret(n: int) -> float:
                return (close_prices[-1] - close_prices[-n]) / close_prices[-n] * 100 if len(close_prices) >= n else 0.0

            r20 = ret(20)
            r60 = ret(60)

            # 动量过滤
            if r20 < min_return_20d or r60 < min_return_60d:
                continue

            # 成交量趋势（近5日均量 vs 前20日均量）
            volumes = [float(k.get("volume", 0)) for k in kdata]
            vol_ma5 = sum(volumes[-5:]) / max(len(volumes[-5:]), 1)
            vol_ma20 = sum(volumes[-20:]) / max(len(volumes[-20:]), 1)
            vol_ratio = vol_ma5 / max(vol_ma20, 1)

            # 动量综合分
            momentum_score = r20 * 0.5 + r60 * 0.3
            if vol_ratio > 1.2:
                momentum_score *= 1.2  # 放量加分

            scored.append({
                "ticker": ticker,
                "name": item.get("name", ""),
                "return_20d_pct": round(r20, 2),
                "return_60d_pct": round(r60, 2),
                "volume_ratio": round(vol_ratio, 2),
                "momentum_score": round(momentum_score, 2),
                "close": close_prices[-1],
            })

    scored.sort(key=lambda x: -x["momentum_score"])
    return scored[:max_results]


# ===================================================================
# Stage 2: 价值评分
# ===================================================================

VALUE_WEIGHTS = {
    "pe_score": 0.25,
    "pb_score": 0.20,
    "roe_score": 0.25,
    "growth_score": 0.20,
    "dividend_score": 0.10,
}


async def value_scoring(
    candidates: list[dict],
    weights: dict[str, float] | None = None,
) -> list[dict]:
    """价值评分阶段：对候选池逐只评分。

    输入 candidates 为 momentum_discovery 的输出（含 ticker）。
    评分维度（各 0-100 分）：
    - pe_score: PE 合理性（过低或过高扣分，15-25 最佳区满分）
    - pb_score: PB 合理性（1-3 最佳区）
    - roe_score: ROE 质量（越高越好）
    - growth_score: 增长趋势（20/60 日收益合成）
    - dividend_score: 股息率（越高越好）

    返回按综合分降序排列的列表，含评分理由。
    """
    import json

    import httpx

    w = weights or VALUE_WEIGHTS
    if abs(sum(w.values()) - 1.0) > 0.01:
        # 自动归一化
        total = sum(w.values())
        w = {k: v / total for k, v in w.items()}

    results = []
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, trust_env=False) as http:
        for item in candidates:
            ticker = item["ticker"]
            code = _normalize_code(ticker)

            # 获取实时行情（含 PE/PB）
            try:
                resp = await http.get(TEN_CENT_QUOTE.format(codes=code))
                text = resp.content.decode("gbk", "replace")
                quotes = _parse_tencent(text)
            except (httpx.HTTPError, ValueError):
                continue

            if not quotes:
                continue
            q = quotes[0]

            pe = q.get("pe", 0.0)
            pb = q.get("pb", 0.0)

            # PE 评分
            pe_score = 50.0
            reasons = []
            if 0 < pe <= 5:
                pe_score = 80.0
                reasons.append("PE极低(<5)，可能低估或周期底部")
            elif 5 < pe <= 15:
                pe_score = 90.0
                reasons.append("PE偏低(5-15)，价值区间")
            elif 15 < pe <= 25:
                pe_score = 85.0
                reasons.append("PE合理(15-25)")
            elif 25 < pe <= 40:
                pe_score = 60.0
                reasons.append("PE偏高(25-40)")
            elif pe > 40:
                pe_score = 30.0
                reasons.append("PE过高(>40)")
            else:
                pe_score = 20.0
                reasons.append("PE为负或零，亏损状态")

            # PB 评分
            pb_score = 50.0
            if 0 < pb <= 1:
                pb_score = 80.0
                reasons.append("PB<1，破净状态")
            elif 1 < pb <= 3:
                pb_score = 85.0
                reasons.append("PB合理(1-3)")
            elif 3 < pb <= 8:
                pb_score = 60.0
                reasons.append("PB偏高(3-8)")
            elif pb > 8:
                pb_score = 30.0
                reasons.append("PB过高(>8)")
            else:
                pb_score = 20.0
                reasons.append("PB为负或零")

            # ROE (PE/PB 推导)
            roe = 0.0
            roe_score = 30.0
            if pe > 0 and pb > 0:
                roe = pb / pe * 100
                if roe > 30:
                    roe_score = 95.0
                    reasons.append(f"ROE极高({roe:.1f}%)")
                elif roe > 20:
                    roe_score = 85.0
                    reasons.append(f"ROE优秀({roe:.1f}%)")
                elif roe > 10:
                    roe_score = 65.0
                    reasons.append(f"ROE良好({roe:.1f}%)")
                elif roe > 5:
                    roe_score = 45.0
                    reasons.append(f"ROE一般({roe:.1f}%)")
                else:
                    reasons.append(f"ROE偏低({roe:.1f}%)")

            # 增长评分（来自 momentum 阶段数据或 K 线）
            ret_20d = item.get("return_20d_pct", 0.0)
            ret_60d = item.get("return_60d_pct", 0.0)
            growth_score = max(0, min(100, ret_20d * 2 + ret_60d))
            if growth_score > 70:
                reasons.append("增长趋势强劲")
            elif growth_score > 40:
                reasons.append("增长趋势良好")

            # 股息评分（腾讯行情无股息字段，默认中性）
            dividend_score = 50.0

            composite = (
                pe_score * w["pe_score"]
                + pb_score * w["pb_score"]
                + roe_score * w["roe_score"]
                + growth_score * w["growth_score"]
                + dividend_score * w["dividend_score"]
            )

            results.append({
                "ticker": ticker,
                "name": item.get("name", q.get("name", "")),
                "price": q.get("price", 0.0),
                "pe": pe,
                "pb": pb,
                "roe": round(roe, 2),
                "score": round(composite, 1),
                "details": {
                    "pe_score": round(pe_score, 1),
                    "pb_score": round(pb_score, 1),
                    "roe_score": round(roe_score, 1),
                    "growth_score": round(growth_score, 1),
                    "dividend_score": round(dividend_score, 1),
                },
                "reasons": reasons[:3],  # 取前 3 条理由
            })

    results.sort(key=lambda x: -x["score"])
    return results


# ===================================================================
# 快捷入口：两阶段串联
# ===================================================================

async def screen(
    candidates: list[dict] | None = None,
    momentum_min_return_20d: float = -5.0,
    momentum_min_return_60d: float = -10.0,
    value_weights: dict[str, float] | None = None,
    max_results: int = 20,
) -> dict:
    """两阶段选股串联：动量发现 → 价值评分。

    返回 {stage1, stage2, summary}，其中 summary 为 Top-N 简洁列表。
    """
    stage1 = await momentum_discovery(
        candidates=candidates,
        min_return_20d=momentum_min_return_20d,
        min_return_60d=momentum_min_return_60d,
        max_results=max_results,
    )

    if not stage1:
        return {
            "stage1": [],
            "stage2": [],
            "summary": [],
            "note": "动量发现阶段无结果：请提供 candidates 或放宽筛选条件",
        }

    stage2 = await value_scoring(stage1, weights=value_weights)

    summary = []
    for s in stage2[:10]:
        summary.append({
            "ticker": s["ticker"],
            "name": s["name"],
            "score": s["score"],
            "pe": s["pe"],
            "pb": s["pb"],
            "roe": s["roe"],
            "reasons": s["reasons"],
        })

    return {
        "stage1_count": len(stage1),
        "stage2_count": len(stage2),
        "stage1": stage1,
        "stage2": stage2,
        "summary": summary,
    }


# ===================================================================
# 辅助函数
# ===================================================================

import re


def _detect_market(code: str) -> str:
    digits = re.sub(r"\D", "", code)
    if re.match(r"^(6|68)", digits):
        return "sh"
    if re.match(r"^(0|3)", digits):
        return "sz"
    return "sh"


def _normalize_code(code: str) -> str:
    code = code.strip().lower()
    if re.match(r"^(sh|sz|hk|us)", code):
        return code
    return _detect_market(code) + code


_TENCENT_LINE = re.compile(r'^v_(sh|sz|hk|us)(\w+)="(.*)";?\s*$', re.M)


def _parse_tencent(raw: str) -> list[dict]:
    results = []
    for m in _TENCENT_LINE.finditer(raw):
        market, scode, payload = m.group(1), m.group(2), m.group(3)
        f = payload.split("~")
        if len(f) < 50:
            continue

        def num(i: int, default=0.0) -> float:
            try:
                v = float(f[i])
                return v if v == v else default
            except (ValueError, IndexError):
                return default

        price, last_close = num(3), num(4)
        change = num(31) or round(price - last_close, 3)
        results.append({
            "code": f"{market}{scode}",
            "name": f[1] or scode,
            "price": price,
            "last_close": last_close,
            "open": num(5),
            "high": num(33),
            "low": num(34),
            "volume": num(6),
            "amount": num(37),
            "change": change,
            "change_percent": num(32),
            "turnover_rate": num(38),
            "pe": num(39),
            "pb": num(46),
            "market_cap": num(45),
        })
    return results
