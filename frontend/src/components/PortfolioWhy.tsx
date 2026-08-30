import { Empty, Table, Typography } from 'antd';
import type { PortfolioSummary } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

/** 金额格式化：符号在货币符号前（+¥20.00 / -¥10.00），符合中文财务惯例。 */
function formatMoney(value: number, signed = false): string {
  const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
  return `${sign}¥${Math.abs(value).toFixed(2)}`;
}

/** 百分比格式化：+10.00% / -10.00%。 */
function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export default function PortfolioWhy({ summary }: { summary: PortfolioSummary | null }) {
  const { t } = useLanguage();
  const rows = summary?.group_summaries ?? [];
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portfolio.noAttribution')} />;

  return <>
    <Typography.Paragraph type="secondary">{t('portfolio.attributionNotice')}</Typography.Paragraph>
    <Table
      rowKey="group_id"
      size="small"
      pagination={false}
      dataSource={rows}
      columns={[
        { title: t('portfolio.why.group'), dataIndex: 'group_name' },
        { title: t('portfolio.why.marketValue'), dataIndex: 'current', align: 'right', render: (value: number) => formatMoney(value) },
        { title: t('portfolio.why.contribution'), dataIndex: 'profit', align: 'right', render: (value: number) => formatMoney(value, true) },
        { title: t('portfolio.why.return'), dataIndex: 'profit_percent', align: 'right', render: (value: number) => formatPercent(value) },
        { title: t('portfolio.why.todayFx'), key: 'unknown', render: () => 'UNKNOWN' },
      ]}
    />
  </>;
}
