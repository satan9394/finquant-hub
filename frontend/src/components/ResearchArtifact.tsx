import { Card, Space, Tag, Typography } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import EvidenceChip from './EvidenceChip';
import type { EvidenceRecord } from './EvidenceDrawer';
import { useLanguage } from '../i18n/LanguageContext';

export type ArtifactType = 'Company Brief' | 'Research Report' | 'Evidence' | 'Thesis' | 'Strategy' | 'Risk List';
export type ArtifactState = 'draft' | 'streaming' | 'partial' | 'ready' | 'stale' | 'failed';

export default function ResearchArtifact({
  type = 'Research Report',
  state = 'ready',
  title,
  summary,
  evidence = [],
  asOf,
  version,
  actions,
  children,
}: {
  type?: ArtifactType;
  state?: ArtifactState;
  title: string;
  summary?: string;
  evidence?: EvidenceRecord[];
  asOf?: string | null;
  version?: string | null;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <Card className={`research-artifact research-artifact--${state}`} size="small">
      <header className="research-artifact__header">
        <Space size={8} wrap>
          <FileTextOutlined className="research-artifact__icon" />
          <Typography.Text strong>{t(`artifact.type.${type}`)}</Typography.Text>
          <Tag>{t(`artifact.state.${state}`)}</Tag>
        </Space>
        {actions ? <div className="research-artifact__actions">{actions}</div> : null}
      </header>
      <Typography.Title level={5} className="research-artifact__title">{title}</Typography.Title>
      {summary ? <Typography.Paragraph className="research-artifact__summary">{summary}</Typography.Paragraph> : null}
      {children ? <div className="research-artifact__body">{children}</div> : null}
      {evidence.length ? (
        <div className="research-artifact__evidence" aria-label={t('artifact.evidenceAria')}>
          {evidence.slice(0, 3).map((item, index) => <EvidenceChip key={item.id || `${item.kind}-${index}`} evidence={item} />)}
        </div>
      ) : null}
      <footer className="research-artifact__footer">
        <Typography.Text type="secondary">{t('artifact.footer', { version: version || t('artifact.state.draft'), asOf: asOf || 'UNKNOWN' })}</Typography.Text>
      </footer>
    </Card>
  );
}
