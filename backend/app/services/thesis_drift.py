"""Versioned deterministic rules for provenance-aware Thesis drift checks."""
from __future__ import annotations

from typing import Any, TypeAlias


JSONDict: TypeAlias = dict[str, Any]
ENGINE_VERSION = "thesis-drift/v1"
RULE_VERSION = "1.0.0"
PRICE_DRIFT_THRESHOLD = 0.20
FUNDAMENTAL_DRIFT_THRESHOLD = 0.20


def _relative_change(baseline: object, current: object) -> float | None:
    if not isinstance(baseline, (int, float, str)) or not isinstance(current, (int, float, str)):
        return None
    try:
        before = float(baseline)
        after = float(current)
    except (TypeError, ValueError):
        return None
    if before == 0:
        return None
    return (after - before) / abs(before)


def _base_rule(rule_id: str, *, formula: str | None, parameters: JSONDict) -> JSONDict:
    return {
        "rule_id": rule_id,
        "rule_version": RULE_VERSION,
        "status": "unknown",
        "reason": "",
        "formula": formula,
        "parameters": parameters,
        "baseline_value": None,
        "current_value": None,
        "baseline_evidence_ids": [],
        "current_evidence_ids": [],
    }


def _scalar_rule(
    *,
    rule_id: str,
    label: str,
    baseline: object,
    current: object,
    threshold: float,
    baseline_evidence_ids: list[str],
    current_evidence_ids: list[str],
) -> JSONDict:
    result = _base_rule(
        rule_id,
        formula="(current - baseline) / abs(baseline)",
        parameters={"absolute_change_threshold": threshold},
    )
    result.update({
        "baseline_value": baseline,
        "current_value": current,
        "baseline_evidence_ids": baseline_evidence_ids,
        "current_evidence_ids": current_evidence_ids,
    })
    if not baseline_evidence_ids:
        result["reason"] = f"{label}缺少 baseline canonical evidence"
        return result
    if not current_evidence_ids:
        result["reason"] = f"{label}缺少 current canonical evidence"
        return result
    change = _relative_change(baseline, current)
    if change is None:
        result["reason"] = f"{label}缺少可比数值或 baseline 为零"
        return result
    result["status"] = "violated" if abs(change) >= threshold else "holding"
    result["reason"] = f"{label}相对基准变化 {change:+.1%}（阈值 {threshold:.0%}）"
    result["computed_value"] = change
    return result


def _fundamental_rule(
    baseline: object,
    current: object,
    baseline_evidence_ids: list[str],
    current_evidence_ids: list[str],
) -> JSONDict:
    result = _base_rule(
        "fundamental.material_change",
        formula="(current_metric - baseline_metric) / abs(baseline_metric)",
        parameters={"absolute_change_threshold": FUNDAMENTAL_DRIFT_THRESHOLD},
    )
    result.update({
        "baseline_value": baseline,
        "current_value": current,
        "baseline_evidence_ids": baseline_evidence_ids,
        "current_evidence_ids": current_evidence_ids,
    })
    if not baseline_evidence_ids:
        result["reason"] = "基本面缺少 baseline canonical evidence"
        return result
    if not current_evidence_ids:
        result["reason"] = "基本面缺少 current canonical evidence"
        return result
    if not isinstance(baseline, dict) or not isinstance(current, dict):
        result["reason"] = "缺少可比基本面数据"
        return result
    changes = {
        metric: change
        for metric in sorted(set(baseline) & set(current))
        if (change := _relative_change(baseline[metric], current[metric])) is not None
    }
    if not changes:
        result["reason"] = "没有共同且可计算的基本面指标"
        return result
    material = {
        metric: change for metric, change in changes.items()
        if abs(change) >= FUNDAMENTAL_DRIFT_THRESHOLD
    }
    result["computed_value"] = changes
    result["status"] = "violated" if material else "holding"
    result["reason"] = (
        "基本面显著漂移：" + "、".join(
            f"{metric} {change:+.1%}" for metric, change in list(material.items())[:5]
        )
        if material
        else f"{len(changes)} 个可比基本面指标均未超过 {FUNDAMENTAL_DRIFT_THRESHOLD:.0%} 阈值"
    )
    return result


def _unsupported_rule(rule_id: str, reason: str, baseline: object, current: object) -> JSONDict:
    result = _base_rule(rule_id, formula=None, parameters={})
    result.update({"reason": reason, "baseline_value": baseline, "current_value": current})
    return result


def evaluate_drift(
    *,
    baseline: JSONDict,
    current: JSONDict,
    baseline_evidence_ids: dict[str, list[str]],
    current_evidence_ids: dict[str, list[str]],
) -> JSONDict:
    """Evaluate only rules whose baseline and current canonical inputs are available."""
    rules = {
        "price": _scalar_rule(
            rule_id="price.relative_change",
            label="价格",
            baseline=baseline.get("price"),
            current=current.get("price"),
            threshold=PRICE_DRIFT_THRESHOLD,
            baseline_evidence_ids=list(baseline_evidence_ids.get("price", [])),
            current_evidence_ids=list(current_evidence_ids.get("price", [])),
        ),
        "position": _unsupported_rule(
            "position.relative_change",
            "持仓尚无 canonical evidence adapter，不能用组合快照决定事实状态",
            baseline.get("position_shares"),
            current.get("position_shares"),
        ),
        "fundamental": _fundamental_rule(
            baseline.get("fundamentals"),
            current.get("fundamentals"),
            list(baseline_evidence_ids.get("fundamental", [])),
            list(current_evidence_ids.get("fundamental", [])),
        ),
        "report": _unsupported_rule(
            "report.manual_review",
            "报告变化需要 document evidence 与 manual review；文本相似度不决定事实状态",
            None,
            None,
        ),
    }
    checked = [rule["status"] for rule in rules.values() if rule["status"] != "unknown"]
    violated = sum(status == "violated" for status in checked)
    return {
        "engine_version": ENGINE_VERSION,
        "rules": rules,
        "drift_status": "drifted" if violated else "stable" if checked else "unknown",
        "drift_score": round(100 * violated / len(checked), 1) if checked else None,
    }
