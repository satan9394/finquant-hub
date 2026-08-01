"""YAML 团队定义、严格校验与 DAG 构建。"""

import re
from collections.abc import Callable
from pathlib import Path
from typing import Literal, Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from .runtime import DAGNode, DAGRuntime, NodeRunner

_MAX_TEAM_FILE_BYTES = 1_000_000
_KEY_PATTERN = r"^[a-z][a-z0-9_-]{0,63}$"
_TOOL_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"


class TeamDefinitionError(ValueError):
    """YAML 语法或团队定义无效。"""


class TeamAgent(BaseModel):
    """单个 Agent 的声明式配置。"""

    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)

    key: str = Field(pattern=_KEY_PATTERN)
    name: str = Field(min_length=1, max_length=100)
    system_prompt: str = Field(min_length=1, max_length=20_000)
    avatar: str = Field(default="", max_length=16)
    dependencies: tuple[str, ...] = Field(default=(), max_length=32)
    tools: tuple[str, ...] = Field(default=(), max_length=64)

    @model_validator(mode="after")
    def validate_lists(self) -> Self:
        if len(self.dependencies) != len(set(self.dependencies)):
            raise ValueError(f"Agent {self.key} 的 dependencies 不能重复")
        if len(self.tools) != len(set(self.tools)):
            raise ValueError(f"Agent {self.key} 的 tools 不能重复")
        invalid_tools = [tool for tool in self.tools if not re.fullmatch(_TOOL_PATTERN, tool)]
        if invalid_tools:
            raise ValueError(f"Agent {self.key} 包含非法工具名：{invalid_tools}")
        return self


class TeamDefinition(BaseModel):
    """可从 YAML 加载的团队及 Agent DAG。"""

    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)

    version: Literal[1] = 1
    key: str = Field(pattern=_KEY_PATTERN)
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    agents: tuple[TeamAgent, ...] = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def validate_graph(self) -> Self:
        keys = [agent.key for agent in self.agents]
        if len(keys) != len(set(keys)):
            raise ValueError("团队 Agent key 必须唯一")

        known = set(keys)
        remaining = {}
        for agent in self.agents:
            unknown = set(agent.dependencies) - known
            if unknown:
                raise ValueError(f"Agent {agent.key} 引用了不存在的依赖：{sorted(unknown)}")
            if agent.key in agent.dependencies:
                raise ValueError(f"Agent {agent.key} 不能依赖自身")
            remaining[agent.key] = set(agent.dependencies)

        resolved: set[str] = set()
        while remaining:
            ready = [key for key, dependencies in remaining.items() if dependencies <= resolved]
            if not ready:
                raise ValueError("团队 Agent 图包含循环依赖")
            for key in ready:
                resolved.add(key)
                remaining.pop(key)
        return self


RunnerFactory = Callable[[TeamAgent], NodeRunner]


def parse_team_yaml(text: str) -> TeamDefinition:
    """安全解析 YAML 文本并返回严格验证后的团队定义。"""
    if not text.strip():
        raise TeamDefinitionError("团队 YAML 不能为空")
    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise TeamDefinitionError(f"团队 YAML 语法无效：{exc}") from exc
    if not isinstance(raw, dict):
        raise TeamDefinitionError("团队 YAML 顶层必须是对象")
    try:
        return TeamDefinition.model_validate(raw)
    except ValidationError as exc:
        raise TeamDefinitionError(f"团队定义校验失败：{exc}") from exc


def load_team(path: str | Path) -> TeamDefinition:
    """从 UTF-8 .yaml/.yml 文件加载团队，拒绝异常大文件。"""
    team_path = Path(path)
    if team_path.suffix.lower() not in {".yaml", ".yml"}:
        raise TeamDefinitionError("团队定义文件必须使用 .yaml 或 .yml 扩展名")
    if team_path.stat().st_size > _MAX_TEAM_FILE_BYTES:
        raise TeamDefinitionError("团队定义文件不能超过 1 MB")
    return parse_team_yaml(team_path.read_text(encoding="utf-8"))


def build_team_nodes(team: TeamDefinition, runner_factory: RunnerFactory) -> list[DAGNode]:
    """把声明式 Agent 配置绑定到执行函数，生成 DAG 节点。"""
    return [
        DAGNode(
            key=agent.key,
            run=runner_factory(agent),
            dependencies=agent.dependencies,
        )
        for agent in team.agents
    ]


def build_team_runtime(team: TeamDefinition, runner_factory: RunnerFactory) -> DAGRuntime:
    """构建可直接 stream() 的团队 runtime。"""
    return DAGRuntime(build_team_nodes(team, runner_factory))
