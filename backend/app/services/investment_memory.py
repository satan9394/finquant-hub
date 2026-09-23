"""Raw-SQL CRUD for typed investment memory records."""

from __future__ import annotations

import json
import re
from typing import Any

from .. import database

JSONDict = dict[str, Any]
_SEARCH_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{1,63}|[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
_MEMORY_STATUSES = {"candidate", "confirmed", "superseded", "invalidated", "deleted"}


def _decode(row: JSONDict | None) -> JSONDict | None:
    if row is None:
        return None
    result = dict(row)
    result["content"] = json.loads(result.pop("content_json"))
    result["quality_flags"] = json.loads(result.pop("quality_flags_json"))
    return result


async def create_memory(
    *,
    user_id: int,
    subject_type: str,
    subject_id: str,
    memory_type: str,
    information_kind: str,
    content: JSONDict,
    source_kind: str,
    created_by: str,
    workspace_id: int | None = None,
    source_id: str | None = None,
    evidence_id: str | None = None,
    valid_from: str | None = None,
    valid_to: str | None = None,
    observed_at: str | None = None,
    status: str = "candidate",
    confidence: float | None = None,
    quality_flags: list[str] | None = None,
) -> JSONDict:
    memory_id = await database.execute(
        "INSERT INTO memory_records "
        "(user_id, workspace_id, subject_type, subject_id, memory_type, information_kind, "
        "content_json, source_kind, source_id, evidence_id, valid_from, valid_to, observed_at, "
        "status, confidence, quality_flags_json, created_by) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user_id, workspace_id, subject_type, subject_id, memory_type, information_kind,
            json.dumps(content, ensure_ascii=False), source_kind, source_id, evidence_id,
            valid_from, valid_to, observed_at, status, confidence,
            json.dumps(quality_flags or [], ensure_ascii=False), created_by,
        ),
    )
    result = await get_memory(memory_id, user_id=user_id)
    assert result is not None
    return result


async def get_memory(memory_id: int, *, user_id: int) -> JSONDict | None:
    return _decode(await database.query_one(
        "SELECT * FROM memory_records WHERE id=? AND user_id=?",
        (memory_id, user_id),
    ))


async def list_memories(
    *,
    user_id: int,
    subject_type: str | None = None,
    subject_id: str | None = None,
    workspace_id: int | None = None,
    include_deleted: bool = False,
) -> list[JSONDict]:
    clauses = ["user_id=?"]
    params: list[str | int] = [user_id]
    if subject_type is not None:
        clauses.append("subject_type=?")
        params.append(subject_type)
    if subject_id is not None:
        clauses.append("subject_id=?")
        params.append(subject_id)
    if workspace_id is not None:
        clauses.append("workspace_id=?")
        params.append(workspace_id)
    if not include_deleted:
        clauses.append("status!='deleted'")
    rows = await database.query_all(
        "SELECT * FROM memory_records WHERE " + " AND ".join(clauses) + " ORDER BY updated_at DESC, id DESC",
        tuple(params),
    )
    return [decoded for row in rows if (decoded := _decode(row)) is not None]


async def search_memories(
    query: str,
    *,
    user_id: int,
    subject_type: str | None = None,
    subject_id: str | None = None,
    workspace_id: int | None = None,
    valid_at: str | None = None,
    statuses: tuple[str, ...] = ("confirmed", "candidate"),
    require_provenance: bool = False,
    limit: int = 5,
) -> list[JSONDict]:
    """Retrieve typed memory with hard owner/subject/time/provenance boundaries."""
    if not 1 <= limit <= 20:
        raise ValueError("limit must be between 1 and 20")
    if not statuses or not set(statuses) <= _MEMORY_STATUSES:
        raise ValueError("statuses contains an unsupported memory status")

    clauses = ["m.user_id=?"]
    params: list[Any] = [user_id]
    placeholders = ",".join("?" for _ in statuses)
    clauses.append(f"m.status IN ({placeholders})")
    params.extend(statuses)
    if subject_type is not None:
        clauses.append("m.subject_type=?")
        params.append(subject_type)
    if subject_id is not None:
        clauses.append("m.subject_id=?")
        params.append(subject_id)
    if workspace_id is not None:
        clauses.append("m.workspace_id=?")
        params.append(workspace_id)
    if valid_at is not None:
        clauses.extend((
            "(m.valid_from IS NULL OR m.valid_from<=?)",
            "(m.valid_to IS NULL OR m.valid_to>=?)",
        ))
        params.extend((valid_at, valid_at))
    if require_provenance:
        clauses.append("m.evidence_id IS NOT NULL")

    rows = await database.query_all(
        "SELECT m.*, e.kind AS evidence_kind, e.data_status AS evidence_data_status, "
        "e.source AS evidence_source, e.vendor AS evidence_vendor, e.as_of AS evidence_as_of, "
        "e.quality_flags_json AS evidence_quality_flags_json "
        "FROM memory_records m LEFT JOIN evidence_objects e "
        "ON e.user_id=m.user_id AND e.evidence_id=m.evidence_id WHERE "
        + " AND ".join(clauses),
        tuple(params),
    )
    terms = tuple(dict.fromkeys(match.group(0).lower() for match in _SEARCH_TOKEN.finditer(query)))
    ranked: list[tuple[int, str, int, JSONDict]] = []
    for row in rows:
        decoded = _decode(row)
        if decoded is None:
            continue
        searchable = " ".join((
            decoded["subject_id"],
            decoded["memory_type"],
            json.dumps(decoded["content"], ensure_ascii=False),
        )).lower()
        matched = [term for term in terms if term in searchable]
        if terms and not matched:
            continue
        evidence_flags = json.loads(decoded.pop("evidence_quality_flags_json") or "[]")
        decoded["retrieval"] = {
            "matched_terms": matched,
            "status": decoded["status"],
            "information_kind": decoded["information_kind"],
            "temporal": {
                "valid_from": decoded["valid_from"],
                "valid_to": decoded["valid_to"],
                "observed_at": decoded["observed_at"],
            },
            "provenance": {
                "evidence_id": decoded["evidence_id"],
                "kind": decoded.pop("evidence_kind"),
                "data_status": decoded.pop("evidence_data_status"),
                "source": decoded.pop("evidence_source"),
                "vendor": decoded.pop("evidence_vendor"),
                "as_of": decoded.pop("evidence_as_of"),
                "quality_flags": evidence_flags,
            },
            "trust": "confirmed" if decoded["status"] == "confirmed" else "unverified_candidate",
        }
        timestamp = decoded["observed_at"] or decoded["valid_from"] or decoded["created_at"]
        ranked.append((len(matched), str(timestamp), int(decoded["id"]), decoded))
    ranked.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    if terms and ranked:
        best_term_coverage = ranked[0][0]
        ranked = [item for item in ranked if item[0] == best_term_coverage]
    return [item[3] for item in ranked[:limit]]


