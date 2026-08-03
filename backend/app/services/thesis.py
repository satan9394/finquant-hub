"""Investment thesis persistence and deterministic drift checks."""
from __future__ import annotations

import json
from datetime import UTC, datetime
from difflib import SequenceMatcher
from typing import Any, Protocol

from .. import database
from .market_data import normalize_code


PRICE_DRIFT_THRESHOLD = 0.20
POSITION_DRIFT_THRESHOLD = 0.50
FUNDAMENTAL_DRIFT_THRESHOLD = 0.20
REPORT_SIMILARITY_THRESHOLD = 0.55

AUTO_CLAIMS = {
    "price": "市场价格未显著偏离论文建立时的基准",
    "position": "组合持仓规模未显著偏离论文建立时的基准",
    "fundamental": "可比基本面指标未显著偏离论文建立时的基准",
    "report": "最新投研报告的核心论点与原论文保持一致",
}


class ThesisNotFoundError(LookupError):
    pass


class ThesisConflictError(ValueError):
    pass


class ThesisMarket(Protocol):
    async def quote(self, ticker: str) -> dict[str, Any]: ...

    async def fundamentals(self, ticker: str) -> list[dict[str, Any]]: ...


def _loads(value: object, fallback: Any) -> Any:
    if not isinstance(value, str):
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _core_report_text(report: dict[str, Any]) -> str:
    values = [
        report.get("executive_summary"),
        report.get("investment_conclusion"),
        report.get("verdict"),
    ]
    return "\n".join(str(value).strip() for value in values if value and str(value).strip())


def _fundamental_values(items: object) -> dict[str, float]:
    if not isinstance(items, list):
        return {}
    values: dict[str, float] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        metric = str(item.get("metric") or "").strip()
        if not metric or metric in values:
            continue
        try:
            values[metric] = float(item["value"])
        except (KeyError, TypeError, ValueError):
            continue
    return values


def _report_fundamentals(report: dict[str, Any]) -> dict[str, float]:
    evidence = report.get("fundamental_evidence")
    return _fundamental_values(evidence.get("items") if isinstance(evidence, dict) else None)


async def _position_shares(ticker: str, user_id: int) -> float | None:
    row = await database.query_one(
        "SELECT SUM(shares) AS shares FROM positions WHERE ticker=? AND user_id=?",
        (ticker, user_id),
    )
    if row is None or row.get("shares") is None:
        return None
    return float(row["shares"])


async def _snapshot(
    ticker: str,
    market: ThesisMarket,
    *,
    report: dict[str, Any] | None = None,
    report_id: int | None = None,
    user_id: int,
) -> dict[str, Any]:
    snapshot: dict[str, Any] = {
        "captured_at": datetime.now(tz=UTC).isoformat(),
        "price": None,
        "position_shares": await _position_shares(ticker, user_id),
        "fundamentals": _report_fundamentals(report or {}),
        "report_id": report_id,
        "report_core": _core_report_text(report or {}),
        "quality_flags": [],
    }
    try:
        quote = await market.quote(ticker)
        price = quote.get("price")
        snapshot["price"] = float(price) if price is not None else None
    except Exception as exc:
        snapshot["quality_flags"].append(f"quote_unavailable:{type(exc).__name__}")
    if not snapshot["fundamentals"]:
        try:
            snapshot["fundamentals"] = _fundamental_values(await market.fundamentals(ticker))
        except Exception as exc:
            snapshot["quality_flags"].append(f"fundamentals_unavailable:{type(exc).__name__}")
    return snapshot


def _decode_thesis(row: dict[str, Any]) -> dict[str, Any]:
    decoded = dict(row)
    decoded["assumptions"] = _loads(decoded.get("assumptions"), [])
    decoded["baseline"] = _loads(decoded.pop("baseline_json", "{}"), {})
    decoded["last_check"] = _loads(decoded.pop("last_check_json", "{}"), {})
    return decoded


def _decode_claim(row: dict[str, Any]) -> dict[str, Any]:
    decoded = dict(row)
    decoded["baseline"] = _loads(decoded.pop("baseline_json", "{}"), {})
    return decoded


async def list_theses(user_id: int, status: str | None = None) -> dict[str, Any]:
    where = " AND status=?" if status else ""
    params = (user_id, status) if status else (user_id,)
    rows = await database.query_all(
        "SELECT * FROM thesis WHERE user_id=?" + where + " ORDER BY updated_at DESC, id DESC",
        params,
    )
    return {"items": [_decode_thesis(row) for row in rows], "total": len(rows)}


async def get_thesis(thesis_id: int, user_id: int) -> dict[str, Any]:
    row = await database.query_one("SELECT * FROM thesis WHERE id=? AND user_id=?", (thesis_id, user_id))
    if row is None:
        raise ThesisNotFoundError(f"论文不存在：id={thesis_id}")
    result = _decode_thesis(row)
    claims = await database.query_all(
        "SELECT * FROM thesis_claims WHERE thesis_id=? AND user_id=? ORDER BY id", (thesis_id, user_id)
    )
    result["claims"] = [_decode_claim(claim) for claim in claims]
    return result


