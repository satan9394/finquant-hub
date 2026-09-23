import json
import sys
from decimal import Decimal

import pytest

from app.tools import financial_rigor as rigor


def test_exact_and_number_formatting_cover_supported_units():
    value = Decimal("12.5")
    assert rigor.exact(value) is value
    assert rigor.exact(0.1) == Decimal("0.1")
    assert rigor.exact("2.5") == Decimal("2.5")
    assert rigor.fmt_number(Decimal("12000"), "亿元") == "1.20万亿元"
    assert rigor.fmt_number(Decimal("12"), "亿") == "12.00亿"
    assert rigor.fmt_number(Decimal("2000000000000")) == "2.00T"
    assert rigor.fmt_number(Decimal("3000000000")) == "3.00B"
    assert rigor.fmt_number(Decimal("4000000")) == "4.00M"
    assert rigor.fmt_number(Decimal("1234")) == "1,234.00"


@pytest.mark.parametrize(
    ("reported", "expected"),
    [(100, True), (98, True), (80, False), (0, True)],
)
def test_verify_market_cap_classifies_deviation(reported, expected, capsys):
    assert rigor.verify_market_cap(10, 10, reported, "CNY") is expected
    assert "市值验算" in capsys.readouterr().out


def test_verify_valuation_calculates_every_supported_metric(capsys):
    result = rigor.verify_valuation(
        100,
        eps=5,
        bvps=20,
        fcf_per_share=4,
        dividend=2,
        revenue_per_share=25,
    )
    assert result == {
        "PE": 20.0,
        "PB": 5.0,
        "ROE": 25.0,
        "P_FCF": 25.0,
        "FCF_Yield": 4.0,
        "Dividend_Yield": 2.0,
        "PS": 4.0,
    }
    assert "精确十进制" in capsys.readouterr().out


def test_verify_valuation_handles_zero_denominators():
    assert rigor.verify_valuation(0, eps=0, bvps=0, fcf_per_share=0, dividend=2, revenue_per_share=0) == {}


def test_cross_validate_handles_consensus_and_outlier():
    consistent = rigor.cross_validate("revenue", {"annual": 100, "exchange": 101, "vendor": 99})
    assert consistent == {"consensus": 100.0, "all_consistent": True}
    inconsistent = rigor.cross_validate("profit", {"a": 0, "b": 0})
    assert inconsistent == {"consensus": 0.0, "all_consistent": True}
    even = rigor.cross_validate("cash", {"a": 100, "b": 200}, tolerance_pct=2)
    assert even == {"consensus": 150.0, "all_consistent": False}


def test_benford_check_rejects_small_sample_and_scores_large_sample(capsys):
    assert rigor.benford_check([1, 2, 3]) is None
    result = rigor.benford_check([100 + index for index in range(100)])
    assert result is not None
    assert result["is_conforming"] is False
    assert "样本量" in capsys.readouterr().out


def test_exact_calc_accepts_arithmetic_and_rejects_unsafe_or_invalid():
    assert rigor.exact_calc("(10 + 2) * 3") == 36.0
    assert rigor.exact_calc("__import__('os')") is None
    assert rigor.exact_calc("1 / 0") is None


def test_three_scenario_valuation_is_auditable(capsys):
    rigor.three_scenario_valuation(100, 5, 0.2, 0.1, -0.1, 25, 20, 12, years=2, currency="CNY")
    output = capsys.readouterr().out
    assert "Bull" in output and "Base" in output and "Bear" in output
    assert "可审计复现" in output


@pytest.mark.parametrize(
    "argv",
    [
        ["financial_rigor", "verify-market-cap", "--price", "10", "--shares", "10", "--reported", "100"],
        ["financial_rigor", "verify-valuation", "--price", "100", "--eps", "5"],
        ["financial_rigor", "cross-validate", "--field", "revenue", "--values", json.dumps({"a": 1, "b": 1})],
        ["financial_rigor", "benford", "--values", json.dumps([1, 2, 3])],
        ["financial_rigor", "calc", "--expr", "2*3"],
        ["financial_rigor", "three-scenario", "--price", "100", "--eps", "5", "--growth", ".2", ".1", "0", "--pe", "25", "20", "15"],
        ["financial_rigor"],
    ],
)
def test_cli_dispatches_each_command(monkeypatch, argv, capsys):
    monkeypatch.setattr(sys, "argv", argv)
    rigor.main()
    assert capsys.readouterr().out