async def update_memory(
    memory_id: int,
    *,
    user_id: int,
    content: JSONDict | None = None,
    status: str | None = None,
    confidence: float | None = None,
    quality_flags: list[str] | None = None,
) -> JSONDict | None:
    changes: list[str] = []
    params: list[Any] = []
    if content is not None:
        changes.append("content_json=?")
        params.append(json.dumps(content, ensure_ascii=False))
    if status is not None:
        changes.append("status=?")
        params.append(status)
    if confidence is not None:
        changes.append("confidence=?")
        params.append(confidence)
    if quality_flags is not None:
        changes.append("quality_flags_json=?")
        params.append(json.dumps(quality_flags, ensure_ascii=False))
    if not changes:
        return await get_memory(memory_id, user_id=user_id)
    changes.append("updated_at=datetime('now')")
    cursor = await database.get_db().execute(
        "UPDATE memory_records SET " + ", ".join(changes) + " WHERE id=? AND user_id=?",
        (*params, memory_id, user_id),
    )
    await database.get_db().commit()
    return await get_memory(memory_id, user_id=user_id) if cursor.rowcount == 1 else None


async def delete_memory(memory_id: int, *, user_id: int) -> bool:
    return await update_memory(memory_id, user_id=user_id, status="deleted") is not None


async def export_memories(*, user_id: int) -> list[JSONDict]:
    """Return an owner-scoped allowlist including retained status history."""
    rows = await list_memories(user_id=user_id, include_deleted=True)
    allowed = (
        "id", "workspace_id", "subject_type", "subject_id", "memory_type",
        "information_kind", "content", "source_kind", "source_id", "evidence_id",
        "valid_from", "valid_to", "observed_at", "status", "confidence",
        "quality_flags", "supersedes_id", "created_by", "created_at", "updated_at",
    )
    return [{key: row.get(key) for key in allowed} for row in rows]


async def supersede_memory(
    old_memory_id: int,
    *,
    user_id: int,
    content: JSONDict,
    evidence_id: str | None = None,
    observed_at: str | None = None,
    created_by: str = "user",
    information_kind: str | None = None,
    source_kind: str | None = None,
    source_id: str | None = None,
) -> JSONDict | None:
    old = await get_memory(old_memory_id, user_id=user_id)
    if old is None or old["status"] in {"superseded", "deleted"}:
        return None
    db = database.get_db()
    await db.execute("SAVEPOINT supersede_memory")
    try:
        cursor = await db.execute(
            "INSERT INTO memory_records "
            "(user_id, workspace_id, subject_type, subject_id, memory_type, information_kind, "
            "content_json, source_kind, source_id, evidence_id, valid_from, valid_to, observed_at, "
            "status, confidence, quality_flags_json, supersedes_id, created_by) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                user_id, old["workspace_id"], old["subject_type"], old["subject_id"],
                old["memory_type"], information_kind or old["information_kind"],
                json.dumps(content, ensure_ascii=False),
                source_kind or old["source_kind"],
                source_id if source_kind is not None else old["source_id"],
                evidence_id if evidence_id is not None else old["evidence_id"],
                old["valid_from"], old["valid_to"],
                observed_at, "confirmed" if old["status"] == "confirmed" else "candidate",
                old["confidence"], json.dumps(old["quality_flags"], ensure_ascii=False),
                old_memory_id, created_by,
            ),
        )
        await db.execute(
            "UPDATE memory_records SET status='superseded', updated_at=datetime('now') "
            "WHERE id=? AND user_id=?",
            (old_memory_id, user_id),
        )
        await db.execute("RELEASE SAVEPOINT supersede_memory")
        await db.commit()
    except Exception:
        await db.execute("ROLLBACK TO SAVEPOINT supersede_memory")
        await db.execute("RELEASE SAVEPOINT supersede_memory")
        raise
    if cursor.lastrowid is None:
        raise RuntimeError("memory insert did not return an id")
    return await get_memory(int(cursor.lastrowid), user_id=user_id)
