import email.utils
import json
import random
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest

from app.services import llm_client
from app.services.llm_client import LLMClient, LLMError


def _install_transport(monkeypatch, handler):
    original = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(llm_client.httpx, "AsyncClient", lambda *args, **kwargs: original(transport=transport))


@pytest.fixture(autouse=True)
def _no_retry_backoff(monkeypatch):
    """G-11 重试：测试里把退避基数置 0，避免真实等待拖慢用例。"""
    monkeypatch.setattr(llm_client, "_BACKOFF_BASE_SECONDS", 0.0)


def test_client_payload_headers_and_context_validation():
    with pytest.raises(ValueError, match="context_budget"):
        LLMClient("https://llm.test/", "secret", "model", context_budget=255)
    client = LLMClient("https://llm.test/", "secret", "model", context_budget=256)
    payload = client._payload([{"role": "user", "content": "hello"}], True)
    assert client.base_url == "https://llm.test"
    assert payload["stream_options"] == {"include_usage": True}
    assert client._headers()["Authorization"] == "Bearer secret"


@pytest.mark.asyncio
async def test_client_uses_explicit_proxy_without_inheriting_environment(monkeypatch):
    captured = {}
    original = httpx.AsyncClient

    def handler(_request):
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    def factory(*args, **kwargs):
        captured.update(kwargs)
        return original(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(llm_client.httpx, "AsyncClient", factory)
    client = LLMClient("https://llm.test", "key", "model", proxy_url="http://127.0.0.1:7890")
    assert (await client.chat([]))[0] == "ok"
    assert captured["proxy"] == "http://127.0.0.1:7890"
    assert captured["trust_env"] is False


@pytest.mark.asyncio
async def test_chat_success_and_api_error(monkeypatch):
    recorded = []
    # G-11: 503 属可重试故障，重试耗尽后仍以最后一次响应报错 → 需备足 _MAX_ATTEMPTS 份。
    responses = [
        httpx.Response(200, json={"choices": [{"message": {"content": "answer"}}], "usage": {"total_tokens": 9}}),
    ] + [httpx.Response(503, text="unavailable") for _ in range(llm_client._MAX_ATTEMPTS)]

    def handler(request):
        return responses.pop(0)

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: recorded.append((model, usage)))
    client = LLMClient("https://llm.test", "key", "model")
    assert await client.chat([{"role": "user", "content": "hi"}]) == ("answer", 9)
    assert recorded == [("model", {"total_tokens": 9})]
    with pytest.raises(LLMError, match="503"):
        await client.chat([])
    assert responses == []  # 重试确实用满了 _MAX_ATTEMPTS


@pytest.mark.asyncio
async def test_chat_wraps_network_error(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError, match="网络错误"):
        await LLMClient("https://llm.test", "key", "model").chat([])


@pytest.mark.asyncio
@pytest.mark.parametrize("safe", [False, True])
async def test_tool_chat_preserves_tool_calls_and_reasoning(monkeypatch, safe):
    captured = {}

    def handler(request):
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={
            "choices": [{"message": {
                "content": None,
                "reasoning_content": "reason",
                "tool_calls": [{"id": "call-1", "type": "function", "function": {"name": "quote", "arguments": "{}"}}],
            }}],
            "usage": {"total_tokens": 12},
        })

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model")
    method = client.chat_with_tools_safe if safe else client.chat_with_tools
    content, calls, tokens = await method(
        [{"role": "assistant", "content": "discard", "tool_calls": [{"id": "old"}]}],
        [{"type": "function", "function": {"name": "quote"}}],
    )
    assert content == "" and tokens == 12
    assert calls[0]["reasoning_content"] == "reason"
    assert captured["tools"]
    if safe:
        assert captured["messages"][0]["content"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("safe", [False, True])
async def test_tool_chat_can_return_finish_reason_without_breaking_legacy_arity(monkeypatch, safe):
    """VS12 P1-2: 截断可见性。

    finish_reason 在 choice 上而非 message 上，此前从未被读取 → max_tokens 截断
    不可见。`with_finish_reason=True` 额外回传第 4 项；默认仍返回 3 元组（契约不变）。
    """
    def handler(request):
        return httpx.Response(200, json={
            "choices": [{
                "finish_reason": "length",
                "message": {"content": "半截结论", "tool_calls": []},
            }],
            "usage": {"total_tokens": 9},
        })

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model")
    method = client.chat_with_tools_safe if safe else client.chat_with_tools

    legacy = await method([], [])
    assert legacy == ("半截结论", [], 9), "默认 3 元组契约不得改变"

    content, calls, tokens, finish_reason = await method([], [], with_finish_reason=True)
    assert (content, calls, tokens, finish_reason) == ("半截结论", [], 9, "length")


@pytest.mark.asyncio
async def test_tool_chat_errors(monkeypatch):
    responses = [httpx.Response(400, text="bad"), httpx.Response(401, text="no")]
    _install_transport(monkeypatch, lambda request: responses.pop(0))
    client = LLMClient("https://llm.test", "key", "model")
    with pytest.raises(LLMError, match="400"):
        await client.chat_with_tools([], [])
    with pytest.raises(LLMError, match="401"):
        await client.chat_with_tools_safe([], [])


@pytest.mark.asyncio
async def test_tool_loop_executes_tools_handles_failure_and_finishes(monkeypatch):
    client = LLMClient("https://llm.test", "key", "model")
    replies = [
        ("", [{"id": "1", "type": "function", "reasoning_content": "need data", "function": {"name": "ok", "arguments": "{}"}}], 3, "tool_calls"),
        ("", [{"id": "2", "type": "function", "function": {"name": "bad", "arguments": "{}"}}], 4, "tool_calls"),
        ("done", [], 5, "stop"),
    ]

    async def fake_chat(messages, tools, **_kwargs):
        return replies.pop(0)

    async def execute(name, arguments):
        if name == "bad":
            raise RuntimeError("boom")
        return "ok-result"

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    messages = [{"role": "user", "content": "research"}]
    content, calls, tokens = await client.chat_with_tools_loop(messages, [], execute)
    assert (content, tokens) == ("done", 12)
    assert [call["result"] for call in calls] == ["ok-result", "工具执行异常：boom"]
    assert any(message["role"] == "tool" for message in messages)
    assistant = next(message for message in messages if message["role"] == "assistant")
    assert assistant["reasoning_content"] == "need data"


@pytest.mark.asyncio
async def test_tool_loop_forces_final_answer_after_limit(monkeypatch):
    client = LLMClient("https://llm.test", "key", "model")
    call_count = 0

    async def fake_chat(messages, tools, **_kwargs):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            return "", [{"id": str(call_count), "type": "function", "function": {"name": "x", "arguments": "{}"}}], call_count, "tool_calls"
        return "forced", [], 9, "stop"

    async def execute(name, arguments):
        return "result"

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    messages = []
    content, calls, tokens = await client.chat_with_tools_loop(messages, [], execute, max_rounds=2)
    assert (content, len(calls), tokens) == ("forced", 2, 12)
    assert messages[-1]["role"] == "user"


@pytest.mark.asyncio
async def test_chat_stream_filters_frames_and_reports_errors(monkeypatch):
    recorded = []
    stream = "\n\ndata: not-json\n\ndata: {\"choices\": [], \"usage\": {\"prompt_tokens\": 3, \"completion_tokens\": 2, \"total_tokens\": 5}}\n\ndata: {\"choices\": [{\"delta\": {}}]}\n\ndata: {\"choices\": [{\"delta\": {\"content\": \"hello\"}}]}\n\ndata: [DONE]\n\n"
    responses = [httpx.Response(200, text=stream), httpx.Response(500, text="broken")]
    _install_transport(monkeypatch, lambda request: responses.pop(0))
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: recorded.append((model, usage)))
    client = LLMClient("https://llm.test", "key", "model")
    assert [part async for part in client.chat_stream([])] == ["hello"]
    assert recorded == [("model", {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5})]
    with pytest.raises(LLMError, match="500"):
        _ = [part async for part in client.chat_stream([])]


