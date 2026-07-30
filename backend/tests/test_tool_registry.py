import pytest

from app.agent.tools import BaseTool, ToolRegistry, ToolResult


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
