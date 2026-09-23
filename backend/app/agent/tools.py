"""BaseTool 抽象基类 + ToolRegistry 注册表。

所有 Agent 工具继承 BaseTool，实现 run 方法返回 ToolResult。
ToolRegistry 统一管理注册、查找、转为 OpenAI function_calling 格式。

v1.1（2026-08-31，Agent SDK 设计点自研吸收）：
- ToolRegistry.dispatch()：类型驱动参数前置校验（JSON Schema required + 类型）后执行工具，
  借鉴 OpenAI Agents SDK function_tool 的校验语义，零新依赖。
"""
from abc import ABC, abstractmethod
import inspect
import json
from collections.abc import Callable
from typing import Any, cast


class ToolResult:
    """工具执行结果。"""

    def __init__(self, success: bool, data: Any = None, error: str | None = None):
        self.success = success
        self.data = data
        self.error = error


def validate_tool_arguments(name: str, parameters: dict[str, Any], arguments: dict[str, Any]) -> str | None:
    """按工具声明的 JSON Schema 前置校验参数。

    校验范围（与 OpenAI function_calling 对齐的最小契约）：
    - required 字段必须存在
    - 存在值的字段类型必须匹配 properties 中的 type（string/number/integer/boolean/array/object）
    返回 None 表示通过，否则返回面向用户可读的错误信息。
    """
    properties = parameters.get("properties") or {}
    for req in parameters.get("required") or []:
        if req not in arguments or arguments[req] is None:
            return f"工具 {name} 缺少必填参数：{req}"
    for key, value in arguments.items():
        if value is None:
            continue
        schema = properties.get(key)
        if not schema:
            continue
        expected = schema.get("type")
        if expected == "number" and isinstance(value, bool):
            return f"工具 {name} 参数 {key} 类型错误：期望 number，得到 bool"
        if expected == "integer":
            if isinstance(value, bool) or not isinstance(value, int):
                return f"工具 {name} 参数 {key} 类型错误：期望 integer，得到 {type(value).__name__}"
        elif expected == "number":
            if not isinstance(value, (int, float)):
                return f"工具 {name} 参数 {key} 类型错误：期望 number，得到 {type(value).__name__}"
        elif expected == "string":
            if not isinstance(value, str):
                return f"工具 {name} 参数 {key} 类型错误：期望 string，得到 {type(value).__name__}"
        elif expected == "boolean":
            if not isinstance(value, bool):
                return f"工具 {name} 参数 {key} 类型错误：期望 boolean，得到 {type(value).__name__}"
        elif expected == "array":
            if not isinstance(value, list):
                return f"工具 {name} 参数 {key} 类型错误：期望 array，得到 {type(value).__name__}"
        elif expected == "object":
            if not isinstance(value, dict):
                return f"工具 {name} 参数 {key} 类型错误：期望 object，得到 {type(value).__name__}"
    return None


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

    async def dispatch(self, name: str, arguments: str | dict[str, Any]) -> ToolResult:
        """按名称解析参数并执行工具（类型驱动前置校验）。

        arguments 接受 JSON 字符串或已解析字典。校验失败（未知工具 / JSON 非法 /
        缺少必填 / 类型不符）直接返回失败的 ToolResult，不执行 run。
        借鉴 OpenAI Agents SDK function_tool 的 schema 校验语义。
        """
        tool = self._tools.get(name)
        if tool is None:
            return ToolResult(False, error=f"未知工具：{name}")

        parsed: dict[str, Any]
        if isinstance(arguments, str):
            try:
                parsed = json.loads(arguments) if arguments.strip() else {}
            except json.JSONDecodeError as e:
                return ToolResult(False, error=f"工具 {name} 参数 JSON 解析失败：{e}")
        elif isinstance(arguments, dict):
            parsed = arguments
        else:
            return ToolResult(False, error=f"工具 {name} 参数必须是 JSON 字符串或对象")

        if not isinstance(parsed, dict):
            return ToolResult(False, error=f"工具 {name} 参数必须是 JSON 对象")

        error = validate_tool_arguments(name, tool.parameters, parsed)
        if error is not None:
            return ToolResult(False, error=error)

        try:
            return await tool.run(**parsed)
        except Exception as e:  # noqa: BLE001 - 工具错误统一转为失败结果
            return ToolResult(False, error=f"工具 {name} 执行异常：{e}")
