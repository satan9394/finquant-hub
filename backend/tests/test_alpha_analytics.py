from datetime import date, timedelta
import asyncio

import numpy as np
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.routers import wq
from app.services.alpha_analytics import _average_ranks, analyze_factor_observations


def _observations(periods: int, *, varying_returns: bool = True):
    rows = []
    return_order = (
        (0, 1, 2, 3, 4),
        (0, 2, 1, 3, 4),
        (1, 0, 2, 4, 3),
        (0, 1, 3, 2, 4),
    )
    for period_index in range(periods):
        period_date = (date(2026, 1, 1) + timedelta(days=period_index)).isoformat()
        order = return_order[period_index % len(return_order)] if varying_returns else (0, 1, 2, 3, 4)
        for asset_index, return_rank in enumerate(order):
            rows.append({
                "date": period_date,
                "symbol": f"S{asset_index}",
                "factor": float(asset_index),
                "forward_return": return_rank / 100,
            })
    return rows


def test_average_ranks_use_midranks_for_ties():
    assert _average_ranks(np.asarray([10, 10, 30, 20], dtype=np.float64)).tolist() == [1.5, 1.5, 4.0, 3.0]


def test_twenty_valid_dates_produce_ic_statistics_and_five_cumulative_quantile_curves():
    result = analyze_factor_observations(_observations(20))

    assert result["status"] == "ok"
    assert result["valid_periods"] == 20
    assert len(result["ic_series"]) == len(result["quantile_returns"]["dates"]) == 20
    assert 0 < result["summary"]["ic_mean"] < 1
    assert result["summary"]["ic_std"] > 0
    assert result["summary"]["ic_ir"] > 0
    assert result["summary"]["t_stat"] > 0
    assert result["summary"]["monotonicity_score"] == pytest.approx(1.0)
    assert result["summary"]["factor_autocorrelation"] == pytest.approx(1.0)
    curves = result["quantile_returns"]
    assert set(curves) == {"dates", "q1", "q2", "q3", "q4", "q5", "long_short"}
    assert all(len(curves[f"q{quantile}"]) == 20 for quantile in range(1, 6))
    assert curves["long_short"] == pytest.approx([high - low for high, low in zip(curves["q5"], curves["q1"], strict=True)])
    assert result["summary"]["mean_long_short_turnover"] == pytest.approx(0.025)


def test_insufficient_sample_keeps_actual_series_but_does_not_claim_summary_metrics():
    result = analyze_factor_observations(_observations(19))

    assert result["status"] == "insufficient"
    assert result["valid_periods"] == 19
    assert len(result["ic_series"]) == 19
    assert len(result["quantile_returns"]["q1"]) == 19
    assert set(result["summary"].values()) == {None}


def test_constant_ic_series_protects_icir_and_t_stat_from_division_by_zero():
    result = analyze_factor_observations(_observations(20, varying_returns=False))

    assert result["status"] == "ok"
    assert result["summary"]["ic_mean"] == pytest.approx(1.0)
    assert result["summary"]["ic_std"] == 0
    assert result["summary"]["ic_ir"] is None
    assert result["summary"]["t_stat"] is None


def test_zero_variance_dates_are_excluded_instead_of_emitting_nan():
    rows = _observations(20)
    for row in rows:
        row["forward_return"] = 0.01

    result = analyze_factor_observations(rows)

    assert result["status"] == "insufficient"
    assert result["valid_periods"] == 0
    assert result["summary"]["ic_mean"] is None
    assert len(result["excluded_periods"]) == 20
    assert {item["reason"] for item in result["excluded_periods"]} == {"zero_variance"}


def test_duplicate_observation_and_impossible_return_are_rejected():
    rows = _observations(1)
    with pytest.raises(ValueError, match="重复记录"):
        analyze_factor_observations(rows + [rows[0]])

    rows[0]["forward_return"] = -1.01
    with pytest.raises(ValueError, match="低于 -100%"):
        analyze_factor_observations(rows)


def test_correlation_handles_large_finite_values_without_overflow():
    result = analyze_factor_observations([
        {"date": "2026-01-01", "symbol": f"S{index}", "factor": float(index) * 1e307, "forward_return": index / 100}
        for index in range(5)
    ])

    assert result["status"] == "insufficient"
    assert result["ic_series"][0]["ic"] == pytest.approx(1.0)


