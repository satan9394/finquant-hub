import type { ReactNode } from 'react';
import SourceChip from './SourceChip';

export default function TimeseriesChart({ title, provider, asOf, children }: { title: string; provider?: string | null; asOf?: string | null; children: ReactNode }) {
  return <section className="timeseries-chart"><div className="timeseries-chart__header"><h3>{title}</h3><SourceChip provider={provider} asOf={asOf} /></div>{children}</section>;
}
