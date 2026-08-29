import { Table } from 'antd';

export default function FinancialTable({ rows }: { rows: Array<{ key: string; metric: string; value: string; period?: string; source?: string }> }) {
  return <Table size="small" pagination={false} rowKey="key" dataSource={rows} columns={[
    { title: 'Metric', dataIndex: 'metric' },
    { title: 'Value', dataIndex: 'value' },
    { title: 'Period', dataIndex: 'period', render: (value) => value || 'UNKNOWN' },
    { title: 'Source', dataIndex: 'source', render: (value) => value || 'UNKNOWN' },
  ]} />;
}
