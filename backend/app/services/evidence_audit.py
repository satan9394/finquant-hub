"""Owner-scoped integrity audit and allowlisted evidence manifest export."""

from __future__ import annotations

from datetime import UTC, datetime
import json
from typing import Any

from .. import database

JSONDict = dict[str, Any]


async def audit_evidence(user_id: int) -> JSONDict:
    summary = await database.query_all(
        "SELECT kind, data_status, COUNT(*) AS count FROM evidence_objects "
        "WHERE user_id=? GROUP BY kind, data_status ORDER BY kind, data_status",
        (user_id,),
    )
    rows = await database.query_all(
        "SELECT evidence_id, kind, inputs_json FROM evidence_objects "
        "WHERE user_id=? ORDER BY evidence_id",
        (user_id,),
    )
    refs = await database.query_all(
        "SELECT derived_evidence_id, input_evidence_id FROM evidence_input_refs "
        "WHERE user_id=? ORDER BY derived_evidence_id, input_evidence_id",
        (user_id,),
    )
    dangling = await database.query_all(
        "SELECT r.derived_evidence_id, r.input_evidence_id FROM evidence_input_refs r "
        "LEFT JOIN evidence_objects d ON d.user_id=r.user_id "
        "AND d.evidence_id=r.derived_evidence_id "
        "LEFT JOIN evidence_objects i ON i.user_id=r.user_id "
        "AND i.evidence_id=r.input_evidence_id "
        "WHERE r.user_id=? AND (d.id IS NULL OR i.id IS NULL)",
        (user_id,),
    )
    refs_by_derived: dict[str, set[str]] = {}
    for ref in refs:
        refs_by_derived.setdefault(str(ref["derived_evidence_id"]), set()).add(
            str(ref["input_evidence_id"])
        )
    mismatches = []
    for row in rows:
        expected = set(json.loads(row["inputs_json"]))
        actual = refs_by_derived.get(str(row["evidence_id"]), set())
        if expected != actual:
            mismatches.append({
                "evidence_id": row["evidence_id"],
                "inputs_json": sorted(expected),
                "input_refs": sorted(actual),
            })
    passed = not dangling and not mismatches
    return {
        "schema_version": "evidence-audit-v1",
        "status": "PASS" if passed else "FAIL",
        "total": len(rows),
        "summary": summary,
        "dangling_references": dangling,
        "input_reference_mismatches": mismatches,
    }


async def export_evidence_manifest(user_id: int) -> JSONDict:
    rows = await database.query_all(
        "SELECT evidence_id, schema_version, kind, data_status, subject_type, subject_id, metric, "
        "value_json, unit, source, vendor, document_id, as_of, published_at, retrieved_at, "
        "period_type, market, currency, adjustment, frequency, inputs_json, formula, "
        "method_version, quality_flags_json, confidence, license_scope "
        "FROM evidence_objects WHERE user_id=? ORDER BY evidence_id",
        (user_id,),
    )
    items = []
    for row in rows:
        quality_flags = list(json.loads(row["quality_flags_json"]))
        value = json.loads(row["value_json"])
        if row["kind"] == "document_excerpt":
            value = {"document_id": row["document_id"], "redacted": True}
            if "EXPORT_VALUE_REDACTED" not in quality_flags:
                quality_flags.append("EXPORT_VALUE_REDACTED")
        items.append({
            "schema_version": row["schema_version"],
            "evidence_id": row["evidence_id"],
            "kind": row["kind"],
            "data_status": row["data_status"],
            "subject": {"type": row["subject_type"], "id": row["subject_id"]},
            "metric": row["metric"],
            "value": value,
            "unit": row["unit"],
            "source": row["source"],
            "vendor": row["vendor"],
            "document_id": row["document_id"],
            "as_of": row["as_of"],
            "published_at": row["published_at"],
            "retrieved_at": row["retrieved_at"],
            "period_type": row["period_type"],
            "market": row["market"],
            "currency": row["currency"],
            "adjustment": row["adjustment"],
            "frequency": row["frequency"],
            "inputs": json.loads(row["inputs_json"]),
            "formula": row["formula"],
            "method_version": row["method_version"],
            "quality_flags": quality_flags,
            "confidence": row["confidence"],
            "license_scope": row["license_scope"],
        })
    return {
        "schema_version": "finquant-evidence-manifest-v2",
        "generated_at": datetime.now(UTC).isoformat(),
        "scope": "current_user_only",
        "export_policy": {
            "document_values": "redacted_to_document_reference",
            "credentials": "excluded",
            "sessions": "excluded",
            "hidden_reasoning": "excluded",
        },
        "items": items,
    }
