"""Best-effort request attribution and persistence for LLM token usage."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Any, cast

from .. import database
from .anthropic_protocol import normalize_openai_usage

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class UsageContext:
    session_type: str = "unknown"
    conversation_id: int | None = None
    user_id: int | None = None


UsageMetrics = dict[str, int | float | None]
MetricsRecord = dict[str, Any]
MetricsSink = Callable[[MetricsRecord], None]

_CURRENT_USAGE: ContextVar[UsageContext] = ContextVar(
    "llm_usage_context", default=UsageContext()
)
_CURRENT_LLM_METRICS: ContextVar[UsageMetrics | None] = ContextVar(
    "llm_execution_metrics", default=None
)
_CURRENT_LLM_METRICS_CONTEXT: ContextVar[dict[str, str]] = ContextVar(
    "llm_execution_metrics_context", default={}
)
_LLM_METRICS_SINKS: ContextVar[tuple[MetricsSink, ...]] = ContextVar(
    "llm_execution_metrics_sinks", default=()
)
_PENDING_WRITES: set[asyncio.Task[None]] = set()


def set_usage_context(
    session_type: str,
    conversation_id: int | None = None,
    user_id: int | None = None,
) -> Token[UsageContext]:
    """Attribute all LLM requests in the current async execution context."""
    normalized = session_type.strip() or "unknown"
    return _CURRENT_USAGE.set(UsageContext(normalized, conversation_id, user_id))


def reset_usage_context(token: Token[UsageContext]) -> None:
    _CURRENT_USAGE.reset(token)


def set_last_llm_metrics(metrics: UsageMetrics | None) -> None:
    """Expose the current async task's latest request metrics to its SSE caller."""
    _CURRENT_LLM_METRICS.set(dict(metrics) if metrics is not None else None)


def get_last_llm_metrics() -> UsageMetrics | None:
    metrics = _CURRENT_LLM_METRICS.get()
    return dict(metrics) if metrics is not None else None


def set_llm_metrics_context(context: dict[str, str]) -> Token[dict[str, str]]:
    return _CURRENT_LLM_METRICS_CONTEXT.set(dict(context))


def reset_llm_metrics_context(token: Token[dict[str, str]]) -> None:
    _CURRENT_LLM_METRICS_CONTEXT.reset(token)


def set_llm_metrics_sink(sink: MetricsSink) -> Token[tuple[MetricsSink, ...]]:
    return _LLM_METRICS_SINKS.set((*_LLM_METRICS_SINKS.get(), sink))


def reset_llm_metrics_sink(token: Token[tuple[MetricsSink, ...]]) -> None:
    _LLM_METRICS_SINKS.reset(token)


def llm_metrics_event_payload(record: MetricsRecord) -> dict[str, Any]:
    prompt_tokens = _count(record.get("prompt_tokens"))
    cached_tokens = _count(record.get("cached_tokens"))
    payload: dict[str, Any] = {
        "model": record.get("model"),
        "ttft_ms": record.get("ttft_ms"),
        "speed_tps": record.get("tokens_per_second"),
        "prompt_tokens": prompt_tokens,
        "cached_tokens": cached_tokens,
        "cache_hit_rate": cached_tokens * 100.0 / prompt_tokens if prompt_tokens else None,
        "completion_tokens": _count(record.get("completion_tokens")),
        "reasoning_tokens": _count(record.get("reasoning_tokens")),
        "context_used": prompt_tokens,
    }
    if isinstance(record.get("role_key"), str):
        payload["role_key"] = record["role_key"]
    return payload


async def interleave_llm_metrics(
    source: AsyncIterator[tuple[str, dict[str, Any]]],
    metrics_queue: asyncio.Queue[dict[str, Any]],
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Forward source events and request metrics as soon as either one is ready."""
    iterator = source.__aiter__()
    source_task: asyncio.Task[tuple[str, dict[str, Any]]] | None = asyncio.create_task(anext(iterator))
    metrics_task: asyncio.Task[dict[str, Any]] | None = asyncio.create_task(metrics_queue.get())
    try:
        while source_task is not None:
            waiting = [task for task in (source_task, metrics_task) if task is not None]
            done, _ = await asyncio.wait(waiting, return_when=asyncio.FIRST_COMPLETED)
            if metrics_task is not None and metrics_task in done:
                yield "llm_metrics", metrics_task.result()
                metrics_task = asyncio.create_task(metrics_queue.get())
            if source_task in done:
                try:
                    event = source_task.result()
                except StopAsyncIteration:
                    source_task = None
                else:
                    yield event
                    source_task = asyncio.create_task(anext(iterator))

        if metrics_task is not None and metrics_task.done():
            yield "llm_metrics", metrics_task.result()
            metrics_task = None
        while not metrics_queue.empty():
            yield "llm_metrics", metrics_queue.get_nowait()
    finally:
        pending = [task for task in (source_task, metrics_task) if task is not None and not task.done()]
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        close = getattr(iterator, "aclose", None)
        if close is not None:
            await close()


def _count(value: object) -> int:
    try:
        return max(0, int(cast(Any, value or 0)))
    except (TypeError, ValueError):
        return 0


async def _write_usage(
    context: UsageContext,
    model_name: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    metrics: UsageMetrics | None,
) -> None:
    try:
        await database.execute(
            "INSERT INTO llm_usage "
            "(session_type, conversation_id, model_name, prompt_tokens, completion_tokens, total_tokens, user_id, "
            "cached_tokens, cache_creation_tokens, reasoning_tokens, ttft_ms, duration_ms, tokens_per_second) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                context.session_type,
                context.conversation_id,
                model_name,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                context.user_id,
                _count(metrics.get("cached_tokens")) if metrics else 0,
                _count(metrics.get("cache_creation_tokens")) if metrics else 0,
                _count(metrics.get("reasoning_tokens")) if metrics else 0,
                metrics.get("ttft_ms") if metrics else None,
                metrics.get("duration_ms") if metrics else None,
                metrics.get("tokens_per_second") if metrics else None,
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
    normalized = normalize_openai_usage(usage)
    prompt = normalized["prompt_tokens"]
    completion = normalized["completion_tokens"]
    total = normalized["total_tokens"]
    if total == 0 and prompt == 0 and completion == 0:
        return
    metrics = {**normalized, **(_CURRENT_LLM_METRICS.get() or {})}
    record: MetricsRecord = {
        "model": model_name,
        **metrics,
        **_CURRENT_LLM_METRICS_CONTEXT.get(),
    }
    for sink in _LLM_METRICS_SINKS.get():
        try:
            sink(dict(record))
        except Exception:
            LOGGER.exception(
                "LLM metrics event sink failed",
                extra={"event": "llm.metrics.sink_failed", "model_name": model_name},
            )
    try:
        database.get_db()
    except AssertionError:
        # Calls outside the application lifespan (for example isolated client
        # tests) have nowhere durable to write.
        return
    task = asyncio.create_task(
        _write_usage(
            _CURRENT_USAGE.get(), model_name, prompt, completion, total,
            metrics,
        ),
        name="persist-llm-usage",
    )
    _PENDING_WRITES.add(task)
    task.add_done_callback(_PENDING_WRITES.discard)


async def flush_llm_usage() -> None:
    """Drain scheduled writes before application database shutdown."""
    while _PENDING_WRITES:
        await asyncio.gather(*tuple(_PENDING_WRITES))
