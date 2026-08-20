"""Reversible typed-memory shadow and opt-in rollout for chat/research."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from typing import Any, Literal

from .. import config, database
from .investment_memory import search_memories
from .memory_context import assemble_memory_context

JSONValue = str | int | float | bool | None | list[Any] | dict[str, Any]
Surface = Literal["chat", "research"]


@dataclass(frozen=True)
class MemoryRollout:
    audit_id: int | None = None
    user_id: int | None = None
    mode: Literal["off", "shadow", "opt_in"] = "off"
    context: str = ""
    typed_candidate_count: int = 0
    assembled_chars: int = 0
    estimated_tokens: int = 0
    outcome: str = "off"


def _hash_payload(value: JSONValue) -> str:
    if isinstance(value, str):
        payload = value
    else:
        payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _insert_audit(
    *,
    user_id: int,
    surface: Surface,
    mode: Literal["shadow", "opt_in"],
    query_hash: str,
    native_candidate_count: int,
    typed_candidate_count: int,
    status_counts: dict[str, int],
    assembled_chars: int,
    estimated_tokens: int,
    outcome: Literal["prepared", "fallback"],
    error_code: str | None = None,
) -> int:
    return await database.execute(
        "INSERT INTO memory_rollout_audits "
        "(user_id, surface, mode, query_hash, native_candidate_count, typed_candidate_count, "
        "typed_status_counts_json, assembled_chars, estimated_tokens, outcome, error_code) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user_id, surface, mode, query_hash, native_candidate_count, typed_candidate_count,
            json.dumps(status_counts, ensure_ascii=False, sort_keys=True), assembled_chars,
            estimated_tokens, outcome, error_code,
        ),
    )


async def prepare_memory_rollout(
    query: str,
    *,
    user_id: int,
    surface: Surface,
    native_candidate_count: int,
    subject_type: str | None = None,
    subject_id: str | None = None,
) -> MemoryRollout:
    """Run typed retrieval when enabled; failures always leave the existing FTS path usable."""
    context_enabled = config.MEMORY_TYPED_CONTEXT_ENABLED
    if not context_enabled and not config.MEMORY_TYPED_SHADOW_ENABLED:
        return MemoryRollout()

    mode: Literal["shadow", "opt_in"] = "opt_in" if context_enabled else "shadow"
    query_hash = _hash_payload(query)
    try:
        hits = await search_memories(
            query,
            user_id=user_id,
            subject_type=subject_type,
            subject_id=subject_id,
            limit=5,
        )
        assembled = assemble_memory_context(hits)
        status_counts: dict[str, int] = {}
        for hit in hits:
            status = str(hit.get("status", "UNKNOWN"))
            status_counts[status] = status_counts.get(status, 0) + 1
        audit_id = await _insert_audit(
            user_id=user_id,
            surface=surface,
            mode=mode,
            query_hash=query_hash,
            native_candidate_count=native_candidate_count,
            typed_candidate_count=len(hits),
            status_counts=status_counts,
            assembled_chars=int(assembled["used_chars"]),
            estimated_tokens=int(assembled["estimated_tokens"]),
            outcome="prepared",
        )
        return MemoryRollout(
            audit_id=audit_id,
            user_id=user_id,
            mode=mode,
            context=str(assembled["context"]) if context_enabled else "",
            typed_candidate_count=len(hits),
            assembled_chars=int(assembled["used_chars"]),
            estimated_tokens=int(assembled["estimated_tokens"]),
            outcome="prepared",
        )
    except Exception:
        # ponytail: one stable error code is enough; exception text can contain user or provider data.
        try:
            audit_id = await _insert_audit(
                user_id=user_id,
                surface=surface,
                mode=mode,
                query_hash=query_hash,
                native_candidate_count=native_candidate_count,
                typed_candidate_count=0,
                status_counts={},
                assembled_chars=0,
                estimated_tokens=0,
                outcome="fallback",
                error_code="typed_retrieval_error",
            )
        except Exception:
            audit_id = None
        return MemoryRollout(audit_id=audit_id, user_id=user_id, mode=mode, outcome="fallback")


async def finalize_memory_rollout(
    rollout: MemoryRollout,
    *,
    response: JSONValue | None,
    outcome: Literal["completed", "upstream_error"] = "completed",
) -> None:
    """Finalize metadata without ever persisting query, response, or recalled content."""
    if rollout.audit_id is None or rollout.user_id is None or rollout.outcome == "fallback":
        return
    response_hash = _hash_payload(response) if response is not None else None
    try:
        await database.execute(
            "UPDATE memory_rollout_audits SET response_hash=?, outcome=?, "
            "completed_at=datetime('now') WHERE id=? AND user_id=?",
            (response_hash, outcome, rollout.audit_id, rollout.user_id),
        )
    except Exception:
        # Audit failure must not change the user-facing answer path.
        return
