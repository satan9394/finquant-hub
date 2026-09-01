import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, DatePicker, Empty, Segmented, Space, Table, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import TaskPageHeader from '../components/TaskPageHeader';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchLimitPool } from '../services/researchApi';
import type { LimitPoolItem, LimitPoolResponse } from '../types/research';
import { formatWan, shanghaiToday } from '../utils/formatAStock';

const { Text } = Typography;
type Pool = 'limit_up' | 'limit_down';

export default function LimitPool() {
  const { t } = useLanguage();
  const [date, setDate] = useState<Dayjs>(() => dayjs(shanghaiToday()));
  const [pool, setPool] = useState<Pool>('limit_up');
  const [payload, setPayload] = useState<LimitPoolResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPool = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayload(await fetchLimitPool(date.format('YYYY-MM-DD'), pool));
    } catch (reason: any) {
      setPayload(null);
      setError(reason?.message ?? t('limitPool.error'));
    } finally {
      setLoading(false);
    }
  }, [date, pool, t]);

  useEffect(() => { void loadPool(); }, [loadPool]);

  const columns = [
    { title: t('limitPool.column.code'), dataIndex: 'code', key: 'code' },
    { title: t('limitPool.column.name'), dataIndex: 'name', key: 'name' },
    {
      title: t('limitPool.column.limitUpCount'),
      dataIndex: 'limit_up_count',
      key: 'limit_up_count',
      render: (value: number | null) => pool === 'limit_down' ? '—' : value ?? '—',
    },
    {
      title: t('limitPool.column.sealAmount'),
      dataIndex: 'seal_amount',
      key: 'seal_amount',
      render: (value: number | null) => formatWan(value),
    },
    {
      title: t('limitPool.column.breakTimes'),
      dataIndex: 'break_times',
      key: 'break_times',
      render: (value: number | null) => pool === 'limit_down' ? '—' : value ?? '—',
    },
    { title: t('limitPool.column.industry'), dataIndex: 'industry', key: 'industry', render: (value: string) => value || '—' },
    { title: t('limitPool.column.limitStat'), dataIndex: 'limit_stat', key: 'limit_stat', render: (value: string) => value || '—' },
  ];

  const status = loading
    ? t('limitPool.status.loading')
    : payload?.quality === 'UNKNOWN'
      ? t('limitPool.status.unknown')
      : t('limitPool.status.ready');

  return (
    <main className="product-page" data-testid="limit-pool-page">
      <TaskPageHeader
        eyebrow={t('limitPool.eyebrow')}
        title={t('limitPool.title')}
        goal={t('limitPool.goal')}
        object={date.format('YYYY-MM-DD')}
        status={status}
        statusTone={loading ? 'loading' : payload?.quality === 'UNKNOWN' || error ? 'warning' : 'success'}
      />

      <Card className="surface-card">
        <Space wrap size="middle">
          <DatePicker
            aria-label={t('limitPool.date')}
            allowClear={false}
            value={date}
            disabledDate={(current) => current.startOf('day').isAfter(dayjs(shanghaiToday()).startOf('day'))}
            onChange={(value) => { if (value) setDate(value); }}
          />
          <Segmented<Pool>
            aria-label={t('limitPool.pool')}
            value={pool}
            options={[
              { label: t('limitPool.limitUp'), value: 'limit_up' },
              { label: t('limitPool.limitDown'), value: 'limit_down' },
            ]}
            onChange={setPool}
          />
        </Space>

        {error ? (
          <Alert
            type="error"
            showIcon
            message={error}
            action={<Button size="small" onClick={() => void loadPool()}>{t('limitPool.retry')}</Button>}
            style={{ marginTop: 16 }}
          />
        ) : null}
        {payload?.quality === 'UNKNOWN' ? (
          <Alert type="warning" showIcon message={payload.error ?? t('limitPool.unknown')} style={{ marginTop: 16 }} />
        ) : null}

        <Table<LimitPoolItem>
          style={{ marginTop: 16 }}
          loading={loading}
          columns={columns}
          dataSource={payload?.items ?? []}
          rowKey="code"
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description={t('limitPool.empty')} /> }}
          scroll={{ x: 'max-content' }}
        />
        {payload ? (
          <Text type="secondary">
            {t('limitPool.provenance', { source: payload.source, date: payload.date, quality: payload.quality })}
          </Text>
        ) : null}
      </Card>
    </main>
  );
}
