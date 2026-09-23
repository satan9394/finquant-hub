import { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, List, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';

import { runPortfolioBacktest } from '../../services/analysisApi';
import type { PortfolioBacktestPayload, PortfolioBacktestResult, PortfolioHolding } from '../../types';
import LazyEChart from '../LazyEChart';
import { useLanguage } from '../../i18n/LanguageContext';

const { Text } = Typography;
const pct = (value: number | null | undefined) => value == null ? '—' : `${(value * 100).toFixed(2)}%`;
const signedPct = (value: number | null | undefined) => value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

type Optimizer = PortfolioBacktestPayload['optimizer'];
type OptimizerComparison = {
  optimizer: Optimizer;
  label: string;
  assumption: string;
  result?: PortfolioBacktestResult;
  error?: string;
};
const optimizerKeys: Array<{ optimizer: Optimizer; labelKey: string; assumptionKey: string }> = [
  { optimizer: 'equal_weight', labelKey: 'portfolio.risk.optimizer.equal_weight', assumptionKey: 'portfolio.risk.optimizer.equal_weight.assumption' },
  { optimizer: 'risk_parity', labelKey: 'portfolio.risk.optimizer.risk_parity', assumptionKey: 'portfolio.risk.optimizer.risk_parity.assumption' },
  { optimizer: 'mean_variance', labelKey: 'portfolio.risk.optimizer.mean_variance', assumptionKey: 'portfolio.risk.optimizer.mean_variance.assumption' },
  { optimizer: 'inverse_volatility', labelKey: 'portfolio.risk.optimizer.inverse_volatility', assumptionKey: 'portfolio.risk.optimizer.inverse_volatility.assumption' },
];
type Translate = (key: string, values?: Record<string, string | number>) => string;
const errorText = (caught: any, t: Translate) => caught.response?.data?.detail || caught.message || t('portfolio.risk.failed');
const reviewStorageKey = 'finquant_portfolio_risk_reviews_v1';
type ReviewTask = { id: string; portfolio: string; summary: string; createdAt: string; dueAt: string; completed: boolean };
const loadReviewTasks = (): ReviewTask[] => {
  try {
    const value = JSON.parse(localStorage.getItem(reviewStorageKey) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};

function RiskExplanation({ result }: { result: PortfolioBacktestResult }) {
  const { t } = useLanguage();
  const concentrationLabels: Record<string, string> = {
    high: t('portfolio.risk.concentration.high'),
    medium: t('portfolio.risk.concentration.medium'),
    low: t('portfolio.risk.concentration.low'),
  };
  const { concentration, drawdown, tail_risk: tail, diversification } = result.risk_xray;
  const concentrationLabel = concentrationLabels[concentration.level] ?? concentration.level;
  const tailAvailable = tail.status === 'ok' && tail.var != null && tail.expected_shortfall != null;
  const diversificationAvailable = diversification.status === 'ok'
    && diversification.average_correlation != null && diversification.benefit != null;
  const unavailableDiversification = {
    insufficient_assets: t('portfolio.risk.diversification.insufficientAssetsDetail'),
    unsupported_mixed_frequency: t('portfolio.risk.diversification.mixedFrequencyDetail'),
    insufficient_overlap: t('portfolio.risk.diversification.overlapDetail'),
    constant_series: t('portfolio.risk.diversification.constantDetail'),
  }[diversification.status] ?? t('portfolio.risk.diversification.unknownDetail', { status: diversification.status });

  const explanations = [
    {
      title: t('portfolio.risk.explain.drawdownTitle'),
      detail: t('portfolio.risk.explain.drawdownDetail', { max: signedPct(drawdown.max), current: signedPct(drawdown.current) }),
    },
    tailAvailable ? {
      title: t('portfolio.risk.explain.tailTitle'),
      detail: t('portfolio.risk.explain.tailDetail', { confidence: (tail.confidence * 100).toFixed(0), var: pct(tail.var), es: pct(tail.expected_shortfall), observations: tail.observations, tail: (100 - tail.confidence * 100).toFixed(0) }),
    } : {
      title: t('portfolio.risk.explain.tailUnavailableTitle'),
      detail: t('portfolio.risk.explain.tailUnavailableDetail', { observations: tail.observations, minimum: tail.minimum_required ?? 20 }),
    },
    diversificationAvailable ? {
      title: t('portfolio.risk.explain.diversificationTitle'),
      detail: t('portfolio.risk.explain.diversificationDetail', { correlation: diversification.average_correlation!.toFixed(3), benefit: pct(diversification.benefit), observations: diversification.observations ?? '—' }),
    } : {
      title: t('portfolio.risk.explain.diversificationUnavailableTitle'),
      detail: unavailableDiversification,
    },
  ];

  return (
    <Card size="small" title={t('portfolio.risk.explain.title')} style={{ marginTop: 12 }}>
      <Alert
        type={concentration.level === 'low' ? 'success' : 'warning'}
        message={concentration.level === 'high' ? t('portfolio.risk.explain.primaryHigh') : t('portfolio.risk.explain.concentration', { level: concentrationLabel })}
        description={<>
          {t('portfolio.risk.explain.backendLevel', { level: concentrationLabel })}<br />
          {t('portfolio.risk.explain.metrics', { hhi: concentration.hhi.toFixed(3), effective: concentration.effective_asset_count.toFixed(3), weight: pct(concentration.largest_weight) })}<br />
          {t('portfolio.risk.explain.noMutation')}
        </>}
      />
      <List
        size="small"
        dataSource={explanations}
        renderItem={(item) => <List.Item><div><Text strong>{item.title}</Text><div><Text type="secondary">{item.detail}</Text></div></div></List.Item>}
      />
    </Card>
  );
}

export default function PortfolioRiskWorkbench({ holdings, initialCapital, portfolioName }: {
  holdings: PortfolioHolding[];
  initialCapital: number;
  portfolioName?: string;
}) {
  const { lang, t } = useLanguage();
  const portfolioLabel = portfolioName ?? t('portfolio.risk.currentPortfolio');
  const concentrationLabels: Record<string, string> = {
    high: t('portfolio.risk.concentration.high'),
    medium: t('portfolio.risk.concentration.medium'),
    low: t('portfolio.risk.concentration.low'),
  };
  const diversificationLabels: Record<string, string> = {
    ok: t('portfolio.risk.diversification.ok'),
    insufficient_assets: t('portfolio.risk.diversification.insufficient_assets'),
    unsupported_mixed_frequency: t('portfolio.risk.diversification.unsupported_mixed_frequency'),
    insufficient_overlap: t('portfolio.risk.diversification.insufficient_overlap'),
    constant_series: t('portfolio.risk.diversification.constant_series'),
  };
  const optimizers = useMemo<Array<Omit<OptimizerComparison, 'result' | 'error'>>>(() => optimizerKeys.map((item) => ({
    optimizer: item.optimizer,
    label: t(item.labelKey),
    assumption: t(item.assumptionKey),
  })), [t]);
  const [result, setResult] = useState<PortfolioBacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisons, setComparisons] = useState<OptimizerComparison[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reviewTasks, setReviewTasks] = useState<ReviewTask[]>(loadReviewTasks);
  const [deletedReview, setDeletedReview] = useState<ReviewTask | null>(null);
  const eligible = holdings.length >= 2;
  const capital = initialCapital > 0 ? initialCapital : 100_000;

  const chart = useMemo(() => result ? ({
    tooltip: { trigger: 'axis' },
    legend: { data: [t('portfolio.risk.legend.portfolio'), t('portfolio.risk.legend.benchmark')] },
    xAxis: { type: 'category', data: result.equity_curve.map((point) => point.time), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', scale: true },
    series: [
      { name: t('portfolio.risk.legend.portfolio'), type: 'line', symbol: 'none', data: result.equity_curve.map((point) => point.value) },
      { name: t('portfolio.risk.legend.benchmark'), type: 'line', symbol: 'none', data: result.benchmark_curve.map((point) => point.value) },
    ],
  }) : null, [result, t]);

  const weightedAssets = useMemo(() => result
    ? [...result.assets].sort((left, right) => right.weight - left.weight)
    : [], [result]);
  const exposureCoverage = useMemo(() => result ? {
    total: result.assets.length,
    market: result.assets.filter((asset) => Boolean(asset.provenance.market)).length,
    currency: result.assets.filter((asset) => Boolean(asset.provenance.currency)).length,
  } : null, [result]);
  const weightChart = useMemo(() => weightedAssets.length ? ({
    grid: { left: 92, right: 42, top: 12, bottom: 18 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number) => `${value.toFixed(2)}%` },
    xAxis: { type: 'value', min: 0, max: 100, axisLabel: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'category', inverse: true, data: weightedAssets.map((asset) => asset.asset_id), axisLabel: { width: 92, overflow: 'truncate' } },
    series: [{ name: t('portfolio.risk.calibratedWeight'), type: 'bar', data: weightedAssets.map((asset) => Number((asset.weight * 100).toFixed(4))), label: { show: true, position: 'right', formatter: '{c}%' } }],
  }) : null, [weightedAssets, t]);
  const correlationChart = useMemo(() => {
    const diversification = result?.risk_xray.diversification;
    if (diversification?.status !== 'ok' || diversification.average_correlation == null) return null;
    return {
      grid: { left: 28, right: 28, top: 28, bottom: 32 },
      tooltip: { formatter: `${t('portfolio.risk.averageCorrelation')}: ${diversification.average_correlation.toFixed(3)}` },
      xAxis: { type: 'value', min: -1, max: 1, splitNumber: 2 },
      yAxis: { type: 'value', min: -1, max: 1, show: false },
      series: [{ name: t('portfolio.risk.averageCorrelation'), type: 'scatter', symbolSize: 18, data: [[diversification.average_correlation, 0]], markLine: { silent: true, symbol: 'none', data: [{ xAxis: 0 }] } }],
    };
  }, [result, t]);
  const riskContribution = result?.risk_xray.diversification.risk_contribution;
  const correlationMatrix = result?.risk_xray.diversification.correlation_matrix;
  const correlationRows = useMemo(() => {
    if (!correlationMatrix?.values) return [];
    return correlationMatrix.asset_ids.map((assetId, rowIndex) => ({
      asset_id: assetId,
      ...Object.fromEntries(correlationMatrix.asset_ids.map((columnId, columnIndex) => (
        [columnId, correlationMatrix.values![rowIndex][columnIndex]]
      ))),
    }));
  }, [correlationMatrix]);

  const buildPayload = (optimizer: Optimizer): PortfolioBacktestPayload => ({
      assets: holdings.map((holding) => ({
        symbol: holding.code,
        period: '1d',
        short_window: 20,
        long_window: 50,
        market_rules: 'auto',
      })),
      optimizer,
      optimization_lookback: 60,
      count: 800,
      initial_capital: capital,
      commission_bps: 3,
      slippage_bps: 2,
  });

  const run = async () => {
    if (!eligible) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setComparisons([]);
    try {
      setResult(await runPortfolioBacktest(buildPayload('equal_weight')));
    } catch (caught: any) {
      setError(errorText(caught, t));
    } finally {
      setLoading(false);
    }
  };

  const compareOptimizers = async () => {
    if (!result) return;
    setComparisonLoading(true);
    const others = await Promise.all(optimizers.slice(1).map(async (meta): Promise<OptimizerComparison> => {
      try {
        return { ...meta, result: await runPortfolioBacktest(buildPayload(meta.optimizer)) };
      } catch (caught: any) {
        return { ...meta, error: errorText(caught, t) };
      }
    }));
    setComparisons([{ ...optimizers[0], result }, ...others]);
    setComparisonLoading(false);
  };

  const storeReviews = (tasks: ReviewTask[]) => {
    setReviewTasks(tasks);
    localStorage.setItem(reviewStorageKey, JSON.stringify(tasks));
  };

  const addReview = () => {
    if (!result) return;
    const created = new Date();
    const due = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
    storeReviews([{
      id: `${created.getTime()}`,
      portfolio: portfolioLabel,
      summary: t('portfolio.risk.reviewSummary', { level: concentrationLabels[result.risk_xray.concentration.level] ?? result.risk_xray.concentration.level, weight: pct(result.risk_xray.concentration.largest_weight), drawdown: signedPct(result.risk_xray.drawdown.max) }),
      createdAt: created.toISOString(),
      dueAt: due.toISOString(),
      completed: false,
    }, ...reviewTasks]);
  };

  return (
    <Card title={t('portfolio.risk.title')} className="surface-card" style={{ marginTop: 16 }}>
      <Alert
        type="info"
        showIcon
        message={t('portfolio.risk.baseline')}
        description={t('portfolio.risk.baselineDescription', { count: holdings.length, capital: capital.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US') })}
      />
      <Button type="primary" icon={<ExperimentOutlined />} disabled={!eligible} loading={loading} onClick={() => void run()} style={{ marginTop: 12 }}>
        {t('portfolio.risk.run')}
      </Button>
      {!eligible && <Alert type="warning" showIcon message={t('portfolio.risk.minimumHoldings')} style={{ marginTop: 12 }} />}
      {error && <Alert type="error" showIcon message={t('portfolio.risk.unavailable')} description={error} style={{ marginTop: 12 }} />}

      {result && (
        <div style={{ marginTop: 16 }}>
          <Row gutter={[12, 12]}>
            {[
              [t('portfolio.risk.metric.return'), signedPct(result.metrics.total_return)],
              [t('portfolio.risk.metric.benchmark'), signedPct(result.metrics.benchmark_return)],
              [t('portfolio.risk.metric.excess'), signedPct(result.metrics.excess_return)],
              [t('portfolio.risk.metric.drawdown'), signedPct(result.metrics.max_drawdown)],
              [t('portfolio.risk.metric.trades'), String(result.metrics.trade_count)],
              [t('portfolio.risk.metric.winRate'), pct(result.metrics.win_rate)],
              [t('portfolio.risk.metric.profitFactor'), result.metrics.profit_factor?.toFixed(3) ?? '—'],
            ].map(([label, value]) => <Col xs={12} sm={8} lg={4} key={label}><Card size="small"><Statistic title={label} value={value} /></Card></Col>)}
          </Row>
          {chart && <div role="img" aria-label={t('portfolio.risk.chartAria', { portfolio: signedPct(result.metrics.total_return), benchmark: signedPct(result.metrics.benchmark_return), drawdown: signedPct(result.metrics.max_drawdown) })} style={{ marginTop: 12 }}><LazyEChart option={chart} style={{ height: 320 }} notMerge /></div>}

          <RiskExplanation result={result} />

          <Card size="small" title={t('portfolio.risk.sourcesTitle')} style={{ marginTop: 12 }}>
            <Alert
              type="info"
              message={t('portfolio.risk.sourcesNotice')}
              description={t('portfolio.risk.sourcesDescription', { observations: result.risk_xray.diversification.observations ?? 'UNKNOWN' })}
            />
            <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
              <Col xs={24} lg={14}>
                <Text strong>{t('portfolio.risk.weightSource')}</Text>
                <div><Text type="secondary">{t('portfolio.risk.largest', { asset: weightedAssets[0]?.asset_id ?? '—', weight: pct(weightedAssets[0]?.weight) })}</Text></div>
                {weightChart && <div role="img" aria-label={t('portfolio.risk.weightAria', { asset: weightedAssets[0]?.asset_id ?? 'UNKNOWN', weight: pct(weightedAssets[0]?.weight) })} data-testid="portfolio-weight-chart"><LazyEChart option={weightChart} style={{ height: Math.max(180, weightedAssets.length * 42) }} notMerge /></div>}
              </Col>
              <Col xs={24} lg={10}>
                <Text strong>{t('portfolio.risk.correlationPosition')}</Text>
                {correlationChart ? (
                  <div role="img" aria-label={t('portfolio.risk.correlationAria', { correlation: result.risk_xray.diversification.average_correlation?.toFixed(3) ?? 'UNKNOWN', observations: result.risk_xray.diversification.observations ?? 'UNKNOWN' })} data-testid="portfolio-correlation-chart">
                    <div><Text type="secondary">{t('portfolio.risk.commonObservations', { count: result.risk_xray.diversification.observations ?? '—' })}</Text></div>
                    <LazyEChart option={correlationChart} style={{ height: 180 }} notMerge />
                  </div>
                ) : <Alert type="warning" message={t('portfolio.risk.correlationUnavailable')} description={diversificationLabels[result.risk_xray.diversification.status] ?? result.risk_xray.diversification.status} style={{ marginTop: 8 }} />}
              </Col>
            </Row>
            {riskContribution?.status === 'ok' && correlationMatrix?.status === 'ok' && correlationMatrix.values ? (
              <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
                <Col xs={24} lg={10}>
                  <Text strong>{t('portfolio.risk.assetContribution')}</Text>
                  <div><Text type="secondary">{t('portfolio.risk.contributionMethod', { volatility: pct(riskContribution.portfolio_volatility) })}</Text></div>
                  <Table
                    rowKey="asset_id"
                    size="small"
                    pagination={false}
                    dataSource={riskContribution.items}
                    columns={[
                      { title: t('portfolio.risk.asset'), dataIndex: 'asset_id' },
                      { title: t('portfolio.risk.calibratedWeight'), dataIndex: 'weight', render: (value: number) => pct(value) },
                      { title: t('portfolio.risk.contribution'), dataIndex: 'contribution', render: (value: number) => t('portfolio.risk.contributionValue', { value: pct(value) }) },
                    ]}
                    scroll={{ x: 460 }}
                  />
                </Col>
                <Col xs={24} lg={14}>
                  <Text strong>{t('portfolio.risk.matrix')}</Text>
                  <div><Text type="secondary">{t('portfolio.risk.matrixMethod', { count: correlationMatrix.observations ?? '—' })}</Text></div>
                  <Table
                    rowKey="asset_id"
                    size="small"
                    pagination={false}
                    dataSource={correlationRows}
                    columns={[
                      { title: t('portfolio.risk.asset'), dataIndex: 'asset_id', fixed: 'left', width: 150 },
                      ...correlationMatrix.asset_ids.map((assetId) => ({
                        title: assetId,
                        dataIndex: [assetId],
                        width: 125,
                        render: (value: number) => value.toFixed(3),
                      })),
                    ]}
                    scroll={{ x: 150 + correlationMatrix.asset_ids.length * 125 }}
                  />
                </Col>
              </Row>
            ) : (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 12 }}
                message={t('portfolio.risk.matrixUnavailable')}
                description={riskContribution?.status === 'insufficient_data'
                  ? t('portfolio.risk.contributionInsufficient', { observations: riskContribution.observations ?? 0, minimum: riskContribution.minimum_required })
                  : t('portfolio.risk.matrixUnknown')}
              />
            )}
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              message={t('portfolio.risk.stressUnavailable')}
              description={t('portfolio.risk.stressDescription')}
            />
          </Card>

          <Card size="small" title={t('portfolio.risk.exposureTitle')} style={{ marginTop: 12 }}>
            <Alert
              type="warning"
              message={exposureCoverage ? t('portfolio.risk.exposureCoverage', { market: exposureCoverage.market, currency: exposureCoverage.currency, total: exposureCoverage.total }) : t('portfolio.risk.exposureUnavailable')}
              description={t('portfolio.risk.exposureDescription')}
            />
            <Table
              rowKey="asset_id"
              size="small"
              pagination={false}
              style={{ marginTop: 12 }}
              scroll={{ x: 620 }}
              dataSource={weightedAssets}
              columns={[
                { title: t('portfolio.risk.asset'), dataIndex: 'asset_id' },
                { title: t('portfolio.risk.calibratedWeight'), dataIndex: 'weight', render: (value: number) => pct(value) },
                { title: t('portfolio.risk.market'), dataIndex: ['provenance', 'market'], render: (value?: string | null) => value || <Tag>UNKNOWN</Tag> },
                { title: t('portfolio.risk.currency'), dataIndex: ['provenance', 'currency'], render: (value?: string | null) => value || <Tag>UNKNOWN</Tag> },
                { title: t('portfolio.risk.industry'), render: () => <Tag>UNKNOWN</Tag> },
              ]}
            />
          </Card>

          <Card size="small" title={t('portfolio.risk.actionsTitle')} style={{ marginTop: 12 }}>
            <Alert type="info" message={t('portfolio.risk.actionsNotice')} description={t('portfolio.risk.actionsDescription')} />
            <Space wrap style={{ marginTop: 12 }}>
              <Button
                type="primary"
                href={`/alerts?${new URLSearchParams({
                  new: '1',
                  ticker: weightedAssets[0]?.symbol ?? '',
                  name: t('portfolio.risk.reviewName', { portfolio: portfolioLabel }),
                  source: 'portfolio',
                  portfolio: portfolioLabel,
                  metric: 'concentration',
                  value: pct(result.risk_xray.concentration.largest_weight),
                  as_of: weightedAssets[0]?.provenance.as_of ?? 'UNKNOWN',
                }).toString()}`}
              >{t('portfolio.risk.openAlerts')}</Button>
              <Button onClick={addReview}>{t('portfolio.risk.createReview')}</Button>
            </Space>
          </Card>

          <Card
            size="small"
            title={t('portfolio.risk.optimizerTitle')}
            style={{ marginTop: 12 }}
          >
            <Alert
              type="info"
              message={t('portfolio.risk.optimizerNotice')}
              description={t('portfolio.risk.optimizerDescription')}
            />
            <Button loading={comparisonLoading} onClick={() => void compareOptimizers()} style={{ marginTop: 12 }}>{t('portfolio.risk.optimizerCompare')}</Button>
            {comparisons.filter((item) => item.error).map((item) => (
              <Alert key={item.optimizer} type="warning" message={t('portfolio.risk.optimizerUnavailable', { label: item.label, error: item.error ?? 'UNKNOWN' })} style={{ marginTop: 8 }} />
            ))}
            {comparisons.length > 0 && (
              <Table
                rowKey="optimizer"
                size="small"
                pagination={false}
                style={{ marginTop: 12 }}
                scroll={{ x: 920 }}
                dataSource={comparisons}
                columns={[
                  { title: t('portfolio.risk.optimizerAssumption'), width: 250, render: (_: unknown, item: OptimizerComparison) => <><Text strong>{item.label}</Text><div><Text type="secondary">{item.assumption}</Text></div></> },
                  { title: t('portfolio.risk.totalReturn'), render: (_: unknown, item: OptimizerComparison) => item.result ? signedPct(item.result.metrics.total_return) : '—' },
                  { title: t('portfolio.risk.metric.drawdown'), render: (_: unknown, item: OptimizerComparison) => item.result ? signedPct(item.result.metrics.max_drawdown) : '—' },
                  { title: t('portfolio.risk.turnover'), render: (_: unknown, item: OptimizerComparison) => item.result?.metrics.turnover == null ? t('portfolio.risk.valueUnavailable') : `${item.result.metrics.turnover.toFixed(3)}×` },
                  { title: t('portfolio.risk.metric.trades'), render: (_: unknown, item: OptimizerComparison) => item.result?.metrics.trade_count ?? '—' },
                  { title: t('portfolio.risk.largestWeight'), render: (_: unknown, item: OptimizerComparison) => item.result ? pct(item.result.risk_xray.concentration.largest_weight) : '—' },
                  { title: t('portfolio.risk.effectiveAssets'), render: (_: unknown, item: OptimizerComparison) => item.result ? item.result.risk_xray.concentration.effective_asset_count.toFixed(3) : '—' },
                ]}
              />
            )}
          </Card>

          <Card size="small" title={t('portfolio.risk.xrayTitle')} style={{ marginTop: 12 }}>
            <Row gutter={[12, 12]}>
              <Col xs={12} md={6}><Statistic title={t('portfolio.risk.effectiveAssets')} value={result.risk_xray.concentration.effective_asset_count.toFixed(3)} /></Col>
              <Col xs={12} md={6}><Statistic title={t('portfolio.risk.largestWeight')} value={pct(result.risk_xray.concentration.largest_weight)} /></Col>
              <Col xs={12} md={6}><Statistic title={t('portfolio.risk.currentDrawdown')} value={signedPct(result.risk_xray.drawdown.current)} /></Col>
              <Col xs={12} md={6}><Statistic title={t('portfolio.risk.historicalVar')} value={pct(result.risk_xray.tail_risk.var)} /></Col>
              <Col xs={12} md={6}><Statistic title={t('portfolio.risk.historicalEs')} value={pct(result.risk_xray.tail_risk.expected_shortfall)} /></Col>
              <Col xs={12} md={6}><Statistic title={t('portfolio.risk.averageCorrelation')} value={result.risk_xray.diversification.average_correlation?.toFixed(3) ?? '—'} /></Col>
              <Col xs={12} md={6}><Statistic title={t('portfolio.risk.diversificationBenefit')} value={pct(result.risk_xray.diversification.benefit)} /></Col>
            </Row>
            <Space wrap style={{ marginTop: 10 }}>
              <Tag>{t('portfolio.risk.tagConcentration', { value: concentrationLabels[result.risk_xray.concentration.level] ?? result.risk_xray.concentration.level })}</Tag>
              <Tag>{t('portfolio.risk.tagTail', { value: result.risk_xray.tail_risk.status === 'ok' ? t('portfolio.risk.diversification.ok') : t('portfolio.risk.sampleInsufficient'), count: result.risk_xray.tail_risk.observations })}</Tag>
              <Tag>{t('portfolio.risk.tagDiversification', { value: diversificationLabels[result.risk_xray.diversification.status] ?? result.risk_xray.diversification.status })}</Tag>
            </Space>
          </Card>

          <Table
            rowKey="asset_id"
            size="small"
            pagination={false}
            style={{ marginTop: 12 }}
            dataSource={result.assets}
            columns={[
              { title: t('portfolio.risk.asset'), dataIndex: 'asset_id' },
              { title: t('portfolio.risk.calibratedWeight'), dataIndex: 'weight', render: (value: number) => pct(value) },
              { title: t('portfolio.risk.provider'), dataIndex: ['provenance', 'provider'], render: (value?: string) => value || '—' },
              { title: t('portfolio.risk.asOf'), dataIndex: ['provenance', 'as_of'], render: (value?: string) => value || '—' },
              { title: t('portfolio.risk.quality'), dataIndex: ['provenance', 'quality_flags'], render: (flags?: string[]) => flags?.length ? flags.join(', ') : t('portfolio.risk.noFlags') },
            ]}
            scroll={{ x: 700 }}
          />
          {result.warnings.length > 0 && (
            <List size="small" header={<Text strong>{t('portfolio.risk.warnings')}</Text>} dataSource={result.warnings} renderItem={(warning) => <List.Item><Tag>{warning}</Tag></List.Item>} />
          )}
        </div>
      )}
      {reviewTasks.length > 0 && (
        <Card size="small" title={t('portfolio.risk.reviewTasks')} style={{ marginTop: 12 }}>
          <List dataSource={reviewTasks} renderItem={(task) => (
            <List.Item actions={[
              <Button key="complete" size="small" onClick={() => storeReviews(reviewTasks.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item))}>{t(task.completed ? 'portfolio.risk.restore' : 'portfolio.risk.complete')}</Button>,
              <Button key="delete" size="small" danger onClick={() => { setDeletedReview(task); storeReviews(reviewTasks.filter((item) => item.id !== task.id)); }}>{t('portfolio.risk.delete')}</Button>,
            ]}>
              <div><Text delete={task.completed} strong>{task.portfolio}</Text><div><Text type="secondary">{t('portfolio.risk.reviewDue', { summary: task.summary, date: task.dueAt.slice(0, 10) })}</Text></div></div>
            </List.Item>
          )} />
        </Card>
      )}
      {deletedReview && (
        <Alert
          type="warning"
          message={t('portfolio.risk.reviewRemoved')}
          action={<Button size="small" onClick={() => { storeReviews([deletedReview, ...reviewTasks]); setDeletedReview(null); }}>{t('portfolio.risk.undo')}</Button>}
          style={{ marginTop: 12 }}
        />
      )}
    </Card>
  );
}
