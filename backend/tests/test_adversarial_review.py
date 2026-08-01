import pytest

from app.agent.tools import ToolRegistry
from app.agent.tools_definitions import AdversarialReview
from app.tools.adversarial_review import adversarial_review


def test_adversarial_review_flags_evidence_and_financial_quality_gaps():
    result = adversarial_review(
        [{
            "statement": "增长来自持续需求",
            "evidence_count": 1,
            "primary_source": False,
            "contrary_evidence": "",
        }],
        {
            "revenue_growth_pct": 5,
            "receivables_growth_pct": 24,
            "inventory_growth_pct": 18,
            "net_income": 100,
            "operating_cash_flow": 40,
        },
    )

    categories = {finding["category"] for finding in result["findings"]}
    assert result["verdict"] == "requires_follow_up"
    assert {
        "secondary_source_only",
        "missing_disconfirmation",
        "receivables_outpace_revenue",
        "inventory_outpace_revenue",
        "weak_cash_conversion",
    } <= categories
    assert "不构成舞弊证据" in result["limitation"]


def test_adversarial_review_can_return_no_material_flags():
    result = adversarial_review([{
        "statement": "现金转化稳定",
        "evidence_count": 2,
        "primary_source": True,
        "contrary_evidence": "若营运资本恶化则推翻",
    }])
    assert result["verdict"] == "no_material_flags"


@pytest.mark.asyncio
async def test_adversarial_review_is_registered_as_agent_tool():
    tool = ToolRegistry().get("adversarial_review")
    assert isinstance(tool, AdversarialReview)
    result = await tool.run(claims=[])
    assert result.success is False
    assert "至少需要" in result.error
