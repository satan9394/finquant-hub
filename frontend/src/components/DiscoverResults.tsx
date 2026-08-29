import { Button, Empty, Space, Table, Tag, Typography } from 'antd';
import type { NavigateFunction } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

export interface DiscoveredStock {
  ticker: string;
  name: string;
  price: number;
  change_percent: number;
  return_60d_pct: number;
  signal: string;
}

export default function DiscoverResults({ items, loading, navigate, onWatch }: {
  items: DiscoveredStock[];
  loading: boolean;
  navigate: NavigateFunction;
  onWatch: (item: DiscoveredStock) => void;
}) {
  const { t } = useLanguage();
  if (!loading && !items.length) return <Empty description={t('discover.noStocks')} />;

  return <Table<DiscoveredStock>
    rowKey="ticker"
    loading={loading}
    dataSource={items}
    pagination={false}
    size="small"
    scroll={{ x: 980 }}
    columns={[
      { title: t('discover.company'), key: 'company', render: (_, row) => <><Typography.Text strong>{row.name}</Typography.Text><br /><Typography.Text code>{row.ticker}</Typography.Text></> },
      { title: t('discover.price'), dataIndex: 'price', align: 'right', render: (value: number) => value.toFixed(2) },
      { title: t('discover.daily'), dataIndex: 'change_percent', align: 'right', render: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` },
      { title: t('discover.return60'), dataIndex: 'return_60d_pct', align: 'right', render: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` },
      { title: t('discover.signal'), dataIndex: 'signal', render: (value: string) => <Tag>{value || 'UNKNOWN'}</Tag> },
      {
        title: t('discover.next'), key: 'actions', width: 310, render: (_, row) => <Space wrap size={2}>
          <Button type="link" size="small" onClick={() => navigate(`/research/${encodeURIComponent(row.ticker)}`)}>{t('discover.research')}</Button>
          <Button type="link" size="small" onClick={() => navigate(`/compare?query=${encodeURIComponent(row.ticker)}`)}>{t('discover.compare')}</Button>
          <Button type="link" size="small" onClick={() => onWatch(row)}>{t('discover.watch')}</Button>
          <Button type="link" size="small" onClick={() => navigate(`/alerts?new=1&ticker=${encodeURIComponent(row.ticker)}`)}>{t('discover.monitor')}</Button>
          <Button type="link" size="small" onClick={() => navigate(`/strategy-lab/ma-crossover?symbol=${encodeURIComponent(row.ticker)}`)}>{t('discover.strategy')}</Button>
        </Space>,
      },
    ]}
  />;
}
