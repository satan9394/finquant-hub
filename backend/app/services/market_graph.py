"""Evidence-bounded market treemap, Dragon Tiger graph, and limit-up ladder."""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
import math
import re
from typing import Any, cast
from zoneinfo import ZoneInfo

from .a_stock_extra import AStockExtraError, AStockExtraService, JSONDict
from .market_overview import EASTMONEY_CLIST_URLS, EASTMONEY_UT


CN_TZ = ZoneInfo("Asia/Shanghai")
CLIST_FIELDS = "f2,f3,f6,f12,f14"


def _number(value: object) -> float | None:
    try:
        result = float(cast(Any, value))
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _trade_day(value: object) -> str | None:
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", str(value or ""))
    return match.group(1) if match else None


def _streak(row: JSONDict) -> int | None:
    raw_count = row.get("limit_up_count")
    try:
        count = int(raw_count)
    except (TypeError, ValueError):
        count = 0
    if count > 0:
        return count
    match = re.search(r"\d+天(\d+)板", str(row.get("limit_stat") or ""))
    return int(match.group(1)) if match else None


@dataclass
class MarketGraphService:
    """Read and aggregate only direct Eastmoney snapshots; never synthesize missing facts."""

    stocks: AStockExtraService

    async def sector_treemap(self, representative_sectors: int = 4) -> JSONDict:
        """Return direct industry turnover with top constituents and a reconciled remainder."""
        payload = await self.stocks._eastmoney_json(
            "行业板块树图",
            EASTMONEY_CLIST_URLS[0],
            params={
                "pn": 1, "pz": 100, "po": 1, "np": 1, "ut": EASTMONEY_UT,
                "fltt": 2, "invt": 2, "fid": "f6", "fs": "m:90 t:2 f:!50", "fields": CLIST_FIELDS,
            },
        )
        data = payload.get("data")
        if not isinstance(data, dict):
            raise AStockExtraError("行业板块树图", "东财行业板块 data 字段格式已变化")
        rows = data.get("diff") or []
        if not isinstance(rows, list):
            raise AStockExtraError("行业板块树图", "东财行业板块 diff 字段格式已变化")
        sector_rows = [
            row for row in rows
            if isinstance(row, dict) and row.get("f12") and row.get("f14") and _number(row.get("f6")) is not None
        ]
        sector_rows.sort(key=lambda row: cast(float, _number(row.get("f6"))), reverse=True)
        sector_total = len(sector_rows)
        children_by_code: dict[str, list[JSONDict]] = {}
        errors: list[str] = []

        for sector in sector_rows[:representative_sectors]:
            code = str(sector["f12"])
            try:
                constituents = await self.stocks._eastmoney_json(
                    "行业成分股树图",
                    EASTMONEY_CLIST_URLS[0],
                    params={
                        "pn": 1, "pz": 5, "po": 1, "np": 1, "ut": EASTMONEY_UT,
                        "fltt": 2, "invt": 2, "fid": "f6", "fs": f"b:{code}", "fields": CLIST_FIELDS,
                    },
                )
                constituent_data = constituents.get("data")
                if not isinstance(constituent_data, dict) or not isinstance(constituent_data.get("diff") or [], list):
                    raise AStockExtraError("行业成分股树图", "东财成分股 data/diff 字段格式已变化")
                stock_rows = constituent_data.get("diff") or []
                children_by_code[code] = [
                    {
                        "name": str(row.get("f14") or "UNKNOWN"),
                        "code": str(row.get("f12") or "UNKNOWN"),
                        "value": amount,
                        "change_percent": _number(row.get("f3")),
                        "kind": "constituent",
                    }
                    for row in stock_rows
                    if isinstance(row, dict) and (amount := _number(row.get("f6"))) is not None and amount >= 0
                ]
            except AStockExtraError as exc:
                # Provider errors are localized to that sector; its direct aggregate remains usable.
                errors.append(f"{sector.get('f14')}: {type(exc).__name__}")

        items: list[JSONDict] = []
        for row in sector_rows:
            code = str(row["f12"])
            total = cast(float, _number(row.get("f6")))
            children = children_by_code.get(code, [])
            observed = sum(cast(float, child["value"]) for child in children)
            coverage = "AGGREGATE_ONLY"
            if children and observed <= total:
                remainder = total - observed
                if remainder > max(0.01, total * 1e-9):
                    children.append({
                        "name": "其余成分股（行业汇总差额）", "code": None, "value": remainder,
                        "change_percent": None, "kind": "aggregate_remainder",
                    })
                coverage = "TOP_CONSTITUENTS_PLUS_AGGREGATE_REMAINDER"
            elif children:
                children = []
                coverage = "INCONSISTENT_CONSTITUENT_TOTALS"
            if code in children_by_code and not children_by_code[code]:
                coverage = "CONSTITUENTS_UNAVAILABLE"
            items.append({
                "name": str(row["f14"]), "code": code, "value": total,
                "change_percent": _number(row.get("f3")), "children": children, "coverage": coverage,
            })

        provider_total = _number(data.get("total"))
        return {
            "as_of": datetime.now(CN_TZ).isoformat(timespec="seconds"),
            "classification": "eastmoney_industry_board",
            "classification_note": "东财行业板块分类；当前源未提供可核验的申万一级成员映射。",
            "source": "eastmoney.push2delay",
            "unit": "CNY",
            "quality": "DIRECT" if sector_rows else "UNKNOWN",
            "status": "partial" if errors or (provider_total is not None and sector_total < int(provider_total)) else "ok",
            "coverage": {"sectors_returned": sector_total, "provider_total": provider_total,
                         "constituent_sectors": len(children_by_code), "errors": errors},
            "items": items,
        }

    async def dragon_tiger_network(self, days: int = 5) -> JSONDict:
        if not 1 <= days <= 30:
            raise ValueError("days 必须在 1-30 之间")
        today = datetime.now(CN_TZ).date()
        start = today - timedelta(days=days - 1)
        end_text = today.isoformat()
        records = await self.stocks._datacenter(
            "龙虎榜席位网络",
            report_name="RPT_DAILYBILLBOARD_DETAILSNEW",
            filter=f"(TRADE_DATE>='{start.isoformat()}')(TRADE_DATE<='{end_text}')",
            page_size=5000,
            sortColumns="TRADE_DATE",
            sortTypes="-1",
        )
        dates = sorted({day for row in records if (day := _trade_day(row.get("TRADE_DATE")))})
        purchases: dict[tuple[str, str], dict[str, float]] = defaultdict(dict)
        for trade_day in dates:
            rows = await self.stocks._datacenter(
                "龙虎榜买入席位网络",
                report_name="RPT_BILLBOARD_DAILYDETAILSBUY",
                filter=f"(TRADE_DATE='{trade_day}')",
                page_size=5000,
                sortColumns="BUY",
                sortTypes="-1",
            )
            for row in rows:
                security = str(row.get("SECURITY_CODE") or "").strip()
                seat = str(row.get("OPERATEDEPT_NAME") or "").strip()
                amount = _number(row.get("BUY"))
                row_day = _trade_day(row.get("TRADE_DATE")) or trade_day
                if not security or not seat or amount is None or amount < 0:
                    continue
                key = (row_day, security)
                purchases[key][seat] = purchases[key].get(seat, 0.0) + amount / 10_000

        seat_totals: Counter[str] = Counter()
        seat_stocks: dict[str, set[str]] = defaultdict(set)
        for (trade_day, security), seats in purchases.items():
            for seat, amount in seats.items():
                seat_totals[seat] += amount
                seat_stocks[seat].add(security)
        top_seats = {seat for seat, _ in seat_totals.most_common(50)}
        nodes = [{
            "id": seat,
            "name": seat,
            "category": "institution" if "机构" in seat else "brokerage",
            "buy_amount_cny_10k": round(seat_totals[seat], 2),
            "security_count": len(seat_stocks[seat]),
        } for seat in sorted(top_seats, key=lambda item: seat_totals[item], reverse=True)]

        edge_totals: dict[tuple[str, str], float] = defaultdict(float)
        edge_observations: Counter[tuple[str, str]] = Counter()
        for seats in purchases.values():
            active = sorted(seat for seat in seats if seat in top_seats)
            for index, left in enumerate(active):
                for right in active[index + 1:]:
                    edge = (left, right)
                    edge_totals[edge] += min(seats[left], seats[right])
                    edge_observations[edge] += 1
        edges = [{
            "source": left, "target": right,
            "shared_buy_amount_cny_10k": round(amount, 2),
            "common_security_days": edge_observations[(left, right)],
        } for (left, right), amount in sorted(edge_totals.items(), key=lambda item: item[1], reverse=True)]
        return {
            "days": days, "date_from": start.isoformat(), "date_to": end_text,
            "source": "eastmoney.datacenter-web", "quality": "DIRECT",
            "status": "ok" if nodes else "empty",
            "note": "连线表示同日同股出现的买入席位共现；共同买入金额按双方买入额较小值累计，不代表协同或因果。金额单位为万元。",
            "nodes": nodes, "edges": edges,
        }

    async def sentiment_ladder(self, trading_date: date | None = None) -> JSONDict:
        target = trading_date or datetime.now(CN_TZ).date()
        current_date, current = await self._latest_limit_pool(target)
        if current_date is None:
            return self._unknown_ladder(target.isoformat(), "近 10 个自然日内没有可用的涨停池快照。")

        previous_day = datetime.strptime(current_date, "%Y-%m-%d").date() - timedelta(days=1)
        previous_date, previous = await self._latest_limit_pool(previous_day)
        current_counts = self._board_counts(current)
        previous_counts = self._board_counts(previous or {})
        max_height = max(set(current_counts) | set(previous_counts), default=0)
        ladder = []
        promoted_total = 0
        promotion_denominator = 0
        for height in range(1, max_height + 1):
            prior_count = previous_counts.get(height)
            promoted = current_counts.get(height + 1, 0) if prior_count is not None else None
            rate = promoted / prior_count if prior_count else None
            if prior_count:
                promoted_total += cast(int, promoted)
                promotion_denominator += prior_count
            ladder.append({
                "height": height, "count": current_counts.get(height, 0),
                "previous_count": prior_count, "promoted_count": promoted,
                "promotion_rate": rate,
            })
        current_rows = current.get("items") or []
        known_current = sum(current_counts.values())
        unknown_streak_count = max(0, len(current_rows) - known_current)
        highest = max(current_counts, default=None)
        promotion_mean = promoted_total / promotion_denominator if promotion_denominator else None
        index = None
        if highest is not None and promotion_mean is not None:
            height_score = min(100.0, highest * 20.0)
            index = round((height_score + promotion_mean * 100) / 2, 1)
        return {
            "date": current_date,
            "previous_date": previous_date,
            "source": "eastmoney.push2ex",
            "quality": "DIRECT" if current.get("quality") == "DIRECT" else "UNKNOWN",
            "status": "ok" if index is not None and unknown_streak_count == 0 else "partial",
            "highest_board": highest,
            "total_limit_up": len(current_rows),
            "known_board_members": known_current,
            "unknown_streak_count": unknown_streak_count,
            "promotion_rate": round(promotion_mean, 4) if promotion_mean is not None else None,
            "break_rate": None,
            "break_rate_quality": "UNKNOWN",
            "break_rate_note": "当前源没有当日失败涨停股总数；未用封板开板次数代替炸板率。",
            "sentiment_index": index,
            "sentiment_index_basis": "最高连板高度与可计算晋级率的等权均值；不含炸板率。",
            "items": ladder,
        }

    async def _latest_limit_pool(self, end: date) -> tuple[str | None, JSONDict | None]:
        for offset in range(10):
            candidate = end - timedelta(days=offset)
            snapshot = await self.stocks.limit_pool(candidate.isoformat(), "limit_up")
            if snapshot.get("quality") == "DIRECT":
                raw_date = str(snapshot.get("date") or candidate.strftime("%Y%m%d"))
                normalized = _trade_day(raw_date) or (
                    f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}" if re.fullmatch(r"\d{8}", raw_date) else None
                )
                if normalized:
                    return normalized, snapshot
        return None, None

    @staticmethod
    def _board_counts(snapshot: JSONDict) -> Counter[int]:
        rows = snapshot.get("items") or []
        counts: Counter[int] = Counter()
        for row in rows:
            height = _streak(row) if isinstance(row, dict) else None
            if height is not None and height > 0:
                counts[height] += 1
        return counts

    @staticmethod
    def _unknown_ladder(trading_date: str, note: str) -> JSONDict:
        return {
            "date": trading_date, "previous_date": None, "source": "eastmoney.push2ex",
            "quality": "UNKNOWN", "status": "unavailable", "highest_board": None,
            "total_limit_up": None, "promotion_rate": None, "break_rate": None,
            "break_rate_quality": "UNKNOWN", "break_rate_note": note,
            "sentiment_index": None, "sentiment_index_basis": None, "items": [],
        }
