import { useState } from 'react';
import { Tag, Tooltip } from 'antd';
import { CheckOutlined, FunctionOutlined, QuestionOutlined, SplitCellsOutlined } from '@ant-design/icons';
import EvidenceDrawer, { evidenceKindLabel, type EvidenceKind, type EvidenceRecord } from './EvidenceDrawer';

const iconMap = {
  FACT: <CheckOutlined />,
  INFERENCE: <SplitCellsOutlined />,
  MODEL_OUTPUT: <FunctionOutlined />,
  UNKNOWN: <QuestionOutlined />,
} satisfies Record<EvidenceKind, React.ReactNode>;

export default function EvidenceChip({ evidence, label }: { evidence: EvidenceRecord; label?: string }) {
  const [open, setOpen] = useState(false);
  const quality = evidence.quality ?? 'UNKNOWN';
  return (
    <>
      <Tooltip title={`${evidenceKindLabel(evidence.kind)} · ${evidence.source || '来源 UNKNOWN'} · 截至 ${evidence.asOf || 'UNKNOWN'}`}>
        <Tag
          role="button"
          tabIndex={0}
          className={`evidence-chip evidence-chip--${evidence.kind.toLowerCase()} evidence-chip--quality-${quality.toLowerCase()}`}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); }
          }}
          aria-label={`${label || evidenceKindLabel(evidence.kind)}，点击查看证据`}
        >
          {iconMap[evidence.kind]} <span>{label || evidence.kind}</span>
          {quality !== 'OK' ? <span className="evidence-chip__quality" aria-label={`质量 ${quality}`} /> : null}
        </Tag>
      </Tooltip>
      <EvidenceDrawer evidence={evidence} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
