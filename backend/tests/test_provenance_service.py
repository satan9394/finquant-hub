from __future__ import annotations

import copy
import json
from pathlib import Path

from jsonschema import Draft202012Validator
import pytest

from app import config, database
from app.services.provenance import (
    fundamental_envelope,
    persist_envelope,
    quote_envelope,
    research_report_envelope,
)

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "docs" / "ai" / "schemas" / "canonical_provenance_envelope.v1.schema.json"
RETRIEVED_AT = "2026-08-11T00:00:00Z"


def validator() -> Draft202012Validator:
    return Draft202012Validator(json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))


def test_market_and_fundamental_adapters_preserve_provenance() -> None:
    quote = {
        "code": "sh600519",
        "price": 1688.0,
        "timestamp": 1786422000,
        "source": "tencent",
        "market": "CN",
        "currency": "CNY",
        "adjustment": "not_applicable",
        "frequency": "realtime_or_delayed",
        "quality_flags": ["DELAY_UNKNOWN"],
        "license_scope": "display-and-research",
    }
    fundamental = {
        "metric": "trailingPeRatio",
        "value": None,
        "as_of": None,
        "period_type": "TTM",
        "currency": "USD",
        "adjustment": "not_applicable",
        "frequency": "TTM",
        "provider": "yahoo",
        "source": "yahoo.fundamentals_timeseries",
        "quality_flags": ["UNKNOWN"],
    }
    original_quote = copy.deepcopy(quote)
    original_fundamental = copy.deepcopy(fundamental)

    quote_result = quote_envelope(quote, retrieved_at=RETRIEVED_AT)
    fundamental_result = fundamental_envelope(
        fundamental,
        subject_id="AAPL",
        retrieved_at=RETRIEVED_AT,
    )

    validator().validate(quote_result)
    validator().validate(fundamental_result)
    assert quote == original_quote
    assert fundamental == original_fundamental
    assert quote_result["source"] == quote_result["vendor"] == "tencent"
    assert quote_result["market"] == "CN"
    assert quote_result["currency"] == quote_result["unit"] == "CNY"
    assert quote_result["adjustment"] == "not_applicable"
    assert quote_result["frequency"] == "realtime_or_delayed"
    assert quote_result["quality_flags"] == ["DELAY_UNKNOWN"]
    assert fundamental_result["data_status"] == "UNKNOWN"
    assert fundamental_result["value"] is None
    assert fundamental_result["source"] == "yahoo.fundamentals_timeseries"
    assert fundamental_result["vendor"] == "yahoo"
    assert fundamental_result["period_type"] == "TTM"
    assert fundamental_result["currency"] == "USD"
    assert fundamental_result["quality_flags"] == ["UNKNOWN"]


def test_research_report_is_a_document_reference_not_a_fact() -> None:
    report = {
        "id": 42,
        "ticker": "AAPL",
        "company_name": "Apple",
        "status": "completed",
        "report_data": {"schema_version": 2, "summary": "AI synthesis"},
        "created_at": "2026-08-10T00:00:00Z",
        "updated_at": "2026-08-11T00:00:00Z",
    }
    original = copy.deepcopy(report)
    result = research_report_envelope(report, retrieved_at=RETRIEVED_AT)

    validator().validate(result)
    assert report == original
    assert result["kind"] == "document_excerpt"
    assert result["metric"] is None
    assert result["document_id"] == "research_report:42"
    assert result["value"] == {"report_id": 42, "report_schema_version": 2}
    assert result["quality_flags"] == ["AI_GENERATED_CONTENT_NOT_FACT"]
    assert "summary" not in result["value"]


@pytest.mark.asyncio
async def test_explicit_persistence_keeps_owner_and_unknown(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "provenance.db")
    await database.init_db()
    try:
        owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
        await database.claim_unowned_data(owner_id)
        item = {
            "metric": "trailingPeRatio",
            "value": None,
            "as_of": None,
            "period_type": "TTM",
            "currency": "USD",
            "provider": "yahoo",
            "source": "yahoo.fundamentals_timeseries",
            "quality_flags": ["UNKNOWN"],
        }
        envelope = fundamental_envelope(item, subject_id="AAPL", retrieved_at=RETRIEVED_AT)
        row_id = await persist_envelope(envelope, user_id=owner_id)
        stored = await database.query_one(
            "SELECT user_id, data_status, value_json, source, vendor, period_type, currency, "
            "quality_flags_json FROM evidence_objects WHERE id=? AND user_id=?",
            (row_id, owner_id),
        )

        assert stored == {
            "user_id": owner_id,
            "data_status": "UNKNOWN",
            "value_json": "null",
            "source": "yahoo.fundamentals_timeseries",
            "vendor": "yahoo",
            "period_type": "TTM",
            "currency": "USD",
            "quality_flags_json": '["UNKNOWN"]',
        }
    finally:
        await database.close_db()
