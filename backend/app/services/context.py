"""LLM 上下文 token 预算与确定性摘要压缩。"""

import copy
import json
from typing import Any, Literal, TypeAlias

DEFAULT_CONTEXT_BUDGET = 16_000
DEFAULT_RECENT_GROUPS = 4
_SUMMARY_PREFIX = "较早上下文摘要（已自动压缩）：\n"
_TRUNCATED_SUFFIX = "\n…[已压缩]"
_COMPACTED_ARGUMENTS = '{"_context_compacted":true}'
Message: TypeAlias = dict[str, Any]
TrimCandidate: TypeAlias = (
    tuple[int, Literal["content"], int, None]
    | tuple[int, Literal["arguments"], int, int]
)


def estimate_tokens(value: Any) -> int:
    """无 tokenizer 依赖的保守估算：CJK 每字一个 token，其余约四字符一个。"""
    if isinstance(value, str):
        text = value
    else:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    if not text:
        return 0
    cjk = sum(1 for char in text if _is_cjk(char))
    return max(1, cjk + (len(text) - cjk + 3) // 4)


def estimate_messages(messages: list[Message]) -> int:
    """估算 Chat Completions 消息 token，并计入每条消息的协议开销。"""
    return sum(estimate_tokens(message) + 4 for message in messages)


def compact_messages(
    messages: list[Message],
    token_budget: int = DEFAULT_CONTEXT_BUDGET,
    keep_recent_groups: int = DEFAULT_RECENT_GROUPS,
) -> list[Message]:
    """在预算内保留 system 与近期消息，把较早原子组压成摘要。

    assistant tool-call 与紧随其后的 tool result 被视为一个原子组，避免生成
    缺少调用方或结果方的非法 function-calling 历史。
    """
    if token_budget < 128:
        raise ValueError("token_budget 不能小于 128")
    if keep_recent_groups < 1:
        raise ValueError("keep_recent_groups 不能小于 1")

    copied = copy.deepcopy(messages)
    if estimate_messages(copied) <= token_budget:
        return copied

    system_messages, groups = _split_groups(copied)
    recent_count = min(keep_recent_groups, len(groups))
    dropped = groups[:-recent_count] if recent_count else groups
    recent = groups[-recent_count:] if recent_count else []

    # 先给近期历史腾空间；至少保留最后一个原子组。
    while len(recent) > 1 and estimate_messages(system_messages + _flatten(recent)) > token_budget:
        dropped.append(recent.pop(0))

    candidate = system_messages + _flatten(recent)
    if dropped:
        summary_limit = min(1024, max(32, token_budget // 4))
        summary = _truncate_text(_summarize(dropped), summary_limit)
        candidate = system_messages + [{"role": "system", "content": summary}] + _flatten(recent)

    candidate = _trim_contents(candidate, token_budget)
    if estimate_messages(candidate) > token_budget:
        # 极小预算下优先去掉摘要，保留原始 system 与最近完整原子组。
        candidate = system_messages + _flatten(recent[-1:])
        candidate = _trim_contents(candidate, token_budget)
    return candidate


def _split_groups(messages: list[Message]) -> tuple[list[Message], list[list[Message]]]:
    system_messages: list[Message] = []
    index = 0
    while index < len(messages) and messages[index].get("role") == "system":
        system_messages.append(messages[index])
        index += 1

    groups: list[list[Message]] = []
    while index < len(messages):
        message = messages[index]
        group = [message]
        index += 1
        if message.get("role") == "assistant" and message.get("tool_calls"):
            call_ids = {call.get("id") for call in message["tool_calls"]}
            while (
                index < len(messages)
                and messages[index].get("role") == "tool"
                and messages[index].get("tool_call_id") in call_ids
            ):
                group.append(messages[index])
                index += 1
        groups.append(group)
    return system_messages, groups


def _summarize(groups: list[list[Message]]) -> str:
    lines: list[str] = []
    for message in _flatten(groups):
        role = message.get("role", "unknown")
        if role == "assistant" and message.get("tool_calls"):
            calls: list[str] = []
            for call in message["tool_calls"]:
                function = call.get("function") or {}
                arguments = _truncate_text(str(function.get("arguments", "")), 48)
                calls.append(f"{function.get('name', '?')}({arguments})")
            lines.append(f"- assistant 调用工具：{', '.join(calls)}")
        content = message.get("content")
        if content:
            rendered = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False, default=str)
            lines.append(f"- {role}: {_truncate_text(rendered, 96)}")
    return _SUMMARY_PREFIX + "\n".join(lines)


def _trim_contents(messages: list[Message], token_budget: int) -> list[Message]:
    trimmed = copy.deepcopy(messages)
    while estimate_messages(trimmed) > token_budget:
        candidates: list[TrimCandidate] = []
        for message_index, message in enumerate(trimmed):
            content = message.get("content")
            if isinstance(content, str) and content != _TRUNCATED_SUFFIX.strip():
                candidates.append((estimate_tokens(content), "content", message_index, None))
            for call_index, call in enumerate(message.get("tool_calls") or []):
                arguments = (call.get("function") or {}).get("arguments")
                if isinstance(arguments, str) and arguments != _COMPACTED_ARGUMENTS:
                    candidates.append((estimate_tokens(arguments), "arguments", message_index, call_index))
        if not candidates:
            break
        current_tokens, kind, message_index, candidate_call_index = max(candidates)
        if kind == "arguments":
            assert candidate_call_index is not None
            trimmed[message_index]["tool_calls"][candidate_call_index]["function"]["arguments"] = _COMPACTED_ARGUMENTS
            continue

        excess = estimate_messages(trimmed) - token_budget
        target = max(1, current_tokens - excess - 4)
        original = trimmed[message_index]["content"]
        assert isinstance(original, str)
        shortened = _truncate_text(original, target)
        if shortened == original:
            break
        trimmed[message_index]["content"] = shortened
    return trimmed


def _truncate_text(text: str, token_limit: int) -> str:
    if estimate_tokens(text) <= token_limit:
        return text
    suffix_tokens = estimate_tokens(_TRUNCATED_SUFFIX)
    if token_limit <= suffix_tokens:
        return _TRUNCATED_SUFFIX.strip()

    low, high = 0, len(text)
    while low < high:
        middle = (low + high + 1) // 2
        if estimate_tokens(text[:middle]) + suffix_tokens <= token_limit:
            low = middle
        else:
            high = middle - 1
    return text[:low].rstrip() + _TRUNCATED_SUFFIX


def _flatten(groups: list[list[Message]]) -> list[Message]:
    return [message for group in groups for message in group]


def _is_cjk(char: str) -> bool:
    codepoint = ord(char)
    return (
        0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0xF900 <= codepoint <= 0xFAFF
    )
