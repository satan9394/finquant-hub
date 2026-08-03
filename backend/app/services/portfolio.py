"""投资组合管理：增删改查 + 使用统一多市场行情计算实时盈亏。"""
from datetime import datetime
from typing import Any, cast

import httpx

from .. import database

TENCENT_QUOTE = "https://qt.gtimg.cn/q={codes}"
_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
JSONDict = dict[str, Any]


# ------------------------------------------------------------------
# 组合 CRUD
# ------------------------------------------------------------------

async def create_portfolio(
    name: str,
    description: str = "",
    currency: str = "CNY",
    *,
    user_id: int,
) -> JSONDict:
    new_id = await database.execute(
        "INSERT INTO portfolios (name, description, currency, user_id) VALUES (?, ?, ?, ?)",
        (name, description, currency, user_id),
    )
    return cast(JSONDict, await database.query_one(
        "SELECT * FROM portfolios WHERE id=? AND user_id=?",
        (new_id, user_id),
    ))


async def list_portfolios(user_id: int) -> list[JSONDict]:
    items = await database.query_all(
        """SELECT p.*,
                  (SELECT COUNT(*) FROM positions WHERE portfolio_id=p.id AND user_id=p.user_id) AS position_count
           FROM portfolios p WHERE p.user_id=? ORDER BY p.updated_at DESC""",
        (user_id,),
    )
    return items


async def get_portfolio(portfolio_id: int, user_id: int) -> JSONDict | None:
    return await database.query_one("SELECT * FROM portfolios WHERE id=? AND user_id=?", (portfolio_id, user_id))


async def update_portfolio(portfolio_id: int, user_id: int, name: str | None = None,
                           description: str | None = None,
                           currency: str | None = None) -> JSONDict | None:
    updates: dict[str, object] = {}
    if name is not None:
        updates["name"] = name
    if description is not None:
        updates["description"] = description
    if currency is not None:
        updates["currency"] = currency
    if not updates:
        return await get_portfolio(portfolio_id, user_id)
    sets = ", ".join(f"{k}=?" for k in updates)
    updates["updated_at"] = datetime.now().isoformat()
    await database.execute(
        f"UPDATE portfolios SET {sets}, updated_at=? WHERE id=? AND user_id=?",
        (*updates.values(), portfolio_id, user_id),
    )
    return await get_portfolio(portfolio_id, user_id)


async def delete_portfolio(portfolio_id: int, user_id: int) -> bool:
    p = await get_portfolio(portfolio_id, user_id)
    if not p:
        return False
    await database.execute("DELETE FROM positions WHERE portfolio_id=? AND user_id=?", (portfolio_id, user_id))
    await database.execute("DELETE FROM portfolios WHERE id=? AND user_id=?", (portfolio_id, user_id))
    return True


# ------------------------------------------------------------------
# 持仓 CRUD
# ------------------------------------------------------------------

async def add_position(portfolio_id: int, ticker: str, shares: float,
                       avg_cost: float, name: str = "", currency: str = "", *, user_id: int) -> JSONDict:
    if not currency:
        portfolio = await get_portfolio(portfolio_id, user_id)
        currency = portfolio["currency"] if portfolio else "CNY"
    new_id = await database.execute(
        "INSERT INTO positions (portfolio_id, ticker, name, shares, avg_cost, currency, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (portfolio_id, ticker.upper(), name, shares, avg_cost, currency, user_id),
    )
    await database.execute(
        "UPDATE portfolios SET updated_at=datetime('now') WHERE id=? AND user_id=?", (portfolio_id, user_id)
    )
    return cast(JSONDict, await database.query_one(
        "SELECT * FROM positions WHERE id=? AND user_id=?",
        (new_id, user_id),
    ))


async def list_positions(portfolio_id: int, user_id: int) -> list[JSONDict]:
    return await database.query_all(
        "SELECT * FROM positions WHERE portfolio_id=? AND user_id=? ORDER BY ticker", (portfolio_id, user_id)
    )


