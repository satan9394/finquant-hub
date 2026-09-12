"""OpenAI 兼容 LLM 客户端（httpx 异步，支持流式与非流式）。

仅依赖 OpenAI Chat Completions 协议，DeepSeek/其他兼容供应商即插即用。
"""
import asyncio
import email.utils
import json
import math
import random
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

import httpx

from .context import DEFAULT_CONTEXT_BUDGET, compact_messages, estimate_tokens
from .llm_usage import record_llm_usage


JSONDict = dict[str, Any]
# VS23：工具循环的两种返回形态——不带截止（既有 3 元组契约）与带截止（多一个**显式**状态项）。
ToolLoopResult = tuple[str, list[JSONDict], int | None]
ToolLoopResultWithStatus = tuple[str, list[JSONDict], int | None, JSONDict]

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

# VS21: 整次调用（首次尝试 + 全部重试）的总时长预算。
# 此前只有两个**分项**上限——"单次尝试超时"（LLMClient.timeout，默认 120s）与"单次等待上限"
# （_RETRY_AFTER_MAX_SECONDS，30s）——**没有任何聚合约束**，故最坏静默等待 = 3×120 + 2×30
# = 420 秒（7 分钟）：用户在"深度研究"里长时间看不到任何反馈，分不清"还在努力"与"已经卡死"。
# 取 180s = 1.5 × 单次尝试超时（120s）的依据：
#   ① 180 > 120 + 30 ⇒ 即使首次尝试跑满超时，紧随其后的**一次完整 30s 上游等待**仍放得下，
#      重试机制不会因预算而形同虚设；
#   ② 由"只在 sleep 前检查"得到的可判定上界 = 180 + 120 = 300 秒（5 分钟），比改动前的 420 秒短 29%；
#   ③ 常见瞬时故障（快速 429/5xx）几乎不消耗预算，仍能拿满 _MAX_ATTEMPTS 次尝试。
_DEFAULT_TOTAL_BUDGET_SECONDS = 180.0
# VS21: 判据"已用 ≥ 预算"的浮点容差。数学上相等时，二进制浮点减法会留下 ±1e-13 级残差
# （实测：now 1000.3 - 1000.0 = 0.2999999999999545 ⇒ 剩余 4.5e-14 > 0）。不设容差就会出现
# "还剩 1e-14 秒 → 睡一下 → 再发一次尝试"这种与语义相悖的抖动。1 微秒相对 180 秒预算可忽略。
_BUDGET_EPSILON_SECONDS = 1e-6

# VS23: **整轮**带工具对话的聚合等待上界——"每次调用最多等 N 秒" ≠ "用户最多等 N 秒"。
# VS21 的单次预算只约束**一次** `_post_chat_with_retry`，而 `chat_with_tools_loop` 每轮各起算一次，
# 故 max_rounds=5 时最坏静默等待 = 5 × (180 + 120) = 1500 秒（25 分钟）：`max_rounds` 只约束
# **轮数**、不约束**时长**，代码里没有任何聚合约束。默认值取 600s = 2 × 单次调用上界(300s)：
#   ① 即使首轮跑满最坏路径(300s)，仍留给后续轮次一个完整的调用窗口，工具循环不会一上来就被截止掐死；
#   ② 由"只在轮间检查"得到的可判定上界 = 600 + 300 = 900 秒（15 分钟），比改动前的 1500 秒短 40%；
#   ③ 它是**调用方**（routers/chat.py）显式传入的值；`chat_with_tools_loop` 自身默认 `None`（不启用），
#      以保持既有行为逐项一致。
DEFAULT_TOOL_LOOP_DEADLINE_SECONDS = 600.0


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
# VS23 追加 `tool_loop_truncated`：整轮截止触发时提前结束的信号（与返回值里的
# `truncated_by_deadline` 同源）。
# ⚠️ VS28 更正：此处原有断言（已删除；取回：`git show 3109b6e -- backend/app/services/llm_client.py`
# 里以 `-` 开头的旧行）称"提前结束"在事件层对客户端也直接可见——与生产链路不符。更正为：
# 该事件只到达**调用方传入的 event_sink**，**不等于到达客户端**。`routers/chat.py` 的 sink
# 刻意只放行 `tool_completed`，因此聊天 SSE 的客户端事件序列里**没有** `tool_loop_truncated`
# （实测只有 tool_call/token/done）。用户可见的截断通道是另外两条：正文前缀 +
# `done.truncated_by_deadline`（前端已消费并渲染持久提示）。
TOOL_LOOP_EVENTS = (
    "tool_started", "tool_completed", "tool_failed", "tool_loop_done", "tool_loop_exhausted",
    "tool_loop_truncated",
)


