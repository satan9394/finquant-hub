"""Read-only, provenance-aware challenge view for an investment thesis."""
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, TypeAlias

from .. import database
from ..tools.adversarial_review import adversarial_review
from .thesis import get_thesis


JSONDict: TypeAlias = dict[str, Any]
_KNOWN_DATA_STATUSES = {"OK", "PARTIAL"}


def _loads(value: object, fallback: Any) -> Any:
    if not isinstance(value, str):
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _evidence_ref(row: JSONDict, *, relation: str) -> JSONDict:
    return {
        "evidence_id": str(row["evidence_id"]),
        "relation": relation,
        "kind": row["kind"],
        "data_status": row["data_status"],
        "subject_type": row["subject_type"],
        "subject_id": row["subject_id"],
        "metric": row["metric"],
        "value": _loads(row.get("value_json"), None),
        "source": row["source"],
        "vendor": row["vendor"],
        "document_id": row["document_id"],
        "as_of": row["as_of"],
        "retrieved_at": row["retrieved_at"],
        "period_type": row["period_type"],
        "currency": row["currency"],
        "quality_flags": _loads(row.get("quality_flags_json"), []),
        "license_scope": row["license_scope"],
        "valid_from": row.get("valid_from"),
        "valid_to": row.get("valid_to"),
        "observed_at": row.get("observed_at"),
    }


async def _active_claim_references(thesis_id: int, user_id: int) -> dict[int, list[JSONDict]]:
    rows = await database.query_all(
        "SELECT edge.claim_id, edge.stance, edge.valid_from, edge.valid_to, edge.observed_at, "
        "edge.id AS edge_id, ev.evidence_id, ev.kind, ev.data_status, ev.subject_type, "
        "ev.subject_id, ev.metric, ev.value_json, ev.source, ev.vendor, ev.document_id, "
        "ev.as_of, ev.retrieved_at, ev.period_type, ev.currency, ev.quality_flags_json, "
        "ev.license_scope FROM thesis_claim_evidence_edges edge "
        "JOIN evidence_objects ev ON ev.user_id=edge.user_id AND ev.evidence_id=edge.evidence_id "
        "WHERE edge.thesis_id=? AND edge.user_id=? AND edge.status='active' "
        "ORDER BY COALESCE(edge.observed_at, ev.retrieved_at, ev.as_of, '') DESC, edge.id DESC",
        (thesis_id, user_id),
    )
    result: dict[int, list[JSONDict]] = {}
    for row in rows:
        result.setdefault(int(row["claim_id"]), []).append(
            _evidence_ref(row, relation=str(row["stance"]))
        )
    return result


async def _version_references(version: JSONDict, user_id: int) -> list[JSONDict]:
    relations = {
        **{str(item): "supporting" for item in version.get("supporting_evidence_ids", [])},
        **{str(item): "opposing" for item in version.get("opposing_evidence_ids", [])},
    }
    if not relations:
        return []
    evidence_ids = list(relations)
    placeholders = ",".join("?" for _ in evidence_ids)
    rows = await database.query_all(
        "SELECT evidence_id, kind, data_status, subject_type, subject_id, metric, value_json, "
        "source, vendor, document_id, as_of, retrieved_at, period_type, currency, "
        f"quality_flags_json, license_scope FROM evidence_objects WHERE user_id=? "
        f"AND evidence_id IN ({placeholders})",
        (user_id, *evidence_ids),
    )
    by_id = {str(row["evidence_id"]): row for row in rows}
    return [
        _evidence_ref(by_id[evidence_id], relation=relations[evidence_id])
        for evidence_id in evidence_ids
        if evidence_id in by_id
    ]


def _quality(refs: list[JSONDict], *, inference: bool = True) -> str:
    if not refs:
        return "UNKNOWN"
    if inference or any(ref["data_status"] not in _KNOWN_DATA_STATUSES for ref in refs):
        return "PARTIAL"
    return "OK"


