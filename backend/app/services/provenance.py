"""Canonical provenance adapters for existing FinQuant result shapes."""

from __future__ import annotations

import copy
from datetime import UTC, datetime
import hashlib
import json
from typing import Any, Literal

from .. import database
from .market_data import normalize_code

JSONDict = dict[str, Any]
DataStatus = Literal["OK", "UNKNOWN", "PARTIAL", "UPSTREAM_ERROR"]


def _stable_id(payload: JSONDict) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return f"ev_{hashlib.sha256(canonical.encode()).hexdigest()[:32]}"


def _status(value: Any, quality_flags: list[str]) -> DataStatus:
    if "UPSTREAM_ERROR" in quality_flags:
        return "UPSTREAM_ERROR"
    if value is None or "UNKNOWN" in quality_flags:
        return "UNKNOWN"
    if quality_flags:
        return "PARTIAL"
    return "OK"


def _finish(payload: JSONDict) -> JSONDict:
    result = {"schema_version": "canonical-provenance-envelope-v1", **payload}
    result["evidence_id"] = _stable_id(result)
    return result


def quote_envelope(quote: JSONDict, *, metric: str = "price", retrieved_at: str) -> JSONDict:
    """Map one existing normalized quote without inventing missing market metadata."""
    source = copy.deepcopy(quote)
    provider = source.get("source")
    if not provider:
        raise ValueError("quote source is required")
    value = source.get(metric)
    flags = list(source.get("quality_flags") or [])
    if value is None and "UNKNOWN" not in flags:
        flags.append("UNKNOWN")
    timestamp = source.get("timestamp")
    as_of = (
        datetime.fromtimestamp(int(timestamp), UTC).isoformat()
        if isinstance(timestamp, (int, float)) and timestamp > 0
        else None
    )
    result = _finish({
        "kind": "observed_fact",
        "data_status": _status(value, flags),
        "subject": {"type": "instrument", "id": normalize_code(str(source["code"]))},
        "metric": metric,
        "value": value,
        "unit": source.get("currency") if metric == "price" else None,
        "source": provider,
        "vendor": provider,
        "document_id": None,
        "as_of": as_of,
        "published_at": None,
        "retrieved_at": retrieved_at,
        "period_type": "point_in_time",
        "market": source.get("market"),
        "currency": source.get("currency"),
        "adjustment": source.get("adjustment"),
        "frequency": source.get("frequency"),
        "inputs": [],
        "formula": None,
        "method_version": None,
        "quality_flags": flags,
        "confidence": None,
        "license_scope": source.get("license_scope") or "display-and-research",
    })
    if source != quote:
        raise RuntimeError("quote adapter mutated its input")
    return result


def fundamental_envelope(item: JSONDict, *, subject_id: str, retrieved_at: str) -> JSONDict:
    """Map one period-safe fundamental item, preserving provider semantics exactly."""
    source = copy.deepcopy(item)
    provider = source.get("provider")
    source_name = source.get("source")
    if not source_name:
        raise ValueError("fundamental source is required")
    value = source.get("value")
    flags = list(source.get("quality_flags") or [])
    if value is None and "UNKNOWN" not in flags:
        flags.append("UNKNOWN")
    period_type = source.get("period_type")
    result = _finish({
        "kind": "observed_fact",
        "data_status": _status(value, flags),
        "subject": {"type": "instrument", "id": normalize_code(subject_id)},
        "metric": source.get("metric"),
        "value": value,
        "unit": source.get("unit"),
        "source": source_name,
        "vendor": provider,
        "document_id": source.get("document_id"),
        "as_of": source.get("as_of") or source.get("as_of_date"),
        "published_at": source.get("published_at"),
        "retrieved_at": retrieved_at,
        "period_type": period_type,
        "market": source.get("market"),
        "currency": source.get("currency"),
        "adjustment": source.get("adjustment"),
        "frequency": source.get("frequency") or period_type,
        "inputs": [],
        "formula": None,
        "method_version": None,
        "quality_flags": flags,
        "confidence": source.get("confidence"),
        "license_scope": source.get("license_scope") or "display-and-research",
    })
    if source != item:
        raise RuntimeError("fundamental adapter mutated its input")
    return result


