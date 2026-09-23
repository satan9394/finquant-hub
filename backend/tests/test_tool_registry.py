import json

import pytest

from app.agent.tools import BaseTool, ToolRegistry, ToolResult, validate_tool_arguments


class SampleTool(BaseTool):
    name = "sample"
    description = "A sample tool"
    parameters = {"type": "object", "properties": {"value": {"type": "string"}}}

    async def run(self, **kwargs) -> ToolResult:
        return ToolResult(success=True, data=kwargs)


class ReplacementTool(BaseTool):
    name = "sample"
    description = "A replacement sample tool"
    parameters = {"type": "object", "properties": {}}

    async def run(self, **kwargs) -> ToolResult:
        return ToolResult(success=True, data=kwargs)


@pytest.fixture
def registry():
    instance = ToolRegistry()
    instance.clear()
    yield instance
    instance.clear()


def test_registry_is_singleton_and_registers_tools(registry):
    tool = SampleTool()

    registry.register(tool)

    assert ToolRegistry() is registry
    assert registry.get("sample") is tool
    assert registry.list_all() == [tool]


def test_to_openai_tools_returns_function_schema(registry):
    registry.register(SampleTool())

    result = registry.to_openai_tools()

    assert len(result) == 1
    assert result[0]["type"] == "function"
    assert result[0]["function"]["name"] == "sample"
    assert result[0]["function"]["parameters"] == SampleTool.parameters


def test_registry_replaces_removes_and_clears_tools(registry):
    original = SampleTool()
    replacement = ReplacementTool()
    registry.register(original)
    registry.register(replacement)

    assert registry.get("sample") is replacement

    registry.remove("sample")

    assert registry.get("sample") is None
    assert registry.get("不存在") is None

    registry.register(original)
    registry.clear()

    assert registry.list_all() == []


class TypedTool(BaseTool):
    name = "typed"
    description = "A typed tool"
    parameters = {
        "type": "object",
        "properties": {
            "ticker": {"type": "string"},
            "count": {"type": "integer"},
            "price": {"type": "number"},
            "flag": {"type": "boolean"},
        },
        "required": ["ticker"],
    }

    async def run(self, **kwargs) -> ToolResult:
        return ToolResult(success=True, data=kwargs)


async def test_dispatch_validates_required_and_types(registry):
    registry.register(TypedTool())

    ok = await registry.dispatch("typed", json.dumps({"ticker": "600519", "count": 3, "price": 1.5, "flag": True}))
    assert ok.success is True
    assert ok.data["ticker"] == "600519"

    missing = await registry.dispatch("typed", json.dumps({"count": 3}))
    assert missing.success is False
    assert "缺少必填参数" in missing.error

    wrong_type = await registry.dispatch("typed", json.dumps({"ticker": "600519", "count": "three"}))
    assert wrong_type.success is False
    assert "类型错误" in wrong_type.error

    bad_json = await registry.dispatch("typed", "{not-json")
    assert bad_json.success is False
    assert "JSON 解析失败" in bad_json.error

    unknown = await registry.dispatch("nope", "{}")
    assert unknown.success is False
    assert "未知工具" in unknown.error

    dict_args = await registry.dispatch("typed", {"ticker": "AAPL"})
    assert dict_args.success is True


async def test_validate_tool_arguments_edge_cases():
    params = {
        "type": "object",
        "properties": {"value": {"type": "number"}, "items": {"type": "array"}, "obj": {"type": "object"}},
    }
    assert validate_tool_arguments("t", params, {"value": "x"}) is not None
    assert validate_tool_arguments("t", params, {"value": 1.5}) is None
    assert validate_tool_arguments("t", params, {"items": []}) is None
    assert validate_tool_arguments("t", params, {"items": "x"}) is not None
    assert validate_tool_arguments("t", params, {"obj": {}}) is None
    assert validate_tool_arguments("t", params, {"obj": []}) is not None
    assert validate_tool_arguments("t", params, {"value": None}) is None  # 显式 None 跳过校验
