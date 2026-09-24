"""WorldQuant Alpha factor research and optional BRAIN bridge API."""
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from copy import deepcopy
import threading
import time
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from ..services import alpha_service, auth as auth_service
from ..services.alpha_analytics import analyze_factor_observations
from ..services.alpha_simulator import simulate_factor
from ..services.alpha_templates import generate_factor_templates
from ..services.alpha_brain import AlphaBrainClient, AlphaBrainError

router = APIRouter(prefix="/api/wq", tags=["wq"])
_FACTOR_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"
_ANALYTICS_CACHE_TTL_SECONDS = 60 * 60
_ANALYTICS_CACHE_MAX_ENTRIES = 128


class _FactorAnalyticsCache:
    """Bounded per-user cache of derived analytics; raw observations are never retained."""

    def __init__(self, *, ttl_seconds: int, max_entries: int) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._items: OrderedDict[tuple[int, str], tuple[float, dict[str, Any]]] = OrderedDict()
        self._lock = threading.RLock()

    def _prune(self, now: float) -> None:
        expired = [key for key, (expires_at, _) in self._items.items() if expires_at <= now]
        for key in expired:
            self._items.pop(key, None)

    def put(self, user_id: int, factor_id: str, result: dict[str, Any]) -> None:
        now = time.monotonic()
        key = (user_id, factor_id)
        with self._lock:
            self._prune(now)
            self._items.pop(key, None)
            self._items[key] = (now + self._ttl_seconds, deepcopy(result))
            while len(self._items) > self._max_entries:
                self._items.popitem(last=False)

    def get(self, user_id: int, factor_id: str) -> tuple[dict[str, Any], int] | None:
        now = time.monotonic()
        key = (user_id, factor_id)
        with self._lock:
            self._prune(now)
            cached = self._items.get(key)
            if cached is None:
                return None
            expires_at, result = cached
            self._items.move_to_end(key)
            return deepcopy(result), max(0, int(expires_at - now))


_FACTOR_ANALYTICS_CACHE = _FactorAnalyticsCache(
    ttl_seconds=_ANALYTICS_CACHE_TTL_SECONDS,
    max_entries=_ANALYTICS_CACHE_MAX_ENTRIES,
)


def _catalogue_response(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "items": items,
        "total": len(items),
        "catalogue": alpha_service.catalogue_metadata(),
    }


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
    return _catalogue_response(results)


@router.get("/categories")
async def list_categories() -> dict[str, Any]:
    """返回按类别组织的 Alpha 因子概览。"""
    return _catalogue_response(alpha_service.list_categories())


@router.get("/fields")
async def list_custom_fields() -> dict[str, Any]:
    """返回项目实际打包的 WorldQuant 字段目录。"""
    items = alpha_service.list_fields()
    return _catalogue_response(items)


@router.get("/templates")
async def list_factor_templates() -> dict[str, Any]:
    """Generate usable templates from fields that exist in the bundled catalogue."""
    items = generate_factor_templates()
    return _catalogue_response(items)


@router.post("/simulate/local")
async def simulate_factor_locally(body: FactorSimulationIn) -> dict[str, Any]:
    """Run a deterministic, API-free long/short factor simulation."""
    return simulate_factor(
        [item.model_dump() for item in body.observations],
        quantile=body.quantile,
        periods_per_year=body.periods_per_year,
    )


@router.post("/factors/{factor_id}/analytics")
async def submit_factor_analytics(
    factor_id: Annotated[str, Path(min_length=1, max_length=128, pattern=_FACTOR_ID_PATTERN)],
    body: FactorSimulationIn,
) -> dict[str, Any]:
    """Analyze explicitly supplied observations and cache only the derived result for one hour."""
    if len(body.observations) > 10_000:
        raise HTTPException(status_code=413, detail="单次因子分析最多接收 10,000 条观察记录")
    try:
        result = analyze_factor_observations([item.model_dump() for item in body.observations])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result.update({
        "factor_id": factor_id,
        "source": "user_supplied_observations",
        "observation_count": len(body.observations),
        "factor_autocorrelation_method": "mean_spearman_rank_on_shared_symbols_across_consecutive_valid_dates",
    })
    _FACTOR_ANALYTICS_CACHE.put(auth_service.current_user_id(), factor_id, result)
    return {"factor_id": factor_id, "status": result["status"], "cache_ttl_seconds": _ANALYTICS_CACHE_TTL_SECONDS}


@router.get("/factors/{factor_id}/analytics")
async def get_factor_analytics(
    factor_id: Annotated[str, Path(min_length=1, max_length=128, pattern=_FACTOR_ID_PATTERN)],
) -> dict[str, Any]:
    """Return the authenticated user's latest derived analytics for this factor ID."""
    cached = _FACTOR_ANALYTICS_CACHE.get(auth_service.current_user_id(), factor_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="分析不存在或已过期；请重新提交该因子的观察数据")
    result, ttl_seconds = cached
    result["cache_ttl_seconds"] = ttl_seconds
    return result


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
