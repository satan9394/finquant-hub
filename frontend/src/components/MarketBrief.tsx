import { Alert, Card, Col, Empty, Row, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { CapitalFlowItem, MarketPulseResponse, MarketSector, WeeklyMarketMover } from '../types';

const { Text } = Typography;

function amount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '暂不可用';
  const absolute = Math.abs(value);
  const unit = absolute >= 100000000 ? `${(value / 100000000).toFixed(2)} 亿` : `${(value / 10000).toFixed(1)} 万`;
  return `${value >= 0 ? '+' : ''}${unit}`;
}

function change(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '暂不可用' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function strongestIndustry(items?: MarketSector[]): MarketSector | null {
  return (items ?? []).filter((item) => item.change_percent != null).sort((a, b) => (b.change_percent ?? -Infinity) - (a.change_percent ?? -Infinity))[0] ?? null;
}

function strongestFlow(items?: CapitalFlowItem[]): CapitalFlowItem | null {
  return (items ?? []).filter((item) => item.main_net_inflow != null).sort((a, b) => (b.main_net_inflow ?? -Infinity) - (a.main_net_inflow ?? -Infinity))[0] ?? null;
}

export default function MarketBrief({ data, loading = false, error = '' }: { data: MarketPulseResponse | null; loading?: boolean; error?: string }) {
  const industry = strongestIndustry(data?.sections.industry.items);
  const flow = strongestFlow(data?.sections.stock_flow.items);
  const movers: WeeklyMarketMover[] = (data?.sections.weekly.items ?? []).slice(0, 5);
  const breadth = data?.sections.breadth;

  return (
    <Card className="market-brief" title={<span id="market-brief-title">真实市场简报</span>} loading={loading}>
      {error ? <Alert type="warning" showIcon message="市场简报暂时不可用" description={error} /> : null}
      {data ? (
        <>
          <div className="market-brief__meta">
            <Space wrap size={8}>
              <Tag color={data.status === 'ok' ? 'green' : 'orange'}>{data.status.toUpperCase()}</Tag>
              <Text type="secondary">as_of <span data-testid="market-brief-as-of">{data.as_of || 'UNKNOWN'}</span></Text>
              <Text type="secondary">来源：<span data-testid="market-brief-sources">{data.sources.length ? data.sources.join('、') : 'UNKNOWN'}</span></Text>
            </Space>
            <Text type="secondary">公开市场维度 · 仅展示当前返回值</Text>
          </div>
          <Row gutter={[12, 12]} className="market-brief__facts">
            <Col xs={24} sm={8}><Text type="secondary">市场广度</Text><div className="market-brief__value">{breadth?.status === 'ok' && breadth.advancers != null ? `${breadth.advancers} 涨 / ${breadth.decliners ?? '未知'} 跌 / ${breadth.unchanged ?? '未知'} 平` : '暂不可用'}</div></Col>
            <Col xs={24} sm={8}><Text type="secondary">最强行业</Text><div className="market-brief__value">{industry ? <>{industry.name} <Text type="secondary">{change(industry.change_percent)}</Text></> : '暂不可用'}</div></Col>
            <Col xs={24} sm={8}><Text type="secondary">主力流入</Text><div className="market-brief__value">{flow ? <>{flow.name} <Text type="secondary">{amount(flow.main_net_inflow)}</Text></> : '暂不可用'}</div></Col>
          </Row>
          <div className="market-brief__movers">
            <Text strong>异动标的</Text>
            {movers.length ? <div className="market-brief__mover-list">{movers.map((item) => <Link className="market-brief__mover" key={item.code} to={`/research/${encodeURIComponent(item.code)}`}><span>{item.name} <Text type="secondary">{item.code}</Text></span><strong>{change(item.weekly_change_percent)}</strong></Link>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂不可用" />}
          </div>
        </>
      ) : <Text type="secondary">暂无可审计的市场简报</Text>}
    </Card>
  );
}
