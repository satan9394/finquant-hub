from __future__ import annotations

import io

import pytest
from openpyxl import Workbook

from app.services.import_service import ImportFormatError, WatchlistImportService, parse_file, parse_text


class StubMarket:
    async def search(self, candidate: str) -> list[dict[str, str]]:
        matches = {
            "贵州茅台": [{"code": "sh600519", "name": "贵州茅台"}],
            "maotai": [{"code": "sh600519", "name": "贵州茅台"}],
            "AAPL": [{"code": "usAAPL", "name": "Apple Inc."}],
        }
        return matches.get(candidate, [])


def test_parse_text_and_csv_ignore_headers():
    assert parse_text("股票代码,名称\n600519，贵州茅台\tAAPL") == ["600519", "贵州茅台", "AAPL"]
    assert parse_file("watchlist.csv", "代码,名称\n600519,贵州茅台\n,腾讯控股".encode()) == [
        "600519", "腾讯控股",
    ]


def test_parse_xlsx_and_reject_unsupported_file():
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["股票代码", "名称"])
    sheet.append(["00700", "腾讯控股"])
    output = io.BytesIO()
    workbook.save(output)

    assert parse_file("watchlist.xlsx", output.getvalue()) == ["00700"]
    with pytest.raises(ImportFormatError, match="图片 OCR 暂列 P3"):
        parse_file("watchlist.png", b"not-an-image")


@pytest.mark.asyncio
async def test_import_resolves_names_pinyin_and_deduplicates():
    service = WatchlistImportService(StubMarket())

    result = await service.import_candidates(
        ["贵州茅台", "maotai", "AAPL", "不存在的标的"],
        existing_codes=["600519"],
    )

    assert result["success"] == 1
    assert result["duplicate"] == 2
    assert result["failed"] == 1
    assert result["items"] == [{"code": "usAAPL", "name": "Apple Inc."}]


@pytest.mark.asyncio
async def test_direct_code_import_survives_search_provider_failure():
    class FailingMarket:
        async def search(self, _candidate: str):
            raise RuntimeError("provider down")

    result = await WatchlistImportService(FailingMarket()).import_candidates(["600519", "AAPL", "贵州茅台"])

    assert result["items"] == [
        {"code": "sh600519", "name": "600519"},
        {"code": "usAAPL", "name": "AAPL"},
    ]
    assert result["failures"] == [{"input": "贵州茅台", "reason": "查询失败：RuntimeError"}]