@pytest.mark.asyncio
async def test_chat_stream_wraps_network_error(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError, match="网络错误"):
        _ = [part async for part in LLMClient("https://llm.test", "key", "model").chat_stream([])]


# ==================== G-11: 瞬时故障重试 ====================

@pytest.mark.asyncio
async def test_chat_retries_transient_429_then_succeeds(monkeypatch):
    """429 是瞬时故障：应重试并在成功后正常返回，调用方无感。"""
    calls = []
    responses = [
        httpx.Response(429, text="rate limited"),
        httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}], "usage": {"total_tokens": 3}}),
    ]

    def handler(request):
        calls.append(request)
        return responses.pop(0)

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: None)
    content, tokens = await LLMClient("https://llm.test", "key", "model").chat([])
    assert content == "ok" and tokens == 3
    assert len(calls) == 2  # 第一次 429 + 重试成功


@pytest.mark.asyncio
async def test_chat_retries_network_error_then_succeeds(monkeypatch):
    """网络错误（httpx.HTTPError）同样属于可重试故障。"""
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ConnectError("offline", request=request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "second"}}], "usage": {}})

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: None)
    content, _tokens = await LLMClient("https://llm.test", "key", "model").chat([])
    assert content == "second"
    assert len(calls) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [400, 401, 404])
async def test_chat_does_not_retry_non_transient_status(monkeypatch, status):
    """地址/鉴权类 4xx 重试无意义：只调用一次即报错（避免放大无谓请求）。"""
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, text="client error")

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError):
        await LLMClient("https://llm.test", "key", "model").chat([])
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_chat_retry_exhausted_network_error_raises_llm_error(monkeypatch):
    """网络错误重试耗尽 → 抛 LLMError（可行动文案），调用次数为 _MAX_ATTEMPTS。"""
    calls = []

    def handler(request):
        calls.append(request)
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError, match="网络错误"):
        await LLMClient("https://llm.test", "key", "model").chat([])
    assert len(calls) == llm_client._MAX_ATTEMPTS


@pytest.mark.asyncio
async def test_chat_retry_exhausted_5xx_reports_last_status(monkeypatch):
    """5xx 重试耗尽 → 仍以最后一次响应报错（含状态码），不吞掉真实原因。"""
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503, text="unavailable")

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError, match="503"):
        await LLMClient("https://llm.test", "key", "model").chat([])
    assert len(calls) == llm_client._MAX_ATTEMPTS


# ==================== VS10: 尊重 Retry-After + 退避抖动 ====================

@pytest.fixture
def recorded_sleeps(monkeypatch):
    """把 asyncio.sleep 换成记录器：断言等待时长，且绝不真实等待。

    只替换 llm_client 模块内的 asyncio 引用（该模块仅用 asyncio.sleep），
    不污染全局 asyncio（pytest-asyncio 自身依赖它）。
    """
    waits: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        waits.append(seconds)

    monkeypatch.setattr(llm_client, "asyncio", SimpleNamespace(sleep=fake_sleep))
    return waits


def _ok_response() -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}], "usage": {"total_tokens": 3}})


def _run_chat(monkeypatch, responses: list[httpx.Response]):
    """安装 MockTransport 并返回 (client, calls 列表)。"""
    calls: list[httpx.Request] = []

    def handler(request):
        calls.append(request)
        return responses.pop(0)

    _install_transport(monkeypatch, handler)
    return LLMClient("https://llm.test", "key", "model"), calls


