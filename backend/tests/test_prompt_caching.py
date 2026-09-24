"""Anthropic prompt-cache injection stays thresholded and non-mutating."""

from app.services.anthropic_protocol import openai_request_to_anthropic
from app.services.llm_client import LLMClient


def test_cache_breakpoint_is_added_above_1024_estimated_system_tokens_without_mutation():
    system = "界" * 1025
    payload = {"messages": [{"role": "system", "content": system}, {"role": "user", "content": "hi"}]}

    converted = openai_request_to_anthropic(payload)

    assert converted["system"] == [{
        "type": "text",
        "text": system,
        "cache_control": {"type": "ephemeral"},
    }]
    assert payload["messages"][0]["content"] == system


def test_cache_breakpoint_is_not_added_at_the_1024_token_threshold():
    converted = openai_request_to_anthropic({
        "messages": [{"role": "system", "content": "界" * 1024}, {"role": "user", "content": "hi"}],
    })

    assert converted["system"] == "界" * 1024


def test_large_tool_schema_gets_a_breakpoint_when_system_prompt_is_absent():
    converted = openai_request_to_anthropic({
        "messages": [{"role": "user", "content": "hi"}],
        "tools": [{
            "type": "function",
            "function": {"name": "lookup", "parameters": {"description": "界" * 1030}},
        }],
    })

    assert converted["tools"][0]["cache_control"] == {"type": "ephemeral"}


def test_anthropic_client_advertises_the_prompt_caching_beta():
    client = LLMClient("https://api.anthropic.test", "secret", "claude-test", provider="anthropic")

    assert client._headers()["anthropic-beta"] == "prompt-caching-2024-07-31"
