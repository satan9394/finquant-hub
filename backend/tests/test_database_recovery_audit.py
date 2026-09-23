from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import sys

import pytest

from app import config, database
from app.services.investment_memory import create_memory
from app.services.provenance import computed_envelope, persist_envelope, quote_envelope

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from audit_database_recovery import RecoveryDrillError, main, perform_recovery_drill


async def _build_source(path: Path) -> dict[str, int | str]:
    config.DB_PATH = path
    await database.init_db()
    user_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    quote = quote_envelope(
        {
            "code": "usAAPL",
            "price": 100.0,
            "timestamp": 1786636800,
            "source": "deterministic-fixture",
            "currency": "USD",
            "quality_flags": [],
        },
        retrieved_at="2026-08-13T16:00:00Z",
    )
    await persist_envelope(quote, user_id=user_id)
    computed = computed_envelope(
        subject_type="strategy",
        subject_id="fixture:recovery",
        metric="total_return",
        value=0.1,
        unit="ratio",
        inputs=[quote["evidence_id"]],
        formula="ending / starting - 1",
        method_version="recovery-fixture-v1",
        retrieved_at="2026-08-13T16:00:00Z",
    )
    await persist_envelope(computed, user_id=user_id)
    memory = await create_memory(
        user_id=user_id,
        subject_type="instrument",
        subject_id="usAAPL",
        memory_type="evidence_reference",
        information_kind="FACT",
        content={"private": "must-not-appear-in-audit"},
        source_kind="evidence",
        evidence_id=quote["evidence_id"],
        status="confirmed",
        created_by="user",
    )
    job_id = await database.execute(
        "INSERT INTO scheduled_research_jobs "
        "(name, ticker, company_name, cron_expr, is_enabled, user_id) "
        "VALUES (?, ?, ?, ?, 1, ?)",
        ("fixture", "usAAPL", "Fixture Apple", "0 8 * * *", user_id),
    )
    report_id = await database.execute(
        "INSERT INTO research_reports "
        "(ticker, report_data, status, user_id) VALUES (?, ?, 'completed', ?)",
        ("usAAPL", '{"private":"report-body"}', user_id),
    )
    run_id = await database.execute(
        "INSERT INTO scheduled_research_runs "
        "(user_id, job_id, run_key, idempotency_key, attempt, report_id, status, "
        "evidence_status, evidence_ids_json, memory_record_ids_json, started_at, completed_at) "
        "VALUES (?, ?, ?, ?, 1, ?, 'completed', 'OK', ?, ?, ?, ?)",
        (
            user_id,
            job_id,
            "a" * 64,
            "a" * 64,
            report_id,
            json.dumps([quote["evidence_id"], computed["evidence_id"]]),
            json.dumps([memory["id"]]),
            "2026-08-13T16:00:00Z",
            "2026-08-13T16:00:01Z",
        ),
    )
    await database.execute(
        "UPDATE research_reports SET scheduled_run_id=? WHERE id=? AND user_id=?",
        (run_id, report_id, user_id),
    )
    await database.close_db()
    return {
        "user_id": user_id,
        "other_id": other_id,
        "job_id": job_id,
        "run_id": run_id,
        "report_id": report_id,
        "quote_id": quote["evidence_id"],
        "memory_id": memory["id"],
    }


@pytest.mark.asyncio
async def test_backup_restore_drill_preserves_snapshot_and_audits_refs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_path = config.DB_PATH
    source = tmp_path / "source.db"
    ids = await _build_source(source)
    monkeypatch.setattr(config, "DB_PATH", original_path)
    before = source.read_bytes()

    result = perform_recovery_drill(source, tmp_path / "backup.db", tmp_path / "restore.db")

    assert result["schema_version"] == "database-recovery-audit/v1"
    assert result["status"] == "PASS"
    assert result["checks"] == {
        "backup_matches_source": True,
        "restore_matches_source": True,
        "all_integrity_checks_pass": True,
        "all_logical_audits_pass": True,
    }
    assert result["artifacts"]["source"]["schema_version"] == database._SCHEMA_VERSION
    assert result["artifacts"]["source"]["logical_fingerprint"] == result["artifacts"]["backup"]["logical_fingerprint"]
    assert result["artifacts"]["source"]["logical_fingerprint"] == result["artifacts"]["restore"]["logical_fingerprint"]
    assert result["audits"]["restore"]["counts"]["scheduled_run_evidence_refs"] == 2
    assert result["audits"]["restore"]["counts"]["scheduled_run_memory_refs"] == 1
    assert result["audits"]["restore"]["issues"] == []
    assert source.read_bytes() == before
    serialized = json.dumps(result)
    assert "must-not-appear-in-audit" not in serialized
    assert "report-body" not in serialized
    assert str(ids["quote_id"]) not in serialized


