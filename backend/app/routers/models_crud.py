"""模型配置 CRUD + 连通性测试 + 默认模型切换。"""
import time

from fastapi import APIRouter, HTTPException

from .. import database
from ..models import ModelConfigIn, ModelConfigUpdate
from ..services import model_router
from ..services.llm_client import LLMError

router = APIRouter(prefix="/api/models", tags=["models"])


def _public_model(row: dict) -> dict:
    """Never send stored API secrets back to the browser."""
    data = dict(row)
    data["has_api_key"] = bool(data.get("api_key") or data.get("api_key_env"))
    data.pop("api_key", None)
    return data


@router.get("")
async def list_models():
    return {"items": [_public_model(row) for row in await database.query_all("SELECT * FROM model_configs ORDER BY id")]}


@router.post("", status_code=201)
async def create_model(body: ModelConfigIn):
    new_id = await database.execute(
        "INSERT INTO model_configs (name, provider, base_url, model_name, api_key, api_key_env, temperature, max_tokens) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            body.name, body.provider, body.base_url, body.model_name,
            body.api_key, body.api_key_env, body.temperature, body.max_tokens,
        ),
    )
    return _public_model(await database.query_one("SELECT * FROM model_configs WHERE id=?", (new_id,)))


@router.put("/{model_id}")
async def update_model(model_id: int, body: ModelConfigUpdate):
    existing = await database.query_one("SELECT * FROM model_configs WHERE id=?", (model_id,))
    if existing is None:
        raise HTTPException(404, f"模型配置不存在：id={model_id}")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        await database.execute(
            f"UPDATE model_configs SET {sets}, updated_at=datetime('now') WHERE id=?",
            (*updates.values(), model_id),
        )
    return _public_model(await database.query_one("SELECT * FROM model_configs WHERE id=?", (model_id,)))


@router.delete("/{model_id}")
async def delete_model(model_id: int):
    existing = await database.query_one("SELECT * FROM model_configs WHERE id=?", (model_id,))
    if existing is None:
        raise HTTPException(404, f"模型配置不存在：id={model_id}")
    await database.execute("DELETE FROM model_configs WHERE id=?", (model_id,))
    return {"ok": True}


@router.post("/{model_id}/test")
async def test_model(model_id: int):
    start = time.perf_counter()
    try:
        client, cfg = await model_router.get_client(model_id)
        reply, _ = await client.chat(
            [{"role": "user", "content": "Reply in one short sentence: what model are you?"}]
        )
        latency = int((time.perf_counter() - start) * 1000)
        return {"ok": True, "latency_ms": latency, "message": "连通成功", "reply": reply[:100]}
    except LLMError as e:
        latency = int((time.perf_counter() - start) * 1000)
        return {"ok": False, "latency_ms": latency, "message": str(e)}


@router.post("/{model_id}/set-default")
async def set_default(model_id: int):
    existing = await database.query_one("SELECT * FROM model_configs WHERE id=?", (model_id,))
    if existing is None:
        raise HTTPException(404, f"模型配置不存在：id={model_id}")
    await database.execute("UPDATE model_configs SET is_default=0")
    await database.execute("UPDATE model_configs SET is_default=1 WHERE id=?", (model_id,))
    return {"ok": True}
