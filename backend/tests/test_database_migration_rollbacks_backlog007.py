"""Every versioned migration must roll back its savepoint on failure."""

from unittest.mock import AsyncMock

import pytest

from app import database


MIGRATIONS = [
    ("_TICKER_NORMALIZATION_VERSION", "_normalize_legacy_tickers", "normalize_legacy_tickers"),
    ("_MEMORY_FTS_VERSION", "_install_memory_fts", "install_memory_fts"),
    ("_NOTIFICATIONS_VERSION", "_install_notifications", "install_notifications"),
    ("_ALERTS_VERSION", "_install_alerts", "install_alerts"),
    ("_MARKET_REVIEWS_VERSION", "_install_market_reviews", "install_market_reviews"),
    ("_SCHEDULED_RESEARCH_VERSION", "_install_scheduled_research_jobs", "install_scheduled_research_jobs"),
    ("_LLM_USAGE_VERSION", "_install_llm_usage", "install_llm_usage"),
    ("_THESIS_VERSION", "_install_investment_theses", "install_investment_theses"),
    ("_AUTH_VERSION", "_install_passwordless_auth", "install_passwordless_auth"),
    ("_OWNER_ISOLATION_VERSION", "_install_user_data_isolation", "install_user_data_isolation"),
    ("_CREDENTIALS_VERSION", "_install_user_credentials", "install_user_credentials"),
    ("_EVIDENCE_FOUNDATION_VERSION", "_install_evidence_foundation", "install_evidence_foundation"),
    ("_INVESTMENT_MEMORY_VERSION", "_install_investment_memory", "install_investment_memory"),
    ("_MEMORY_ROLLOUT_VERSION", "_install_memory_rollout_audit", "install_memory_rollout_audit"),
    ("_THESIS_V2_VERSION", "_install_thesis_v2", "install_thesis_v2"),
    ("_THESIS_EVIDENCE_VERSION", "_install_thesis_evidence", "install_thesis_evidence"),
    ("_THESIS_HISTORY_VERSION", "_install_thesis_history", "install_thesis_history"),
    ("_MONITOR_TARGET_VERSION", "_install_monitor_targets", "install_monitor_targets"),
    ("_SCHEDULED_RESEARCH_LINKAGE_VERSION", "_install_scheduled_research_linkage", "install_scheduled_research_linkage"),
    ("_THESIS_REVIEW_WORKFLOW_VERSION", "_install_thesis_review_workflow", "install_thesis_review_workflow"),
    ("_PRODUCT_METRICS_VERSION", "_install_product_metrics", "install_product_metrics"),
    ("_PAPER_PORTFOLIO_VERSION", "_install_paper_portfolios", "install_paper_portfolios"),
    ("_JOB_RUNTIME_VERSION", "_install_job_runtime", "install_job_runtime"),
    ("_SCHEMA_CLEANUP_VERSION", "_install_schema_cleanup", "install_schema_cleanup"),
]


class _VersionCursor:
    def __init__(self, version):
        self.version = version

    async def fetchone(self):
        return (self.version,)


class _MigrationConnection:
    def __init__(self, version):
        self.version = version
        self.statements = []

    async def execute(self, statement, *_args):
        self.statements.append(statement)
        return _VersionCursor(self.version)


@pytest.mark.asyncio
@pytest.mark.parametrize("version_name,installer_name,savepoint", MIGRATIONS)
async def test_migration_failure_rolls_back_savepoint(
    monkeypatch, version_name, installer_name, savepoint,
):
    connection = _MigrationConnection(getattr(database, version_name) - 1)
    monkeypatch.setattr(database, "_db", connection)
    monkeypatch.setattr(database, "_ensure_column", AsyncMock())
    monkeypatch.setattr(database, installer_name, AsyncMock(side_effect=RuntimeError("migration failed")))

    with pytest.raises(RuntimeError, match="migration failed"):
        await database._migrate_schema()

    assert f"ROLLBACK TO SAVEPOINT {savepoint}" in connection.statements
    assert f"RELEASE SAVEPOINT {savepoint}" in connection.statements