def research_report_envelope(report: JSONDict, *, retrieved_at: str) -> JSONDict:
    """Represent a saved AI research report as a document reference, never as a fact."""
    source = copy.deepcopy(report)
    report_id = int(source["id"])
    raw_report_data = source.get("report_data")
    report_data: JSONDict = raw_report_data if isinstance(raw_report_data, dict) else {}
    result = _finish({
        "kind": "document_excerpt",
        "data_status": "OK" if source.get("status") == "completed" else "PARTIAL",
        "subject": {"type": "instrument", "id": normalize_code(str(source["ticker"]))},
        "metric": None,
        "value": {
            "report_id": report_id,
            "report_schema_version": report_data.get("schema_version"),
        },
        "unit": None,
        "source": "finquant-research-report",
        "vendor": "finquant",
        "document_id": f"research_report:{report_id}",
        "as_of": source.get("updated_at") or source.get("created_at"),
        "published_at": source.get("updated_at"),
        "retrieved_at": retrieved_at,
        "period_type": None,
        "market": source.get("market"),
        "currency": None,
        "adjustment": None,
        "frequency": None,
        "inputs": [],
        "formula": None,
        "method_version": None,
        "quality_flags": ["AI_GENERATED_CONTENT_NOT_FACT"],
        "confidence": None,
        "license_scope": "private-user-research",
    })
    if source != report:
        raise RuntimeError("research report adapter mutated its input")
    return result


def computed_envelope(
    *,
    subject_type: str,
    subject_id: str,
    metric: str,
    value: Any,
    unit: str | None,
    inputs: list[str],
    formula: str,
    method_version: str,
    retrieved_at: str,
    as_of: str | None = None,
    market: str | None = None,
    currency: str | None = None,
    adjustment: str | None = None,
    frequency: str | None = None,
    period_type: str | None = None,
    quality_flags: list[str] | None = None,
) -> JSONDict:
    """Wrap an existing deterministic calculation without reimplementing it."""
    if not inputs or len(inputs) != len(set(inputs)):
        raise ValueError("computed evidence requires unique input evidence IDs")
    if not formula.strip() or not method_version.strip():
        raise ValueError("computed evidence requires formula and method_version")
    flags = list(quality_flags or [])
    if value is None and "UNKNOWN" not in flags:
        flags.append("UNKNOWN")
    return _finish({
        "kind": "computed_result",
        "data_status": _status(value, flags),
        "subject": {"type": subject_type, "id": subject_id},
        "metric": metric,
        "value": value,
        "unit": unit,
        "source": "finquant",
        "vendor": "finquant",
        "document_id": None,
        "as_of": as_of,
        "published_at": None,
        "retrieved_at": retrieved_at,
        "period_type": period_type,
        "market": market,
        "currency": currency,
        "adjustment": adjustment,
        "frequency": frequency,
        "inputs": list(inputs),
        "formula": formula,
        "method_version": method_version,
        "quality_flags": flags,
        "confidence": None,
        "license_scope": "private-user-research",
    })


async def persist_envelope(envelope: JSONDict, *, user_id: int) -> int:
    """Explicitly persist one validated canonical envelope in the current transaction model."""
    subject = envelope["subject"]
    cursor = await database.get_db().execute(
        "INSERT INTO evidence_objects "
        "(user_id, evidence_id, schema_version, kind, data_status, subject_type, subject_id, metric, "
        "value_json, unit, source, vendor, document_id, as_of, published_at, retrieved_at, period_type, "
        "market, currency, adjustment, frequency, inputs_json, formula, method_version, "
        "quality_flags_json, confidence, license_scope) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user_id, envelope["evidence_id"], envelope["schema_version"], envelope["kind"],
            envelope["data_status"], subject["type"], subject["id"], envelope["metric"],
            json.dumps(envelope["value"], ensure_ascii=False), envelope["unit"], envelope["source"],
            envelope["vendor"], envelope["document_id"], envelope["as_of"], envelope["published_at"],
            envelope["retrieved_at"], envelope["period_type"], envelope["market"], envelope["currency"],
            envelope["adjustment"], envelope["frequency"], json.dumps(envelope["inputs"]),
            envelope["formula"], envelope["method_version"],
            json.dumps(envelope["quality_flags"], ensure_ascii=False), envelope["confidence"],
            envelope["license_scope"],
        ),
    )
    for input_id in envelope["inputs"]:
        await database.get_db().execute(
            "INSERT INTO evidence_input_refs (user_id, derived_evidence_id, input_evidence_id) "
            "VALUES (?, ?, ?)",
            (user_id, envelope["evidence_id"], input_id),
        )
    await database.get_db().commit()
    if cursor.lastrowid is None:
        raise RuntimeError("evidence insert did not return an id")
    return int(cursor.lastrowid)
