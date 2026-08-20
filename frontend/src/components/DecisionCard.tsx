import { Button, Card, Space, Tag, Typography } from 'antd';
import EvidenceChip from './EvidenceChip';
import type { EvidenceRecord } from './EvidenceDrawer';

export type DecisionType = 'risk' | 'opportunity' | 'review' | 'blocked';

export default function DecisionCard({
  type = 'review',
  title,
  whyNow,
  impact,
  dueAt,
  quality,
  evidence = [],
  actionLabel,
  onAction,
}: {
  type?: DecisionType;
  title: string;
  whyNow: string;
  impact?: string;
  dueAt?: string | null;
  quality?: string;
  evidence?: EvidenceRecord[];
  actionLabel?: string;
  onAction?: () => void;
}) {
  const labels: Record<DecisionType, string> = { risk: '风险', opportunity: '机会', review: '待复核', blocked: '暂不可用' };
  return (
    <Card size="small" className={`decision-card decision-card--${type}`}>
      <div className="decision-card__topline">
        <Tag>{labels[type]}</Tag>
        <Tag color={quality === 'OK' ? 'green' : quality === 'PARTIAL' ? 'gold' : quality === 'UPSTREAM_ERROR' ? 'red' : undefined}>{quality || 'UNKNOWN'}</Tag>
        {impact ? <Typography.Text type="secondary">影响：{impact}</Typography.Text> : null}
      </div>
      <Typography.Title level={5}>{title}</Typography.Title>
      <Typography.Paragraph>{whyNow}</Typography.Paragraph>
      {evidence.length ? <div className="decision-card__evidence">{evidence.map((item, index) => <EvidenceChip key={item.id || index} evidence={item} />)}</div> : null}
      {evidence.map((item, index) => <Typography.Text type="secondary" className="decision-card__provenance" key={`provenance-${item.id || index}`}>{item.id || 'evidence'} · {item.source || 'UNKNOWN'} · {item.asOf || 'UNKNOWN'} · {item.quality || 'UNKNOWN'}</Typography.Text>)}
      <div className="decision-card__footer">
        <Typography.Text type="secondary">截至 {dueAt || 'UNKNOWN'} · 证据质量 {quality || 'UNKNOWN'}</Typography.Text>
        {actionLabel && onAction ? <Button type="primary" size="small" onClick={onAction}>{actionLabel}</Button> : null}
      </div>
    </Card>
  );
}
