"""模型路由：按 ID / 默认配置解析出可调用的 LLMClient。

API Key 解析优先级：用户加密凭据 > 旧数据库 api_key 字段 > 可选环境变量。
"""
import os
from typing import Any

from .. import config, database
from .auth import current_user_id
from .credential_store import get_credential
from .llm_client import LLMClient, LLMError


async def get_model_config(model_id: int | None, *, user_id: int | None = None) -> dict[str, Any]:
    """取模型配置；model_id 为 None 时取默认模型。"""
    owner_id = current_user_id() if user_id is None else user_id
    if model_id is not None:
        cfg = await database.query_one("SELECT * FROM model_configs WHERE id=? AND user_id=?", (model_id, owner_id))
        if cfg is None:
            raise LLMError(f"模型配置不存在：id={model_id}")
        return cfg
    cfg = await database.query_one(
        "SELECT * FROM model_configs WHERE is_default=1 AND user_id=? LIMIT 1",
        (owner_id,),
    )
    if cfg is None:
        cfg = await database.query_one("SELECT * FROM model_configs WHERE user_id=? ORDER BY id LIMIT 1", (owner_id,))
    if cfg is None:
        raise LLMError("尚未配置任何模型，请先在模型管理页添加")
    return cfg


async def get_client(model_id: int | None = None, *, user_id: int | None = None) -> tuple[LLMClient, dict[str, Any]]:
    """返回 (LLMClient, 配置记录)。"""
    cfg = await get_model_config(model_id, user_id=user_id)
    owner_id = current_user_id() if user_id is None else user_id
    api_key = await get_credential(owner_id, f"model:{cfg['id']}") or cfg.get("api_key") or ""
    if not api_key and cfg.get("api_key_env"):
        api_key = os.getenv(cfg["api_key_env"], "")
    if not api_key:
        raise LLMError(f"模型「{cfg['name']}」未配置 API Key，请在模型管理页粘贴供应商密钥并保存。")
    client = LLMClient(
        base_url=cfg["base_url"],
        api_key=api_key,
        model=cfg["model_name"],
        temperature=cfg.get("temperature") or 0.7,
        max_tokens=cfg.get("max_tokens") or 4096,
        proxy_url=config.LLM_PROXY_URL or None,
        provider=cfg.get("provider") or "openai",
    )
    return client, cfg
