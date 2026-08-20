"""Opt-in, bounded capture of unverified research memory candidates."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from .. import config, database
from .investment_memory import create_memory

LOGGER = logging.getLogger(__name__)
_PENDING_WRITES: set[asyncio.Task[list[int]]] = set()
_UNKNOWN_PREFIXES = ("unknown", "未知", "暂无", "当前证据不足")


def extract_research_candidates(report_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Map two canonical report fields to AI inference candidates without reinterpretation."""
    candidates: list[dict[str, Any]] = []
    mappings = (
        ("executive_summary", "hypothesis"),
        ("risk_analysis", "risk_concern"),
    )
    for field, memory_type in mappings:
        value = report_data.get(field)
        if not isinstance(value, str):
            continue
        text = value.strip()
        if not text or text.lower().startswith(_UNKNOWN_PREFIXES):
            continue
        candidates.append({
            "memory_type": memory_type,
            "content": {"field": field, "text": text[:2000]},
        })
    return candidates


async def _persist_research_candidates(
    report_id: int,
    ticker: str,
    report_data: dict[str, Any],
    user_id: int,
) -> list[int]:
    source_id = f"research_report:{report_id}"
    record_ids: list[int] = []
    try:
        for candidate in extract_research_candidates(report_data):
            existing = await database.query_one(
                "SELECT id FROM memory_records "
                "WHERE user_id=? AND source_kind='ai' AND source_id=? AND memory_type=? LIMIT 1",
                (user_id, source_id, candidate["memory_type"]),
            )
            if existing is not None:
                record_ids.append(int(existing["id"]))
                continue
            created = await create_memory(
                user_id=user_id,
                subject_type="instrument",
                subject_id=ticker,
                memory_type=candidate["memory_type"],
                information_kind="AI_INFERENCE",
                content=candidate["content"],
                source_kind="ai",
                source_id=source_id,
                observed_at=(
                    str(report_data["timestamp"])
                    if report_data.get("timestamp") is not None
                    else None
                ),
                status="candidate",
                quality_flags=["AI_GENERATED", "UNVERIFIED"],
                created_by="ai",
            )
            record_ids.append(int(created["id"]))
    except Exception:
        LOGGER.exception(
            "Research memory candidate persistence failed",
            extra={"event": "memory.candidate.persist_failed", "report_id": report_id},
        )
    return record_ids


async def persist_research_candidates(
    report_id: int,
    ticker: str,
    report_data: dict[str, Any],
    user_id: int,
) -> list[int]:
    """Persist bounded AI inference candidates synchronously when opt-in is enabled."""
    if not config.MEMORY_CANDIDATE_EXTRACTION_ENABLED:
        return []
    return await _persist_research_candidates(report_id, ticker, report_data, user_id)


def schedule_research_candidates(
    report_id: int,
    ticker: str,
    report_data: dict[str, Any],
    user_id: int,
) -> bool:
    """Schedule best-effort candidate writes only when the opt-in switch is enabled."""
    if not config.MEMORY_CANDIDATE_EXTRACTION_ENABLED:
        return False
    task = asyncio.create_task(
        _persist_research_candidates(report_id, ticker, report_data, user_id),
        name=f"persist-memory-candidates-{report_id}",
    )
    _PENDING_WRITES.add(task)
    task.add_done_callback(_PENDING_WRITES.discard)
    return True


async def flush_memory_candidates() -> None:
    """Drain candidate writes before the shared database connection closes."""
    while _PENDING_WRITES:
        await asyncio.gather(*tuple(_PENDING_WRITES))
