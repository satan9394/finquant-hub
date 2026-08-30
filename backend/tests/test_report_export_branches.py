from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile

from app.services.report_export import (
    markdown_to_docx,
    markdown_to_html,
    markdown_to_pdf,
    report_to_markdown,
)


def test_markdown_report_supports_chapters_sources_and_empty_fallback():
    report = {
        "id": 9,
        "ticker": "usAAPL",
        "company_name": "Apple",
        "model_id": 3,
        "created_at": "2026-08-30",
        "report_data": {
            "chapters": [
                "ignored",
                {"key": "summary", "content": "  **Evidence** body  "},
                {"title": "empty", "content": ""},
            ],
        },
        "agent_results": {
            "one": "See https://example.com/a.",
            "nested": [{"url": "https://example.com/b"}, "https://example.com/a."],
        },
    }

    markdown = report_to_markdown(report)
    assert "# Apple 研究报告" in markdown
    assert "报告版本：#9" in markdown
    assert "生成模型：模型 #3" in markdown
    assert "## summary" in markdown
    assert markdown.count("https://example.com/a.") == 1
    assert "https://example.com/b" in markdown

    empty = report_to_markdown({"id": 1, "ticker": "usEMPTY", "report_data": {}})
    assert "默认模型" in empty
    assert "报告尚未生成完整正文。" in empty


def test_markdown_report_supports_legacy_sections():
    markdown = report_to_markdown({
        "id": 2,
        "ticker": "sh600519",
        "report_data": {"company_name": "贵州茅台", "executive_summary": "摘要", "verdict": "结论"},
    })
    assert "## 执行摘要\n\n摘要" in markdown
    assert "## 综合结论\n\n结论" in markdown


def test_html_renderer_closes_lists_and_escapes_inline_markup():
    html = markdown_to_html(
        "# <Title>\n> meta\n## Section\n### Detail\n- one\n- **two**\nparagraph & text\n---",
        "<unsafe>",
    )

    assert "<title>&lt;unsafe&gt;</title>" in html
    assert "<h1>&lt;Title&gt;</h1>" in html
    assert "<p class=\"meta\">meta</p>" in html
    assert "<h3>Detail</h3>" in html
    assert "<ul><li>one</li><li><b>two</b></li></ul>" in html
    assert "paragraph &amp; text" in html
    assert "<hr>" in html


def test_docx_and_pdf_render_all_supported_line_types():
    markdown = (
        "# ignored duplicate title\n> generated metadata\n## Heading\n### Detail\n"
        "- bullet **bold**\nplain **emphasis** tail"
    )
    docx = markdown_to_docx(markdown, "Fixture Report")
    pdf = markdown_to_pdf(markdown, "Fixture Report")

    assert docx.startswith(b"PK")
    with ZipFile(BytesIO(docx)) as archive:
        document_xml = archive.read("word/document.xml").decode("utf-8")
        footer_xml = "".join(
            archive.read(name).decode("utf-8")
            for name in archive.namelist()
            if name.startswith("word/footer")
        )
    assert "Fixture Report" in document_xml
    assert "bold" in document_xml
    assert "FinQuant Hub" in footer_xml
    assert pdf.startswith(b"%PDF")
