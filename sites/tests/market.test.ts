import { describe, expect, test } from "bun:test";

import { normalizeInputSymbol, resolveSymbol } from "../lib/market";

describe("normalizeInputSymbol", () => {
  test.each([
    ["AAPL", "AAPL"],
    ["600519", "600519.SS"],
    ["000001", "000001.SZ"],
    ["00700", "0700.HK"],
    ["0700.HK", "0700.HK"],
    ["HK00700", "0700.HK"],
    ["HKEX:00700", "0700.HK"],
    ["600519.SH", "600519.SS"],
    ["SSE:600519", "600519.SS"],
    ["NASDAQ:AAPL", "AAPL"],
    ["AAPL.US", "AAPL"],
    ["BRK.B", "BRK-B"],
  ])("maps %s to %s", (input, expected) => {
    expect(normalizeInputSymbol(input)).toBe(expected);
  });

  test("rejects an empty or malformed input", () => {
    expect(normalizeInputSymbol(" ")).toBeNull();
    expect(normalizeInputSymbol("AAPL<script>")).toBeNull();
  });
});

describe("resolveSymbol", () => {
  test("resolves the Chinese brand name 长鑫存储 to its listed A-share", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const url = String(input);
      expect(url).toContain("searchapi.eastmoney.com");
      expect(decodeURIComponent(url)).toContain("input=长鑫科技");
      return Response.json({
        QuotationCodeTable: {
          Data: [{ Code: "688825", Name: "C长鑫", JYS: "23", SecurityTypeName: "科创板" }],
        },
      });
    }) as typeof fetch;

    try {
      await expect(resolveSymbol("长鑫存储")).resolves.toEqual({
        symbol: "688825.SS",
        name: "长鑫科技",
        exchange: "科创板",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
