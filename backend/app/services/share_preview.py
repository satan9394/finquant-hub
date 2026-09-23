"""Owner-scoped private share previews with deterministic redaction and no writes."""

from __future__ import annotations

from datetime import UTC, datetime
import json
import re
from typing import Any

from .. import database

JSONDict = dict[str, Any]
SCHEMA_VERSION = "share-preview/v1"
PUBLIC_REUSE_SCOPES = {"public-domain", "public-redistribution"}
DISCLAIMER = (
    "Private research preview only. Not published, not investment advice, not a trade instruction, "
    "and not causal proof. Financial data may be delayed, partial, unknown, or unavailable; "
    "review provenance, license, time, quality, assumptions, and costs before relying on it."
)
_SENSITIVE_PATTERNS = (
    re.compile(r"(?i)\b(?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*\S+"),
    re.compile(r"(?i)\bbearer\s+\S+"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
)


class SharePreviewNotFoundError(LookupError):
    """The requested owner-scoped shareable object is unavailable."""


def _loads(raw: Any, fallback: Any) -> Any:
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return fallback


def _redact_text(value: str) -> str:
    for pattern in _SENSITIVE_PATTERNS:
        value = pattern.sub("[REDACTED]", value)
    return value


def _sanitize(value: Any, path: str = "$") -> tuple[Any, list[str]]:
    if isinstance(value, str):
        redacted = _redact_text(value)
        return redacted, [path] if redacted != value else []
    if isinstance(value, list):
        output = []
        paths: list[str] = []
        for index, item in enumerate(value):
            sanitized, changed = _sanitize(item, f"{path}[{index}]")
            output.append(sanitized)
            paths.extend(changed)
        return output, paths
    if isinstance(value, dict):
        output_dict: JSONDict = {}
        paths = []
        for key, item in value.items():
            sanitized, changed = _sanitize(item, f"{path}.{key}")
            output_dict[str(key)] = sanitized
            paths.extend(changed)
        return output_dict, paths
    return value, []


def _contains_sensitive_text(value: Any) -> bool:
    serialized = json.dumps(value, ensure_ascii=False)
    return any(pattern.search(serialized) for pattern in _SENSITIVE_PATTERNS)


def _quality_status(evidence: list[JSONDict]) -> str:
    if not evidence:
        return "UNKNOWN"
    statuses = {str(item["data_status"]) for item in evidence}
    if "UPSTREAM_ERROR" in statuses:
        return "UPSTREAM_ERROR"
    if "UNKNOWN" in statuses:
        return "UNKNOWN"
    if "PARTIAL" in statuses or any(item["quality_flags"] for item in evidence):
        return "PARTIAL"
    return "OK"


def _evidence_audit(evidence: list[JSONDict]) -> JSONDict:
    missing_time = sum(
        not item.get("as_of") and not item.get("retrieved_at") for item in evidence
    )
    missing_license = sum(not item.get("license_scope") for item in evidence)
    public_reuse = sum(bool(item["public_reuse_permitted"]) for item in evidence)
    return {
        "provenance": {
            "status": "OK" if evidence else "UNKNOWN",
            "evidence_count": len(evidence),
            "metadata_only": True,
            "raw_values_included": False,
        },
        "freshness": {
            "status": "KNOWN" if evidence and missing_time == 0 else "UNKNOWN",
            "missing_time_count": missing_time,
        },
        "license": {
            "status": (
                "UNKNOWN" if missing_license else "PUBLIC_REUSE_EXPLICIT"
                if evidence and public_reuse == len(evidence) else "PRIVATE_DISPLAY_ONLY"
            ),
            "missing_scope_count": missing_license,
            "public_reuse_permitted_count": public_reuse,
        },
        "quality": {"status": _quality_status(evidence)},
    }


def _publication_gate(audit: JSONDict) -> JSONDict:
    reasons = ["PRIVATE_PREVIEW_ONLY", "PUBLIC_SHARING_NOT_IMPLEMENTED"]
    if audit["provenance"]["status"] != "OK":
        reasons.append("PROVENANCE_INCOMPLETE")
    if audit["freshness"]["status"] == "UNKNOWN":
        reasons.append("FRESHNESS_UNKNOWN")
    if audit["license"]["status"] == "UNKNOWN":
        reasons.append("LICENSE_UNKNOWN")
    elif audit["license"]["status"] != "PUBLIC_REUSE_EXPLICIT":
        reasons.append("PUBLIC_REUSE_NOT_PERMITTED")
    if audit["quality"]["status"] != "OK":
        reasons.append(f"QUALITY_{audit['quality']['status']}")
    return {
        "status": "BLOCKED",
        "reasons": reasons,
        "requires": "AIOS-071 privacy, data-license, and legal decision",
    }


def _finalize(payload: JSONDict, audit: JSONDict) -> JSONDict:
    sanitized, redacted_paths = _sanitize(payload)
    assert isinstance(sanitized, dict)
    scan_passed = not _contains_sensitive_text(sanitized)
    audit = {
        **audit,
        "redaction": {
            "status": "PASS" if scan_passed else "FAIL",
            "redacted_count": len(set(redacted_paths)),
            "redacted_field_paths": sorted(set(redacted_paths)),
            "output_scan_passed": scan_passed,
        },
        "disclaimer": {"status": "PRESENT", "text": DISCLAIMER},
    }
    sanitized["audit"] = audit
    sanitized["publication_gate"] = _publication_gate(audit)
    return sanitized


def _base(object_type: str, object_id: int) -> JSONDict:
    return {
        "schema_version": SCHEMA_VERSION,
        "visibility": "private",
        "published": False,
        "publish_action_available": False,
        "generated_at": datetime.now(UTC).isoformat(),
        "object": {"type": object_type, "id": object_id},
    }


async def _thesis_evidence(version_id: int, user_id: int) -> list[JSONDict]:
    rows = await database.query_all(
        "SELECT r.evidence_id, r.stance, e.kind, e.data_status, e.source, e.vendor, "
        "e.as_of, e.retrieved_at, e.quality_flags_json, e.license_scope "
        "FROM thesis_version_evidence_refs r JOIN evidence_objects e "
        "ON e.user_id=r.user_id AND e.evidence_id=r.evidence_id "
        "WHERE r.thesis_version_id=? AND r.user_id=? ORDER BY r.stance, r.evidence_id",
        (version_id, user_id),
    )
    return [
        {
            "evidence_id": row["evidence_id"],
            "relation": row["stance"],
            "kind": row["kind"],
            "data_status": row["data_status"],
            "source": row["source"],
            "vendor": row["vendor"],
            "as_of": row["as_of"],
            "retrieved_at": row["retrieved_at"],
            "quality_flags": _loads(row["quality_flags_json"], []),
            "license_scope": row["license_scope"],
            "public_reuse_permitted": row["license_scope"] in PUBLIC_REUSE_SCOPES,
        }
        for row in rows
    ]


async def build_thesis_share_preview(thesis_id: int, user_id: int) -> JSONDict:
    row = await database.query_one(
        "SELECT t.id, t.ticker, t.title, t.status, t.updated_at, "
        "v.id AS version_id, v.version, v.judgment, v.judgment_kind, v.assumptions_json, "
        "v.claims_json, v.invalidation_json, v.confidence, v.created_at AS version_created_at "
        "FROM thesis t JOIN thesis_versions v ON v.user_id=t.user_id AND v.thesis_id=t.id "
        "WHERE t.id=? AND t.user_id=? ORDER BY v.version DESC LIMIT 1",
        (thesis_id, user_id),
    )
    if row is None:
        raise SharePreviewNotFoundError("private share preview unavailable")
    evidence = await _thesis_evidence(int(row["version_id"]), user_id)
    audit = _evidence_audit(evidence)
    payload = {
        **_base("thesis", thesis_id),
        "object": {
            "type": "thesis",
            "id": thesis_id,
            "title": row["title"],
            "subject_id": row["ticker"],
            "status": row["status"],
            "version": row["version"],
            "updated_at": row["updated_at"],
        },
        "content": {
            "result_kind": "USER_HYPOTHESIS",
            "causal_proof": False,
            "judgment": row["judgment"],
            "confidence": row["confidence"],
            "assumptions": _loads(row["assumptions_json"], []),
            "claims": _loads(row["claims_json"], []),
            "invalidation_conditions": _loads(row["invalidation_json"], []),
            "observed_at": row["version_created_at"],
        },
        "evidence": evidence,
    }
    return _finalize(payload, audit)


_STRATEGY_PARAMS = (
    "symbol", "start_date", "end_date", "short_window", "long_window", "initial_capital",
    "commission_bps", "slippage_bps", "sell_stamp_duty_bps", "minimum_commission_cny",
    "max_drawdown_stop_pct", "benchmark", "market_rules",
)
_STRATEGY_METRICS = (
    "total_return", "annualized_return", "benchmark_return", "excess_return",
    "max_drawdown", "sharpe_ratio", "sortino_ratio", "calmar_ratio",
    "information_ratio", "win_rate", "profit_factor", "turnover", "trade_count",
)


async def build_strategy_share_preview(run_id: int, user_id: int) -> JSONDict:
    row = await database.query_one(
        "SELECT * FROM quant_backtests WHERE id=? AND user_id=? "
        "AND status='completed' AND is_saved=1",
        (run_id, user_id),
    )
    if row is None:
        raise SharePreviewNotFoundError("private share preview unavailable")
    params = _loads(row["params_json"], {})
    result = _loads(row["result_json"], {})
    raw_metrics = result.get("metrics", {}) if isinstance(result, dict) else {}
    params = params if isinstance(params, dict) else {}
    raw_metrics = raw_metrics if isinstance(raw_metrics, dict) else {}
    quality_flags = _loads(row.get("quality_flags"), [])
    quality_flags = quality_flags if isinstance(quality_flags, list) else ["UNKNOWN_QUALITY"]
    provenance = {
        "provider": row.get("provider"),
        "as_of": row.get("data_as_of"),
        "timezone": row.get("timezone"),
        "currency": row.get("currency"),
        "adjustment": row.get("adjustment"),
        "frequency": row.get("frequency"),
        "quality_flags": quality_flags,
        "license_scope": None,
        "license_status": "UNKNOWN",
        "public_reuse_permitted": False,
    }
    provenance_complete = bool(provenance["provider"] and provenance["as_of"])
    quality_status = "UNKNOWN" if not provenance_complete else "PARTIAL" if quality_flags else "OK"
    audit = {
        "provenance": {
            "status": "PARTIAL",
            "persisted_metadata_only": True,
            "canonical_evidence_ids": [],
            "raw_market_data_included": False,
        },
        "freshness": {
            "status": "KNOWN" if provenance["as_of"] else "UNKNOWN",
            "as_of": provenance["as_of"],
        },
        "license": {
            "status": "UNKNOWN",
            "missing_scope_count": 1,
            "public_reuse_permitted_count": 0,
        },
        "quality": {"status": quality_status},
    }
    payload = {
        **_base("strategy_backtest", run_id),
        "object": {
            "type": "strategy_backtest",
            "id": run_id,
            "title": f"{row['symbol']} MA strategy experiment",
            "subject_id": row["symbol"],
            "status": row["status"],
            "updated_at": row["updated_at"],
        },
        "content": {
            "result_kind": "COMPUTED_RESULT",
            "causal_proof": False,
            "method": "cost-aware-ma-crossover-backtest",
            "parameters": {key: params[key] for key in _STRATEGY_PARAMS if key in params},
            "metrics": {
                key: raw_metrics[key]
                for key in _STRATEGY_METRICS
                if key in raw_metrics and isinstance(raw_metrics[key], (int, float))
            },
        },
        "provenance": provenance,
    }
    return _finalize(payload, audit)