@pytest.mark.asyncio
async def test_retry_after_integer_seconds_is_respected(monkeypatch, recorded_sleeps):
    """① 429 + Retry-After: 7 → 等待 ≥7 秒（而非固定退避 0.5s），仍成功返回。"""
    # 退避基数置 0（autouse fixture），若未读 Retry-After 记录到的只会是 0.0 → 断言必失败。
    client, calls = _run_chat(monkeypatch, [
        httpx.Response(429, text="rate limited", headers={"Retry-After": "7"}),
        _ok_response(),
    ])
    content, tokens = await client.chat([])
    assert (content, tokens) == ("ok", 3)
    assert len(calls) == 2
    assert len(recorded_sleeps) == 1
    assert recorded_sleeps[0] >= 7
    assert recorded_sleeps[0] <= llm_client._RETRY_AFTER_MAX_SECONDS


@pytest.mark.asyncio
async def test_retry_after_http_date_is_respected(monkeypatch, recorded_sleeps):
    """② 503 + HTTP-date（未来 5 秒）→ 等待 ≈ 该日期与当前时间之差。"""
    future = datetime.now(timezone.utc) + timedelta(seconds=5)
    header = email.utils.format_datetime(future, usegmt=True)  # RFC 1123，秒级精度
    assert header.endswith("GMT")
    client, _calls = _run_chat(monkeypatch, [
        httpx.Response(503, text="unavailable", headers={"Retry-After": header}),
        _ok_response(),
    ])
    await client.chat([])
    assert len(recorded_sleeps) == 1
    # 秒级截断 → 实测差值落在 (4, 5]；给足区间容差（≥数秒且 ≤ 上限）。
    assert 3.0 <= recorded_sleeps[0] <= 6.0


@pytest.mark.asyncio
@pytest.mark.parametrize("header", ["abc", "-3", "0x10", "", "0", "0.0"])
async def test_retry_after_invalid_falls_back_without_raising(monkeypatch, recorded_sleeps, header):
    """含 `Retry-After: 0`：字面等待 0 秒等于立刻重试且绕过抖动，故视为无效 → 回落退避。

    （"0" 与 "0.0" 由独立评估者发现原先漏测；若退回 `seconds < 0` 判据，本参数会记录到 0.0 并失败。）"""
    """③ 非法值 → 回落原退避，不抛异常，重试次数与既有语义一致。"""
    calls: list[httpx.Request] = []

    def handler(request):
        calls.append(request)
        return httpx.Response(429, text="rate limited", headers={"Retry-After": header})

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError, match="429"):
        await LLMClient("https://llm.test", "key", "model").chat([])
    assert len(calls) == llm_client._MAX_ATTEMPTS
    assert len(recorded_sleeps) == llm_client._MAX_ATTEMPTS - 1
    assert recorded_sleeps == [0.0, 0.0]  # 基数置 0 的回落退避（未采用非法值）


@pytest.mark.asyncio
async def test_retry_after_past_http_date_falls_back(monkeypatch, recorded_sleeps):
    """③ 已过去的 HTTP-date → 回落退避，绝不为负（sleep 不得收到负数）。"""
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    client, _calls = _run_chat(monkeypatch, [
        httpx.Response(429, text="rate limited",
                       headers={"Retry-After": email.utils.format_datetime(past, usegmt=True)}),
        _ok_response(),
    ])
    assert (await client.chat([]))[0] == "ok"
    assert recorded_sleeps == [0.0]
    assert all(wait >= 0 for wait in recorded_sleeps)


@pytest.mark.asyncio
async def test_retry_after_is_capped_at_max(monkeypatch, recorded_sleeps):
    """④ 上限生效：Retry-After: 99999 → 单次等待 = 上限（30s），不真等 99999 秒。"""
    client, _calls = _run_chat(monkeypatch, [
        httpx.Response(429, text="rate limited", headers={"Retry-After": "99999"}),
        _ok_response(),
    ])
    await client.chat([])
    assert len(recorded_sleeps) == 1
    assert recorded_sleeps[0] <= llm_client._RETRY_AFTER_MAX_SECONDS
    assert recorded_sleeps[0] == llm_client._RETRY_AFTER_MAX_SECONDS == 30.0


@pytest.mark.asyncio
async def test_missing_retry_after_uses_jittered_backoff(monkeypatch, recorded_sleeps):
    """⑤ 缺失 → 回落带抖动的退避：抖动函数被调用，且多次取样不全相等。"""
    monkeypatch.setattr(llm_client, "_BACKOFF_BASE_SECONDS", 1.0)
    uniform_args: list[tuple[float, float]] = []
    real_uniform = random.uniform

    def spy_uniform(low, high):
        uniform_args.append((low, high))
        return real_uniform(low, high)

    monkeypatch.setattr(llm_client, "random", SimpleNamespace(uniform=spy_uniform))
    client, _calls = _run_chat(monkeypatch, [
        httpx.Response(503, text="unavailable"),
        _ok_response(),
    ])
    await client.chat([])
    assert uniform_args and uniform_args[0] == (0.75, 1.25)  # base 1.0 × [1-0.25, 1+0.25]
    assert len(recorded_sleeps) == 1
    assert 0.75 <= recorded_sleeps[0] <= 1.25

    samples = {llm_client._backoff_seconds(1) for _ in range(50)}
    assert len(samples) > 1  # 抖动存在：取样不全相等 → 并行 agent 不会同步重试


@pytest.mark.asyncio
async def test_retry_after_lowercase_header_key(monkeypatch, recorded_sleeps):
    """⑥ 小写响应头键名 `retry-after` → 同样被尊重（httpx Headers 大小写不敏感）。"""
    client, _calls = _run_chat(monkeypatch, [
        httpx.Response(429, text="rate limited", headers={"retry-after": "4"}),
        _ok_response(),
    ])
    await client.chat([])
    assert recorded_sleeps == [4.0]


