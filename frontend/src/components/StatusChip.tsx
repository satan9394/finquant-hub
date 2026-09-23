import { Tag } from 'antd';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export default function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  return <Tag className={`status-chip status-chip--${tone}`}>{label}</Tag>;
}
