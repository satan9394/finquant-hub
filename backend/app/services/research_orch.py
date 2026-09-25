"""多 Agent 并行研究编排器。

四个投研 Agent（商业模式/财务/行业/风控）同时并行研究，各配备工具调用能力。
使用 LLMClient.chat_with_tools 实现 function_calling。
产出结构化投资备忘录，通过 SSE 事件流推送进度。
"""
import asyncio
import json
import math
import time
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from typing import Any, TypeAlias

from ..agent.tools import BaseTool, ToolRegistry, ToolResult
from ..orchestrator import DAGContext, DAGNode, DAGRuntime
from ..prompts.research_roles import REPORT_LEAD_ROLE, RESEARCH_ROLES
from ..prompts.research_memo_prompt import get_memo_sections
from ..services.llm_client import LLMClient, LLMError
from ..services.llm_usage import (
    interleave_llm_metrics,
    llm_metrics_event_payload,
    reset_llm_metrics_context,
    reset_llm_metrics_sink,
    set_llm_metrics_context,
    set_llm_metrics_sink,
)
from ..services.memory import native_memory_provider
from ..services.memory_rollout import finalize_memory_rollout, prepare_memory_rollout
from ..services.report_builder import build_telemetry_summary, build_unified_report, parse_lead_review

_TOOL_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="research-tool")
JSONDict: TypeAlias = dict[str, Any]

# VS27: 深度研究"整轮"的运行级截止默认值（秒）。
#
# 研究走的是**自己的**轮循环（`_call_agent`），不是 `chat_with_tools_loop`：
# 每个 Agent 最多 6 次 LLM 调用（5 轮 tool_use + 1 次强制收尾），单次调用上界
# 约 `total_budget_seconds(180) + timeout(120) = 300s` ⇒ 单 Agent 最坏 ~1800s，
# 主编串行再算一次 ⇒ 整轮最坏约 60 分钟，且 `done`/落库没有任何截断信号。
# VS21/VS23 只把整轮上界接到了交互 chat 这条最便宜的路径上，核心研究路径是裸的。
DEFAULT_RESEARCH_DEADLINE_SECONDS = 900.0

# 与 `llm_client._BUDGET_EPSILON_SECONDS` 同口径的浮点容差：剩余 ≤ 容差即视为已到截止。
_DEADLINE_EPSILON_SECONDS = 1e-6

# VS27 截断原因码——**结构化**写进 `agent_results[key].degraded_reasons`（VS20 契约），
# 前端 `Research.tsx` 的 `DEGRADED_REASON_KEYS` 是它的真实消费方。
DEADLINE_REASON_TRUNCATED = "deadline_exceeded"
DEADLINE_REASON_NOT_STARTED = "deadline_exceeded_before_start"

# VS7 P1b: 工具异常被吞成文本回给模型，编排层只能靠这个统一前缀识别"该工具没真正跑成"。
# 与 llm_client.chat_with_tools_loop 中同名前缀保持一致（同语义、同文案）。
_TOOL_ERROR_PREFIX = "工具执行异常："

# VS12 P1-1: 工具失败共有 5 种形态，原先只有"异常"一种被识别（纯文本前缀哨兵），
# 于是"工具不存在/未授权/参数校验失败/工具跑了但返回 success:false"四种失败会被
# 当成成功 —— Agent 拿着空数据编结论，报告仍以 audited 落库。
# 现在改为读结构：优先解析 JSON 载荷的 success 字段，文本形态仍按前缀兼容识别。
_JSON_ERROR_PREFIX = "错误：工具 "


def _is_tool_failure(result_text: Any) -> bool:
    """判断一次工具调用结果是否代表"该工具没真正跑成"。

    覆盖 `_execute_tool_call` 的全部 5 种失败形态：
    1. 工具不存在  → `错误：工具 X 不存在`（文本）
    2. 未授权      → `错误：工具 X 未授权给当前 Agent`（文本）
    3. 参数校验失败 → `{"success": false, ...}`
    4. 工具跑了但失败 → `{"success": false, ...}`
    5. 异常        → `工具执行异常：...`（文本，旧前缀哨兵）

    注意：成功结果同样是 JSON（以 `{` 开头），因此**不能**用"以 `{` 开头"判失败，
    必须解析后看 `success`。旧前缀判定保留，避免遗漏历史文本形态。
    """
    if not isinstance(result_text, str):
        return False
    text = result_text.strip()
    if text.startswith(_TOOL_ERROR_PREFIX):
        return True
    if text.startswith(_JSON_ERROR_PREFIX):
        return True
    if text.startswith("{"):
        try:
            payload = json.loads(text)
        except (ValueError, TypeError):
            # 无法解析的 JSON 载荷：不得当成成功（错误场景 2），按失败处理。
            return True
        if isinstance(payload, dict) and "success" in payload:
            return payload.get("success") is not True
    return False


def _run_tool_in_thread(tool: BaseTool, arguments: JSONDict, user_id: int | None) -> ToolResult:
    """在线程独立事件循环中执行异步工具。

    ThreadPoolExecutor 的 worker 不继承调用方协程的 ContextVar（Astra A5 P2：
    线程内 current_user_id() 变 None，新闻工具走空凭据分支）。因此显式把当前
    用户写进线程本地上下文，让工具内的 current_user_id() 能取到本人身份，
    同时保持"绝不读取他人凭据"的隔离边界（只传本人 user_id）。
    """
    from ..services.auth import reset_current_user, set_current_user

    token = set_current_user({"id": user_id}) if user_id is not None else None
    try:
        return asyncio.run(tool.run(**arguments))
    finally:
        if token is not None:
            reset_current_user(token)