@pytest.mark.asyncio
async def test_drill_refuses_overlap_or_existing_targets(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_path = config.DB_PATH
    source = tmp_path / "source.db"
    await _build_source(source)
    monkeypatch.setattr(config, "DB_PATH", original_path)
    existing = tmp_path / "existing.db"
    existing.write_text("preserve", encoding="utf-8")

    with pytest.raises(RecoveryDrillError, match="distinct"):
        perform_recovery_drill(source, source, tmp_path / "restore.db")
    with pytest.raises(RecoveryDrillError, match="already exists"):
        perform_recovery_drill(source, existing, tmp_path / "restore.db")
    assert existing.read_text(encoding="utf-8") == "preserve"


@pytest.mark.asyncio
async def test_logical_audit_reports_dangling_cross_owner_duplicate_and_bad_json(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_path = config.DB_PATH
    source = tmp_path / "source.db"
    ids = await _build_source(source)
    monkeypatch.setattr(config, "DB_PATH", original_path)
    connection = sqlite3.connect(source)
    try:
        connection.execute(
            "UPDATE scheduled_research_runs SET evidence_ids_json=?, memory_record_ids_json=? WHERE id=?",
            (
                json.dumps([
                    ids["quote_id"], ids["quote_id"],
                    "ev_missing_001", "ev_other_owner_001",
                ]),
                json.dumps([ids["memory_id"], 999999]),
                ids["run_id"],
            ),
        )
        connection.execute(
            "INSERT INTO evidence_objects "
            "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, "
            "value_json, source, retrieved_at, license_scope) "
            "VALUES (?, 'ev_other_owner_001', 'observed_fact', 'OK', 'instrument', "
            "'usMSFT', 'price', '1', 'fixture', '2026-08-13T16:00:00Z', 'fixture')",
            (ids["other_id"],),
        )
        connection.execute(
            "UPDATE evidence_objects SET inputs_json='[\"ev_other_owner_001\"]' "
            "WHERE user_id=? AND evidence_id!=? AND kind='computed_result'",
            (ids["user_id"], ids["quote_id"]),
        )
        connection.execute(
            "UPDATE research_reports SET scheduled_run_id=NULL WHERE id=?",
            (ids["report_id"],),
        )
        connection.execute(
            "INSERT INTO scheduled_research_runs "
            "(user_id, job_id, run_key, idempotency_key, attempt, status, evidence_status, "
            "evidence_ids_json, memory_record_ids_json, started_at, completed_at) "
            "VALUES (?, ?, ?, ?, 1, 'failed', 'UPSTREAM_ERROR', '[]', ?, ?, ?)",
            (
                ids["user_id"], ids["job_id"], "b" * 64, "b" * 64,
                json.dumps([999999]), "2026-08-13T17:00:00Z", "2026-08-13T17:00:01Z",
            ),
        )
        connection.execute("PRAGMA ignore_check_constraints=ON")
        connection.execute(
            "UPDATE scheduled_research_runs SET memory_record_ids_json='not-json' WHERE id=?",
            (ids["run_id"],),
        )
        connection.commit()
    finally:
        connection.close()

    result = perform_recovery_drill(source, tmp_path / "backup.db", tmp_path / "restore.db")
    issue_codes = {issue["code"] for issue in result["audits"]["restore"]["issues"]}

    assert result["status"] == "FAIL"
    assert "EVIDENCE_INPUT_MISMATCH" in issue_codes
    assert "SCHEDULED_RUN_EVIDENCE_DUPLICATE" in issue_codes
    assert "SCHEDULED_RUN_EVIDENCE_DANGLING" in issue_codes
    assert "SCHEDULED_RUN_EVIDENCE_CROSS_OWNER" in issue_codes
    assert "SCHEDULED_RUN_MEMORY_JSON_INVALID" in issue_codes
    assert "SCHEDULED_RUN_MEMORY_DANGLING" in issue_codes
    assert "RUN_REPORT_BACKLINK_MISMATCH" in issue_codes
    assert main([str(source), str(tmp_path / "backup-2.db"), str(tmp_path / "restore-2.db")]) == 1
