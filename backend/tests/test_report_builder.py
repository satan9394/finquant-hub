import json

from app.services.report_builder import build_unified_report, parse_lead_review


def _lead_payload():
    return {
        "executive_summary": "证据支持有限的中性结论",
        "verdict": "中性观察",
        "bull_case": "需求持续且现金流改善",
        "bear_case": "估值收缩且增长放缓",
        "chapters": {"company_overview": "FACT：测试公司（usTEST）"},
        "dimension_scores": {"business": 8, "financial": 7, "industry": 6, "risk": 5},
        "long_term_scores": {"business_quality": 8, "moat": 7, "financial_quality": 6, "valuation_safety": 5},
        "short_term_scores": {"trend": 6, "catalyst": 5, "sentiment": 4, "risk_reward": 5},
        "scarcity_scores": {
            "technology_barrier": 9,
            "supply_chain_control": 8,
            "substitution_difficulty": 8,
            "qualification_barrier": 7,
            "capacity_constraint": 6,
            "policy_importance": 7,
        },
        "checklist": {
            "circle_of_competence": "pass",
            "business_quality": "pass",
            "moat": "pass",
            "management": "unknown",
            "margin_of_safety": "unknown",
            "discipline": "pass",
        },
        "action_tiers": ["先补管理层与估值证据", "跟踪现金流否决条件"],
    }


def test_parse_lead_review_accepts_fenced_json_and_rejects_invalid_output():
    payload = _lead_payload()
    assert parse_lead_review(f"```json\n{json.dumps(payload)}\n```") == payload
    assert parse_lead_review("not json") == {}


def test_unified_report_has_13_chapters_and_structured_assessments():
    agent_results = {
        "business_analyst": {"content": "业务结论", "tool_log": [{"name": "search_news"}]},
        "financial_analyst": {"content": "财务结论", "tool_log": []},
        "industry_researcher": {"content": "行业结论", "tool_log": []},
        "risk_assessor": {"content": "风险结论", "tool_log": []},
    }
    report = build_unified_report(
        "usTEST",
        "测试公司",
        agent_results,
        lead_content=json.dumps(_lead_payload()),
    )

    assert report["schema_version"] == 2
    assert len(report["chapters"]) == 13
    assert [chapter["order"] for chapter in report["chapters"]] == list(range(1, 14))
    assert report["company_overview"].startswith("FACT")
    assert report["long_term_score"]["score"] == 6.5
    assert report["short_term_score"]["score"] == 5
    assert report["scarcity_assessment"]["total"] == 75
    assert report["scarcity_assessment"]["grade"] == "高度稀缺"
    assert report["team_lead_review"]["checklist"]["verdict"] == "needs_review"
    assert set(report["adversarial_review"]["severity_counts"]) == {
        "critical", "high", "medium", "low", "info",
    }
    assert set(report["adversarial_review"]["judgment_layers"]) == {
        "evidence", "thesis", "research_action",
    }


def test_invalid_lead_output_preserves_unknown_instead_of_inventing_scores():
    report = build_unified_report("usTEST", "", {}, lead_content="invalid")

    assert report["team_lead_review"]["model_output_status"] == "unknown"
    assert report["long_term_score"]["score"] is None
    assert report["short_term_score"]["status"] == "unknown"
    assert report["scarcity_assessment"]["grade"] == "unknown"
    assert all("unknown" in chapter["content"] for chapter in report["chapters"])


def test_mocked_fundamentals_fill_financial_chapters_with_provenance():
    fundamentals = {
        "provider": "akshare",
        "as_of": "2026-03-31",
        "quality_flags": ["missing_roe"],
        "items": [
            {"metric": "total_revenue", "value": 120_000_000_000, "currency": "CNY",
             "as_of": "2026-03-31", "period_type": "reported", "provider": "akshare"},
            {"metric": "net_income", "value": 60_000_000_000, "currency": "CNY",
             "as_of": "2026-03-31", "period_type": "reported", "provider": "akshare"},
            {"metric": "gross_margin", "value": 91.2, "currency": None,
             "as_of": "2026-03-31", "period_type": "reported", "provider": "akshare"},
            {"metric": "debt_to_assets", "value": 21.5, "currency": None,
             "as_of": "2026-03-31", "period_type": "reported", "provider": "akshare"},
            {"metric": "operating_cash_flow", "value": 45_000_000_000, "currency": "CNY",
             "as_of": "2026-03-31", "period_type": "reported", "provider": "akshare"},
        ],
    }

    report = build_unified_report("sh600519", "贵州茅台", {}, fundamentals=fundamentals)

    assert "营业收入：1,200.00 亿元 CNY" in report["financial_overview"]
    assert "净利润：600.00 亿元 CNY" in report["financial_overview"]
    assert "毛利率：91.20%" in report["profitability_analysis"]
    assert "资产负债率：21.50%" in report["solvency_analysis"]
    assert "经营活动现金流：450.00 亿元 CNY" in report["cash_flow_analysis"]
    assert "【基本面事实｜数据存疑】" in report["financial_overview"]
    assert "来源：akshare；截至：2026-03-31；TTM：否" in report["financial_overview"]
    assert "质量提示：missing_roe" in report["financial_overview"]
    assert report["shareholder_analysis"].startswith("unknown（")
    assert report["fundamental_evidence"] == fundamentals
