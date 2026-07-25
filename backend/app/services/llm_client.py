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

    async def chat_with_tools(
        self, messages: list[dict], tools: list[dict] | None = None
    ) -> tuple[str, list[dict], int | None]:
        """调用支持 function_calling，返回 (文本, tool_calls 列表, total_tokens)。

        tool_calls 元素格式：{"id": str, "type": "function", "function": {"name": str, "arguments": str}}
        当 LLM 直接回复文本时 tool_calls 为空列表。
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
        url = f"{self.base_url}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as http:
                resp = await http.post(url, json=payload, headers=self._headers())
        except httpx.HTTPError as e:
            raise LLMError(f"网络错误：{e}") from e
        if resp.status_code != 200:
            raise LLMError(f"API 返回 {resp.status_code}：{resp.text[:300]}")
        data = resp.json()
        choice = data["choices"][0]["message"]
        content = choice.get("content") or ""
        raw_calls = choice.get("tool_calls") or []
        tool_calls = []
        for tc in raw_calls:
            tool_calls.append({
                "id": tc["id"],
                "type": tc["type"],
                "function": {
                    "name": tc["function"]["name"],
                    "arguments": tc["function"]["arguments"],
                },
            })
        usage = data.get("usage") or {}
        return content, tool_calls, usage.get("total_tokens")

    async def chat_with_tools_safe(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> tuple[str, list[dict], int | None]:
        """与 chat_with_tools 相同，但自动清理 DeepSeek 非标字段。

        DeepSeek 可能返回 reasoning_content 字段，再次发送时需清理。
        """
        payload = {
            "model": self.model,
            "messages": self._sanitize_messages(messages),
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
        url = f"{self.base_url}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as http:
                resp = await http.post(url, json=payload, headers=self._headers())
        except httpx.HTTPError as e:
            raise LLMError(f"网络错误：{e}") from e
        if resp.status_code != 200:
            raise LLMError(f"API 返回 {resp.status_code}：{resp.text[:300]}")
        data = resp.json()
        choice = data["choices"][0]["message"]
        content = choice.get("content") or ""
        raw_calls = choice.get("tool_calls") or []
        tool_calls = []
        for tc in raw_calls:
            tool_calls.append({
                "id": tc["id"],
                "type": tc["type"],
                "function": {
                    "name": tc["function"]["name"],
                    "arguments": tc["function"]["arguments"],
                },
            })
        usage = data.get("usage") or {}
        return content, tool_calls, usage.get("total_tokens")

    def _sanitize_messages(self, messages: list[dict]) -> list[dict]:
        """清理消息中的 DeepSeek 非标字段。"""
        cleaned = []
        for msg in messages:
            copy = {k: v for k, v in msg.items() if k not in ("reasoning_content",)}
            # 当 role=assistant 且包含 tool_calls 时，content 必须为 None
            if copy.get("role") == "assistant" and copy.get("tool_calls"):
                copy["content"] = None
            cleaned.append(copy)
        return cleaned

    async def chat_with_tools_loop(
        self,
        messages: list[dict],
        tools: list[dict],
        tool_executor: callable,
        max_rounds: int = 5,
    ) -> tuple[str, list[dict], int | None]:
        """完整 function_calling 循环：调用 LLM → 执行工具 → 反馈 → 最终回复。

        参数：
            messages: 对话消息列表（会被修改追加轮次）
            tools: OpenAI 格式的工具定义列表
            tool_executor: 异步 callable(name, arguments) → str（工具执行结果文本）
            max_rounds: 最大 tool_use 轮数

        返回：
            (最终文本, 全部工具调用记录 list[dict], total_tokens)
        """
        all_tool_calls = []

        for _round in range(max_rounds):
            content, tool_calls, tokens = await self.chat_with_tools(messages, tools)

            if not tool_calls:
                return content, all_tool_calls, tokens

            for tc in tool_calls:
                func = tc["function"]
                try:
                    result_text = await tool_executor(func["name"], func["arguments"])
                except Exception as e:
                    result_text = f"工具执行异常：{e}"

                all_tool_calls.append({
                    "name": func["name"],
                    "arguments": func["arguments"],
                    "result": result_text,
                })

                messages.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [{
                        "id": tc["id"],
                        "type": "function",
                        "function": {"name": func["name"], "arguments": func["arguments"]},
                    }],
                })
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result_text,
                })

        # 超出最大轮数，强制要求最终回复
        messages.append({"role": "user", "content": "请基于已有数据输出最终结论。"})
        content, _, tokens = await self.chat_with_tools(messages, tools)
        return content, all_tool_calls, tokens

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
