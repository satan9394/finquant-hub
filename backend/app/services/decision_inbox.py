"""Owner-scoped read-only Decision Inbox built from persisted state changes."""
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from .. import database


ENGINE_VERSION = "decision-inbox/v1"
_QUALITY_ORDER = {"UPSTREAM_ERROR": 0, "UNKNOWN": 1, "PARTIAL": 2, "OK": 3}


def _loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


async def _evidence_refs(user_id: int, evidence_ids: list[str]) -> list[dict[str, Any]]:
    evidence_ids = list(dict.fromkeys(item for item in evidence_ids if item))
    if not evidence_ids:
        return []
    placeholders = ",".join("?" for _ in evidence_ids)
    rows = await database.query_all(
        "SELECT evidence_id, kind, data_status, subject_type, subject_id, metric, source, "
        "as_of, retrieved_at, quality_flags_json FROM evidence_objects "
        f"WHERE user_id=? AND evidence_id IN ({placeholders})",
        (user_id, *evidence_ids),
    )
    by_id = {str(row["evidence_id"]): row for row in rows}
    result: list[dict[str, Any]] = []
    for evidence_id in evidence_ids:
        row = by_id.get(evidence_id)
        if row is None:
            continue
        result.append({
            "evidence_id": evidence_id,
            "kind": row["kind"],
            "data_status": row["data_status"],
            "subject_type": row["subject_type"],
            "subject_id": row["subject_id"],
            "metric": row["metric"],
            "source": row["source"],
            "as_of": row["as_of"],
            "retrieved_at": row["retrieved_at"],
            "quality_flags": _loads(row["quality_flags_json"], []),
        })
    return result


def _quality(refs: list[dict[str, Any]], fallback: str = "UNKNOWN") -> str:
    if not refs:
        return fallback
    return min((str(ref["data_status"]) for ref in refs), key=lambda item: _QUALITY_ORDER[item])


async def _thesis_claim_items(user_id: int) -> list[dict[str, Any]]:
    rows = await database.query_all(
        "SELECT e.id, e.thesis_id, e.claim_id, e.to_status, e.reason, e.evidence_id, e.created_at, "
        "t.ticker, t.title, c.claim FROM thesis_claim_status_events e "
        "JOIN thesis t ON t.id=e.thesis_id AND t.user_id=e.user_id "
        "JOIN thesis_claims c ON c.id=e.claim_id AND c.user_id=e.user_id "
        "WHERE e.user_id=? AND e.trigger_kind='deterministic_check' "
        "ORDER BY e.id DESC LIMIT 50",
        (user_id,),
    )
    result = []
    for row in rows:
        refs = await _evidence_refs(user_id, [str(row["evidence_id"])] if row["evidence_id"] else [])
        priority = "high" if row["to_status"] == "violated" else (
            "medium" if row["to_status"] in {"confirmed", "holding"} else "low"
        )
        result.append({
            "id": f"thesis-claim-event:{row['id']}",
            "kind": "thesis_claim_change",
            "priority": priority,
            "why_now": row["reason"],
            "occurred_at": row["created_at"],
            "object_ref": {
                "type": "thesis", "id": row["thesis_id"], "title": row["title"],
                "ticker": row["ticker"], "claim_id": row["claim_id"], "claim": row["claim"],
                "status": row["to_status"], "path": f"/thesis?id={row['thesis_id']}",
            },
            "evidence_refs": refs,
            "quality_status": _quality(refs),
            "next_action": {"kind": "navigate", "label": "复核论文与证据", "path": f"/thesis?id={row['thesis_id']}"},
        })
    return result


async def _thesis_version_items(user_id: int) -> list[dict[str, Any]]:
    rows = await database.query_all(
        "SELECT v.id, v.thesis_id, v.version, v.change_reason, v.created_at, t.ticker, t.title "
        "FROM thesis_versions v JOIN thesis t ON t.id=v.thesis_id AND t.user_id=v.user_id "
        "WHERE v.user_id=? AND t.status='open' AND v.version > 1 "
        "AND v.version=(SELECT MAX(v2.version) FROM thesis_versions v2 "
        "WHERE v2.user_id=v.user_id AND v2.thesis_id=v.thesis_id) "
        "AND NOT EXISTS (SELECT 1 FROM thesis_version_confirmations c "
        "WHERE c.user_id=v.user_id AND c.thesis_version_id=v.id) "
        "ORDER BY v.id DESC LIMIT 50",
        (user_id,),
    )
    result = []
    for row in rows:
        evidence_rows = await database.query_all(
            "SELECT evidence_id FROM thesis_version_evidence_refs "
            "WHERE user_id=? AND thesis_version_id=? ORDER BY evidence_id",
            (user_id, row["id"]),
        )
        refs = await _evidence_refs(user_id, [str(item["evidence_id"]) for item in evidence_rows])
        result.append({
            "id": f"thesis-version-review:{row['id']}",
            "kind": "thesis_version_review",
            "priority": "medium" if refs else "low",
            "why_now": f"版本 v{row['version']} 尚未由用户确认：{row['change_reason']}",
            "occurred_at": row["created_at"],
            "object_ref": {
                "type": "thesis", "id": row["thesis_id"], "title": row["title"],
                "ticker": row["ticker"], "version": row["version"],
                "path": f"/thesis?id={row['thesis_id']}",
            },
            "evidence_refs": refs,
            "quality_status": _quality(refs),
            "next_action": {"kind": "navigate", "label": "审阅并确认版本", "path": f"/thesis?id={row['thesis_id']}"},
        })
    return result


async def _scheduled_failure_items(user_id: int) -> list[dict[str, Any]]:
    rows = await database.query_all(
        "SELECT id, name, ticker, last_run_at, updated_at FROM scheduled_research_jobs "
        "WHERE user_id=? AND last_status='failed' ORDER BY id DESC LIMIT 50",
        (user_id,),
    )
    return [{
        "id": f"scheduled-research-failure:{row['id']}",
        "kind": "scheduled_research_failure",
        "priority": "high",
        "why_now": "最近一次定时研究运行失败；没有可用研究结论。",
        "occurred_at": row["last_run_at"] or row["updated_at"],
        "object_ref": {
            "type": "scheduled_research", "id": row["id"], "title": row["name"],
            "ticker": row["ticker"], "status": "failed", "path": "/settings",
        },
        "evidence_refs": [],
        "quality_status": "UPSTREAM_ERROR",
        "next_action": {"kind": "navigate", "label": "检查定时研究", "path": "/settings"},
    } for row in rows]


async def build_decision_inbox(user_id: int, *, limit: int = 20) -> dict[str, Any]:
    """Return deterministic, read-only decision items for one owner."""
    items = [
        *await _thesis_claim_items(user_id),
        *await _thesis_version_items(user_id),
        *await _scheduled_failure_items(user_id),
    ]
    grouped: list[dict[str, Any]] = []
    for priority in ("high", "medium", "low"):
        group = sorted(
            (item for item in items if item["priority"] == priority),
            key=lambda item: (str(item["occurred_at"] or ""), item["id"]),
            reverse=True,
        )
        grouped.extend(group)
    selected = grouped[:max(1, min(limit, 50))]
    return {
        "engine_version": ENGINE_VERSION,
        "generated_at": datetime.now(UTC).isoformat(),
        "items": selected,
        "total": len(selected),
    }
