import { Descriptions, Space, Tag, Typography } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

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
  OK: { label: 'OK', color: 'green' },
  PARTIAL: { label: 'PARTIAL', color: 'gold' },
  UNKNOWN: { label: 'UNKNOWN', color: 'default' },
  UPSTREAM_ERROR: { label: 'UPSTREAM_ERROR', color: 'red' },
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
  const { t } = useLanguage();
  const state = statusCopy[status];
  return (
    <details className="citation-details">
      <summary>
        <Space size={6} wrap>
          <Text>{t('citation.open')}</Text>
          <Tag color={state.color}>{t(`citation.status.${state.label}`)}</Tag>
        </Space>
      </summary>
      <Descriptions size="small" column={1} bordered style={{ marginTop: 8 }}>
        <Descriptions.Item label={t('citation.source')}>{known(source)}</Descriptions.Item>
        <Descriptions.Item label={t('citation.vendor')}>{known(vendor)}</Descriptions.Item>
        <Descriptions.Item label={t('citation.asOf')}>{known(asOf)}</Descriptions.Item>
        <Descriptions.Item label={t('citation.period')}>{known(periodType)}</Descriptions.Item>
        <Descriptions.Item label={t('citation.currency')}>{known(currency)}</Descriptions.Item>
        <Descriptions.Item label={t('citation.adjustmentFrequency')}>{known(adjustment)} / {known(frequency)}</Descriptions.Item>
        <Descriptions.Item label={t('citation.quality')}>
          {qualityFlags.length ? qualityFlags.map((flag) => <Tag key={flag} color="gold">{flag}</Tag>) : t('citation.noFlags')}
        </Descriptions.Item>
        <Descriptions.Item label={t('citation.formula')}>{known(formula)}</Descriptions.Item>
        <Descriptions.Item label={t('citation.methodVersion')}>{known(methodVersion)}</Descriptions.Item>
        <Descriptions.Item label={t('citation.inputs')}>
          {inputEvidenceIds.length ? inputEvidenceIds.join(', ') : 'UNKNOWN'}
        </Descriptions.Item>
      </Descriptions>
    </details>
  );
}
