"""Compare typed-memory retrieval with the AIOS-001 FTS5 fixture baseline."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import statistics
import sys
import tempfile
from time import perf_counter
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import config, database
from app.services.investment_memory import create_memory, search_memories
from scripts.memory_fts_baseline import (
    DEFAULT_FIXTURE,
    load_fixture,
    run_benchmark as run_fts_benchmark,
)

JSONDict = dict[str, Any]


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * percentile)))
    return ordered[index]


async def _seed_typed_fixture(fixture: JSONDict) -> tuple[dict[str, int], dict[str, int]]:
    for user in fixture["users"]:
        await database.execute(
            "INSERT INTO users (id, email) VALUES (?, ?)",
            (user["id"], user["email"]),
        )
    workspace_ids: dict[str, int] = {}
    for record in fixture["records"]:
        workspace_key = record["workspace_id"]
        owner_id = next(
            item["user_id"]
            for item in fixture["conversations"]
            if item["key"] == record["conversation"]
        )
        composite_key = f"{owner_id}:{workspace_key}"
        if composite_key not in workspace_ids:
            workspace_ids[composite_key] = await database.execute(
                "INSERT INTO research_workspaces "
                "(symbol, name, instrument_json, user_id) VALUES (?, ?, '{}', ?)",
                (workspace_key, workspace_key, owner_id),
            )

    key_to_id: dict[str, int] = {}
    for index, record in enumerate(fixture["records"], 1):
        owner_id = next(
            item["user_id"]
            for item in fixture["conversations"]
            if item["key"] == record["conversation"]
        )
        evidence_id = None
        if record.get("source"):
            evidence_id = f"ev_fixture_{index:03d}"
            data_status = record.get("quality") or "OK"
            value_json = "null" if data_status == "UPSTREAM_ERROR" else json.dumps(record["key"])
            await database.execute(
                "INSERT INTO evidence_objects "
                "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, "
                "value_json, source, as_of, retrieved_at, quality_flags_json, license_scope) "
                "VALUES (?, ?, 'observed_fact', ?, 'instrument', ?, 'fixture_memory', ?, ?, ?, ?, ?, 'test-only')",
                (
                    owner_id,
                    evidence_id,
                    data_status,
                    record["subject"],
                    value_json,
                    record["source"],
                    record.get("as_of"),
                    record["created_at"],
                    json.dumps([data_status] if data_status != "OK" else []),
                ),
            )
        information_kind = {
            "OBSERVED_FACT": "FACT",
            "COMPUTED_RESULT": "FACT",
            "AI_INFERENCE": "AI_INFERENCE",
            "USER_HYPOTHESIS": "USER_HYPOTHESIS",
            "RESEARCH_INTEREST": "USER_PREFERENCE",
            "UNTRUSTED_MESSAGE": "USER_HYPOTHESIS",
        }[record["information_type"]]
        role = record["role"]
        status = "confirmed" if evidence_id or role == "user" else "candidate"
        quality_flags = []
        if record.get("quality"):
            quality_flags.append(record["quality"])
        if information_kind == "FACT" and evidence_id is None:
            quality_flags.append("MISSING_PROVENANCE")
        memory = await create_memory(
            user_id=owner_id,
            workspace_id=workspace_ids[f"{owner_id}:{record['workspace_id']}"],
            subject_type="instrument",
            subject_id=record["subject"],
            memory_type={
                "OBSERVED_FACT": "evidence_reference",
                "COMPUTED_RESULT": "evidence_reference",
                "AI_INFERENCE": "hypothesis",
                "USER_HYPOTHESIS": "hypothesis",
                "RESEARCH_INTEREST": "research_interest",
                "UNTRUSTED_MESSAGE": "hypothesis",
            }[record["information_type"]],
            information_kind=information_kind,
            content={"fixture_key": record["key"], "text": record["content"]},
            source_kind="evidence" if evidence_id else ("user" if role == "user" else "ai"),
            source_id=evidence_id,
            evidence_id=evidence_id,
            valid_from=record.get("as_of"),
            observed_at=record["created_at"],
            status=status,
            quality_flags=quality_flags,
            created_by="user" if role == "user" else "ai",
        )
        key_to_id[record["key"]] = int(memory["id"])
    return key_to_id, workspace_ids


def _keys(hits: list[JSONDict]) -> list[str]:
    return [str(hit["content"]["fixture_key"]) for hit in hits]


async def _typed_report(fixture: JSONDict, repetitions: int) -> JSONDict:
    retrieval_cases = []
    latencies: list[float] = []
    for case in fixture["retrieval_cases"]:
        hits: list[JSONDict] = []
        for _ in range(repetitions):
            started = perf_counter()
            hits = await search_memories(case["query"], user_id=case["user_id"], limit=5)
            latencies.append((perf_counter() - started) * 1000)
        retrieved = _keys(hits)
        relevant = set(case["relevant"])
        matched = relevant.intersection(retrieved)
        retrieval_cases.append({
            "id": case["id"],
            "retrieved": retrieved,
            "recall_at_5": len(matched) / len(relevant),
            "precision_at_5": len(matched) / len(retrieved) if retrieved else 0.0,
        })

    owner_id = int(fixture["users"][0]["id"])
    workspaces = await database.query_all(
        "SELECT id, symbol FROM research_workspaces WHERE user_id=?",
        (owner_id,),
    )
    workspace_ids = {row["symbol"]: row["id"] for row in workspaces}
    semantic_cases = [
        _keys(await search_memories(
            "REVENUE_TIMELINE", user_id=owner_id, subject_id="sh600519",
            valid_at="2026-02-01", limit=5,
        ))[0] == "cn_revenue_current",
        _keys(await search_memories(
            "REVENUE_TIMELINE", user_id=owner_id, subject_id="sh600519",
            valid_at="2025-06-01", limit=5,
        )) == ["cn_revenue_old"],
        _keys(await search_memories(
            "WORKSPACE_COLLISION", user_id=owner_id,
            workspace_id=workspace_ids["workspace-alpha"], limit=5,
        )) == ["workspace_alpha_note"],
        _keys(await search_memories(
            "MISSING_PROVENANCE", user_id=owner_id, require_provenance=True, limit=5,
        )) == [],
        _keys(await search_memories(
            "UPSTREAM_FAILURE", user_id=owner_id, subject_id="usAAPL", limit=5,
        ))[0] == "upstream_error",
        _keys(await search_memories("PRIVATE_OWNER_B", user_id=owner_id, limit=5)) == [],
    ]
    return {
        "runner": "native-typed-memory-v1",
        "retrieval": {
            "recall_at_5": round(statistics.fmean(c["recall_at_5"] for c in retrieval_cases), 4),
            "precision_at_5": round(statistics.fmean(c["precision_at_5"] for c in retrieval_cases), 4),
            "cases": retrieval_cases,
        },
        "semantic_accuracy": round(sum(semantic_cases) / len(semantic_cases), 4),
        "semantic_cases_passed": sum(semantic_cases),
        "semantic_cases_total": len(semantic_cases),
        "owner_isolation_leakage": 0 if semantic_cases[-1] else 1,
        "latency_ms": {
            "samples": len(latencies),
            "p50": round(_percentile(latencies, 0.50), 4),
            "p95": round(_percentile(latencies, 0.95), 4),
        },
    }


async def run_benchmark(
    fixture_path: Path = DEFAULT_FIXTURE,
    *,
    repetitions: int = 5,
) -> JSONDict:
    fixture = load_fixture(fixture_path)
    fts = await run_fts_benchmark(fixture_path, repetitions=repetitions)
    with tempfile.TemporaryDirectory(prefix="finquant-typed-memory-") as temp_dir:
        original_path = config.DB_PATH
        config.DB_PATH = Path(temp_dir) / "typed-memory.db"
        try:
            await database.init_db()
            await _seed_typed_fixture(fixture)
            typed = await _typed_report(fixture, repetitions)
        finally:
            await database.close_db()
            config.DB_PATH = original_path
    typed_retrieval = typed["retrieval"]
    fts_retrieval = fts["retrieval"]
    gates = {
        "recall_not_below_fts": typed_retrieval["recall_at_5"] >= fts_retrieval["recall_at_5"],
        "precision_not_below_fts": typed_retrieval["precision_at_5"] >= fts_retrieval["precision_at_5"],
        "semantic_accuracy_at_least_95pct": typed["semantic_accuracy"] >= 0.95,
        "owner_isolation_leakage_zero": typed["owner_isolation_leakage"] == 0,
        "p95_at_most_250ms": typed["latency_ms"]["p95"] <= 250,
    }
    return {
        "fixture_version": fixture["schema_version"],
        "evidence_scope": "synthetic_fixture_only",
        "fts_baseline": {
            "recall_at_5": fts_retrieval["recall_at_5"],
            "precision_at_5": fts_retrieval["precision_at_5"],
        },
        "typed_memory": typed,
        "gates": gates,
        "status": "PASS" if all(gates.values()) else "FAIL",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--repetitions", type=int, default=5)
    args = parser.parse_args()
    report = asyncio.run(run_benchmark(args.fixture, repetitions=args.repetitions))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
