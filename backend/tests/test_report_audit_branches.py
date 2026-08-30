from __future__ import annotations

from app.tools.report_audit import (
    _clean_num,
    _is_valid_label,
    _pct_diff,
    extract_data_points,
    render_verdict,
    sample_points,
)


def test_numeric_cleanup_label_filtering_and_relative_difference_boundaries():
    assert _clean_num("1,234.5") == 1234.5
    assert _clean_num("not-a-number") is None
    assert _is_valid_label("净利润") is True
    assert _is_valid_label("2025") is False
    assert _pct_diff(0, 0) == 0
    assert _pct_diff(0, 1) == float("inf")


def test_extract_ignores_headers_code_quotes_duplicates_and_invalid_values():
    points = extract_data_points(
        "# 营收：999亿元\n"
        "> 净利润：888亿元\n"
        "```\n现金流：777亿元\n```\n"
        "| 指标 | YoY | 2025年 |\n"
        "| --- | --- | --- |\n"
        "| 营收 | 10% | 123亿元 |\n\n"
        "营收：123亿元；净利润：-20.5亿元；估值：0倍；异常：10000000000000000元\n"
        "营收：123亿元"
    )

    labels = [point["label"] for point in points]
    assert "营收 · YoY" not in labels
    assert "营收 · 2025年" in labels
    assert "净利润" in labels
    assert labels.count("营收") == 1
    assert all(point["reported_value"] != 0 for point in points)


def test_sampling_is_bounded_deterministic_and_ordered():
    points = [{"id": index, "line_number": index} for index in range(1, 101)]
    first = sample_points(points, ratio=0.15, seed=7)
    second = sample_points(points, ratio=0.15, seed=7)

    assert first == second
    assert len(first) == 15
    assert [item["line_number"] for item in first] == sorted(item["line_number"] for item in first)
    assert sample_points([], seed=7) == []


def test_verdict_covers_skip_pass_warning_and_two_source_failure(capsys):
    verdict = render_verdict([
        {"id": 1, "label": "skip", "reported_value": 1, "fetched_value": None},
        {"id": 2, "label": "pass", "reported_value": 100, "fetched_value": 101, "fetched_source": "a"},
        {
            "id": 3, "label": "warn", "reported_value": 100, "fetched_value": 130,
            "fetched_source": "a", "fetched_value2": 100, "fetched_source2": "b",
        },
        {
            "id": 4, "label": "fail", "reported_value": 100, "fetched_value": 130,
            "fetched_source": "a", "fetched_value2": 140, "fetched_source2": "b",
            "raw_text": "fixture", "line_number": 9,
        },
    ], report_name="Fixture")

    assert verdict["verdict"] == "FAIL"
    assert (verdict["pass_count"], verdict["warn_count"], verdict["fail_count"], verdict["total"]) == (1, 1, 1, 3)
    assert verdict["fail_items"][0]["line_number"] == 9
    output = capsys.readouterr().out
    assert "报告：Fixture" in output
    assert "【打回】" in output

