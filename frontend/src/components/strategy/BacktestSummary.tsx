import { Alert, Card, Col, Collapse, List, Row, Space, Statistic, Tag, Typography } from 'antd';

import { interpretBacktest, rankBacktestWarnings } from '../../features/backtest/interpretation';
import type { BacktestRun } from '../../types/research';
import FinancialMetric from '../FinancialMetric';

const { Text } = Typography;
const pct = (value: number | null | undefined) => value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

export default function BacktestSummary({ run }: { run: BacktestRun }) {
  if (!run.metrics) return null;
  const metrics = run.metrics;
  const result = interpretBacktest(run);
  const warnings = rankBacktestWarnings(run.warnings);
  const hasP1Diagnostics = metrics.max_drawdown_recovered !== undefined
    && 'trade_expectancy' in metrics
    && metrics.total_trading_cost !== undefined;
  const recovery = metrics.max_drawdown_recovered === undefined
    ? '—'
    : metrics.max_drawdown_recovered
      ? `已恢复 · ${metrics.max_drawdown_recovery_periods ?? 0}期`
      : `未恢复 · 已持续${metrics.max_drawdown_duration_periods ?? 0}期`;
  const costSummary = metrics.total_trading_cost === undefined
    ? '—'
    : `${metrics.total_trading_cost.toFixed(2)} · ${pct(metrics.trading_cost_ratio)}`;
  const professional = [
    ['年化收益', pct(metrics.annualized_return), '把区间收益换算为一年速度；短样本可能失真。', 'metric-annualized-return'],
    ['Sharpe', metrics.sharpe_ratio?.toFixed(3) ?? '—', '无风险收益按 0；策略平均单期收益相对总波动并按行情频率年化。', 'metric-sharpe'],
    ['Sortino', metrics.sortino_ratio?.toFixed(3) ?? '—', '目标收益按 0；策略平均单期收益相对下行波动并按行情频率年化。', 'metric-sortino'],
    ['Calmar', metrics.calmar_ratio?.toFixed(3) ?? '—', '年化收益相对最大回撤。', 'metric-calmar'],
    ['信息比率', metrics.information_ratio?.toFixed(3) ?? '—', '超额收益相对跟踪误差。', 'metric-information'],
    ['胜率', pct(metrics.win_rate), '盈利交易占完整交易的比例。', 'metric-win-rate'],
    ['盈亏比', metrics.profit_factor?.toFixed(3) ?? '—', '总盈利除以总亏损；无亏损时不可定义。', 'metric-profit-factor'],
    ['换手', `${metrics.turnover.toFixed(2)}×`, '累计成交金额相对初始资金。', 'metric-turnover'],
  ];
  const p1Diagnostics = [
    ['年化波动', pct(metrics.annualized_volatility), '按回测频率年化的策略收益标准差。', 'metric-annualized-volatility'],
    ['下行波动', pct(metrics.annualized_downside_volatility), '只统计负收益偏离，按回测频率年化。', 'metric-downside-volatility'],
    ['回撤持续', metrics.max_drawdown_duration_periods == null ? '—' : `${metrics.max_drawdown_duration_periods}期`, '从回撤前高点到恢复；未恢复时截至样本末端。', 'metric-drawdown-duration'],
    ['Beta', metrics.beta?.toFixed(3) ?? '—', '策略收益对买入持有基准收益的一元回归斜率。', 'metric-beta'],
    ['回归 Alpha', pct(metrics.alpha), '一元回归截距按频率年化；不是因子 Alpha。', 'metric-alpha'],
    ['R²', metrics.r_squared?.toFixed(3) ?? '—', '基准收益对策略收益波动的线性解释比例。', 'metric-r-squared'],
    ['Tracking Error', pct(metrics.tracking_error), '策略与基准收益差的年化标准差。', 'metric-tracking-error'],
    ['单笔期望', pct(metrics.trade_expectancy), '所有完整交易收益率的算术平均。', 'metric-trade-expectancy'],
    ['平均盈利 / 亏损', `${pct(metrics.average_win)} / ${pct(metrics.average_loss)}`, '分别只使用盈利和亏损的完整交易。', 'metric-average-win-loss'],
    ['平均持有期', metrics.average_holding_periods == null ? '—' : `${metrics.average_holding_periods.toFixed(1)}期`, '按行情 bar 数计算，不等同于自然日。', 'metric-average-holding'],
    ['市场暴露', pct(metrics.market_exposure), '样本 bar 中收盘时持仓的比例。', 'metric-market-exposure'],
    ['成交总成本 / 初始资金', costSummary, `佣金 ${metrics.total_commission_cost?.toFixed(2) ?? '—'} · 印花税 ${metrics.total_stamp_duty_cost?.toFixed(2) ?? '—'} · 滑点 ${metrics.total_slippage_cost?.toFixed(2) ?? '—'}`, 'metric-trading-cost'],
  ];

  return (
    <>
      <Alert type={result.type} showIcon message={result.message} description={result.description} style={{ marginBottom: 14 }} />
      <Row gutter={[12, 12]}>
        {[
          ['总收益', pct(run.metrics.total_return), 'metric-total-return'],
          ['基准收益', pct(run.metrics.benchmark_return), 'metric-benchmark-return'],
          ['超额收益', pct(run.metrics.excess_return), 'metric-excess-return'],
          ['最大回撤', pct(run.metrics.max_drawdown), 'metric-max-drawdown'],
          ['恢复情况', recovery, 'metric-recovery'],
          ['交易数', String(run.metrics.trade_count), 'metric-trade-count'],
        ].map(([label, value, testId]) => (
          <Col xs={12} sm={8} lg={6} xl={4} key={label}>
            <Card size="small" className="metric-card" data-testid={testId}>
              <FinancialMetric
                label={label}
                value={value}
                period="回测区间"
                quality="OK"
                tone={label === '最大回撤' ? 'risk' : label === '总收益' || label === '超额收益' ? (String(value).startsWith('+') ? 'up' : 'down') : 'neutral'}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {result.reasons.length ? (
        <Card size="small" title="主要限制（按决策优先级）" style={{ marginTop: 12 }}>
          <List size="small" dataSource={result.reasons} renderItem={(reason, index) => (
            <List.Item><Space align="start"><Tag color="red">{index + 1}</Tag><div><Text strong>{reason.title}</Text><div><Text type="secondary">{reason.detail}</Text></div></div></Space></List.Item>
          )} />
        </Card>
      ) : null}

      {warnings.length ? (
        <Card size="small" title="数据与执行限制" style={{ marginTop: 12 }}>
          <List size="small" dataSource={warnings} renderItem={(warning) => (
            <List.Item><div><Space wrap><Text strong>{warning.label}</Text><Tag>{warning.code}</Tag></Space><div><Text type="secondary">{warning.detail}</Text></div></div></List.Item>
          )} />
        </Card>
      ) : null}

      {!hasP1Diagnostics ? (
        <Alert
          type="info"
          showIcon
          message="历史结果未包含 P1 诊断"
          description="请重新运行相同参数后查看恢复期、基准归因和逐笔成本；本页不会从旧结果推算。"
          style={{ marginTop: 12 }}
        />
      ) : null}

      <Collapse
        style={{ marginTop: 12 }}
        items={[
          {
            key: 'p1-diagnostics',
            label: 'P1 风险、基准归因与交易质量',
            children: <Row gutter={[12, 12]}>{p1Diagnostics.map(([label, value, explanation, testId]) => (
              <Col xs={24} sm={12} lg={6} key={label}>
                <Card size="small" data-testid={testId}><Statistic title={label} value={value} /><Text type="secondary">{explanation}</Text></Card>
              </Col>
            ))}</Row>,
          },
          {
            key: 'professional',
            label: '专业指标与通俗解释',
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
