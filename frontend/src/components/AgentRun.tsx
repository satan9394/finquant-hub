import { Button, Progress, Steps } from 'antd';
import StatusChip from './StatusChip';
import { useLanguage } from '../i18n/LanguageContext';

export interface AgentRunStep { title: string; status: 'wait' | 'process' | 'finish' | 'error' }

export default function AgentRun({ title, progress, steps, sources = null, activity = 'UNKNOWN', onPause, onChangeScope }: { title: string; progress: number | null; steps: AgentRunStep[]; sources?: number | null; activity?: string; onPause?: () => void; onChangeScope?: () => void }) {
  const { t } = useLanguage();
  return (
    <section className="agent-run">
      <div className="agent-run__topline"><strong>{title}</strong><StatusChip label={steps.some((step) => step.status === 'process') ? t('agentRun.running') : t('agentRun.idle')} tone="info" /></div>
      {progress == null ? <div>UNKNOWN</div> : <Progress percent={progress} />}
      <Steps direction="vertical" size="small" items={steps} />
      <dl><div><dt>{t('agentRun.sources')}</dt><dd>{sources ?? 'UNKNOWN'}</dd></div><div><dt>{t('agentRun.activity')}</dt><dd>{activity}</dd></div></dl>
      <div><Button disabled={!onPause} onClick={onPause}>{t('agentRun.pause')}</Button><Button disabled={!onChangeScope} onClick={onChangeScope}>{t('agentRun.changeScope')}</Button></div>
    </section>
  );
}
