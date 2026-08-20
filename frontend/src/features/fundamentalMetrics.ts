import type { FundamentalItem } from '../types/research';

export type P1MetricDomain = '估值' | '经营质量' | '偿债风险';

export type P1MetricView = {
  key: string;
  label: string;
  domain: P1MetricDomain;
  unavailableReason: string;
  item: FundamentalItem | null;
  formula?: string;
  unit: 'percent' | 'multiple';
};

const definitions: Omit<P1MetricView, 'item'>[] = [
  { key: 'ev_to_ebitda', label: 'EV / EBITDA', domain: '估值', unit: 'multiple', unavailableReason: '需要企业价值与 EBITDA；当前提供方未同时返回。' },
  { key: 'ev_to_sales', label: 'EV / Sales', domain: '估值', unit: 'multiple', unavailableReason: '需要企业价值与营业收入；当前提供方未同时返回。' },
  { key: 'fcf_yield', label: 'FCF Yield', domain: '估值', unit: 'percent', formula: 'TTM 自由现金流 ÷ 时点市值', unavailableReason: '需要兼容币种的自由现金流与市值。' },
  { key: 'peg', label: 'PEG', domain: '估值', unit: 'multiple', unavailableReason: '需要提供方明确返回 PEG；不由 PE 和短期增长猜算。' },
  { key: 'dividend_yield', label: '股息率', domain: '估值', unit: 'percent', unavailableReason: '需要提供方返回现金股息及对应价格口径。' },
  { key: 'roic', label: 'ROIC', domain: '经营质量', unit: 'percent', unavailableReason: '需要提供方明确返回投入资本回报率。' },
  { key: 'roa', label: 'ROA', domain: '经营质量', unit: 'percent', unavailableReason: '需要提供方明确返回总资产收益率。' },
  { key: 'dupont_roe', label: '杜邦分解', domain: '经营质量', unit: 'multiple', unavailableReason: '需要同口径净利率、资产周转率和权益乘数。' },
  { key: 'cfo_to_net_income', label: 'CFO / 净利润', domain: '经营质量', unit: 'percent', formula: '同报告期经营现金流 ÷ 净利润', unavailableReason: '需要同来源、同报告期的经营现金流与净利润。' },
  { key: 'fcf_margin', label: 'FCF Margin', domain: '经营质量', unit: 'percent', formula: '同报告期自由现金流 ÷ 营业收入', unavailableReason: '需要同来源、同报告期的自由现金流与营业收入。' },
  { key: 'net_debt_to_ebitda', label: '净负债 / EBITDA', domain: '偿债风险', unit: 'multiple', unavailableReason: '需要有息负债、现金与 EBITDA。' },
  { key: 'interest_coverage', label: '利息保障倍数', domain: '偿债风险', unit: 'multiple', unavailableReason: '需要提供方明确返回 EBIT 与利息口径。' },
  { key: 'quick_ratio', label: '速动比率', domain: '偿债风险', unit: 'multiple', unavailableReason: '需要提供方明确返回速动资产与流动负债口径。' },
];

export const P1_DOMAINS: P1MetricDomain[] = ['估值', '经营质量', '偿债风险'];

export function p1FundamentalMetrics(items: FundamentalItem[] = []): P1MetricView[] {
  const byMetric = new Map(items.map((item) => [item.metric, item]));
  return definitions.map((definition) => ({ ...definition, item: byMetric.get(definition.key) ?? null }));
}

export function formatP1Metric(metric: P1MetricView): string {
  if (!metric.item) return 'UNKNOWN';
  const value = metric.item.value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return metric.unit === 'percent' ? `${value}%` : `${value}x`;
}
