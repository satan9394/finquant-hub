import { Progress } from 'antd';
import StatusChip from './StatusChip';
import { useLanguage } from '../i18n/LanguageContext';

export interface ResearchRunItem { id: string | number; title: string; state: string; progress?: number | null; updatedAt?: string | null }

export default function ResearchRuns({ runs }: { runs: ResearchRunItem[] }) {
  const { t } = useLanguage();
  return <section className="today-section"><h2>{t('today.researchRuns')}</h2><div className="research-runs">{runs.length ? runs.map((run) => <article key={run.id}><div><strong>{run.title}</strong><StatusChip label={run.state} tone={run.state === 'done' ? 'success' : run.state === 'failed' ? 'error' : 'info'} /></div>{run.progress == null ? <span>UNKNOWN</span> : <Progress percent={run.progress} size="small" />}<small>{run.updatedAt || 'UNKNOWN'}</small></article>) : <p>UNKNOWN</p>}</div></section>;
}
