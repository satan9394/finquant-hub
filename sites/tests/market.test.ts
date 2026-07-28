import { describe, expect, test } from "bun:test";

import { getSnapshot, normalizeInputSymbol, resolveSymbol, scoreNewsRelevance } from "../lib/market";

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

describe("daily price semantics", () => {
  test("uses regularMarketPreviousClose instead of range-relative chartPreviousClose", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/v1/finance/search")) {
        return Response.json({ quotes: [{ symbol: "AAPL", longname: "Apple Inc.", quoteType: "EQUITY", exchDisp: "NASDAQ" }] });
      }
      return Response.json({
        chart: {
          result: [{
            meta: {
              regularMarketPrice: 200,
              regularMarketPreviousClose: 190,
              chartPreviousClose: 100,
              regularMarketTime: 1_700_000_000,
              currency: "USD",
              fullExchangeName: "NASDAQ",
            },
            timestamp: [1_699_827_200, 1_699_913_600, 1_700_000_000],
            indicators: {
              quote: [{ open: [100, 189, 198], high: [101, 191, 201], low: [99, 188, 197], close: [100, 190, 200], volume: [1, 1, 1] }],
              adjclose: [{ adjclose: [100, 190, 200] }],
            },
          }],
        },
      });
    }) as typeof fetch;

    try {
      const snapshot = await getSnapshot("AAPL");
      expect(snapshot.previousClose).toBe(190);
      expect(snapshot.dailyChange).toBe(10);
      expect(snapshot.dailyChangePercent).toBeCloseTo(5.263157, 5);
      expect(snapshot.periodReturnPercent).toBe(100);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("news relevance gate", () => {
  test("accepts ticker/company matches and rejects unrelated headlines", () => {
    expect(scoreNewsRelevance({ title: "Apple unveils new products", relatedTickers: ["AAPL"] }, "AAPL", "Apple Inc.").score).toBe(1);
    expect(scoreNewsRelevance({ title: "Gold miners rally after rate decision", relatedTickers: ["NEM"] }, "AAPL", "Apple Inc.").score).toBe(0);
  });
});