async def challenge_thesis(thesis_id: int, user_id: int) -> JSONDict:
    """Build a challenge from persisted owner-scoped evidence without changing the thesis."""
    thesis = await get_thesis(thesis_id, user_id)
    claim_refs = await _active_claim_references(thesis_id, user_id)
    current_version = thesis.get("current_version") or {}
    version_refs = await _version_references(current_version, user_id)
    all_claims = list(thesis.get("claims", []))
    claims = [claim for claim in all_claims if claim.get("kind") == "manual"]

    opposing: list[tuple[JSONDict, JSONDict]] = []
    for claim in all_claims:
        for ref in claim_refs.get(int(claim["id"]), []):
            if ref["relation"] == "opposing":
                opposing.append((claim, ref))
    strongest_counter_evidence: list[JSONDict] = [
        {
            "result_kind": "AI_INFERENCE",
            "quality_status": (
                "OK" if ref["data_status"] in _KNOWN_DATA_STATUSES else "UNKNOWN"
            ),
            "claim_id": int(claim["id"]),
            "claim": str(claim["claim"]),
            "summary": "该 canonical evidence 当前被标记为反对该 claim；强度排序仅依据时效与数据状态，仍需用户核对语义适用性。",
            "evidence_refs": [ref],
        }
        for claim, ref in opposing[:5]
    ]
    if not strongest_counter_evidence:
        strongest_counter_evidence = [{
            "result_kind": "AI_INFERENCE",
            "quality_status": "UNKNOWN",
            "claim_id": None,
            "claim": None,
            "summary": "当前没有 active opposing claim-evidence edge，无法形成可回链的最强反证。",
            "evidence_refs": [],
        }]

    review_claims = []
    claims_by_statement: dict[str, JSONDict] = {}
    for claim in claims:
        statement = str(claim["claim"])
        refs = claim_refs.get(int(claim["id"]), [])
        claims_by_statement[statement] = claim
        review_claims.append({
            "statement": statement,
            "evidence_count": len(refs),
            "primary_source": False,
            "contrary_evidence": ", ".join(
                str(ref["evidence_id"]) for ref in refs if ref["relation"] == "opposing"
            ),
        })
    review = adversarial_review(review_claims) if review_claims else {"findings": []}
    omitted_variables: list[JSONDict] = []
    for finding in review["findings"]:
        claim = claims_by_statement.get(str(finding["observation"]))
        refs = claim_refs.get(int(claim["id"]), []) if claim is not None else []
        omitted_variables.append({
            "result_kind": "AI_INFERENCE",
            "quality_status": _quality(refs),
            "claim_id": int(claim["id"]) if claim is not None else None,
            "category": finding["category"],
            "severity": finding["severity"],
            "summary": finding["verification_needed"],
            "evidence_refs": refs,
        })

    fragile_assumptions = [{
        "result_kind": "AI_INFERENCE",
        "quality_status": _quality(version_refs),
        "assumption": str(assumption),
        "summary": (
            "当前只有 Thesis 版本级 evidence，尚无 assumption-level edge；该脆弱性判断仅用于提示核验。"
            if version_refs
            else "该用户假设没有可定位的 canonical evidence，当前脆弱性只能标记为 UNKNOWN。"
        ),
        "evidence_refs": version_refs,
    } for assumption in current_version.get("assumptions", thesis.get("assumptions", []))]

    has_evidence_refs = any(
        bool(item.get("evidence_refs"))
        for section in (strongest_counter_evidence, omitted_variables, fragile_assumptions)
        for item in section
    )
    return {
        "thesis_id": thesis_id,
        "ticker": thesis["ticker"],
        "generated_at": datetime.now(tz=UTC).isoformat(),
        "result_kind": "AI_INFERENCE",
        "overall_status": "PARTIAL" if has_evidence_refs else "UNKNOWN",
        "strongest_counter_evidence": strongest_counter_evidence,
        "omitted_variables": omitted_variables,
        "fragile_assumptions": fragile_assumptions,
        "limitation": (
            "只读取当前保存的 canonical evidence 与显式关系；不调用模型或上游，"
            "不代表做空建议，也不会自动修改用户 Thesis。"
        ),
    }
