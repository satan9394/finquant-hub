import type { Evidence, MarketSnapshot } from "./types";

const YAHOO_SEARCH = "https://query2.finance.yahoo.com/v1/finance/search";
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const EASTMONEY_SEARCH = "https://searchapi.eastmoney.com/api/suggest/get";
const EASTMONEY_TOKEN = "D43BF722C8E33BDC906FB84D85E326E8";

const COMPANY_NAME_ALIASES: Record<string, string> = {
  "长鑫存储": "长鑫科技",
};

type YahooQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
};

type EastmoneyQuote = {
  Code?: string;
  Name?: string;
  JYS?: string;
  SecurityTypeName?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 FinQuantHub/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`上游行情服务返回 ${response.status}`);
  return (await response.json()) as T;
}

export function normalizeInputSymbol(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/\s+/g, "");
  const prefix = compact.match(/^(NASDAQ|NYSE|AMEX|ARCA|SSE|SHSE|SZSE|HKEX):(.+)$/);
  const raw = prefix?.[2] ?? compact;
  if (!raw) return null;
  const mainlandSuffix = raw.match(/^(\d{6})\.(SH|SSE|SZ|SZSE)$/);
  if (mainlandSuffix) return `${mainlandSuffix[1]}.${["SH", "SSE"].includes(mainlandSuffix[2]) ? "SS" : "SZ"}`;
  const usSuffix = raw.match(/^([A-Z][A-Z0-9.-]{0,14})\.US$/);
  if (usSuffix) return usSuffix[1].replace(/\.([A-Z])$/, "-$1");
  const explicit = raw.match(/^(SH|SZ|HK)(\d{4,6})$/);
  if (explicit) {
    if (explicit[1] === "HK") return `${explicit[2].replace(/^0+/, "").padStart(4, "0")}.HK`;
    return `${explicit[2].padStart(6, "0")}.${explicit[1] === "SH" ? "SS" : "SZ"}`;
  }
  if (/^\d{6}$/.test(raw)) return `${raw}.${/^[569]/.test(raw) ? "SS" : "SZ"}`;
  if (/^\d{4,5}$/.test(raw)) return `${raw.replace(/^0+/, "").padStart(4, "0")}.HK`;
  if (/^\^?[A-Z][A-Z0-9.-]{0,14}(?:-[A-Z]{3})?$/.test(raw)) {
    return /^[A-Z]{1,5}\.[A-Z]$/.test(raw) ? raw.replace(".", "-") : raw;
  }
  if (/^[A-Z0-9.-]+\.(HK|SS|SZ|L|TO|T|AX|PA|DE|F|SI|KS|KQ)$/.test(raw)) return raw;
  return null;
}

async function searchYahooSymbols(query: string): Promise<Array<{ symbol: string; name: string; exchange: string }>> {
  const payload = await fetchJson<{ quotes?: YahooQuote[] }>(
    `${YAHOO_SEARCH}?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&enableFuzzyQuery=true`,
  );
  return (payload.quotes ?? [])
    .filter((item) => item.symbol && ["EQUITY", "ETF", "MUTUALFUND", "INDEX", "CRYPTOCURRENCY"].includes(item.quoteType ?? ""))
    .map((item) => ({ symbol: item.symbol!, name: item.longname ?? item.shortname ?? item.symbol!, exchange: item.exchDisp ?? item.exchange ?? "" }));
}

function eastmoneyYahooSymbol(item: EastmoneyQuote): string | null {
  const code = item.Code?.trim().toUpperCase() ?? "";
  if (!code) return null;
  if (item.JYS === "HK" && /^\d{4,5}$/.test(code)) return `${code.replace(/^0+/, "").padStart(4, "0")}.HK`;
  if (/^\d{6}$/.test(code)) return `${code}.${/^[569]/.test(code) ? "SS" : "SZ"}`;
  if (["NASDAQ", "NYSE", "AMEX"].includes(item.JYS ?? "") && /^[A-Z][A-Z0-9.-]{0,14}$/.test(code)) {
    return /^[A-Z]{1,5}\.[A-Z]$/.test(code) ? code.replace(".", "-") : code;
  }
  return null;
}

async function searchEastmoneySymbols(query: string, preferredName: string): Promise<Array<{ symbol: string; name: string; exchange: string }>> {
  const payload = await fetchJson<{ QuotationCodeTable?: { Data?: EastmoneyQuote[] | null } }>(
    `${EASTMONEY_SEARCH}?input=${encodeURIComponent(query)}&type=14&count=10&token=${EASTMONEY_TOKEN}`,
  );
  const seen = new Set<string>();
  return (payload.QuotationCodeTable?.Data ?? []).flatMap((item) => {
    const symbol = eastmoneyYahooSymbol(item);
    if (!symbol || seen.has(symbol)) return [];
    seen.add(symbol);
    return [{
      symbol,
      name: preferredName || item.Name || symbol,
      exchange: item.SecurityTypeName ?? item.JYS ?? "",
    }];
  });
}

