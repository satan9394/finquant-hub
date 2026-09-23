import { Button } from 'antd';

export interface MetricStripItem {
  key: string;
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'neutral';
  sourceRef?: number;
}

export default function MetricStrip({ items, onReference }: { items: MetricStripItem[]; onReference?: (sourceRef: number) => void }) {
  return (
    <dl className="metric-strip">
      {items.map((item) => {
        const sourceRef = item.sourceRef;
        return (
        <div key={item.key} className={`metric-strip__item metric-strip__item--${item.tone ?? 'neutral'}`}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            {sourceRef ? <Button type="link" size="small" onClick={() => onReference?.(sourceRef)}>[{sourceRef}]</Button> : null}
          </dd>
        </div>
        );
      })}
    </dl>
  );
}
