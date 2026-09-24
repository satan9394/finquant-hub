import pytest

from app.services.anthropic_protocol import (
    anthropic_response_to_openai,
    anthropic_stream_delta,
    normalize_anthropic_usage,
    openai_request_to_anthropic,
)


def test_openai_request_extracts_system_maps_tools_and_merges_roles():
    payload = {
        "model": "claude-test",
        "max_tokens": 128,
        "temperature": 0.2,
        "stream": False,
        "messages": [
            {"role": "system", "content": "rules"},
            {"role": "user", "content": "first"},
            {"role": "user", "content": "second"},
            {
                "role": "assistant",
                "content": "checking",
                "tool_calls": [{
                    "id": "call-1",
                    "type": "function",
                    "function": {"name": "quote", "arguments": '{"ticker":"AAPL"}'},
                }],
            },
            {"role": "tool", "tool_call_id": "call-1", "content": "price: 10"},
        ],
        "tools": [{
            "type": "function",
            "function": {
                "name": "quote",
                "description": "Get a quote",
                "parameters": {"type": "object", "properties": {"ticker": {"type": "string"}}},
            },
        }],
        "tool_choice": "required",
    }

    converted = openai_request_to_anthropic(payload)

    assert converted["system"] == "rules"
    assert converted["max_tokens"] == 128
    assert [message["role"] for message in converted["messages"]] == ["user", "assistant", "user"]
    assert converted["messages"][0]["content"] == "first\nsecond"
    assert converted["messages"][1]["content"][-1] == {
        "type": "tool_use", "id": "call-1", "name": "quote", "input": {"ticker": "AAPL"},
    }
    assert converted["messages"][2]["content"] == [
        {"type": "tool_result", "tool_use_id": "call-1", "content": "price: 10"},
    ]
    assert converted["tools"] == [{
        "name": "quote",
        "description": "Get a quote",
        "input_schema": {"type": "object", "properties": {"ticker": {"type": "string"}}},
    }]
    assert converted["tool_choice"] == {"type": "any"}
    assert payload["messages"][0] == {"role": "system", "content": "rules"}


@pytest.mark.parametrize("max_tokens", [0, -1, "bad", True])
def test_anthropic_request_requires_positive_max_tokens(max_tokens):
    with pytest.raises(ValueError, match="max_tokens"):
        openai_request_to_anthropic({"max_tokens": max_tokens, "messages": []})


def test_anthropic_response_maps_text_tool_use_finish_reason_and_usage():
    converted = anthropic_response_to_openai({
        "id": "msg-1",
        "model": "claude-test",
        "stop_reason": "tool_use",
        "content": [
            {"type": "thinking", "thinking": "need data"},
            {"type": "text", "text": "Looking up."},
            {"type": "tool_use", "id": "call-2", "name": "quote", "input": {"ticker": "AAPL"}},
        ],
        "usage": {
            "input_tokens": 80,
            "cache_read_input_tokens": 20,
            "cache_creation_input_tokens": 10,
            "output_tokens": 12,
        },
    })

    choice = converted["choices"][0]
    assert choice["finish_reason"] == "tool_calls"
    assert choice["message"]["content"] == "Looking up."
    assert choice["message"]["reasoning_content"] == "need data"
    assert choice["message"]["tool_calls"][0]["function"] == {
        "name": "quote", "arguments": '{"ticker":"AAPL"}',
    }
    assert converted["usage"] == {
        "prompt_tokens": 110,
        "completion_tokens": 12,
        "total_tokens": 122,
        "cached_tokens": 20,
        "cache_creation_tokens": 10,
        "reasoning_tokens": 0,
    }


def test_anthropic_stream_delta_extracts_text_and_usage_only():
    text, usage = anthropic_stream_delta({
        "type": "content_block_delta",
        "delta": {"type": "text_delta", "text": "hello"},
    })
    assert text == "hello" and usage is None

    text, usage = anthropic_stream_delta({
        "type": "message_start",
        "message": {"usage": {"input_tokens": 7, "cache_read_input_tokens": 3}},
    })
    assert text is None and usage == {"input_tokens": 7, "cache_read_input_tokens": 3}

    text, usage = anthropic_stream_delta({"type": "content_block_delta", "delta": {"type": "input_json_delta"}})
    assert text is None and usage is None


def test_anthropic_usage_normalization_keeps_cached_tokens_in_prompt_total():
    assert normalize_anthropic_usage({
        "input_tokens": 10,
        "cache_read_input_tokens": 4,
        "cache_creation_input_tokens": 2,
        "output_tokens": 5,
    })["prompt_tokens"] == 16
