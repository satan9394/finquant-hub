import { describe, expect, test } from "bun:test";

import { normalizeInputSymbol } from "../lib/market";

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
