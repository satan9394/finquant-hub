"""Pure conversions between the app's OpenAI chat contract and Anthropic Messages."""

from __future__ import annotations

import json
from typing import Any

from .context import estimate_tokens

JSONDict = dict[str, Any]
PROMPT_CACHE_TOKEN_THRESHOLD = 1024


def _with_prompt_cache_breakpoint(payload: JSONDict) -> JSONDict:
    """Add one ephemeral breakpoint when the system/tools prompt is large."""
    system = payload.get("system")
    tools = payload.get("tools")
    system_tokens = estimate_tokens(system) if system else 0
    tool_tokens = estimate_tokens(tools) if tools else 0
    if system_tokens + tool_tokens <= PROMPT_CACHE_TOKEN_THRESHOLD:
        return payload

    result = dict(payload)
    if isinstance(system, str) and system:
        blocks: list[JSONDict] = [{"type": "text", "text": system}]
        blocks[-1]["cache_control"] = {"type": "ephemeral"}
        result["system"] = blocks
        return result

    if isinstance(system, list) and system:
        blocks = [dict(block) for block in system if isinstance(block, dict)]
        if blocks:
            text_index = next(
                (index for index in range(len(blocks) - 1, -1, -1) if blocks[index].get("type") == "text"),
                len(blocks) - 1,
            )
            blocks[text_index]["cache_control"] = {"type": "ephemeral"}
            result["system"] = blocks
            return result

    # Anthropic also permits a cache breakpoint on a tool definition. Use it
    # only when no system block exists to carry the breakpoint.
    if isinstance(tools, list) and tools:
        copied_tools = [dict(tool) if isinstance(tool, dict) else tool for tool in tools]
        for index in range(len(copied_tools) - 1, -1, -1):
            if isinstance(copied_tools[index], dict):
                copied_tools[index]["cache_control"] = {"type": "ephemeral"}
                result["tools"] = copied_tools
                return result

    return result


def _as_count(value: object) -> int:
    if isinstance(value, bool):
        return 0
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError, OverflowError):
        return 0


def _content_blocks(content: object) -> list[JSONDict]:
    if isinstance(content, str):
        return [{"type": "text", "text": content}] if content else []
    if isinstance(content, list):
        return [dict(block) for block in content if isinstance(block, dict)]
    return []


def _merge_content(left: object, right: object) -> object:
    if isinstance(left, str) and isinstance(right, str):
        return f"{left}\n{right}" if left and right else left or right
    return _content_blocks(left) + _content_blocks(right)


def _tool_input(arguments: object) -> JSONDict:
    if isinstance(arguments, dict):
        return dict(arguments)
    if not isinstance(arguments, str):
        raise ValueError("Anthropic tool arguments must be a JSON object")
    try:
        value = json.loads(arguments)
    except json.JSONDecodeError as exc:
        raise ValueError("Anthropic tool arguments must contain valid JSON") from exc
    if not isinstance(value, dict):
        raise ValueError("Anthropic tool arguments must decode to a JSON object")
    return value


def openai_request_to_anthropic(payload: JSONDict) -> JSONDict:
    """Convert one OpenAI chat request without mutating its messages or tools."""
    raw_max_tokens = payload.get("max_tokens", 4096)
    if isinstance(raw_max_tokens, bool):
        raise ValueError("max_tokens must be a positive integer")
    try:
        max_tokens = int(raw_max_tokens)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("max_tokens must be a positive integer") from exc
    if max_tokens < 1:
        raise ValueError("max_tokens must be a positive integer")

    system_parts: list[object] = []
    messages: list[JSONDict] = []
    for raw_message in payload.get("messages") or []:
        if not isinstance(raw_message, dict):
            continue
        message = raw_message
        role = message.get("role")
        content = message.get("content")
        if role in {"system", "developer"}:
            if content:
                system_parts.append(content)
            continue

        if role == "tool":
            block: JSONDict = {
                "type": "tool_result",
                "tool_use_id": str(message.get("tool_call_id") or ""),
                "content": content if isinstance(content, str) else content or "",
            }
            target_role = "user"
            content_value: object = [block]
        else:
            target_role = "assistant" if role == "assistant" else "user"
            content_blocks = _content_blocks(content)
            for tool_call in message.get("tool_calls") or []:
                if not isinstance(tool_call, dict):
                    continue
                function = tool_call.get("function")
                if not isinstance(function, dict) or not function.get("name"):
                    continue
                content_blocks.append({
                    "type": "tool_use",
                    "id": str(tool_call.get("id") or ""),
                    "name": str(function["name"]),
                    "input": _tool_input(function.get("arguments", "{}")),
                })
            content_value = content_blocks if message.get("tool_calls") else content
            if content_value is None:
                content_value = ""

        if messages and messages[-1]["role"] == target_role:
            messages[-1]["content"] = _merge_content(messages[-1].get("content"), content_value)
        else:
            messages.append({"role": target_role, "content": content_value})

    result: JSONDict = {
        "model": payload.get("model", ""),
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": bool(payload.get("stream", False)),
    }
    if system_parts:
        flattened: list[object] = []
        for part in system_parts:
            if isinstance(part, str):
                flattened.append(part)
            elif isinstance(part, list):
                flattened.extend(_content_blocks(part))
            else:
                flattened.extend(_content_blocks(part))
        if all(isinstance(part, str) for part in flattened):
            result["system"] = "\n".join(part for part in flattened if part)
        else:
            result["system"] = [
                block
                for part in flattened
                for block in (_content_blocks(part) if isinstance(part, str) else [part])
                if isinstance(block, dict)
            ]

    for key in ("temperature", "top_p"):
        if payload.get(key) is not None:
            result[key] = payload[key]
    if payload.get("stop"):
        stop = payload["stop"]
        result["stop_sequences"] = stop if isinstance(stop, list) else [stop]

    raw_tools = payload.get("tools") or []
    tools = []
    for raw_tool in raw_tools:
        if not isinstance(raw_tool, dict):
            continue
        function = raw_tool.get("function") if raw_tool.get("type") == "function" else raw_tool
        if not isinstance(function, dict) or not function.get("name"):
            continue
        tools.append({
            "name": function["name"],
            **({"description": function["description"]} if function.get("description") else {}),
            "input_schema": function.get("parameters") or {"type": "object", "properties": {}},
        })
    tool_choice = payload.get("tool_choice")
    if tool_choice == "none":
        tools = []
    elif tools:
        result["tools"] = tools
        if tool_choice == "required":
            result["tool_choice"] = {"type": "any"}
        elif tool_choice == "auto":
            result["tool_choice"] = {"type": "auto"}
        elif isinstance(tool_choice, dict):
            function = tool_choice.get("function")
            if isinstance(function, dict) and function.get("name"):
                result["tool_choice"] = {"type": "tool", "name": function["name"]}
    return _with_prompt_cache_breakpoint(result)


