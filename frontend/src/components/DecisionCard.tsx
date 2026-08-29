import { Button, Card, Space, Tag, Typography } from 'antd';
import EvidenceChip from './EvidenceChip';
import type { EvidenceRecord } from './EvidenceDrawer';
import { useLanguage } from '../i18n/LanguageContext';

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
  const { t } = useLanguage();
  return (
    <Card size="small" className={`decision-card decision-card--${type}`}>
      <div className="decision-card__topline">
        <Tag>{t(`decision.type.${type}`)}</Tag>
        <Tag color={quality === 'OK' ? 'green' : quality === 'PARTIAL' ? 'gold' : quality === 'UPSTREAM_ERROR' ? 'red' : undefined}>{quality || 'UNKNOWN'}</Tag>
        {impact ? <Typography.Text type="secondary">{t('decision.impact', { impact })}</Typography.Text> : null}
      </div>
      <Typography.Title level={5}>{title}</Typography.Title>
      <Typography.Paragraph>{whyNow}</Typography.Paragraph>
      {evidence.length ? <div className="decision-card__evidence">{evidence.map((item, index) => <EvidenceChip key={item.id || index} evidence={item} />)}</div> : null}
      {evidence.map((item, index) => <Typography.Text type="secondary" className="decision-card__provenance" key={`provenance-${item.id || index}`}>{item.id || 'evidence'} · {item.source || 'UNKNOWN'} · {item.asOf || 'UNKNOWN'} · {item.quality || 'UNKNOWN'}</Typography.Text>)}
      <div className="decision-card__footer">
        <Typography.Text type="secondary">{t('decision.footer', { dueAt: dueAt || 'UNKNOWN', quality: quality || 'UNKNOWN' })}</Typography.Text>
        {actionLabel && onAction ? <Button type="primary" size="small" onClick={onAction}>{actionLabel}</Button> : null}
      </div>
    </Card>
  );
}
