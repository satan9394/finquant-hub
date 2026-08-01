import pytest

from app.backtest.execution_rules import execution_rules_for


def test_a_share_board_limits_are_inferred_and_rounded():
    main = execution_rules_for("600519")
    growth = execution_rules_for("300750")

    assert main.limit_prices(10.03) == (11.03, 9.03)
    assert growth.price_limit_ratio == 0.20
    assert main.metadata()["allow_short"] is False
    assert main.metadata()["t_plus_one"] is True
    assert "adjusted_bars_may_distort_historical_limit_prices" in main.assumptions


def test_a_share_t_plus_one_and_locked_limits_reject_fills():
    rules = execution_rules_for("600519")
    limit_up = {"day": "2026-01-02", "open": 11.0}
    limit_down = {"day": "2026-01-03", "open": 9.0}
    normal = {"day": "2026-01-02 14:00", "open": 10.0}

    assert rules.check_fill("buy", limit_up, previous_close=10.0) == (False, "limit_up")
    assert rules.check_fill(
        "sell", normal, previous_close=10.0, entry_date="2026-01-02"
    ) == (False, "t_plus_one")
    assert rules.check_fill(
        "sell", limit_down, previous_close=10.0, entry_date="2026-01-02"
    ) == (False, "limit_down")
    assert rules.check_fill("short", normal, previous_close=10.0) == (
        False, "short_selling_forbidden"
    )


def test_explicit_st_limit_and_non_cn_unrestricted_mode():
    st = execution_rules_for("600519", price_limit_ratio=0.05)
    foreign = execution_rules_for("AAPL")
    disabled = execution_rules_for("600519", mode="none")

    assert st.limit_prices(10.0) == (10.5, 9.5)
    assert foreign.check_fill("short", {"day": "2026-01-01", "open": 100}, previous_close=99) == (
        True, None
    )
    assert disabled.t_plus_one is False
    with pytest.raises(ValueError, match="market_rules"):
        execution_rules_for("600519", mode="future")
    with pytest.raises(ValueError, match="price_limit_ratio"):
        execution_rules_for("600519", price_limit_ratio=0.8)


def test_unknown_order_side_is_rejected():
    with pytest.raises(ValueError, match="订单方向"):
        execution_rules_for("600519").check_fill(
            "hold", {"day": "2026-01-01", "open": 10}, previous_close=10
        )
