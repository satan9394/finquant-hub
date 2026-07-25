"""投资组合管理：增删改查 + 实时盈亏计算。

组合数据存储在 SQLite，盈亏通过腾讯实时行情计算。
"""
from dataclasses import dataclass
from datetime import datetime

import httpx

from .. import database
from ..services.llm_client import LLMError

TENCENT_QUOTE = "https://qt.gtimg.cn/q={codes}"
_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

# 建表 SQL（由导入时自动执行）
PORTFOLIO_SCHEMA = """
CREATE TABLE IF NOT EXISTS portfolios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT DEFAULT '',
    currency      TEXT DEFAULT 'CNY',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS positions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id    INTEGER NOT NULL,
    ticker          TEXT NOT NULL,
    name            TEXT DEFAULT '',
    shares          REAL NOT NULL,
    avg_cost        REAL NOT NULL,
    currency        TEXT DEFAULT 'CNY',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
);
"""


async def ensure_tables():
    """确保组合相关表存在。"""
    await database.get_db().executescript(PORTFOLIO_SCHEMA)
    await database.get_db().commit()


# ------------------------------------------------------------------
# 组合 CRUD
# ------------------------------------------------------------------

async def create_portfolio(name: str, description: str = "", currency: str = "CNY") -> dict:
    await ensure_tables()
    new_id = await database.execute(
        "INSERT INTO portfolios (name, description, currency) VALUES (?, ?, ?)",
        (name, description, currency),
    )
    return await database.query_one("SELECT * FROM portfolios WHERE id=?", (new_id,))


async def list_portfolios() -> list[dict]:
    await ensure_tables()
    items = await database.query_all(
        """SELECT p.*,
                  (SELECT COUNT(*) FROM positions WHERE portfolio_id=p.id) AS position_count
           FROM portfolios p ORDER BY p.updated_at DESC"""
    )
    return items


async def get_portfolio(portfolio_id: int) -> dict | None:
    return await database.query_one("SELECT * FROM portfolios WHERE id=?", (portfolio_id,))


async def update_portfolio(portfolio_id: int, name: str | None = None,
                           description: str | None = None,
                           currency: str | None = None) -> dict | None:
    updates = {}
    if name is not None:
        updates["name"] = name
    if description is not None:
        updates["description"] = description
    if currency is not None:
        updates["currency"] = currency
    if not updates:
        return await get_portfolio(portfolio_id)
    sets = ", ".join(f"{k}=?" for k in updates)
    updates["updated_at"] = datetime.now().isoformat()
    await database.execute(
        f"UPDATE portfolios SET {sets}, updated_at=? WHERE id=?",
        (*updates.values(), portfolio_id),
    )
    return await get_portfolio(portfolio_id)


async def delete_portfolio(portfolio_id: int) -> bool:
    p = await get_portfolio(portfolio_id)
    if not p:
        return False
    await database.execute("DELETE FROM positions WHERE portfolio_id=?", (portfolio_id,))
    await database.execute("DELETE FROM portfolios WHERE id=?", (portfolio_id,))
    return True


# ------------------------------------------------------------------
# 持仓 CRUD
# ------------------------------------------------------------------

async def add_position(portfolio_id: int, ticker: str, shares: float,
                       avg_cost: float, name: str = "", currency: str = "") -> dict:
    await ensure_tables()
    if not currency:
        portfolio = await get_portfolio(portfolio_id)
        currency = portfolio["currency"] if portfolio else "CNY"
    new_id = await database.execute(
        "INSERT INTO positions (portfolio_id, ticker, name, shares, avg_cost, currency) VALUES (?, ?, ?, ?, ?, ?)",
        (portfolio_id, ticker.upper(), name, shares, avg_cost, currency),
    )
    await database.execute(
        "UPDATE portfolios SET updated_at=datetime('now') WHERE id=?", (portfolio_id,)
    )
    return await database.query_one("SELECT * FROM positions WHERE id=?", (new_id,))


async def list_positions(portfolio_id: int) -> list[dict]:
    return await database.query_all(
        "SELECT * FROM positions WHERE portfolio_id=? ORDER BY ticker", (portfolio_id,)
    )


async def update_position(position_id: int, shares: float | None = None,
                          avg_cost: float | None = None) -> dict | None:
    updates = {}
    if shares is not None:
        updates["shares"] = shares
    if avg_cost is not None:
        updates["avg_cost"] = avg_cost
    if not updates:
        return await database.query_one("SELECT * FROM positions WHERE id=?", (position_id,))
    sets = ", ".join(f"{k}=?" for k in updates)
    updates["updated_at"] = datetime.now().isoformat()
    await database.execute(
        f"UPDATE positions SET {sets}, updated_at=? WHERE id=?",
        (*updates.values(), position_id),
    )
    return await database.query_one("SELECT * FROM positions WHERE id=?", (position_id,))


async def delete_position(position_id: int) -> bool:
    pos = await database.query_one("SELECT * FROM positions WHERE id=?", (position_id,))
    if not pos:
        return False
    await database.execute("DELETE FROM positions WHERE id=?", (position_id,))
    await database.execute(
        "UPDATE portfolios SET updated_at=datetime('now') WHERE id=?", (pos["portfolio_id"],)
    )
    return True


# ------------------------------------------------------------------
# 实时盈亏计算
# ------------------------------------------------------------------

async def calc_pnl(portfolio_id: int) -> dict:
    """计算组合实时盈亏，返回汇总 + 逐持仓明细。"""
    positions = await list_positions(portfolio_id)
    if not positions:
        return {"total_cost": 0, "total_market_value": 0, "total_pnl": 0, "total_pnl_pct": 0, "positions": []}

    codes = ",".join(_tencent_code(p["ticker"]) for p in positions)
    quotes = {}
    if codes:
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, trust_env=False) as http:
                resp = await http.get(TENCENT_QUOTE.format(codes=codes))
                quotes = _parse_tencent_map(resp.content.decode("gbk", "replace"))
        except httpx.HTTPError:
            pass

    total_cost = 0.0
    total_market = 0.0
    details = []

    for p in positions:
        cost = p["shares"] * p["avg_cost"]
        market_value = 0.0
        current_price = 0.0
        change_pct = 0.0

        q = quotes.get(p["ticker"].lower())
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
            "name": p["name"],
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


def _tencent_code(ticker: str) -> str:
    """将 ticker 转为腾讯行情 code 格式。"""
    t = ticker.lower().strip()
    if t.startswith(("sh", "sz", "hk", "us")):
        return t
    # A 股 6 位
    if len(t) == 6 and t.isdigit():
        prefix = "sh" if t.startswith(("6", "68")) else "sz"
        return prefix + t
    # 港股 4-5 位
    if t.isdigit() and 4 <= len(t) <= 5:
        return "hk" + t
    return t


def _parse_tencent_map(raw: str) -> dict[str, dict]:
    import re
    result = {}
    pattern = re.compile(r'^v_(sh|sz|hk|us)(\w+)="(.*)";?\s*$', re.M)
    for m in pattern.finditer(raw):
        market, scode, payload = m.group(1), m.group(2), m.group(3)
        f = payload.split("~")
        if len(f) < 50:
            continue

        def num(i: int, default=0.0) -> float:
            try:
                v = float(f[i])
                return v if v == v else default
            except (ValueError, IndexError):
                return default

        price, last_close = num(3), num(4)
        change = num(31) or round(price - last_close, 3)
        k = f"{market}{scode}"
        result[k] = {
            "price": price,
            "last_close": last_close,
            "change_percent": num(32),
            "change": change,
            "high": num(33),
            "low": num(34),
            "volume": num(6),
        }
    return result
