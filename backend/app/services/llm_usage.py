"""Best-effort request attribution and persistence for LLM token usage."""

from __future__ import annotations

import asyncio
import logging
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Any

from .. import database

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class UsageContext:
    session_type: str = "unknown"
    conversation_id: int | None = None


_CURRENT_USAGE: ContextVar[UsageContext] = ContextVar(
    "llm_usage_context", default=UsageContext()
)
_PENDING_WRITES: set[asyncio.Task[None]] = set()


def set_usage_context(session_type: str, conversation_id: int | None = None) -> Token:
    """Attribute all LLM requests in the current async execution context."""
    normalized = session_type.strip() or "unknown"
    return _CURRENT_USAGE.set(UsageContext(normalized, conversation_id))


def reset_usage_context(token: Token) -> None:
    _CURRENT_USAGE.reset(token)


def _count(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


async def _write_usage(
    context: UsageContext,
    model_name: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
) -> None:
    try:
        await database.execute(
            "INSERT INTO llm_usage "
            "(session_type, conversation_id, model_name, prompt_tokens, completion_tokens, total_tokens) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                context.session_type,
                context.conversation_id,
                model_name,
                prompt_tokens,
                completion_tokens,
                total_tokens,
            ),
        )
    except Exception:
        # Usage accounting must never turn a successful model response into a
        # failed user request.
        LOGGER.exception(
            "LLM usage persistence failed",
            extra={
                "event": "llm.usage.persist_failed",
                "session_type": context.session_type,
                "conversation_id": context.conversation_id,
                "model_name": model_name,
            },
        )


def record_llm_usage(model_name: str, usage: dict[str, Any] | None) -> None:
    """Schedule one non-blocking, best-effort usage write for an API request."""
    if not usage:
        return
    prompt = _count(usage.get("prompt_tokens", usage.get("input_tokens")))
    completion = _count(usage.get("completion_tokens", usage.get("output_tokens")))
    total = _count(usage.get("total_tokens")) or prompt + completion
    if total == 0 and prompt == 0 and completion == 0:
        return
    try:
        database.get_db()
    except AssertionError:
        # Calls outside the application lifespan (for example isolated client
        # tests) have nowhere durable to write.
        return
    task = asyncio.create_task(
        _write_usage(_CURRENT_USAGE.get(), model_name, prompt, completion, total),
        name="persist-llm-usage",
    )
    _PENDING_WRITES.add(task)
    task.add_done_callback(_PENDING_WRITES.discard)


async def flush_llm_usage() -> None:
    """Drain scheduled writes before application database shutdown."""
    while _PENDING_WRITES:
        await asyncio.gather(*tuple(_PENDING_WRITES))