@pytest.mark.asyncio
async def test_retry_after_honoured_per_response_when_statuses_mix(monkeypatch, recorded_sleeps):
    """错误场景：先 429（Retry-After: 2）后 503（Retry-After: 6）→ 每次按当次响应决定等待。"""
    client, calls = _run_chat(monkeypatch, [
        httpx.Response(429, text="rate limited", headers={"Retry-After": "2"}),
        httpx.Response(503, text="unavailable", headers={"Retry-After": "6"}),
        httpx.Response(503, text="unavailable"),
    ])
    with pytest.raises(LLMError, match="503"):
        await client.chat([])  # 最后一次不再等待，返回响应交调用方报状态码
    assert len(calls) == 3
    assert recorded_sleeps == [2.0, 6.0]


# ==================== VS21: 整次调用总时长预算 ====================

_FAKE_CLOCK_START = 1000.0


@pytest.fixture
def budget_clock(monkeypatch):
    """VS21 假时钟 + 睡眠记录器：预算语义与上界可判定，且**绝不真实等待**。

    与既有 `recorded_sleeps` 同款接缝：只替换 llm_client 模块内的 `time` / `asyncio`
    引用（不动全局模块，pytest-asyncio 不受影响）。handler 每次推进 `state["now"]`
    模拟"一次尝试的真实耗时"，`sleep` 也推进它 ⇒ `state["now"] - _FAKE_CLOCK_START`
    就是整次调用的假墙钟 = 尝试耗时 + 等待时长之和，可直接用来断言上界。
    """
    state = {"now": _FAKE_CLOCK_START, "sleeps": []}

    async def fake_sleep(seconds: float) -> None:
        state["sleeps"].append(seconds)
        state["now"] += seconds

    def fake_monotonic() -> float:
        return float(state["now"])

    monkeypatch.setattr(llm_client, "time", SimpleNamespace(monotonic=fake_monotonic))
    monkeypatch.setattr(llm_client, "asyncio", SimpleNamespace(sleep=fake_sleep))
    return state


def _elapsed(clock) -> float:
    return clock["now"] - _FAKE_CLOCK_START


@pytest.mark.asyncio
async def test_vs21_budget_exhaustion_stops_retries_and_truncates_wait(monkeypatch, budget_clock):
    """①预算耗尽即停 + ③等待被截断。

    每次尝试耗 6s、预算 10s、上游 `Retry-After: 30`：
    第一次尝试后剩 4s（< 30s）⇒ 等待截断为 4s；第二次尝试后已用 16s ≥ 10s ⇒ 立即停止，
    不再发起第三次尝试（尝试次数未用尽，是被预算停下的）。
    """
    calls = []

    def handler(request):
        calls.append(request)
        budget_clock["now"] += 6.0  # 模拟一次尝试的真实耗时
        return httpx.Response(429, text="rate limited", headers={"Retry-After": "30"})

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=10.0)
    with pytest.raises(LLMError) as excinfo:
        await client.chat([])

    assert len(calls) == 2, "预算耗尽后不得再发起尝试"
    assert len(calls) < llm_client._MAX_ATTEMPTS, "不是被 _MAX_ATTEMPTS 停下的，必须是被预算停下的"
    assert budget_clock["sleeps"] == [4.0], "剩余 4s < 计划等待 30s ⇒ 必须截断到 4s，而不是等 30s"
    assert _elapsed(budget_clock) == 16.0
    assert _elapsed(budget_clock) <= client.total_budget_seconds + client.timeout

    message = str(excinfo.value)
    assert "总时长预算已用尽" in message
    assert "尝试次数用尽" not in message
    assert "429" in message, "最后一次的上游状态码不得被预算文案吞掉"


@pytest.mark.asyncio
async def test_vs21_wall_clock_within_budget_plus_single_attempt_timeout(monkeypatch, budget_clock):
    """②上界：默认预算下，每次尝试都跑满单次超时（120s）且上游要求 30s 等待。

    改动前的最坏路径 = 3×120 + 2×30 = 420s。现在：120s → 等 30s → 120s（已用 270s ≥ 180s）
    ⇒ 停止。断言假墙钟 ≤ 预算 + 单次尝试超时，且 Retry-After 的 30s 单次上限（VS10）仍生效。
    """
    calls = []

    def handler(request):
        calls.append(request)
        budget_clock["now"] += 120.0  # 一次尝试正好用满 timeout
        return httpx.Response(503, text="unavailable", headers={"Retry-After": "99999"})

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model")  # 用默认预算
    assert client.total_budget_seconds == llm_client._DEFAULT_TOTAL_BUDGET_SECONDS
    assert llm_client._DEFAULT_TOTAL_BUDGET_SECONDS > 120.0 + llm_client._RETRY_AFTER_MAX_SECONDS

    with pytest.raises(LLMError, match="总时长预算已用尽"):
        await client.chat([])

    assert budget_clock["sleeps"] == [30.0], "Retry-After: 99999 仍被 30s 单次上限截断；第二次尝试后预算已尽 ⇒ 不再等待"
    assert len(calls) == 2, "改动前这里是 3 次 / 420s"
    assert _elapsed(budget_clock) == 270.0
    assert _elapsed(budget_clock) <= client.total_budget_seconds + client.timeout
    assert client.total_budget_seconds + client.timeout == 300.0


