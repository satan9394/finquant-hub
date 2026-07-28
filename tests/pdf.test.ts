import { describe, expect, test } from "bun:test";
import { createResearchPdf } from "../lib/pdf";

describe("research PDF export", () => {
  test("creates a real multi-page PDF with CJK text support", () => {
    const markdown = [
      "# 苹果公司（AAPL）研究快照",
      "",
      "## 核心结论",
      ...Array.from({ length: 90 }, (_, index) => `- 第 ${index + 1} 条：收入增长、估值区间与风险因素。`),
    ].join("\n");
    const pdf = createResearchPdf("苹果公司研究快照", markdown);
    const raw = new TextDecoder("latin1").decode(pdf);

    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw).toContain("/Encoding /UniGB-UCS2-H");
    expect(raw).toMatch(/\/Count [2-9]/);
    expect(raw.endsWith("%%EOF\n")).toBe(true);
  });
});
