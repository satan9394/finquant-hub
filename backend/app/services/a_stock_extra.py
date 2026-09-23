"""A-share depth data adapted from a-stock-data's direct HTTP implementations.

Eastmoney requests share one serialized throttle.  Provider failures are raised
as explicit errors; valuation history is the one deliberate UNKNOWN fallback
because its upstream implementation requires baostock, which this project does
not install.
"""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import math
import random
import re
from time import monotonic
from typing import Any, cast

import httpx


JSONDict = dict[str, Any]
CN_TZ = timezone(timedelta(hours=8))
EASTMONEY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FinQuant-Hub/1.0)",
    "Referer": "https://quote.eastmoney.com/",
}
DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"
ZTB_UT = "7eea3edcaed734bea9cbfc24409ed989"


class AStockExtraError(RuntimeError):
    """A provider or schema failure for an A-share extra capability."""

    def __init__(self, capability: str, message: str):
        super().__init__(f"{capability}：{message}")
        self.capability = capability


@dataclass
class EastmoneyThrottle:
    """Serialize Eastmoney calls and keep at least one second between them."""

    min_interval: float = 1.0
    jitter: Callable[[], float] = field(default=lambda: random.uniform(0.1, 0.5), repr=False)
    clock: Callable[[], float] = field(default=monotonic, repr=False)
    sleep: Callable[[float], Awaitable[None]] = field(default=asyncio.sleep, repr=False)
    _last_call: float = field(default=0.0, init=False, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False, repr=False)

    async def get(self, client: httpx.AsyncClient, url: str, **kwargs: Any) -> httpx.Response:
        async with self._lock:
            wait = self.min_interval - (self.clock() - self._last_call)
            if wait > 0:
                await self.sleep(wait + max(0.0, self.jitter()))
            try:
                return await client.get(url, **kwargs)
            finally:
                self._last_call = self.clock()


_EASTMONEY_THROTTLE = EastmoneyThrottle()


def _market_for_code(code: str) -> str:
    if code.startswith("92") or code.startswith(("4", "8")):
        return "bj"
    if code.startswith(("5", "6", "9")):
        return "sh"
    if code.startswith(("0", "1", "2", "3")):
        return "sz"
    raise ValueError("无法识别 A 股市场")


def _normalize_a_share(ticker: str) -> tuple[str, str]:
    raw = ticker.strip().lower().replace(" ", "")
    match = re.fullmatch(r"(sh|sz|bj)(\d{6})", raw)
    if match:
        market, code = match.group(1), match.group(2)
        if market != _market_for_code(code):
            raise ValueError("股票代码与显式市场标识冲突")
        return market, code
    match = re.fullmatch(r"(\d{6})\.(sh|ss|sz|bj)", raw)
    if match:
        suffix = "sh" if match.group(2) in {"sh", "ss"} else match.group(2)
        code = match.group(1)
        if suffix != _market_for_code(code):
            raise ValueError("股票代码与显式市场标识冲突")
        return suffix, code
    if not re.fullmatch(r"\d{6}", raw):
        raise ValueError("仅支持 6 位 A 股代码（可带 sh/sz/bj 前缀或后缀）")
    return _market_for_code(raw), raw


def _secid(ticker: str) -> tuple[str, str]:
    market, code = _normalize_a_share(ticker)
    return code, f"{1 if market == 'sh' else 0}.{code}"