@pytest.mark.asyncio
async def test_vs21_wait_truncated_exactly_at_budget_boundary(monkeypatch, budget_clock):
    """③剩余预算 < 计划等待 ⇒ 实际等待 == 剩余预算；随后"已用 ≥ 预算"（边界相等）即停。"""
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(429, text="rate limited", headers={"Retry-After": "30"})

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=5.0)
    with pytest.raises(LLMError, match="总时长预算已用尽"):
        await client.chat([])

    assert budget_clock["sleeps"] == [5.0]
    assert budget_clock["sleeps"][0] < llm_client._RETRY_AFTER_MAX_SECONDS, "未被截断就会是 30s"
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_vs21_backoff_path_wait_is_also_truncated(monkeypatch, budget_clock):
    """③同源：截断不只作用于 Retry-After 路径——缺失 Retry-After 时的回落退避同样受剩余预算约束。

    （两条等待来源必须同源，否则"改了 Retry-After 那条、漏了退避那条"会留下半截预算。）
    """
    monkeypatch.setattr(llm_client, "_BACKOFF_BASE_SECONDS", 1.0)
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503, text="unavailable")  # 无 Retry-After ⇒ 回落抖动退避 [0.75, 1.25]

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=0.3)
    with pytest.raises(LLMError, match="总时长预算已用尽"):
        await client.chat([])

    assert budget_clock["sleeps"] == [0.3], "回落退避（≥0.75s）必须被截断到剩余 0.3s"
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_vs21_first_attempt_success_is_never_overridden_by_budget(monkeypatch, budget_clock):
    """边界：首次尝试就远超预算，但它成功了 ⇒ 必须返回真实结果，不得误判为"预算失败"。"""
    def handler(request):
        budget_clock["now"] += 10_000.0  # 首次尝试耗时远超 1s 预算
        return _ok_response()

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: None)
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=1.0)
    assert await client.chat([]) == ("ok", 3)
    assert budget_clock["sleeps"] == []


@pytest.mark.asyncio
async def test_vs21_non_retryable_4xx_still_returns_first_response_under_tiny_budget(monkeypatch, budget_clock):
    """边界：预算再小，非可重试 4xx 仍**只发一次**并原样交调用方报真实状态码（VS-4 语义未削弱）。"""
    calls = []

    def handler(request):
        calls.append(request)
        budget_clock["now"] += 10_000.0  # 首次尝试即用光预算
        return httpx.Response(401, text="no key")

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=1.0)
    with pytest.raises(LLMError, match="401") as excinfo:
        await client.chat([])

    assert len(calls) == 1
    assert "总时长预算" not in str(excinfo.value), "首次尝试的真实状态码不得被预算文案替换"


@pytest.mark.asyncio
async def test_vs21_budget_exhaustion_keeps_real_cause_for_network_errors(monkeypatch, budget_clock):
    """网络类失败耗尽预算 ⇒ 抛预算文案的 LLMError，但**真实原因仍挂在 __cause__ 上**（不丢证据）。"""
    calls = []

    def handler(request):
        calls.append(request)
        budget_clock["now"] += 40.0
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=50.0)
    with pytest.raises(LLMError) as excinfo:
        await client.chat([])

    assert len(calls) == 2
    assert "总时长预算已用尽" in str(excinfo.value)
    assert isinstance(excinfo.value.__cause__, httpx.ConnectError), "被包装的原始网络异常不得丢失"


@pytest.mark.asyncio
async def test_vs21_two_exhaustion_kinds_are_distinguishable(monkeypatch, budget_clock):
    """④"尝试次数用尽"与"总时长预算用尽"文案必须可区分（否则线上日志无法诊断）。"""
    def handler(request):
        budget_clock["now"] += 1.0
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, handler)

    # (a) 预算充裕的默认客户端 ⇒ 三次尝试失败后报"尝试次数用尽"
    with pytest.raises(LLMError) as attempts_excinfo:
        await LLMClient("https://llm.test", "key", "model").chat([])
    # (b) 预算只够一次尝试 ⇒ 报"总时长预算用尽"
    with pytest.raises(LLMError) as budget_excinfo:
        await LLMClient("https://llm.test", "key", "model", total_budget_seconds=1.0).chat([])

    attempts_message = str(attempts_excinfo.value)
    budget_message = str(budget_excinfo.value)
    assert "尝试次数用尽" in attempts_message
    assert "总时长预算" not in attempts_message
    assert "总时长预算已用尽" in budget_message
    assert "尝试次数用尽" not in budget_message
    assert attempts_message != budget_message


@pytest.mark.parametrize("budget", [0.0, -1.0, 0, -0.5, float("nan"), float("inf")])
def test_vs21_non_positive_or_non_finite_budget_is_rejected(budget):
    """边界：预算为 0/负数（及 NaN/Inf）⇒ **拒绝该值**，而不是"一次都不试"或"预算形同不存在"。

    择一说明：拒绝（ValueError）与既有 `context_budget < 256` 的构造期校验同款，启动即暴露
    配置错误；正数预算（哪怕极小）则保证"首次尝试一定执行"。
    """
    with pytest.raises(ValueError, match="total_budget_seconds"):
        LLMClient("https://llm.test", "key", "model", total_budget_seconds=budget)


def test_vs21_default_budget_is_injectable_and_documented():
    """⑥预算是构造参数：默认值可读、可注入，且上界公式（预算 + 单次尝试超时）可自证。"""
    default_client = LLMClient("https://llm.test", "key", "model")
    assert default_client.total_budget_seconds == llm_client._DEFAULT_TOTAL_BUDGET_SECONDS
    injected = LLMClient("https://llm.test", "key", "model", timeout=7.0, total_budget_seconds=3.0)
    assert (injected.total_budget_seconds, injected.timeout) == (3.0, 7.0)
    assert default_client.timeout == 120.0, "单次尝试超时语义不变（不得被预算改动）"


# ==================== VS23: 整轮工具对话的聚合截止（deadline） ====================
# "每次调用最多等 N 秒" ≠ "用户最多等 N 秒"：单次预算只约束一轮，max_rounds 只约束轮数，
# 整轮墙钟此前无任何聚合约束（最坏 5 × 300 = 1500s）。下面用假时钟（budget_clock）覆盖
# "截止生效 / 上界 / 单轮预算被压低 / 显式而非静默 / 零回归"，**不真实等待**。

