import { useState } from 'react';
import { Tag, Tooltip } from 'antd';
import { CheckOutlined, FunctionOutlined, QuestionOutlined, SplitCellsOutlined } from '@ant-design/icons';
import EvidenceDrawer, { evidenceKindLabel, type EvidenceKind, type EvidenceRecord } from './EvidenceDrawer';
import { useLanguage } from '../i18n/LanguageContext';

const iconMap = {
  FACT: <CheckOutlined />,
  INFERENCE: <SplitCellsOutlined />,
  MODEL_OUTPUT: <FunctionOutlined />,
  UNKNOWN: <QuestionOutlined />,
} satisfies Record<EvidenceKind, React.ReactNode>;

export default function EvidenceChip({ evidence, label }: { evidence: EvidenceRecord; label?: string }) {
  const { lang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const quality = evidence.quality ?? 'UNKNOWN';
  return (
    <>
      <Tooltip title={t('evidence.tooltip', { kind: evidenceKindLabel(evidence.kind, lang), source: evidence.source || t('evidence.sourceUnknown'), asOf: evidence.asOf || 'UNKNOWN' })}>
        <Tag
          role="button"
          tabIndex={0}
          className={`evidence-chip evidence-chip--${evidence.kind.toLowerCase()} evidence-chip--quality-${quality.toLowerCase()}`}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); }
          }}
          aria-label={t('evidence.openAria', { label: label || evidenceKindLabel(evidence.kind, lang) })}
        >
          {iconMap[evidence.kind]} <span>{label || evidence.kind}</span>
          {quality !== 'OK' ? <span className="evidence-chip__quality" aria-label={t('evidence.qualityAria', { quality })} /> : null}
        </Tag>
      </Tooltip>
      <EvidenceDrawer evidence={evidence} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
