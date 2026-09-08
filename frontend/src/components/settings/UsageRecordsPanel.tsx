import { Alert, Button, Card, Empty, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';

import { useLanguage } from '../../i18n/LanguageContext';
import apiClient from '../../services/api';

export interface UsageRecord {
  id: number;
  session_type: string;
  model_name: string | null;
  conversation_id: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  created_at: string;
}

function formatTime(value?: string): string {
  if (!value) return '-';
  // created_at is a UTC sqlite datetime "YYYY-MM-DD HH:MM:SS"; show date + time as-is.
  return value.slice(0, 19);
}

export default function UsageRecordsPanel({ limit = 50 }: { limit?: number }) {
  const { t } = useLanguage();
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get<{ items: UsageRecord[]; total: number }>(
        '/usage/records',
        { params: { limit } },
      );
      setRecords(response.data.items);
      setTotal(response.data.total);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('settings.usage.recordsLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [limit, t]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const columns: ColumnsType<UsageRecord> = [
    { title: t('settings.usage.records.time'), dataIndex: 'created_at', render: formatTime },
    { title: t('settings.usage.records.model'), dataIndex: 'model_name', render: (v?: string | null) => v || '-' },
    { title: t('settings.usage.records.total'), dataIndex: 'total_tokens' },
    { title: t('settings.usage.records.conversation'), dataIndex: 'conversation_id', render: (v?: number | null) => (v == null ? '-' : `#${v}`) },
  ];

  return (
    <Card
      size="small"
      title={t('settings.usage.records.title')}
      loading={loading}
      extra={<Button size="small" onClick={() => void loadRecords()}>{t('settings.refresh')}</Button>}
    >
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      {!loading && !error && records.length === 0 ? (
        <Empty description={t('settings.usage.records.empty')} />
      ) : (
        <>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            {t('settings.usage.records.hint', { total })}
          </Typography.Paragraph>
          <Table<UsageRecord>
            size="small"
            rowKey="id"
            dataSource={records}
            columns={columns}
            pagination={false}
            scroll={{ x: '100%' }}
          />
        </>
      )}
      {loading && records.length === 0 ? <Spin style={{ display: 'block', margin: '16px auto' }} /> : null}
    </Card>
  );
}