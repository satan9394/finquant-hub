"""Financial-report data point extraction and audit verdicts."""

from __future__ import annotations

import math
import re
from random import Random
from typing import Any, cast

_TOLERANCE = 0.01
_SIGN = r"[+\-−–－＋]?"
_TABLE_SEPARATOR = re.compile(r"^\|[\-\s\|:]+\|$")
_TABLE_VALUE = re.compile(
    r"[~约]?\$?(" + _SIGN + r"[\d,，\.]+)\s*(亿[元美港]?元?|万亿|[xX倍]|%|[BMT])?"
)
_KV_VALUE = re.compile(
    r"(?P<label>[\u4e00-\u9fa5A-Za-z][^\|\n：:*]{1,30})[：:]\s*[~约]?\$?"
    r"(?P<num>" + _SIGN + r"[\d,，\.]+)\s*(?P<unit>亿[元美港]?元?|万亿|[xX倍]|%|[BMT])?"
)


def _clean_num(value: str) -> float | None:
    """Convert a localized numeric string, including Unicode signs, to float."""
    cleaned = value.replace(",", "").replace("，", "").strip()
    for source in ("−", "–", "－"):
        cleaned = cleaned.replace(source, "-")
    cleaned = cleaned.replace("＋", "+")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _is_valid_label(label: str) -> bool:
    """Return whether a label is meaningful enough to audit."""
    label = label.strip()
    if len(label) < 2 or re.fullmatch(r"[\d\s年季度Q]+", label):
        return False
    if re.match(r"^[+\-*#\|~\$>_\x60]", label):
        return False
    if any(marker in label for marker in ("**", "\x60", "__")):
        return False
    if re.fullmatch(r"[+\-]?\d+(\.\d+)?%", label):
        return False
    return label.lower() not in {
        "来源", "sources", "source", "说明", "注意", "备注", "数据来源", "n/a",
        "—", "-", "/", "合计", "total", "单位", "趋势",
    }


def _parse_md_tables(lines: list[str]) -> list[tuple[str, str, float, str, int, str]]:
    """Parse Markdown tables into label, header, value, unit, line, and source text."""
    rows: list[tuple[str, str, float, str, int, str]] = []
    index = 0
    while index < len(lines):
        header_line = lines[index].strip()
        if "|" not in header_line or _TABLE_SEPARATOR.match(header_line):
            index += 1
            continue
        headers = [cell.strip().strip("*_") for cell in header_line.split("|") if cell.strip()]
        if index + 1 == len(lines) or not _TABLE_SEPARATOR.match(lines[index + 1].strip()):
            index += 1
            continue

        index += 2
        while index < len(lines):
            raw = lines[index].strip()
            if not raw or not raw.startswith("|"):
                break
            cells = [cell.strip().strip("*_~") for cell in raw.split("|") if cell.strip()]
            if len(cells) >= 2:
                for column, cell in enumerate(cells[1:], start=1):
                    match = _TABLE_VALUE.search(cell)
                    value = _clean_num(match.group(1)) if match else None
                    if value is not None and value != 0 and abs(value) < 1e15:
                        unit = (cast(re.Match[str], match).group(2) or "").strip()
                        column_name = headers[column] if column < len(headers) else f"列{column}"
                        rows.append((cells[0], column_name, value, unit, index + 1, raw))
            index += 1
    return rows


def extract_data_points(md_text: str) -> list[dict[str, Any]]:
    """Extract unique financial data points from Markdown tables and key-value text."""
    points: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(label: str, value: float | None, unit: str, line: int, raw: str) -> None:
        label = re.sub(r"[\*_\x60]+", "", label).strip()
        if not _is_valid_label(label) or value is None or value == 0 or abs(value) > 1e15:
            return
        if re.fullmatch(r"(20\d{2}|Q[1-4]|\d{4}\s*Q[1-4])", label):
            return
        key = f"{label}|{value:.4f}|{unit}"
        if key in seen:
            return
        seen.add(key)
        points.append(
            {
                "id": len(points) + 1,
                "label": label,
                "reported_value": value,
                "unit": unit,
                "raw_text": raw[:120],
                "line_number": line,
            }
        )

    lines = md_text.split("\n")
    for row, column, value, unit, line, raw in _parse_md_tables(lines):
        if not _is_valid_label(row) or column.upper() in {
            "YOY", "YOY增速", "增速", "同比", "变化", "趋势", "说明", "备注",
        }:
            continue
        label = f"{row} · {column}" if column and row != column else row
        add(label, value, unit, line, raw)

    in_code = False
    fence = chr(96) * 3
    for line, raw in enumerate(lines, start=1):
        text = raw.strip()
        if text.startswith(fence):
            in_code = not in_code
            continue
        if in_code or text.startswith("> ") or re.match(r"^#{1,6}\s", text) or "|" in text:
            continue
        for match in _KV_VALUE.finditer(text):
            add(
                match.group("label"),
                _clean_num(match.group("num")),
                (match.group("unit") or "").strip(),
                line,
                text,
            )
    return points


