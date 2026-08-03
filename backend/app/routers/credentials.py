"""Metadata-only API for encrypted user service credentials."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..services.credential_store import (
    credential_status,
    delete_credential,
    list_credentials,
    put_credential,
)
from .auth import CurrentUser, authenticated_context

router = APIRouter(
    prefix="/api/me/credentials",
    tags=["credentials"],
    dependencies=[Depends(authenticated_context)],
)


class CredentialWrite(BaseModel):
    value: str = Field(min_length=1, max_length=20_000)
    provider: str = Field(default="", max_length=100)


@router.get("")
async def get_credentials(user: CurrentUser) -> dict[str, Any]:
    return {"items": await list_credentials(int(user["id"]))}


@router.put("/{service}")
async def save_credential(service: str, body: CredentialWrite, user: CurrentUser) -> dict[str, Any]:
    try:
        return await put_credential(int(user["id"]), service, body.value, body.provider)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete("/{service}")
async def remove_credential(service: str, user: CurrentUser) -> dict[str, bool]:
    try:
        deleted = await delete_credential(int(user["id"]), service)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not deleted:
        raise HTTPException(404, "凭据不存在")
    return {"ok": True}


@router.get("/{service}/status")
async def get_credential_status(service: str, user: CurrentUser) -> dict[str, Any]:
    try:
        return await credential_status(int(user["id"]), service)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