async def create_thesis(
    *,
    ticker: str,
    title: str,
    thesis: str,
    assumptions: list[str],
    claims: list[str],
    market: ThesisMarket,
    user_id: int,
    source_report_id: int | None = None,
    report: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized = normalize_code(ticker)
    if source_report_id is not None:
        existing = await database.query_one(
            "SELECT id FROM thesis WHERE source_report_id=? AND user_id=?", (source_report_id, user_id)
        )
        if existing is not None:
            raise ThesisConflictError(f"报告已存为论文：thesis_id={existing['id']}")
    baseline = await _snapshot(normalized, market, report=report, report_id=source_report_id, user_id=user_id)
    db = database.get_db()
    cursor = await db.execute(
        "INSERT INTO thesis "
        "(ticker, title, thesis, assumptions, source_report_id, baseline_json, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (normalized, title.strip(), thesis.strip(), json.dumps(assumptions, ensure_ascii=False),
         source_report_id, json.dumps(baseline, ensure_ascii=False), user_id),
    )
    if cursor.lastrowid is None:
        raise RuntimeError("创建投资论文后未返回主键")
    thesis_id = cursor.lastrowid
    await db.executemany(
        "INSERT INTO thesis_claims (thesis_id, claim, kind, status, baseline_json, user_id) VALUES (?, ?, ?, 'unknown', ?, ?)",
        [
            (thesis_id, claim, "manual", "{}", user_id)
            for claim in claims
            if claim.strip()
        ] + [
            (thesis_id, claim, kind, json.dumps({"value": baseline.get({
                "price": "price", "position": "position_shares", "fundamental": "fundamentals", "report": "report_core",
            }[kind])}, ensure_ascii=False), user_id)
            for kind, claim in AUTO_CLAIMS.items()
        ],
    )
    await db.commit()
    return await get_thesis(thesis_id, user_id)


def _report_assumptions(report: dict[str, Any]) -> list[str]:
    review = report.get("team_lead_review")
    if not isinstance(review, dict):
        return []
    values = [review.get("bull_case"), review.get("bear_case")]
    return [str(value).strip() for value in values if value and str(value).strip() not in {"unknown", "未知"}]


async def create_from_report(report_id: int, market: ThesisMarket, user_id: int) -> dict[str, Any]:
    row = await database.query_one(
        "SELECT id, ticker, company_name, report_data, status FROM research_reports WHERE id=? AND user_id=?",
        (report_id, user_id),
    )
    if row is None:
        raise ThesisNotFoundError(f"研究报告不存在：id={report_id}")
    if row["status"] != "completed":
        raise ThesisConflictError("只有已完成的投研报告可存为论文")
    report = _loads(row["report_data"], {})
    if not isinstance(report, dict):
        report = {}
    thesis_text = _core_report_text(report) or "原报告未提供可提取的核心论点"
    assumptions = _report_assumptions(report)
    review = report.get("team_lead_review")
    manual_claims = []
    if isinstance(review, dict) and review.get("bull_case"):
        manual_claims.append(str(review["bull_case"]))
    return await create_thesis(
        ticker=str(row["ticker"]),
        title=f"{row.get('company_name') or row['ticker']} 投资论文",
        thesis=thesis_text,
        assumptions=assumptions,
        claims=manual_claims,
        market=market,
        user_id=user_id,
        source_report_id=report_id,
        report=report,
    )


async def update_thesis(
    thesis_id: int,
    user_id: int,
    *,
    title: str,
    thesis: str,
    assumptions: list[str],
    status: str,
    claims: list[str] | None,
) -> dict[str, Any]:
    await get_thesis(thesis_id, user_id)
    db = database.get_db()
    await db.execute(
        "UPDATE thesis SET title=?, thesis=?, assumptions=?, status=?, updated_at=datetime('now') "
        "WHERE id=? AND user_id=?",
        (title.strip(), thesis.strip(), json.dumps(assumptions, ensure_ascii=False), status, thesis_id, user_id),
    )
    if claims is not None:
        await db.execute(
            "DELETE FROM thesis_claims WHERE thesis_id=? AND kind='manual' AND user_id=?", (thesis_id, user_id)
        )
        await db.executemany(
            "INSERT INTO thesis_claims (thesis_id, claim, kind, status, user_id) "
            "VALUES (?, ?, 'manual', 'unknown', ?)",
            [(thesis_id, claim.strip(), user_id) for claim in claims if claim.strip()],
        )
    await db.commit()
    return await get_thesis(thesis_id, user_id)