async def _execute_tool_call(
    tool_call: JSONDict,
    tool_registry: ToolRegistry,
    allowed_tools: set[str] | None = None,
    *,
    user_id: int | None = None,
) -> str:
    """执行单个工具调用并统一序列化结果，不让异常中断同轮其他工具。

    经 ToolRegistry.dispatch 执行（类型驱动前置校验，Astra A5：研究路径此前
    直接 tool.run() 绕过参数类型校验），并把 user_id 传入线程以恢复用户上下文。
    """
    func = tool_call["function"]
    if allowed_tools is not None and func["name"] not in allowed_tools:
        return f"错误：工具 {func['name']} 未授权给当前 Agent"
    tool = tool_registry.get(func["name"])
    if tool is None:
        return f"错误：工具 {func['name']} 不存在"

    try:
        arguments = json.loads(func["arguments"])
        if not isinstance(arguments, dict):
            raise ValueError("工具参数必须是 JSON 对象")
        # 类型驱动前置校验（与 ToolRegistry.dispatch 相同的 JSON Schema 语义）。
        # 修复前研究路径直接 tool.run() 绕过此校验（Astra A5 P2：声明为 integer
        # 的参数传入字符串仍执行成功）。
        from ..agent.tools import validate_tool_arguments

        validation_error = validate_tool_arguments(tool.name, tool.parameters, arguments)
        if validation_error is not None:
            return json.dumps(
                {"success": False, "data": None, "error": validation_error},
                ensure_ascii=False,
            )
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            _TOOL_EXECUTOR, _run_tool_in_thread, tool, arguments, user_id,
        )
        return json.dumps(
            {"success": result.success, "data": result.data, "error": result.error},
            ensure_ascii=False,
        )
    except Exception as exc:
        return f"{_TOOL_ERROR_PREFIX}{exc}"


def _mark_agent_degraded(degraded_reasons: list[str] | None, reason: str) -> None:
    """向本次 Agent 调用追加一条降级原因（同因多次命中只记一次）。"""
    if degraded_reasons is None or reason in degraded_reasons:
        return
    degraded_reasons.append(reason)


# VS20: agent_results 条目的**结构化状态**——回放侧（前端重新打开历史报告）据此判定
# "哪个 Agent 失败/被降级"，不再用 content 的字符串前缀哨兵做判据。
# 哨兵对主编失败必然落空：主编异常时 content 被置为空串（见下方 run_research），
# 于是重开显示"完成"，与实时路径矛盾。
AGENT_STATUS_COMPLETED = "completed"
AGENT_STATUS_DEGRADED = "degraded"
AGENT_STATUS_FAILED = "failed"


def _agent_result(
    *,
    name: str,
    content: str,
    tool_log: list[JSONDict],
    status: str,
    error: str | None = None,
    degraded_reasons: list[str] | None = None,
) -> JSONDict:
    """构造 agent_results 的单条目，把状态与原因**结构化**地随报告持久化。

    VS20：`status` 是回放侧的主判据（completed/degraded/failed）；`error` 与
    `degraded_reasons` 是"为什么"的来源（供界面显示原因摘要，缺失时界面如实显示
    "原因未记录"，不得编造）。三者与实时 SSE 事件同源，保证实时/回放口径一致。
    """
    result: JSONDict = {"name": name, "content": content, "tool_log": tool_log, "status": status}
    if error:
        result["error"] = error
    if degraded_reasons:
        result["degraded_reasons"] = list(degraded_reasons)
    return result


def _unpack_tool_response(
    response: tuple[Any, ...],
) -> tuple[str, list[JSONDict], str | None]:
    """兼容 3 元组（旧调用方/测试替身）与 4 元组（带 finish_reason）返回值。"""
    if len(response) == 4:
        content, tool_calls, _, finish_reason = response
        return content or "", tool_calls, finish_reason
    content, tool_calls, _ = response
    return content or "", tool_calls, None


async def _request_tool_round(
    client: Any,
    messages: list[JSONDict],
    tools: list[JSONDict],
    *,
    method: str = "chat_with_tools_safe",
    budget_seconds: float | None = None,
    metrics_context: dict[str, str] | None = None,
) -> tuple[str, list[JSONDict], str | None]:
    """调用 LLM 一轮并带回 finish_reason（VS12 P1-2）。

    返回值统一为 (文本, tool_calls, finish_reason)：`with_finish_reason` 是
    LLMClient 上的 keyword-only 参数，客户端若返回旧 3 元组则 finish_reason
    视为未知（由 `_unpack_tool_response` 兼容）。

    注意：这里**刻意不做** `except TypeError` 兜底回退。宽泛兜底会吞掉客户端内部
    真实的 TypeError（JSON/序列化 bug 等）并让同一次 LLM 调用被重发一遍（白付一次
    费用）——"失败必须可见、不得静默吞掉"正是 VS12 的主题。

    VS27：`budget_seconds` 是整轮截止压低后的**单次调用预算**（透传给
    `chat_with_tools_safe`/`chat_with_tools` 的既有关键字参数）。默认 None ⇒
    **调用形状与改动前逐字一致**（不传该参数），既有客户端替身零回归。
    """
    call = getattr(client, method)
    kwargs: JSONDict = {"with_finish_reason": True}
    if budget_seconds is not None:
        kwargs["budget_seconds"] = budget_seconds
    context_token = set_llm_metrics_context(metrics_context or {})
    try:
        return _unpack_tool_response(await call(messages, tools, **kwargs))
    finally:
        reset_llm_metrics_context(context_token)