def _tool_call_reply(call_id: str, tokens: int = 3):
    """一轮"请求工具"的假回复（chat_with_tools_safe 的 4 元组形态）。"""
    return ("", [{
        "id": call_id,
        "type": "function",
        "function": {"name": "echo", "arguments": "{}"},
    }], tokens, "tool_calls")


def _tool_call_response(call_id: str = "1", tokens: int = 3) -> httpx.Response:
    """同样语义的**真实** HTTP 响应（走 `_post_chat_with_retry` 时用）。"""
    return httpx.Response(200, json={
        "choices": [{"message": {"content": "", "tool_calls": [
            {"id": call_id, "type": "function", "function": {"name": "echo", "arguments": "{}"}},
        ]}}],
        "usage": {"total_tokens": tokens},
    })


async def _echo_tool(name, arguments):
    return "ok"


@pytest.mark.asyncio
async def test_vs23_no_deadline_keeps_legacy_contract_and_behaviour(monkeypatch, budget_clock):
    """①None 默认零回归：仍是 3 元组、不给单次调用注入预算覆盖值、不做任何时间判断、事件序列不变。

    每次假调用都把假时钟推进 10000s——若默认路径里混进了任何截止判断，本用例立刻变红。
    """
    client = LLMClient("https://llm.test", "key", "model")
    assert client.total_budget_seconds == llm_client._DEFAULT_TOTAL_BUDGET_SECONDS
    seen: list[float | None] = []
    replies = [
        _tool_call_reply("1", 3),
        ("中间文本", _tool_call_reply("2")[1], 4, "tool_calls"),
        ("最终答案", [], 5, "stop"),
    ]

    async def fake_chat(messages, tools, **kwargs):
        seen.append(kwargs.get("budget_seconds"))
        budget_clock["now"] += 10_000.0
        return replies.pop(0)

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    events: list[str] = []

    async def sink(event, data):
        events.append(event)

    result = await client.chat_with_tools_loop(
        [{"role": "user", "content": "hi"}], [], _echo_tool, event_sink=sink,
    )

    assert isinstance(result, tuple) and len(result) == 3, "None ⇒ 3 元组契约不变"
    content, tool_calls, tokens = result
    assert (content, tokens) == ("最终答案", 12)
    assert [call["name"] for call in tool_calls] == ["echo", "echo"]
    assert seen == [None, None, None], "缺省下不得改写单次预算（覆盖值必须仍是 None）"
    assert events == ["tool_started", "tool_completed", "tool_started", "tool_completed", "tool_loop_done"]
    assert "tool_loop_truncated" not in events


@pytest.mark.asyncio
async def test_vs23_deadline_stops_loop_with_explicit_truncation_flag(monkeypatch, budget_clock):
    """②③截止生效且**显式**：50s 截止、每轮 30s ⇒ 第 3 轮开始前停手，第 3 次调用根本不发。"""
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=100.0)
    seen: list[float | None] = []

    async def fake_chat(messages, tools, **kwargs):
        seen.append(kwargs.get("budget_seconds"))
        budget_clock["now"] += 30.0
        return _tool_call_reply(str(len(seen)))

    async def execute(name, arguments):
        return "ok"

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    events: list[tuple[str, dict]] = []

    async def sink(event, data):
        events.append((event, data))

    result = await client.chat_with_tools_loop([], [], execute, deadline_seconds=50.0, event_sink=sink)

    assert len(result) == 4, "设了截止 ⇒ 必须拿到显式状态项（不可能只拿 3 元组）"
    content, tool_calls, tokens, status = result
    assert status["truncated_by_deadline"] is True, "提前结束必须是显式标记，不得伪装成正常完成"
    assert status["reason"] == "deadline_exceeded_before_tool_round"
    assert status["deadline_seconds"] == 50.0
    assert status["llm_calls"] == 2 and len(seen) == 2, "截止后不得再发起新的 LLM 调用"
    assert status["elapsed_seconds"] == 60.0
    assert (content, tokens) == ("", 6)
    assert [call["name"] for call in tool_calls] == ["echo", "echo"], "已完成的工具调用记录不得被丢弃"
    assert [name for name, _ in events].count("tool_loop_truncated") == 1
    assert events[-1][0] == "tool_loop_truncated"
    assert events[-1][1]["reason"] == "deadline_exceeded_before_tool_round"


@pytest.mark.asyncio
async def test_vs23_deadline_already_spent_before_first_round_issues_no_llm_call(monkeypatch, budget_clock):
    """⑥截止在首轮开始前就已过（剩余 ≤ 浮点容差）⇒ **一次 LLM 调用都不发**，直接显式截断。"""
    client = LLMClient("https://llm.test", "key", "model")
    calls: list[dict] = []

    async def fake_chat(messages, tools, **kwargs):
        calls.append(kwargs)
        return ("不该被调用", [], 1, "stop")

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    events: list[str] = []

    async def sink(event, data):
        events.append(event)

    content, tool_calls, tokens, status = await client.chat_with_tools_loop(
        [], [], _echo_tool, deadline_seconds=1e-9, event_sink=sink,
    )

    assert calls == [], "首轮开始前已过截止 ⇒ 不得发起任何 LLM 调用"
    assert status["truncated_by_deadline"] is True
    assert status["reason"] == "deadline_exceeded_before_tool_round"
    assert status["llm_calls"] == 0
    assert (content, tool_calls, tokens) == ("", [], None)
    assert events == ["tool_loop_truncated"]


