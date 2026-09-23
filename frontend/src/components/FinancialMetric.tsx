import { Tooltip, Typography } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

export type FinancialMetricQuality = 'OK' | 'PARTIAL' | 'UNKNOWN' | 'UPSTREAM_ERROR' | 'LOADING';

export default function FinancialMetric({
  label,
  value,
  unit,
  period,
  asOf,
  quality = 'OK',
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  period?: string;
  asOf?: string | null;
  quality?: FinancialMetricQuality;
  tone?: 'neutral' | 'up' | 'down' | 'risk' | 'opportunity';
  hint?: string;
}) {
  const { t } = useLanguage();
  const display = quality === 'LOADING' ? t('financialMetric.loading') : value == null || value === '' ? t('financialMetric.unknown') : String(value);
  const content = (
    <div className={`financial-metric financial-metric--${tone} financial-metric--${quality.toLowerCase()}`}>
      <Typography.Text className="financial-metric__label">{label}</Typography.Text>
      <div className="financial-metric__value">{display}<small>{unit}</small></div>
      <Typography.Text type="secondary">{period || t('financialMetric.periodUnknown')} · {asOf || t('financialMetric.asOfUnknown')}</Typography.Text>
      {quality !== 'OK' ? <span className="financial-metric__quality">{quality}</span> : null}
    </div>
  );
  return hint ? <Tooltip title={hint}>{content}</Tooltip> : content;
}