def test_factor_analytics_routes_use_submitted_observations_and_scope_cached_results_by_user(monkeypatch):
    cache = wq._FactorAnalyticsCache(ttl_seconds=wq._ANALYTICS_CACHE_TTL_SECONDS, max_entries=4)
    monkeypatch.setattr(wq, "_FACTOR_ANALYTICS_CACHE", cache)
    user_id = 41
    monkeypatch.setattr(wq.auth_service, "current_user_id", lambda: user_id)
    observations = [
        wq.FactorObservation(
            date="2026-01-01", symbol=f"S{index}", factor=float(index), forward_return=index / 100,
        )
        for index in range(5)
    ]

    submitted = asyncio.run(wq.submit_factor_analytics("momentum-test", wq.FactorSimulationIn(observations=observations)))
    loaded = asyncio.run(wq.get_factor_analytics("momentum-test"))

    assert submitted == {"factor_id": "momentum-test", "status": "insufficient", "cache_ttl_seconds": 3600}
    assert loaded["source"] == "user_supplied_observations"
    assert loaded["status"] == "insufficient"
    assert loaded["valid_periods"] == 1
    assert loaded["summary"]["ic_mean"] is None
    assert loaded["cache_ttl_seconds"] <= wq._ANALYTICS_CACHE_TTL_SECONDS
    assert "observations" not in loaded

    monkeypatch.setattr(wq.auth_service, "current_user_id", lambda: user_id + 1)
    with pytest.raises(HTTPException) as raised:
        asyncio.run(wq.get_factor_analytics("momentum-test"))
    assert raised.value.status_code == 404


def test_factor_analytics_route_rejects_invalid_observations_without_caching(monkeypatch):
    cache = wq._FactorAnalyticsCache(ttl_seconds=60, max_entries=4)
    monkeypatch.setattr(wq, "_FACTOR_ANALYTICS_CACHE", cache)
    monkeypatch.setattr(wq.auth_service, "current_user_id", lambda: 41)
    observations = [
        wq.FactorObservation(date="2026-01-01", symbol=f"S{index}", factor=float(index), forward_return=-1.01)
        for index in range(5)
    ]

    with pytest.raises(HTTPException) as raised:
        asyncio.run(wq.submit_factor_analytics("momentum-test", wq.FactorSimulationIn(observations=observations)))
    assert raised.value.status_code == 422
    assert cache.get(41, "momentum-test") is None


def test_analytics_cache_is_bounded_and_expires_on_monotonic_time(monkeypatch):
    now = [100.0]
    monkeypatch.setattr(wq.time, "monotonic", lambda: now[0])
    cache = wq._FactorAnalyticsCache(ttl_seconds=5, max_entries=1)
    cache.put(41, "first", {"summary": {"ic_mean": 0.2}})
    cache.put(41, "second", {"summary": {"ic_mean": 0.3}})

    assert cache.get(41, "first") is None
    assert cache.get(41, "second")[0]["summary"]["ic_mean"] == pytest.approx(0.3)
    now[0] += 6
    assert cache.get(41, "second") is None


def test_factor_analytics_http_post_then_get_contract(monkeypatch):
    cache = wq._FactorAnalyticsCache(ttl_seconds=wq._ANALYTICS_CACHE_TTL_SECONDS, max_entries=4)
    monkeypatch.setattr(wq, "_FACTOR_ANALYTICS_CACHE", cache)
    monkeypatch.setattr(wq.auth_service, "current_user_id", lambda: 41)
    app = FastAPI()
    app.include_router(wq.router)
    payload = {"observations": [
        {"date": "2026-01-01", "symbol": f"S{index}", "factor": float(index), "forward_return": index / 100}
        for index in range(5)
    ]}

    with TestClient(app) as client:
        submitted = client.post("/api/wq/factors/momentum-test/analytics", json=payload)
        loaded = client.get("/api/wq/factors/momentum-test/analytics")
        bad_id = client.get("/api/wq/factors/bad%20id/analytics")

    assert submitted.status_code == 200
    assert submitted.json()["factor_id"] == "momentum-test"
    assert loaded.status_code == 200
    assert loaded.json()["status"] == "insufficient"
    assert len(loaded.json()["quantile_returns"]["dates"]) == 1
    assert bad_id.status_code == 422
