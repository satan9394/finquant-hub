from __future__ import annotations

import json
import sqlite3

import pytest

from app import config, database


@pytest.fixture
def evidence_values() -> dict[str, object]:
    return {
        "schema_version": "canonical-provenance-envelope-v1",
        "data_status": "OK",
        "subject_type": "instrument",
        "subject_id": "usAAPL",
        "metric": "price",
        "value_json": json.dumps(200.0),
        "unit": "USD",
        "source": "synthetic-provider",
        "vendor": "synthetic-provider",
        "retrieved_at": "2026-08-11T00:00:00Z",
        "inputs_json": "[]",
        "quality_flags_json": "[]",
        "license_scope": "fixture-only",
    }


async def insert_evidence(user_id: int, evidence_id: str, kind: str, values: dict[str, object]) -> int:
    return await database.execute(
        "INSERT INTO evidence_objects "
        "(user_id, evidence_id, schema_version, kind, data_status, subject_type, subject_id, "
        "metric, value_json, unit, source, vendor, retrieved_at, inputs_json, formula, "
        "method_version, quality_flags_json, license_scope) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user_id,
            evidence_id,
            values["schema_version"],
            kind,
            values["data_status"],
            values["subject_type"],
            values["subject_id"],
            values.get("metric"),
            values["value_json"],
            values.get("unit"),
            values.get("source"),
            values.get("vendor"),
            values["retrieved_at"],
            values["inputs_json"],
            values.get("formula"),
            values.get("method_version"),
            values["quality_flags_json"],
            values["license_scope"],
        ),
    )


@pytest.mark.asyncio
async def test_evidence_constraints_preserve_unknown_and_computed_boundaries(
    tmp_path, monkeypatch, evidence_values
):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "evidence.db")
    await database.init_db()
    try:
        owner_id = await database.execute("INSERT INTO users (email) VALUES ('evidence@test.local')")
        await database.claim_unowned_data(owner_id)

        unknown = {
            **evidence_values,
            "data_status": "UNKNOWN",
            "value_json": "null",
            "quality_flags_json": '["UNKNOWN"]',
        }
        await insert_evidence(owner_id, "ev_unknown_price_001", "observed_fact", unknown)

        with pytest.raises(sqlite3.IntegrityError):
            await insert_evidence(
                owner_id,
                "ev_unknown_zero_0001",
                "observed_fact",
                {**unknown, "value_json": "0"},
            )
        with pytest.raises(sqlite3.IntegrityError):
            await insert_evidence(
                owner_id,
                "ev_observed_no_source",
                "observed_fact",
                {**evidence_values, "source": None},
            )
        with pytest.raises(sqlite3.IntegrityError):
            await insert_evidence(
                owner_id,
                "ev_computed_no_inputs",
                "computed_result",
                {**evidence_values, "source": "finquant", "formula": "x", "method_version": "v1"},
            )
        with pytest.raises(sqlite3.IntegrityError):
            await insert_evidence(
                owner_id,
                "ev_fact_with_inputs_01",
                "observed_fact",
                {**evidence_values, "inputs_json": '["ev_input_value_001"]'},
            )
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_evidence_input_references_are_owner_scoped(tmp_path, monkeypatch, evidence_values):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "evidence-isolation.db")
    await database.init_db()
    try:
        first_id = await database.execute("INSERT INTO users (email) VALUES ('first@test.local')")
        second_id = await database.execute("INSERT INTO users (email) VALUES ('second@test.local')")
        await database.claim_unowned_data(first_id)

        await insert_evidence(first_id, "ev_input_owner_one", "observed_fact", evidence_values)
        await insert_evidence(second_id, "ev_input_owner_two", "observed_fact", evidence_values)
        derived = {
            **evidence_values,
            "subject_type": "strategy",
            "subject_id": "ma-crossover:usAAPL",
            "metric": "total_return",
            "source": "finquant",
            "inputs_json": '["ev_input_owner_one"]',
            "formula": "ending_equity / initial_equity - 1",
            "method_version": "ma-crossover-v2",
        }
        await insert_evidence(first_id, "ev_derived_owner_one", "computed_result", derived)
        await database.execute(
            "INSERT INTO evidence_input_refs "
            "(user_id, derived_evidence_id, input_evidence_id) VALUES (?, ?, ?)",
            (first_id, "ev_derived_owner_one", "ev_input_owner_one"),
        )

        with pytest.raises(sqlite3.IntegrityError):
            await database.execute(
                "INSERT INTO evidence_input_refs "
                "(user_id, derived_evidence_id, input_evidence_id) VALUES (?, ?, ?)",
                (first_id, "ev_derived_owner_one", "ev_input_owner_two"),
            )

        rows = await database.query_all(
            "SELECT derived_evidence_id, input_evidence_id FROM evidence_input_refs WHERE user_id=?",
            (first_id,),
        )
        assert rows == [{
            "derived_evidence_id": "ev_derived_owner_one",
            "input_evidence_id": "ev_input_owner_one",
        }]
    finally:
        await database.close_db()
