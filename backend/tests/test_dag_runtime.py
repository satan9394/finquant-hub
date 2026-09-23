import asyncio

import pytest

from app.orchestrator import DAGNode, DAGRuntime, DAGValidationError


@pytest.mark.asyncio
async def test_independent_nodes_run_concurrently_and_feed_dependent():
    started = 0
    both_started = asyncio.Event()

    async def root(context):
        nonlocal started
        started += 1
        if started == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=1)
        context.emit("progress", {"root": context.node_key})
        return context.node_key.upper()

    async def child(context):
        assert dict(context.results) == {"a": "A", "b": "B"}
        return "done"

    runtime = DAGRuntime([
        DAGNode("a", root),
        DAGNode("b", root),
        DAGNode("child", child, dependencies=("a", "b")),
    ])

    events = [event async for event in runtime.stream()]

    assert len([event for event in events if event.kind == "progress"]) == 2
    assert runtime.results == {"a": "A", "b": "B", "child": "done"}
    assert next(event for event in events if event.node_key == "child").kind == "node_started"


@pytest.mark.asyncio
async def test_failure_skips_dependents_but_not_independent_nodes():
    async def fail(context):
        raise RuntimeError("boom")

    async def succeed(context):
        return "ok"

    runtime = DAGRuntime([
        DAGNode("failed", fail),
        DAGNode("dependent", succeed, dependencies=("failed",)),
        DAGNode("independent", succeed),
    ])

    events = [event async for event in runtime.stream()]

    failure = next(event for event in events if event.kind == "node_failed")
    skipped = next(event for event in events if event.kind == "node_skipped")
    assert str(failure.error) == "boom"
    assert skipped.node_key == "dependent"
    assert skipped.data == {"failed_dependencies": ["failed"]}
    assert runtime.results == {"independent": "ok"}


def test_invalid_graphs_are_rejected_before_execution():
    async def run(context):
        return None

    with pytest.raises(DAGValidationError, match="不存在"):
        DAGRuntime([DAGNode("a", run, dependencies=("missing",))])
    with pytest.raises(DAGValidationError, match="循环"):
        DAGRuntime([
            DAGNode("a", run, dependencies=("b",)),
            DAGNode("b", run, dependencies=("a",)),
        ])
    with pytest.raises(DAGValidationError, match="唯一"):
        DAGRuntime([DAGNode("a", run), DAGNode("a", run)])
