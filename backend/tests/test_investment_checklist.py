import pytest

from app.agent.tools import ToolRegistry
from app.agent.tools_definitions import CheckBuffettRules
from app.tools.investment_checklist import BUFFETT_GATES, check_buffett_rules


def assessments(status: str = "pass") -> dict[str, str]:
    return dict.fromkeys(BUFFETT_GATES, status)


def test_six_gates_pass_only_when_every_gate_has_evidence():
    assert check_buffett_rules(assessments())["verdict"] == "pass"

    incomplete = assessments()
    incomplete["moat"] = "unknown"
    result = check_buffett_rules(incomplete)
    assert result["verdict"] == "needs_review"
    assert result["unknown_gates"] == ["moat"]


def test_circle_of_competence_and_management_are_hard_vetoes():
    rejected = assessments()
    rejected["management"] = "fail"

    result = check_buffett_rules(rejected)

    assert result["verdict"] == "reject"
    assert result["hard_vetoes"] == ["management"]


def test_invalid_or_missing_gate_is_rejected():
    missing = assessments()
    missing.pop("discipline")
    with pytest.raises(ValueError, match="缺少"):
        check_buffett_rules(missing)

    invalid = assessments()
    invalid["moat"] = "maybe"
    with pytest.raises(ValueError, match="pass/fail/unknown"):
        check_buffett_rules(invalid)


@pytest.mark.asyncio
async def test_checklist_is_available_as_an_agent_tool():
    tool = ToolRegistry().get("check_buffett_rules")
    assert isinstance(tool, CheckBuffettRules)

    result = await tool.run(assessments=assessments(), notes={"moat": "two-source evidence"})
    assert result.success is True
    assert result.data["passed_count"] == 6
    assert result.data["gates"][2]["note"] == "two-source evidence"
