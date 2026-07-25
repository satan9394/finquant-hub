"""WorldQuant Alpha 因子搜索 API。"""
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from ..services import alpha_service

router = APIRouter(prefix="/api/wq", tags=["wq"])


class CorrelationIn(BaseModel):
    series_a: list[float] = Field(min_length=3, description="序列A")
    series_b: list[float] = Field(min_length=3, description="序列B")


@router.get("/search")
async def search_alpha(q: str = Query(default="", description="搜索关键词，支持中英文")):
    """搜索 Alpha 因子库，返回匹配的因子列表。"""
    results = alpha_service.search_alpha(q, max_results=20)
    return {"items": results, "total": len(results)}


@router.get("/categories")
async def list_categories():
    """返回按类别组织的 Alpha 因子概览。"""
    return {"items": alpha_service.list_categories()}


@router.get("/fields")
async def list_custom_fields():
    """返回自定义/中文名称字段映射。"""
    from ..services.alpha_service import _CUSTOM_FIELDS
    items = [{"name": cn, "field": info["field"], "desc": info["desc"]}
             for cn, info in _CUSTOM_FIELDS.items()]
    return {"items": items}


@router.post("/correlation")
async def calc_correlation(body: CorrelationIn):
    """计算两个序列的 Pearson 相关系数。"""
    result = alpha_service.calc_correlation(body.series_a, body.series_b)
    return result


@router.get("/help")
async def wq_help():
    """WorldQuant Alpha 使用说明。"""
    return {"help": alpha_service._WQ_BASE_HELP}
