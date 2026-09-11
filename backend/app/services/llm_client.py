"""OpenAI 兼容 LLM 客户端（httpx 异步，支持流式与非流式）。

仅依赖 OpenAI Chat Completions 协议，DeepSeek/其他兼容供应商即插即用。
"""
import asyncio
import email.utils
import json
import math
import random
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

import httpx

from .context import DEFAULT_CONTEXT_BUDGET, compact_messages, estimate_tokens
from .llm_usage import record_llm_usage


JSONDict = dict[str, Any]

# G-11: 瞬时故障重试纪律——长研究管线（4 Agent × 多轮工具调用）对单次上游抖动零容忍，
# 一次 429/5xx/网络抖动即让整轮研究失败。对可重试故障做有限次指数退避。
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
_MAX_ATTEMPTS = 3          # 首次 + 2 次重试
_BACKOFF_BASE_SECONDS = 0.5  # 退避：0.5s → 1.0s

# VS10: 尊重上游 Retry-After + 退避去同步。
# 1) 上游在 429/503 上明确给出等待时长时按其等待（协议礼节），避免被加重限流；
# 2) 单次等待必须有上限，恶意/异常的超大值不得让一次研究长时间挂住；
# 3) 回落退避加抖动，避免并行 agent 因参数相同而同步重试形成脉冲。
_RETRY_AFTER_MAX_SECONDS = 30.0   # 单次等待上限（秒）
_BACKOFF_JITTER_RATIO = 0.25      # 回落退避抖动幅度：base × [0.75, 1.25]


def _http_date_seconds(raw: str) -> float | None:
    """把 HTTP-date（RFC 9110 的 IMF-fixdate 等格式）解析为距现在的秒数。

    无法解析、无时区信息时按 UTC 处理；**已过去的日期返回 None**（视为不可用，
    交由调用方回落到原退避），绝不返回负数导致 sleep 异常。
    """
    try:
        parsed = email.utils.parsedate_to_datetime(raw)
    except (TypeError, ValueError, OverflowError):
        return None
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    delta = (parsed - datetime.now(timezone.utc)).total_seconds()
    return delta if delta > 0 else None


def _retry_after_seconds(response: httpx.Response) -> float | None:
    """解析响应头 Retry-After（整数秒或 HTTP-date），返回受限的单次等待秒数。

    无法解析 / 负数 / 已过去的日期 / 非有限值 → 返回 None，由调用方回落原退避。
    任何情况下都不抛异常（头解析失败不得让一次研究失败）。
    """
    try:
        raw = response.headers.get("retry-after")
    except Exception:  # pragma: no cover - 防御：异常 header 实现不得影响重试
        return None
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    seconds: float | None
    try:
        seconds = float(text)
    except ValueError:
        seconds = _http_date_seconds(text)
    # VS10（评估者发现）: 严格要求 seconds > 0。`Retry-After: 0` 虽是合法头，但按它
    # 字面等待 0 秒等于"立刻重试"——既无收益，又绕过抖动（抖动正是为并行 agent 去同步），
    # 会形成 0 秒紧循环。故视为"无有效信息"，回落带抖动的退避。
    if seconds is None or not math.isfinite(seconds) or seconds <= 0:
        return None
    return min(seconds, _RETRY_AFTER_MAX_SECONDS)


def _backoff_seconds(attempt: int) -> float:
    """回落退避：指数基数 × 抖动（base=0 时保持 0，测试可置零跳过等待）。"""
    base = _BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
    if base <= 0:
        return 0.0
    return base * random.uniform(1 - _BACKOFF_JITTER_RATIO, 1 + _BACKOFF_JITTER_RATIO)


def _retry_delay_seconds(attempt: int, response: httpx.Response | None) -> float:
    """本次重试前应等待的秒数：上游 Retry-After 优先，否则带抖动的指数退避。"""
    if response is not None:
        retry_after = _retry_after_seconds(response)
        if retry_after is not None:
            return retry_after
    return _backoff_seconds(attempt)

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

    async def _post_chat_with_retry(self, payload: JSONDict) -> httpx.Response:
        """POST /chat/completions，对瞬时故障做有限次指数退避重试（G-11）。

        可重试：网络错误/超时（httpx.HTTPError）、HTTP 429/5xx。
        不可重试：其它 4xx（地址或鉴权类错误，重试无意义）——直接返回响应交调用方报错。
        重试耗尽后：网络类异常抛 LLMError；状态码类返回最后一次响应交调用方生成可行动错误。
        等待时长（VS10）：可重试响应带 Retry-After 时按上游指示等待（受 _RETRY_AFTER_MAX_SECONDS
        上限约束）；缺失/非法时回落带抖动的指数退避。总尝试次数不变，仍 ≤ _MAX_ATTEMPTS。
        """
        url = f"{self.base_url}/chat/completions"
        last_exc: Exception | None = None
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            response: httpx.Response | None = None
            try:
                async with self._http_client() as http:
                    response = await http.post(url, json=payload, headers=self._headers())
            except httpx.HTTPError as exc:
                last_exc = exc
            else:
                last_exc = None
                retryable = response.status_code in _RETRYABLE_STATUS
                if not retryable:
                    return response
                if attempt == _MAX_ATTEMPTS:
                    return response
            if attempt < _MAX_ATTEMPTS:
                await asyncio.sleep(_retry_delay_seconds(attempt, response))
        raise LLMError(
            "网络错误或超时，请检查 API 地址、网络/代理连接及供应商服务状态后重试。"
        ) from last_exc

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
        resp = await self._post_chat_with_retry(self._payload(messages, False))
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
        resp = await self._post_chat_with_retry(payload)
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
        resp = await self._post_chat_with_retry(payload)
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
                        # VS7 P1b: 工具异常此前只被吞成文本回给模型，编排层收不到任何
                        # 失败信号（tool_failed 已在 TOOL_LOOP_EVENTS 声明却从未发出）。
                        if event_sink is not None:
                            await event_sink("tool_failed", {
                                "tool_name": tool_name,
                                "arguments": tool_args,
                                "error": str(e),
                            })

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
