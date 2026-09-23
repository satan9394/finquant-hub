import pytest

from app.orchestrator import TeamDefinitionError, build_team_runtime, load_team, parse_team_yaml

VALID_TEAM = """
version: 1
key: research-team
name: Research Team
description: Two collectors feed one analyst.
agents:
  - key: market
    name: Market Researcher
    avatar: M
    system_prompt: |
      Research market structure.
      Cite evidence.
    tools: [get_stock_data, search_news]
  - key: risk
    name: Risk Researcher
    system_prompt: Identify downside risks.
    tools: [search_news]
  - key: synthesis
    name: Lead Analyst
    system_prompt: Synthesize prior findings.
    dependencies: [market, risk]
"""


def test_parse_valid_team_yaml():
    team = parse_team_yaml(VALID_TEAM)

    assert team.key == "research-team"
    assert [agent.key for agent in team.agents] == ["market", "risk", "synthesis"]
    assert team.agents[0].tools == ("get_stock_data", "search_news")
    assert team.agents[2].dependencies == ("market", "risk")
    assert "Cite evidence." in team.agents[0].system_prompt


@pytest.mark.asyncio
async def test_yaml_team_builds_and_runs_dag():
    team = parse_team_yaml(VALID_TEAM)

    def runner_factory(agent):
        async def run(context):
            return {"agent": agent.key, "inputs": sorted(context.results)}

        return run

    runtime = build_team_runtime(team, runner_factory)
    events = [event async for event in runtime.stream()]

    assert runtime.results["market"] == {"agent": "market", "inputs": []}
    assert runtime.results["risk"] == {"agent": "risk", "inputs": []}
    assert runtime.results["synthesis"] == {"agent": "synthesis", "inputs": ["market", "risk"]}
    assert [event.node_key for event in events if event.kind == "node_completed"][-1] == "synthesis"


def test_load_team_reads_utf8_yaml_file(tmp_path):
    path = tmp_path / "team.yaml"
    path.write_text(VALID_TEAM.replace("Research Team", "研究团队"), encoding="utf-8")

    team = load_team(path)

    assert team.name == "研究团队"


@pytest.mark.parametrize(
    "yaml_text, expected",
    [
        (VALID_TEAM.replace("dependencies: [market, risk]", "dependencies: [missing]"), "不存在"),
        (VALID_TEAM.replace("tools: [search_news]", "dependencies: [synthesis]\n    tools: [search_news]"), "循环"),
        (VALID_TEAM.replace("  - key: risk", "  - key: market"), "唯一"),
        (VALID_TEAM.replace("description: Two collectors feed one analyst.", "unexpected: true"), "extra_forbidden"),
        (VALID_TEAM.replace("system_prompt: Identify downside risks.", "system_prompt: '   '"), "string_too_short"),
        (VALID_TEAM.replace("tools: [search_news]", "tools: ['bad tool']"), "非法工具名"),
    ],
)
def test_invalid_team_definitions_are_rejected(yaml_text, expected):
    with pytest.raises(TeamDefinitionError, match=expected):
        parse_team_yaml(yaml_text)


def test_safe_loader_rejects_python_object_tags():
    with pytest.raises(TeamDefinitionError, match="语法无效"):
        parse_team_yaml("!!python/object/apply:os.system ['echo unsafe']")


def test_load_team_requires_yaml_extension(tmp_path):
    path = tmp_path / "team.txt"
    path.write_text(VALID_TEAM, encoding="utf-8")

    with pytest.raises(TeamDefinitionError, match="扩展名"):
        load_team(path)
