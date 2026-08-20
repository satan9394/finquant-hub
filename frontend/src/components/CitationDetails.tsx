import { Descriptions, Space, Tag, Typography } from 'antd';

const { Text } = Typography;

export type CitationStatus = 'OK' | 'PARTIAL' | 'UNKNOWN' | 'UPSTREAM_ERROR';

type CitationDetailsProps = {
  status: CitationStatus;
  source?: string | null;
  vendor?: string | null;
  asOf?: string | null;
  periodType?: string | null;
  currency?: string | null;
  adjustment?: string | null;
  frequency?: string | null;
  qualityFlags?: string[];
  formula?: string | null;
  methodVersion?: string | null;
  inputEvidenceIds?: string[];
};

const statusCopy: Record<CitationStatus, { label: string; color: string }> = {
  OK: { label: '数据正常', color: 'green' },
  PARTIAL: { label: '部分证据', color: 'gold' },
  UNKNOWN: { label: 'UNKNOWN', color: 'default' },
  UPSTREAM_ERROR: { label: '上游错误', color: 'red' },
};

const known = (value?: string | null) => value?.trim() || 'UNKNOWN';

export default function CitationDetails({
  status,
  source,
  vendor,
  asOf,
  periodType,
  currency,
  adjustment,
  frequency,
  qualityFlags = [],
  formula,
  methodVersion,
  inputEvidenceIds = [],
}: CitationDetailsProps) {
  const state = statusCopy[status];
  return (
    <details className="citation-details">
      <summary>
        <Space size={6} wrap>
          <Text>查看来源/计算方法</Text>
          <Tag color={state.color}>{state.label}</Tag>
        </Space>
      </summary>
      <Descriptions size="small" column={1} bordered style={{ marginTop: 8 }}>
        <Descriptions.Item label="来源">{known(source)}</Descriptions.Item>
        <Descriptions.Item label="提供方">{known(vendor)}</Descriptions.Item>
        <Descriptions.Item label="截止时间">{known(asOf)}</Descriptions.Item>
        <Descriptions.Item label="期间">{known(periodType)}</Descriptions.Item>
        <Descriptions.Item label="币种">{known(currency)}</Descriptions.Item>
        <Descriptions.Item label="复权/频率">{known(adjustment)} / {known(frequency)}</Descriptions.Item>
        <Descriptions.Item label="质量状态">
          {qualityFlags.length ? qualityFlags.map((flag) => <Tag key={flag} color="gold">{flag}</Tag>) : '无附加标记'}
        </Descriptions.Item>
        <Descriptions.Item label="公式">{known(formula)}</Descriptions.Item>
        <Descriptions.Item label="方法版本">{known(methodVersion)}</Descriptions.Item>
        <Descriptions.Item label="输入证据">
          {inputEvidenceIds.length ? inputEvidenceIds.join(', ') : 'UNKNOWN'}
        </Descriptions.Item>
      </Descriptions>
    </details>
  );
}