async def update_position(position_id: int, user_id: int, shares: float | None = None,
                          avg_cost: float | None = None) -> JSONDict | None:
    updates: dict[str, object] = {}
    if shares is not None:
        updates["shares"] = shares
    if avg_cost is not None:
        updates["avg_cost"] = avg_cost
    if not updates:
        return await database.query_one("SELECT * FROM positions WHERE id=? AND user_id=?", (position_id, user_id))
    sets = ", ".join(f"{k}=?" for k in updates)
    updates["updated_at"] = datetime.now().isoformat()
    await database.execute(
        f"UPDATE positions SET {sets}, updated_at=? WHERE id=? AND user_id=?",
        (*updates.values(), position_id, user_id),
    )
    return await database.query_one("SELECT * FROM positions WHERE id=? AND user_id=?", (position_id, user_id))


async def delete_position(position_id: int, user_id: int) -> bool:
    pos = await database.query_one("SELECT * FROM positions WHERE id=? AND user_id=?", (position_id, user_id))
    if not pos:
        return False
    await database.execute("DELETE FROM positions WHERE id=? AND user_id=?", (position_id, user_id))
    await database.execute(
        "UPDATE portfolios SET updated_at=datetime('now') WHERE id=? AND user_id=?", (pos["portfolio_id"], user_id)
    )
    return True


# ------------------------------------------------------------------
# 实时盈亏计算
# ------------------------------------------------------------------

async def calc_pnl(portfolio_id: int, user_id: int, market_service: Any = None) -> JSONDict:
    """计算组合实时盈亏，返回汇总 + 逐持仓明细。"""
    positions = await list_positions(portfolio_id, user_id)
    if not positions:
        return {"total_cost": 0, "total_market_value": 0, "total_pnl": 0, "total_pnl_pct": 0, "positions": []}

    # Reuse the same multi-market service as the quote pages.  The former
    # Tencent-only path silently priced HK/US holdings at cost and hid PnL.
    # 延迟导入避免循环依赖。
    from .market_data import MarketDataService, normalize_code

    owns_market_service = market_service is None
    market_service = market_service or MarketDataService()
    try:
        fetched_quotes = await market_service.quotes([p["ticker"] for p in positions])
    finally:
        if owns_market_service:
            await market_service.aclose()
    quotes = {quote["code"]: quote for quote in fetched_quotes}

    total_cost = 0.0
    total_market = 0.0
    details: list[JSONDict] = []

    for p in positions:
        cost = p["shares"] * p["avg_cost"]
        market_value = 0.0
        current_price = 0.0
        change_pct = 0.0

        try:
            quote_code = normalize_code(p["ticker"])
        except ValueError:
            quote_code = p["ticker"]
        q = quotes.get(quote_code)
        if q:
            current_price = q["price"]
            market_value = p["shares"] * current_price
            change_pct = q.get("change_percent", 0.0)
        else:
            market_value = cost  # 无行情时按成本计
            current_price = p["avg_cost"]

        pnl = market_value - cost
        pnl_pct = (pnl / cost * 100) if cost != 0 else 0.0

        total_cost += cost
        total_market += market_value

        details.append({
            "id": p["id"],
            "ticker": p["ticker"],
            # A position can be recorded with its ticker alone.  Reuse the
            # verified quote name so the UI stays useful without manual input.
            "name": p["name"] or (q or {}).get("name") or p["ticker"],
            "shares": p["shares"],
            "avg_cost": p["avg_cost"],
            "current_price": current_price,
            "cost": round(cost, 2),
            "market_value": round(market_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "change_pct": change_pct,
        })

    total_pnl = total_market - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost != 0 else 0.0

    return {
        "total_cost": round(total_cost, 2),
        "total_market_value": round(total_market, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl_pct, 2),
        "positions": details,
    }
