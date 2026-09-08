"""OpenAI 兼容 LLM 客户端（httpx 异步，支持流式与非流式）。

仅依赖 OpenAI Chat Completions 协议，DeepSeek/其他兼容供应商即插即用。
"""
import json
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import httpx

from .context import DEFAULT_CONTEXT_BUDGET, compact_messages, estimate_tokens
from .llm_usage import record_llm_usage


JSONDict = dict[str, Any]

# 受控工具循环事件枚举（借鉴 OpenAI Agents SDK run_streamed 的类型化事件）。
# chat_with_tools_loop 通过 event_sink 回调发出这些事件，SSE 层/编排层直接消费，
# 避免各调用方自行解析 tool_calls 后重新拼事件。
TOOL_LOOP_EVENTS = ("tool_started", "tool_completed", "tool_failed", "tool_loop_done", "tool_loop_exhausted")


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
        context_budget: int = DEFAULT_CONTEXT_BUDGET,
        proxy_url: str | None = None,
    ):
        if context_budget < 256:
            raise ValueError("context_budget 不能小于 256")
        # Accept pasted chat endpoints as well as provider base URLs, for every call path.
        self.base_url = base_url.strip().rstrip("/").removesuffix("/chat/completions")
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.context_budget = context_budget
        self.proxy_url = proxy_url

    def _payload(self, messages: list[JSONDict], stream: bool) -> JSONDict:
        payload = {
            "model": self.model,
            "messages": self._prepare_messages(messages),
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": stream,
        }
        if stream:
            payload["stream_options"] = {"include_usage": True}
        return payload

    def _prepare_messages(
        self, messages: list[JSONDict], tools: list[JSONDict] | None = None,
    ) -> list[JSONDict]:
        """压缩输入消息，并为工具 schema 预留上下文预算。"""
        tool_tokens = estimate_tokens(tools) if tools else 0
        message_budget = max(128, self.context_budget - tool_tokens)
        return compact_messages(messages, token_budget=message_budget)

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def _http_client(self) -> httpx.AsyncClient:
        """Use the configured LLM proxy without inheriting unrelated proxy ports."""
        return httpx.AsyncClient(
            timeout=self.timeout,
            proxy=self.proxy_url or None,
            trust_env=not bool(self.proxy_url),
        )

    def _response_error(self, status: int, body: str) -> LLMError:
        suggestion = {
            401: "请检查 API Key 是否正确、有效。",
            403: "请检查 API Key 的模型访问权限。",
            404: "请核对 API 地址是否为供应商的 Base URL，以及模型名是否存在。",
            429: "请检查账户额度或稍后重试。",
        }.get(status, "请检查供应商服务状态后重试。")
        snippet = body.replace(self.api_key, "[已隐藏]") if self.api_key else body
        return LLMError(f"API 返回 {status}：{snippet[:300]}。{suggestion}")

    async def list_models(self) -> list[str]:
        """Discover only models actually returned by this OpenAI-compatible provider."""
        try:
            async with self._http_client() as http:
                response = await http.get(f"{self.base_url}/models", headers=self._headers())
            if response.status_code != 200:
                raise self._response_error(response.status_code, response.text)
            data = response.json()
            items = data.get("data") if isinstance(data, dict) else None
            if not isinstance(items, list):
                raise ValueError("invalid model list")
            return sorted({item["id"] for item in items if isinstance(item, dict)
                           and isinstance(item.get("id"), str) and item["id"].strip()})
        except (httpx.HTTPError, ValueError) as exc:
            raise LLMError("无法读取模型列表，请核对 API 地址、网络连接或手动填写模型名。") from exc

    async def chat(self, messages: list[JSONDict]) -> tuple[str, int | None]:
        """非流式调用，返回 (全文, total_tokens)。"""
        url = f"{self.base_url}/chat/completions"
        try:
            async with self._http_client() as http:
                resp = await http.post(url, json=self._payload(messages, False), headers=self._headers())
        except httpx.HTTPError as e:
            raise LLMError("网络错误或超时，请检查 API 地址、网络/代理连接及供应商服务状态后重试。") from e
        if resp.status_code != 200:
            raise self._response_error(resp.status_code, resp.text)
        data = resp.json()
        content = data["choices"][0]["message"]["content"] or ""
        usage = data.get("usage") or {}
        record_llm_usage(self.model, usage)
        return content, usage.get("total_tokens")

    async def chat_with_tools(
        self, messages: list[JSONDict], tools: list[JSONDict] | None = None
    ) -> tuple[str, list[JSONDict], int | None]:
        """调用支持 function_calling，返回 (文本, tool_calls 列表, total_tokens)。

        tool_calls 元素格式：{"id": str, "type": "function", "function": {"name": str, "arguments": str}}
        当 LLM 直接回复文本时 tool_calls 为空列表。
        """
        payload = {
            "model": self.model,
            "messages": self._prepare_messages(messages, tools),
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
        url = f"{self.base_url}/chat/completions"
        try:
            async with self._http_client() as http:
                resp = await http.post(url, json=payload, headers=self._headers())
        except httpx.HTTPError as e:
            raise LLMError("网络错误或超时，请检查 API 地址、网络/代理连接及供应商服务状态后重试。") from e
        if resp.status_code != 200:
            raise self._response_error(resp.status_code, resp.text)
        data = resp.json()
        choice = data["choices"][0]["message"]
        content = choice.get("content") or ""
        raw_calls = choice.get("tool_calls") or []
        tool_calls: list[JSONDict] = []
        for tc in raw_calls:
            tool_calls.append({
                "id": tc["id"],
                "type": tc["type"],
                "reasoning_content": choice.get("reasoning_content"),
                "function": {
                    "name": tc["function"]["name"],
                    "arguments": tc["function"]["arguments"],
                },
            })
        usage = data.get("usage") or {}
        record_llm_usage(self.model, usage)
        return content, tool_calls, usage.get("total_tokens")

    async def chat_with_tools_safe(
        self,
        messages: list[JSONDict],
        tools: list[JSONDict] | None = None,
    ) -> tuple[str, list[JSONDict], int | None]:
        """Tool calling with DeepSeek-compatible assistant message recovery.

        Thinking-mode models require their ``reasoning_content`` to be returned
        together with a tool-call message.  Dropping it produces a 400 on the
        next tool round, so it is retained only on the assistant tool call.
        """
        payload = {
            "model": self.model,
            "messages": self._sanitize_messages(self._prepare_messages(messages, tools)),
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
        url = f"{self.base_url}/chat/completions"
        try:
            async with self._http_client() as http:
                resp = await http.post(url, json=payload, headers=self._headers())
        except httpx.HTTPError as e:
            raise LLMError("网络错误或超时，请检查 API 地址、网络/代理连接及供应商服务状态后重试。") from e
        if resp.status_code != 200:
            raise self._response_error(resp.status_code, resp.text)
        data = resp.json()
        choice = data["choices"][0]["message"]
        content = choice.get("content") or ""
        raw_calls = choice.get("tool_calls") or []
        tool_calls: list[JSONDict] = []
        for tc in raw_calls:
            tool_calls.append({
                "id": tc["id"],
                "type": tc["type"],
                "reasoning_content": choice.get("reasoning_content"),
                "function": {
                    "name": tc["function"]["name"],
                    "arguments": tc["function"]["arguments"],
                },
            })
        usage = data.get("usage") or {}
        record_llm_usage(self.model, usage)
        return content, tool_calls, usage.get("total_tokens")

    def _sanitize_messages(self, messages: list[JSONDict]) -> list[JSONDict]:
        """Normalize tool-call messages without deleting required reasoning."""
        cleaned: list[JSONDict] = []
        for msg in messages:
            copy = dict(msg)
            # 当 role=assistant 且包含 tool_calls 时，content 必须为 None
            if copy.get("role") == "assistant" and copy.get("tool_calls"):
                copy["content"] = None
            cleaned.append(copy)
        return cleaned

    async def chat_with_tools_loop(
        self,
        messages: list[JSONDict],
        tools: list[JSONDict],
        tool_executor: Callable[[str, str], Awaitable[str]],
        max_rounds: int = 5,
        event_sink: Callable[[str, JSONDict], Awaitable[None]] | None = None,
        pre_tool_hook: Callable[[str, str], Awaitable[str | None]] | None = None,
        post_tool_hook: Callable[[str, str, str], Awaitable[str | None]] | None = None,
    ) -> tuple[str, list[JSONDict], int | None]:
        """完整 function_calling 循环：调用 LLM → 执行工具 → 反馈 → 最终回复。

        参数：
            messages: 对话消息列表（会被修改追加轮次）
            tools: OpenAI 格式的工具定义列表
            tool_executor: 异步 callable(name, arguments) → str（工具执行结果文本）
            max_rounds: 最大 tool_use 轮数
            event_sink: 异步 callable(event, data)（可选）。受控事件见 TOOL_LOOP_EVENTS；
                事件 data 统一为 {"tool_name", "arguments", ...}，SSE 层可直接转发。
            pre_tool_hook: 异步 callable(name, arguments_json) → str | None（可选）。
                返回非 None 文本时跳过工具执行，以该文本作为工具结果（guardrail 拦截）。
            post_tool_hook: 异步 callable(name, arguments_json, result_text) → str | None（可选）。
                返回非 None 文本时替换工具结果（输出校验/tripwire 检查）。

        返回：
            (最终文本, 全部工具调用记录 list[dict], total_tokens)
        """
        all_tool_calls: list[JSONDict] = []
        total_tokens = 0

        # Each upstream request made by chat_with_tools_safe is persisted once.
        # Do not add an aggregate row here: that would double-count tool loops.

        for _round in range(max_rounds):
            content, tool_calls, tokens = await self.chat_with_tools_safe(messages, tools)
            total_tokens += tokens or 0

            if not tool_calls:
                if event_sink is not None:
                    await event_sink("tool_loop_done", {"tool_calls": all_tool_calls})
                return content, all_tool_calls, total_tokens or None

            assistant_message = {
                "role": "assistant",
                "content": content or None,
                "tool_calls": [{
                    "id": tc["id"],
                    "type": "function",
                    "function": tc["function"],
                } for tc in tool_calls],
            }
            reasoning = next((tc.get("reasoning_content") for tc in tool_calls if tc.get("reasoning_content")), None)
            if reasoning:
                assistant_message["reasoning_content"] = reasoning
            messages.append(assistant_message)

            for tc in tool_calls:
                func = tc["function"]
                tool_name = func["name"]
                tool_args = func["arguments"]
                if event_sink is not None:
                    await event_sink("tool_started", {"tool_name": tool_name, "arguments": tool_args})

                result_text: str | None = None
                if pre_tool_hook is not None:
                    block = await pre_tool_hook(tool_name, tool_args)
                    if block is not None:
                        result_text = block

                if result_text is None:
                    try:
                        result_text = await tool_executor(tool_name, tool_args)
                    except Exception as e:
                        result_text = f"工具执行异常：{e}"

                if post_tool_hook is not None and result_text is not None:
                    replacement = await post_tool_hook(tool_name, tool_args, result_text)
                    if replacement is not None:
                        result_text = replacement

                all_tool_calls.append({
                    "name": tool_name,
                    "arguments": tool_args,
                    "result": result_text,
                })

                if event_sink is not None:
                    await event_sink("tool_completed", {
                        "tool_name": tool_name,
                        "arguments": tool_args,
                        "result": result_text,
                    })

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result_text or "",
                })

        # 超出最大轮数，强制要求最终回复
        messages.append({"role": "user", "content": "请基于已有数据输出最终结论。"})
        content, _, tokens = await self.chat_with_tools_safe(messages, tools)
        total_tokens += tokens or 0
        if event_sink is not None:
            await event_sink("tool_loop_exhausted", {"tool_calls": all_tool_calls})
        return content, all_tool_calls, total_tokens or None

    async def chat_stream(self, messages: list[JSONDict]) -> AsyncIterator[str]:
        """流式调用，逐 token yield 增量文本。"""
        url = f"{self.base_url}/chat/completions"
        usage: JSONDict = {}
        try:
            async with self._http_client() as http:
                async with http.stream(
                    "POST", url, json=self._payload(messages, True), headers=self._headers()
                ) as resp:
                    if resp.status_code != 200:
                        body = (await resp.aread()).decode("utf-8", "replace")
                        raise self._response_error(resp.status_code, body)
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
                        if isinstance(chunk.get("usage"), dict):
                            usage = chunk["usage"]
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue  # 末包 usage 帧无 choices
                        delta = choices[0].get("delta") or {}
                        text = delta.get("content")
                        if text:
                            yield text
            record_llm_usage(self.model, usage)
        except httpx.HTTPError as e:
            raise LLMError("网络错误或超时，请检查 API 地址、网络/代理连接及供应商服务状态后重试。") from e
