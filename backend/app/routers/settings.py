"""Safe, allowlisted system settings exposed to the local UI."""
from __future__ import annotations

import asyncio
import secrets
from contextlib import suppress
from typing import Any, Literal, Self

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .. import config
from .. import database
from ..services.cron import CronExpression
from ..services.market_data import normalize_code
from ..services.product_metrics import (
    clear_product_metrics,
    get_product_metrics,
    record_product_metric,
    set_product_metrics_enabled,
)
from ..services.research_jobs import (
    create_research_job, get_research_job, list_research_jobs, list_research_runs,
    recover_stale_research_runs, update_research_job,
)
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


class ProductMetricsPreferenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


class ProductMetricEventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_name: Literal[
        "first_value", "result_saved", "workflow_continued", "repeat_research",
    ]
    value: int | None = Field(default=None, ge=0, le=86_400_000)


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


@router.get("/product-metrics")
async def read_product_metrics(user: CurrentUser) -> dict[str, Any]:
    return await get_product_metrics(int(user["id"]))


@router.patch("/product-metrics")
async def update_product_metrics_preference(
    body: ProductMetricsPreferenceInput,
    user: CurrentUser,
) -> dict[str, Any]:
    user_id = int(user["id"])
    await set_product_metrics_enabled(user_id, body.enabled)
    return await get_product_metrics(user_id)


@router.post("/product-metrics/events", status_code=status.HTTP_202_ACCEPTED)
async def add_product_metric_event(
    body: ProductMetricEventInput,
    user: CurrentUser,
) -> dict[str, bool]:
    try:
        recorded = await record_product_metric(
            int(user["id"]), body.event_name, value=body.value,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"recorded": recorded}


@router.delete("/product-metrics/events")
async def delete_product_metric_events(user: CurrentUser) -> dict[str, int]:
    return {"deleted": await clear_product_metrics(int(user["id"]))}


@router.get("/research-jobs")
async def get_scheduled_research_jobs(user: CurrentUser) -> dict[str, Any]:
    return {"items": await list_research_jobs(int(user["id"]))}


@router.get("/research-jobs/{job_id:int}/runs")
async def get_scheduled_research_runs(job_id: int, user: CurrentUser) -> dict[str, Any]:
    try:
        items = await list_research_runs(job_id, int(user["id"]))
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"items": items, "total": len(items)}


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
    run = await database.query_one(
        "SELECT id FROM scheduled_research_runs WHERE job_id=? AND user_id=? LIMIT 1",
        (job_id, user_id),
    )
    if run is not None:
        raise HTTPException(409, "定时研究任务已有运行历史，请停用而不是删除")
    await database.execute("DELETE FROM scheduled_research_jobs WHERE id=? AND user_id=?", (job_id, user_id))
    return {"ok": True}


@router.post("/research-jobs/{job_id:int}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_scheduled_research_job(
    job_id: int,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
) -> dict[str, Any]:
    user_id = int(user["id"])
    await recover_stale_research_runs(user_id=user_id)
    job = await get_research_job(job_id, user_id)
    if job is None:
        raise HTTPException(404, f"定时研究任务不存在：id={job_id}")
    # 快路径预检（避免无谓写库）：running/queued 直接拒绝。
    # 真正的竞态防护在下方带旧状态条件的原子 UPDATE——
    # 并发两请求都读到 idle 时，先到者 rowcount=1，后到者 rowcount=0 → 409，
    # 不会再出现"读后无条件写 queued"把他人刚认领的 running 覆盖回 queued 的窗口。
    if job["last_status"] in {"running", "queued"}:
        raise HTTPException(409, "定时研究任务正在运行或排队中")
    idempotency_key = secrets.token_hex(32)
    db = database.get_db()
    cursor = await db.execute(
        "UPDATE scheduled_research_jobs SET last_status='queued', last_error=NULL, "
        "pending_idempotency_key=?, updated_at=datetime('now') "
        "WHERE id=? AND user_id=? AND last_status NOT IN ('running', 'queued')",
        (idempotency_key, job_id, user_id),
    )
    await db.commit()
    if cursor.rowcount != 1:
        raise HTTPException(409, "定时研究任务正在运行或排队中")
    background_tasks.add_task(run_research_job, job_id, user_id, idempotency_key)
    return {"id": job_id, "status": "queued", "idempotency_key": idempotency_key}
