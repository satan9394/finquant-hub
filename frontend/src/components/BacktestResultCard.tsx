import { Card, Col, Collapse, Empty, Row, Statistic, Tag, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';

const { Text } = Typography;

export interface BacktestResult {
  id: number;
  strategy: string;
  period: { from: string; to: string; days: number };
  metrics: {
    total_return_pct: number;
    sharpe_ratio: number;
    sortino_ratio?: number | null;
    calmar_ratio?: number | null;
    information_ratio?: number | null;
    profit_factor?: number | null;
    max_drawdown_pct: number;
    annual_return_pct: number;
    win_rate_pct: number;
    trade_count: number;
  };
  buy_hold_return_pct: number;
  trades: Array<{ entry_day: string; exit_day: string; entry_price: number; exit_price: number; return_pct: number }>;
  equity_curve: Array<{ day: string; equity: number; signal: number; position: number }>;
  benchmark_curve?: Array<{ day: string; equity: number }>;
}

interface BacktestResultCardProps {
  ticker: string;
  result: BacktestResult;
}

function EquityCurve({ data, benchmark }: {
  data: BacktestResult['equity_curve'];
  benchmark: BacktestResult['benchmark_curve'];
}) {
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, data: ['策略净值', '买入持有'] },
    grid: { left: 48, right: 18, top: 34, bottom: 34 },
    xAxis: { type: 'category', data: data.map((point) => point.day), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#f0f0f0' } } },
    dataZoom: [{ type: 'inside' }],
    series: [
      { name: '策略净值', type: 'line', symbol: 'none', data: data.map((point) => point.equity), lineStyle: { color: '#1677ff', width: 2 }, areaStyle: { color: 'rgba(22,119,255,.16)' } },
      { name: '买入持有', type: 'line', symbol: 'none', data: (benchmark ?? []).map((point) => point.equity), lineStyle: { color: '#8c8c8c', width: 2 } },
    ],
  };
  return <ReactECharts option={option} style={{ height: 220 }} notMerge />;
}

export default function BacktestResultCard({ ticker, result }: BacktestResultCardProps) {
  const { metrics } = result;
  const returnPositive = metrics.total_return_pct >= 0;
  const title = (
    <span>
      回测结果 <Tag color="blue">{ticker}</Tag><Tag>{result.strategy}</Tag>
    </span>
  );

  return (
    <Card size="small" title={title} style={{ margin: '8px 48px 16px', maxWidth: 860 }}>
      <Row gutter={[16, 12]}>
        <Col xs={12} sm={6}>
          <Statistic title="收益率" value={metrics.total_return_pct} precision={2} suffix="%" valueStyle={{ color: returnPositive ? '#3f8600' : '#cf1322' }} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="夏普比率" value={metrics.sharpe_ratio} precision={3} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="最大回撤" value={metrics.max_drawdown_pct} precision={2} suffix="%" valueStyle={{ color: '#cf1322' }} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="交易次数" value={metrics.trade_count} />
        </Col>
      </Row>

      <Collapse
        defaultActiveKey={['equity']}
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'equity',
            label: '策略权益 vs. 买入持有基准',
            children: result.equity_curve.length > 0
              ? <EquityCurve data={result.equity_curve} benchmark={result.benchmark_curve} />
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可展示的权益曲线" />,
          },
          {
            key: 'details',
            label: '更多指标',
            children: (
              <Row gutter={[16, 12]}>
                <Col span={8}><Text type="secondary">年化收益</Text><br />{metrics.annual_return_pct.toFixed(2)}%</Col>
                <Col span={8}><Text type="secondary">胜率</Text><br />{metrics.win_rate_pct.toFixed(1)}%</Col>
                <Col span={8}><Text type="secondary">Sortino</Text><br />{metrics.sortino_ratio?.toFixed(3) ?? '—'}</Col>
                <Col span={8}><Text type="secondary">Calmar</Text><br />{metrics.calmar_ratio?.toFixed(3) ?? '—'}</Col>
                <Col span={8}><Text type="secondary">信息比率</Text><br />{metrics.information_ratio?.toFixed(3) ?? '—'}</Col>
                <Col span={8}><Text type="secondary">盈亏比</Text><br />{metrics.profit_factor?.toFixed(3) ?? '—'}</Col>
                <Col span={8}><Text type="secondary">买入持有</Text><br />{result.buy_hold_return_pct.toFixed(2)}%</Col>
              </Row>
            ),
          },
        ]}
      />
      <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
        回测区间：{result.period.from} 至 {result.period.to}（{result.period.days} 个交易日）
      </Text>
    </Card>
  );
}