@pytest.mark.asyncio
async def test_vs23_round_budget_is_min_of_single_budget_and_remaining(monkeypatch, budget_clock):
    """④单轮预算 = min(单次预算, 剩余整轮预算)：剩余只剩 7s ⇒ 该轮**实测**只用 7s。"""
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=180.0)
    seen: list[float | None] = []

    async def fake_chat(messages, tools, **kwargs):
        seen.append(kwargs.get("budget_seconds"))
        budget_clock["now"] += 173.0 if len(seen) == 1 else 10.0
        return _tool_call_reply(str(len(seen)))

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    result = await client.chat_with_tools_loop([], [], _echo_tool, deadline_seconds=180.0)

    _, _, _, status = result
    assert seen == [180.0, 7.0], "第 1 轮 min(180,180)=180；第 2 轮剩余 7s < 180s ⇒ 必须压低为 7s"
    assert status["llm_calls"] == 2
    assert status["truncated_by_deadline"] is True
    assert status["elapsed_seconds"] == 183.0


@pytest.mark.asyncio
async def test_vs23_lowered_round_budget_actually_caps_the_retry_loop(monkeypatch, budget_clock):
    """④（实测，端到端）压低后的预算**真的**进入 `_post_chat_with_retry`：等待被截断到 4s 而非 30s。

    第 1 轮一次成功但耗时 195s ⇒ 剩余整轮预算 5s；第 2 轮因此只用 5s：尝试 1 后剩 4s < Retry-After 上限 30s
    ⇒ 等待被截断到 4s。若预算没被压低（仍是 180s），这里记录到的会是 30s。
    """
    attempts = {"n": 0}

    def handler(request):
        attempts["n"] += 1
        if attempts["n"] == 1:
            budget_clock["now"] += 195.0
            return _tool_call_response()
        budget_clock["now"] += 1.0
        return httpx.Response(503, text="unavailable", headers={"Retry-After": "99999"})

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: None)
    client = LLMClient("https://llm.test", "key", "model")

    with pytest.raises(LLMError) as excinfo:
        await client.chat_with_tools_loop([], [], _echo_tool, deadline_seconds=200.0)

    assert budget_clock["sleeps"] == [4.0], "预算未被压低就会是 Retry-After 的 30s 上限"
    assert attempts["n"] == 3
    assert "总时长预算已用尽（本次 5 秒）" in str(excinfo.value), "生效预算必须如实回传，不得报客户端默认值"


@pytest.mark.asyncio
async def test_vs23_worst_case_wall_clock_within_deadline_plus_single_call_bound(monkeypatch, budget_clock):
    """③上界（最坏形态）：每轮都"吃光剩余整轮预算 + 再跑一个完整单次尝试超时"（进行中的尝试不被打断）。

    上界 = 截止 + 单次调用上界（= 单次预算 + 单次尝试超时 = 180 + 120 = 300s）：
    第 1 轮 600 + 120 = 720s，此时剩余为负 ⇒ 第 2 轮永不开始。
    """
    client = LLMClient("https://llm.test", "key", "model")
    deadline = 600.0
    seen: list[float | None] = []

    async def fake_chat(messages, tools, **kwargs):
        seen.append(kwargs.get("budget_seconds"))
        remaining = deadline - _elapsed(budget_clock)
        budget_clock["now"] += remaining + client.timeout
        return _tool_call_reply("1")

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    result = await client.chat_with_tools_loop([], [], _echo_tool, deadline_seconds=deadline)

    status = result[3]
    elapsed = _elapsed(budget_clock)
    assert status["truncated_by_deadline"] is True
    assert len(seen) == 1, "第 2 轮开始前必须被截止挡住"
    assert elapsed == deadline + client.timeout == 720.0
    assert elapsed <= deadline + client.total_budget_seconds + client.timeout, "不得超过卡里声明的上界"
    assert elapsed <= deadline + client.timeout, "实测更紧的上界：截止 + 单次尝试超时"


@pytest.mark.asyncio
async def test_vs23_end_to_end_wall_clock_upper_bound_with_real_retry_path(monkeypatch, budget_clock):
    """③上界（端到端，真实重试路径）：503 → 等 30s → 第二次尝试成功 ⇒ 本轮 270s，随后被截止停手。"""
    attempts = {"n": 0}

    def handler(request):
        attempts["n"] += 1
        budget_clock["now"] += 120.0
        if attempts["n"] == 1:
            return httpx.Response(503, text="unavailable", headers={"Retry-After": "99999"})
        return _tool_call_response("1", 3)

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: None)
    client = LLMClient("https://llm.test", "key", "model")
    deadline = 250.0

    content, tool_calls, tokens, status = await client.chat_with_tools_loop(
        [], [], _echo_tool, deadline_seconds=deadline,
    )

    assert budget_clock["sleeps"] == [30.0], "Retry-After: 99999 仍受 30s 上限约束（VS10 未被削弱）"
    assert attempts["n"] == 2
    assert status["truncated_by_deadline"] is True
    assert status["reason"] == "deadline_exceeded_before_tool_round"
    assert status["llm_calls"] == 1
    assert (content, tokens, len(tool_calls)) == ("", 3, 1)
    assert _elapsed(budget_clock) == 270.0
    assert _elapsed(budget_clock) <= deadline + client.total_budget_seconds + client.timeout
    assert _elapsed(budget_clock) <= deadline + client.timeout


@pytest.mark.asyncio
async def test_vs23_deadline_crossed_after_successful_call_is_reported_as_completed(monkeypatch, budget_clock):
    """⑤边界：截止恰落在一次**成功**调用之后 ⇒ 必须标"完成"，不得误报截断。"""
    client = LLMClient("https://llm.test", "key", "model")

    async def fake_chat(messages, tools, **kwargs):
        budget_clock["now"] += 100.0  # 这次调用把 10s 截止远远甩在后面
        return ("完整答案", [], 7, "stop")

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    events: list[str] = []

    async def sink(event, data):
        events.append(event)

    content, tool_calls, tokens, status = await client.chat_with_tools_loop(
        [], [], _echo_tool, deadline_seconds=10.0, event_sink=sink,
    )

    assert content == "完整答案"
    assert status["truncated_by_deadline"] is False
    assert status["reason"] is None
    assert status["llm_calls"] == 1
    assert status["elapsed_seconds"] == 100.0, "已超截止也照实记录，但结论是'完成'"
    assert events == ["tool_loop_done"], "完成后越过截止不得补发截断事件"


