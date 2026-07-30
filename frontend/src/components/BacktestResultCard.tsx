import { useEffect, useRef } from 'react';
import { Card, Col, Collapse, Empty, Row, Statistic, Tag, Typography } from 'antd';
import { createChart, type IChartApi } from 'lightweight-charts';

const { Text } = Typography;

export interface BacktestResult {
  id: number;
  strategy: string;
  period: { from: string; to: string; days: number };
  metrics: {
    total_return_pct: number;
    sharpe_ratio: number;
    max_drawdown_pct: number;
    annual_return_pct: number;
    win_rate_pct: number;
    trade_count: number;
  };
  buy_hold_return_pct: number;
  trades: Array<{ entry_day: string; exit_day: string; entry_price: number; exit_price: number; return_pct: number }>;
  equity_curve: Array<{ day: string; equity: number; signal: number; position: number }>;
}

interface BacktestResultCardProps {
  ticker: string;
  result: BacktestResult;
}

function EquityCurve({ data }: { data: BacktestResult['equity_curve'] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.length === 0) return;

    const chart: IChartApi = createChart(container, {
      width: Math.max(1, container.clientWidth),
      height: 220,
      layout: { background: { color: '#ffffff' }, textColor: '#666' },
      grid: { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } },
      rightPriceScale: { borderColor: '#d9d9d9' },
      timeScale: { borderColor: '#d9d9d9' },
    });
    const series = chart.addAreaSeries({
      lineColor: '#1677ff',
      topColor: 'rgba(22, 119, 255, 0.35)',
      bottomColor: 'rgba(22, 119, 255, 0.04)',
      lineWidth: 2,
    });
    series.setData(data.map((point) => ({ time: point.day, value: point.equity })));
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(([entry]) => {
      chart.resize(Math.max(1, Math.floor(entry.contentRect.width)), 220);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [data]);

  return <div ref={containerRef} style={{ width: '100%', minHeight: 220 }} />;
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
            label: '权益曲线',
            children: result.equity_curve.length > 0
              ? <EquityCurve data={result.equity_curve} />
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可展示的权益曲线" />,
          },
          {
            key: 'details',
            label: '更多指标',
            children: (
              <Row gutter={[16, 12]}>
                <Col span={8}><Text type="secondary">年化收益</Text><br />{metrics.annual_return_pct.toFixed(2)}%</Col>
                <Col span={8}><Text type="secondary">胜率</Text><br />{metrics.win_rate_pct.toFixed(1)}%</Col>
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
