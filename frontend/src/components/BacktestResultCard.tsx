import { Card, Col, Collapse, Empty, Row, Statistic, Tag, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import { readChartTokens } from '../styles/themeTokens';
import { useLanguage } from '../i18n/LanguageContext';

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
  const { t } = useLanguage();
  const colors = readChartTokens();
  const strategyEquity = t('backtestCard.chart.strategy');
  const buyAndHold = t('backtestCard.chart.buyHold');
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, data: [strategyEquity, buyAndHold] },
    grid: { left: 48, right: 18, top: 34, bottom: 34 },
    xAxis: { type: 'category', data: data.map((point) => point.day), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: colors.grid } } },
    dataZoom: [{ type: 'inside' }],
    series: [
      { name: strategyEquity, type: 'line', symbol: 'none', data: data.map((point) => point.equity), lineStyle: { color: colors.primary, width: 2 }, areaStyle: { color: colors.primary, opacity: 0.16 } },
      { name: buyAndHold, type: 'line', symbol: 'none', data: (benchmark ?? []).map((point) => point.equity), lineStyle: { color: colors.unknown, width: 2 } },
    ],
  };
  return <ReactECharts option={option} style={{ height: 220 }} notMerge />;
}

export default function BacktestResultCard({ ticker, result }: BacktestResultCardProps) {
  const { t } = useLanguage();
  const { metrics } = result;
  const returnPositive = metrics.total_return_pct >= 0;
  const title = (
    <span>
      {t('backtestCard.title')} <Tag color="blue">{ticker}</Tag><Tag>{result.strategy}</Tag>
    </span>
  );

  return (
    <Card size="small" title={title} style={{ margin: '8px 48px 16px', maxWidth: 860 }}>
      <Row gutter={[16, 12]}>
        <Col xs={12} sm={6}>
          <Statistic title={t('backtestCard.metric.return')} value={metrics.total_return_pct} precision={2} suffix="%" valueStyle={{ color: returnPositive ? 'var(--fq-price-up)' : 'var(--fq-price-down)' }} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title={t('backtestCard.metric.sharpe')} value={metrics.sharpe_ratio} precision={3} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title={t('backtestCard.metric.drawdown')} value={metrics.max_drawdown_pct} precision={2} suffix="%" valueStyle={{ color: 'var(--fq-risk)' }} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title={t('backtestCard.metric.trades')} value={metrics.trade_count} />
        </Col>
      </Row>

      <Collapse
        defaultActiveKey={['equity']}
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'equity',
            label: t('backtestCard.equityTitle'),
            children: result.equity_curve.length > 0
              ? <EquityCurve data={result.equity_curve} benchmark={result.benchmark_curve} />
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('backtestCard.noEquity')} />,
          },
          {
            key: 'details',
            label: t('backtestCard.moreMetrics'),
            children: (
              <Row gutter={[16, 12]}>
                <Col span={8}><Text type="secondary">{t('backtestCard.metric.annualReturn')}</Text><br />{metrics.annual_return_pct.toFixed(2)}%</Col>
                <Col span={8}><Text type="secondary">{t('backtestCard.metric.winRate')}</Text><br />{metrics.win_rate_pct.toFixed(1)}%</Col>
                <Col span={8}><Text type="secondary">Sortino</Text><br />{metrics.sortino_ratio?.toFixed(3) ?? '—'}</Col>
                <Col span={8}><Text type="secondary">Calmar</Text><br />{metrics.calmar_ratio?.toFixed(3) ?? '—'}</Col>
                <Col span={8}><Text type="secondary">{t('backtestCard.metric.informationRatio')}</Text><br />{metrics.information_ratio?.toFixed(3) ?? '—'}</Col>
                <Col span={8}><Text type="secondary">{t('backtestCard.metric.profitFactor')}</Text><br />{metrics.profit_factor?.toFixed(3) ?? '—'}</Col>
                <Col span={8}><Text type="secondary">{t('backtestCard.chart.buyHold')}</Text><br />{result.buy_hold_return_pct.toFixed(2)}%</Col>
              </Row>
            ),
          },
        ]}
      />
      <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
        {t('backtestCard.period', { from: result.period.from, to: result.period.to, days: result.period.days })}
      </Text>
    </Card>
  );
}
