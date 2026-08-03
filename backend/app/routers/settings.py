"""Safe, allowlisted system settings exposed to the local UI."""
from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import Any, Self

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator, model_validator

from .. import config
from .. import database
from ..services.cron import CronExpression
from ..services.market_data import normalize_code
from ..services.research_jobs import create_research_job, get_research_job, list_research_jobs, update_research_job
from ..services.scheduler import run_research_job, scheduler_loop
from ..services.system_settings import current_system_settings, save_system_settings
from .auth import CurrentUser, authenticated_context


router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(authenticated_context)])


class SystemSettingsUpdate(BaseModel):
    scheduler_enabled: bool | None = None
    scheduler_concurrency: int | None = Field(default=None, ge=1, le=20)
    scheduler_max_targets: int | None = Field(default=None, ge=1, le=1000)
    scheduler_hour: int | None = Field(default=None, ge=0, le=23)
    scheduler_minute: int | None = Field(default=None, ge=0, le=59)

    @model_validator(mode="after")
    def require_update(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("至少提交一个系统配置")
        return self


class ScheduledResearchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    ticker: str = Field(min_length=1, max_length=30)
    company_name: str = Field(default="", max_length=120)
    cron_expr: str = Field(min_length=9, max_length=100)
    model_id: int | None = Field(default=None, ge=1)
    is_enabled: bool = True

    @field_validator("cron_expr")
    @classmethod
    def valid_cron(cls, value: str) -> str:
        return CronExpression.parse(value).raw


class ScheduledResearchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    ticker: str | None = Field(default=None, min_length=1, max_length=30)
    company_name: str | None = Field(default=None, max_length=120)
    cron_expr: str | None = Field(default=None, min_length=9, max_length=100)
    model_id: int | None = Field(default=None, ge=1)
    is_enabled: bool | None = None

    @field_validator("cron_expr")
    @classmethod
    def valid_cron(cls, value: str | None) -> str | None:
        return CronExpression.parse(value).raw if value is not None else None

    @model_validator(mode="after")
    def require_update(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("至少提交一个定时任务配置")
        return self


def _response() -> dict[str, Any]:
    return {
        "settings": current_system_settings(),
        "metadata": {
            "app_version": config.APP_VERSION,
            "editable_keys": [
                "scheduler_enabled", "scheduler_concurrency", "scheduler_max_targets",
                "scheduler_hour", "scheduler_minute",
            ],
            "secrets_exposed": False,
        },
    }


@router.get("/system")
async def get_system_settings(_user: CurrentUser) -> dict[str, Any]:
    return _response()


@router.patch("/system")
async def update_system_settings(body: SystemSettingsUpdate, request: Request, user: CurrentUser) -> dict[str, Any]:
    if not user["is_admin"]:
        raise HTTPException(403, "仅管理员可修改系统设置")
    values = body.model_dump(exclude_none=True)
    await save_system_settings(values)

    current_task = getattr(request.app.state, "scheduler_task", None)
    if current_task is not None:
        current_task.cancel()
        with suppress(asyncio.CancelledError):
            await current_task
    request.app.state.scheduler_task = (
        asyncio.create_task(scheduler_loop(request.app.state.market), name="post-market-scheduler")
        if config.SCHEDULER_ENABLED
        else None
    )
    return _response()


@router.get("/research-jobs")
async def get_scheduled_research_jobs(user: CurrentUser) -> dict[str, Any]:
    return {"items": await list_research_jobs(int(user["id"]))}


@router.post("/research-jobs", status_code=status.HTTP_201_CREATED)
async def create_scheduled_research_job(body: ScheduledResearchCreate, user: CurrentUser) -> dict[str, Any]:
    try:
        ticker = normalize_code(body.ticker)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return await create_research_job(
        **body.model_dump(exclude={"ticker", "company_name"}),
        ticker=ticker,
        company_name=body.company_name.strip() or ticker,
        user_id=int(user["id"]),
    )


@router.patch("/research-jobs/{job_id:int}")
async def patch_scheduled_research_job(
    job_id: int,
    body: ScheduledResearchUpdate,
    user: CurrentUser,
) -> dict[str, Any]:
    updates = body.model_dump(exclude_unset=True)
    if "ticker" in updates:
        try:
            updates["ticker"] = normalize_code(updates["ticker"])
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    job = await update_research_job(job_id, updates, int(user["id"]))
    if job is None:
        raise HTTPException(404, f"定时研究任务不存在：id={job_id}")
    return job


@router.delete("/research-jobs/{job_id:int}")
async def delete_scheduled_research_job(job_id: int, user: CurrentUser) -> dict[str, bool]:
    user_id = int(user["id"])
    if await get_research_job(job_id, user_id) is None:
        raise HTTPException(404, f"定时研究任务不存在：id={job_id}")
    await database.execute("DELETE FROM scheduled_research_jobs WHERE id=? AND user_id=?", (job_id, user_id))
    return {"ok": True}


@router.post("/research-jobs/{job_id:int}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_scheduled_research_job(
    job_id: int,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
) -> dict[str, Any]:
    user_id = int(user["id"])
    job = await get_research_job(job_id, user_id)
    if job is None:
        raise HTTPException(404, f"定时研究任务不存在：id={job_id}")
    if job["last_status"] == "running":
        raise HTTPException(409, "定时研究任务正在运行")
    await database.execute(
        "UPDATE scheduled_research_jobs SET last_status='queued', last_error=NULL, updated_at=datetime('now') "
        "WHERE id=? AND user_id=?",
        (job_id, user_id),
    )
    background_tasks.add_task(run_research_job, job_id, user_id)
    return {"id": job_id, "status": "queued"}
