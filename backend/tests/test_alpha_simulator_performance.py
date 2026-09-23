"""Unit tests for the performance summary contract of alpha factor simulation."""
from datetime import date, timedelta

import pytest

from app.services.alpha_simulator import summarize_performance
from app.services.alpha_simulator import simulate_factor


def _equity_points(returns: list[float], dates: list[str] | None = None) -> list[dict]:
    equity = 1.0
    points = [{"date": "start", "value": equity}]
    for index, period_return in enumerate(returns):
        equity *= 1 + period_return
        points.append({"date": dates[index] if dates else f"2026-01-{index + 2:02d}", "value": equity})
    return points


def _make_observations(days: int = 25) -> list[dict]:
    rows = []
    for index in range(days):
        day = (date(2026, 1, 1) + timedelta(days=index)).isoformat()
        for symbol_index, symbol in enumerate(("A", "B", "C", "D", "E", "F")):
            rows.append(
                {
                    "date": day,
                    "symbol": symbol,
                    "factor": symbol_index + 1,
                    "forward_return": 0.002 * (((index + symbol_index) % 5) - 2),
                }
            )
    return rows


def test_summarize_performance_computes_geometric_annualized_stats_on_full_sample():
    returns = [0.01] * 20
    summary = summarize_performance(_equity_points(returns), returns, [0.25] * 20, 252)

    assert summary["status"] == "ok"
    assert summary["sample_days"] == 20
    assert summary["start_date"] == "2026-01-02"
    assert summary["end_date"] == "2026-01-21"
    # 几何年化：(1.01 ** 20) ** (252 / 20) - 1 = 1.01 ** 252 - 1
    assert summary["annualized_return"] == pytest.approx(1.01**252 - 1)
    # 恒定日收益 → 波动 0，夏普分母为 0 必须诚实为 None
    assert summary["annualized_volatility"] == pytest.approx(0.0)
    assert summary["sharpe_ratio"] is None
    assert summary["average_turnover"] == pytest.approx(0.25)
    # 单调上行 → 无回撤
    assert summary["max_drawdown"] == pytest.approx(0.0)
    assert summary["max_drawdown_peak_date"] is None
    assert summary["max_drawdown_trough_date"] is None
    assert summary["max_drawdown_recovery_date"] is None


def test_summarize_performance_exactly_twenty_days_is_ok():
    returns = [0.001] * 20
    summary = summarize_performance(_equity_points(returns), returns, [], 252)
    assert summary["status"] == "ok"
    assert summary["average_turnover"] is None  # 空换手序列 → None 而非编造


def test_summarize_performance_insufficient_sample_degrades_honestly():
    returns = [0.01, -0.005, 0.02, 0.005, -0.01]
    summary = summarize_performance(_equity_points(returns), returns, [0.3] * 5, 252)

    assert summary["status"] == "insufficient"
    assert summary["sample_days"] == 5
    # 年化类统计在不足样本下必须为空，不编造
    assert summary["annualized_return"] is None
    assert summary["annualized_volatility"] is None
    assert summary["sharpe_ratio"] is None
    # 已观测水平指标仍如实给出
    assert summary["average_turnover"] == pytest.approx(0.3)
    assert summary["max_drawdown"] is not None
    assert summary["start_date"] == "2026-01-02"


def test_summarize_performance_empty_inputs_returns_insufficient():
    summary = summarize_performance([], [], [], 252)

    assert summary["status"] == "insufficient"
    assert summary["sample_days"] == 0
    assert summary["start_date"] is None
    assert summary["end_date"] is None
    assert summary["annualized_return"] is None
    assert summary["annualized_volatility"] is None
    assert summary["sharpe_ratio"] is None
    assert summary["max_drawdown"] is None
    assert summary["average_turnover"] is None


def test_summarize_performance_zero_variance_returns_null_sharpe():
    returns = [-0.001] * 25
    summary = summarize_performance(_equity_points(returns), returns, [0.2] * 25, 252)

    assert summary["status"] == "ok"
    assert summary["annualized_volatility"] == pytest.approx(0.0)
    assert summary["sharpe_ratio"] is None
    assert summary["annualized_return"] == pytest.approx((0.999**25) ** (252 / 25) - 1)


