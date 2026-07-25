"""角色预设 CRUD。"""
from fastapi import APIRouter, HTTPException

from .. import database
from ..models import AgentPresetIn, AgentPresetUpdate

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("")
async def list_agents():
    return {"items": await database.query_all("SELECT * FROM agent_presets ORDER BY id")}


@router.post("", status_code=201)
async def create_agent(body: AgentPresetIn):
    dup = await database.query_one("SELECT id FROM agent_presets WHERE role_key=?", (body.role_key,))
    if dup:
        raise HTTPException(409, f"role_key 已存在：{body.role_key}")
    new_id = await database.execute(
        "INSERT INTO agent_presets (name, role_key, avatar, system_prompt, model_id, is_preset) "
        "VALUES (?, ?, ?, ?, ?, 0)",
        (body.name, body.role_key, body.avatar, body.system_prompt, body.model_id),
    )
    return await database.query_one("SELECT * FROM agent_presets WHERE id=?", (new_id,))


@router.put("/{agent_id}")
async def update_agent(agent_id: int, body: AgentPresetUpdate):
    existing = await database.query_one("SELECT * FROM agent_presets WHERE id=?", (agent_id,))
    if existing is None:
        raise HTTPException(404, f"角色不存在：id={agent_id}")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        await database.execute(
            f"UPDATE agent_presets SET {sets} WHERE id=?", (*updates.values(), agent_id)
        )
    return await database.query_one("SELECT * FROM agent_presets WHERE id=?", (agent_id,))


@router.delete("/{agent_id}")
async def delete_agent(agent_id: int):
    existing = await database.query_one("SELECT * FROM agent_presets WHERE id=?", (agent_id,))
    if existing is None:
        raise HTTPException(404, f"角色不存在：id={agent_id}")
    await database.execute("DELETE FROM agent_presets WHERE id=?", (agent_id,))
    return {"ok": True}
