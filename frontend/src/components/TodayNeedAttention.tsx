import type { ReactNode } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function TodayNeedAttention({ attention, running, changes, events, children }: { attention: number | string; running: number | string; changes: number | string; events: number | string; children: ReactNode }) {
  const { t } = useLanguage();
  return <section className="today-section today-attention"><div className="today-metric-row">{[['attention', attention], ['running', running], ['changes', changes], ['events', events]].map(([key, value]) => <div key={String(key)}><span>{t(`today.metric.${key}`)}</span><strong>{value}</strong></div>)}</div>{children}</section>;
}