def _deadline_reached(deadline_at: float | None) -> bool:
    """运行级截止是否已到（含与 VS21 同款浮点容差）；未启用截止时恒为 False。

    `deadline_at` 是**绝对**单调时钟点（`time.monotonic()` 口径），不是剩余秒数——
    这样并行 4 个 Agent 读的是同一时刻，不会各算各的。
    """
    if deadline_at is None:
        return False
    return deadline_at - time.monotonic() <= _DEADLINE_EPSILON_SECONDS


def _remaining_call_budget(client: Any, deadline_at: float | None) -> float | None:
    """本次调用可用的单次预算覆盖值 = min(客户端单次预算, 整轮剩余秒数)。

    - 未启用截止 ⇒ None（**不改写**单次预算，与改动前零回归）；
    - 客户端没有可读的 `total_budget_seconds`（测试替身）⇒ None（不改写其调用形状）；
    - 否则把单次预算压到整轮剩余，使任何一次调用都无法突破整轮截止
      （`llm_client._post_chat_with_retry` 的既有权衡：本次调用 ≤ 生效预算 + 单次尝试超时）。
    """
    if deadline_at is None:
        return None
    client_budget = getattr(client, "total_budget_seconds", None)
    if isinstance(client_budget, bool) or not isinstance(client_budget, (int, float)):
        return None
    return min(float(client_budget), deadline_at - time.monotonic())


def _deadline_not_started_message(deadline_seconds: float | None) -> str:
    """"未开始即已超时"的如实文案（面向用户，落进 `agent_results[key].error`）。"""
    limit = f"{deadline_seconds:g} 秒" if isinstance(deadline_seconds, (int, float)) else "总时长上限"
    return f"因超过研究总时长上限（{limit}）未开始分析，已跳过"


def _is_deadline_budget_exhaustion(exc: LLMError, client: Any, deadline_at: float | None) -> bool:
    """VS30：这条 `LLMError` 是否**因整轮截止压低后的单次预算耗尽**而产生。

    为什么需要它：VS27 把每次调用的单次预算压低为 `min(client.total_budget_seconds, 截止剩余)`
    （`_remaining_call_budget`）。于是当"截止剩余 < 客户端预算"时，`llm_client` 的**预算耗尽**
    路径会**先于** `_deadline_reached` 的轮间检查触发——该 Agent 确实是被总时长上限打死的，
    但异常是从 `_request_tool_round` 抛出来的，只会进 `except LLMError` 分支，与
    "轮间检查发现截止已过"那条路径**不是同一处代码**，此前不置 `truncated`，用户于是
    看不到"本轮因超过总时长上限提前结束"。

    判据**全部取自结构化信号**，不做任何错误文案匹配（仓内铁律：失败/降级判据读结构化信号）：
      ① `deadline_at is not None`：本轮的整轮截止确实启用——没启用就不可能被它砍断；
      ② `exc.budget_exhausted is True`：该错误由 `llm_client._post_chat_with_retry` 的
         **预算耗尽**分支标注（上游 4xx / 网络重试耗尽 / 其它失败一律为 `False`）；
      ③ `exc.effective_budget_seconds` **严格小于** `client.total_budget_seconds`：当时生效的
         预算是被整轮剩余压低后的值 ⇒ 压死这次调用的那条约束就是截止。
    ③ 用严格小于而非容差比较：`_remaining_call_budget` 是 `min()` 的结果，被压低的那一支必然
    **严格小于**客户端预算（浮点上无"差一点"的歧义）；未被压低时两者**相等** ⇒ 判 False
    （客户端自己的预算耗尽，与截止无关）。

    三条缺一不可 ⇒ 不误报：普通 `LLMError`（无结构化字段的测试替身/历史错误形态）为 False；
    客户端自身预算耗尽（未启用截止、截止剩余充足、或生效预算恰等于客户端预算）为 False。
    """
    if deadline_at is None:
        return False
    if getattr(exc, "budget_exhausted", False) is not True:
        return False
    effective = getattr(exc, "effective_budget_seconds", None)
    client_budget = getattr(client, "total_budget_seconds", None)
    if isinstance(effective, bool) or not isinstance(effective, (int, float)):
        return False
    if isinstance(client_budget, bool) or not isinstance(client_budget, (int, float)):
        return False
    if not (math.isfinite(effective) and math.isfinite(client_budget)):
        return False
    return float(effective) < float(client_budget)


def _flag_incomplete_output(
    content: str,
    finish_reason: str | None,
    degraded_reasons: list[str] | None,
) -> None:
    """VS12 P1-2: Agent 产出质量判据 —— 空内容或 max_tokens 截断都算"分析不完整"。"""
    if not content.strip():
        _mark_agent_degraded(degraded_reasons, "empty_content")
    if finish_reason == "length":
        _mark_agent_degraded(degraded_reasons, "output_truncated")


