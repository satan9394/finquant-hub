"""BaseTool 抽象基类 + ToolRegistry 注册表。

所有 Agent 工具继承 BaseTool，实现 run 方法返回 ToolResult。
ToolRegistry 统一管理注册、查找、转为 OpenAI function_calling 格式。
"""
from abc import ABC, abstractmethod
import inspect
from collections.abc import Callable
from typing import Any, cast


class ToolResult:
    """工具执行结果。"""

    def __init__(self, success: bool, data: Any = None, error: str | None = None):
        self.success = success
        self.data = data
        self.error = error


class BaseTool(ABC):
    """工具基类：每个 Agent 工具必须继承并实现 run。

    子类必须定义 name / description / parameters 类属性。
    """

    name: str = ""
    description: str = ""
    parameters: dict[str, Any] = {}  # JSON Schema
    auto_register: bool = True

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if not cls.name:
            raise TypeError(f"{cls.__name__} 必须定义 name 类属性")

    @abstractmethod
    async def run(self, **kwargs: Any) -> ToolResult:
        """执行工具逻辑，返回 ToolResult。"""

    def to_openai_tool(self) -> dict[str, Any]:
        """转为 OpenAI function_calling 格式。"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    """全局工具注册表（单例）。"""

    _instance: "ToolRegistry | None" = None
    _tools: dict[str, BaseTool]

    def __new__(cls) -> "ToolRegistry":
        if cls._instance is None:
            instance = super().__new__(cls)
            instance._tools = {}
            # ponytail: 本地工具统一无参构造，直接发现子类即可，避免维护手动清单。
            for tool_class in BaseTool.__subclasses__():
                if tool_class.auto_register and not inspect.isabstract(tool_class):
                    factory = cast(Callable[[], BaseTool], tool_class)
                    instance.register(factory())
            cls._instance = instance
        return cls._instance

    def register(self, tool: BaseTool) -> None:
        """注册一个工具实例，按 name 去重。"""
        self._tools[tool.name] = tool

    def get(self, name: str) -> BaseTool | None:
        """按名称查找工具。"""
        return self._tools.get(name)

    def list_all(self) -> list[BaseTool]:
        """返回所有已注册工具。"""
        return list(self._tools.values())

    def to_openai_tools(self) -> list[dict[str, Any]]:
        """全部工具转为 OpenAI function_calling 格式列表。"""
        return [t.to_openai_tool() for t in self._tools.values()]

    def remove(self, name: str) -> None:
        """移除指定工具。"""
        self._tools.pop(name, None)

    def clear(self) -> None:
        """清空所有工具。"""
        self._tools.clear()
