from __future__ import annotations

import json

import pytest

from app import config, database
from app.main import app
from app.services.evidence_audit import audit_evidence, export_evidence_manifest
from app.services.provenance import (
    computed_envelope,
    persist_envelope,
    quote_envelope,
    research_report_envelope,
)

RETRIEVED_AT = "2026-08-11T00:00:00Z"


@pytest.mark.asyncio
async def test_audit_and_manifest_are_owner_scoped_and_redacted(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "audit.db")
    await database.init_db()
    try:
        first_id = await database.execute("INSERT INTO users (email) VALUES ('first@test.local')")
        second_id = await database.execute("INSERT INTO users (email) VALUES ('second@test.local')")
        await database.claim_unowned_data(first_id)

        quote = quote_envelope(
            {
                "code": "sh600519",
                "price": 1688.0,
                "timestamp": 1786422000,
                "source": "synthetic-provider",
                "currency": "CNY",
                "quality_flags": [],
            },
            retrieved_at=RETRIEVED_AT,
        )
        await persist_envelope(quote, user_id=first_id)
        computed = computed_envelope(
            subject_type="strategy",
            subject_id="fixture:strategy",
            metric="total_return",
            value=0.16,
            unit="ratio",
            inputs=[quote["evidence_id"]],
            formula="ending_equity / initial_equity - 1",
            method_version="calculate-performance-v1",
            retrieved_at=RETRIEVED_AT,
        )
        await persist_envelope(computed, user_id=first_id)
        report = research_report_envelope(
            {
                "id": 42,
                "ticker": "AAPL",
                "status": "completed",
                "report_data": {"schema_version": 2, "summary": "private AI synthesis"},
                "updated_at": RETRIEVED_AT,
            },
            retrieved_at=RETRIEVED_AT,
        )
        await persist_envelope(report, user_id=first_id)
        await persist_envelope(
            quote_envelope(
                {"code": "usMSFT", "price": 1.0, "source": "other-user", "quality_flags": []},
                retrieved_at=RETRIEVED_AT,
            ),
            user_id=second_id,
        )

        audit = await audit_evidence(first_id)
        manifest = await export_evidence_manifest(first_id)
        serialized = json.dumps(manifest, ensure_ascii=False)

        assert audit["status"] == "PASS"
        assert audit["total"] == 3
        assert audit["dangling_references"] == []
        assert audit["input_reference_mismatches"] == []
        assert manifest["schema_version"] == "finquant-evidence-manifest-v2"
        assert len(manifest["items"]) == 3
        assert "other-user" not in serialized
        assert "private AI synthesis" not in serialized
        assert "encrypted_value" not in serialized
        assert "token_hash" not in serialized
        document = next(item for item in manifest["items"] if item["kind"] == "document_excerpt")
        assert document["value"] == {"document_id": "research_report:42", "redacted": True}
        assert "EXPORT_VALUE_REDACTED" in document["quality_flags"]

        await database.execute(
            "UPDATE evidence_objects SET inputs_json='[\"ev_missing_input_001\"]' "
            "WHERE evidence_id=? AND user_id=?",
            (computed["evidence_id"], first_id),
        )
        failed = await audit_evidence(first_id)
        assert failed["status"] == "FAIL"
        assert failed["input_reference_mismatches"][0]["evidence_id"] == computed["evidence_id"]
    finally:
        await database.close_db()


def test_openapi_registers_read_only_evidence_endpoints() -> None:
    schema = app.openapi()
    assert set(schema["paths"]["/api/research/evidence/audit"]) == {"get"}
    assert set(schema["paths"]["/api/research/evidence/export"]) == {"get"}