async def _call_agent(
    client: LLMClient,
    role: JSONDict,
    ticker: str,
    company_name: str,
    tool_registry: ToolRegistry,
    *,
    user_id: int | None = None,
    allowed_tools: set[str] | None = None,
    prior_context: str = "",
    memory_context: str = "",
    degraded_reasons: list[str] | None = None,
    deadline_at: float | None = None,
) -> tuple[str, list[JSONDict]]:
    """单个 Agent 完成研究，返回 (全文, 工具调用记录)。

    degraded_reasons 非 None 时，本函数把"内容实际不完整"的信号（工具失败、
    工具循环耗尽、空内容、max_tokens 截断、**整轮截止截断**）追加进去，供
    run_research 汇总为 quality=degraded（VS7 P1b / VS12 P1-1、P1-2 / VS27）。

    deadline_at（VS27）：本 Agent 所属**整轮**的绝对截止点（`time.monotonic()` 口径，
    由 `run_research` 计算并下传），None ⇒ 不做任何时间判断（逐项与改动前一致）。

    本 Agent 的可判定上界：**≤ deadline_at + client.timeout**，前提是"**只在两次
    调用之间检查**截止"——进行中的那次调用不被打断，最多在截止后再跑完一次尝试：
      - 每次调用**发起前**检查（含 `_DEADLINE_EPSILON_SECONDS` 容差），已过 ⇒ 不再发起；
      - 每次调用的单次预算被压低为 `min(client.total_budget_seconds, 截止剩余)`
        （见 `_remaining_call_budget`），故该次调用墙钟 ≤ 生效预算 + 单次尝试超时
        （`llm_client._post_chat_with_retry` 的既有权衡）；
      - 因此最后一个"已发起"的调用最多在截止后再花一个 `client.timeout` 收尾。
    截断时的降级原因是**结构化**的（`degraded_reasons`），不写进正文：
      - 第 1 轮调用都还没发起 ⇒ `deadline_exceeded_before_start`（该 Agent 未开始）；
      - 已经跑过至少一次调用 ⇒ `deadline_exceeded`（产出保留，但可能不完整）。
    已完成的工具调用记录与最后一段可用文本**一律保留**（不静默丢弃）。
    """
    system = role["system_prompt"]
    user_msg = (
        f"请对标的 {ticker}（{company_name}）进行你的专业分析。\n"
        f"使用可用工具获取实时数据，然后输出分析结论。"
    )
    if memory_context:
        user_msg += (
            "\n\n以下是检索到的历史研究记忆：\n"
            f"{memory_context}\n"
            "不要逐字重复历史结论；优先核验数据和环境是否已变化，并明确指出本次新增、延续或推翻的判断。"
        )
    if prior_context:
        user_msg += f"\n\n以下是前序专家的分析，仅用于交叉验证：\n{prior_context}"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_msg},
    ]

    tools = [
        tool.to_openai_tool()
        for tool in tool_registry.list_all()
        if allowed_tools is None or tool.name in allowed_tools
    ]
    tool_calls_log: list[JSONDict] = []
    # VS27: 最近一次成功调用的文本。截止截断时它就是"已完成部分"，必须随结果返回。
    last_content = ""

    # 最多 5 轮 tool_use 循环
    for round_index in range(5):
        if _deadline_reached(deadline_at):
            # 只在两次调用**之间**检查：此刻并不持有进行中的调用，故它不被打断；
            # 已完成的工具记录与文本原样返回（部分结果不得抛掉）。
            _mark_agent_degraded(
                degraded_reasons,
                DEADLINE_REASON_NOT_STARTED if round_index == 0 else DEADLINE_REASON_TRUNCATED,
            )
            return last_content, tool_calls_log
        content, tool_calls, finish_reason = await _request_tool_round(
            client,
            messages,
            tools,
            budget_seconds=_remaining_call_budget(client, deadline_at),
            metrics_context={"role_key": str(role.get("role_key") or "")},
        )
        last_content = content

        if not tool_calls:
            # Agent 给出最终回答
            _flag_incomplete_output(content, finish_reason, degraded_reasons)
            return content, tool_calls_log

        # ponytail: 同轮调用直接并发，gather 保留输入顺序，无需额外调度层。
        result_texts = await asyncio.gather(*(
            _execute_tool_call(tool_call, tool_registry, allowed_tools, user_id=user_id)
            for tool_call in tool_calls
        ))
        # VS7 P1b / VS12 P1-1: 工具失败（5 种形态）此前只留痕在文本里，报告仍被标 audited。
        if any(_is_tool_failure(text) for text in result_texts):
            _mark_agent_degraded(degraded_reasons, "tool_failed")
        for tc, result_text in zip(tool_calls, result_texts, strict=True):
            func = tc["function"]
            tool_calls_log.append({"name": func["name"], "arguments": func["arguments"], "result": result_text})
            messages.append({
                "role": "assistant",
                "content": None,
                **({"reasoning_content": tc["reasoning_content"]} if tc.get("reasoning_content") else {}),
                "tool_calls": [{"id": tc["id"], "type": "function",
                                "function": {"name": func["name"], "arguments": func["arguments"]}}],
            })
            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result_text})

    # 超出 tool_use 轮数，强制要求最终回答
    # VS7 P1b: 工具循环耗尽（llm_client 的 tool_loop_exhausted 同语义）——模型是在
    # "数据没抓全"的情况下被强制下结论的，报告必须诚实标降级。
    _mark_agent_degraded(degraded_reasons, "tool_loop_exhausted")
    if _deadline_reached(deadline_at):
        # VS27: 收尾这第 6 次调用同样只在**发起前**检查；截止已到就不发起它。
        _mark_agent_degraded(degraded_reasons, DEADLINE_REASON_TRUNCATED)
        return last_content, tool_calls_log
    content, _, finish_reason = await _request_tool_round(
        client,
        messages + [{"role": "user", "content": "请基于已有数据输出最终分析结论。"}],
        tools,
        method="chat_with_tools",
        budget_seconds=_remaining_call_budget(client, deadline_at),
        metrics_context={"role_key": str(role.get("role_key") or "")},
    )
    _flag_incomplete_output(content, finish_reason, degraded_reasons)
    return content, tool_calls_log


