from app.tools.report_audit import extract_data_points, render_verdict
from app.agent.tools_definitions import AuditReportData
from app.main import app
from httpx import ASGITransport, AsyncClient
import pytest


def test_extract_data_points_from_simple_markdown_table():
    points = extract_data_points(
        "| 指标 | 2025年 |\n"
        "| --- | --- |\n"
        "| 营收 | 123.45 |"
    )

    assert len(points) == 1
    assert points[0]["label"] == "营收 · 2025年"
    assert points[0]["reported_value"] == 123.45
    assert points[0]["unit"] == ""


def test_extract_data_points_extracts_percentage_values():
    points = extract_data_points(
        "| 指标 | 2025年 |\n"
        "| --- | --- |\n"
        "| 毛利率 | 18.6% |"
    )

    assert len(points) == 1
    assert points[0]["reported_value"] == 18.6
    assert points[0]["unit"] == "%"


def test_extract_data_points_extracts_hundred_million_yuan_values():
    points = extract_data_points(
        "| 指标 | 2025年 |\n"
        "| --- | --- |\n"
        "| 净利润 | 23.4亿元 |"
    )

    assert len(points) == 1
    assert points[0]["reported_value"] == 23.4
    assert points[0]["unit"] == "亿元"


def test_render_verdict_returns_pass_when_all_checked_values_match():
    result = render_verdict(
        [
            {
                "id": 1,
                "label": "营收",
                "reported_value": 100,
                "unit": "亿元",
                "fetched_value": 100.5,
                "fetched_source": "source-a",
            }
        ]
    )

    assert result["verdict"] == "PASS"
    assert result["fail_items"] == []


def test_render_verdict_includes_failed_items_for_partial_failure():
    result = render_verdict(
        [
            {
                "id": 1,
                "label": "营收",
                "reported_value": 100,
                "unit": "亿元",
                "fetched_value": 100,
                "fetched_source": "source-a",
            },
            {
                "id": 2,
                "label": "净利润",
                "reported_value": 20,
                "unit": "亿元",
                "fetched_value": 10,
                "fetched_source": "source-a",
            },
        ]
    )

    assert result["verdict"] == "PASS"
    assert result["warn_count"] == 1
    assert result["warn_items"][0]["label"] == "净利润"


def test_empty_input_does_not_raise():
    assert extract_data_points("") == []
    assert render_verdict([])["verdict"] == "PASS"


@pytest.mark.asyncio
async def test_report_audit_api_and_agent_tool_expose_existing_functions():
    markdown = "| 指标 | 2025年 |\n| --- | --- |\n| 营收 | 100亿元 |"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        extracted = await client.post("/api/research/audit", json={"markdown": markdown})
        verdict = await client.post(
            "/api/research/audit",
            json={
                "markdown": markdown,
                "verified_results": [
                    {
                        "id": 1,
                        "label": "营收",
                        "reported_value": 100,
                        "unit": "亿元",
                        "fetched_value": 100,
                        "fetched_source": "official",
                    }
                ],
            },
        )

    tool_result = await AuditReportData().run(markdown=markdown)
    invalid = await AuditReportData().run(markdown="")
    assert extracted.status_code == 200
    assert extracted.json()["points"][0]["reported_value"] == 100
    assert verdict.json()["verdict"] == "PASS"
    assert tool_result.success is True
    assert tool_result.data["sample"]
    assert invalid.success is False
