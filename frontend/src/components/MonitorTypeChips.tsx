import { Tag } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

export const MONITOR_TYPES = ['price', 'technical', 'fundamental', 'estimate', 'news', 'filing', 'thesis', 'ipo', 'supply-chain', 'agent-research'] as const;
export type MonitorType = typeof MONITOR_TYPES[number];

export default function MonitorTypeChips({ selected, onChange }: { selected: MonitorType | 'all'; onChange: (value: MonitorType | 'all') => void }) {
  const { t } = useLanguage();
  return <div className="monitor-type-chips">{(['all', ...MONITOR_TYPES] as const).map((type) => <Tag.CheckableTag key={type} checked={selected === type} onChange={() => onChange(type)}>{t(`monitor.type.${type}`)}</Tag.CheckableTag>)}</div>;
}
