"""支持并行节点、依赖和流式事件的最小异步 DAG runtime。"""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Literal, TypeAlias

_RUNTIME_EVENTS = {"node_started", "node_completed", "node_failed", "node_skipped"}


class DAGValidationError(ValueError):
    """DAG 定义无效。"""


@dataclass(frozen=True)
class DAGEvent:
    """runtime 或节点发出的事件。"""

    kind: str
    node_key: str
    data: dict[str, Any] = field(default_factory=dict)
    result: Any = None
    error: Exception | None = None


class DAGContext:
    """节点运行上下文：只读前序结果 + 自定义事件出口。"""

    def __init__(
        self,
        node_key: str,
        results: Mapping[str, Any],
        emit_event: Callable[[DAGEvent], None],
    ) -> None:
        self.node_key = node_key
        self.results = results
        self._emit_event = emit_event

    def emit(self, kind: str, data: dict[str, Any] | None = None) -> None:
        if not kind or kind in _RUNTIME_EVENTS:
            raise ValueError(f"节点事件名无效或被 runtime 保留：{kind!r}")
        self._emit_event(DAGEvent(kind=kind, node_key=self.node_key, data=data or {}))


NodeRunner = Callable[[DAGContext], Awaitable[Any]]
QueueItem: TypeAlias = (
    tuple[Literal["event"], DAGEvent]
    | tuple[Literal["finished"], str, Any, Exception | None]
)


@dataclass(frozen=True)
class DAGNode:
    key: str
    run: NodeRunner
    dependencies: tuple[str, ...] = ()


class DAGRuntime:
    """按依赖调度异步节点；无依赖节点并行，失败依赖的后继被跳过。"""

    def __init__(self, nodes: list[DAGNode]) -> None:
        self.nodes = {node.key: node for node in nodes}
        self._validate(nodes)
        self.results: dict[str, Any] = {}

    async def stream(self) -> AsyncIterator[DAGEvent]:
        """运行 DAG 并按发生顺序产生 DAGEvent。"""
        self.results = {}
        pending = dict(self.nodes)
        running: dict[str, asyncio.Task[None]] = {}
        failed: set[str] = set()
        skipped: set[str] = set()
        queue: asyncio.Queue[QueueItem] = asyncio.Queue()

        def emit_event(event: DAGEvent) -> None:
            queue.put_nowait(("event", event))

        async def worker(node: DAGNode) -> None:
            emit_event(DAGEvent(kind="node_started", node_key=node.key))
            context = DAGContext(
                node_key=node.key,
                results=MappingProxyType(dict(self.results)),
                emit_event=emit_event,
            )
            try:
                result = await node.run(context)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                queue.put_nowait(("finished", node.key, None, exc))
            else:
                queue.put_nowait(("finished", node.key, result, None))

        try:
            while pending or running or not queue.empty():
                blocked = [
                    key for key, node in pending.items()
                    if any(dependency in failed or dependency in skipped for dependency in node.dependencies)
                ]
                for key in blocked:
                    node = pending.pop(key)
                    skipped.add(key)
                    emit_event(DAGEvent(
                        kind="node_skipped",
                        node_key=key,
                        data={"failed_dependencies": [
                            dependency for dependency in node.dependencies
                            if dependency in failed or dependency in skipped
                        ]},
                    ))

                ready = [
                    key for key, node in pending.items()
                    if all(dependency in self.results for dependency in node.dependencies)
                ]
                for key in ready:
                    node = pending.pop(key)
                    running[key] = asyncio.create_task(worker(node))

                if not running and pending:
                    raise DAGValidationError("DAG 无法继续调度")
                if not running and not pending and queue.empty():
                    break

                item = await queue.get()
                if item[0] == "event":
                    yield item[1]
                    continue

                _, key, result, error = item
                running.pop(key, None)
                if error is not None:
                    failed.add(key)
                    yield DAGEvent(kind="node_failed", node_key=key, error=error)
                else:
                    self.results[key] = result
                    yield DAGEvent(kind="node_completed", node_key=key, result=result)
        finally:
            for task in running.values():
                if not task.done():
                    task.cancel()
            await asyncio.gather(*running.values(), return_exceptions=True)

    @staticmethod
    def _validate(nodes: list[DAGNode]) -> None:
        keys = [node.key for node in nodes]
        if any(not key for key in keys):
            raise DAGValidationError("DAG 节点 key 不能为空")
        if len(keys) != len(set(keys)):
            raise DAGValidationError("DAG 节点 key 必须唯一")

        known = set(keys)
        remaining = {}
        for node in nodes:
            unknown = set(node.dependencies) - known
            if unknown:
                raise DAGValidationError(f"节点 {node.key} 引用了不存在的依赖：{sorted(unknown)}")
            remaining[node.key] = set(node.dependencies)

        resolved: set[str] = set()
        while remaining:
            ready = [key for key, dependencies in remaining.items() if dependencies <= resolved]
            if not ready:
                raise DAGValidationError("DAG 包含循环依赖")
            for key in ready:
                resolved.add(key)
                remaining.pop(key)
