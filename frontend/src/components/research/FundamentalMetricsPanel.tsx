import { Alert, Card, Col, List, Row, Space, Tag, Typography } from 'antd';

import { formatP1Metric, P1_DOMAINS, p1FundamentalMetrics } from '../../features/fundamentalMetrics';
import type { FundamentalsResponse } from '../../types/research';
import CitationDetails, { type CitationStatus } from '../CitationDetails';

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
  const metrics = p1FundamentalMetrics(fundamentals?.items);

  return (
    <Card title="P1 基本面与估值可用性" className="surface-card" style={{ marginTop: 18 }}>
      {error ? (
        <Alert
          type="warning"
          showIcon
          message="真实基本面当前不可用；P1 指标保持 UNKNOWN"
          description={error}
          style={{ marginBottom: 12 }}
        />
      ) : (
        <Alert
          type="info"
          showIcon
          message="只展示提供方原值或兼容真实字段的确定性派生值；缺少必要字段时不估算。"
          style={{ marginBottom: 12 }}
        />
      )}
      <Row gutter={[12, 12]}>
        {P1_DOMAINS.map((domain) => (
          <Col xs={24} xl={8} key={domain}>
            <Card size="small" title={domain} style={{ height: '100%' }}>
              <List
                size="small"
                dataSource={metrics.filter((metric) => metric.domain === domain)}
                renderItem={(metric) => (
                  <List.Item>
                    <div style={{ width: '100%' }}>
                      <Space wrap>
                        <Text strong>{metric.label}</Text>
                        {metric.item ? (
                          <Tag color={metric.item.components?.length ? 'purple' : 'green'}>
                            {metric.item.components?.length ? '确定性派生' : '提供方原值'}
                          </Tag>
                        ) : <Tag>UNKNOWN</Tag>}
                      </Space>
                      {metric.item ? (
                        <>
                          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 650 }}>{formatP1Metric(metric)}</div>
                          <Text type="secondary" style={{ display: 'block' }}>{metric.formula ?? '提供方报告值'}</Text>
                          <Text type="secondary" style={{ display: 'block' }}>
                            {metric.item.source ?? metric.item.provider ?? fundamentals?.provider ?? '来源未知'} · {metric.item.period_type ?? '期间未知'} · {metric.item.as_of ?? '截止未知'}
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
                          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>{metric.unavailableReason}</Text>
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
                            formula={metric.formula}
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
