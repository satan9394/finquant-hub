export type BacktestStrategy = 'ma_cross' | 'rsi_reversal' | 'bollinger_breakout';

const TICKER_PATTERN = /(?<![A-Za-z0-9])(?:\d{6}(?:\.(?:SS|SZ))?|\d{4,5}(?:\.HK)?|[A-Za-z][A-Za-z0-9.\-]{0,14})(?![A-Za-z0-9])/gi;
const COMMAND_TICKER_PATTERN = new RegExp(`(?:回测|backtest)\\s*[:：]?\\s*(${TICKER_PATTERN.source})`, 'i');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseBacktestRequest(description: string): { ticker?: string; strategy: BacktestStrategy } {
  const commandTicker = description.match(COMMAND_TICKER_PATTERN)?.[1];
  const candidates = description.match(TICKER_PATTERN) ?? [];
  const ticker = commandTicker ?? candidates.find((candidate) => candidate.toLowerCase() !== 'backtest');

  // Remove the selected ticker before detecting strategy words so valid US
  // symbols such as MA and RSI are not mistaken for strategy names.
  const normalized = (
    ticker ? description.replace(new RegExp(escapeRegExp(ticker), 'gi'), '') : description
  ).toLowerCase();
  const strategy: BacktestStrategy = normalized.includes('rsi') ? 'rsi_reversal'
    : normalized.includes('bollinger') || normalized.includes('布林') ? 'bollinger_breakout'
    : 'ma_cross';
  return { ticker, strategy };
}
