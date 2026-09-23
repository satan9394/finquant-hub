"""Fixture-safe export/rebuild contract for an optional temporal graph read model."""
from __future__ import annotations

import importlib.util
from dataclasses import dataclass, field
from typing import Any, TypeAlias

from app import database


JSONDict: TypeAlias = dict[str, Any]


async def export_thesis_graph(user_id: int) -> JSONDict:
    """Export only owner-scoped identifiers and canonical metadata from authoritative SQLite."""
    theses = await database.query_all(
        "SELECT id, ticker, status, source_report_id, created_at, updated_at FROM thesis "
        "WHERE user_id=? ORDER BY id",
        (user_id,),
    )
    claims = await database.query_all(
        "SELECT id, thesis_id, kind, status, version, retired_at, checked_at "
        "FROM thesis_claims WHERE user_id=? ORDER BY id",
        (user_id,),
    )
    evidence = await database.query_all(
        "SELECT evidence_id, kind, data_status, subject_type, subject_id, metric, source, "
        "as_of, retrieved_at, period_type, currency, quality_flags_json, license_scope "
        "FROM evidence_objects WHERE user_id=? ORDER BY evidence_id",
        (user_id,),
    )
    relations = await database.query_all(
        "SELECT id, thesis_id, claim_id, evidence_id, stance, valid_from, valid_to, "
        "observed_at, created_source, status, created_at, updated_at "
        "FROM thesis_claim_evidence_edges WHERE user_id=? ORDER BY id",
        (user_id,),
    )
    episodes = await database.query_all(
        "SELECT id, thesis_id, claim_id, from_status, to_status, actor, trigger_kind, reason, "
        "evidence_id, created_at FROM thesis_claim_status_events WHERE user_id=? ORDER BY id",
        (user_id,),
    )
    nodes = [
        *({"node_id": f"thesis:{row['id']}", "node_type": "thesis", **row} for row in theses),
        *({"node_id": f"claim:{row['id']}", "node_type": "claim", **row} for row in claims),
        *({"node_id": f"evidence:{row['evidence_id']}", "node_type": "evidence", **row}
          for row in evidence),
    ]
    graph_relations = [{
        "relation_id": f"claim_evidence:{row['id']}",
        "relation_type": "claim_evidence",
        "from_node_id": f"claim:{row['claim_id']}",
        "to_node_id": f"evidence:{row['evidence_id']}",
        **row,
    } for row in relations]
    graph_episodes = [{
        "episode_id": f"claim_status:{row['id']}",
        "episode_type": "claim_status_event",
        **row,
    } for row in episodes]
    return {
        "schema_version": "thesis-graph-export/v1",
        "owner_id": user_id,
        "nodes": nodes,
        "relations": graph_relations,
        "episodes": graph_episodes,
        "counts": {
            "thesis": len(theses),
            "claim": len(claims),
            "evidence": len(evidence),
            "claim_evidence": len(relations),
            "claim_status_event": len(episodes),
        },
    }


@dataclass
class InMemoryShadowGraph:
    """Disposable sink that tests adapter semantics without pretending to be Graphiti."""

    nodes: dict[str, JSONDict] = field(default_factory=dict)
    relations: dict[str, JSONDict] = field(default_factory=dict)
    episodes: dict[str, JSONDict] = field(default_factory=dict)

    def clear(self) -> None:
        self.nodes.clear()
        self.relations.clear()
        self.episodes.clear()

    def rebuild(self, export: JSONDict) -> JSONDict:
        self.clear()
        self.nodes = {str(item["node_id"]): dict(item) for item in export["nodes"]}
        self.relations = {
            str(item["relation_id"]): dict(item) for item in export["relations"]
        }
        self.episodes = {str(item["episode_id"]): dict(item) for item in export["episodes"]}
        return self.counts()

    def counts(self) -> JSONDict:
        by_type = {
            node_type: sum(item["node_type"] == node_type for item in self.nodes.values())
            for node_type in ("thesis", "claim", "evidence")
        }
        return {
            **by_type,
            "claim_evidence": len(self.relations),
            "claim_status_event": len(self.episodes),
        }


def graphiti_probe() -> JSONDict:
    available = importlib.util.find_spec("graphiti_core") is not None
    return {
        "candidate": "graphiti",
        "status": "AVAILABLE_NOT_RUN" if available else "NOT_RUN",
        "reason": (
            "package detected, but external graph infrastructure is outside this task"
            if available
            else "graphiti_core package is not installed"
        ),
        "fixture_cases_executed": 0,
        "metrics": {
            "node_count": None,
            "edge_count": None,
            "rebuild_latency_ms": None,
            "query_latency_ms": None,
        },
        "production_writes": 0,
        "answer_path": False,
    }