async def update_claim(thesis_id: int, claim_id: int, status: str, note: str, user_id: int) -> dict[str, Any]:
    row = await database.query_one(
        "SELECT id FROM thesis_claims WHERE id=? AND thesis_id=? AND user_id=?",
        (claim_id, thesis_id, user_id),
    )
    if row is None:
        raise ThesisNotFoundError(f"论文论点不存在：id={claim_id}")
    await database.execute(
        "UPDATE thesis_claims SET status=?, note=?, checked_at=datetime('now') WHERE id=? AND user_id=?",
        (status, note.strip(), claim_id, user_id),
    )
    return await get_thesis(thesis_id, user_id)


def _relative_change(baseline: object, current: object) -> float | None:
    if not isinstance(baseline, (int, float, str)) or not isinstance(current, (int, float, str)):
        return None
    try:
        before = float(baseline)
        after = float(current)
    except (TypeError, ValueError):
        return None
    if before == 0:
        return None
    return (after - before) / abs(before)


def _check_scalar(
    baseline: object,
    current: object,
    threshold: float,
    label: str,
) -> tuple[str, str]:
    change = _relative_change(baseline, current)
    if change is None:
        return "unknown", f"{label}缺少可比基准"
    status = "violated" if abs(change) >= threshold else "holding"
    return status, f"{label}相对基准变化 {change:+.1%}（阈值 {threshold:.0%}）"


def _check_fundamentals(baseline: object, current: object) -> tuple[str, str]:
    if not isinstance(baseline, dict) or not isinstance(current, dict):
        return "unknown", "缺少可比基本面数据"
    changes = {
        metric: change
        for metric in sorted(set(baseline) & set(current))
        if (change := _relative_change(baseline[metric], current[metric])) is not None
    }
    if not changes:
        return "unknown", "没有共同且可计算的基本面指标"
    material = {metric: change for metric, change in changes.items() if abs(change) >= FUNDAMENTAL_DRIFT_THRESHOLD}
    if material:
        summary = "、".join(f"{metric} {change:+.1%}" for metric, change in list(material.items())[:5])
        return "violated", f"基本面显著漂移：{summary}"
    return "holding", f"{len(changes)} 个可比基本面指标均未超过 {FUNDAMENTAL_DRIFT_THRESHOLD:.0%} 阈值"


def _check_report(baseline: object, current: object) -> tuple[str, str]:
    before = str(baseline or "").strip()
    after = str(current or "").strip()
    if not before or not after:
        return "unknown", "尚无更新后的投研报告可比对"
    similarity = SequenceMatcher(None, before, after).ratio()
    status = "violated" if similarity < REPORT_SIMILARITY_THRESHOLD else "holding"
    return status, f"核心论点文本相似度 {similarity:.1%}（阈值 {REPORT_SIMILARITY_THRESHOLD:.0%}）"


async def check_thesis(thesis_id: int, market: ThesisMarket, user_id: int) -> dict[str, Any]:
    thesis = await get_thesis(thesis_id, user_id)
    latest_row = await database.query_one(
        "SELECT id, report_data FROM research_reports "
        "WHERE ticker=? AND status='completed' AND user_id=? AND (? IS NULL OR id<>?) ORDER BY id DESC LIMIT 1",
        (thesis["ticker"], user_id, thesis.get("source_report_id"), thesis.get("source_report_id")),
    )
    latest_report = _loads(latest_row["report_data"], {}) if latest_row else {}
    if not isinstance(latest_report, dict):
        latest_report = {}
    current = await _snapshot(
        thesis["ticker"],
        market,
        report=latest_report,
        report_id=int(latest_row["id"]) if latest_row else None,
        user_id=user_id,
    )
    baseline = thesis["baseline"]
    rules = {
        "price": _check_scalar(baseline.get("price"), current.get("price"), PRICE_DRIFT_THRESHOLD, "价格"),
        "position": _check_scalar(
            baseline.get("position_shares"), current.get("position_shares"), POSITION_DRIFT_THRESHOLD, "持仓",
        ),
        "fundamental": _check_fundamentals(baseline.get("fundamentals"), current.get("fundamentals")),
        "report": _check_report(baseline.get("report_core"), current.get("report_core")),
    }
    db = database.get_db()
    for kind, (status, note) in rules.items():
        await db.execute(
            "UPDATE thesis_claims SET status=?, note=?, checked_at=datetime('now') "
            "WHERE thesis_id=? AND kind=? AND user_id=?",
            (status, note, thesis_id, kind, user_id),
        )
    checked = [status for status, _note in rules.values() if status != "unknown"]
    violated = sum(status == "violated" for status in checked)
    score = round(100 * violated / len(checked), 1) if checked else None
    drift_status = "drifted" if violated else "stable" if checked else "unknown"
    check_payload = {"snapshot": current, "rules": {kind: {"status": value[0], "note": value[1]} for kind, value in rules.items()}}
    await db.execute(
        "UPDATE thesis SET last_check_json=?, drift_status=?, drift_score=?, "
        "last_checked_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?",
        (json.dumps(check_payload, ensure_ascii=False), drift_status, score, thesis_id, user_id),
    )
    await db.commit()
    return await get_thesis(thesis_id, user_id)
