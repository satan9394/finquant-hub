import pytest
import pytest_asyncio

from app import config, database
from app.services import investment_memory, portfolio


@pytest_asyncio.fixture
async def paper_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "paper.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users(email) VALUES ('paper-owner@test.local')")
    other_id = await database.execute("INSERT INTO users(email) VALUES ('paper-other@test.local')")
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


async def _paper(owner_id: int, *, currency: str = "USD", cash: float = 1000) -> dict:
    return await portfolio.create_paper_portfolio(
        user_id=owner_id, name="研究模拟盘", base_currency=currency, initial_cash=cash,
    )


async def _trade(owner_id: int, paper_id: int, **overrides) -> dict:
    payload = {
        "user_id": owner_id,
        "portfolio_id": paper_id,
        "idempotency_key": "buy-aapl-1",
        "side": "BUY",
        "symbol": "AAPL",
        "quantity": 2,
        "simulation_price": 100,
        "simulation_as_of": "2026-08-13T10:00:00Z",
        "simulation_source": "user-input:paper-fixture",
        "fee": 2,
        "currency": "USD",
    }
    payload.update(overrides)
    return await portfolio.record_paper_trade(**payload)


async def _hypothesis(owner_id: int, *, memory_type: str = "hypothesis") -> dict:
    return await investment_memory.create_memory(
        user_id=owner_id,
        subject_type="instrument",
        subject_id="usAAPL",
        memory_type=memory_type,
        information_kind="USER_HYPOTHESIS",
        content={"text": "AAPL momentum remains positive"},
        source_kind="user",
        created_by="user",
        status="confirmed",
    )


@pytest.mark.asyncio
async def test_paper_portfolio_is_owner_scoped_and_separate_from_existing_portfolio(paper_db):
    owner_id, other_id = paper_db
    regular_id = await database.execute(
        "INSERT INTO portfolios(name, description, currency, user_id) VALUES ('Existing', '', 'USD', ?)",
        (owner_id,),
    )
    paper = await _paper(owner_id)

    assert paper["account_kind"] == "PAPER"
    assert paper["execution_kind"] == "SIMULATED"
    assert paper["capabilities"]["real_orders"] is False
    assert await portfolio.get_paper_portfolio(paper["id"], other_id) is None
    assert await portfolio.list_paper_portfolios(other_id) == []
    assert (await portfolio.get_portfolio(regular_id, owner_id))["name"] == "Existing"
    assert await database.query_one("SELECT COUNT(*) AS n FROM positions") == {"n": 0}


@pytest.mark.asyncio
async def test_append_only_ledger_is_idempotent_and_uses_explicit_cost_formula(paper_db):
    owner_id, _ = paper_db
    paper = await _paper(owner_id)
    first = await _trade(owner_id, paper["id"])
    replay = await _trade(owner_id, paper["id"])
    snapshot = await portfolio.paper_portfolio_snapshot(paper["id"], owner_id)

    assert first["idempotent_replay"] is False
    assert replay["id"] == first["id"]
    assert replay["idempotent_replay"] is True
    assert snapshot["cash"] == 798
    assert snapshot["positions"] == [
        {"symbol": "usAAPL", "quantity": 2.0, "book_cost_base": 202.0},
    ]
    assert len(snapshot["ledger"]) == 1

    with pytest.raises(portfolio.PaperPortfolioError, match="幂等键") as conflict:
        await _trade(owner_id, paper["id"], quantity=3)
    assert conflict.value.code == "IDEMPOTENCY_CONFLICT"

    with pytest.raises(Exception, match="immutable"):
        await database.get_db().execute(
            "UPDATE paper_portfolio_ledger SET fee=3 WHERE id=?", (first["id"],),
        )
    await database.get_db().rollback()


@pytest.mark.asyncio
async def test_paper_ledger_rejects_negative_cash_naked_short_and_archived_append(paper_db):
    owner_id, _ = paper_db
    paper = await _paper(owner_id, cash=250)

    with pytest.raises(portfolio.PaperPortfolioError) as negative:
        await _trade(owner_id, paper["id"], quantity=3)
    assert negative.value.code == "NEGATIVE_CASH"

    with pytest.raises(portfolio.PaperPortfolioError) as short:
        await _trade(
            owner_id, paper["id"], idempotency_key="sell-first", side="SELL", quantity=1,
        )
    assert short.value.code == "NAKED_SHORT"

    await _trade(owner_id, paper["id"], quantity=1)
    archived = await portfolio.archive_paper_portfolio(paper["id"], owner_id)
    assert archived["status"] == "ARCHIVED"
    with pytest.raises(portfolio.PaperPortfolioError) as inactive:
        await _trade(owner_id, paper["id"], idempotency_key="buy-after-archive", quantity=0.1)
    assert inactive.value.code == "ARCHIVED"


