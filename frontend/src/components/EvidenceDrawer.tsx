import { useId, useState } from 'react';
import { Button, Descriptions, Drawer, Space, Tag, Typography } from 'antd';
import CitationDetails, { type CitationStatus } from './CitationDetails';

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

const kindLabel: Record<EvidenceKind, string> = {
  FACT: '事实',
  INFERENCE: '推断',
  MODEL_OUTPUT: '模型结果',
  UNKNOWN: '未知',
};

const kindHelp: Record<EvidenceKind, string> = {
  FACT: '可由来源直接核验的事实',
  INFERENCE: '基于已知事实的解释或推断',
  MODEL_OUTPUT: '由模型、回测或计算方法产生的结果',
  UNKNOWN: '当前尚无可靠来源，暂不下结论',
};

export function evidenceKindLabel(kind: EvidenceKind): string {
  return `${kindLabel[kind]} · ${kind}`;
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
  const titleId = useId();
  const [professional, setProfessional] = useState(false);
  if (!evidence) return null;
  const quality = evidence.quality ?? 'UNKNOWN';
  return (
    <Drawer
      title={<span id={titleId}>{evidenceKindLabel(evidence.kind)}</span>}
      open={open}
      onClose={onClose}
      width={professional ? 560 : 440}
      className="evidence-drawer"
      aria-labelledby={titleId}
    >
      <div className="evidence-drawer__status">
        <Tag className={`evidence-chip evidence-chip--${evidence.kind.toLowerCase()}`}>{evidence.kind}</Tag>
        <Tag color={quality === 'OK' ? 'green' : quality === 'UPSTREAM_ERROR' ? 'red' : quality === 'PARTIAL' ? 'gold' : undefined}>{quality}</Tag>
      </div>
      <Typography.Title level={5}>{evidence.title || '证据详情'}</Typography.Title>
      <Typography.Paragraph>{evidence.detail || kindHelp[evidence.kind]}</Typography.Paragraph>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="来源">{evidence.source || 'UNKNOWN'}</Descriptions.Item>
        <Descriptions.Item label="截至时间">{evidence.asOf || 'UNKNOWN'}</Descriptions.Item>
        <Descriptions.Item label="质量">{quality}</Descriptions.Item>
      </Descriptions>
      <Button className="evidence-drawer__toggle" type="link" onClick={() => setProfessional((value) => !value)}>
        {professional ? '收起计算与技术详情' : '查看计算与技术详情'}
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
          <Typography.Title level={5}>Tool log</Typography.Title>
          <Typography.Paragraph type="secondary">{evidence.toolLog || 'UNKNOWN · 暂无可展示的工具日志'}</Typography.Paragraph>
        </div>
      ) : null}
      <Space className="evidence-drawer__hint" size={6}>
        <Typography.Text type="secondary">{kindHelp[evidence.kind]}</Typography.Text>
      </Space>
    </Drawer>
  );
}
