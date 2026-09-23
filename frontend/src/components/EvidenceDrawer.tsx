import { useId, useState } from 'react';
import { Button, Descriptions, Drawer, Space, Tag, Typography } from 'antd';
import CitationDetails, { type CitationStatus } from './CitationDetails';
import { useLanguage } from '../i18n/LanguageContext';
import { translate, type Language } from '../i18n';

export type EvidenceKind = 'FACT' | 'INFERENCE' | 'MODEL_OUTPUT' | 'UNKNOWN';

export interface EvidenceRecord {
  id?: string;
  kind: EvidenceKind;
  quality?: CitationStatus;
  title?: string;
  detail?: string;
  source?: string | null;
  provider?: string | null;
  asOf?: string | null;
  periodType?: string | null;
  formula?: string | null;
  inputEvidenceIds?: string[];
  toolLog?: string | null;
}

export function evidenceKindLabel(kind: EvidenceKind, lang: Language = 'zh'): string {
  return `${translate(lang, `evidence.kind.${kind}`)} · ${kind}`;
}

export default function EvidenceDrawer({
  evidence,
  open,
  onClose,
}: {
  evidence: EvidenceRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const { lang, t } = useLanguage();
  const titleId = useId();
  const [professional, setProfessional] = useState(false);
  if (!evidence) return null;
  const quality = evidence.quality ?? 'UNKNOWN';
  return (
    <Drawer
      title={<span id={titleId}>{evidenceKindLabel(evidence.kind, lang)}</span>}
      open={open}
      onClose={onClose}
      width={professional ? 560 : 440}
      className="evidence-drawer"
      aria-labelledby={titleId}
      // Astra B3：抽屉默认 portal 到 body（脱离 .app-theme--dark 主题子树），
      // 自定义 CSS 吃到的是 :root 亮色 token，与 AntD 暗色算法混搭。挂回主题根。
      getContainer={() => document.querySelector<HTMLElement>('.app-theme') ?? document.body}
    >
      <div className="evidence-drawer__status">
        <Tag className={`evidence-chip evidence-chip--${evidence.kind.toLowerCase()}`}>{evidence.kind}</Tag>
        <Tag color={quality === 'OK' ? 'green' : quality === 'UPSTREAM_ERROR' ? 'red' : quality === 'PARTIAL' ? 'gold' : undefined}>{quality}</Tag>
      </div>
      <Typography.Title level={5}>{evidence.title || t('evidence.details')}</Typography.Title>
      <Typography.Paragraph>{evidence.detail || t(`evidence.help.${evidence.kind}`)}</Typography.Paragraph>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t('evidence.source')}>{evidence.source || 'UNKNOWN'}</Descriptions.Item>
        <Descriptions.Item label={t('evidence.asOf')}>{evidence.asOf || 'UNKNOWN'}</Descriptions.Item>
        <Descriptions.Item label={t('evidence.quality')}>{quality}</Descriptions.Item>
      </Descriptions>
      <Button className="evidence-drawer__toggle" type="link" onClick={() => setProfessional((value) => !value)}>
        {t(professional ? 'evidence.hideTechnical' : 'evidence.showTechnical')}
      </Button>
      {professional ? (
        <div className="evidence-drawer__professional">
          <CitationDetails
            status={quality}
            source={evidence.source}
            vendor={evidence.provider}
            asOf={evidence.asOf}
            periodType={evidence.periodType}
            formula={evidence.formula}
            inputEvidenceIds={evidence.inputEvidenceIds}
          />
          <Typography.Title level={5}>{t('evidence.toolLog')}</Typography.Title>
          <Typography.Paragraph type="secondary">{evidence.toolLog || t('evidence.noToolLog')}</Typography.Paragraph>
        </div>
      ) : null}
      <Space className="evidence-drawer__hint" size={6}>
        <Typography.Text type="secondary">{t(`evidence.help.${evidence.kind}`)}</Typography.Text>
      </Space>
    </Drawer>
  );
}
