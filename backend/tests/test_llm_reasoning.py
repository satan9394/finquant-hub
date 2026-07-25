from app.services.llm_client import LLMClient


def test_sanitize_preserves_reasoning_for_tool_call():
    client = LLMClient("https://example.com", "key", "model")
    messages = [{
        "role": "assistant", "content": "ignored", "reasoning_content": "trace",
        "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "tool", "arguments": "{}"}}],
    }]
    cleaned = client._sanitize_messages(messages)
    assert cleaned[0]["content"] is None
    assert cleaned[0]["reasoning_content"] == "trace"
