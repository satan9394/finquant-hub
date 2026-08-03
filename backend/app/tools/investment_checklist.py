"""Deterministic six-gate value-investing checklist."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any


BUFFETT_GATES = {
    "circle_of_competence": "能力圈",
    "business_quality": "生意质量",
    "moat": "护城河",
    "management": "管理层",
    "margin_of_safety": "安全边际",
    "discipline": "仓位与决策纪律",
}
VALID_STATUSES = frozenset({"pass", "fail", "unknown"})
HARD_VETO_GATES = frozenset({"circle_of_competence", "management"})


def check_buffett_rules(
    assessments: Mapping[str, str],
    notes: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Evaluate all six gates without turning missing evidence into a pass."""
    missing = [gate for gate in BUFFETT_GATES if gate not in assessments]
    extra = [gate for gate in assessments if gate not in BUFFETT_GATES]
    if missing or extra:
        details = []
        if missing:
            details.append(f"缺少：{','.join(missing)}")
        if extra:
            details.append(f"未知：{','.join(extra)}")
        raise ValueError("六关字段不完整（" + "；".join(details) + "）")

    normalized = {gate: str(assessments[gate]).strip().lower() for gate in BUFFETT_GATES}
    invalid = {gate: status for gate, status in normalized.items() if status not in VALID_STATUSES}
    if invalid:
        raise ValueError(f"六关状态必须是 pass/fail/unknown：{invalid}")

    failed = [gate for gate, status in normalized.items() if status == "fail"]
    unknown = [gate for gate, status in normalized.items() if status == "unknown"]
    hard_vetoes = [gate for gate in failed if gate in HARD_VETO_GATES]
    if hard_vetoes:
        verdict = "reject"
    elif failed or unknown:
        verdict = "needs_review"
    else:
        verdict = "pass"

    note_map = notes or {}
    gates = [
        {
            "key": gate,
            "label": label,
            "status": normalized[gate],
            "note": str(note_map.get(gate) or ""),
        }
        for gate, label in BUFFETT_GATES.items()
    ]
    return {
        "verdict": verdict,
        "passed_count": sum(status == "pass" for status in normalized.values()),
        "total_count": len(BUFFETT_GATES),
        "failed_gates": failed,
        "unknown_gates": unknown,
        "hard_vetoes": hard_vetoes,
        "gates": gates,
    }
