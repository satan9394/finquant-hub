import { Alert, Card, Col, Empty, Row, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { CapitalFlowItem, MarketPulseResponse, MarketSector, WeeklyMarketMover } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import type { Language } from '../i18n';

const { Text } = Typography;

type Translate = (key: string, values?: Record<string, string | number>) => string;

function amount(value: number | null | undefined, lang: Language, t: Translate): string {
  if (value == null || !Number.isFinite(value)) return t('today.brief.unavailableValue');
  const absolute = Math.abs(value);
  const unit = lang === 'zh'
    ? t(absolute >= 100000000 ? 'today.brief.hundredMillion' : 'today.brief.tenThousand', { value: absolute >= 100000000 ? (value / 100000000).toFixed(2) : (value / 10000).toFixed(1) })
    : t(absolute >= 1000000000 ? 'today.brief.billion' : 'today.brief.million', { value: absolute >= 1000000000 ? (value / 1000000000).toFixed(2) : (value / 1000000).toFixed(1) });
  return `${value >= 0 ? '+' : ''}${unit}`;
}

function change(value: number | null | undefined, t: Translate): string {
  return value == null || !Number.isFinite(value) ? t('today.brief.unavailableValue') : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function strongestIndustry(items?: MarketSector[]): MarketSector | null {
  return (items ?? []).filter((item) => item.change_percent != null).sort((a, b) => (b.change_percent ?? -Infinity) - (a.change_percent ?? -Infinity))[0] ?? null;
}

function strongestFlow(items?: CapitalFlowItem[]): CapitalFlowItem | null {
  return (items ?? []).filter((item) => item.main_net_inflow != null).sort((a, b) => (b.main_net_inflow ?? -Infinity) - (a.main_net_inflow ?? -Infinity))[0] ?? null;
}

export default function MarketBrief({ data, loading = false, error = '' }: { data: MarketPulseResponse | null; loading?: boolean; error?: string }) {
  const { lang, t } = useLanguage();
  const industry = strongestIndustry(data?.sections.industry.items);
  const flow = strongestFlow(data?.sections.stock_flow.items);
  const movers: WeeklyMarketMover[] = (data?.sections.weekly.items ?? []).slice(0, 5);
  const breadth = data?.sections.breadth;

  return (
    <Card className="market-brief" title={<span id="market-brief-title">{t('today.brief.title')}</span>} loading={loading}>
      {error ? <Alert type="warning" showIcon message={t('today.brief.unavailable')} description={error} /> : null}
      {data ? (
        <>
          <div className="market-brief__meta">
            <Space wrap size={8}>
              <Tag color={data.status === 'ok' ? 'green' : 'orange'}>{data.status.toUpperCase()}</Tag>
              <Text type="secondary">as_of <span data-testid="market-brief-as-of">{data.as_of || 'UNKNOWN'}</span></Text>
              <Text type="secondary">{t('today.brief.source')}<span data-testid="market-brief-sources">{data.sources.length ? data.sources.join(lang === 'zh' ? '、' : ', ') : 'UNKNOWN'}</span></Text>
            </Space>
            <Text type="secondary">{t('today.brief.scope')}</Text>
          </div>
          <Row gutter={[12, 12]} className="market-brief__facts">
            <Col xs={24} sm={8}><Text type="secondary">{t('today.brief.breadth')}</Text><div className="market-brief__value">{breadth?.status === 'ok' && breadth.advancers != null ? t('today.brief.breadthValue', { up: breadth.advancers, down: breadth.decliners ?? t('today.brief.unknown'), flat: breadth.unchanged ?? t('today.brief.unknown') }) : t('today.brief.unavailableValue')}</div></Col>
            <Col xs={24} sm={8}><Text type="secondary">{t('today.brief.strongestIndustry')}</Text><div className="market-brief__value">{industry ? <>{industry.name} <Text type="secondary">{change(industry.change_percent, t)}</Text></> : t('today.brief.unavailableValue')}</div></Col>
            <Col xs={24} sm={8}><Text type="secondary">{t('today.brief.mainInflow')}</Text><div className="market-brief__value">{flow ? <>{flow.name} <Text type="secondary">{amount(flow.main_net_inflow, lang, t)}</Text></> : t('today.brief.unavailableValue')}</div></Col>
          </Row>
          <div className="market-brief__movers">
            <Text strong>{t('today.brief.movers')}</Text>
            {movers.length ? <div className="market-brief__mover-list">{movers.map((item) => <Link className="market-brief__mover" key={item.code} to={`/research/${encodeURIComponent(item.code)}`}><span>{item.name} <Text type="secondary">{item.code}</Text></span><strong>{change(item.weekly_change_percent, t)}</strong></Link>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('today.brief.unavailableValue')} />}
          </div>
        </>
      ) : <Text type="secondary">{t('today.brief.none')}</Text>}
    </Card>
  );
}
