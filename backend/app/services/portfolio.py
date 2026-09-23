"""投资组合管理与严格分离的模拟组合账本。"""
import asyncio
import hashlib
import json
from datetime import datetime
from typing import Any, cast

import httpx

from .. import database

TENCENT_QUOTE = "https://qt.gtimg.cn/q={codes}"
_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
JSONDict = dict[str, Any]
PAPER_ACCOUNT_KIND = "PAPER"
PAPER_EXECUTION_KIND = "SIMULATED"
PAPER_CURRENCIES = {"CNY", "HKD", "USD"}
_PAPER_LEDGER_LOCK = asyncio.Lock()
_PAPER_REVIEW_LOCK = asyncio.Lock()


class PaperPortfolioError(ValueError):
    """A deterministic paper-ledger boundary was rejected."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _paper_capabilities() -> JSONDict:
    return {
        "real_account": False,
        "real_orders": False,
        "automatic_trading": False,
        "simulated_ledger": True,
    }


def _paper_response(row: JSONDict) -> JSONDict:
    return {
        **row,
        "account_kind": PAPER_ACCOUNT_KIND,
        "execution_kind": PAPER_EXECUTION_KIND,
        "capabilities": _paper_capabilities(),
    }


def _currency(value: str) -> str:
    normalized = value.strip().upper()
    if normalized not in PAPER_CURRENCIES:
        raise PaperPortfolioError("UNSUPPORTED_CURRENCY", "币种仅支持 CNY、HKD 或 USD")
    return normalized


async def create_paper_portfolio(
    *, user_id: int, name: str, base_currency: str, initial_cash: float,
) -> JSONDict:
    clean_name = name.strip()
    if not clean_name:
        raise PaperPortfolioError("INVALID_NAME", "模拟组合名称不能为空")
    if initial_cash <= 0:
        raise PaperPortfolioError("INVALID_INITIAL_CASH", "初始模拟现金必须大于 0")
    portfolio_id = await database.execute(
        "INSERT INTO paper_portfolios(user_id, name, base_currency, initial_cash) VALUES (?, ?, ?, ?)",
        (user_id, clean_name, _currency(base_currency), initial_cash),
    )
    row = await get_paper_portfolio(portfolio_id, user_id)
    assert row is not None
    return row


async def get_paper_portfolio(portfolio_id: int, user_id: int) -> JSONDict | None:
    row = await database.query_one(
        "SELECT * FROM paper_portfolios WHERE id=? AND user_id=?",
        (portfolio_id, user_id),
    )
    if row is None:
        return None
    return _paper_response(row)


async def list_paper_portfolios(user_id: int) -> list[JSONDict]:
    rows = await database.query_all(
        "SELECT p.*, (SELECT COUNT(*) FROM paper_portfolio_ledger l "
        "WHERE l.user_id=p.user_id AND l.portfolio_id=p.id) AS ledger_count "
        "FROM paper_portfolios p WHERE p.user_id=? ORDER BY p.updated_at DESC, p.id DESC",
        (user_id,),
    )
    return [_paper_response(row) for row in rows]


async def archive_paper_portfolio(portfolio_id: int, user_id: int) -> JSONDict | None:
    row = await get_paper_portfolio(portfolio_id, user_id)
    if row is None:
        return None
    await database.execute(
        "UPDATE paper_portfolios SET status='ARCHIVED', updated_at=datetime('now') "
        "WHERE id=? AND user_id=? AND status='ACTIVE'",
        (portfolio_id, user_id),
    )
    return await get_paper_portfolio(portfolio_id, user_id)


def _ledger_hash(payload: JSONDict) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _position_quantities(rows: list[JSONDict]) -> dict[str, float]:
    quantities: dict[str, float] = {}
    for row in rows:
        direction = 1.0 if row["side"] == "BUY" else -1.0
        quantities[row["symbol"]] = quantities.get(row["symbol"], 0.0) + direction * row["quantity"]
    return quantities


def _paper_positions(rows: list[JSONDict]) -> list[JSONDict]:
    positions: dict[str, JSONDict] = {}
    for row in rows:
        symbol = str(row["symbol"])
        position = positions.setdefault(
            symbol,
            {"symbol": symbol, "quantity": 0.0, "book_cost_base": 0.0},
        )
        quantity = float(row["quantity"])
        if row["side"] == "BUY":
            position["quantity"] += quantity
            position["book_cost_base"] += (
                quantity * float(row["simulation_price"]) + float(row["fee"])
            ) * float(row["fx_rate_to_base"])
        else:
            held = float(position["quantity"])
            if held > 0:
                position["book_cost_base"] -= float(position["book_cost_base"]) * quantity / held
            position["quantity"] -= quantity
        if abs(float(position["quantity"])) < 1e-12:
            position["quantity"] = 0.0
            position["book_cost_base"] = 0.0
    return [
        {
            **position,
            "quantity": round(float(position["quantity"]), 8),
            "book_cost_base": round(float(position["book_cost_base"]), 8),
        }
        for position in sorted(positions.values(), key=lambda item: str(item["symbol"]))
        if float(position["quantity"]) > 1e-12
    ]


def _instrument_currency(symbol: str) -> str | None:
    if symbol.startswith(("sh", "sz", "bj")):
        return "CNY"
    if symbol.startswith("hk"):
        return "HKD"
    if symbol.startswith("us"):
        return "USD"
    return None


async def record_paper_trade(
    *,
    user_id: int,
    portfolio_id: int,
    idempotency_key: str,
    side: str,
    symbol: str,
    quantity: float,
    simulation_price: float,
    simulation_as_of: str,
    simulation_source: str,
    fee: float,
    currency: str,
    fx_rate_to_base: float | None = None,
    fx_source: str | None = None,
    fx_as_of: str | None = None,
) -> JSONDict:
    from .market_data import normalize_code

    clean_side = side.strip().upper()
    if clean_side not in {"BUY", "SELL"}:
        raise PaperPortfolioError("INVALID_SIDE", "模拟方向仅支持 BUY 或 SELL")
    if quantity <= 0 or simulation_price <= 0 or fee < 0:
        raise PaperPortfolioError("INVALID_AMOUNT", "数量和模拟价格必须大于 0，费用不得为负")
    clean_key = idempotency_key.strip()
    clean_source = simulation_source.strip()
    clean_as_of = simulation_as_of.strip()
    if not clean_key or not clean_source or not clean_as_of:
        raise PaperPortfolioError("MISSING_PROVENANCE", "幂等键、模拟时点和模拟来源均为必填")
    try:
        clean_symbol = normalize_code(symbol)
    except ValueError as exc:
        raise PaperPortfolioError("INVALID_SYMBOL", str(exc)) from exc
    clean_currency = _currency(currency)

    portfolio = await get_paper_portfolio(portfolio_id, user_id)
    if portfolio is None:
        raise PaperPortfolioError("NOT_FOUND", f"模拟组合不存在：id={portfolio_id}")
    if portfolio["status"] != "ACTIVE":
        raise PaperPortfolioError("ARCHIVED", "已停用模拟组合不可追加记录")
    base_currency = str(portfolio["base_currency"])
    if clean_currency == base_currency:
        effective_fx = 1.0
        clean_fx_source = "IDENTITY"
        clean_fx_as_of = clean_as_of
    else:
        if fx_rate_to_base is None or fx_rate_to_base <= 0 or not fx_source or not fx_as_of:
            raise PaperPortfolioError(
                "FX_REQUIRED",
                f"{clean_currency} 到 {base_currency} 的模拟换算必须显式提供汇率、来源和时点",
            )
        effective_fx = fx_rate_to_base
        clean_fx_source = fx_source.strip()
        clean_fx_as_of = fx_as_of.strip()

    payload: JSONDict = {
        "side": clean_side,
        "symbol": clean_symbol,
        "quantity": quantity,
        "simulation_price": simulation_price,
        "simulation_as_of": clean_as_of,
        "simulation_source": clean_source,
        "fee": fee,
        "currency": clean_currency,
        "fx_rate_to_base": effective_fx,
        "fx_source": clean_fx_source,
        "fx_as_of": clean_fx_as_of,
    }
    request_hash = _ledger_hash(payload)
    gross = quantity * simulation_price
    cash_delta = (gross - fee if clean_side == "SELL" else -(gross + fee)) * effective_fx

    async with _PAPER_LEDGER_LOCK:
        db = database.get_db()
        await db.execute("SAVEPOINT append_paper_ledger")
        try:
            duplicate = await database.query_one(
                "SELECT * FROM paper_portfolio_ledger "
                "WHERE user_id=? AND portfolio_id=? AND idempotency_key=?",
                (user_id, portfolio_id, clean_key),
            )
            if duplicate is not None:
                if duplicate["request_hash"] != request_hash:
                    raise PaperPortfolioError("IDEMPOTENCY_CONFLICT", "幂等键已用于不同模拟记录")
                await db.execute("RELEASE SAVEPOINT append_paper_ledger")
                return {**duplicate, "idempotent_replay": True, **_paper_response({})}

            rows = await database.query_all(
                "SELECT * FROM paper_portfolio_ledger WHERE user_id=? AND portfolio_id=? ORDER BY id",
                (user_id, portfolio_id),
            )
            quantities = _position_quantities(rows)
            if clean_side == "SELL" and quantities.get(clean_symbol, 0.0) + 1e-12 < quantity:
                raise PaperPortfolioError("NAKED_SHORT", "模拟卖出数量超过已有模拟持仓")
            cash = float(portfolio["initial_cash"]) + sum(float(row["cash_delta"]) for row in rows)
            if cash + cash_delta < -1e-9:
                raise PaperPortfolioError("NEGATIVE_CASH", "模拟买入将导致模拟现金为负")

            columns = (
                "user_id, portfolio_id, idempotency_key, request_hash, side, symbol, quantity, "
                "simulation_price, fee, currency, simulation_as_of, simulation_source, cash_delta, "
                "fx_rate_to_base, fx_source, fx_as_of"
            )
            cursor = await db.execute(
                f"INSERT INTO paper_portfolio_ledger({columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    user_id, portfolio_id, clean_key, request_hash, clean_side, clean_symbol, quantity,
                    simulation_price, fee, clean_currency, clean_as_of, clean_source, cash_delta,
                    effective_fx, clean_fx_source, clean_fx_as_of,
                ),
            )
            await db.execute(
                "UPDATE paper_portfolios SET updated_at=datetime('now') WHERE id=? AND user_id=?",
                (portfolio_id, user_id),
            )
            await db.execute("RELEASE SAVEPOINT append_paper_ledger")
            await db.commit()
            row = await database.query_one(
                "SELECT * FROM paper_portfolio_ledger WHERE id=? AND user_id=?",
                (cursor.lastrowid, user_id),
            )
            assert row is not None
            return {**row, "idempotent_replay": False, **_paper_response({})}
        except Exception:
            await db.execute("ROLLBACK TO SAVEPOINT append_paper_ledger")
            await db.execute("RELEASE SAVEPOINT append_paper_ledger")
            raise


async def paper_portfolio_snapshot(portfolio_id: int, user_id: int) -> JSONDict | None:
    portfolio = await get_paper_portfolio(portfolio_id, user_id)
    if portfolio is None:
        return None
    rows = await database.query_all(
        "SELECT * FROM paper_portfolio_ledger WHERE user_id=? AND portfolio_id=? ORDER BY id",
        (user_id, portfolio_id),
    )
    cash = float(portfolio["initial_cash"]) + sum(float(row["cash_delta"]) for row in rows)
    positions = _paper_positions(rows)
    return {**portfolio, "cash": round(cash, 8), "positions": positions, "ledger": rows}


async def value_paper_portfolio(
    portfolio_id: int, user_id: int, *, market_service: Any,
) -> JSONDict | None:
    """Value a paper ledger without filling missing prices or FX."""
    snapshot = await paper_portfolio_snapshot(portfolio_id, user_id)
    if snapshot is None:
        return None
    positions = snapshot["positions"]
    if not positions:
        cash = float(snapshot["cash"])
        return {
            **snapshot,
            "valuation_status": "OK",
            "valuation_reasons": [],
            "total_value": cash,
            "total_return": round((cash / float(snapshot["initial_cash"]) - 1) * 100, 8),
            "valuation_positions": [],
        }

    try:
        fetched = await market_service.quotes([item["symbol"] for item in positions])
    except Exception as exc:
        return {
            **snapshot,
            "valuation_status": "UPSTREAM_ERROR",
            "valuation_reasons": [f"QUOTE_UPSTREAM_ERROR:{type(exc).__name__}"],
            "total_value": None,
            "total_return": None,
            "valuation_positions": [
                {
                    **item,
                    "data_status": "UPSTREAM_ERROR",
                    "current_price": None,
                    "market_value": None,
                    "source": None,
                    "as_of": None,
                }
                for item in positions
            ],
        }

    from .market_data import normalize_code

    quotes = {str(quote.get("code")): quote for quote in fetched}
    reasons: list[str] = []
    valued_positions: list[JSONDict] = []
    market_total = 0.0
    for item in positions:
        symbol = str(item["symbol"])
        try:
            quote_key = normalize_code(symbol)
        except ValueError:
            quote_key = symbol
        quote = quotes.get(quote_key)
        price = quote.get("price") if quote else None
        source = quote.get("source") if quote else None
        quote_currency = (quote.get("currency") if quote else None) or _instrument_currency(symbol)
        timestamp = quote.get("timestamp") if quote else None
        as_of = str(timestamp) if timestamp not in (None, 0, "") else None
        if price is None or float(price) <= 0 or not source:
            reasons.append(f"PRICE_UNKNOWN:{symbol}")
            valued_positions.append({
                **item,
                "data_status": "UNKNOWN",
                "current_price": None,
                "market_value": None,
                "quote_currency": quote_currency,
                "source": source,
                "as_of": as_of,
            })
            continue
        native_value = float(item["quantity"]) * float(price)
        if quote_currency != snapshot["base_currency"]:
            reasons.append(f"FX_UNKNOWN:{quote_currency or 'UNKNOWN'}->{snapshot['base_currency']}:{symbol}")
            data_status = "PARTIAL"
        else:
            market_total += native_value
            data_status = "OK"
        valued_positions.append({
            **item,
            "data_status": data_status,
            "current_price": float(price),
            "market_value": round(native_value, 8),
            "quote_currency": quote_currency,
            "source": source,
            "as_of": as_of,
        })

    if reasons:
        total_value = None
        total_return = None
        status = "UNKNOWN" if any(reason.startswith("PRICE_UNKNOWN") for reason in reasons) else "PARTIAL"
    else:
        total_value = round(float(snapshot["cash"]) + market_total, 8)
        total_return = round((total_value / float(snapshot["initial_cash"]) - 1) * 100, 8)
        status = "OK"
    return {
        **snapshot,
        "valuation_status": status,
        "valuation_reasons": reasons,
        "total_value": total_value,
        "total_return": total_return,
        "valuation_positions": valued_positions,
    }


def _parse_review_time(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise PaperPortfolioError("INVALID_REVIEW_WINDOW", "观察时间必须为 ISO-8601") from exc


async def _paper_hypothesis(memory_id: int, user_id: int) -> JSONDict:
    from .investment_memory import get_memory

    memory = await get_memory(memory_id, user_id=user_id)
    if memory is None or memory["memory_type"] != "hypothesis" or memory["status"] == "deleted":
        raise PaperPortfolioError("HYPOTHESIS_NOT_FOUND", "hypothesis 不存在或不可用于复盘")
    return memory


async def list_paper_review_context(portfolio_id: int, user_id: int) -> JSONDict | None:
    """List owner-local hypotheses and prior paper review outcomes."""
    paper = await get_paper_portfolio(portfolio_id, user_id)
    if paper is None:
        return None
    from .investment_memory import list_memories

    memories = await list_memories(user_id=user_id)
    hypotheses = [item for item in memories if item["memory_type"] == "hypothesis"]
    source_id = f"paper_portfolio:{portfolio_id}"
    reviews = [
        item for item in memories
        if item["memory_type"] == "review_outcome" and item["source_id"] == source_id
    ]
    return {
        "schema_version": "paper-portfolio-review-context/v1",
        "paper_portfolio": paper,
        "hypotheses": hypotheses,
        "reviews": reviews,
        "causal_proof": False,
    }


async def create_paper_review_draft(
    portfolio_id: int,
    hypothesis_memory_id: int,
    user_id: int,
    *,
    market_service: Any,
) -> JSONDict:
    hypothesis = await _paper_hypothesis(hypothesis_memory_id, user_id)
    valuation = await value_paper_portfolio(portfolio_id, user_id, market_service=market_service)
    if valuation is None:
        raise PaperPortfolioError("NOT_FOUND", f"模拟组合不存在：id={portfolio_id}")
    options = ["inconclusive"] if valuation["valuation_status"] != "OK" else [
        "supported", "refuted", "inconclusive",
    ]
    return {
        "schema_version": "paper-portfolio-review-draft/v1",
        "paper_portfolio_id": portfolio_id,
        "hypothesis": hypothesis,
        "simulation_result": {
            "information_kind": "COMPUTED_RESULT",
            "initial_cash": valuation["initial_cash"],
            "cash": valuation["cash"],
            "total_value": valuation["total_value"],
            "total_return": valuation["total_return"],
            "valuation_status": valuation["valuation_status"],
            "valuation_reasons": valuation["valuation_reasons"],
            "positions": valuation["valuation_positions"],
            "formula": "total_return=(cash+sum(quantity*current_price))/initial_cash-1",
            "fee_formula": "BUY=-(quantity*price+fee)*fx; SELL=(quantity*price-fee)*fx",
        },
        "outcome_options": options,
        "recommended_outcome": None,
        "information_kind": "USER_HYPOTHESIS",
        "causal_proof": False,
        "warning": "模拟收益是确定性输入与行情估值的计算结果，不构成因果证明。",
    }


async def _save_paper_review_locked(
    *,
    portfolio_id: int,
    hypothesis_memory_id: int,
    user_id: int,
    outcome: str,
    reason: str,
    observed_from: str,
    observed_to: str,
    idempotency_key: str,
    market_service: Any,
) -> JSONDict:
    clean_outcome = outcome.strip().lower()
    if clean_outcome not in {"supported", "refuted", "inconclusive"}:
        raise PaperPortfolioError("INVALID_OUTCOME", "复盘结果不受支持")
    clean_reason = reason.strip()
    clean_key = idempotency_key.strip()
    if not clean_reason or not clean_key:
        raise PaperPortfolioError("MISSING_REVIEW_INPUT", "复盘理由和幂等键均为必填")
    start = _parse_review_time(observed_from)
    end = _parse_review_time(observed_to)
    if (start.tzinfo is None) != (end.tzinfo is None):
        raise PaperPortfolioError("INVALID_REVIEW_WINDOW", "观察起止时间的时区格式必须一致")
    if start > end:
        raise PaperPortfolioError("INVALID_REVIEW_WINDOW", "观察开始时间不得晚于结束时间")
    hypothesis = await _paper_hypothesis(hypothesis_memory_id, user_id)
    paper = await get_paper_portfolio(portfolio_id, user_id)
    if paper is None:
        raise PaperPortfolioError("NOT_FOUND", f"模拟组合不存在：id={portfolio_id}")

    request_payload: JSONDict = {
        "hypothesis_memory_id": hypothesis_memory_id,
        "outcome": clean_outcome,
        "reason": clean_reason,
        "observed_from": observed_from.strip(),
        "observed_to": observed_to.strip(),
    }
    request_hash = _ledger_hash(request_payload)
    context = await list_paper_review_context(portfolio_id, user_id)
    assert context is not None
    for review in context["reviews"]:
        content = review["content"]
        if content.get("idempotency_key") != clean_key:
            continue
        if content.get("request_hash") != request_hash:
            raise PaperPortfolioError("IDEMPOTENCY_CONFLICT", "幂等键已用于不同复盘")
        return {**review, "idempotent_replay": True}

    draft = await create_paper_review_draft(
        portfolio_id, hypothesis_memory_id, user_id, market_service=market_service,
    )
    if draft["simulation_result"]["valuation_status"] != "OK" and clean_outcome != "inconclusive":
        raise PaperPortfolioError(
            "INCONCLUSIVE_REQUIRED", "估值不完整时只能保存 inconclusive",
        )
    from .investment_memory import create_memory

    content = {
        "schema_version": "paper-portfolio-review-outcome/v1",
        "idempotency_key": clean_key,
        "request_hash": request_hash,
        "hypothesis_memory_id": hypothesis_memory_id,
        "outcome": clean_outcome,
        "reason": clean_reason,
        "observed_from": observed_from.strip(),
        "observed_to": observed_to.strip(),
        "paper_portfolio": {
            "id": portfolio_id,
            "name": paper["name"],
            "account_kind": PAPER_ACCOUNT_KIND,
            "execution_kind": PAPER_EXECUTION_KIND,
        },
        "simulation_result": draft["simulation_result"],
        "causal_proof": False,
        "warning": draft["warning"],
    }
    review = await create_memory(
        user_id=user_id,
        subject_type=str(hypothesis["subject_type"]),
        subject_id=str(hypothesis["subject_id"]),
        memory_type="review_outcome",
        information_kind="USER_HYPOTHESIS",
        content=content,
        source_kind="user",
        source_id=f"paper_portfolio:{portfolio_id}",
        valid_from=observed_from.strip(),
        valid_to=observed_to.strip(),
        observed_at=observed_to.strip(),
        status="confirmed",
        quality_flags=[str(draft["simulation_result"]["valuation_status"])],
        created_by="user",
    )
    return {**review, "idempotent_replay": False}


async def save_paper_review(
    *,
    portfolio_id: int,
    hypothesis_memory_id: int,
    user_id: int,
    outcome: str,
    reason: str,
    observed_from: str,
    observed_to: str,
    idempotency_key: str,
    market_service: Any,
) -> JSONDict:
    async with _PAPER_REVIEW_LOCK:
        return await _save_paper_review_locked(
            portfolio_id=portfolio_id,
            hypothesis_memory_id=hypothesis_memory_id,
            user_id=user_id,
            outcome=outcome,
            reason=reason,
            observed_from=observed_from,
            observed_to=observed_to,
            idempotency_key=idempotency_key,
            market_service=market_service,
        )


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
