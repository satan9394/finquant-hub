"""模型配置 CRUD + 连通性测试 + 默认模型切换。"""
import os
import time
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException

from .. import database
from ..models import ModelConfigIn, ModelConfigUpdate
from ..services import model_router
from ..services.credential_store import delete_credential, put_credential
from ..services.llm_client import LLMError
from .auth import CurrentUser, authenticated_context

router = APIRouter(prefix="/api/models", tags=["models"], dependencies=[Depends(authenticated_context)])


def _public_model(row: dict[str, Any]) -> dict[str, Any]:
    """Never send stored API secrets back to the browser."""
    data = dict(row)
    has_stored_credential = bool(data.get("has_stored_credential"))
    api_key_env = str(data.get("api_key_env") or "").strip()
    try:
        has_environment_credential = bool(api_key_env and os.getenv(api_key_env, ""))
    except ValueError:
        has_environment_credential = False
    data["has_api_key"] = has_stored_credential or has_environment_credential
    data["credential_source"] = (
        "stored" if has_stored_credential else "environment" if has_environment_credential else "none"
    )
    data.pop("api_key", None)
    data.pop("has_stored_credential", None)
    return data


@router.get("")
async def list_models(user: CurrentUser) -> dict[str, Any]:
    rows = await database.query_all(
        "SELECT m.*, EXISTS(SELECT 1 FROM user_credentials c "
        "WHERE c.user_id=m.user_id AND c.service='model:' || m.id) AS has_stored_credential "
        "FROM model_configs m WHERE m.user_id=? ORDER BY m.id",
        (user["id"],),
    )
    return {"items": [_public_model(row) for row in rows]}


@router.post("", status_code=201)
async def create_model(body: ModelConfigIn, user: CurrentUser) -> dict[str, Any]:
    new_id = await database.execute(
        "INSERT INTO model_configs (name, provider, base_url, model_name, api_key_env, temperature, max_tokens, user_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            body.name, body.provider, body.base_url, body.model_name,
            body.api_key_env, body.temperature, body.max_tokens, user["id"],
        ),
    )
    if body.api_key:
        await put_credential(int(user["id"]), f"model:{new_id}", body.api_key, body.provider)
    row = await database.query_one("SELECT * FROM model_configs WHERE id=? AND user_id=?", (new_id, user["id"]))
    if row is not None:
        row["has_stored_credential"] = bool(body.api_key)
    return _public_model(cast(dict[str, Any], row))


@router.put("/{model_id}")
async def update_model(model_id: int, body: ModelConfigUpdate, user: CurrentUser) -> dict[str, Any]:
    existing = await database.query_one("SELECT * FROM model_configs WHERE id=? AND user_id=?", (model_id, user["id"]))
    if existing is None:
        raise HTTPException(404, f"模型配置不存在：id={model_id}")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    api_key = updates.pop("api_key", None)
    if api_key:
        await put_credential(int(user["id"]), f"model:{model_id}", str(api_key), str(updates.get("provider") or existing["provider"]))
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        await database.execute(
            f"UPDATE model_configs SET {sets}, updated_at=datetime('now') WHERE id=? AND user_id=?",
            (*updates.values(), model_id, user["id"]),
        )
    row = await database.query_one("SELECT * FROM model_configs WHERE id=? AND user_id=?", (model_id, user["id"]))
    if row is not None:
        row["has_stored_credential"] = bool(await database.query_one(
            "SELECT id FROM user_credentials WHERE user_id=? AND service=?",
            (user["id"], f"model:{model_id}"),
        ))
    return _public_model(cast(dict[str, Any], row))


@router.delete("/{model_id}")
async def delete_model(model_id: int, user: CurrentUser) -> dict[str, bool]:
    existing = await database.query_one("SELECT * FROM model_configs WHERE id=? AND user_id=?", (model_id, user["id"]))
    if existing is None:
        raise HTTPException(404, f"模型配置不存在：id={model_id}")
    await delete_credential(int(user["id"]), f"model:{model_id}")
    await database.execute("DELETE FROM model_configs WHERE id=? AND user_id=?", (model_id, user["id"]))
    return {"ok": True}


@router.post("/{model_id}/test")
async def test_model(model_id: int, user: CurrentUser) -> dict[str, Any]:
    start = time.perf_counter()
    try:
        client, cfg = await model_router.get_client(model_id, user_id=int(user["id"]))
        reply, _ = await client.chat(
            [{"role": "user", "content": "Reply in one short sentence: what model are you?"}]
        )
        latency = int((time.perf_counter() - start) * 1000)
        return {"ok": True, "latency_ms": latency, "message": "连通成功", "reply": reply[:100]}
    except LLMError as e:
        latency = int((time.perf_counter() - start) * 1000)
        return {"ok": False, "latency_ms": latency, "message": str(e)}


@router.post("/{model_id}/set-default")
async def set_default(model_id: int, user: CurrentUser) -> dict[str, bool]:
    existing = await database.query_one("SELECT * FROM model_configs WHERE id=? AND user_id=?", (model_id, user["id"]))
    if existing is None:
        raise HTTPException(404, f"模型配置不存在：id={model_id}")
    await database.execute("UPDATE model_configs SET is_default=0 WHERE user_id=?", (user["id"],))
    await database.execute("UPDATE model_configs SET is_default=1 WHERE id=? AND user_id=?", (model_id, user["id"]))
    return {"ok": True}