def _finish_reason_of(data: JSONDict) -> str | None:
    """读取首个 choice 的 finish_reason（VS12 P1-2：识别 max_tokens 截断）。

    finish_reason 属于 choice 而不是 message，也不随 usage 回传；缺失或非法
    结构返回 None（视为未知，不误报截断）。
    """
    choices = data.get("choices") if isinstance(data, dict) else None
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not isinstance(first, dict):
        return None
    reason = first.get("finish_reason")
    return reason if isinstance(reason, str) else None


class LLMError(Exception):
    """LLM 调用失败，message 面向用户可读。

    VS30：失败的**种类**必须结构化可读，调用方才能在不解析文案的前提下分辨
    "这次是被整轮截止压低后的单次预算耗尽"与"普通失败（上游 4xx / 网络重试耗尽 /
    客户端自身预算耗尽）"——仓内铁律是**不得用错误文案做字符串判据**，所以把判据
    放在字段上，而不是放在 message 里。两个字段缺省即"普通失败"：

      - `budget_exhausted`：本条错误是否由 `_post_chat_with_retry` 的 VS21
        **总时长预算耗尽**分支产生（`_budget_exhausted_error`）。普通失败一律 `False`。
      - `effective_budget_seconds`：当时**实际生效**的单次预算。整轮截止把单次预算
        压低时（`research_orch._remaining_call_budget` 的 `min(客户端预算, 截止剩余)`），
        这里就是那个被压低的值；未被压低时它就是客户端的 `total_budget_seconds`。
        调用方据此判定"预算耗尽真正的约束是不是截止"，无需回看文案。
    """

    def __init__(
        self,
        message: str,
        *,
        budget_exhausted: bool = False,
        effective_budget_seconds: float | None = None,
    ) -> None:
        super().__init__(message)
        self.budget_exhausted = budget_exhausted
        self.effective_budget_seconds = effective_budget_seconds


class LLMClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        timeout: float = 120.0,
        total_budget_seconds: float = _DEFAULT_TOTAL_BUDGET_SECONDS,
        context_budget: int = DEFAULT_CONTEXT_BUDGET,
        proxy_url: str | None = None,
    ):
        if context_budget < 256:
            raise ValueError("context_budget 不能小于 256")
        # VS21: 预算必须为正有限数。0/负数不接受——否则"一次都不试"或"永不停止"两种歧义
        # 都会静默发生；NaN 更会让 `remaining <= 0` 恒为 False（预算形同不存在）。
        if not math.isfinite(total_budget_seconds) or total_budget_seconds <= 0:
            raise ValueError("total_budget_seconds 必须是正有限数（单位：秒）")
        # Accept pasted chat endpoints as well as provider base URLs, for every call path.
        self.base_url = base_url.strip().rstrip("/").removesuffix("/chat/completions")
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.total_budget_seconds = total_budget_seconds
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

    def _redact(self, body: str) -> str:
        """错误文案里的上游响应片段一律脱敏：**api_key 绝不出现在任何错误里**。"""
        return body.replace(self.api_key, "[已隐藏]") if self.api_key else body

    def _response_snippet(self, response: httpx.Response | None) -> str:
        """VS23 NIT①：把**脱敏后**的上游 body 片段附到错误文案里（`_response_error` 同款口径）。

        VS21 的预算耗尽路径此前只带状态码、把上游 body 整个丢掉 ⇒ 同一个 429 会被误读成
        "预算太小"，而不是"账户额度/鉴权问题"。响应体拿不到（如未 read 的流式响应）时返回空串：
        错误文案不得因为"取不到片段"而改变性质，更不得因此遮蔽真实失败原因。
        """
        if response is None:
            return ""
        try:
            body = response.text
        except Exception:  # pragma: no cover - 防御：响应体不可读不得遮蔽真实失败原因
            return ""
        snippet = self._redact(body)[:300]
        return f"上游响应片段：{snippet}" if snippet else ""

    def _response_error(self, status: int, body: str) -> LLMError:
        suggestion = {
            401: "请检查 API Key 是否正确、有效。",
            403: "请检查 API Key 的模型访问权限。",
            404: "请核对 API 地址是否为供应商的 Base URL，以及模型名是否存在。",
            429: "请检查账户额度或稍后重试。",
        }.get(status, "请检查供应商服务状态后重试。")
        snippet = self._redact(body)
        return LLMError(f"API 返回 {status}：{snippet[:300]}。{suggestion}")

    def _budget_exhausted_error(
        self, attempts: int, response: httpx.Response | None, budget_seconds: float | None = None,
    ) -> LLMError:
        """VS21：总时长预算耗尽的收尾错误。

        文案必须与"尝试次数用尽"（循环末尾那条）**可区分**——否则线上日志里"上游一路 429
        把预算烧光"与"三次尝试都失败"看起来一模一样，无法诊断。预算耗尽时把最后一次的
        状态码**连同脱敏后的上游响应片段**一并带上（VS23 补 NIT①，与 `_response_error` 同款：
        body 截断 300 字、api_key 一律替换为 `[已隐藏]`），不丢掉上游给出的真实原因。
        `budget_seconds` 是本次实际生效的预算（整轮截止可能把它压到剩余值）；缺省用客户端预算。
        VS30：同时把"这是预算耗尽"与"当时生效的预算是多少"写进 **LLMError 的结构化字段**
        （调用方据此判定"是不是被整轮截止砍断"，不得去匹配本条文案）。
        """
        effective_budget = self.total_budget_seconds if budget_seconds is None else budget_seconds
        detail = f"最后一次尝试返回 HTTP {response.status_code}。" if response is not None else ""
        snippet = self._response_snippet(response)
        return LLMError(
            f"LLM 调用总时长预算已用尽（本次 {effective_budget:g} 秒）：已发起 {attempts} 次尝试仍未成功，"
            f"停止重试。{detail}{snippet}请检查 API 地址、网络/代理连接及供应商服务状态，"
            f"或调大 total_budget_seconds（当前 {self.total_budget_seconds:g} 秒）。",
            budget_exhausted=True,
            effective_budget_seconds=effective_budget,
        )

    async def _post_chat_with_retry(
        self, payload: JSONDict, budget_seconds: float | None = None,
    ) -> httpx.Response:
        """POST /chat/completions，对瞬时故障做有限次指数退避重试（G-11）。

        可重试：网络错误/超时（httpx.HTTPError）、HTTP 429/5xx。
        不可重试：其它 4xx（地址或鉴权类错误，重试无意义）——直接返回响应交调用方报错。
        重试耗尽后：网络类异常抛 LLMError；状态码类返回最后一次响应交调用方生成可行动错误。
        等待时长（VS10）：可重试响应带 Retry-After 时按上游指示等待（受 _RETRY_AFTER_MAX_SECONDS
        上限约束）；缺失/非法时回落带抖动的指数退避。总尝试次数不变，仍 ≤ _MAX_ATTEMPTS。

        整次调用总时长预算（VS21，`self.total_budget_seconds`，默认 _DEFAULT_TOTAL_BUDGET_SECONDS）：
        - 自**重试循环开始**计时；
        - **每次 sleep 之前**检查：已用时长 ≥ 预算（含 _BUDGET_EPSILON_SECONDS 浮点容差）
          ⇒ 立即停止重试，抛可行动的 LLMError（文案含"总时长预算已用尽"，与"尝试次数用尽"可区分）；
        - 剩余预算 < 计划等待 ⇒ 把等待**截断到剩余预算**（不白扔剩余预算，也不越过它）；
        - **不截断进行中的那次尝试**：单次尝试的 `timeout` 语义完全不变；
        - 故可判定上界为 **整次调用墙钟 ≤ 预算 + 单次尝试超时**（因为只在 sleep 前检查，
          最后一次尝试最多在其开始后再消耗一个完整超时；默认值下为 ≤ 300 秒）。
        - 预算是**构造参数**，测试可注入假时钟/小预算而不必真等；首次尝试**永远会执行**，
          预算只在"要不要再来一次"时生效。

        `budget_seconds`（VS23）：本次调用的时长预算**覆盖值**，默认 `None` ⇒ 用
        `self.total_budget_seconds`（与 VS21 逐项一致）。`chat_with_tools_loop` 在启用整轮截止时
        传入 `min(单次预算, 剩余整轮预算)`，使"整轮"不被任何单轮突破；上界公式随之变为
        "本次调用 ≤ 生效预算 + 单次尝试超时"。
        """
        budget = self.total_budget_seconds if budget_seconds is None else budget_seconds
        url = f"{self.base_url}/chat/completions"
        last_exc: Exception | None = None
        started_at = time.monotonic()  # VS21：预算自循环开始计时
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
                remaining = budget - (time.monotonic() - started_at)  # VS21 / VS23: budget = 生效预算
                if remaining <= _BUDGET_EPSILON_SECONDS:
                    # 已用 ≥ 预算：既不再等待，也不发起下一次尝试。首次尝试的真实结果/异常
                    # 已在上面 return/抛出，绝不会因为"没预算了"把成功误判成失败。
                    budget_error = self._budget_exhausted_error(attempt, response, budget)
                    if last_exc is not None:
                        raise budget_error from last_exc
                    raise budget_error
                await asyncio.sleep(min(_retry_delay_seconds(attempt, response), remaining))
        raise LLMError(
            f"网络错误或超时，已用尽 {_MAX_ATTEMPTS} 次尝试（尝试次数用尽）："
            "请检查 API 地址、网络/代理连接及供应商服务状态后重试。"
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
        self, messages: list[JSONDict], tools: list[JSONDict] | None = None, *,
        with_finish_reason: bool = False,
        budget_seconds: float | None = None,
    ) -> tuple[str, list[JSONDict], int | None]:
        """调用支持 function_calling，返回 (文本, tool_calls 列表, total_tokens)。

        tool_calls 元素格式：{"id": str, "type": "function", "function": {"name": str, "arguments": str}}
        当 LLM 直接回复文本时 tool_calls 为空列表。

        with_finish_reason=True 时（VS12 P1-2）额外返回第 4 项 finish_reason
        （"length" 即 max_tokens 截断）。默认 False 保持既有 3 元组契约不变。

        budget_seconds（VS27）透传给 `_post_chat_with_retry`，供**整轮截止**压低单次预算
        （与 `chat_with_tools_safe` 的 VS23 参数同语义、同口径）；默认 None ⇒ 用客户端预算
        `self.total_budget_seconds`，既有调用方**逐项零回归**。研究编排的强制收尾调用走
        的就是本方法，若它不接受该参数，整轮上界（截止 + 单次尝试超时）就不成立。
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
        resp = await self._post_chat_with_retry(payload, budget_seconds=budget_seconds)
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
        tokens = usage.get("total_tokens")
        if with_finish_reason:
            return content, tool_calls, tokens, _finish_reason_of(data)
        return content, tool_calls, tokens

    async def chat_with_tools_safe(
        self,
        messages: list[JSONDict],
        tools: list[JSONDict] | None = None,
        *,
        with_finish_reason: bool = False,
        budget_seconds: float | None = None,
    ) -> tuple[str, list[JSONDict], int | None]:
        """Tool calling with DeepSeek-compatible assistant message recovery.

        Thinking-mode models require their ``reasoning_content`` to be returned
        together with a tool-call message.  Dropping it produces a 400 on the
        next tool round, so it is retained only on the assistant tool call.

        with_finish_reason=True 时（VS12 P1-2）额外返回第 4 项 finish_reason，
        默认 False 保持既有 3 元组契约不变。

        budget_seconds（VS23）透传给 `_post_chat_with_retry`，供整轮截止压低单次预算；
        默认 None ⇒ 用客户端预算，既有调用方行为不变。
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
        resp = await self._post_chat_with_retry(payload, budget_seconds=budget_seconds)
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
        tokens = usage.get("total_tokens")
        if with_finish_reason:
            return content, tool_calls, tokens, _finish_reason_of(data)
        return content, tool_calls, tokens

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
        *,
        deadline_seconds: float | None = None,
    ) -> ToolLoopResult | ToolLoopResultWithStatus:
        """完整 function_calling 循环：调用 LLM → 执行工具 → 反馈 → 最终回复。

        参数：
            messages: 对话消息列表（会被修改追加轮次）
            tools: OpenAI 格式的工具定义列表
            tool_executor: 异步 callable(name, arguments) → str（工具执行结果文本）
            max_rounds: 最大 tool_use 轮数（**只约束轮数，不约束时长**）
            event_sink: 异步 callable(event, data)（可选）。受控事件见 TOOL_LOOP_EVENTS；
                事件 data 统一为 {"tool_name", "arguments", ...}，SSE 层可直接转发。
            pre_tool_hook: 异步 callable(name, arguments_json) → str | None（可选）。
                返回非 None 文本时跳过工具执行，以该文本作为工具结果（guardrail 拦截）。
            post_tool_hook: 异步 callable(name, arguments_json, result_text) → str | None（可选）。
                返回非 None 文本时替换工具结果（输出校验/tripwire 检查）。
            deadline_seconds（VS23）: **整轮**对话的聚合等待上界（秒；相对本函数开始执行计时）。
                `None`（默认）⇒ 与改动前**逐项一致**：不做任何截止判断、每轮都用
                `self.total_budget_seconds` 的单次预算、返回 3 元组。给定正有限数时：
                  ① **每轮开始前**检查是否已过截止（含 `_BUDGET_EPSILON_SECONDS` 浮点容差，与 VS21 同口径）；
                     已过 ⇒ **立即停止发起新的 LLM 调用**（此刻并不持有进行中的调用，故它**不被中断**）；
                  ② 该轮的单次预算被压低为 `min(self.total_budget_seconds, 剩余整轮预算)`；
                  ③ 因截止提前结束 ⇒ 返回**显式**的截断结果（见"返回"），绝不伪装成正常完成；
                  ④ 值必须为正有限数：0/负数/NaN/Inf ⇒ `ValueError`（与 `total_budget_seconds` 同口径）。
                可判定上界：**整轮墙钟 ≤ deadline_seconds + 单次调用上界**（= 单次预算 + 单次尝试超时），
                因为截止只在**轮间**检查，最后一次已经开始的调用最多再多跑一个完整超时；默认值下即
                ≤ 600 + 300 = 900 秒（改动前最坏 5 × 300 = 1500 秒）。上界还可收紧为
                `deadline_seconds + self.timeout`：单轮预算已被剩余值压低，单轮的溢出只剩"最后那次
                进行中的尝试"。

        返回：
            `deadline_seconds is None` ⇒ `(最终文本, 全部工具调用记录 list[dict], total_tokens)`
            （**既有 3 元组契约不变**）。
            `deadline_seconds` 非 None ⇒ **4 元组，末项为状态字典**（设了截止就一定拿得到状态，
            因此不存在"设了截止却读不到截断标记"的静默用法）：
                {"truncated_by_deadline": bool,  # True = 因截止提前结束（显式），不是"正常完成"
                 "reason": str | None,           # "deadline_exceeded_before_tool_round"
                                                 # | "deadline_exceeded_before_final_answer" | None
                 "deadline_seconds": float | None,
                 "llm_calls": int,               # 实际发起的上游对话调用次数（不含内部重试）
                 "elapsed_seconds": float}       # 整轮已消耗墙钟（由注入的时钟测得）
            截断时第 1 项是**最后一段可用文本**（可能为空串）、第 2 项是已完成的工具调用记录，
            调用方据此如实提示"因超过总时长上限提前结束，以下为已完成部分"；若提供了 `event_sink`，
            同时向**该 sink** 发出受控事件 `tool_loop_truncated`。
            ⚠️ VS28 更正：此处原有断言（已删除；取回：`git show 3109b6e -- backend/app/services/llm_client.py`
            里以 `-` 开头的旧行）称该事件与返回值互为同一来源、两条路径都让用户看得到"提前结束"，
            与生产链路不符。更正为：事件只到 sink，
            **是否到达用户由调用方决定**——`routers/chat.py` 的白名单只放行 `tool_completed`，
            聊天 SSE 里**看不到** `tool_loop_truncated`。故"用户看得见"不靠本事件，而靠调用方接线：
            chat 走「正文前缀（并落库）+ `done.truncated_by_deadline`（前端消费→持久提示）」。
            完成后恰好越过截止 ⇒ 仍按**完成**返回（`truncated_by_deadline=False`）：
            完成就是完成，不得误报截断。
        """
        if deadline_seconds is not None and (
            not math.isfinite(deadline_seconds) or deadline_seconds <= 0
        ):
            # 与 total_budget_seconds 同口径：拒绝 0/负数/NaN/Inf，而不是"一次都不试"或"永不停止"。
            raise ValueError("deadline_seconds 必须是正有限数（单位：秒）或 None")

        all_tool_calls: list[JSONDict] = []
        total_tokens = 0
        llm_calls = 0
        last_content = ""
        loop_started_at = time.monotonic()

        # Each upstream request made by chat_with_tools_safe is persisted once.
        # Do not add an aggregate row here: that would double-count tool loops.

        def _remaining_round_budget() -> float | None:
            """本轮可用的单次调用预算 = min(单次预算, 剩余整轮预算)；未启用截止时为 None（行为不变）。"""
            if deadline_seconds is None:
                return None
            return min(self.total_budget_seconds, deadline_seconds - (time.monotonic() - loop_started_at))

        def _deadline_reached() -> bool:
            """截止是否已到（含 VS21 同款浮点容差）；未启用截止时恒为 False。"""
            if deadline_seconds is None:
                return False
            return deadline_seconds - (time.monotonic() - loop_started_at) <= _BUDGET_EPSILON_SECONDS

        def _status(truncated: bool, reason: str | None) -> JSONDict:
            return {
                "truncated_by_deadline": truncated,
                "reason": reason,
                "deadline_seconds": deadline_seconds,
                "llm_calls": llm_calls,
                "elapsed_seconds": time.monotonic() - loop_started_at,
            }

        def _finish(content: str) -> ToolLoopResult | ToolLoopResultWithStatus:
            """正常收尾：未启用截止 ⇒ 3 元组（既有契约）；启用 ⇒ 4 元组（末项状态显式）。"""
            completed: ToolLoopResult = (content, all_tool_calls, total_tokens or None)
            if deadline_seconds is None:
                return completed
            return (*completed, _status(False, None))

        async def _truncate(reason: str) -> ToolLoopResultWithStatus:
            """因截止提前结束：显式截断结果 + 受控事件，**绝不**伪装成正常完成。"""
            if event_sink is not None:
                await event_sink("tool_loop_truncated", {
                    "reason": reason,
                    "deadline_seconds": deadline_seconds,
                    "tool_calls": all_tool_calls,
                })
            return (last_content, all_tool_calls, total_tokens or None, _status(True, reason))

        for _round in range(max_rounds):
            if _deadline_reached():
                # 截止已过：不再发起新的 LLM 调用（进行中的调用不受影响——此刻不持有它）。
                return await _truncate("deadline_exceeded_before_tool_round")
            llm_calls += 1
            content, tool_calls, tokens, _finish_reason = await self.chat_with_tools_safe(
                messages, tools, with_finish_reason=True, budget_seconds=_remaining_round_budget(),
            )
            total_tokens += tokens or 0
            last_content = content

            if not tool_calls:
                if event_sink is not None:
                    await event_sink("tool_loop_done", {"tool_calls": all_tool_calls})
                # 边界：截止可能恰好在这次**成功**调用之后才越过——完成就是完成，不得误报截断。
                return _finish(content)

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

        # 超出最大轮数，强制要求最终回复。
        # VS23：收尾那次请求同样是"新的 LLM 调用"，故同样先查截止（并在触发时**不发**这条
        # 督促消息——不留下一条永远等不到回复的 user 消息污染后续上下文）。
        if _deadline_reached():
            return await _truncate("deadline_exceeded_before_final_answer")
        messages.append({"role": "user", "content": "请基于已有数据输出最终结论。"})
        llm_calls += 1
        content, _, tokens, _finish_reason = await self.chat_with_tools_safe(
            messages, tools, with_finish_reason=True, budget_seconds=_remaining_round_budget(),
        )
        total_tokens += tokens or 0
        last_content = content
        if event_sink is not None:
            await event_sink("tool_loop_exhausted", {"tool_calls": all_tool_calls})
        return _finish(content)

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
