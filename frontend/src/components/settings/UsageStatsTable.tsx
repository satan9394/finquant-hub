import { Card, Empty, Segmented, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

import { useLanguage } from '../../i18n/LanguageContext';
import { formatCost, type UsageDimension, type UsageStatsResponse } from '../../services/usageApi';
import {
  buildUsageStatsRows,
  sortUsageStatsRows,
  type UsageStatsRow,
  type UsageStatsSortKey,
  type UsageStatsSortOrder,
} from '../../utils/usageStats';

interface UsageStatsTableProps {
  dimension: UsageDimension;
  onDimensionChange: (dimension: UsageDimension) => void;
  response: UsageStatsResponse | null;
  loading?: boolean;
  error?: string;
}

function formatShare(value: number | null): string {
  if (value === null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Aggregation table for the usage detail module (BACKLOG-045), modelled on CC
 * Switch's `ProviderStatsTable` / `ModelStatsTable`: one row per model or per
 * session type with requests, tokens, share and derived cost, sortable on every
 * numeric column. Cost keeps BACKLOG-044's honesty rules.
 */
export default function UsageStatsTable({
  dimension,
  onDimensionChange,
  response,
  loading = false,
  error,
}: UsageStatsTableProps) {
  const { t } = useLanguage();
  const [sortKey, setSortKey] = useState<UsageStatsSortKey>('totalTokens');
  const [sortOrder, setSortOrder] = useState<UsageStatsSortOrder>('descend');

  const rows = useMemo(() => buildUsageStatsRows(response), [response]);
  const sorted = useMemo(
    () => sortUsageStatsRows(rows, sortKey, sortOrder),
    [rows, sortKey, sortOrder],
  );

  const keyTitle = dimension === 'model' ? t('settings.usage.cost.model') : t('settings.usage.scenario');

  const costCell = (row: UsageStatsRow) => {
    switch (row.costStatus) {
      case 'priced':
        return formatCost(row.estimatedCost, row.currency);
      case 'mixed_currency':
        return <Tag>{t('settings.usage.cost.mixedCurrency')}</Tag>;
      case 'partial':
        return (
          <span>
            {formatCost(row.estimatedCost, row.currency)}{' '}
            <Tag>{t('settings.usage.stats.partialUnpriced')}</Tag>
          </span>
        );
      case 'unpriced':
        return <Tag>{t('settings.usage.cost.unpriced')}</Tag>;
      default:
        return '-';
    }
  };

  const columns: ColumnsType<UsageStatsRow> = [
    {
      title: keyTitle,
      key: 'rawKey',
      sorter: true,
      sortOrder: sortKey === 'rawKey' ? sortOrder : null,
      render: (_value, row) =>
        row.rawKey ??
        (dimension === 'model'
          ? t('settings.usage.cost.unknownModel')
          : t('settings.usage.stats.unknownSession')),
    },
    {
      title: t('settings.usage.requestCount'),
      key: 'requestCount',
      align: 'right',
      sorter: true,
      sortOrder: sortKey === 'requestCount' ? sortOrder : null,
      render: (_value, row) => row.requestCount.toLocaleString(),
    },
    {
      title: 'Token',
      key: 'totalTokens',
      align: 'right',
      sorter: true,
      sortOrder: sortKey === 'totalTokens' ? sortOrder : null,
      render: (_value, row) => row.totalTokens.toLocaleString(),
    },
    {
      title: t('settings.usage.stats.tokenShare'),
      key: 'tokenShare',
      align: 'right',
      sorter: true,
      sortOrder: sortKey === 'tokenShare' ? sortOrder : null,
      render: (_value, row) => formatShare(row.tokenShare),
    },
    {
      title: t('settings.usage.stats.requestShare'),
      key: 'requestShare',
      align: 'right',
      render: (_value, row) => formatShare(row.requestShare),
    },
    {
      title: t('settings.usage.cost.estimated'),
      key: 'estimatedCost',
      align: 'right',
      sorter: true,
      sortOrder: sortKey === 'estimatedCost' ? sortOrder : null,
      render: (_value, row) => costCell(row),
    },
  ];

  const empty = !loading && !error && sorted.length === 0;

  return (
    <Card
      size="small"
      title={t('settings.usage.stats.title')}
      data-testid="usage-stats-table"
      extra={
        <Segmented<UsageDimension>
          value={dimension}
          onChange={(next) => onDimensionChange(next)}
          options={[
            { label: t('settings.usage.stats.byModel'), value: 'model' },
            { label: t('settings.usage.stats.bySessionType'), value: 'session_type' },
          ]}
        />
      }
    >
      {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
      {empty ? (
        <Empty description={t('settings.usage.stats.empty')} data-testid="usage-stats-empty" />
      ) : (
        <Table<UsageStatsRow>
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={sorted}
          columns={columns}
          pagination={false}
          scroll={{ x: '100%' }}
          // Third entry repeats ascend so a click never silently clears the sort.
          sortDirections={['ascend', 'descend', 'ascend']}
          onChange={(_pagination, _filters, sorter) => {
            const active = Array.isArray(sorter) ? sorter[0] : sorter;
            if (!active?.order) {
              // Clearing the sort falls back to the most-used rows first.
              setSortKey('totalTokens');
              setSortOrder('descend');
              return;
            }
            setSortKey(active.columnKey as UsageStatsSortKey);
            setSortOrder(active.order);
          }}
        />
      )}
    </Card>
  );
}