def _number(value: object, field_name: str) -> float:
    try:
        number = float(cast(Any, value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"字段 {field_name} 不是有效数字") from exc
    if not math.isfinite(number):
        raise ValueError(f"字段 {field_name} 不是有限数字")
    return number


def _optional_number(value: object) -> float | None:
    if value in (None, "", "-"):
        return None
    try:
        number = float(cast(Any, value))
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _wan(value: object) -> float | None:
    number = _optional_number(value)
    return round(number / 10_000, 1) if number is not None else None


def _validate_date(value: str, compact: bool = False) -> str:
    for fmt in ("%Y-%m-%d", "%Y%m%d"):
        try:
            parsed = datetime.strptime(value, fmt)
            return parsed.strftime("%Y%m%d" if compact else "%Y-%m-%d")
        except ValueError:
            continue
    raise ValueError("date 必须是 YYYY-MM-DD 或 YYYYMMDD")


def _triangular_weights(grid: Sequence[float], low: float, high: float, average: float) -> list[float]:
    weights = [0.0] * len(grid)
    if high < low:
        return weights
    if high - low < 1e-9:
        weights[min(range(len(grid)), key=lambda index: abs(grid[index] - low))] = 1.0
        return weights
    average = min(max(average, low), high)
    for index, price in enumerate(grid):
        if low <= price <= average:
            weights[index] = (price - low) / (average - low) if average - low > 1e-9 else 1.0
        elif average < price <= high:
            weights[index] = (high - price) / (high - average) if high - average > 1e-9 else 1.0
    total = sum(weights)
    if total <= 0:
        weights[min(range(len(grid)), key=lambda index: abs(grid[index] - average))] = 1.0
        return weights
    return [weight / total for weight in weights]


def _weighted_quantile(grid: Sequence[float], weights: Sequence[float], target: float) -> float:
    cumulative = 0.0
    previous = 0.0
    for index, weight in enumerate(weights):
        cumulative += weight
        if cumulative >= target:
            if index == 0 or cumulative == previous:
                return grid[index]
            ratio = (target - previous) / (cumulative - previous)
            return grid[index - 1] + ratio * (grid[index] - grid[index - 1])
        previous = cumulative
    return grid[-1]


def calculate_chip_distribution(
    bars: Sequence[JSONDict], *, grid_size: int = 300, decay: float = 1.0
) -> JSONDict:
    """Infer a CYQ distribution from chronological OHLC and turnover rows."""
    if grid_size < 20:
        raise ValueError("grid_size 必须至少为 20")
    if decay <= 0:
        raise ValueError("decay 必须为正数")
    normalized: list[JSONDict] = []
    for row in bars:
        missing = {name for name in ("date", "high", "low", "close", "turn") if name not in row}
        if missing:
            raise ValueError(f"筹码分布缺少字段: {', '.join(sorted(missing))}")
        high = _number(row["high"], "high")
        low = _number(row["low"], "low")
        close = _number(row["close"], "close")
        turn = _number(row["turn"], "turn")
        if low <= 0 or high < low or close <= 0:
            raise ValueError("筹码分布价格字段无效")
        normalized.append({"date": str(row["date"]), "high": high, "low": low, "close": close, "turn": turn})
    if not normalized:
        raise ValueError("筹码分布有效行数为 0")
    normalized.sort(key=lambda row: row["date"])
    low_price = min(cast(float, row["low"]) for row in normalized)
    high_price = max(cast(float, row["high"]) for row in normalized)
    padding = (high_price - low_price) * 0.02 or max(low_price * 0.02, 0.01)
    start, stop = low_price - padding, high_price + padding
    step = (stop - start) / (grid_size - 1)
    grid = [start + step * index for index in range(grid_size)]
    chips: list[float] | None = None
    for row in normalized:
        average = (cast(float, row["high"]) + cast(float, row["low"]) + cast(float, row["close"])) / 3
        weights = _triangular_weights(grid, cast(float, row["low"]), cast(float, row["high"]), average)
        if chips is None:
            # ponytail: seed the first day as the whole float, preserving holdings before the requested window.
            chips = weights
            continue
        turnover = min(max(cast(float, row["turn"]) / 100 * decay, 0.0), 1.0)
        chips = [old * (1 - turnover) + new * turnover for old, new in zip(chips, weights)]
    if chips is None or sum(chips) <= 0:
        raise ValueError("筹码分布无法构建")
    total = sum(chips)
    chips = [value / total for value in chips]
    current_price = cast(float, normalized[-1]["close"])
    p05, p15, p85, p95 = (_weighted_quantile(grid, chips, q) for q in (0.05, 0.15, 0.85, 0.95))
    peak_index = max(range(len(chips)), key=chips.__getitem__)
    concentration_90 = (p95 - p05) / (p95 + p05) if p95 + p05 else None
    concentration_70 = (p85 - p15) / (p85 + p15) if p85 + p15 else None
    return {
        "profit_ratio": sum(weight for price, weight in zip(grid, chips) if price <= current_price),
        "avg_cost": sum(price * weight for price, weight in zip(grid, chips)),
        "cost_90_min": p05,
        "cost_90_max": p95,
        "cost_70_min": p15,
        "cost_70_max": p85,
        "concentration": concentration_90,
        "concentration_70": concentration_70,
        "peak": grid[peak_index],
        "as_of": normalized[-1]["date"],
        "source": "local-computed",
        "quality": "INFERENCE",
        "quality_flags": ["derived_from_ohlc_turnover", "initial_chip_seeded_from_first_day"],
    }


@dataclass
class AStockExtraService:
    """Five A-share depth capabilities with injectable deterministic HTTP."""

    http: httpx.AsyncClient | None = None
    throttle: EastmoneyThrottle = field(default_factory=lambda: _EASTMONEY_THROTTLE)
    _owns_http: bool = field(default=False, init=False, repr=False)

    def __post_init__(self) -> None:
        if self.http is None:
            self.http = httpx.AsyncClient(
                timeout=httpx.Timeout(15.0, connect=5.0), follow_redirects=True, trust_env=False
            )
            self._owns_http = True

    async def aclose(self) -> None:
        if self._owns_http and self.http is not None:
            await self.http.aclose()

    async def _eastmoney_json(
        self, capability: str, url: str, *, params: dict[str, object], headers: dict[str, str] | None = None
    ) -> JSONDict:
        assert self.http is not None
        try:
            response = await self.throttle.get(
                self.http, url, params=params, headers=headers or EASTMONEY_HEADERS
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise AStockExtraError(capability, f"东财请求失败（{type(exc).__name__}）") from exc
        if not isinstance(payload, dict):
            raise AStockExtraError(capability, "东财响应不是 JSON 对象")
        return cast(JSONDict, payload)

    async def _history_with_turnover(self, ticker: str, count: int = 240) -> list[JSONDict]:
        _, secid = _secid(ticker)
        payload = await self._eastmoney_json(
            "筹码分布",
            "https://push2his.eastmoney.com/api/qt/stock/kline/get",
            params={
                "secid": secid,
                "klt": "101",
                "fqt": "1",
                "lmt": str(max(20, min(count, 800))),
                "fields1": "f1,f2,f3,f4,f5,f6",
                "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            },
        )
        data = payload.get("data")
        if data is not None and not isinstance(data, dict):
            raise AStockExtraError("筹码分布", "东财 K 线 data 字段格式已变化")
        lines = cast(JSONDict, data or {}).get("klines") or []
        rows: list[JSONDict] = []
        try:
            for line in lines:
                parts = str(line).split(",")
                if len(parts) >= 11:
                    rows.append({
                        "date": parts[0], "open": float(parts[1]), "close": float(parts[2]),
                        "high": float(parts[3]), "low": float(parts[4]), "turn": float(parts[10]),
                    })
        except (TypeError, ValueError) as exc:
            raise AStockExtraError("筹码分布", "东财 K 线字段格式已变化") from exc
        if not rows:
            raise AStockExtraError("筹码分布", "东财未返回带换手率的日 K 线")
        return rows

    async def chip_distribution(
        self, ticker: str, *, bars: Sequence[JSONDict] | None = None, count: int = 240
    ) -> JSONDict:
        code, _ = _secid(ticker)
        selected = list(bars) if bars is not None else await self._history_with_turnover(ticker, count)
        result = calculate_chip_distribution(selected)
        return {"ticker": code, **result}

    async def money_flow(self, ticker: str, period: str = "minute") -> JSONDict:
        code, secid = _secid(ticker)
        if period not in {"minute", "120d"}:
            raise ValueError("period 仅支持 minute 或 120d")
        if period == "minute":
            url = "https://push2.eastmoney.com/api/qt/stock/fflow/kline/get"
            params: dict[str, object] = {
                "secid": secid, "klt": "1", "fields1": "f1,f2,f3,f7",
                "fields2": "f51,f52,f53,f54,f55,f56,f57",
            }
            source = "eastmoney.push2"
        else:
            url = "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
            params = {
                "secid": secid, "lmt": "120", "fields1": "f1,f2,f3,f7",
                "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65",
            }
            source = "eastmoney.push2his"
        payload = await self._eastmoney_json("资金流向", url, params=params)
        data = payload.get("data")
        if data is not None and not isinstance(data, dict):
            raise AStockExtraError("资金流向", "东财资金流 data 字段格式已变化")
        lines = cast(JSONDict, data or {}).get("klines") or []
        items: list[JSONDict] = []
        try:
            for line in lines:
                parts = str(line).split(",")
                if len(parts) >= 6:
                    items.append({
                        "time" if period == "minute" else "date": parts[0],
                        "main_net": _optional_number(parts[1]), "small_net": _optional_number(parts[2]),
                        "medium_net": _optional_number(parts[3]), "large_net": _optional_number(parts[4]),
                        "super_large_net": _optional_number(parts[5]),
                    })
        except TypeError as exc:
            raise AStockExtraError("资金流向", "东财资金流字段格式已变化") from exc
        if not items:
            raise AStockExtraError("资金流向", "东财未返回资金流数据")
        latest = items[-1]
        return {
            "ticker": code, "period": period, "source": source, "as_of": latest.get("time") or latest.get("date"),
            "quality": "DIRECT", "main_net": latest["main_net"], "large_net": latest["large_net"],
            "medium_net": latest["medium_net"], "small_net": latest["small_net"], "items": items,
        }

    async def limit_pool(self, trade_date: str, pool: str = "limit_up") -> JSONDict:
        compact_date = _validate_date(trade_date, compact=True)
        endpoints = {"limit_up": ("getTopicZTPool", "fbt:asc"), "limit_down": ("getTopicDTPool", "fund:asc")}
        if pool not in endpoints:
            raise ValueError("pool 仅支持 limit_up 或 limit_down")
        endpoint, sort = endpoints[pool]
        payload = await self._eastmoney_json(
            "涨跌停池",
            f"https://push2ex.eastmoney.com/{endpoint}",
            params={
                "ut": ZTB_UT, "dpt": "wz.ztzt", "Pageindex": 0,
                "pagesize": 10000, "sort": sort, "date": compact_date,
            },
        )
        data = payload.get("data")
        if data is None:
            return {
                "date": compact_date, "pool": pool, "items": [], "source": "eastmoney.push2ex",
                "quality": "UNKNOWN", "error": "东财未返回池数据（可能为非交易日或盘后尚未更新）",
            }
        if not isinstance(data, dict):
            raise AStockExtraError("涨跌停池", "东财池 data 字段格式已变化")
        raw_items = cast(JSONDict, data).get("pool") or []
        items: list[JSONDict] = []
        for raw in raw_items:
            row = cast(JSONDict, raw)
            if not row.get("c") or not row.get("n"):
                raise AStockExtraError("涨跌停池", "东财池数据缺少代码或名称")
            stat = cast(JSONDict, row.get("zttj") or {})
            items.append({
                "code": str(row["c"]), "name": str(row["n"]),
                "limit_up_count": row.get("lbc") if pool == "limit_up" else None,
                "seal_amount": _optional_number(row.get("fund")), "break_times": row.get("zbc"),
                "industry": row.get("hybk") or "", "limit_stat": f"{stat.get('days', '?')}天{stat.get('ct', '?')}板",
            })
        return {
            "date": compact_date, "pool": pool, "items": items,
            "source": "eastmoney.push2ex", "quality": "DIRECT",
        }

    async def _datacenter(self, capability: str, **params: object) -> list[JSONDict]:
        request_params: dict[str, object] = {
            "reportName": params.pop("report_name"), "columns": "ALL", "pageNumber": "1",
            "pageSize": str(params.pop("page_size", 50)), "source": "WEB", "client": "WEB", **params,
        }
        payload = await self._eastmoney_json(capability, DATACENTER_URL, params=request_params)
        if payload.get("success") is False:
            raise AStockExtraError(capability, f"东财数据中心拒绝请求（code={payload.get('code')}）")
        result = payload.get("result")
        if result is None:
            return []
        if not isinstance(result, dict):
            raise AStockExtraError(capability, "东财数据中心 result 字段格式已变化")
        rows = cast(JSONDict, result).get("data") or []
        if not isinstance(rows, list):
            raise AStockExtraError(capability, "东财数据中心 data 字段格式已变化")
        return cast(list[JSONDict], rows)

    async def dragon_tiger(self, ticker: str, trade_date: str, look_back: int = 30) -> JSONDict:
        code, _ = _secid(ticker)
        end_date = _validate_date(trade_date)
        if not 1 <= look_back <= 365:
            raise ValueError("look_back 必须在 1-365 天之间")
        start_date = (datetime.strptime(end_date, "%Y-%m-%d") - timedelta(days=look_back)).strftime("%Y-%m-%d")
        records = await self._datacenter(
            "龙虎榜", report_name="RPT_DAILYBILLBOARD_DETAILSNEW",
            filter=f"(TRADE_DATE>='{start_date}')(TRADE_DATE<='{end_date}')(SECURITY_CODE=\"{code}\")",
            sortColumns="TRADE_DATE", sortTypes="-1",
        )
        if not records:
            return {
                "ticker": code, "date": end_date, "items": [], "source": "eastmoney.datacenter-web",
                "quality": "DIRECT", "note": "回看窗口内无龙虎榜记录",
            }
        latest_date = str(records[0].get("TRADE_DATE") or "")[:10]
        common_filter = f"(TRADE_DATE='{latest_date}')(SECURITY_CODE=\"{code}\")"
        buy_rows = await self._datacenter(
            "龙虎榜", report_name="RPT_BILLBOARD_DAILYDETAILSBUY", filter=common_filter,
            page_size=10, sortColumns="BUY", sortTypes="-1",
        )
        sell_rows = await self._datacenter(
            "龙虎榜", report_name="RPT_BILLBOARD_DAILYDETAILSSELL", filter=common_filter,
            page_size=10, sortColumns="SELL", sortTypes="-1",
        )

        def seat(row: JSONDict) -> JSONDict:
            return {
                "name": row.get("OPERATEDEPT_NAME") or "UNKNOWN", "buy": _wan(row.get("BUY")),
                "sell": _wan(row.get("SELL")), "net": _wan(row.get("NET")), "unit": "CNY_10K",
            }

        top5_buy = [seat(row) for row in buy_rows[:5]]
        top5_sell = [seat(row) for row in sell_rows[:5]]
        items = [{
            "code": code, "name": row.get("SECURITY_NAME_ABBR") or "UNKNOWN",
            "date": str(row.get("TRADE_DATE") or "")[:10], "reason": row.get("EXPLANATION") or "UNKNOWN",
            "top5_buy": top5_buy if index == 0 else [], "top5_sell": top5_sell if index == 0 else [],
            "net": _wan(row.get("BILLBOARD_NET_AMT")), "unit": "CNY_10K",
        } for index, row in enumerate(records)]
        return {
            "ticker": code, "date": latest_date or end_date, "items": items,
            "source": "eastmoney.datacenter-web", "quality": "DIRECT",
        }

    async def valuation_history(self, ticker: str) -> JSONDict:
        market, code = _normalize_a_share(ticker)
        provider_code = market + code
        assert self.http is not None
        snapshot: JSONDict | None = None
        error: str | None = None
        try:
            response = await self.http.get(f"https://qt.gtimg.cn/q={provider_code}")
            response.raise_for_status()
            text = response.content.decode("gbk", errors="replace")
            match = re.search(r'="(.*)"', text)
            fields = match.group(1).split("~") if match else []
            if len(fields) < 47 or not fields[1]:
                raise ValueError("腾讯估值快照为空")
            snapshot = {
                "name": fields[1], "price": _optional_number(fields[3]),
                "pe": _optional_number(fields[39]), "pb": _optional_number(fields[46]),
            }
        except (httpx.HTTPError, ValueError) as exc:
            error = f"腾讯当前估值快照不可用（{type(exc).__name__}）"
        flags = ["valuation_history_unknown_without_baostock", "no_verified_zero_auth_daily_pe_pb_http_source"]
        if snapshot is None:
            flags.append("current_snapshot_unavailable")
        return {
            "ticker": code, "snapshot": snapshot, "history": "UNKNOWN", "source": "tencent.quote",
            "as_of": datetime.now(CN_TZ).isoformat(timespec="seconds"), "quality": "PARTIAL" if snapshot else "UNKNOWN",
            "quality_flags": flags, "history_reason": "未引入 baostock；未发现已验证的东财零鉴权日频 PE/PB HTTP 合同",
            "error": error,
        }
