"""OpenAI 兼容 LLM 客户端（httpx 异步，支持流式与非流式）。

仅依赖 OpenAI Chat Completions 协议，DeepSeek/其他兼容供应商即插即用。
"""
import json
from collections.abc import AsyncIterator

import httpx


class LLMError(Exception):
    """LLM 调用失败，message 面向用户可读。"""


class LLMClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        timeout: float = 120.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout

    def _payload(self, messages: list[dict], stream: bool) -> dict:
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": stream,
        }
        if stream:
            payload["stream_options"] = {"include_usage": True}
        return payload

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    async def chat(self, messages: list[dict]) -> tuple[str, int | None]:
        """非流式调用，返回 (全文, total_tokens)。"""
        url = f"{self.base_url}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as http:
                resp = await http.post(url, json=self._payload(messages, False), headers=self._headers())
        except httpx.HTTPError as e:
            raise LLMError(f"网络错误：{e}") from e
        if resp.status_code != 200:
            raise LLMError(f"API 返回 {resp.status_code}：{resp.text[:300]}")
        data = resp.json()
        content = data["choices"][0]["message"]["content"] or ""
        usage = data.get("usage") or {}
        return content, usage.get("total_tokens")

    async def chat_stream(self, messages: list[dict]) -> AsyncIterator[str]:
        """流式调用，逐 token yield 增量文本。"""
        url = f"{self.base_url}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as http:
                async with http.stream(
                    "POST", url, json=self._payload(messages, True), headers=self._headers()
                ) as resp:
                    if resp.status_code != 200:
                        body = (await resp.aread()).decode("utf-8", "replace")
                        raise LLMError(f"API 返回 {resp.status_code}：{body[:300]}")
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue  # 末包 usage 帧无 choices
                        delta = choices[0].get("delta") or {}
                        text = delta.get("content")
                        if text:
                            yield text
        except httpx.HTTPError as e:
            raise LLMError(f"网络错误：{e}") from e
