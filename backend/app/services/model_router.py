"""模型路由：按 ID / 默认配置解析出可调用的 LLMClient。

API Key 解析优先级：数据库 api_key 字段 > 环境变量（api_key_env 指定的变量名）。
"""
import os

from .. import database
from .llm_client import LLMClient, LLMError


async def get_model_config(model_id: int | None) -> dict:
    """取模型配置；model_id 为 None 时取默认模型。"""
    if model_id is not None:
        cfg = await database.query_one("SELECT * FROM model_configs WHERE id=?", (model_id,))
        if cfg is None:
            raise LLMError(f"模型配置不存在：id={model_id}")
        return cfg
    cfg = await database.query_one("SELECT * FROM model_configs WHERE is_default=1 LIMIT 1")
    if cfg is None:
        cfg = await database.query_one("SELECT * FROM model_configs ORDER BY id LIMIT 1")
    if cfg is None:
        raise LLMError("尚未配置任何模型，请先在模型管理页添加")
    return cfg


async def get_client(model_id: int | None = None) -> tuple[LLMClient, dict]:
    """返回 (LLMClient, 配置记录)。"""
    cfg = await get_model_config(model_id)
    api_key = cfg.get("api_key") or ""
    if not api_key and cfg.get("api_key_env"):
        api_key = os.getenv(cfg["api_key_env"], "")
    if not api_key:
        raise LLMError(f"模型「{cfg['name']}」未配置 API Key（数据库字段与环境变量 {cfg.get('api_key_env') or '-'} 均为空）")
    client = LLMClient(
        base_url=cfg["base_url"],
        api_key=api_key,
        model=cfg["model_name"],
        temperature=cfg.get("temperature") or 0.7,
        max_tokens=cfg.get("max_tokens") or 4096,
    )
    return client, cfg
