import { Segmented } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

export type AgentMode = 'fast' | 'analyst' | 'deep' | 'review';

export default function AgentModeSelector({ value, onChange }: { value: AgentMode; onChange: (value: AgentMode) => void }) {
  const { t } = useLanguage();
  const labels = { fast: t('agentMode.fast'), analyst: t('agentMode.analyst'), deep: t('agentMode.deep'), review: t('agentMode.review') };
  return <Segmented aria-label={t('model.label')} value={value} options={Object.entries(labels).map(([key, label]) => ({ value: key, label }))} onChange={(next) => onChange(next as AgentMode)} />;
}
