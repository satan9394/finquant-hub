"""Create and verify a non-overwriting SQLite backup/restore drill."""

from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Any, Iterable

JSONDict = dict[str, Any]
SCHEMA_VERSION = "database-recovery-audit/v1"
MINIMUM_SUPPORTED_DB_VERSION = 23
MAX_REPORTED_ISSUES = 100


class RecoveryDrillError(ValueError):
    """Raised before a drill would use an unsafe or unusable path."""


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _readonly_connection(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    return connection


def _validate_paths(source: Path, backup: Path, restore: Path) -> tuple[Path, Path, Path]:
    resolved = tuple(path.resolve() for path in (source, backup, restore))
    if len(set(resolved)) != 3:
        raise RecoveryDrillError("source, backup, and restore paths must be distinct")
    resolved_source, resolved_backup, resolved_restore = resolved
    if not resolved_source.is_file():
        raise RecoveryDrillError("source database does not exist or is not a file")
    for target in (resolved_backup, resolved_restore):
        if target.exists():
            raise RecoveryDrillError(f"target already exists: {target}")
        if not target.parent.is_dir():
            raise RecoveryDrillError(f"target parent directory does not exist: {target.parent}")
    return resolved_source, resolved_backup, resolved_restore


def _reserve_new_database(path: Path) -> sqlite3.Connection:
    with path.open("xb"):
        pass
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=rw", uri=True)
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def _copy_database(source: Path, target: Path) -> None:
    with closing(_readonly_connection(source)) as source_connection:
        with closing(_reserve_new_database(target)) as target_connection:
            source_connection.backup(target_connection)
            target_connection.commit()


def _encoded_value(value: Any) -> JSONDict:
    if value is None:
        return {"type": "null", "value": None}
    if isinstance(value, bytes):
        return {"type": "blob", "value": value.hex()}
    if isinstance(value, bool):
        return {"type": "integer", "value": int(value)}
    if isinstance(value, int):
        return {"type": "integer", "value": value}
    if isinstance(value, float):
        return {"type": "real", "value": value.hex()}
    return {"type": "text", "value": str(value)}


def _logical_fingerprint(connection: sqlite3.Connection) -> tuple[str, JSONDict]:
    tables = [
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' "
            "ORDER BY name"
        )
    ]
    digest = hashlib.sha256()
    counts: JSONDict = {}
    for table in tables:
        quoted = _quote_identifier(table)
        columns = [
            str(row[1])
            for row in connection.execute(f"PRAGMA table_info({quoted})")
        ]
        row_hashes: list[bytes] = []
        for row in connection.execute(f"SELECT * FROM {quoted}"):
            payload = json.dumps(
                [_encoded_value(value) for value in row],
                ensure_ascii=True,
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
            row_hashes.append(hashlib.sha256(payload).digest())
        counts[table] = len(row_hashes)
        digest.update(table.encode())
        digest.update(json.dumps(columns, separators=(",", ":")).encode())
        for row_hash in sorted(row_hashes):
            digest.update(row_hash)
    return digest.hexdigest(), counts


class _IssueCollector:
    def __init__(self) -> None:
        self.total = 0
        self.items: list[JSONDict] = []

    def add(self, code: str, table: str, row_id: int | str | None) -> None:
        self.total += 1
        if len(self.items) < MAX_REPORTED_ISSUES:
            item: JSONDict = {"code": code, "table": table}
            if row_id is not None:
                item["row_id"] = row_id
            self.items.append(item)


def _table_names(connection: sqlite3.Connection) -> set[str]:
    return {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
    }


def _parse_reference_array(
    raw: Any,
    *,
    table: str,
    row_id: int | str,
    prefix: str,
    expected_type: type[int] | type[str],
    collector: _IssueCollector,
) -> list[int | str] | None:
    try:
        value = json.loads(str(raw))
    except (TypeError, ValueError):
        collector.add(f"{prefix}_JSON_INVALID", table, row_id)
        return None
    if not isinstance(value, list) or any(
        not isinstance(item, expected_type) or isinstance(item, bool) for item in value
    ):
        collector.add(f"{prefix}_JSON_INVALID", table, row_id)
        return None
    if len(value) != len({(type(item).__name__, item) for item in value}):
        collector.add(f"{prefix}_DUPLICATE", table, row_id)
    return value


def _owners_by_key(
    connection: sqlite3.Connection, table: str, key: str,
) -> dict[int | str, set[int]]:
    quoted_table = _quote_identifier(table)
    quoted_key = _quote_identifier(key)
    owners: dict[int | str, set[int]] = {}
    for row in connection.execute(
        f"SELECT user_id, {quoted_key} FROM {quoted_table}"
    ):
        owners.setdefault(row[1], set()).add(int(row[0]))
    return owners


def _check_reference(
    *,
    owners: dict[int | str, set[int]],
    reference: int | str,
    user_id: int,
    prefix: str,
    table: str,
    row_id: int | str,
    collector: _IssueCollector,
) -> None:
    reference_owners = owners.get(reference, set())
    if user_id in reference_owners:
        return
    code = f"{prefix}_CROSS_OWNER" if reference_owners else f"{prefix}_DANGLING"
    collector.add(code, table, row_id)


def _logical_audit(connection: sqlite3.Connection) -> JSONDict:
    collector = _IssueCollector()
    counts: JSONDict = {
        "evidence_objects": 0,
        "memory_records": 0,
        "scheduled_run_evidence_refs": 0,
        "scheduled_run_memory_refs": 0,
        "thesis_review_evidence_refs": 0,
        "run_report_links": 0,
    }
    required = {
        "evidence_objects", "evidence_input_refs", "memory_records",
        "scheduled_research_runs", "research_reports", "thesis_review_items",
    }
    available = _table_names(connection)
    for missing in sorted(required - available):
        collector.add("REQUIRED_TABLE_MISSING", missing, None)
    if required - available:
        return {
            "status": "FAIL",
            "counts": counts,
            "issue_count": collector.total,
            "issues_truncated": collector.total > len(collector.items),
            "issues": collector.items,
        }

    evidence_owners = _owners_by_key(connection, "evidence_objects", "evidence_id")
    memory_owners = _owners_by_key(connection, "memory_records", "id")
    counts["evidence_objects"] = sum(len(owners) for owners in evidence_owners.values())
    counts["memory_records"] = sum(len(owners) for owners in memory_owners.values())

    input_refs: dict[tuple[int, str], set[str]] = {}
    for row in connection.execute(
        "SELECT user_id, derived_evidence_id, input_evidence_id FROM evidence_input_refs"
    ):
        input_refs.setdefault((int(row[0]), str(row[1])), set()).add(str(row[2]))
    for row in connection.execute(
        "SELECT id, user_id, evidence_id, inputs_json FROM evidence_objects"
    ):
        row_id, user_id, evidence_id = int(row[0]), int(row[1]), str(row[2])
        expected = _parse_reference_array(
            row[3], table="evidence_objects", row_id=row_id,
            prefix="EVIDENCE_INPUT", expected_type=str, collector=collector,
        )
        if expected is None:
            continue
        for reference in expected:
            _check_reference(
                owners=evidence_owners, reference=reference, user_id=user_id,
                prefix="EVIDENCE_INPUT", table="evidence_objects", row_id=row_id,
                collector=collector,
            )
        if set(str(item) for item in expected) != input_refs.get((user_id, evidence_id), set()):
            collector.add("EVIDENCE_INPUT_MISMATCH", "evidence_objects", row_id)

    run_rows = list(connection.execute(
        "SELECT id, user_id, report_id, evidence_ids_json, memory_record_ids_json "
        "FROM scheduled_research_runs"
    ))
    for row in run_rows:
        run_id, user_id = int(row[0]), int(row[1])
        evidence_refs = _parse_reference_array(
            row[3], table="scheduled_research_runs", row_id=run_id,
            prefix="SCHEDULED_RUN_EVIDENCE", expected_type=str, collector=collector,
        )
        if evidence_refs is not None:
            counts["scheduled_run_evidence_refs"] += len(evidence_refs)
            for reference in evidence_refs:
                _check_reference(
                    owners=evidence_owners, reference=reference, user_id=user_id,
                    prefix="SCHEDULED_RUN_EVIDENCE", table="scheduled_research_runs",
                    row_id=run_id, collector=collector,
                )
        memory_refs = _parse_reference_array(
            row[4], table="scheduled_research_runs", row_id=run_id,
            prefix="SCHEDULED_RUN_MEMORY", expected_type=int, collector=collector,
        )
        if memory_refs is not None:
            counts["scheduled_run_memory_refs"] += len(memory_refs)
            for reference in memory_refs:
                _check_reference(
                    owners=memory_owners, reference=reference, user_id=user_id,
                    prefix="SCHEDULED_RUN_MEMORY", table="scheduled_research_runs",
                    row_id=run_id, collector=collector,
                )

    for row in connection.execute(
        "SELECT id, user_id, evidence_ids_json FROM thesis_review_items"
    ):
        row_id, user_id = int(row[0]), int(row[1])
        evidence_refs = _parse_reference_array(
            row[2], table="thesis_review_items", row_id=row_id,
            prefix="THESIS_REVIEW_EVIDENCE", expected_type=str, collector=collector,
        )
        if evidence_refs is None:
            continue
        counts["thesis_review_evidence_refs"] += len(evidence_refs)
        for reference in evidence_refs:
            _check_reference(
                owners=evidence_owners, reference=reference, user_id=user_id,
                prefix="THESIS_REVIEW_EVIDENCE", table="thesis_review_items",
                row_id=row_id, collector=collector,
            )

    reports = {
        (int(row[0]), int(row[1])): row[2]
        for row in connection.execute(
            "SELECT user_id, id, scheduled_run_id FROM research_reports"
        )
    }
    runs = {
        (int(row[1]), int(row[0])): row[2]
        for row in run_rows
    }
    for (user_id, run_id), report_id in runs.items():
        if report_id is None:
            continue
        counts["run_report_links"] += 1
        report_key = (user_id, int(report_id))
        if report_key not in reports:
            cross_owner = any(key[1] == int(report_id) for key in reports)
            collector.add(
                "RUN_REPORT_CROSS_OWNER" if cross_owner else "RUN_REPORT_DANGLING",
                "scheduled_research_runs", run_id,
            )
        elif reports[report_key] != run_id:
            collector.add("RUN_REPORT_BACKLINK_MISMATCH", "scheduled_research_runs", run_id)
    for (user_id, report_id), run_id in reports.items():
        if run_id is None:
            continue
        run_key = (user_id, int(run_id))
        if run_key not in runs:
            cross_owner = any(key[1] == int(run_id) for key in runs)
            collector.add(
                "REPORT_RUN_CROSS_OWNER" if cross_owner else "REPORT_RUN_DANGLING",
                "research_reports", report_id,
            )
        elif runs[run_key] != report_id:
            collector.add("REPORT_RUN_BACKLINK_MISMATCH", "research_reports", report_id)

    return {
        "status": "PASS" if collector.total == 0 else "FAIL",
        "counts": counts,
        "issue_count": collector.total,
        "issues_truncated": collector.total > len(collector.items),
        "issues": collector.items,
    }


def _integrity_audit(connection: sqlite3.Connection) -> JSONDict:
    integrity_messages = [str(row[0]) for row in connection.execute("PRAGMA integrity_check")]
    foreign_rows = list(connection.execute("PRAGMA foreign_key_check"))
    foreign_violations = [
        {"table": str(row[0]), "row_id": row[1], "parent": str(row[2]), "fk_index": row[3]}
        for row in foreign_rows[:MAX_REPORTED_ISSUES]
    ]
    passed = integrity_messages == ["ok"] and not foreign_rows
    return {
        "status": "PASS" if passed else "FAIL",
        "integrity_check": "ok" if integrity_messages == ["ok"] else "failed",
        "integrity_message_count": 0 if integrity_messages == ["ok"] else len(integrity_messages),
        "foreign_key_violation_count": len(foreign_rows),
        "foreign_key_violations_truncated": len(foreign_rows) > len(foreign_violations),
        "foreign_key_violations": foreign_violations,
    }


def _inspect_database(path: Path) -> tuple[JSONDict, JSONDict]:
    with closing(_readonly_connection(path)) as connection:
        version_row = connection.execute("PRAGMA user_version").fetchone()
        version = int(version_row[0]) if version_row else 0
        fingerprint, table_counts = _logical_fingerprint(connection)
        integrity = _integrity_audit(connection)
        logical = _logical_audit(connection)
    artifact = {
        "file_size_bytes": path.stat().st_size,
        "schema_version": version,
        "supported_schema": version >= MINIMUM_SUPPORTED_DB_VERSION,
        "logical_fingerprint": fingerprint,
        "table_count": len(table_counts),
        "table_count_scope": "sqlite_master_tables_including_fts_internal",
        "row_count": sum(int(count) for count in table_counts.values()),
        "table_row_counts": table_counts,
    }
    audit_status = (
            "PASS"
            if artifact["supported_schema"]
            and integrity["status"] == "PASS"
            and logical["status"] == "PASS"
            else "FAIL"
        )
    audit = {
        **logical,
        "status": audit_status,
        "logical_status": logical["status"],
        "integrity": integrity,
    }
    return artifact, audit


def perform_recovery_drill(source: Path, backup: Path, restore: Path) -> JSONDict:
    source, backup, restore = _validate_paths(Path(source), Path(backup), Path(restore))
    _copy_database(source, backup)
    _copy_database(backup, restore)

    artifacts: JSONDict = {}
    audits: JSONDict = {}
    for role, path in (("source", source), ("backup", backup), ("restore", restore)):
        artifacts[role], audits[role] = _inspect_database(path)
    source_fingerprint = artifacts["source"]["logical_fingerprint"]
    checks = {
        "backup_matches_source": artifacts["backup"]["logical_fingerprint"] == source_fingerprint,
        "restore_matches_source": artifacts["restore"]["logical_fingerprint"] == source_fingerprint,
        "all_integrity_checks_pass": all(
            audit["integrity"]["status"] == "PASS" for audit in audits.values()
        ),
        "all_logical_audits_pass": all(audit["status"] == "PASS" for audit in audits.values()),
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "evidence_scope": "explicit_local_sqlite_snapshot_no_upstream_calls",
        "status": "PASS" if all(checks.values()) else "FAIL",
        "safety": {
            "source_opened_read_only": True,
            "targets_required_absent": True,
            "existing_files_overwritten": 0,
            "automatic_repairs": 0,
            "business_content_emitted": False,
        },
        "artifacts": artifacts,
        "audits": audits,
        "checks": checks,
    }


def _error_report(error: Exception) -> JSONDict:
    return {
        "schema_version": SCHEMA_VERSION,
        "status": "ERROR",
        "error_type": type(error).__name__,
        "error": str(error),
    }


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("backup", type=Path)
    parser.add_argument("restore", type=Path)
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        report = perform_recovery_drill(args.source, args.backup, args.restore)
    except (RecoveryDrillError, OSError, sqlite3.DatabaseError) as error:
        print(json.dumps(_error_report(error), ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
