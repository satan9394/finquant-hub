import { Typography } from 'antd';

const { Text } = Typography;
type MonthlyRow = { year: number; months: Array<number | null>; annual_total: number | null; complete_year?: boolean };

const monthLabels = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
const formatPercent = (value: number | null) => value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

function cellColor(value: number | null): string {
  if (value == null) return 'var(--fq-bg-subtle)';
  const intensity = Math.min(38, Math.max(8, Math.abs(value) * 100));
  const color = value >= 0 ? 'var(--fq-price-up)' : 'var(--fq-price-down)';
  return `color-mix(in srgb, ${color} ${intensity}%, var(--fq-surface-1))`;
}

export default function MonthlyHeatmap({ rows }: { rows: MonthlyRow[] }) {
  return (
    <div aria-label="月度收益热力图" data-testid="portfolio-monthly-heatmap" style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 780, display: 'grid', gridTemplateColumns: '64px repeat(12, minmax(40px, 1fr)) 92px', gap: 5 }}>
        <Text type="secondary">年份</Text>
        {monthLabels.map((label) => <Text key={label} type="secondary" style={{ textAlign: 'center' }}>{label}</Text>)}
        <Text type="secondary" style={{ textAlign: 'right' }}>年度</Text>
        {rows.map((row) => (
          <div key={row.year} style={{ display: 'contents' }}>
            <Text strong style={{ alignSelf: 'center' }}>{row.year}</Text>
            {monthLabels.map((label, index) => {
              const value = row.months[index] ?? null;
              return (
                <div
                  key={`${row.year}-${label}`}
                  role="gridcell"
                  title={`${row.year}年${label}：${value == null ? '暂无数据' : formatPercent(value)}`}
                  style={{
                    minHeight: 34,
                    display: 'grid',
                    placeItems: 'center',
                    border: '1px solid var(--fq-border)',
                    borderRadius: 6,
                    background: cellColor(value),
                    color: value == null ? 'var(--fq-text-tertiary)' : value >= 0 ? 'var(--fq-price-up)' : 'var(--fq-price-down)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatPercent(value)}
                </div>
              );
            })}
            <Text strong style={{ textAlign: 'right', alignSelf: 'center' }}>{formatPercent(row.annual_total)}</Text>
          </div>
        ))}
      </div>
      {rows.some((row) => !row.complete_year) && <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>首尾年份可能只包含可用样本期；空白月份保持未知。</Text>}
    </div>
  );
}