async def _run_research_impl(
    ticker: str,
    company_name: str = "",
    model_id: int | None = None,
    *,
    user_id: int,
    deadline_seconds: float | None = DEFAULT_RESEARCH_DEADLINE_SECONDS,
    telemetry_records: list[JSONDict],
) -> AsyncIterator[tuple[str, JSONDict]]:
    """并行执行四个 Agent 的研究，通过 yield (event, data) 推送 SSE 事件流。

    事件类型：
    - agent_started: 某 Agent 开始
    - tool_call: 某 Agent 调用工具
    - agent_completed: 某 Agent 完成
    - agent_failed: 某 Agent 失败但**非致命**（VS12 P1-3：单个 Agent 异常/LLMError 只降级，
      不毁掉整轮；router 侧对 agent_failed 不 fail+break）
    - report_progress: 报告生成进度
    - done: 全部完成（quality 为 audited/degraded）
    - error: 真致命错误（目前仅"拿不到 LLM client"，router 收到即判 failed+break）

    deadline_seconds（VS27）：**整轮**（4 个并行 Agent + 串行主编）的聚合等待上界，
    相对本函数开始执行计时；缺省 `DEFAULT_RESEARCH_DEADLINE_SECONDS`，即产品默认
    核心研究路径**一定有上界**（三条调用路径 research/analysis/scheduler 同源，
    都吃这个缺省，不存在"改了一条忘了另一条"）。显式传 `None` ⇒ 不做任何时间判断，
    逐项与改动前一致（仅供测试/离线批处理）。

    可判定上界：**整轮墙钟 ≤ deadline_seconds + client.timeout**（单次尝试超时），
    前提是"**只在两次调用之间检查**截止，进行中的调用不打断"：
      ① 4 个 Agent **并行**，各自最多 6 次调用（5 轮 + 1 次强制收尾），每次调用发起前
         检查同一个绝对截止点（含浮点容差），已过 ⇒ 该次调用根本不发起；
      ② 每次调用的单次预算被压低为 `min(client.total_budget_seconds, 截止剩余)` ⇒ 该次
         调用墙钟 ≤ 生效预算 + 单次尝试超时（llm_client 既有权衡）；
      ③ 主编在全部 Agent 之后**串行**开始，同样在发起前检查；已过 ⇒ 一次调用都不发。
    合起来：最后一个"已发起"的调用最多在截止后再跑完**一次尝试** ⇒ ≤ 截止 + `client.timeout`
    （默认 120s；改动前最坏 ≈ 6 × 300 + 主编 300 ≈ 60 分钟）。
    不在该上界内的：①工具自身的执行时长（由工具超时/熔断负责，编排层不做时间切片）；
    ②收尾进度动画（恒定 ~0.7s）；③前置步骤（记忆检索 / 取 LLM client）——它们是本地检索与
    本地解析，且在第一次调用**之前**发生，不产生 LLM 等待。

    值必须为正有限数：0/负数/NaN/Inf ⇒ `ValueError`（与 VS21/VS23 同口径）。

    截断时（`done.truncated_by_deadline is True` / `report.truncated_by_deadline`）：
      - 已完成的 Agent 成果**保留**在报告内；
      - 被截断的 Agent 状态**如实**：跑过调用 ⇒ `degraded` + `degraded_reasons`
        `["deadline_exceeded"]`；一次都没发起 ⇒ `failed` + `error`（"未开始"）；
      - 信号与落库**同源**：`report_data.truncated_by_deadline` 与 `agent_results[key]`
        就是 router/scheduler 落库的那一份，前端实时与回放读同一字段（见 `Research.tsx`）。
      - VS30：**两条触发路径同源同类**。"轮间检查发现截止已过"与"某次调用把**被截止压低的
        单次预算**耗尽（llm_client 抛预算耗尽类 `LLMError`）"都会置同一个
        `truncated_by_deadline`；判据是结构化的（`exc.budget_exhausted` +
        `exc.effective_budget_seconds < client.total_budget_seconds`），不匹配错误文案。
        后者只是失败得更早（异常先出），不代表"与截止无关"。
    """
    # 截止值非法必须在**任何副作用之前**拒绝（也早于记忆检索与 LLM client 获取）。
    if deadline_seconds is not None and (
        not math.isfinite(deadline_seconds) or deadline_seconds <= 0
    ):
        raise ValueError("deadline_seconds 必须是正有限数（单位：秒）或 None")
    deadline_at = None if deadline_seconds is None else time.monotonic() + deadline_seconds

    from ..services import model_router

    memory_hits = await native_memory_provider.search(f"{ticker} {company_name}", user_id=user_id, limit=4)
    memory_context = native_memory_provider.render_context(memory_hits)
    rollout = await prepare_memory_rollout(
        f"{ticker} {company_name}",
        user_id=user_id,
        surface="research",
        native_candidate_count=len(memory_hits),
        subject_type="instrument",
        subject_id=ticker,
    )
    if rollout.context:
        memory_context = "\n\n".join(part for part in (memory_context, rollout.context) if part)

    try:
        client, _ = await model_router.get_client(model_id, user_id=user_id)
    except LLMError as e:
        await finalize_memory_rollout(rollout, response=None, outcome="upstream_error")
        yield "error", {"error": str(e)}
        return

    registry = ToolRegistry()
    agent_results: dict[str, JSONDict] = {}
    # VS20: 每个 Agent 的结构化结局（status/error/degraded_reasons）。DAGNode.run 的返回值
    # 是既有的 4 元组契约（swarm/其他消费方共用），故不改元组形状，用旁挂字典传递状态。
    agent_outcomes: dict[str, JSONDict] = {}
    sections = get_memo_sections()
    total_sections = len(sections)
    # BACKLOG-G-03: 任一 agent / 主编环节失败时，报告必须诚实标记降级，
    # 不得呈现为无条件"completed 成功报告"。
    degraded = False
    # VS27: 整轮截止是否真的截断过（有调用被跳过）。它与 quality 一起落进 report_data，
    # 实时 done 与落库/回放读的是同一份。
    truncated = False

    def make_node(role: JSONDict) -> DAGNode:
        async def run_agent(context: DAGContext) -> tuple[str, str, str, list[JSONDict]]:
            nonlocal degraded, truncated
            role_key = role["role_key"]
            context.emit("agent_started", {
                "role_key": role_key,
                "name": role["name"],
                "avatar": role.get("avatar", ""),
            })
            try:
                agent_reasons: list[str] = []
                content, tool_log = await _call_agent(
                    client,
                    role,
                    ticker,
                    company_name,
                    registry,
                    user_id=user_id,
                    memory_context=memory_context,
                    degraded_reasons=agent_reasons,
                    deadline_at=deadline_at,
                )
            except LLMError as exc:
                # G-03: agent 的 LLMError 是"非致命降级"——返回降级文本让报告仍能完成，
                # 但必须标 degraded 并在前端提示"该环节失败、报告不完整"。
                # 注意用 agent_failed 而非 error：error 会被 router 视作致命失败（fail+break），
                # 报告将整体 failed 而非 degraded-completed——与 G-03 目标不符。
                degraded = True
                # VS30: 若这次失败是"**被整轮截止压低后的单次预算**耗尽"，它同样是**被截止砍断**的
                # （VS27 令单次预算 = min(客户端预算, 截止剩余)，该情形下预算耗尽先于轮间检查触发），
                # 必须与"轮间检查发现截止已过"那条路径一样置截断信号 ⇒ 前端横幅同样出现。
                # 判据是结构化的（见 `_is_deadline_budget_exhaustion`），不匹配错误文案。
                if _is_deadline_budget_exhaustion(exc, client, deadline_at):
                    truncated = True
                context.emit("agent_failed", {"role_key": role_key, "error": str(exc)})
                agent_outcomes[role_key] = {
                    "status": AGENT_STATUS_FAILED,
                    "error": str(exc),
                }
                return role_key, f"【分析失败】{exc}", role["name"], []

            # VS7 P1b: 工具异常 / 工具循环耗尽 → 该 agent 的分析不完整，报告降级。
            if agent_reasons:
                degraded = True
            if DEADLINE_REASON_TRUNCATED in agent_reasons or DEADLINE_REASON_NOT_STARTED in agent_reasons:
                truncated = True
            if DEADLINE_REASON_NOT_STARTED in agent_reasons:
                # VS27: 该 Agent 连第一次调用都没发起（截止在它开始前已过）。
                # 状态必须**如实**为 failed（未开始），不得静默变 completed；
                # 但也绝不升级为整轮失败——其余 Agent 的成果仍在同一份报告里。
                message = _deadline_not_started_message(deadline_seconds)
                context.emit("agent_failed", {"role_key": role_key, "error": message})
                agent_outcomes[role_key] = {"status": AGENT_STATUS_FAILED, "error": message}
                return role_key, f"【分析失败】{message}", role["name"], []

            for tool_call in tool_log:
                context.emit("tool_call", {
                    "role_key": role_key,
                    "tool_name": tool_call["name"],
                    "arguments": tool_call["arguments"],
                })
            # VS20: 降级原因随事件一起推送（此前只喂给 runner，界面无从得知"哪个 Agent、
            # 为什么"），并与持久化的 agent_results[key].degraded_reasons 同源。
            context.emit("agent_completed", {
                "role_key": role_key,
                "name": role["name"],
                "length": len(content),
                "status": AGENT_STATUS_DEGRADED if agent_reasons else AGENT_STATUS_COMPLETED,
                **({"degraded_reasons": list(agent_reasons)} if agent_reasons else {}),
            })
            agent_outcomes[role_key] = {
                "status": AGENT_STATUS_DEGRADED if agent_reasons else AGENT_STATUS_COMPLETED,
                "degraded_reasons": list(agent_reasons),
            }
            return role_key, content, role["name"], tool_log

        return DAGNode(key=role["role_key"], run=run_agent)

    roles_by_key = {role["role_key"]: role for role in RESEARCH_ROLES}
    runtime = DAGRuntime([make_node(role) for role in RESEARCH_ROLES])
    async for event in runtime.stream():
        if event.kind in {"agent_started", "tool_call", "agent_completed", "error", "agent_failed"}:
            yield event.kind, event.data
        elif event.kind == "node_completed":
            role_key, content, name, tool_log = event.result
            outcome = agent_outcomes.get(role_key, {"status": AGENT_STATUS_COMPLETED})
            agent_results[role_key] = _agent_result(
                name=name,
                content=content,
                tool_log=tool_log,
                status=outcome["status"],
                error=outcome.get("error"),
                degraded_reasons=outcome.get("degraded_reasons"),
            )
        elif event.kind == "node_failed":
            role = roles_by_key[event.node_key]
            error = str(event.error)
            degraded = True
            # VS12 P1-3: 此分支本意是"继续"（写占位 + 标降级），但此前同时 yield "error"，
            # 而 routers/research.py 收到 error 即 _fail_report + break —— 整轮研究被丢弃，
            # 其余已完成的 Agent 成果全丢。改用非致命的 agent_failed（router 侧已按非致命处理，
            # 与 G-03 的 LLMError 路径同一语义）。真致命路径是上文"拿不到 LLM client"的
            # yield "error"，必须保留，不受本次改动影响。
            yield "agent_failed", {
                "role_key": event.node_key,
                "error": f"研究 Agent 异常：{error}",
            }
            agent_results[event.node_key] = _agent_result(
                name=role["name"],
                content=f"【分析失败】{error}",
                tool_log=[],
                status=AGENT_STATUS_FAILED,
                error=f"研究 Agent 异常：{error}",
            )

    lead_context = "\n\n".join(
        f"【{result['name']}】\n{result['content']}"
        for result in agent_results.values()
    )
    yield "agent_started", {
        "role_key": REPORT_LEAD_ROLE["role_key"],
        "name": REPORT_LEAD_ROLE["name"],
        "avatar": REPORT_LEAD_ROLE["avatar"],
    }
    lead_reasons: list[str] = []
    lead_error: str | None = None
    try:
        lead_content, lead_tool_log = await _call_agent(
            client,
            REPORT_LEAD_ROLE,
            ticker,
            company_name,
            registry,
            user_id=user_id,
            allowed_tools={"audit_report_data", "check_buffett_rules", "adversarial_review", "calculate_by_financial_rigor"},
            prior_context=lead_context,
            memory_context=memory_context,
            degraded_reasons=lead_reasons,
            deadline_at=deadline_at,
        )
    except LLMError as exc:
        lead_content, lead_tool_log = "", []
        degraded = True
        # 异常对象在 except 块外不可见（Python 会清除 exc），因此显式留存原因文本，
        # 供结构化结局使用。
        lead_error = str(exc)
        # VS30: 与 Agent 那条路径同源——主编被"截止压低后的单次预算"打死时，它同样是
        # **被截止砍断**。这一支在生产时钟下必然真实（压低后的预算耗光 ⇒ 那一刻已越过截止），
        # 而且它是**最后一个**环节，之后没有任何截止检查，此前整轮截断信号会停在 False。
        if _is_deadline_budget_exhaustion(exc, client, deadline_at):
            truncated = True
        yield "agent_failed", {"role_key": "report_lead", "error": str(exc)}
    # VS7 P1a（修正）: 口径必须与 report_builder **逐字一致**。
    # report_builder.py:296,368 的判据是 `lead = parse_lead_review(lead_content)` 后
    # 的 **解析结果** 真值（"audited" if lead else "degraded"），而不是原始字符串非空：
    # lead 返回"非空但无法解析的散文"时 parse_lead_review 返回 {}，report_builder 判
    # degraded 而"仅判字符串非空"会判 audited —— 矛盾依旧。故此处复用同一解析函数。
    lead_parsed = parse_lead_review(lead_content)
    if lead_reasons or not lead_parsed:
        degraded = True
    # VS27: 主编同样在**发起前**检查截止，因此"主编一次调用都没发"是有可能的：
    # 它必须如实呈现为 failed + 可读原因（而不是"降级但原因未记录"）。
    if DEADLINE_REASON_TRUNCATED in lead_reasons or DEADLINE_REASON_NOT_STARTED in lead_reasons:
        truncated = True
    if DEADLINE_REASON_NOT_STARTED in lead_reasons and lead_error is None:
        lead_error = _deadline_not_started_message(deadline_seconds)
        yield "agent_failed", {"role_key": "report_lead", "error": lead_error}
    for tool_call in lead_tool_log:
        yield "tool_call", {
            "role_key": "report_lead",
            "tool_name": tool_call["name"],
            "arguments": tool_call["arguments"],
        }
    # VS20: 主编的结构化结局。此前主编失败时只写空 content，任何基于内容的判据都会把
    # 它读成"完成"；现在显式写 status=failed + error。
    if lead_error is not None:
        lead_status, lead_degraded_reasons = AGENT_STATUS_FAILED, []
    elif lead_reasons:
        lead_status, lead_degraded_reasons = AGENT_STATUS_DEGRADED, list(lead_reasons)
    elif not lead_parsed:
        # 内容为空或无法解析 → 确实降级，但**没有**可记录的结构化原因，
        # 界面须如实显示"原因未记录"，不得编造。
        lead_status, lead_degraded_reasons = AGENT_STATUS_DEGRADED, []
    else:
        lead_status, lead_degraded_reasons = AGENT_STATUS_COMPLETED, []
    agent_results["report_lead"] = _agent_result(
        name=REPORT_LEAD_ROLE["name"],
        content=lead_content,
        tool_log=lead_tool_log,
        status=lead_status,
        error=lead_error,
        degraded_reasons=lead_degraded_reasons,
    )
    # VS20: 主编失败后**不得**再发 agent_completed——它是"完成"信号，会把前端刚被
    # agent_failed 置为 failed 的主编卡片翻回 completed，直接造成实时路径自相矛盾
    # （实测：主编 LLMError 的事件序列是 agent_failed → agent_completed）。
    if lead_error is None:
        yield "agent_completed", {
            "role_key": "report_lead",
            "name": REPORT_LEAD_ROLE["name"],
            "length": len(lead_content),
            "status": lead_status,
            **({"degraded_reasons": lead_degraded_reasons} if lead_degraded_reasons else {}),
        }

    # 生成结构化报告（模拟进度）
    yield "report_progress", {"section": 0, "total": total_sections, "name": "开始整合备忘录"}

    report_data = _build_report(ticker, company_name, agent_results)
    report_data["telemetry_summary"] = build_telemetry_summary(telemetry_records)
    # VS7 P0: 质量标记的单一源头——并入 report_data 内部，随报告一起持久化。
    # 定时路径（scheduler）只落库 payload["report"]，交互路径（routers/research）
    # 额外读顶层 quality 再合并；放在源头后两条路径天然一致。
    quality = "degraded" if degraded else "audited"
    report_data["quality"] = quality
    # VS27: 整轮截断信号与 quality 放在**同一处**（report_data 内部）⇒ 随报告一起持久化，
    # 实时 done（data.report）与回放（research_reports.report_data）天然同源。
    report_data["truncated_by_deadline"] = truncated
    for i, section in enumerate(sections, 1):
        yield "report_progress", {
            "section": i,
            "total": total_sections,
            "name": f"生成 {section}",
        }
        await asyncio.sleep(0.05)  # 让前端看到进度动画

    done_payload = {
        "ticker": ticker,
        "report": report_data,
        # G-03/VS7: 报告诚实质量标记——任一环节失败即为 degraded，正常为 audited。
        # 与 report_builder.lead_review_status 同语义（degraded 前端已有降级提示机制）。
        # 顶层保留以兼容既有 SSE 消费方与前端 resolveReportQuality。
        "quality": quality,
        # VS27: 整轮截断信号。**它有真实消费方**——`frontend/src/pages/Research.tsx`
        # 的 `resolveTruncatedByDeadline`（实时 done 与回放 get_report 两条路径读同一字段）
        # 把它渲染成用户可见的"本轮研究因超过总时长上限提前结束"提示条。
        # 与 report_data 内部的值同一份（用户所见 == 落库内容）。
        "truncated_by_deadline": truncated,
        # Tool logs retain the data-source trail (including news URLs) for
        # later report review instead of discarding research provenance.
        # VS20: 结构化状态（status/error/degraded_reasons）必须原样随 done 事件下发——
        # 它正是 router 落库进 research_reports.agent_results 的内容，回放侧据此判定
        # "哪个 Agent 失败/被降级、为什么"。此前这里重建条目时只挑 name/content/tool_log，
        # 会把新字段丢掉，导致实时与落库口径再次分叉。
        "agent_results": {k: dict(v) for k, v in agent_results.items()},
    }
    await finalize_memory_rollout(rollout, response=report_data)
    yield "done", done_payload


