"""Probe optional memory candidates without changing the native answer path."""

from __future__ import annotations

import argparse
import asyncio
import importlib.metadata
import importlib.util
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.memory_fts_baseline import DEFAULT_FIXTURE, run_benchmark

JSONDict = dict[str, Any]


@dataclass(frozen=True)
class CandidateSpec:
    name: str
    distribution: str
    import_name: str
    expected_license: str
    infrastructure: tuple[str, ...]
    fallback: str


CANDIDATES = (
    CandidateSpec(
        name="graphiti",
        distribution="graphiti-core",
        import_name="graphiti_core",
        expected_license="Apache-2.0",
        infrastructure=("graph database", "embedding provider", "LLM extraction provider"),
        fallback="discard the rebuildable read model and keep NativeFTSMemoryProvider",
    ),
    CandidateSpec(
        name="mem0",
        distribution="mem0ai",
        import_name="mem0",
        expected_license="Apache-2.0",
        infrastructure=("vector store", "embedding provider", "LLM extraction provider"),
        fallback="disable the optional adapter and keep NativeFTSMemoryProvider",
    ),
)


def probe_candidate(spec: CandidateSpec, fixture_case_count: int) -> JSONDict:
    installed = importlib.util.find_spec(spec.import_name) is not None
    version: str | None = None
    if installed:
        try:
            version = importlib.metadata.version(spec.distribution)
        except importlib.metadata.PackageNotFoundError:
            version = None

    reason = (
        "package detected, but framework execution requires an isolated adapter and disposable infrastructure"
        if installed
        else "package is not installed in the project environment"
    )
    return {
        **asdict(spec),
        "installed": installed,
        "installed_version": version,
        "status": "NOT_RUN",
        "quality_status": "PARTIAL" if installed else "UPSTREAM_ERROR",
        "reason": reason,
        "fixture_cases_eligible": fixture_case_count,
        "fixture_cases_executed": 0,
        "metrics": {
            "recall_at_5": None,
            "precision_at_5": None,
            "p95_latency_ms": None,
            "user_isolation_leakage": None,
            "prompt_injection_execution": None,
        },
        "production_answer_injection": False,
        "production_data_writes": 0,
        "evidence_scope": "local_dependency_probe_only",
    }


async def run_shadow_poc(*, fixture_path: Path = DEFAULT_FIXTURE, repetitions: int = 2) -> JSONDict:
    native = await run_benchmark(fixture_path, repetitions=repetitions)
    case_count = int(native["fixture_case_count"])
    return {
        "schema_version": "aios-memory-shadow-poc-v1",
        "fixture_version": native["fixture_version"],
        "evidence_scope": "synthetic_fixture_only",
        "native": {**native, "answer_path": True, "status": "MEASURED"},
        "candidates": [probe_candidate(spec, case_count) for spec in CANDIDATES],
        "external_network_lookup": {
            "status": "UPSTREAM_ERROR",
            "reason": "package index lookup could not connect through the configured proxy",
        },
        "decision_gate": {
            "status": "INSUFFICIENT_EVIDENCE",
            "reason": "no third-party candidate executed the fixture",
            "allowed_next_decisions": ["defer", "authorize isolated disposable-infrastructure PoC"],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--repetitions", type=int, default=2)
    args = parser.parse_args()
    report = asyncio.run(run_shadow_poc(fixture_path=args.fixture, repetitions=args.repetitions))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