def normalize_anthropic_usage(usage: JSONDict | None) -> JSONDict:
    """Normalize Anthropic token accounting into the persisted app usage shape."""
    usage = usage or {}
    if "input_tokens" not in usage and "prompt_tokens" in usage:
        return normalize_openai_usage(usage)
    cached = _as_count(usage.get("cache_read_input_tokens"))
    cache_creation = _as_count(usage.get("cache_creation_input_tokens"))
    prompt = _as_count(usage.get("input_tokens")) + cached + cache_creation
    completion = _as_count(usage.get("output_tokens"))
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": prompt + completion,
        "cached_tokens": cached,
        "cache_creation_tokens": cache_creation,
        "reasoning_tokens": _as_count(usage.get("reasoning_tokens")),
    }


def normalize_openai_usage(usage: JSONDict | None) -> JSONDict:
    """Retain the provider's total prompt count while extracting nested details."""
    usage = usage or {}
    prompt_details = usage.get("prompt_tokens_details")
    completion_details = usage.get("completion_tokens_details")
    prompt_details = prompt_details if isinstance(prompt_details, dict) else {}
    completion_details = completion_details if isinstance(completion_details, dict) else {}
    prompt = _as_count(usage.get("prompt_tokens", usage.get("input_tokens")))
    completion = _as_count(usage.get("completion_tokens", usage.get("output_tokens")))
    total = _as_count(usage.get("total_tokens")) or prompt + completion
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
        "cached_tokens": _as_count(prompt_details.get("cached_tokens", usage.get("cached_tokens"))),
        "cache_creation_tokens": _as_count(usage.get("cache_creation_tokens")),
        "reasoning_tokens": _as_count(completion_details.get("reasoning_tokens", usage.get("reasoning_tokens"))),
    }


def anthropic_response_to_openai(response: JSONDict) -> JSONDict:
    """Adapt an Anthropic Messages response to the existing LLMClient contract."""
    text_parts: list[str] = []
    tool_calls: list[JSONDict] = []
    reasoning_parts: list[str] = []
    for block in response.get("content") or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and isinstance(block.get("text"), str):
            text_parts.append(block["text"])
        elif block.get("type") == "thinking" and isinstance(block.get("thinking"), str):
            reasoning_parts.append(block["thinking"])
        elif block.get("type") == "tool_use":
            tool_calls.append({
                "id": block.get("id", ""),
                "type": "function",
                "function": {
                    "name": block.get("name", ""),
                    "arguments": json.dumps(block.get("input") or {}, separators=(",", ":"), ensure_ascii=False),
                },
            })

    stop_reason = response.get("stop_reason")
    finish_reason = {
        "end_turn": "stop",
        "stop_sequence": "stop",
        "tool_use": "tool_calls",
        "max_tokens": "length",
    }.get(stop_reason, "stop")
    message: JSONDict = {
        "role": "assistant",
        "content": "".join(text_parts) or None,
        "tool_calls": tool_calls,
    }
    if reasoning_parts:
        message["reasoning_content"] = "".join(reasoning_parts)
    return {
        "id": response.get("id"),
        "model": response.get("model"),
        "choices": [{"index": 0, "finish_reason": finish_reason, "message": message}],
        "usage": normalize_anthropic_usage(response.get("usage")),
    }


def anthropic_stream_delta(event: JSONDict) -> tuple[str | None, JSONDict | None]:
    """Extract user-visible text and usage increments from one parsed SSE event."""
    event_type = event.get("type")
    usage: JSONDict | None = None
    if event_type == "message_start":
        message = event.get("message")
        if isinstance(message, dict) and isinstance(message.get("usage"), dict):
            usage = dict(message["usage"])
    elif event_type == "message_delta" and isinstance(event.get("usage"), dict):
        usage = dict(event["usage"])

    delta = event.get("delta")
    text = delta.get("text") if isinstance(delta, dict) and delta.get("type") == "text_delta" else None
    return (text if isinstance(text, str) and text else None), usage
