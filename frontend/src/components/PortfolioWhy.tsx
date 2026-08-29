import { Empty, Table, Typography } from 'antd';
import type { PortfolioSummary } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

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
        { title: t('portfolio.why.marketValue'), dataIndex: 'current', align: 'right', render: (value: number) => `¥${value.toFixed(2)}` },
        { title: t('portfolio.why.contribution'), dataIndex: 'profit', align: 'right', render: (value: number) => `${value >= 0 ? '+' : ''}¥${value.toFixed(2)}` },
        { title: t('portfolio.why.return'), dataIndex: 'profit_percent', align: 'right', render: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` },
        { title: t('portfolio.why.todayFx'), key: 'unknown', render: () => 'UNKNOWN' },
      ]}
    />
  </>;
}
