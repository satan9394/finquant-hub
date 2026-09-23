import { Button, Table } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

export interface CompareRow { key: string; metric: string; left: string; right: string; source?: string }

export default function CompareGrid({ leftName, rightName, rows, onAsk }: { leftName: string; rightName: string; rows: CompareRow[]; onAsk?: (row: CompareRow) => void }) {
  const { t } = useLanguage();
  return <Table pagination={false} size="small" rowKey="key" dataSource={rows} columns={[
    { title: t('compare.metric'), dataIndex: 'metric' },
    { title: leftName, dataIndex: 'left' },
    { title: rightName, dataIndex: 'right' },
    { title: t('compare.action'), key: 'action', render: (_, row) => <Button type="link" onClick={() => onAsk?.(row)}>{t('compare.askAgent')}</Button> },
  ]} />;
}
