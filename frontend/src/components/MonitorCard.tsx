import { Button } from 'antd';
import SourceChip from './SourceChip';
import StatusChip from './StatusChip';
import type { MonitorType } from './MonitorTypeChips';
import { useLanguage } from '../i18n/LanguageContext';

export interface MonitorCardData {
  id: string | number;
  name: string;
  type: MonitorType;
  priority?: 'high' | 'medium' | 'low' | null;
  state?: string | null;
  lastCheck?: string | null;
  nextCheck?: string | null;
  sources?: number | null;
  changes?: number | null;
  latestEvent?: string | null;
  provider?: string | null;
}

export default function MonitorCard({ monitor, onInspect, onRunNow, onEdit, runNowLoading = false }: { monitor: MonitorCardData; onInspect?: () => void; onRunNow?: () => void; onEdit?: () => void; runNowLoading?: boolean }) {
  const { t } = useLanguage();
  return (
    <article className="monitor-card">
      <div className="monitor-card__topline"><div><span>{t(`monitor.type.${monitor.type}`)}</span><h3>{monitor.name}</h3></div><StatusChip label={(monitor.priority || 'UNKNOWN').toUpperCase()} tone={monitor.priority === 'high' ? 'error' : monitor.priority === 'medium' ? 'warning' : 'neutral'} /></div>
      <dl>
        <div><dt>{t('monitor.card.state')}</dt><dd>{monitor.state || 'UNKNOWN'}</dd></div>
        <div><dt>{t('monitor.card.last')}</dt><dd>{monitor.lastCheck || 'UNKNOWN'}</dd></div>
        <div><dt>{t('monitor.card.next')}</dt><dd>{monitor.nextCheck || 'UNKNOWN'}</dd></div>
        <div><dt>{t('monitor.card.sources')}</dt><dd>{monitor.sources ?? 'UNKNOWN'}</dd></div>
        <div><dt>{t('monitor.card.changes')}</dt><dd>{monitor.changes ?? 'UNKNOWN'}</dd></div>
      </dl>
      <p><strong>{t('monitor.card.latest')}:</strong> {monitor.latestEvent || 'UNKNOWN'}</p>
      <SourceChip provider={monitor.provider} asOf={monitor.lastCheck} />
      <div className="monitor-card__actions"><Button onClick={onInspect}>{t('monitor.card.inspect')}</Button><Button disabled={!onRunNow} loading={runNowLoading} onClick={onRunNow}>{t('monitor.card.run')}</Button><Button onClick={onEdit}>{t('monitor.card.edit')}</Button></div>
    </article>
  );
}