def sample_points(
    points: list[dict[str, Any]], ratio: float = 0.15, seed: int | None = None
) -> list[dict[str, Any]]:
    """Sample a bounded 15% of extracted points, ordered by original line."""
    sample_size = min(len(points), max(3, min(30, math.ceil(len(points) * ratio))))
    return sorted(Random(seed).sample(points, sample_size), key=lambda point: int(point["line_number"]))


def _pct_diff(reported: float, fetched: float) -> float:
    """Return the absolute relative difference between two values."""
    if reported == 0:
        return 0.0 if fetched == 0 else float("inf")
    return abs(reported - fetched) / abs(reported)


def render_verdict(results: list[dict[str, Any]], report_name: str = "") -> dict[str, Any]:
    """Print and return the audit decision for externally validated values."""
    print("=" * 70)
    print("报告数据抽检 — 准出/打回判决")
    if report_name:
        print(f"报告：{report_name}")
    print("=" * 70)

    failed: list[dict[str, Any]] = []
    warned: list[dict[str, Any]] = []
    total = 0
    for item in results:
        label = str(item.get("label", "?"))
        reported = float(item.get("reported_value", 0))
        unit = str(item.get("unit", ""))
        if item.get("fetched_value") is None:
            print(f"  ⬜ [{item.get('id', '?'):>2}] {label[:35]:35s} 未提供核验值，跳过")
            continue

        total += 1
        primary = float(item["fetched_value"])
        secondary = item.get("fetched_value2")
        primary_diff = _pct_diff(reported, primary)
        secondary_diff = None if secondary is None else _pct_diff(reported, float(secondary))
        primary_ok = primary_diff <= _TOLERANCE
        secondary_ok = secondary_diff is None or secondary_diff <= _TOLERANCE
        source = str(item.get("fetched_source", "?"))
        source2 = str(item.get("fetched_source2", ""))
        detail = {
            "id": item.get("id"),
            "label": label,
            "reported": reported,
            "unit": unit,
            "fetched": primary,
            "source": source,
            "fetched2": None if secondary is None else float(secondary),
            "source2": source2,
            "diff1_pct": round(primary_diff * 100, 2),
            "diff2_pct": None if secondary_diff is None else round(secondary_diff * 100, 2),
            "raw_text": item.get("raw_text", ""),
            "line_number": item.get("line_number", 0),
        }
        source_detail = f"{source}: {primary:.2f} (偏差 {primary_diff * 100:.2f}%)"
        if secondary_diff is not None:
            source_detail += f" | {source2}: {float(cast(Any, secondary)):.2f} (偏差 {secondary_diff * 100:.2f}%)"

        if primary_ok and secondary_ok:
            status = "✅ 通过"
        elif not primary_ok and not secondary_ok:
            status = "❌ 不通过"
            failed.append(detail)
        else:
            status = "⚠️ 警告"
            warned.append(detail)
        print(f"  {status} [{item.get('id', '?'):>2}] {label[:35]:35s} 报告: {reported:.2f} {unit}")
        print(f"              {source_detail}")

    fail_count = len(failed)
    warn_count = len(warned)
    pass_count = total - fail_count - warn_count
    verdict = "PASS" if fail_count == 0 else "FAIL"
    print("-" * 70)
    print(f"抽检总数: {total} | 通过: {pass_count} | 警告: {warn_count} | 不通过: {fail_count}")
    print("【准出】报告可发布。" if verdict == "PASS" else f"【打回】{fail_count} 个数据点需修正。")
    return {
        "verdict": verdict,
        "pass_count": pass_count,
        "warn_count": warn_count,
        "fail_count": fail_count,
        "total": total,
        "fail_items": failed,
        "warn_items": warned,
        "summary": f"{verdict}: {pass_count} passed, {warn_count} warned, {fail_count} failed.",
    }
