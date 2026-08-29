import { Alert, Card, Col, List, Row, Space, Tag, Typography } from 'antd';

import { formatP1Metric, P1_DOMAINS, p1FundamentalMetrics } from '../../features/fundamentalMetrics';
import type { FundamentalsResponse } from '../../types/research';
import CitationDetails, { type CitationStatus } from '../CitationDetails';
import { useLanguage } from '../../i18n/LanguageContext';

const { Text } = Typography;

function citationStatus(flags: string[] | undefined, available: boolean, upstreamError: boolean): CitationStatus {
  if (upstreamError || flags?.includes('UPSTREAM_ERROR')) return 'UPSTREAM_ERROR';
  if (!available || flags?.includes('UNKNOWN')) return 'UNKNOWN';
  return flags?.length ? 'PARTIAL' : 'OK';
}

export default function FundamentalMetricsPanel({
  fundamentals,
  error,
}: {
  fundamentals: FundamentalsResponse | null;
  error?: string;
}) {
  const { lang, t } = useLanguage();
  const metrics = p1FundamentalMetrics(fundamentals?.items);
  const domainKeys = { '估值': 'valuation', '经营质量': 'quality', '偿债风险': 'solvency' } as const;

  return (
    <Card title={t('research.fundamentals.title')} className="surface-card" style={{ marginTop: 18 }}>
      {error ? (
        <Alert
          type="warning"
          showIcon
          message={t('research.fundamentals.unavailable')}
          description={error}
          style={{ marginBottom: 12 }}
        />
      ) : (
        <Alert
          type="info"
          showIcon
          message={t('research.fundamentals.policy')}
          style={{ marginBottom: 12 }}
        />
      )}
      <Row gutter={[12, 12]}>
        {P1_DOMAINS.map((domain) => (
          <Col xs={24} xl={8} key={domain}>
            <Card size="small" title={t(`research.fundamentals.domain.${domainKeys[domain]}`)} style={{ height: '100%' }}>
              <List
                size="small"
                dataSource={metrics.filter((metric) => metric.domain === domain)}
                renderItem={(metric) => (
                  <List.Item>
                    <div style={{ width: '100%' }}>
                      <Space wrap>
                        <Text strong>{t(`research.fundamentals.metric.${metric.key}.label`)}</Text>
                        {metric.item ? (
                          <Tag color={metric.item.components?.length ? 'purple' : 'green'}>
                            {t(metric.item.components?.length ? 'research.fundamentals.derived' : 'research.fundamentals.providerValue')}
                          </Tag>
                        ) : <Tag>UNKNOWN</Tag>}
                      </Space>
                      {metric.item ? (
                        <>
                          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 650 }}>{formatP1Metric(metric, lang === 'zh' ? 'zh-CN' : 'en-US')}</div>
                          <Text type="secondary" style={{ display: 'block' }}>{metric.formula ? t(`research.fundamentals.metric.${metric.key}.formula`) : t('research.fundamentals.providerReport')}</Text>
                          <Text type="secondary" style={{ display: 'block' }}>
                            {metric.item.source ?? metric.item.provider ?? fundamentals?.provider ?? t('research.fundamentals.unknownSource')} · {metric.item.period_type ?? t('research.fundamentals.unknownPeriod')} · {metric.item.as_of ?? t('research.fundamentals.unknownAsOf')}
                          </Text>
                          {(metric.item.quality_flags ?? []).map((flag) => <Tag key={flag} color="gold">{flag}</Tag>)}
                          <CitationDetails
                            status={citationStatus(metric.item.quality_flags, true, false)}
                            source={metric.item.source ?? fundamentals?.provider}
                            vendor={metric.item.provider ?? fundamentals?.provider}
                            asOf={metric.item.as_of}
                            periodType={metric.item.period_type}
                            currency={metric.item.currency ?? fundamentals?.currency}
                            adjustment={fundamentals?.adjustment}
                            frequency={fundamentals?.frequency}
                            qualityFlags={metric.item.quality_flags}
                            formula={metric.formula}
                            methodVersion={metric.item.methodology}
                          />
                        </>
                      ) : (
                        <>
                          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>{t(`research.fundamentals.metric.${metric.key}.reason`)}</Text>
                          <CitationDetails
                            status={citationStatus(fundamentals?.quality_flags, false, Boolean(error))}
                            source={fundamentals?.provider}
                            vendor={fundamentals?.provider}
                            asOf={fundamentals?.as_of}
                            periodType={null}
                            currency={fundamentals?.currency}
                            adjustment={fundamentals?.adjustment}
                            frequency={fundamentals?.frequency}
                            qualityFlags={error ? ['UPSTREAM_ERROR'] : fundamentals?.quality_flags}
                            formula={metric.formula ? t(`research.fundamentals.metric.${metric.key}.formula`) : undefined}
                          />
                        </>
                      )}
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        ))}
      </Row>
    </Card>
  );
}