def test_summarize_performance_reports_drawdown_dates_with_recovery():
    points = [
        {"date": "start", "value": 1.0},
        {"date": "2026-03-02", "value": 1.1},
        {"date": "2026-03-03", "value": 0.99},
        {"date": "2026-03-04", "value": 1.12},
    ]
    summary = summarize_performance(points, [0.1, -0.1, 0.13], [0.5, 0.5, 0.5], 252)

    assert summary["status"] == "insufficient"  # 3 天样本，年化类为空
    assert summary["max_drawdown"] == pytest.approx(0.99 / 1.1 - 1)
    assert summary["max_drawdown_peak_date"] == "2026-03-02"
    assert summary["max_drawdown_trough_date"] == "2026-03-03"
    assert summary["max_drawdown_recovery_date"] == "2026-03-04"


def test_summarize_performance_reports_unrecovered_drawdown():
    points = [
        {"date": "start", "value": 1.0},
        {"date": "2026-03-02", "value": 1.1},
        {"date": "2026-03-03", "value": 0.99},
        {"date": "2026-03-04", "value": 1.05},
    ]
    summary = summarize_performance(points, [0.1, -0.1, 0.06], [], 252)

    assert summary["max_drawdown"] == pytest.approx(0.99 / 1.1 - 1)
    assert summary["max_drawdown_peak_date"] == "2026-03-02"
    assert summary["max_drawdown_trough_date"] == "2026-03-03"
    assert summary["max_drawdown_recovery_date"] is None


def test_summarize_performance_peak_as_initial_capital_has_no_date():
    points = [
        {"date": "start", "value": 1.0},
        {"date": "2026-03-02", "value": 0.9},
        {"date": "2026-03-03", "value": 0.95},
    ]
    summary = summarize_performance(points, [-0.1, 0.055], [], 252)

    assert summary["max_drawdown"] == pytest.approx(-0.1)
    assert summary["max_drawdown_peak_date"] is None  # 峰值即初始资金，无交易日
    assert summary["max_drawdown_trough_date"] == "2026-03-02"
    assert summary["max_drawdown_recovery_date"] is None


def test_summarize_performance_invalid_periods_per_year_is_null_not_error():
    returns = [0.01] * 20
    summary = summarize_performance(_equity_points(returns), returns, [], 0)

    assert summary["status"] == "ok"
    assert summary["annualized_return"] is None
    assert summary["annualized_volatility"] is None
    assert summary["sharpe_ratio"] is None


def test_simulate_factor_adds_performance_without_touching_existing_keys():
    result = simulate_factor(_make_observations(days=25), quantile=0.2, periods_per_year=252)

    # 既有键一个不少、一个不改（新增 performance 键）
    assert set(result) == {"equity_curve", "period_returns", "metrics", "factor_analysis", "performance"}
    assert result["factor_analysis"]["status"] == "ok"
    assert result["metrics"]["positive_period_rate"] == pytest.approx(
        sum(value > 0 for value in result["period_returns"]) / len(result["period_returns"])
    )
    assert result["metrics"]["average_turnover"] == pytest.approx(
        result["performance"]["average_turnover"]
    )

    performance = result["performance"]
    assert performance["status"] == "ok"
    assert performance["sample_days"] == 25 == len(result["period_returns"])
    assert performance["start_date"] == "2026-01-01"
    assert performance["end_date"] == "2026-01-25"
    # 与既有 calculate_performance 口径一致：回撤包含初始资金锚点、几何年化、样本波动
    assert performance["max_drawdown"] == pytest.approx(result["metrics"]["max_drawdown"])
    assert performance["annualized_return"] == pytest.approx(result["metrics"]["annualized_return"])
    assert performance["annualized_volatility"] == pytest.approx(
        result["metrics"]["annualized_volatility"]
    )
    assert performance["sharpe_ratio"] == pytest.approx(result["metrics"]["sharpe_ratio"])


def test_simulate_factor_short_sample_marks_performance_insufficient():
    result = simulate_factor(_make_observations(days=3), quantile=0.2, periods_per_year=252)

    performance = result["performance"]
    assert performance["status"] == "insufficient"
    assert performance["sample_days"] == 3
    assert performance["annualized_return"] is None
    assert performance["annualized_volatility"] is None
    assert performance["sharpe_ratio"] is None
    # 已观测回撤仍如实给出
    assert performance["max_drawdown"] is not None