export async function searchSymbols(query: string): Promise<Array<{ symbol: string; name: string; exchange: string }>> {
  const trimmed = query.trim();
  const canonical = COMPANY_NAME_ALIASES[trimmed] ?? trimmed;
  if (/[^\x00-\x7f]/.test(canonical)) {
    const eastmoney = await searchEastmoneySymbols(canonical, canonical === trimmed ? "" : canonical).catch(() => []);
    if (eastmoney.length) return eastmoney;
    return [];
  }
  return searchYahooSymbols(canonical);
}

export async function resolveSymbol(input: string): Promise<{ symbol: string; name: string; exchange: string }> {
  const candidate = normalizeInputSymbol(input);
  const matches = await searchSymbols(candidate ?? input).catch((error) => {
    if (!candidate) throw error;
    return [];
  });
  const exact = candidate ? matches.find((item) => item.symbol.toUpperCase() === candidate) : null;
  const match = exact ?? matches[0];
  if (match) return match;
  if (candidate) return { symbol: candidate, name: candidate, exchange: "" };
  throw new Error("未识别该股票代码或公司名称，请尝试交易所代码，例如 AAPL、600519、0700.HK。 ");
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function pct(from: number | undefined, to: number | undefined): number | null {
  return from && to ? ((to / from) - 1) * 100 : null;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function maxDrawdown(values: number[]): number | null {
  if (!values.length) return null;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    worst = Math.min(worst, ((value / peak) - 1) * 100);
  }
  return worst;
}

function annualizedVolatility(values: number[]): number | null {
  if (values.length < 3) return null;
  const returns = values.slice(1).map((value, index) => Math.log(value / values[index]));
  const mean = average(returns) ?? 0;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export async function getSnapshot(input: string): Promise<MarketSnapshot> {
  const resolved = await resolveSymbol(input);
  const payload = await fetchJson<{
    chart?: { result?: Array<{ meta?: Record<string, unknown>; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }> } }>; error?: { description?: string } | null };
  }>(`${YAHOO_CHART}/${encodeURIComponent(resolved.symbol)}?interval=1d&range=1y&events=div%2Csplits`);
  const result = payload.chart?.result?.[0];
  if (!result) throw new Error(payload.chart?.error?.description ?? "没有可用行情数据");
  const meta = result.meta ?? {};
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const history = timestamps.flatMap((timestamp, index) => {
    const close = quote?.close?.[index];
    if (typeof close !== "number") return [];
    return [{ date: new Date(timestamp * 1000).toISOString().slice(0, 10), close, volume: quote?.volume?.[index] ?? 0 }];
  });
  if (!history.length) throw new Error("该代码存在，但当前没有可用交易数据");
  const closes = history.map((item) => item.close);
  const price = Number(meta.regularMarketPrice ?? closes.at(-1));
  const previousClose = Number(meta.chartPreviousClose ?? closes.at(-2) ?? price);
  const currency = String(meta.currency ?? "");
  const name = String(resolved.name !== resolved.symbol ? resolved.name : (meta.longName ?? meta.shortName ?? resolved.symbol));
  return {
    symbol: resolved.symbol,
    name,
    exchange: String(meta.fullExchangeName ?? meta.exchangeName ?? resolved.exchange ?? ""),
    currency,
    price,
    change: price - previousClose,
    changePercent: previousClose ? ((price / previousClose) - 1) * 100 : 0,
    previousClose,
    fiftyTwoWeekHigh: typeof meta.fiftyTwoWeekHigh === "number" ? meta.fiftyTwoWeekHigh : Math.max(...closes),
    fiftyTwoWeekLow: typeof meta.fiftyTwoWeekLow === "number" ? meta.fiftyTwoWeekLow : Math.min(...closes),
    metrics: {
      return20d: pct(closes.at(-21), closes.at(-1)),
      return60d: pct(closes.at(-61), closes.at(-1)),
      volatility20d: annualizedVolatility(closes.slice(-21)),
      ma20: average(closes.slice(-20)),
      ma60: average(closes.slice(-60)),
      rsi14: rsi(closes),
      maxDrawdown1y: maxDrawdown(closes),
    },
    history,
    source: "Yahoo Finance chart API",
    asOf: new Date().toISOString(),
  };
}

export async function searchNews(symbol: string, name: string): Promise<Evidence[]> {
  const asciiName = name.replace(/[^\x20-\x7e]/g, " ").replace(/\s+/g, " ").trim();
  const query = [symbol, asciiName].filter(Boolean).join(" ");
  const payload = await fetchJson<{ news?: Array<{ title?: string; link?: string; publisher?: string; providerPublishTime?: number }> }>(
    `${YAHOO_SEARCH}?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=10`,
  );
  return (payload.news ?? []).flatMap((item) => {
    if (!item.title || !item.link) return [];
    return [{
      title: item.title,
      url: item.link,
      publisher: item.publisher ?? "Yahoo Finance",
      publishedAt: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : null,
    }];
  });
}
