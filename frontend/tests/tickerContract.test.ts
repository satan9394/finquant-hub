import { describe, expect, it } from 'vitest';

import {
  canonicalTicker,
  externalTicker,
  tickerContract,
} from '../src/features/tickerContract';

describe('ticker contract', () => {
  it.each([
    ['600519', 'sh600519', '600519', '600519.SS'],
    ['SZ000858', 'sz000858', '000858', '000858.SZ'],
    ['0700', 'hk00700', '00700.HK', '0700.HK'],
    ['00700.hk', 'hk00700', '00700.HK', '0700.HK'],
    ['AAPL', 'usAAPL', 'AAPL', 'AAPL'],
    ['aapl', 'usAAPL', 'AAPL', 'AAPL'],
    ['BRK.B', 'usBRK-B', 'BRK-B', 'BRK-B'],
    ['BRK-B', 'usBRK-B', 'BRK-B', 'BRK-B'],
    ['usBRK.B', 'usBRK-B', 'BRK-B', 'BRK-B'],
    ['BF.B', 'usBF-B', 'BF-B', 'BF-B'],
    ['B2', 'usB2', 'B2', 'B2'],
    ['  AAPL  ', 'usAAPL', 'AAPL', 'AAPL'],
  ])('normalizes %s', (raw, canonical, external, yahoo) => {
    expect(tickerContract(raw)).toEqual({
      kind: 'supported', market: canonical.slice(0, 2), canonical, external, yahoo,
    });
    expect(canonicalTicker(raw)).toBe(canonical);
    expect(externalTicker(raw)).toBe(external);
  });

  it.each(['830799', '920002', '430047', 'sh830799', 'bj830799', '830799.SS']) (
    'marks unsupported segment %s without guessing an exchange',
    (raw) => {
      expect(tickerContract(raw)).toEqual({ kind: 'unsupported', reason: 'unsupported_segment' });
      expect(canonicalTicker(raw)).toBeNull();
    },
  );

  it.each(['', '   ', 'AA PL', 'BRK..B', 'BRK-', '123', '1234567', 'sh000858', '600519.SZ'])(
    'rejects invalid input %j',
    (raw) => expect(tickerContract(raw).kind).toBe('invalid'),
  );
});
