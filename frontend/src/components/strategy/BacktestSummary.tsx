import { Alert, Card, Col, Collapse, List, Row, Space, Statistic, Tag, Typography } from 'antd';

import { interpretBacktest, rankBacktestWarnings } from '../../features/backtest/interpretation';
import type { BacktestRun } from '../../types/research';
import { useLanguage } from '../../i18n/LanguageContext';
import FinancialMetric, { type FinancialMetricQuality } from '../FinancialMetric';

const { Text } = Typography;
// ②-E：空值原始直传——pct() 遇 null 返回 null，由 FinancialMetric 显示层承接 unknown 占位；
// 需要稳定字符串文本处（Statistic/拼接）用 pctText() 兜底 '—'。
const pct = (value: number | null | undefined): string | null => value == null ? null : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
const pctText = (value: number | null | undefined): string => pct(value) ?? '—';

export default function BacktestSummary({ run }: { run: BacktestRun }) {
  const { t } = useLanguage();
  if (!run.metrics) return null;
  const metrics = run.metrics;
  const result = interpretBacktest(run, t);
  const warnings = rankBacktestWarnings(run.warnings, t);
  const hasP1Diagnostics = metrics.max_drawdown_recovered !== undefined
    && 'trade_expectancy' in metrics
    && metrics.total_trading_cost !== undefined;
  // ②-E：max_drawdown_recovered 缺失 → 原始 null 直传（不再 pre-format '—' 冒充 OK）
  const recovery = metrics.max_drawdown_recovered === undefined
    ? null
    : metrics.max_drawdown_recovered
      ? t('strategy.summary.recovered', { periods: t('strategy.summary.periods', { count: metrics.max_drawdown_recovery_periods ?? 0 }) })
      : t('strategy.summary.notRecovered', { periods: t('strategy.summary.periods', { count: metrics.max_drawdown_duration_periods ?? 0 }) });
  const costSummary = metrics.total_trading_cost === undefined
    ? '—'
    : `${metrics.total_trading_cost.toFixed(2)} · ${pctText(metrics.trading_cost_ratio)}`;
  const professional = [
    [t('strategy.metric.annualizedReturn'), pctText(metrics.annualized_return), t('strategy.metric.annualizedReturnHelp'), 'metric-annualized-return'],
    [t('strategy.metric.sharpe'), metrics.sharpe_ratio?.toFixed(3) ?? '—', t('strategy.metric.sharpeHelp'), 'metric-sharpe'],
    [t('strategy.metric.sortino'), metrics.sortino_ratio?.toFixed(3) ?? '—', t('strategy.metric.sortinoHelp'), 'metric-sortino'],
    [t('strategy.metric.calmar'), metrics.calmar_ratio?.toFixed(3) ?? '—', t('strategy.metric.calmarHelp'), 'metric-calmar'],
    [t('strategy.metric.informationRatio'), metrics.information_ratio?.toFixed(3) ?? '—', t('strategy.metric.informationRatioHelp'), 'metric-information'],
    [t('strategy.metric.winRate'), pctText(metrics.win_rate), t('strategy.metric.winRateHelp'), 'metric-win-rate'],
    [t('strategy.metric.profitFactor'), metrics.profit_factor?.toFixed(3) ?? '—', t('strategy.metric.profitFactorHelp'), 'metric-profit-factor'],
    [t('strategy.metric.turnover'), `${metrics.turnover.toFixed(2)}×`, t('strategy.metric.turnoverHelp'), 'metric-turnover'],
  ];
  const p1Diagnostics = [
    [t('strategy.metric.annualizedVolatility'), pctText(metrics.annualized_volatility), t('strategy.metric.annualizedVolatilityHelp'), 'metric-annualized-volatility'],
    [t('strategy.metric.downsideVolatility'), pctText(metrics.annualized_downside_volatility), t('strategy.metric.downsideVolatilityHelp'), 'metric-downside-volatility'],
    [t('strategy.metric.drawdownDuration'), metrics.max_drawdown_duration_periods == null ? '—' : t('strategy.summary.periods', { count: metrics.max_drawdown_duration_periods }), t('strategy.metric.drawdownDurationHelp'), 'metric-drawdown-duration'],
    [t('strategy.metric.beta'), metrics.beta?.toFixed(3) ?? '—', t('strategy.metric.betaHelp'), 'metric-beta'],
    [t('strategy.metric.alpha'), pctText(metrics.alpha), t('strategy.metric.alphaHelp'), 'metric-alpha'],
    [t('strategy.metric.rSquared'), metrics.r_squared?.toFixed(3) ?? '—', t('strategy.metric.rSquaredHelp'), 'metric-r-squared'],
    [t('strategy.metric.trackingError'), pctText(metrics.tracking_error), t('strategy.metric.trackingErrorHelp'), 'metric-tracking-error'],
    [t('strategy.metric.tradeExpectancy'), pctText(metrics.trade_expectancy), t('strategy.metric.tradeExpectancyHelp'), 'metric-trade-expectancy'],
    [t('strategy.metric.averageWinLoss'), `${pctText(metrics.average_win)} / ${pctText(metrics.average_loss)}`, t('strategy.metric.averageWinLossHelp'), 'metric-average-win-loss'],
    [t('strategy.metric.averageHolding'), metrics.average_holding_periods == null ? '—' : t('strategy.summary.periods', { count: metrics.average_holding_periods.toFixed(1) }), t('strategy.metric.averageHoldingHelp'), 'metric-average-holding'],
    [t('strategy.metric.marketExposure'), pctText(metrics.market_exposure), t('strategy.metric.marketExposureHelp'), 'metric-market-exposure'],
    [t('strategy.metric.tradingCost'), costSummary, t('strategy.summary.costDetail', { commission: metrics.total_commission_cost?.toFixed(2) ?? '—', stamp: metrics.total_stamp_duty_cost?.toFixed(2) ?? '—', slippage: metrics.total_slippage_cost?.toFixed(2) ?? '—' }), 'metric-trading-cost'],
  ];

  // ②-E：quality 按真实来源推导——值缺失 → UNKNOWN；来源上游错误 → UPSTREAM_ERROR；
  // 来源部分完整 → PARTIAL；否则 OK。不再恒为 "OK"。
  const qualityOf = (value: string | null): FinancialMetricQuality => {
    if (value == null) return 'UNKNOWN';
    const flags = run.provenance?.quality_flags ?? [];
    if (flags.includes('UPSTREAM_ERROR')) return 'UPSTREAM_ERROR';
    return flags.length ? 'PARTIAL' : 'OK';
  };
  const toneOf = (tone: string, value: string | null): 'neutral' | 'up' | 'down' | 'risk' => {
    if (tone === 'risk') return 'risk';
    if (tone === 'return') return value != null && value.startsWith('+') ? 'up' : value != null ? 'down' : 'neutral';
    return 'neutral';
  };

  const metricCards = [
    { labelKey: 'strategy.metric.totalReturn', value: pct(run.metrics.total_return), testId: 'metric-total-return', tone: 'return' as const },
    { labelKey: 'strategy.metric.benchmarkReturn', value: pct(run.metrics.benchmark_return), testId: 'metric-benchmark-return', tone: 'neutral' as const },
    { labelKey: 'strategy.metric.excessReturn', value: pct(run.metrics.excess_return), testId: 'metric-excess-return', tone: 'return' as const },
    { labelKey: 'strategy.metric.maxDrawdown', value: pct(run.metrics.max_drawdown), testId: 'metric-max-drawdown', tone: 'risk' as const },
    { labelKey: 'strategy.metric.recovery', value: recovery, testId: 'metric-recovery', tone: 'neutral' as const },
    { labelKey: 'strategy.metric.tradeCount', value: String(run.metrics.trade_count), testId: 'metric-trade-count', tone: 'neutral' as const },
  ];

  return (
    <>
      <Alert type={result.type} showIcon message={result.message} description={result.description} style={{ marginBottom: 14 }} />
      <Row gutter={[12, 12]}>
        {metricCards.map(({ labelKey, value, testId, tone }) => (
          <Col xs={12} sm={8} lg={6} xl={4} key={labelKey}>
            <Card size="small" className="metric-card" data-testid={testId}>
              <FinancialMetric
                label={t(labelKey)}
                value={value}
                period={t('strategy.summary.period')}
                quality={qualityOf(value)}
                tone={toneOf(tone, value)}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {result.reasons.length ? (
        <Card size="small" title={t('strategy.summary.primaryLimits')} style={{ marginTop: 12 }}>
          <List size="small" dataSource={result.reasons} renderItem={(reason, index) => (
            <List.Item><Space align="start"><Tag color="red">{index + 1}</Tag><div><Text strong>{reason.title}</Text><div><Text type="secondary">{reason.detail}</Text></div></div></Space></List.Item>
          )} />
        </Card>
      ) : null}

      {warnings.length ? (
        <Card size="small" title={t('strategy.summary.executionLimits')} style={{ marginTop: 12 }}>
          <List size="small" dataSource={warnings} renderItem={(warning) => (
            <List.Item><div><Space wrap><Text strong>{warning.label}</Text><Tag>{warning.code}</Tag></Space><div><Text type="secondary">{warning.detail}</Text></div></div></List.Item>
          )} />
        </Card>
      ) : null}

      {!hasP1Diagnostics ? (
        <Alert
          type="info"
          showIcon
          message={t('strategy.summary.legacyTitle')}
          description={t('strategy.summary.legacyDescription')}
          style={{ marginTop: 12 }}
        />
      ) : null}

      <Collapse
        style={{ marginTop: 12 }}
        items={[
          {
            key: 'p1-diagnostics',
            label: t('strategy.summary.p1Title'),
            children: <Row gutter={[12, 12]}>{p1Diagnostics.map(([label, value, explanation, testId]) => (
              <Col xs={24} sm={12} lg={6} key={label}>
                <Card size="small" data-testid={testId}><Statistic title={label} value={value} /><Text type="secondary">{explanation}</Text></Card>
              </Col>
            ))}</Row>,
          },
          {
            key: 'professional',
            label: t('strategy.summary.professionalTitle'),
            children: <Row gutter={[12, 12]}>{professional.map(([label, value, explanation, testId]) => (
              <Col xs={24} sm={12} lg={6} key={label}>
                <Card size="small" data-testid={testId}><Statistic title={label} value={value} /><Text type="secondary">{explanation}</Text></Card>
              </Col>
            ))}</Row>,
          },
        ]}
      />
    </>
  );
}
