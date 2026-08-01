"""Multi-market LLM review built only from persisted provider snapshots."""

import asyncio
import json
import logging
import re
from datetime import date

from .. import database
from . import model_router
from .market_data import MarketDataService, MarketError
from .market_overview import MarketOverviewService
from .notifications import publish_notification
from .senders import dispatch_message

LOGGER = logging.getLogger(__name__)
SUPPORTED_MARKETS = ("cn", "hk", "us")


def _normalize_markets(markets: list[str]) -> list[str]:
    unique = list(dict.fromkeys(markets))
    if not unique or any(market not in SUPPORTED_MARKETS for market in unique):
        raise ValueError("markets 至少包含 cn、hk、us 中的一项")
    return unique


def _parse_report(content: str) -> dict:
    text = content.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    candidates = [fenced.group(1)] if fenced else []
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        candidates.append(text[start:end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except (TypeError, json.JSONDecodeError):
            continue
        if isinstance(parsed, dict):
            return parsed
    return {
        "summary": text or "模型未返回可用内容",
        "market_reviews": [],
        "sector_mainline": [],
        "cross_market": "unknown",
        "risk_notice": "模型输出不是结构化 JSON，请人工复核原始摘要。",
        "parse_status": "fallback",
    }


def _deserialize(row: dict) -> dict:
    item = dict(row)
    item["markets"] = json.loads(item.pop("markets_json"))
    item["snapshot"] = json.loads(item.pop("snapshot_json") or "{}")
    item["report"] = json.loads(item.pop("report_json") or "{}")
    return item


async def collect_market_snapshot(
    market: MarketDataService,
    markets: list[str],
    trading_date: date,
) -> dict:
    overview_service = MarketOverviewService(market)

    async def safe(label: str, operation) -> tuple[str, dict]:
        try:
            return label, await operation
        except (MarketError, ValueError) as exc:
            return label, {"status": "unavailable", "error": str(exc)}

    tasks = [safe(f"overview_{name}", overview_service.overview(name)) for name in markets]
    if "cn" in markets:
        tasks.extend((
            safe("industry", overview_service.sectors("industry", 20)),
            safe("concept", overview_service.sectors("concept", 20)),
            safe("popular", overview_service.popular(20)),
            safe("limit_up", overview_service.limit_up(trading_date)),
        ))
    values = await asyncio.gather(*tasks)
    return {
        "trading_date": trading_date.isoformat(),
        "markets": markets,
        "data": dict(values),
        "provenance": {
            "index_sources": ["tencent", "sina", "yahoo"],
            "cn_market_source": "eastmoney",
            "missing_policy": "unknown",
        },
    }


def _messages(snapshot: dict) -> list[dict]:
    return [
        {
            "role": "system",
            "content": (
                "你是谨慎的跨市场盘后复盘分析师。只能使用用户提供的快照；缺失或不可验证的事实必须写 unknown，"
                "禁止补造行情、新闻、资金流或交易指令。输出一个 JSON 对象，字段为 summary、market_reviews、"
                "sector_mainline、cross_market、risk_notice。market_reviews 每项包含 market、trend、drivers、risks、"
                "unknowns；sector_mainline 每项包含 name、kind、evidence、continuity、risks。"
            ),
        },
        {
            "role": "user",
            "content": "请基于以下带来源快照生成多市场复盘：\n" + json.dumps(snapshot, ensure_ascii=False),
        },
    ]


def _delivery_text(item: dict) -> str:
    report = item.get("report") or {}
    lines = [str(report.get("summary") or "复盘已生成")]
    mainline = report.get("sector_mainline")
    if isinstance(mainline, list) and mainline:
        lines.append("\n板块主线：")
        for entry in mainline[:5]:
            if isinstance(entry, dict):
                lines.append(f"- {entry.get('name') or 'unknown'}：{entry.get('evidence') or 'unknown'}")
    lines.append("\n仅供研究，不构成投资建议。")
    return "\n".join(lines)


async def create_market_review(
    market: MarketDataService,
    markets: list[str],
    trading_date: date,
    model_id: int | None = None,
) -> dict:
    selected = _normalize_markets(markets)
    review_id = await database.execute(
        "INSERT INTO market_reviews (markets_json, trading_date, model_id) VALUES (?, ?, ?)",
        (json.dumps(selected), trading_date.isoformat(), model_id),
    )
    try:
        snapshot = await collect_market_snapshot(market, selected, trading_date)
        client, model = await model_router.get_client(model_id)
        content, token_count = await client.chat(_messages(snapshot))
        report = _parse_report(content)
        await database.execute(
            "UPDATE market_reviews SET snapshot_json=?, report_json=?, model_id=?, model_name=?, "
            "token_count=?, status='completed', updated_at=datetime('now') WHERE id=?",
            (
                json.dumps(snapshot, ensure_ascii=False),
                json.dumps(report, ensure_ascii=False),
                model.get("id"),
                model.get("name") or model.get("model_name"),
                token_count,
                review_id,
            ),
        )
    except Exception as exc:
        await database.execute(
            "UPDATE market_reviews SET status='failed', error_message=?, updated_at=datetime('now') WHERE id=?",
            (str(exc)[:1000], review_id),
        )
        raise

    item = await get_market_review(review_id)
    await publish_notification(
        "market_review.completed",
        f"大盘复盘完成 · {trading_date.isoformat()}",
        str(item["report"].get("summary") or "多市场盘后复盘已生成。")[:1000],
        severity="success",
        source_type="market_review",
        source_id=review_id,
        payload={"url": "/research/market-reviews", "markets": selected},
        dedupe_key=f"market-review:{review_id}:completed",
    )
    item["delivery"] = await dispatch_message(
        f"FinQuant Hub 大盘复盘 · {trading_date.isoformat()}",
        _delivery_text(item),
    )
    return item


async def list_market_reviews(limit: int = 50) -> list[dict]:
    rows = await database.query_all(
        "SELECT * FROM market_reviews ORDER BY trading_date DESC, id DESC LIMIT ?",
        (limit,),
    )
    return [_deserialize(row) for row in rows]


async def get_market_review(review_id: int) -> dict | None:
    row = await database.query_one("SELECT * FROM market_reviews WHERE id=?", (review_id,))
    return _deserialize(row) if row else None


async def run_scheduled_market_review(market: MarketDataService) -> dict:
    """Create at most one default cross-market review per local calendar date."""
    trading_date = date.today()
    markets_json = json.dumps(list(SUPPORTED_MARKETS))
    existing = await database.query_one(
        "SELECT * FROM market_reviews WHERE trading_date=? AND markets_json=? "
        "AND status='completed' ORDER BY id DESC LIMIT 1",
        (trading_date.isoformat(), markets_json),
    )
    if existing:
        return _deserialize(existing)
    LOGGER.info("Starting scheduled multi-market review for %s", trading_date)
    return await create_market_review(market, list(SUPPORTED_MARKETS), trading_date)
