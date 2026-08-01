"""Evidence-first adversarial review of an investment thesis."""
from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any


def _finite_number(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def adversarial_review(
    claims: Sequence[Mapping[str, Any]],
    financial_signals: Mapping[str, Any] | None = None,
) -> dict:
    """Turn thesis weak points into verification questions, never accusations."""
    if not claims:
        raise ValueError("至少需要一条投资论点")

    findings: list[dict[str, str]] = []
    for index, claim in enumerate(claims, start=1):
        statement = str(claim.get("statement") or "").strip()
        if not statement:
            raise ValueError(f"第 {index} 条论点缺少 statement")
        evidence_count = _finite_number(claim.get("evidence_count"))
        primary_source = claim.get("primary_source") is True
        contrary = str(claim.get("contrary_evidence") or "").strip()
        if evidence_count is None or evidence_count < 1:
            findings.append({
                "severity": "high",
                "category": "unsupported_claim",
                "observation": statement,
                "verification_needed": "补充可定位的原始披露或独立数据源",
            })
        elif not primary_source:
            findings.append({
                "severity": "medium",
                "category": "secondary_source_only",
                "observation": statement,
                "verification_needed": "回到公司公告、监管文件或审计财报核验",
            })
        if not contrary:
            findings.append({
                "severity": "medium",
                "category": "missing_disconfirmation",
                "observation": statement,
                "verification_needed": "写出最强反证及会推翻论点的可观察条件",
            })

    signals = financial_signals or {}
    revenue_growth = _finite_number(signals.get("revenue_growth_pct"))
    receivables_growth = _finite_number(signals.get("receivables_growth_pct"))
    inventory_growth = _finite_number(signals.get("inventory_growth_pct"))
    net_income = _finite_number(signals.get("net_income"))
    operating_cash_flow = _finite_number(signals.get("operating_cash_flow"))

    if revenue_growth is not None and receivables_growth is not None:
        if receivables_growth - revenue_growth > 10:
            findings.append({
                "severity": "high",
                "category": "receivables_outpace_revenue",
                "observation": f"应收增速比收入增速高 {receivables_growth - revenue_growth:.1f} 个百分点",
                "verification_needed": "核验账龄、坏账准备、前五大客户和期后回款",
            })
    if revenue_growth is not None and inventory_growth is not None:
        if inventory_growth - revenue_growth > 10:
            findings.append({
                "severity": "medium",
                "category": "inventory_outpace_revenue",
                "observation": f"存货增速比收入增速高 {inventory_growth - revenue_growth:.1f} 个百分点",
                "verification_needed": "核验存货结构、跌价准备、周转天数和渠道库存",
            })
    if net_income is not None and operating_cash_flow is not None and net_income > 0:
        cash_conversion = operating_cash_flow / net_income
        if cash_conversion < 0.8:
            findings.append({
                "severity": "critical" if cash_conversion < 0 else "high",
                "category": "weak_cash_conversion",
                "observation": f"经营现金流/净利润为 {cash_conversion:.2f}",
                "verification_needed": "核验营运资本变化、非现金收益和收入确认政策",
            })

    counts = {
        severity: sum(item["severity"] == severity for item in findings)
        for severity in ("critical", "high", "medium", "low", "info")
    }
    critical_or_high = counts["critical"] + counts["high"]
    return {
        "verdict": "requires_follow_up" if findings else "no_material_flags",
        "finding_count": len(findings),
        "severity_counts": counts,
        "findings": findings,
        "judgment_layers": {
            "evidence": "存在一手证据缺口" if findings else "未发现明显证据缺口",
            "thesis": "核心论点需要反证检验" if findings else "当前输入未触发重大反证",
            "research_action": (
                "暂停形成确定结论并优先核验高严重度问题"
                if critical_or_high
                else "保留观察结论并补齐核验项"
                if findings
                else "继续跟踪会推翻结论的条件"
            ),
        },
        "limitation": "这些信号用于提出核验问题，不构成舞弊证据或做空建议。",
    }