async def run_research(
    ticker: str,
    company_name: str = "",
    model_id: int | None = None,
    *,
    user_id: int,
    deadline_seconds: float | None = DEFAULT_RESEARCH_DEADLINE_SECONDS,
) -> AsyncIterator[tuple[str, JSONDict]]:
    """并行执行四个 Agent 的研究，通过 yield (event, data) 推送 SSE 事件流并记录遥测。

    deadline_seconds（VS27）：整轮（4 个并行 Agent + 串行主编）的聚合等待上界。
    可判定上界：整轮墙钟 ≤ deadline_seconds + client.timeout（单次尝试超时），
    前提是"只在两次调用之间检查截止，进行中的调用不打断"。
    值必须为正有限数：0/负数/NaN/Inf ⇒ ValueError。
    """
    telemetry_records: list[JSONDict] = []
    metrics_queue: asyncio.Queue[JSONDict] = asyncio.Queue()
    telemetry_token = set_llm_metrics_sink(telemetry_records.append)
    stream_token = set_llm_metrics_sink(
        lambda record: metrics_queue.put_nowait(llm_metrics_event_payload(record))
    )
    try:
        source = _run_research_impl(
            ticker,
            company_name,
            model_id,
            user_id=user_id,
            deadline_seconds=deadline_seconds,
            telemetry_records=telemetry_records,
        )
        async for event in interleave_llm_metrics(source, metrics_queue):
            yield event
    finally:
        reset_llm_metrics_sink(stream_token)
        reset_llm_metrics_sink(telemetry_token)


def _build_report(ticker: str, company_name: str, agent_results: dict[str, JSONDict]) -> JSONDict:
    """Build the canonical report from researcher and team-lead outputs."""
    lead = agent_results.get("report_lead", {}).get("content", "")
    return build_unified_report(ticker, company_name, agent_results, lead_content=lead)
