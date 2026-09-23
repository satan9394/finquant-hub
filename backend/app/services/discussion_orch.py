"""多 Agent 轮序讨论编排器（MVP：独立陈述，无交叉质询）。

每个 Agent 的上下文：角色 System Prompt + 讨论主题 + 行情摘要（若主题含股票代码）
+ 前序 Agent 发言摘要（截断，节约 token）。全部发言落库 messages 表。
"""
import json
import re
from collections.abc import AsyncIterator
from typing import Any, cast

from .. import database
from ..orchestrator import DAGContext, DAGNode, DAGRuntime
from ..services import model_router
from ..services.context import estimate_tokens
from ..services.llm_client import LLMError
from ..services.market_data import MarketDataService, MarketError

SUMMARY_PROMPT = """你是投研讨论的主持人。以下是多位分析师围绕主题「{topic}」的完整发言记录。
请输出讨论总结，结构：
1. 核心共识（各方一致认可的判断）
2. 主要分歧（观点对立方各自的理由）
3. 风险清单（讨论中提到的所有风险点，合并去重）
4. 综合倾向（一句话，明确偏多/偏空/中性）
500 字以内，直接输出总结正文。此内容由 AI 生成，不构成投资建议。"""


async def _market_context(topic: str) -> str:
    """主题含 6 位股票代码时，注入实时行情摘要。"""
    m = re.search(r"(?<!\d)(\d{6})(?!\d)", topic)
    if not m:
        return ""
    svc = MarketDataService()
    try:
        q = await svc.quote(m.group(1))
        return (
            f"\n\n实时行情参考（{q['code']} {q['name']}）：现价 {q['price']}，"
            f"涨跌幅 {q['change_percent']}%，今开 {q['open']}，最高 {q['high']}，最低 {q['low']}，"
            f"PE {q['pe']}，PB {q['pb']}，总市值 {q['market_cap']} 亿，换手率 {q['turnover_rate']}%。"
        )
    except MarketError:
        return "\n\n（实时行情获取失败，请基于已有知识分析并标注数据待验证）"
    finally:
        await svc.aclose()


async def run_discussion(
    room: dict[str, Any], model_id: int | None = None
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """异步生成器：yield (event_name, data_dict)。"""
    room_id = room["id"]
    user_id = int(room["user_id"])
    topic = room["topic"]
    total = room["total_rounds"]
    participants = sorted(room["participants"], key=lambda p: p["role_key"])

    preset_rows = await database.query_all(
        f"SELECT * FROM agent_presets WHERE role_key IN ({','.join('?' * len(participants))})",
        tuple(p["role_key"] for p in participants),
    )
    presets = {r["role_key"]: r for r in preset_rows}
    missing_role = next((p["role_key"] for p in participants if p["role_key"] not in presets), None)
    if missing_role is not None:
        yield "error", {"error": f"角色预设不存在：{missing_role}"}
        return

    client, _ = await model_router.get_client(model_id, user_id=user_id)
    market_ctx = await _market_context(topic)

    def make_node(
        rnd: int,
        participant: dict[str, Any],
        previous_key: str | None,
        starts_round: bool,
    ) -> DAGNode:
        role_key = participant["role_key"]
        preset = presets[role_key]

        async def run_turn(context: DAGContext) -> dict[str, Any]:
            if starts_round:
                context.emit("round_start", {"round": rnd, "total_rounds": total})
            context.emit("agent_start", {
                "agent": role_key,
                "name": preset["name"],
                "avatar": preset["avatar"],
                "round": rnd,
            })
            prior = "".join(result["prior_line"] for result in context.results.values())[-1200:]
            system = (
                f"{preset['system_prompt']}\n\n讨论主题：{topic}{market_ctx}\n"
                f"当前轮次：第 {rnd}/{total} 轮。"
            )
            user = (
                f"前序发言摘要：\n{prior}" if prior
                else "你是本场第一位发言者。请基于你的分析框架对主题给出独立观点。"
            )
            full = ""
            async for delta in client.chat_stream(
                [{"role": "system", "content": system}, {"role": "user", "content": user}]
            ):
                full += delta
                context.emit("token", {"delta": delta, "agent": role_key})

            msg_id = await database.execute(
                "INSERT INTO messages (conversation_id, role, agent_name, content, round_number, token_count, user_id) "
                "VALUES (?, 'agent', ?, ?, ?, ?, ?)",
                (room["conversation_id"], role_key, full, rnd, estimate_tokens(full), user_id),
            )
            context.emit("agent_end", {
                "agent": role_key, "message_id": msg_id, "token_count": estimate_tokens(full),
            })
            return {
                "message_id": msg_id,
                "prior_line": f"【{preset['name']}】{full[:120]}{'…' if len(full) > 120 else ''}\n",
            }

        dependencies = (previous_key,) if previous_key is not None else ()
        return DAGNode(key=f"round-{rnd}:{role_key}", run=run_turn, dependencies=dependencies)

    nodes = []
    previous_key = None
    for rnd in range(1, total + 1):
        for participant_index, participant in enumerate(participants):
            node = make_node(rnd, participant, previous_key, starts_round=participant_index == 0)
            nodes.append(node)
            previous_key = node.key

    runtime = DAGRuntime(nodes)
    async for event in runtime.stream():
        if event.kind in {"round_start", "agent_start", "token", "agent_end"}:
            yield event.kind, event.data
        elif event.kind == "node_failed":
            raise cast(BaseException, event.error)
        elif event.kind == "node_skipped":
            raise RuntimeError(f"讨论节点因依赖失败被跳过：{event.node_key}")

    # 讨论总结（非流式一次生成）
    all_msgs = await database.query_all(
        "SELECT agent_name, content FROM messages WHERE conversation_id=? AND user_id=? AND role='agent' ORDER BY id",
        (room["conversation_id"], user_id),
    )
    transcript = "\n\n".join(f"【{m['agent_name']}】{m['content'][:600]}" for m in all_msgs)
    summary, _ = await client.chat([
        {"role": "system", "content": SUMMARY_PROMPT.format(topic=topic)},
        {"role": "user", "content": transcript[-6000:]},
    ])
    await database.execute(
        "UPDATE discussion_rooms SET current_phase='done', summary=? WHERE id=? AND user_id=?",
        (summary, room_id, user_id),
    )
    yield "summary", {"content": summary}
    yield "done", {"room_id": room_id}


async def stream_discussion(
    room: dict[str, Any],
    model_id: int | None = None,
) -> AsyncIterator[dict[str, str]]:
    """包装为 sse-starlette 事件流，统一错误收尾。"""
    try:
        async for event, data in run_discussion(room, model_id):
            yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
    except LLMError as e:
        yield {"event": "error", "data": json.dumps({"error": str(e)}, ensure_ascii=False)}
    except Exception as e:
        yield {"event": "error", "data": json.dumps({"error": f"讨论编排错误：{e}"}, ensure_ascii=False)}
