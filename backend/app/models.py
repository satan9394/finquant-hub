"""Pydantic 请求模型（响应直接用 dict，见 API_CONTRACT.md）。"""
from pydantic import BaseModel, Field


class ModelConfigIn(BaseModel):
    name: str
    provider: str = "openai"
    base_url: str
    model_name: str
    api_key: str | None = None
    api_key_env: str | None = None
    temperature: float = 0.7
    max_tokens: int = 4096


class ModelConfigUpdate(BaseModel):
    name: str | None = None
    provider: str | None = None
    base_url: str | None = None
    model_name: str | None = None
    api_key: str | None = None
    api_key_env: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None


class AgentPresetIn(BaseModel):
    name: str
    role_key: str
    avatar: str = "🤖"
    system_prompt: str
    model_id: int | None = None


class AgentPresetUpdate(BaseModel):
    name: str | None = None
    avatar: str | None = None
    system_prompt: str | None = None
    model_id: int | None = None


class SessionCreate(BaseModel):
    title: str | None = None
    role_preset: str | None = None
    model_id: int | None = None


class SessionUpdate(BaseModel):
    title: str | None = None
    role_preset: str | None = None
    model_id: int | None = None
    status: str | None = None


class MessageIn(BaseModel):
    content: str = Field(min_length=1)


class RoomCreate(BaseModel):
    topic: str = Field(min_length=2)
    role_keys: list[str] = Field(min_length=3, max_length=6)
    total_rounds: int = Field(default=3, ge=1, le=5)
    model_id: int | None = None
