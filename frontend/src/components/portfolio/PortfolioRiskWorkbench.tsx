import { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, List, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';

import { runPortfolioBacktest } from '../../services/analysisApi';
import type { PortfolioBacktestPayload, PortfolioBacktestResult, PortfolioHolding } from '../../types';
import LazyEChart from '../LazyEChart';

const { Text } = Typography;
const pct = (value: number | null | undefined) => value == null ? '—' : `${(value * 100).toFixed(2)}%`;
const signedPct = (value: number | null | undefined) => value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

const concentrationLabels: Record<string, string> = { high: '高', medium: '中', low: '低' };
const diversificationLabels: Record<string, string> = {
  ok: '可用',
  insufficient_assets: '资产不足',
  unsupported_mixed_frequency: '频率不一致',
  insufficient_overlap: '共同样本不足',
  constant_series: '序列无变化',
};
type Optimizer = PortfolioBacktestPayload['optimizer'];
type OptimizerComparison = {
  optimizer: Optimizer;
  label: string;
  assumption: string;
  result?: PortfolioBacktestResult;
  error?: string;
};
const optimizers: Array<Omit<OptimizerComparison, 'result' | 'error'>> = [
  { optimizer: 'equal_weight', label: '等权', assumption: '每个资产使用相同校准权重' },
  { optimizer: 'risk_parity', label: '风险平价', assumption: '按历史协方差使风险贡献接近；依赖协方差估计' },
  { optimizer: 'mean_variance', label: '均值方差', assumption: '长仓约束下权衡历史均值与协方差；对估计敏感' },
  { optimizer: 'inverse_volatility', label: '逆波动', assumption: '历史波动越低权重越高；不直接使用相关性' },
];
const errorText = (caught: any) => caught.response?.data?.detail || caught.message || '组合风险模拟失败';
const reviewStorageKey = 'finquant_portfolio_risk_reviews_v1';
type ReviewTask = { id: string; portfolio: string; summary: string; createdAt: string; dueAt: string; completed: boolean };
const loadReviewTasks = (): ReviewTask[] => {
  try {
    const value = JSON.parse(localStorage.getItem(reviewStorageKey) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};

function RiskExplanation({ result }: { result: PortfolioBacktestResult }) {
  const { concentration, drawdown, tail_risk: tail, diversification } = result.risk_xray;
  const concentrationLabel = concentrationLabels[concentration.level] ?? concentration.level;
  const tailAvailable = tail.status === 'ok' && tail.var != null && tail.expected_shortfall != null;
  const diversificationAvailable = diversification.status === 'ok'
    && diversification.average_correlation != null && diversification.benefit != null;
  const unavailableDiversification = {
    insufficient_assets: '资产少于两个，无法评价资产间的分散化。',
    unsupported_mixed_frequency: '混合频率资产不可直接比较相关性，后端未返回数值。',
    insufficient_overlap: '资产共同日期不足，后端未返回相关性或分散化收益。',
    constant_series: '资产收益序列缺少变化，相关性不可定义。',
  }[diversification.status] ?? `后端状态为 ${diversification.status}，当前没有可解释数值。`;

  const explanations = [
    {
      title: '回撤是相对历史高点的路径损失',
      detail: `最大回撤 ${signedPct(drawdown.max)} 是模拟期间从高点到后续低点的最深跌幅；当前回撤 ${signedPct(drawdown.current)} 是期末距离此前高点的差距。它描述这次历史路径，不预测未来。`,
    },
    tailAvailable ? {
      title: 'VaR / ES 描述历史单期尾部，不是最坏情形',
      detail: `${(tail.confidence * 100).toFixed(0)}% 历史单期口径：历史 VaR 为 ${pct(tail.var)}，历史 ES 为 ${pct(tail.expected_shortfall)}。在 ${tail.observations} 个收益观察中，VaR 是较差 ${(100 - tail.confidence * 100).toFixed(0)}% 的损失边界，ES 是超过该边界后的平均损失；不是未来最大损失或概率保证。`,
    } : {
      title: '尾部风险样本不足',
      detail: `只有 ${tail.observations} 个收益观察，后端至少需要 ${tail.minimum_required ?? 20} 个；VaR / ES 保持不可用，不用其他数值替代。`,
    },
    diversificationAvailable ? {
      title: '分散化看资产是否真正一起波动',
      detail: `平均相关性 ${diversification.average_correlation!.toFixed(3)}，分散化收益 ${pct(diversification.benefit)}，共同收益观察 ${diversification.observations ?? '—'} 个。后者表示相对各资产加权独立波动，组合波动降低的比例；历史相关性会变化，也不代表因果。`,
    } : {
      title: '分散化暂不可判断',
      detail: unavailableDiversification,
    },
  ];

  return (
    <Card size="small" title="风险怎么理解" style={{ marginTop: 12 }}>
      <Alert
        type={concentration.level === 'low' ? 'success' : 'warning'}
        message={concentration.level === 'high' ? '首要关注：持仓集中度高' : `集中度：${concentrationLabel}`}
        description={<>
          后端分级：{concentrationLabel} · 基于模拟校准权重<br />
          HHI {concentration.hhi.toFixed(3)} · 有效资产 {concentration.effective_asset_count.toFixed(3)} · 最大权重 {pct(concentration.largest_weight)}<br />
          先核对校准权重和来源；不会调整真实持仓。
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

export default function PortfolioRiskWorkbench({ holdings, initialCapital, portfolioName = '当前组合' }: {
  holdings: PortfolioHolding[];
  initialCapital: number;
  portfolioName?: string;
}) {
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
    legend: { data: ['组合权益', '买入持有基准'] },
    xAxis: { type: 'category', data: result.equity_curve.map((point) => point.time), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', scale: true },
    series: [
      { name: '组合权益', type: 'line', symbol: 'none', data: result.equity_curve.map((point) => point.value) },
      { name: '买入持有基准', type: 'line', symbol: 'none', data: result.benchmark_curve.map((point) => point.value) },
    ],
  }) : null, [result]);

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
    series: [{ name: '校准权重', type: 'bar', data: weightedAssets.map((asset) => Number((asset.weight * 100).toFixed(4))), label: { show: true, position: 'right', formatter: '{c}%' } }],
  }) : null, [weightedAssets]);
  const correlationChart = useMemo(() => {
    const diversification = result?.risk_xray.diversification;
    if (diversification?.status !== 'ok' || diversification.average_correlation == null) return null;
    return {
      grid: { left: 28, right: 28, top: 28, bottom: 32 },
      tooltip: { formatter: `平均相关性：${diversification.average_correlation.toFixed(3)}` },
      xAxis: { type: 'value', min: -1, max: 1, splitNumber: 2 },
      yAxis: { type: 'value', min: -1, max: 1, show: false },
      series: [{ name: '平均相关性', type: 'scatter', symbolSize: 18, data: [[diversification.average_correlation, 0]], markLine: { silent: true, symbol: 'none', data: [{ xAxis: 0 }] } }],
    };
  }, [result]);
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
      setError(errorText(caught));
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
        return { ...meta, error: errorText(caught) };
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
      portfolio: portfolioName,
      summary: `集中度${concentrationLabels[result.risk_xray.concentration.level] ?? result.risk_xray.concentration.level} · 最大权重 ${pct(result.risk_xray.concentration.largest_weight)} · 最大回撤 ${signedPct(result.risk_xray.drawdown.max)}`,
      createdAt: created.toISOString(),
      dueAt: due.toISOString(),
      completed: false,
    }, ...reviewTasks]);
  };

  return (
    <Card title="组合历史风险模拟" className="surface-card" style={{ marginTop: 16 }}>
      <Alert
        type="info"
        showIcon
        message="只读等权基线，不修改真实持仓"
        description={`当前 ${holdings.length} 个持仓 · 日频 MA20/50 · 前 60 期校准 · 800 条行情 · 佣金 3 bps · 滑点 2 bps · 初始资金 ${capital.toLocaleString('zh-CN')}；当前组合基线未模拟最低佣金、印花税或汇率换算。`}
      />
      <Button type="primary" icon={<ExperimentOutlined />} disabled={!eligible} loading={loading} onClick={() => void run()} style={{ marginTop: 12 }}>
        运行组合风险模拟
      </Button>
      {!eligible && <Alert type="warning" showIcon message="至少需要两个持仓才能运行组合风险模拟" style={{ marginTop: 12 }} />}
      {error && <Alert type="error" showIcon message="组合模拟不可用" description={error} style={{ marginTop: 12 }} />}

      {result && (
        <div style={{ marginTop: 16 }}>
          <Row gutter={[12, 12]}>
            {[
              ['组合收益', signedPct(result.metrics.total_return)],
              ['基准收益', signedPct(result.metrics.benchmark_return)],
              ['超额收益', signedPct(result.metrics.excess_return)],
              ['最大回撤', signedPct(result.metrics.max_drawdown)],
              ['交易数', String(result.metrics.trade_count)],
              ['胜率', pct(result.metrics.win_rate)],
              ['盈亏比', result.metrics.profit_factor?.toFixed(3) ?? '—'],
            ].map(([label, value]) => <Col xs={12} sm={8} lg={4} key={label}><Card size="small"><Statistic title={label} value={value} /></Card></Col>)}
          </Row>
          {chart && <div role="img" aria-label={`组合与基准权益曲线：组合收益 ${signedPct(result.metrics.total_return)}，基准收益 ${signedPct(result.metrics.benchmark_return)}，最大回撤 ${signedPct(result.metrics.max_drawdown)}。`} style={{ marginTop: 12 }}><LazyEChart option={chart} style={{ height: 320 }} notMerge /></div>}

          <RiskExplanation result={result} />

          <Card size="small" title="风险来源与相关性" style={{ marginTop: 12 }}>
            <Alert
              type="info"
              message="权重、风险贡献与相关矩阵口径"
              description={`权重仍只表示资金配置；风险贡献与相关矩阵基于同一组 ${result.risk_xray.diversification.observations ?? 'UNKNOWN'} 个对齐的真实策略收益观察。风险贡献使用样本协方差分量占比，可能因负相关为负，不代表未来损失份额。`}
            />
            <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
              <Col xs={24} lg={14}>
                <Text strong>权重集中来源（非风险贡献）</Text>
                <div><Text type="secondary">最大项：{weightedAssets[0]?.asset_id ?? '—'} · {pct(weightedAssets[0]?.weight)}</Text></div>
                {weightChart && <div role="img" aria-label={`权重集中图：最大项 ${weightedAssets[0]?.asset_id ?? 'UNKNOWN'}，权重 ${pct(weightedAssets[0]?.weight)}。`} data-testid="portfolio-weight-chart"><LazyEChart option={weightChart} style={{ height: Math.max(180, weightedAssets.length * 42) }} notMerge /></div>}
              </Col>
              <Col xs={24} lg={10}>
                <Text strong>相关性位置（仅平均值）</Text>
                {correlationChart ? (
                  <div role="img" aria-label={`平均相关性位置图：平均相关性 ${result.risk_xray.diversification.average_correlation?.toFixed(3) ?? 'UNKNOWN'}，共同收益观察 ${result.risk_xray.diversification.observations ?? 'UNKNOWN'} 个。`} data-testid="portfolio-correlation-chart">
                    <div><Text type="secondary">共同收益观察 {result.risk_xray.diversification.observations ?? '—'} 个</Text></div>
                    <LazyEChart option={correlationChart} style={{ height: 180 }} notMerge />
                  </div>
                ) : <Alert type="warning" message="相关性不可用" description={diversificationLabels[result.risk_xray.diversification.status] ?? result.risk_xray.diversification.status} style={{ marginTop: 8 }} />}
              </Col>
            </Row>
            {riskContribution?.status === 'ok' && correlationMatrix?.status === 'ok' && correlationMatrix.values ? (
              <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
                <Col xs={24} lg={10}>
                  <Text strong>逐资产风险贡献</Text>
                  <div><Text type="secondary">方法：样本协方差分量占比 · 组合单期波动 {pct(riskContribution.portfolio_volatility)}</Text></div>
                  <Table
                    rowKey="asset_id"
                    size="small"
                    pagination={false}
                    dataSource={riskContribution.items}
                    columns={[
                      { title: '资产', dataIndex: 'asset_id' },
                      { title: '校准权重', dataIndex: 'weight', render: (value: number) => pct(value) },
                      { title: '风险贡献', dataIndex: 'contribution', render: (value: number) => `风险贡献 ${pct(value)}` },
                    ]}
                    scroll={{ x: 460 }}
                  />
                </Col>
                <Col xs={24} lg={14}>
                  <Text strong>相关矩阵</Text>
                  <div><Text type="secondary">Pearson · 共同收益观察 {correlationMatrix.observations ?? '—'} 个</Text></div>
                  <Table
                    rowKey="asset_id"
                    size="small"
                    pagination={false}
                    dataSource={correlationRows}
                    columns={[
                      { title: '资产', dataIndex: 'asset_id', fixed: 'left', width: 150 },
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
                message="完整相关矩阵或逐资产风险贡献不可用"
                description={riskContribution?.status === 'insufficient_data'
                  ? `风险贡献只有 ${riskContribution.observations ?? 0} 个共同收益观察，至少需要 ${riskContribution.minimum_required} 个；不展示不稳定数值。`
                  : '当前结果可能是旧合同，或共同频率、日期、方差不满足计算要求；保持 UNKNOWN。'}
              />
            )}
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              message="压力测试仍不可用"
              description="当前没有具名历史事件窗口、可审计情景冲击或多资产重估合同；不会用固定跌幅、收益缩放或模型生成场景补数。"
            />
          </Card>

          <Card size="small" title="暴露数据可行性" style={{ marginTop: 12 }}>
            <Alert
              type="warning"
              message={exposureCoverage ? `市场 ${exposureCoverage.market}/${exposureCoverage.total} · 币种 ${exposureCoverage.currency}/${exposureCoverage.total} · 行业 0/${exposureCoverage.total}` : '暴露元数据不可用'}
              description="市场与币种只显示加载器返回的规范化元数据；当前没有逐标的真实行业合同，因此行业保持 UNKNOWN，不从代码、名称或板块榜单推断。"
            />
            <Table
              rowKey="asset_id"
              size="small"
              pagination={false}
              style={{ marginTop: 12 }}
              scroll={{ x: 620 }}
              dataSource={weightedAssets}
              columns={[
                { title: '资产', dataIndex: 'asset_id' },
                { title: '校准权重', dataIndex: 'weight', render: (value: number) => pct(value) },
                { title: '市场', dataIndex: ['provenance', 'market'], render: (value?: string | null) => value || <Tag>UNKNOWN</Tag> },
                { title: '币种', dataIndex: ['provenance', 'currency'], render: (value?: string | null) => value || <Tag>UNKNOWN</Tag> },
                { title: '行业', render: () => <Tag>UNKNOWN</Tag> },
              ]}
            />
          </Card>

          <Card size="small" title="风险跟踪动作" style={{ marginTop: 12 }}>
            <Alert type="info" message="所有动作都需要显式确认" description="预警入口只预填标的和风险证据，不创建规则；复盘待办只在本机保存派生摘要和时间，不保存行情曲线。" />
            <Space wrap style={{ marginTop: 12 }}>
              <Button
                type="primary"
                href={`/alerts?${new URLSearchParams({
                  new: '1',
                  ticker: weightedAssets[0]?.symbol ?? '',
                  name: `${portfolioName} · 集中度复核`,
                  source: 'portfolio',
                  portfolio: portfolioName,
                  metric: 'concentration',
                  value: pct(result.risk_xray.concentration.largest_weight),
                  as_of: weightedAssets[0]?.provenance.as_of ?? 'UNKNOWN',
                }).toString()}`}
              >去预警中心</Button>
              <Button onClick={addReview}>创建 7 天复盘待办</Button>
            </Space>
          </Card>

          <Card
            size="small"
            title="四种优化器只读比较"
            style={{ marginTop: 12 }}
          >
            <Alert
              type="info"
              message="仅优化器不同，不推荐或采用任何方案"
              description="资产、日频 MA20/50、60 期校准、800 条行情、初始资金、佣金和滑点保持一致；所有权重都只是历史模拟，不修改真实持仓。"
            />
            <Button loading={comparisonLoading} onClick={() => void compareOptimizers()} style={{ marginTop: 12 }}>比较四种优化器</Button>
            {comparisons.filter((item) => item.error).map((item) => (
              <Alert key={item.optimizer} type="warning" message={`${item.label}不可用：${item.error}`} style={{ marginTop: 8 }} />
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
                  { title: '优化器与假设', width: 250, render: (_: unknown, item: OptimizerComparison) => <><Text strong>{item.label}</Text><div><Text type="secondary">{item.assumption}</Text></div></> },
                  { title: '总收益', render: (_: unknown, item: OptimizerComparison) => item.result ? signedPct(item.result.metrics.total_return) : '—' },
                  { title: '最大回撤', render: (_: unknown, item: OptimizerComparison) => item.result ? signedPct(item.result.metrics.max_drawdown) : '—' },
                  { title: '组合换手', render: (_: unknown, item: OptimizerComparison) => item.result?.metrics.turnover == null ? '不可用' : `${item.result.metrics.turnover.toFixed(3)}×` },
                  { title: '交易数', render: (_: unknown, item: OptimizerComparison) => item.result?.metrics.trade_count ?? '—' },
                  { title: '最大权重', render: (_: unknown, item: OptimizerComparison) => item.result ? pct(item.result.risk_xray.concentration.largest_weight) : '—' },
                  { title: '有效资产数', render: (_: unknown, item: OptimizerComparison) => item.result ? item.result.risk_xray.concentration.effective_asset_count.toFixed(3) : '—' },
                ]}
              />
            )}
          </Card>

          <Card size="small" title="风险 X 光（后端原始证据）" style={{ marginTop: 12 }}>
            <Row gutter={[12, 12]}>
              <Col xs={12} md={6}><Statistic title="有效资产数" value={result.risk_xray.concentration.effective_asset_count.toFixed(3)} /></Col>
              <Col xs={12} md={6}><Statistic title="最大权重" value={pct(result.risk_xray.concentration.largest_weight)} /></Col>
              <Col xs={12} md={6}><Statistic title="当前回撤" value={signedPct(result.risk_xray.drawdown.current)} /></Col>
              <Col xs={12} md={6}><Statistic title="历史 VaR" value={pct(result.risk_xray.tail_risk.var)} /></Col>
              <Col xs={12} md={6}><Statistic title="历史 ES" value={pct(result.risk_xray.tail_risk.expected_shortfall)} /></Col>
              <Col xs={12} md={6}><Statistic title="平均相关性" value={result.risk_xray.diversification.average_correlation?.toFixed(3) ?? '—'} /></Col>
              <Col xs={12} md={6}><Statistic title="分散化收益" value={pct(result.risk_xray.diversification.benefit)} /></Col>
            </Row>
            <Space wrap style={{ marginTop: 10 }}>
              <Tag>集中度：{concentrationLabels[result.risk_xray.concentration.level] ?? result.risk_xray.concentration.level}</Tag>
              <Tag>尾部风险：{result.risk_xray.tail_risk.status === 'ok' ? '可用' : '样本不足'} · n={result.risk_xray.tail_risk.observations}</Tag>
              <Tag>分散化：{diversificationLabels[result.risk_xray.diversification.status] ?? result.risk_xray.diversification.status}</Tag>
            </Space>
          </Card>

          <Table
            rowKey="asset_id"
            size="small"
            pagination={false}
            style={{ marginTop: 12 }}
            dataSource={result.assets}
            columns={[
              { title: '资产', dataIndex: 'asset_id' },
              { title: '校准权重', dataIndex: 'weight', render: (value: number) => pct(value) },
              { title: '提供方', dataIndex: ['provenance', 'provider'], render: (value?: string) => value || '—' },
              { title: '截止时间', dataIndex: ['provenance', 'as_of'], render: (value?: string) => value || '—' },
              { title: '质量状态', dataIndex: ['provenance', 'quality_flags'], render: (flags?: string[]) => flags?.length ? flags.join(', ') : '无附加标记' },
            ]}
            scroll={{ x: 700 }}
          />
          {result.warnings.length > 0 && (
            <List size="small" header={<Text strong>模拟警告</Text>} dataSource={result.warnings} renderItem={(warning) => <List.Item><Tag>{warning}</Tag></List.Item>} />
          )}
        </div>
      )}
      {reviewTasks.length > 0 && (
        <Card size="small" title="本地复盘待办" style={{ marginTop: 12 }}>
          <List dataSource={reviewTasks} renderItem={(task) => (
            <List.Item actions={[
              <Button key="complete" size="small" onClick={() => storeReviews(reviewTasks.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item))}>{task.completed ? '恢复' : '完成'}</Button>,
              <Button key="delete" size="small" danger onClick={() => { setDeletedReview(task); storeReviews(reviewTasks.filter((item) => item.id !== task.id)); }}>删除</Button>,
            ]}>
              <div><Text delete={task.completed} strong>{task.portfolio}</Text><div><Text type="secondary">{task.summary} · 复查 {task.dueAt.slice(0, 10)}</Text></div></div>
            </List.Item>
          )} />
        </Card>
      )}
      {deletedReview && (
        <Alert
          type="warning"
          message="复盘待办已移除"
          action={<Button size="small" onClick={() => { storeReviews([deletedReview, ...reviewTasks]); setDeletedReview(null); }}>撤销</Button>}
          style={{ marginTop: 12 }}
        />
      )}
    </Card>
  );
}
