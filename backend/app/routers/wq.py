"""WorldQuant Alpha factor research and optional BRAIN bridge API."""
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..services import alpha_service
from ..services.alpha_simulator import simulate_factor
from ..services.alpha_templates import generate_factor_templates
from ..services.alpha_brain import AlphaBrainClient, AlphaBrainError

router = APIRouter(prefix="/api/wq", tags=["wq"])


class CorrelationIn(BaseModel):
    series_a: list[float] = Field(min_length=3, description="序列A")
    series_b: list[float] = Field(min_length=3, description="序列B")


class FactorObservation(BaseModel):
    date: str
    symbol: str
    factor: float
    forward_return: float


class FactorSimulationIn(BaseModel):
    observations: list[FactorObservation] = Field(min_length=2)
    quantile: float = Field(default=0.2, gt=0, le=0.5)
    periods_per_year: int = Field(default=252, ge=1, le=366)


class BrainSimulationIn(BaseModel):
    expression: str = Field(min_length=1, max_length=10_000)
    settings: dict[str, Any] | None = None
    confirm: bool = Field(default=False, description="显式确认向 WorldQuant BRAIN 提交模拟")


async def _run_brain(
    operation: Callable[[AlphaBrainClient], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    try:
        async with AlphaBrainClient() as client:
            await client.authenticate()
            return await operation(client)
    except AlphaBrainError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/search")
async def search_alpha(
    q: str = Query(default="", description="搜索关键词，支持中英文"),
    max_results: int = Query(default=10, ge=1, le=100, description="最大返回数量"),
) -> dict[str, Any]:
    """搜索 Alpha 因子库，返回匹配的因子列表。"""
    results = alpha_service.search_alpha(q, max_results=max_results)
    return {"items": results, "total": len(results)}


@router.get("/categories")
async def list_categories() -> dict[str, Any]:
    """返回按类别组织的 Alpha 因子概览。"""
    return {"items": alpha_service.list_categories()}


@router.get("/fields")
async def list_custom_fields() -> dict[str, Any]:
    """返回项目实际打包的 WorldQuant 字段目录。"""
    items = alpha_service.list_fields()
    return {"items": items, "total": len(items)}


@router.get("/templates")
async def list_factor_templates() -> dict[str, Any]:
    """Generate usable templates from fields that exist in the bundled catalogue."""
    items = generate_factor_templates()
    return {"items": items, "total": len(items)}


@router.post("/simulate/local")
async def simulate_factor_locally(body: FactorSimulationIn) -> dict[str, Any]:
    """Run a deterministic, API-free long/short factor simulation."""
    return simulate_factor(
        [item.model_dump() for item in body.observations],
        quantile=body.quantile,
        periods_per_year=body.periods_per_year,
    )


@router.post("/brain/simulations", status_code=202)
async def create_brain_simulation(body: BrainSimulationIn) -> dict[str, Any]:
    """Submit a remote BRAIN simulation only after explicit confirmation."""
    if not body.confirm:
        raise HTTPException(409, "提交远端模拟前必须显式设置 confirm=true")

    async def create(client: AlphaBrainClient) -> dict[str, Any]:
        return await client.create_simulation(body.expression, settings=body.settings)

    return await _run_brain(create)


@router.get("/brain/simulations/{simulation_id}")
async def get_brain_simulation(simulation_id: str) -> dict[str, Any]:
    async def get(client: AlphaBrainClient) -> dict[str, Any]:
        return await client.get_simulation(simulation_id)

    return await _run_brain(get)


@router.get("/brain/alphas/{alpha_id}")
async def get_brain_alpha(alpha_id: str) -> dict[str, Any]:
    async def get(client: AlphaBrainClient) -> dict[str, Any]:
        return await client.get_alpha(alpha_id)

    return await _run_brain(get)


@router.post("/correlation")
async def calc_correlation(body: CorrelationIn) -> dict[str, Any]:
    """计算两个序列的 Pearson 相关系数。"""
    result = alpha_service.calc_correlation(body.series_a, body.series_b)
    return result


@router.get("/help")
async def wq_help() -> dict[str, str]:
    """WorldQuant Alpha 使用说明。"""
    return {"help": alpha_service._WQ_BASE_HELP}
