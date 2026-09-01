export type AStockMoneyUnit = 'CNY' | 'CNY_10K';

export function formatWan(
  value: number | null | undefined,
  unit: AStockMoneyUnit = 'CNY',
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const amount = unit === 'CNY_10K' ? value : value / 10_000;
  return `${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} 万元`;
}

export function shanghaiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
