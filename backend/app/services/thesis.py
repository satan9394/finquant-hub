"""Investment thesis persistence and deterministic drift checks."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime
from typing import Any, Protocol

from .. import database
from .market_data import normalize_code
from .provenance import fundamental_envelope, persist_envelope, quote_envelope
from .thesis_drift import evaluate_drift

LOGGER = logging.getLogger(__name__)

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
    persist_check_evidence: bool = False,
) -> dict[str, Any]:
    captured_at = datetime.now(tz=UTC).isoformat()
    snapshot: dict[str, Any] = {
        "captured_at": captured_at,
        "price": None,
        "position_shares": await _position_shares(ticker, user_id),
        "fundamentals": _report_fundamentals(report or {}),
        "report_id": report_id,
        "report_core": _core_report_text(report or {}),
        "quality_flags": [],
        "evidence_ids": {"price": [], "fundamental": []},
    }
    try:
        quote = await market.quote(ticker)
        price = quote.get("price")
        snapshot["price"] = float(price) if price is not None else None
        if persist_check_evidence:
            try:
                envelope = quote_envelope(quote, retrieved_at=captured_at)
                await persist_envelope(envelope, user_id=user_id)
                if envelope["data_status"] in {"OK", "PARTIAL"}:
                    snapshot["evidence_ids"]["price"].append(envelope["evidence_id"])
            except Exception as exc:
                snapshot["quality_flags"].append(f"quote_evidence_unavailable:{type(exc).__name__}")
    except Exception as exc:
        snapshot["quality_flags"].append(f"quote_unavailable:{type(exc).__name__}")
    fundamental_items: list[dict[str, Any]] = []
    evidence = (report or {}).get("fundamental_evidence")
    if isinstance(evidence, dict) and isinstance(evidence.get("items"), list):
        fundamental_items = [item for item in evidence["items"] if isinstance(item, dict)]
    if not snapshot["fundamentals"]:
        try:
            fetched = await market.fundamentals(ticker)
            fundamental_items = [item for item in fetched if isinstance(item, dict)]
            snapshot["fundamentals"] = _fundamental_values(fundamental_items)
        except Exception as exc:
            snapshot["quality_flags"].append(f"fundamentals_unavailable:{type(exc).__name__}")
    if persist_check_evidence:
        for item in fundamental_items:
            try:
                envelope = fundamental_envelope(item, subject_id=ticker, retrieved_at=captured_at)
                await persist_envelope(envelope, user_id=user_id)
                if envelope["data_status"] in {"OK", "PARTIAL"}:
                    snapshot["evidence_ids"]["fundamental"].append(envelope["evidence_id"])
            except Exception as exc:
                snapshot["quality_flags"].append(
                    f"fundamental_evidence_unavailable:{type(exc).__name__}"
                )
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


async def _claim_evidence_edges(claim_id: int, user_id: int) -> list[dict[str, Any]]:
    return await database.query_all(
        "SELECT id, evidence_id, stance, valid_from, valid_to, observed_at, created_source, "
        "status, created_at, updated_at FROM thesis_claim_evidence_edges "
        "WHERE claim_id=? AND user_id=? "
        "ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, id DESC",
        (claim_id, user_id),
    )


async def _claim_status_events(claim_id: int, user_id: int) -> list[dict[str, Any]]:
    return await database.query_all(
        "SELECT id, from_status, to_status, actor, trigger_kind, reason, evidence_id, created_at "
        "FROM thesis_claim_status_events WHERE claim_id=? AND user_id=? ORDER BY id",
        (claim_id, user_id),
    )


def _decode_version(row: dict[str, Any]) -> dict[str, Any]:
    decoded = dict(row)
    decoded["assumptions"] = _loads(decoded.pop("assumptions_json", "[]"), [])
    decoded["claims"] = _loads(decoded.pop("claims_json", "[]"), [])
    decoded["invalidation_conditions"] = _loads(decoded.pop("invalidation_json", "[]"), [])
    decoded.setdefault("supporting_evidence_ids", [])
    decoded.setdefault("opposing_evidence_ids", [])
    return decoded


async def _version_evidence(version_id: int, user_id: int) -> dict[str, list[str]]:
    rows = await database.query_all(
        "SELECT evidence_id, stance FROM thesis_version_evidence_refs "
        "WHERE thesis_version_id=? AND user_id=? ORDER BY evidence_id",
        (version_id, user_id),
    )
    return {
        "supporting_evidence_ids": [row["evidence_id"] for row in rows if row["stance"] == "supporting"],
        "opposing_evidence_ids": [row["evidence_id"] for row in rows if row["stance"] == "opposing"],
    }


async def _version_confirmations(version_id: int, user_id: int) -> list[dict[str, Any]]:
    return await database.query_all(
        "SELECT id, decision, reason, created_at FROM thesis_version_confirmations "
        "WHERE thesis_version_id=? AND user_id=? ORDER BY id",
        (version_id, user_id),
    )


def _version_diff(previous: dict[str, Any] | None, current: dict[str, Any]) -> dict[str, Any]:
    if previous is None:
        return {}
    diff: dict[str, Any] = {}
    fields = (
        "judgment", "judgment_kind", "assumptions", "claims", "invalidation_conditions",
        "supporting_evidence_ids", "opposing_evidence_ids",
    )
    for field in fields:
        if previous.get(field) != current.get(field):
            diff[field] = {"from": previous.get(field), "to": current.get(field)}
    if previous.get("confidence") != current.get("confidence"):
        diff["confidence"] = {
            "from": previous.get("confidence"),
            "to": current.get("confidence"),
            "reason": current.get("change_reason"),
        }
    return diff


async def _current_version(thesis_id: int, user_id: int) -> dict[str, Any] | None:
    row = await database.query_one(
        "SELECT * FROM thesis_versions WHERE thesis_id=? AND user_id=? ORDER BY version DESC LIMIT 1",
        (thesis_id, user_id),
    )
    if row is None:
        return None
    decoded = _decode_version(row)
    decoded.update(await _version_evidence(int(row["id"]), user_id))
    decoded["confirmations"] = await _version_confirmations(int(row["id"]), user_id)
    return decoded


async def list_thesis_versions(thesis_id: int, user_id: int) -> list[dict[str, Any]]:
    owner = await database.query_one("SELECT id FROM thesis WHERE id=? AND user_id=?", (thesis_id, user_id))
    if owner is None:
        return []
    rows = await database.query_all(
        "SELECT * FROM thesis_versions WHERE thesis_id=? AND user_id=? ORDER BY version",
        (thesis_id, user_id),
    )
    result: list[dict[str, Any]] = []
    previous: dict[str, Any] | None = None
    for row in rows:
        decoded = _decode_version(row)
        decoded.update(await _version_evidence(int(row["id"]), user_id))
        decoded["confirmations"] = await _version_confirmations(int(row["id"]), user_id)
        decoded["diff_from_previous"] = _version_diff(previous, decoded)
        result.append(decoded)
        previous = decoded
    return list(reversed(result))


async def confirm_thesis_version(
    thesis_id: int,
    version: int,
    user_id: int,
    *,
    decision: str,
    reason: str,
) -> dict[str, Any]:
    if decision not in {"acknowledged", "disputed"}:
        raise ThesisConflictError("确认决定必须是 acknowledged 或 disputed")
    reason = reason.strip()
    if not reason:
        raise ThesisConflictError("确认原因不能为空")
    row = await database.query_one(
        "SELECT id FROM thesis_versions WHERE thesis_id=? AND version=? AND user_id=?",
        (thesis_id, version, user_id),
    )
    if row is None:
        raise ThesisNotFoundError(f"Thesis 版本不存在：thesis_id={thesis_id}, version={version}")
    confirmation_id = await database.execute(
        "INSERT INTO thesis_version_confirmations "
        "(user_id, thesis_id, thesis_version_id, decision, reason) VALUES (?, ?, ?, ?, ?)",
        (user_id, thesis_id, row["id"], decision, reason),
    )
    confirmation = await database.query_one(
        "SELECT id, decision, reason, created_at FROM thesis_version_confirmations "
        "WHERE id=? AND user_id=?",
        (confirmation_id, user_id),
    )
    if confirmation is None:
        raise RuntimeError("写入 Thesis 版本确认后未能读取")
    return confirmation


async def _review_events(review_id: int, user_id: int) -> list[dict[str, Any]]:
    return await database.query_all(
        "SELECT id, event_type, reason, confirmation_key, created_at "
        "FROM thesis_review_events WHERE review_id=? AND user_id=? ORDER BY id",
        (review_id, user_id),
    )


async def _decode_review(row: dict[str, Any], user_id: int) -> dict[str, Any]:
    decoded = dict(row)
    decoded["changes"] = _loads(decoded.pop("changes_json", "[]"), [])
    decoded["evidence_ids"] = _loads(decoded.pop("evidence_ids_json", "[]"), [])
    decoded["events"] = await _review_events(int(row["id"]), user_id)
    return decoded


async def _get_review(review_id: int, thesis_id: int, user_id: int) -> dict[str, Any] | None:
    row = await database.query_one(
        "SELECT * FROM thesis_review_items WHERE id=? AND thesis_id=? AND user_id=?",
        (review_id, thesis_id, user_id),
    )
    return await _decode_review(row, user_id) if row is not None else None


async def list_thesis_reviews(thesis_id: int, user_id: int) -> list[dict[str, Any]]:
    owner = await database.query_one(
        "SELECT id FROM thesis WHERE id=? AND user_id=?", (thesis_id, user_id)
    )
    if owner is None:
        return []
    rows = await database.query_all(
        "SELECT * FROM thesis_review_items WHERE thesis_id=? AND user_id=? ORDER BY id DESC",
        (thesis_id, user_id),
    )
    return [await _decode_review(row, user_id) for row in rows]


async def decide_thesis_review(
    thesis_id: int,
    review_id: int,
    user_id: int,
    *,
    decision: str,
    reason: str,
) -> dict[str, Any]:
    if decision not in {"acknowledged", "disputed"}:
        raise ThesisConflictError("复盘决定必须是 acknowledged 或 disputed")
    reason = reason.strip()
    if not reason:
        raise ThesisConflictError("复盘决定原因不能为空")
    confirmation_key = hashlib.sha256(
        f"{user_id}:{thesis_id}:{review_id}:{decision}:{reason}".encode()
    ).hexdigest()
    existing = await database.query_one(
        "SELECT review_id FROM thesis_review_events WHERE user_id=? AND confirmation_key=?",
        (user_id, confirmation_key),
    )
    if existing is not None:
        review = await _get_review(review_id, thesis_id, user_id)
        if review is None or int(existing["review_id"]) != review_id:
            raise ThesisConflictError("复盘确认键冲突")
        return review

    review = await _get_review(review_id, thesis_id, user_id)
    if review is None:
        raise ThesisNotFoundError(f"Thesis 复盘项不存在：id={review_id}")
    if review["status"] != "pending":
        raise ThesisConflictError("复盘项已经处理；只有相同决定的重试可幂等返回")

    db = database.get_db()
    await db.execute("SAVEPOINT decide_thesis_review")
    try:
        await db.execute(
            "INSERT INTO thesis_review_events "
            "(user_id, thesis_id, review_id, event_type, reason, confirmation_key) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, thesis_id, review_id, decision, reason, confirmation_key),
        )
        await db.execute(
            "UPDATE thesis_review_items SET status=?, resolved_at=datetime('now') "
            "WHERE id=? AND thesis_id=? AND user_id=? AND status='pending'",
            (decision, review_id, thesis_id, user_id),
        )
        await db.execute("RELEASE SAVEPOINT decide_thesis_review")
        await db.commit()
    except Exception:
        await db.execute("ROLLBACK TO SAVEPOINT decide_thesis_review")
        await db.execute("RELEASE SAVEPOINT decide_thesis_review")
        raise
    resolved = await _get_review(review_id, thesis_id, user_id)
    if resolved is None:
        raise RuntimeError("写入 Thesis 复盘决定后未能读取")
    return resolved


async def _validate_evidence_ids(
    user_id: int,
    supporting: list[str],
    opposing: list[str],
) -> tuple[list[str], list[str]]:
    supporting = list(dict.fromkeys(item.strip() for item in supporting if item.strip()))
    opposing = list(dict.fromkeys(item.strip() for item in opposing if item.strip()))
    overlap = set(supporting) & set(opposing)
    if overlap:
        raise ThesisConflictError("同一 evidence 不能同时标记为 supporting 和 opposing")
    requested = [*supporting, *opposing]
    if requested:
        placeholders = ",".join("?" for _ in requested)
        rows = await database.query_all(
            f"SELECT evidence_id FROM evidence_objects WHERE user_id=? AND evidence_id IN ({placeholders})",
            (user_id, *requested),
        )
        found = {str(row["evidence_id"]) for row in rows}
        missing = [item for item in requested if item not in found]
        if missing:
            raise ThesisConflictError("evidence 不存在或不属于当前用户")
    return supporting, opposing


async def _insert_version(
    *,
    thesis_id: int,
    user_id: int,
    version: int,
    judgment: str,
    judgment_kind: str,
    assumptions: list[str],
    claims: list[str],
    invalidation_conditions: list[str],
    confidence: float | None,
    change_reason: str,
    created_by: str,
    supporting_evidence_ids: list[str],
    opposing_evidence_ids: list[str],
) -> None:
    db = database.get_db()
    cursor = await db.execute(
        "INSERT INTO thesis_versions "
        "(user_id, thesis_id, version, judgment, judgment_kind, assumptions_json, claims_json, "
        "invalidation_json, confidence, change_reason, created_by) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user_id, thesis_id, version, judgment.strip(), judgment_kind,
            json.dumps(assumptions, ensure_ascii=False), json.dumps(claims, ensure_ascii=False),
            json.dumps(invalidation_conditions, ensure_ascii=False), confidence,
            change_reason.strip(), created_by,
        ),
    )
    if cursor.lastrowid is None:
        raise RuntimeError("创建 Thesis 版本后未返回主键")
    await db.executemany(
        "INSERT INTO thesis_version_evidence_refs "
        "(user_id, thesis_version_id, evidence_id, stance) VALUES (?, ?, ?, ?)",
        [
            *((user_id, cursor.lastrowid, item, "supporting") for item in supporting_evidence_ids),
            *((user_id, cursor.lastrowid, item, "opposing") for item in opposing_evidence_ids),
        ],
    )


async def _record_initial_claim_events(
    thesis_id: int,
    user_id: int,
    *,
    version: int,
    actor: str,
) -> None:
    await database.get_db().execute(
        "INSERT INTO thesis_claim_status_events "
        "(user_id, thesis_id, claim_id, from_status, to_status, actor, trigger_kind, reason) "
        "SELECT c.user_id, c.thesis_id, c.id, NULL, c.status, ?, 'initial_create', "
        "'claim created with thesis version ' || ? FROM thesis_claims c "
        "WHERE c.thesis_id=? AND c.user_id=? AND c.version=? "
        "AND NOT EXISTS (SELECT 1 FROM thesis_claim_status_events e "
        "WHERE e.user_id=c.user_id AND e.claim_id=c.id)",
        (actor, version, thesis_id, user_id, version),
    )


async def list_theses(user_id: int, status: str | None = None) -> dict[str, Any]:
    where = " AND status=?" if status else ""
    params = (user_id, status) if status else (user_id,)
    rows = await database.query_all(
        "SELECT * FROM thesis WHERE user_id=?" + where + " ORDER BY updated_at DESC, id DESC",
        params,
    )
    items = [_decode_thesis(row) for row in rows]
    for item in items:
        item["current_version"] = await _current_version(int(item["id"]), user_id)
    return {"items": items, "total": len(rows)}


async def get_thesis(thesis_id: int, user_id: int) -> dict[str, Any]:
    row = await database.query_one("SELECT * FROM thesis WHERE id=? AND user_id=?", (thesis_id, user_id))
    if row is None:
        raise ThesisNotFoundError(f"论文不存在：id={thesis_id}")
    result = _decode_thesis(row)
    claims = await database.query_all(
        "SELECT * FROM thesis_claims WHERE thesis_id=? AND user_id=? AND retired_at IS NULL ORDER BY id",
        (thesis_id, user_id),
    )
    result["claims"] = [_decode_claim(claim) for claim in claims]
    for claim in result["claims"]:
        claim_id = int(claim["id"])
        claim["evidence_edges"] = await _claim_evidence_edges(claim_id, user_id)
        claim["status_events"] = await _claim_status_events(claim_id, user_id)
    result["current_version"] = await _current_version(thesis_id, user_id)
    return result


async def create_validation_experiment_intent(thesis_id: int, user_id: int) -> dict[str, Any]:
    """Build a read-only experiment handoff without inferring strategy parameters."""
    thesis = await get_thesis(thesis_id, user_id)
    return {
        "schema_version": "thesis-validation-experiment/v1",
        "source": {
            "type": "thesis",
            "id": thesis["id"],
            "title": thesis["title"],
            "ticker": thesis["ticker"],
        },
        "capability": "backtests.ma_crossover",
        "fixed_semantics": {
            "frequency": "1d",
            "price_field": "close",
            "signal_at": "close",
            "execute_at": "next_open",
            "position_mode": "long_only",
        },
        "parameters": {"symbol": thesis["ticker"]},
        "requires_confirmation": [
            "short_window", "long_window", "start_date", "end_date", "initial_capital",
            "commission_bps", "slippage_bps", "sell_stamp_duty_bps",
            "minimum_commission_cny", "max_drawdown_stop_pct", "benchmark",
        ],
        "result_interpretation": "VALIDATION_ONLY_NOT_CAUSAL_PROOF",
    }


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
    supporting_evidence_ids: list[str] | None = None,
    opposing_evidence_ids: list[str] | None = None,
    invalidation_conditions: list[str] | None = None,
    confidence: float | None = None,
    change_reason: str = "initial_create",
    judgment_kind: str = "USER_HYPOTHESIS",
    created_by: str = "user",
) -> dict[str, Any]:
    normalized = normalize_code(ticker)
    if source_report_id is not None:
        existing = await database.query_one(
            "SELECT id FROM thesis WHERE source_report_id=? AND user_id=?", (source_report_id, user_id)
        )
        if existing is not None:
            raise ThesisConflictError(f"报告已存为论文：thesis_id={existing['id']}")
    baseline = await _snapshot(
        normalized, market, report=report, report_id=source_report_id, user_id=user_id,
        persist_check_evidence=True,
    )
    supporting, opposing = await _validate_evidence_ids(
        user_id, supporting_evidence_ids or [], opposing_evidence_ids or []
    )
    manual_claims = [claim.strip() for claim in claims if claim.strip()]
    db = database.get_db()
    await db.execute("SAVEPOINT create_thesis_v2")
    try:
        cursor = await db.execute(
            "INSERT INTO thesis "
            "(ticker, title, thesis, assumptions, source_report_id, baseline_json, user_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (normalized, title.strip(), thesis.strip(), json.dumps(assumptions, ensure_ascii=False),
             source_report_id, json.dumps(baseline, ensure_ascii=False), user_id),
        )
        if cursor.lastrowid is None:
            raise RuntimeError("创建投资论文后未返回主键")
        thesis_id = cursor.lastrowid
        await db.executemany(
            "INSERT INTO thesis_claims "
            "(thesis_id, claim, kind, status, baseline_json, user_id, version) "
            "VALUES (?, ?, ?, 'unknown', ?, ?, 1)",
            [
                *((thesis_id, claim, "manual", "{}", user_id) for claim in manual_claims),
                *((thesis_id, claim, kind, json.dumps({"value": baseline.get({
                    "price": "price", "position": "position_shares", "fundamental": "fundamentals",
                    "report": "report_core",
                }[kind])}, ensure_ascii=False), user_id) for kind, claim in AUTO_CLAIMS.items()),
            ],
        )
        await _record_initial_claim_events(
            thesis_id, user_id, version=1, actor="user" if created_by == "user" else "system"
        )
        await _insert_version(
            thesis_id=thesis_id, user_id=user_id, version=1, judgment=thesis,
            judgment_kind=judgment_kind, assumptions=assumptions, claims=manual_claims,
            invalidation_conditions=invalidation_conditions or [], confidence=confidence,
            change_reason=change_reason, created_by=created_by,
            supporting_evidence_ids=supporting, opposing_evidence_ids=opposing,
        )
        await db.execute("RELEASE SAVEPOINT create_thesis_v2")
        await db.commit()
    except Exception:
        await db.execute("ROLLBACK TO SAVEPOINT create_thesis_v2")
        await db.execute("RELEASE SAVEPOINT create_thesis_v2")
        raise
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
        judgment_kind="AI_INFERENCE",
        created_by="ai",
        change_reason="created_from_research_report",
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
    supporting_evidence_ids: list[str] | None = None,
    opposing_evidence_ids: list[str] | None = None,
    invalidation_conditions: list[str] | None = None,
    confidence: float | None = None,
    confidence_provided: bool | None = None,
    change_reason: str = "user_edit",
) -> dict[str, Any]:
    existing = await get_thesis(thesis_id, user_id)
    current = existing.get("current_version") or {}
    supporting, opposing = await _validate_evidence_ids(
        user_id,
        supporting_evidence_ids if supporting_evidence_ids is not None else current.get("supporting_evidence_ids", []),
        opposing_evidence_ids if opposing_evidence_ids is not None else current.get("opposing_evidence_ids", []),
    )
    next_version = int(current.get("version", 0)) + 1
    if confidence_provided is None:
        confidence_provided = confidence is not None
    next_claims = (
        [claim.strip() for claim in claims if claim.strip()]
        if claims is not None
        else [claim["claim"] for claim in existing["claims"] if claim["kind"] == "manual"]
    )
    db = database.get_db()
    await db.execute("SAVEPOINT update_thesis_v2")
    try:
        await db.execute(
            "UPDATE thesis SET title=?, thesis=?, assumptions=?, status=?, updated_at=datetime('now') "
            "WHERE id=? AND user_id=?",
            (title.strip(), thesis.strip(), json.dumps(assumptions, ensure_ascii=False), status, thesis_id, user_id),
        )
        if claims is not None:
            await db.execute(
                "UPDATE thesis_claims SET retired_at=datetime('now') "
                "WHERE thesis_id=? AND kind='manual' AND retired_at IS NULL AND user_id=?",
                (thesis_id, user_id),
            )
            await db.executemany(
                "INSERT INTO thesis_claims (thesis_id, claim, kind, status, user_id, version) "
                "VALUES (?, ?, 'manual', 'unknown', ?, ?)",
                [(thesis_id, claim, user_id, next_version) for claim in next_claims],
            )
            await _record_initial_claim_events(
                thesis_id, user_id, version=next_version, actor="user"
            )
        await _insert_version(
            thesis_id=thesis_id, user_id=user_id, version=next_version, judgment=thesis,
            judgment_kind="USER_HYPOTHESIS", assumptions=assumptions, claims=next_claims,
            invalidation_conditions=(invalidation_conditions if invalidation_conditions is not None
                                     else current.get("invalidation_conditions", [])),
            confidence=confidence if confidence_provided else current.get("confidence"),
            change_reason=change_reason, created_by="user",
            supporting_evidence_ids=supporting, opposing_evidence_ids=opposing,
        )
        await db.execute("RELEASE SAVEPOINT update_thesis_v2")
        await db.commit()
    except Exception:
        await db.execute("ROLLBACK TO SAVEPOINT update_thesis_v2")
        await db.execute("RELEASE SAVEPOINT update_thesis_v2")
        raise
    return await get_thesis(thesis_id, user_id)


async def _replace_claim_edges(
    *,
    thesis_id: int,
    claim_id: int,
    user_id: int,
    evidence_edges: list[dict[str, Any]],
    created_source: str,
) -> list[str]:
    evidence_ids = [str(edge.get("evidence_id") or "").strip() for edge in evidence_edges]
    if any(not item for item in evidence_ids) or len(evidence_ids) != len(set(evidence_ids)):
        raise ThesisConflictError("evidence edge 必须使用唯一且非空的 evidence_id")
    if evidence_ids:
        placeholders = ",".join("?" for _ in evidence_ids)
        rows = await database.query_all(
            f"SELECT evidence_id FROM evidence_objects WHERE user_id=? AND evidence_id IN ({placeholders})",
            (user_id, *evidence_ids),
        )
        if {str(row["evidence_id"]) for row in rows} != set(evidence_ids):
            raise ThesisConflictError("evidence 不存在或不属于当前用户")
    normalized: list[tuple[Any, ...]] = []
    for edge in evidence_edges:
        stance = str(edge.get("stance") or "")
        if stance not in {"supporting", "opposing"}:
            raise ThesisConflictError("evidence stance 必须是 supporting 或 opposing")
        valid_from = edge.get("valid_from")
        valid_to = edge.get("valid_to")
        if valid_from is not None and valid_to is not None and str(valid_to) < str(valid_from):
            raise ThesisConflictError("evidence valid_to 不能早于 valid_from")
        normalized.append((
            user_id, thesis_id, claim_id, str(edge["evidence_id"]), stance,
            valid_from, valid_to, edge.get("observed_at"), created_source,
        ))
    now = datetime.now(tz=UTC).isoformat()
    db = database.get_db()
    await db.execute(
        "UPDATE thesis_claim_evidence_edges SET status='superseded', "
        "valid_to=COALESCE(valid_to, ?), updated_at=datetime('now') "
        "WHERE claim_id=? AND user_id=? AND created_source=? AND status='active'",
        (now, claim_id, user_id, created_source),
    )
    await db.executemany(
        "INSERT INTO thesis_claim_evidence_edges "
        "(user_id, thesis_id, claim_id, evidence_id, stance, valid_from, valid_to, observed_at, "
        "created_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        normalized,
    )
    return evidence_ids


async def _record_claim_event(
    *,
    thesis_id: int,
    claim_id: int,
    user_id: int,
    from_status: str,
    to_status: str,
    actor: str,
    trigger_kind: str,
    reason: str,
    evidence_id: str | None,
) -> None:
    await database.get_db().execute(
        "INSERT INTO thesis_claim_status_events "
        "(user_id, thesis_id, claim_id, from_status, to_status, actor, trigger_kind, reason, evidence_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user_id, thesis_id, claim_id, from_status, to_status, actor,
            trigger_kind, reason.strip(), evidence_id,
        ),
    )


async def update_claim(
    thesis_id: int,
    claim_id: int,
    status: str,
    note: str,
    user_id: int,
    *,
    evidence_edges: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    row = await database.query_one(
        "SELECT id, status FROM thesis_claims "
        "WHERE id=? AND thesis_id=? AND user_id=? AND retired_at IS NULL",
        (claim_id, thesis_id, user_id),
    )
    if row is None:
        raise ThesisNotFoundError(f"论文论点不存在：id={claim_id}")
    db = database.get_db()
    await db.execute("SAVEPOINT update_claim_evidence")
    try:
        evidence_ids = (
            await _replace_claim_edges(
                thesis_id=thesis_id, claim_id=claim_id, user_id=user_id,
                evidence_edges=evidence_edges, created_source="user",
            )
            if evidence_edges is not None else []
        )
        await db.execute(
            "UPDATE thesis_claims SET status=?, note=?, checked_at=datetime('now') "
            "WHERE id=? AND user_id=?",
            (status, note.strip(), claim_id, user_id),
        )
        await _record_claim_event(
            thesis_id=thesis_id, claim_id=claim_id, user_id=user_id,
            from_status=str(row["status"]), to_status=status, actor="user", trigger_kind="manual",
            reason=note or "manual status update", evidence_id=evidence_ids[0] if evidence_ids else None,
        )
        await db.execute("RELEASE SAVEPOINT update_claim_evidence")
        await db.commit()
    except Exception:
        await db.execute("ROLLBACK TO SAVEPOINT update_claim_evidence")
        await db.execute("RELEASE SAVEPOINT update_claim_evidence")
        raise
    return await get_thesis(thesis_id, user_id)


async def _persist_review_item(
    *,
    thesis: dict[str, Any],
    user_id: int,
    evaluation: dict[str, Any],
    changes: list[dict[str, Any]],
) -> None:
    if not changes:
        return
    evidence_ids = sorted({
        str(evidence_id)
        for change in changes
        for field in ("baseline_evidence_ids", "current_evidence_ids")
        for evidence_id in change.get(field, [])
    })
    statuses = [str(change["to_status"]) for change in changes]
    if all(status == "unknown" for status in statuses):
        quality_status = "UNKNOWN"
    elif any(status == "unknown" for status in statuses):
        quality_status = "PARTIAL"
    elif all(change.get("current_evidence_ids") for change in changes):
        quality_status = "OK"
    else:
        quality_status = "PARTIAL"
    current_version = thesis.get("current_version") or {}
    key_payload = {
        "thesis_id": thesis["id"],
        "thesis_version_id": current_version.get("id"),
        "engine_version": evaluation["engine_version"],
        "changes": changes,
    }
    idempotency_key = hashlib.sha256(
        json.dumps(key_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    cursor = await database.get_db().execute(
        "INSERT OR IGNORE INTO thesis_review_items "
        "(user_id, thesis_id, thesis_version_id, idempotency_key, status, quality_status, "
        "engine_version, changes_json, evidence_ids_json) "
        "VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
        (
            user_id, thesis["id"], current_version.get("id"), idempotency_key,
            quality_status, evaluation["engine_version"],
            json.dumps(changes, ensure_ascii=False), json.dumps(evidence_ids),
        ),
    )
    if cursor.rowcount == 1:
        if cursor.lastrowid is None:
            raise RuntimeError("写入 Thesis 复盘项后缺少 ID")
        review_id = int(cursor.lastrowid)
        await database.get_db().execute(
            "INSERT INTO thesis_review_events "
            "(user_id, thesis_id, review_id, event_type, reason) "
            "VALUES (?, ?, ?, 'created', ?)",
            (
                user_id, thesis["id"], review_id,
                f"{evaluation['engine_version']} detected {len(changes)} deterministic status change(s)",
            ),
        )


async def _persist_failed_review(
    thesis_id: int,
    user_id: int,
    exc: Exception,
) -> None:
    owner = await database.query_one(
        "SELECT id FROM thesis WHERE id=? AND user_id=?", (thesis_id, user_id)
    )
    if owner is None:
        return
    current_version = await database.query_one(
        "SELECT id FROM thesis_versions WHERE thesis_id=? AND user_id=? ORDER BY version DESC LIMIT 1",
        (thesis_id, user_id),
    )
    error = f"{type(exc).__name__}: {exc}"
    idempotency_key = hashlib.sha256(
        f"{user_id}:{thesis_id}:{datetime.now(tz=UTC).isoformat()}:{error}".encode()
    ).hexdigest()
    db = database.get_db()
    await db.execute("SAVEPOINT persist_failed_thesis_review")
    try:
        cursor = await db.execute(
            "INSERT INTO thesis_review_items "
            "(user_id, thesis_id, thesis_version_id, idempotency_key, status, quality_status, error) "
            "VALUES (?, ?, ?, ?, 'failed', 'UPSTREAM_ERROR', ?)",
            (
                user_id, thesis_id, current_version["id"] if current_version else None,
                idempotency_key, error,
            ),
        )
        if cursor.lastrowid is None:
            raise RuntimeError("写入失败 Thesis 复盘项后缺少 ID")
        await db.execute(
            "INSERT INTO thesis_review_events "
            "(user_id, thesis_id, review_id, event_type, reason) "
            "VALUES (?, ?, ?, 'check_failed', ?)",
            (user_id, thesis_id, int(cursor.lastrowid), error),
        )
        await db.execute("RELEASE SAVEPOINT persist_failed_thesis_review")
        await db.commit()
    except Exception:
        await db.execute("ROLLBACK TO SAVEPOINT persist_failed_thesis_review")
        await db.execute("RELEASE SAVEPOINT persist_failed_thesis_review")
        raise


async def _check_thesis(thesis_id: int, market: ThesisMarket, user_id: int) -> dict[str, Any]:
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
        persist_check_evidence=True,
    )
    baseline = thesis["baseline"]
    evaluation = evaluate_drift(
        baseline=baseline,
        current=current,
        baseline_evidence_ids=baseline.get("evidence_ids", {}),
        current_evidence_ids=current.get("evidence_ids", {}),
    )
    rules = evaluation["rules"]
    changes: list[dict[str, Any]] = []
    db = database.get_db()
    await db.execute("SAVEPOINT check_thesis_evidence")
    try:
        for kind, rule in rules.items():
            rule_status = str(rule["status"])
            note = str(rule["reason"])
            ids = list(rule["current_evidence_ids"]) if rule_status != "unknown" else []
            claim = await database.query_one(
                "SELECT id, status FROM thesis_claims "
                "WHERE thesis_id=? AND kind=? AND user_id=? AND retired_at IS NULL",
                (thesis_id, kind, user_id),
            )
            if claim is None:
                continue
            if str(claim["status"]) != rule_status:
                changes.append({
                    "result_kind": "COMPUTED_RESULT",
                    "claim_id": int(claim["id"]),
                    "kind": kind,
                    "from_status": str(claim["status"]),
                    "to_status": rule_status,
                    "reason": note,
                    "rule_id": rule["rule_id"],
                    "rule_version": rule["rule_version"],
                    "baseline_value": rule["baseline_value"],
                    "current_value": rule["current_value"],
                    "baseline_evidence_ids": list(rule["baseline_evidence_ids"]),
                    "current_evidence_ids": list(rule["current_evidence_ids"]),
                })
            stance = "opposing" if rule_status == "violated" else "supporting"
            edges = [{
                "evidence_id": evidence_id, "stance": stance,
                "valid_from": current["captured_at"], "valid_to": None,
                "observed_at": current["captured_at"],
            } for evidence_id in ids]
            await _replace_claim_edges(
                thesis_id=thesis_id, claim_id=int(claim["id"]), user_id=user_id,
                evidence_edges=edges, created_source="automatic",
            )
            await db.execute(
                "UPDATE thesis_claims SET status=?, note=?, checked_at=datetime('now') "
                "WHERE id=? AND user_id=?",
                (rule_status, note, claim["id"], user_id),
            )
            await _record_claim_event(
                thesis_id=thesis_id, claim_id=int(claim["id"]), user_id=user_id,
                from_status=str(claim["status"]), to_status=rule_status, actor="system",
                trigger_kind="deterministic_check", reason=note,
                evidence_id=ids[0] if rule_status != "unknown" and ids else None,
            )
        check_payload = {
            "snapshot": current,
            "engine_version": evaluation["engine_version"],
            "rules": rules,
        }
        await db.execute(
            "UPDATE thesis SET last_check_json=?, drift_status=?, drift_score=?, "
            "last_checked_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?",
            (json.dumps(check_payload, ensure_ascii=False), evaluation["drift_status"],
             evaluation["drift_score"], thesis_id, user_id),
        )
        await _persist_review_item(
            thesis=thesis, user_id=user_id, evaluation=evaluation, changes=changes,
        )
        await db.execute("RELEASE SAVEPOINT check_thesis_evidence")
        await db.commit()
    except Exception:
        await db.execute("ROLLBACK TO SAVEPOINT check_thesis_evidence")
        await db.execute("RELEASE SAVEPOINT check_thesis_evidence")
        raise
    return await get_thesis(thesis_id, user_id)


async def check_thesis(thesis_id: int, market: ThesisMarket, user_id: int) -> dict[str, Any]:
    try:
        return await _check_thesis(thesis_id, market, user_id)
    except ThesisNotFoundError:
        raise
    except Exception as exc:
        try:
            await _persist_failed_review(thesis_id, user_id, exc)
        except Exception:
            LOGGER.exception("Failed to persist Thesis review failure for thesis %d", thesis_id)
        raise