@pytest.mark.asyncio
async def test_cross_currency_trade_requires_explicit_fx_and_valuation_keeps_missing_fx_unknown(paper_db):
    owner_id, _ = paper_db
    paper = await _paper(owner_id, currency="CNY", cash=10000)
    with pytest.raises(portfolio.PaperPortfolioError) as missing_fx:
        await _trade(owner_id, paper["id"], currency="USD")
    assert missing_fx.value.code == "FX_REQUIRED"

    await _trade(
        owner_id,
        paper["id"],
        currency="USD",
        fx_rate_to_base=7.1,
        fx_source="fixture:explicit-usd-cny",
        fx_as_of="2026-08-13",
    )

    class Market:
        async def quotes(self, symbols):
            assert symbols == ["usAAPL"]
            return [{
                "code": "usAAPL", "price": 110, "currency": "USD",
                "source": "fixture:quote", "timestamp": 1786634400,
            }]

    valued = await portfolio.value_paper_portfolio(paper["id"], owner_id, market_service=Market())
    assert valued["cash"] == 8565.8
    assert valued["valuation_status"] == "PARTIAL"
    assert valued["total_value"] is None
    assert valued["total_return"] is None
    assert valued["valuation_reasons"] == ["FX_UNKNOWN:USD->CNY:usAAPL"]
    assert valued["valuation_positions"][0]["market_value"] == 220
    assert valued["valuation_positions"][0]["source"] == "fixture:quote"


@pytest.mark.asyncio
async def test_same_currency_valuation_and_missing_price_states_are_not_filled(paper_db):
    owner_id, _ = paper_db
    paper = await _paper(owner_id)
    await _trade(owner_id, paper["id"])

    class Market:
        async def quotes(self, _symbols):
            return [{
                "code": "usAAPL", "price": 110, "currency": "USD",
                "source": "fixture:quote", "timestamp": 1786634400,
            }]

    valued = await portfolio.value_paper_portfolio(paper["id"], owner_id, market_service=Market())
    assert valued["valuation_status"] == "OK"
    assert valued["total_value"] == 1018
    assert valued["total_return"] == 1.8

    class MissingMarket:
        async def quotes(self, _symbols):
            return []

    missing = await portfolio.value_paper_portfolio(
        paper["id"], owner_id, market_service=MissingMarket(),
    )
    assert missing["valuation_status"] == "UNKNOWN"
    assert missing["total_value"] is None
    assert missing["valuation_positions"][0]["current_price"] is None
    assert missing["valuation_reasons"] == ["PRICE_UNKNOWN:usAAPL"]


class ReviewMarket:
    async def quotes(self, _symbols):
        return [{
            "code": "usAAPL", "price": 110, "currency": "USD",
            "source": "fixture:review-quote", "timestamp": 1786634400,
        }]


@pytest.mark.asyncio
async def test_paper_review_draft_is_read_only_and_never_recommends_an_outcome(paper_db):
    owner_id, _ = paper_db
    paper = await _paper(owner_id)
    await _trade(owner_id, paper["id"])
    hypothesis = await _hypothesis(owner_id)
    before = await database.query_one("SELECT COUNT(*) AS n FROM memory_records")

    draft = await portfolio.create_paper_review_draft(
        paper["id"], hypothesis["id"], owner_id, market_service=ReviewMarket(),
    )
    after = await database.query_one("SELECT COUNT(*) AS n FROM memory_records")

    assert before == after == {"n": 1}
    assert draft["simulation_result"]["total_return"] == 1.8
    assert draft["simulation_result"]["information_kind"] == "COMPUTED_RESULT"
    assert draft["simulation_result"]["positions"][0]["source"] == "fixture:review-quote"
    assert draft["outcome_options"] == ["supported", "refuted", "inconclusive"]
    assert draft["recommended_outcome"] is None
    assert draft["information_kind"] == "USER_HYPOTHESIS"
    assert draft["causal_proof"] is False