@pytest.mark.asyncio
async def test_vs23_deadline_before_forced_final_answer_is_explicit(monkeypatch, budget_clock):
    """边界：轮数用尽但收尾那次请求被截止挡住 ⇒ 显式截断，且不留下等不到回复的督促消息。"""
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=180.0)
    seen: list[float | None] = []

    async def fake_chat(messages, tools, **kwargs):
        seen.append(kwargs.get("budget_seconds"))
        budget_clock["now"] += 12.0
        return _tool_call_reply(str(len(seen)))

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    events: list[str] = []

    async def sink(event, data):
        events.append(event)

    messages: list[dict] = [{"role": "user", "content": "research"}]
    _, _, _, status = await client.chat_with_tools_loop(
        messages, [], _echo_tool, max_rounds=2, deadline_seconds=20.0, event_sink=sink,
    )

    assert seen == [20.0, 8.0]
    assert status["llm_calls"] == 2
    assert status["truncated_by_deadline"] is True
    assert status["reason"] == "deadline_exceeded_before_final_answer"
    assert status["elapsed_seconds"] == 24.0
    assert messages[-1]["role"] == "tool", "不会发出请求时不得追加督促消息（否则留下等不到回复的 user 消息）"
    assert "tool_loop_exhausted" not in events
    assert events[-1] == "tool_loop_truncated"


@pytest.mark.asyncio
async def test_vs23_forced_final_answer_still_runs_within_a_generous_deadline(monkeypatch, budget_clock):
    """同源：截止未到 ⇒ 轮数用尽后照旧强制收尾（既有语义不变），状态标"完成"。"""
    client = LLMClient("https://llm.test", "key", "model")
    call = {"n": 0}

    async def fake_chat(messages, tools, **kwargs):
        call["n"] += 1
        if call["n"] <= 2:
            return _tool_call_reply(str(call["n"]), call["n"])
        return ("forced", [], 9, "stop")

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    events: list[str] = []

    async def sink(event, data):
        events.append(event)

    messages: list[dict] = []
    content, tool_calls, tokens, status = await client.chat_with_tools_loop(
        messages, [], _echo_tool, max_rounds=2, deadline_seconds=10_000.0, event_sink=sink,
    )

    assert (content, len(tool_calls), tokens) == ("forced", 2, 12)
    assert messages[-1]["role"] == "user"
    assert status["truncated_by_deadline"] is False
    assert events[-1] == "tool_loop_exhausted"


@pytest.mark.parametrize("deadline", [0.0, -1.0, 0, -0.5, float("nan"), float("inf")])
@pytest.mark.asyncio
async def test_vs23_non_positive_or_non_finite_deadline_is_rejected(deadline):
    """边界：0/负数/NaN/Inf ⇒ 与 total_budget_seconds 同口径拒绝（构造期式 ValueError），不静默。"""
    client = LLMClient("https://llm.test", "key", "model")
    with pytest.raises(ValueError, match="deadline_seconds"):
        await client.chat_with_tools_loop([], [], _echo_tool, deadline_seconds=deadline)


@pytest.mark.asyncio
async def test_vs23_budget_exhausted_error_carries_redacted_upstream_body(monkeypatch, budget_clock):
    """NIT① 正例：预算耗尽必须带上游 body 片段，否则同一个 429 会被误读成"预算太小"。"""
    tail_marker = "TAIL-MARKER-SHOULD-BE-TRUNCATED"
    body = '{"error":{"code":"insufficient_quota","message":"account quota exceeded"}}' + "A" * 400 + tail_marker

    def handler(request):
        budget_clock["now"] += 40.0  # 首次尝试即烧光 1s 预算
        return httpx.Response(429, text=body)

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=1.0)
    with pytest.raises(LLMError) as excinfo:
        await client.chat([])

    message = str(excinfo.value)
    assert "总时长预算已用尽" in message
    assert "429" in message, "状态码不得被预算文案吞掉"
    assert "insufficient_quota" in message, "上游给出的真实原因（额度/鉴权）不得被丢掉"
    assert "account quota exceeded" in message
    assert "上游响应片段：" in message
    assert tail_marker not in message, "片段必须截断到 300 字，不得整段回灌"


@pytest.mark.asyncio
async def test_vs23_budget_exhausted_error_never_leaks_api_key(monkeypatch, budget_clock):
    """NIT① 反例：api_key 出现在上游 body 里也必须脱敏（沿用既有脱敏口径）。"""
    secret = "sk-vs23-should-never-appear"

    def handler(request):
        budget_clock["now"] += 40.0
        return httpx.Response(429, text=f"invalid key {secret} for account")

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", secret, "model", total_budget_seconds=1.0)
    with pytest.raises(LLMError) as excinfo:
        await client.chat([])

    message = str(excinfo.value)
    assert secret not in message, "api_key 绝不出现在任何错误里"
    assert "[已隐藏]" in message
    assert "invalid key" in message, "脱敏后其余片段仍在（不得因噎废食把整段丢掉）"


@pytest.mark.asyncio
async def test_vs23_network_failure_budget_error_has_no_body_snippet(monkeypatch, budget_clock):
    """NIT① 边界：网络类失败没有响应体 ⇒ 空白片段不得破坏文案，也不得崩在取片段上。"""
    def handler(request):
        budget_clock["now"] += 40.0
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model", total_budget_seconds=1.0)
    with pytest.raises(LLMError) as excinfo:
        await client.chat([])

    message = str(excinfo.value)
    assert "总时长预算已用尽" in message
    assert "上游响应片段" not in message
    assert isinstance(excinfo.value.__cause__, httpx.ConnectError)

