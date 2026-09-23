export type TickerMarket = 'sh' | 'sz' | 'hk' | 'us';

export type TickerContract = {
  kind: 'supported';
  market: TickerMarket;
  canonical: string;
  external: string;
  yahoo: string;
} | {
  kind: 'unsupported';
  reason: 'unsupported_segment';
} | {
  kind: 'invalid';
  reason: 'empty' | 'invalid_format' | 'market_mismatch';
};

const US_SYMBOL = /^[A-Za-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*$/;

function mainlandMarket(digits: string): 'sh' | 'sz' | null {
  if (digits.startsWith('6')) return 'sh';
  if (digits.startsWith('0') || digits.startsWith('3')) return 'sz';
  return null;
}

function supported(market: TickerMarket, symbol: string): TickerContract {
  if (market === 'sh') {
    return { kind: 'supported', market, canonical: `sh${symbol}`, external: symbol, yahoo: `${symbol}.SS` };
  }
  if (market === 'sz') {
    return { kind: 'supported', market, canonical: `sz${symbol}`, external: symbol, yahoo: `${symbol}.SZ` };
  }
  if (market === 'hk') {
    const padded = symbol.padStart(5, '0');
    return {
      kind: 'supported', market, canonical: `hk${padded}`,
      external: `${padded}.HK`, yahoo: `${Number(padded).toString().padStart(4, '0')}.HK`,
    };
  }
  const canonicalSymbol = symbol.toUpperCase().replace(/\./g, '-');
  return {
    kind: 'supported', market, canonical: `us${canonicalSymbol}`,
    external: canonicalSymbol, yahoo: canonicalSymbol,
  };
}

function usTicker(symbol: string): TickerContract {
  if (symbol.length > 15 || !US_SYMBOL.test(symbol)) {
    return { kind: 'invalid', reason: 'invalid_format' };
  }
  return supported('us', symbol);
}

export function tickerContract(value: string): TickerContract {
  const raw = value.trim();
  if (!raw) return { kind: 'invalid', reason: 'empty' };
  if (/\s/.test(raw)) return { kind: 'invalid', reason: 'invalid_format' };

  const mainland = raw.match(/^(sh|sz)(\d{6})$/i);
  if (mainland) {
    const expected = mainlandMarket(mainland[2]);
    if (!expected) return { kind: 'unsupported', reason: 'unsupported_segment' };
    if (expected !== mainland[1].toLowerCase()) return { kind: 'invalid', reason: 'market_mismatch' };
    return supported(expected, mainland[2]);
  }
  if (/^bj\d{6}$/i.test(raw)) return { kind: 'unsupported', reason: 'unsupported_segment' };

  const hkPrefixed = raw.match(/^hk(\d{4,5})$/i);
  if (hkPrefixed) return supported('hk', hkPrefixed[1]);

  const usPrefixed = raw.match(/^us(.+)$/i);
  if (usPrefixed) return usTicker(usPrefixed[1]);

  const hkSuffix = raw.match(/^(\d{4,5})\.HK$/i);
  if (hkSuffix) return supported('hk', hkSuffix[1]);

  const mainlandSuffix = raw.match(/^(\d{6})\.(SS|SZ)$/i);
  if (mainlandSuffix) {
    const expected = mainlandMarket(mainlandSuffix[1]);
    if (!expected) return { kind: 'unsupported', reason: 'unsupported_segment' };
    const supplied = mainlandSuffix[2].toUpperCase() === 'SS' ? 'sh' : 'sz';
    if (expected !== supplied) return { kind: 'invalid', reason: 'market_mismatch' };
    return supported(expected, mainlandSuffix[1]);
  }

  if (/^\d+$/.test(raw)) {
    if (raw.length === 6) {
      const market = mainlandMarket(raw);
      return market ? supported(market, raw) : { kind: 'unsupported', reason: 'unsupported_segment' };
    }
    if (raw.length >= 4 && raw.length <= 5) return supported('hk', raw);
    return { kind: 'invalid', reason: 'invalid_format' };
  }

  return usTicker(raw);
}

export function canonicalTicker(value: string): string | null {
  const result = tickerContract(value);
  return result.kind === 'supported' ? result.canonical : null;
}

export function externalTicker(value: string): string | null {
  const result = tickerContract(value);
  return result.kind === 'supported' ? result.external : null;
}
