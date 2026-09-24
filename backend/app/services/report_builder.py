"""Build one evidence-aware 13-chapter report shape for every research pipeline."""

from __future__ import annotations

from datetime import datetime
import json
import math
import re
from typing import Any

from ..prompts.research_memo_prompt import REPORT_CHAPTERS
from ..tools.adversarial_review import adversarial_review
from ..tools.investment_checklist import BUFFETT_GATES, check_buffett_rules

UNKNOWN = "unknown（当前证据不足，不能形成可靠结论）"
_JSON_FENCE = re.compile(r"```(?:json)?\s*(\{.*\})\s*```", re.S | re.I)


def build_telemetry_summary(records: list[dict[str, Any]]) -> dict[str, float | None]:
    """Summarize measured model calls without treating unavailable values as zero."""
    speeds = [
        float(value)
        for record in records
        if isinstance((value := record.get("tokens_per_second")), (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value > 0
    ]
    durations = [
        float(value)
        for record in records
        if isinstance((value := record.get("duration_ms")), (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value >= 0
    ]
    prompt_tokens = sum(max(0, int(record.get("prompt_tokens") or 0)) for record in records)
    cached_tokens = sum(max(0, int(record.get("cached_tokens") or 0)) for record in records)
    return {
        "avg_tokens_per_second": sum(speeds) / len(speeds) if speeds else None,
        "total_duration_seconds": sum(durations) / 1000,
        "cache_savings_ratio": cached_tokens / prompt_tokens if prompt_tokens else None,
    }

LONG_TERM_DIMENSIONS = {
    "business_quality": "生意质量",
    "moat": "护城河",
    "financial_quality": "财务质量",
    "valuation_safety": "估值安全边际",
}
SHORT_TERM_DIMENSIONS = {
    "trend": "趋势",
    "catalyst": "催化剂",
    "sentiment": "情绪",
    "risk_reward": "风险收益比",
}
SCARCITY_DIMENSIONS = {
    "technology_barrier": "技术壁垒",
    "supply_chain_control": "供应链控制",
    "substitution_difficulty": "替代难度",
    "qualification_barrier": "客户认证壁垒",
    "capacity_constraint": "产能稀缺性",
    "policy_importance": "政策与战略重要性",
}

_CANONICAL_METRICS = {
    "trailingMarketCap": "market_cap",
    "trailingPeRatio": "pe_ratio",
    "trailingPbRatio": "pb_ratio",
    "trailingEps": "eps",
    "trailingTotalRevenue": "total_revenue",
    "trailingNetIncome": "net_income",
    "trailingGrossProfit": "gross_profit",
    "trailingOperatingCashFlow": "operating_cash_flow",
    "trailingFreeCashFlow": "free_cash_flow",
    "quarterlyTotalAssets": "total_assets",
    "quarterlyTotalLiabilitiesNetMinorityInterest": "total_liabilities",
    "quarterlyStockholdersEquity": "shareholders_equity",
}
_METRIC_LABELS = {
    "market_cap": "总市值",
    "pe_ratio": "市盈率",
    "pb_ratio": "市净率",
    "eps": "每股收益",
    "total_revenue": "营业收入",
    "net_income": "净利润",
    "gross_profit": "毛利润",
    "gross_margin": "毛利率",
    "net_profit_margin": "净利率",
    "roe": "净资产收益率",
    "revenue_growth": "营收同比增长",
    "net_income_growth": "净利润同比增长",
    "total_assets": "总资产",
    "total_liabilities": "总负债",
    "shareholders_equity": "股东权益",
    "debt_to_assets": "资产负债率",
    "current_ratio": "流动比率",
    "operating_cash_flow": "经营活动现金流",
    "free_cash_flow": "自由现金流",
}
_CHAPTER_METRICS = {
    "financial_overview": (
        "total_revenue", "net_income", "market_cap", "pe_ratio", "pb_ratio",
        "total_assets", "total_liabilities", "shareholders_equity",
    ),
    "profitability_analysis": ("gross_profit", "gross_margin", "net_profit_margin", "roe", "eps"),
    "growth_analysis": ("revenue_growth", "net_income_growth"),
    "solvency_analysis": (
        "debt_to_assets", "current_ratio", "total_assets", "total_liabilities", "shareholders_equity",
    ),
    "cash_flow_analysis": ("operating_cash_flow", "free_cash_flow"),
}
_PERCENT_METRICS = {
    "gross_margin", "net_profit_margin", "roe", "revenue_growth", "net_income_growth",
    "debt_to_assets",
}
_MONEY_METRICS = {
    "market_cap", "total_revenue", "net_income", "gross_profit", "total_assets",
    "total_liabilities", "shareholders_equity", "operating_cash_flow", "free_cash_flow",
}


def parse_lead_review(content: str) -> dict[str, Any]:
    """Parse a lead's JSON payload; invalid model output remains explicit unknown."""
    text = content.strip()
    match = _JSON_FENCE.search(text)
    if match:
        text = match.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        text = text[start:end + 1] if start >= 0 and end > start else ""
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _scorecard(raw: object, dimensions: dict[str, str]) -> dict[str, Any]:
    values = raw if isinstance(raw, dict) else {}
    items: list[dict[str, Any]] = []
    for key, label in dimensions.items():
        value = values.get(key)
        score = (
            float(value)
            if not isinstance(value, bool) and isinstance(value, (int, float)) and 0 <= value <= 10
            else None
        )
        items.append({"key": key, "label": label, "score": score, "status": "scored" if score is not None else "unknown"})
    scored = [float(item["score"]) for item in items if item["score"] is not None]
    return {
        "score": round(sum(scored) / len(scored), 2) if len(scored) == len(items) else None,
        "dimensions": items,
        "status": "scored" if len(scored) == len(items) else "unknown",
    }


def _scarcity(raw: object) -> dict[str, Any]:
    card = _scorecard(raw, SCARCITY_DIMENSIONS)
    if card["score"] is None:
        return {**card, "total": None, "grade": "unknown"}
    total = round(card["score"] * 10, 1)
    grade = "战略稀缺" if total >= 85 else "高度稀缺" if total >= 70 else "局部稀缺" if total >= 50 else "一般"
    return {**card, "total": total, "grade": grade}


def _checklist(raw: object) -> dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    assessments = {key: source.get(key, "unknown") for key in BUFFETT_GATES}
    try:
        return check_buffett_rules(assessments)
    except ValueError:
        return check_buffett_rules({key: "unknown" for key in BUFFETT_GATES})


def _content(agent_results: dict[str, Any], key: str) -> str:
    result = agent_results.get(key)
    return str(result.get("content") or "") if isinstance(result, dict) else ""


def _adversarial(agent_results: dict[str, Any]) -> dict[str, Any]:
    claims = []
    for key, result in agent_results.items():
        if key in {"risk_assessor", "risk_manager", "risk_analyst", "report_lead"} or not isinstance(result, dict):
            continue
        content = str(result.get("content") or "").strip()
        if not content:
            continue
        tool_log = result.get("tool_log")
        claims.append(
            {
                "statement": content[:300],
                "evidence_count": len(tool_log) if isinstance(tool_log, list) else 0,
                "primary_source": False,
                "contrary_evidence": "",
            }
        )
    return adversarial_review(claims) if claims else {
        "verdict": "unknown",
        "finding_count": 0,
        "severity_counts": {level: 0 for level in ("critical", "high", "medium", "low", "info")},
        "findings": [],
        "judgment_layers": {"evidence": UNKNOWN, "thesis": UNKNOWN, "research_action": "先补充可核验论点"},
        "limitation": "缺少可审查的投资论点。",
    }


def _chapter_content(
    key: str,
    lead_chapters: dict[str, Any],
    agent_results: dict[str, Any],
    company_name: str,
    ticker: str,
) -> str:
    lead_value = lead_chapters.get(key)
    if isinstance(lead_value, str) and lead_value.strip():
        return lead_value.strip()
    fallbacks = {
        "company_overview": f"{company_name or ticker}（{ticker}）。除名称与代码外的公司概况：{UNKNOWN}",
        "industry_analysis": _content(agent_results, "industry_researcher") or _content(agent_results, "macro_strategist"),
        "business_model_analysis": _content(agent_results, "business_analyst") or _content(agent_results, "value_investor"),
        "financial_overview": _content(agent_results, "financial_analyst"),
        "risk_analysis": _content(agent_results, "risk_assessor") or _content(agent_results, "risk_manager") or _content(agent_results, "risk_analyst"),
    }
    return fallbacks.get(key) or UNKNOWN


def _render_scorecard(title: str, card: dict[str, Any]) -> str:
    parts = [
        f"{item['label']}：{item['score'] if item['score'] is not None else 'unknown'}/10"
        for item in card["dimensions"]
    ]
    overall = card["score"] if card["score"] is not None else "unknown"
    return f"{title}：{overall}/10\n" + "；".join(parts)


def _fundamental_items(payload: object) -> dict[str, dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for raw in payload["items"]:
        if not isinstance(raw, dict) or raw.get("value") is None:
            continue
        metric = _CANONICAL_METRICS.get(str(raw.get("metric")), str(raw.get("metric")))
        if metric in _METRIC_LABELS:
            result.setdefault(metric, raw)
    return result


def _format_fundamental_value(metric: str, item: dict[str, Any]) -> str:
    value = float(item["value"])
    if metric in _PERCENT_METRICS:
        return f"{value:.2f}%"
    if metric in {"pe_ratio", "pb_ratio", "current_ratio"}:
        return f"{value:.2f} 倍"
    if metric == "eps":
        return f"{value:.2f} {item.get('currency') or 'CNY'}/股"
    if metric in _MONEY_METRICS:
        currency = str(item.get("currency") or "CNY")
        absolute = abs(value)
        if absolute >= 1e8:
            return f"{value / 1e8:,.2f} 亿元 {currency}"
        if absolute >= 1e4:
            return f"{value / 1e4:,.2f} 万元 {currency}"
        return f"{value:,.2f} 元 {currency}"
    return f"{value:,.2f}"


def _fundamental_chapter_facts(payload: object) -> dict[str, str]:
    items = _fundamental_items(payload)
    payload_flags = payload.get("quality_flags", []) if isinstance(payload, dict) else []
    item_flags = [
        str(flag)
        for item in items.values()
        for flag in item.get("quality_flags", [])
    ]
    quality_flags = list(dict.fromkeys(str(flag) for flag in [*payload_flags, *item_flags]))
    facts: dict[str, str] = {}
    for chapter, metrics in _CHAPTER_METRICS.items():
        lines = []
        for metric in metrics:
            item = items.get(metric)
            if not item:
                continue
            provenance = [f"来源：{item.get('source') or item.get('provider') or 'unknown'}"]
            as_of = item.get("as_of_date") or item.get("as_of")
            if as_of:
                provenance.append(f"截至：{as_of}")
            provenance.append(f"TTM：{'是' if item.get('is_ttm') else '否'}")
            if item.get("period_type"):
                provenance.append(f"期间：{item['period_type']}")
            if item.get("components"):
                provenance.append("由原始字段计算")
            lines.append(
                f"- {_METRIC_LABELS[metric]}：{_format_fundamental_value(metric, item)}"
                f"（{'；'.join(provenance)}）"
            )
        if lines:
            heading = "【基本面事实｜数据存疑】" if quality_flags else "【基本面事实】"
            warning = f"\n质量提示：{', '.join(quality_flags)}" if quality_flags else ""
            facts[chapter] = heading + "\n" + "\n".join(lines) + warning
    return facts


def _merge_fundamental_facts(base: str, facts: str | None) -> str:
    if not facts:
        return base
    if not base.strip() or base.strip().startswith("unknown（"):
        return facts
    return f"{base}\n\n{facts}"


def build_unified_report(
    ticker: str,
    company_name: str,
    agent_results: dict[str, Any],
    *,
    report_type: str = "multi_agent_research",
    lead_content: str = "",
    status: str = "completed",
    fundamentals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return the canonical report while retaining legacy top-level fields."""
    lead = parse_lead_review(lead_content)
    lead_chapters: dict[str, Any] = (
        lead["chapters"] if isinstance(lead.get("chapters"), dict) else {}
    )
    chapters: list[dict[str, Any]] = [
        {
            "order": order,
            "key": key,
            "title": title,
            "content": _chapter_content(key, lead_chapters, agent_results, company_name, ticker),
        }
        for order, (key, title) in enumerate(REPORT_CHAPTERS, start=1)
    ]
    chapter_map: dict[str, str] = {
        str(chapter["key"]): str(chapter["content"])
        for chapter in chapters
    }
    for key, facts in _fundamental_chapter_facts(fundamentals).items():
        chapter_map[key] = _merge_fundamental_facts(chapter_map[key], facts)
    long_term = _scorecard(lead.get("long_term_scores"), LONG_TERM_DIMENSIONS)
    short_term = _scorecard(lead.get("short_term_scores"), SHORT_TERM_DIMENSIONS)
    scarcity = _scarcity(lead.get("scarcity_scores"))
    checklist = _checklist(lead.get("checklist"))
    adversarial = _adversarial(agent_results)
    team_lead_review: dict[str, Any] = {
        "dimension_scores": _scorecard(lead.get("dimension_scores"), {
            "business": "商业质量",
            "financial": "财务质量",
            "industry": "行业地位",
            "risk": "风险控制",
        }),
        "bull_case": str(lead.get("bull_case") or UNKNOWN),
        "bear_case": str(lead.get("bear_case") or UNKNOWN),
        "checklist": checklist,
        "action_tiers": lead.get("action_tiers") if isinstance(lead.get("action_tiers"), list) else [],
        "model_output_status": "parsed" if lead else "unknown",
    }
    chapter_map["institutional_rating"] += (
        "\n\n【Team-lead 四维评审】\n"
        + _render_scorecard("综合", team_lead_review["dimension_scores"])
        + f"\nBull：{team_lead_review['bull_case']}\nBear：{team_lead_review['bear_case']}"
        + f"\nChecklist：{checklist['verdict']}（通过 {checklist['passed_count']}/{checklist['total_count']}）"
        + ("\n研究动作：" + "；".join(str(item) for item in team_lead_review["action_tiers"]) if team_lead_review["action_tiers"] else "")
    )
    chapter_map["risk_analysis"] += (
        "\n\n【挑刺分析】\n"
        + f"结论：{adversarial['verdict']}；问题数：{adversarial['finding_count']}"
        + f"\n证据层：{adversarial['judgment_layers']['evidence']}"
        + f"\n论点层：{adversarial['judgment_layers']['thesis']}"
        + f"\n研究动作层：{adversarial['judgment_layers']['research_action']}"
    )
    chapter_map["investment_conclusion"] += (
        "\n\n【长短期与稀缺性评分】\n"
        + _render_scorecard("长期", long_term)
        + "\n"
        + _render_scorecard("短期", short_term)
        + f"\n稀缺性：{scarcity['total'] if scarcity['total'] is not None else 'unknown'}/100（{scarcity['grade']}）"
    )
    for chapter in chapters:
        chapter["content"] = chapter_map[chapter["key"]]
    executive_summary = str(lead.get("executive_summary") or chapter_map["business_model_analysis"][:300] or UNKNOWN)
    verdict = str(lead.get("verdict") or "unknown（需 team-lead 结构化评审）")
    return {
        "schema_version": 2,
        "report_type": report_type,
        "ticker": ticker,
        "company_name": company_name or ticker,
        "timestamp": datetime.now().astimezone().isoformat(timespec="minutes"),
        "status": status,
        # Astra A6 诚实展示：主编评审是否成功解析（parsed→audited / unknown→degraded）。
        # 与 team_lead_review.model_output_status 同源（同一 lead 真值），只做展示，
        # 不改 completed/failed 状态机语义；顶层冗余便于前端直接读取。
        "lead_review_status": "audited" if lead else "degraded",
        "chapters": chapters,
        **chapter_map,
        "executive_summary": executive_summary,
        "financial_analysis": chapter_map["financial_overview"],
        "technical_analysis": str(lead.get("technical_analysis") or UNKNOWN),
        "verdict": verdict,
        "team_lead_review": team_lead_review,
        "long_term_score": long_term,
        "short_term_score": short_term,
        "scarcity_assessment": scarcity,
        "adversarial_review": adversarial,
        "fundamental_evidence": fundamentals or {
            "items": [],
            "provider": "unavailable",
            "quality_flags": ["fundamentals_unavailable"],
        },
        "raw_agents": {key: _content(agent_results, key) for key in agent_results},
    }
