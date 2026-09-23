import json

import pytest

from app.services.context import compact_messages, estimate_messages, estimate_tokens
from app.services.llm_client import LLMClient


def test_estimate_tokens_handles_cjk_and_ascii():
    assert estimate_tokens("量化研究") == 4
    assert estimate_tokens("abcdefgh") == 2
    assert estimate_tokens("") == 0


def test_messages_under_budget_are_copied_without_changes():
    messages = [{"role": "system", "content": "system"}, {"role": "user", "content": "hello"}]

    result = compact_messages(messages, token_budget=200)

    assert result == messages
    assert result is not messages
    assert result[0] is not messages[0]


def test_context_budget_rejects_protocol_impossible_size():
    with pytest.raises(ValueError, match="128"):
        compact_messages([{"role": "user", "content": "hello"}], token_budget=64)


def test_old_history_is_summarized_within_budget():
    messages = [{"role": "system", "content": "你是研究助手"}]
    for index in range(6):
        messages.extend([
            {"role": "user", "content": f"旧问题 {index} " + "数据" * 80},
            {"role": "assistant", "content": f"旧回答 {index} " + "分析" * 80},
        ])
    messages.append({"role": "user", "content": "最新问题必须保留"})

    result = compact_messages(messages, token_budget=320, keep_recent_groups=3)

    assert estimate_messages(result) <= 320
    assert result[0] == messages[0]
    assert result[1]["role"] == "system"
    assert "较早上下文摘要" in result[1]["content"]
    assert result[-1]["content"] == "最新问题必须保留"


def test_tool_call_and_result_remain_an_atomic_group():
    messages = [
        {"role": "system", "content": "system"},
        {"role": "user", "content": "old " * 200},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{
                "id": "call-1",
                "type": "function",
                "function": {"name": "quote", "arguments": '{"ticker":"AAPL"}'},
            }],
        },
        {"role": "tool", "tool_call_id": "call-1", "content": "price=200"},
        {"role": "user", "content": "latest"},
    ]

    result = compact_messages(messages, token_budget=180, keep_recent_groups=2)

    assistant_index = next(index for index, message in enumerate(result) if message.get("tool_calls"))
    assert result[assistant_index + 1]["role"] == "tool"
    assert result[assistant_index + 1]["tool_call_id"] == "call-1"
    assert estimate_messages(result) <= 180


def test_llm_client_payload_applies_context_budget():
    client = LLMClient("https://example.test", "key", "model", context_budget=256)
    messages = [
        {"role": "system", "content": "system"},
        *({"role": "user", "content": "long context " * 80} for _ in range(8)),
        {"role": "user", "content": "latest"},
    ]

    payload = client._payload(messages, stream=False)

    assert estimate_messages(payload["messages"]) <= 256
    assert payload["messages"][-1]["content"] == "latest"


def test_llm_client_rejects_too_small_context_budget():
    with pytest.raises(ValueError, match="256"):
        LLMClient("https://example.test", "key", "model", context_budget=128)


def test_oversized_tool_arguments_are_compacted_without_splitting_pair():
    messages = [
        {"role": "system", "content": "system"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{
                "id": "call-large",
                "type": "function",
                "function": {"name": "large_tool", "arguments": '{"data":"' + "x" * 5000 + '"}'},
            }],
        },
        {"role": "tool", "tool_call_id": "call-large", "content": "结果" * 5000},
    ]

    result = compact_messages(messages, token_budget=128, keep_recent_groups=1)

    assert estimate_messages(result) <= 128
    assert [message["role"] for message in result] == ["system", "assistant", "tool"]
    arguments = result[1]["tool_calls"][0]["function"]["arguments"]
    assert json.loads(arguments) == {"_context_compacted": True}
    assert len(messages[1]["tool_calls"][0]["function"]["arguments"]) > 5000