@pytest.mark.asyncio
async def test_paper_review_save_is_idempotent_and_does_not_mutate_hypothesis(paper_db):
    owner_id, _ = paper_db
    paper = await _paper(owner_id)
    await _trade(owner_id, paper["id"])
    hypothesis = await _hypothesis(owner_id)
    original = await investment_memory.get_memory(hypothesis["id"], user_id=owner_id)
    request = {
        "portfolio_id": paper["id"],
        "hypothesis_memory_id": hypothesis["id"],
        "user_id": owner_id,
        "outcome": "supported",
        "reason": "用户仅记录模拟结果与假设方向一致，不主张因果。",
        "observed_from": "2026-08-01T00:00:00Z",
        "observed_to": "2026-08-13T00:00:00Z",
        "idempotency_key": "review-aapl-1",
        "market_service": ReviewMarket(),
    }

    saved = await portfolio.save_paper_review(**request)
    replay = await portfolio.save_paper_review(**request)
    current = await investment_memory.get_memory(hypothesis["id"], user_id=owner_id)
    context = await portfolio.list_paper_review_context(paper["id"], owner_id)

    assert saved["idempotent_replay"] is False
    assert replay["id"] == saved["id"]
    assert replay["idempotent_replay"] is True
    assert saved["memory_type"] == "review_outcome"
    assert saved["information_kind"] == "USER_HYPOTHESIS"
    assert saved["source_kind"] == "user"
    assert saved["created_by"] == "user"
    assert saved["content"]["causal_proof"] is False
    assert saved["content"]["simulation_result"]["fee_formula"].startswith("BUY=")
    assert current == original
    assert [item["id"] for item in context["reviews"]] == [saved["id"]]

    with pytest.raises(portfolio.PaperPortfolioError) as conflict:
        await portfolio.save_paper_review(**{**request, "outcome": "refuted"})
    assert conflict.value.code == "IDEMPOTENCY_CONFLICT"


@pytest.mark.asyncio
async def test_paper_review_rejects_cross_owner_and_non_hypothesis_memory_without_leak(paper_db):
    owner_id, other_id = paper_db
    paper = await _paper(owner_id)
    other_hypothesis = await _hypothesis(other_id)
    decision = await _hypothesis(owner_id, memory_type="decision")

    for memory_id in (other_hypothesis["id"], decision["id"], 999999):
        with pytest.raises(portfolio.PaperPortfolioError) as missing:
            await portfolio.create_paper_review_draft(
                paper["id"], memory_id, owner_id, market_service=ReviewMarket(),
            )
        assert missing.value.code == "HYPOTHESIS_NOT_FOUND"
        assert "AAPL momentum" not in str(missing.value)


@pytest.mark.asyncio
async def test_incomplete_valuation_only_allows_inconclusive_review(paper_db):
    owner_id, _ = paper_db
    paper = await _paper(owner_id)
    await _trade(owner_id, paper["id"])
    hypothesis = await _hypothesis(owner_id)

    class MissingMarket:
        async def quotes(self, _symbols):
            return []

    draft = await portfolio.create_paper_review_draft(
        paper["id"], hypothesis["id"], owner_id, market_service=MissingMarket(),
    )
    assert draft["simulation_result"]["valuation_status"] == "UNKNOWN"
    assert draft["simulation_result"]["total_return"] is None
    assert draft["outcome_options"] == ["inconclusive"]

    common = {
        "portfolio_id": paper["id"],
        "hypothesis_memory_id": hypothesis["id"],
        "user_id": owner_id,
        "reason": "行情缺失，无法形成方向判断。",
        "observed_from": "2026-08-01",
        "observed_to": "2026-08-13",
        "idempotency_key": "unknown-review",
        "market_service": MissingMarket(),
    }
    with pytest.raises(portfolio.PaperPortfolioError) as invalid:
        await portfolio.save_paper_review(**common, outcome="supported")
    assert invalid.value.code == "INCONCLUSIVE_REQUIRED"

    with pytest.raises(portfolio.PaperPortfolioError) as invalid_window:
        await portfolio.save_paper_review(
            **{
                **common,
                "observed_from": "2026-08-01T00:00:00Z",
                "observed_to": "2026-08-13T00:00:00",
            },
            outcome="inconclusive",
        )
    assert invalid_window.value.code == "INVALID_REVIEW_WINDOW"

    saved = await portfolio.save_paper_review(**common, outcome="inconclusive")
    assert saved["content"]["simulation_result"]["total_value"] is None
    assert saved["content"]["simulation_result"]["valuation_status"] == "UNKNOWN"
