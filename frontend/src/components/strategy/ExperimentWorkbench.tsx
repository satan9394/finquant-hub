import { Alert, Card, Col, Empty, Row, Select, Space, Statistic, Tag, Typography } from 'antd';

import {
  assessExperimentChange, compareExperimentMetrics, findComparablePresetRuns,
  isExperimentContextComparable,
} from '../../features/backtest/experiments';
import { STRATEGY_PRESETS, type StrategyPresetKey } from '../../features/backtest/presets';
import type { BacktestFormValues } from '../../features/backtest/validation';
import type { BacktestRun } from '../../types/research';

const { Text } = Typography;
const pct = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

export default function ExperimentWorkbench({
  values, history, run, baselineId, onBaselineChange,
}: {
  values: BacktestFormValues;
  history: BacktestRun[];
  run: BacktestRun | null;
  baselineId: number | null;
  onBaselineChange: (id: number | null) => void;
}) {
  const candidates = history.filter((item) => item.is_saved && item.status === 'completed' && item.metrics);
  const baseline = candidates.find((item) => item.id === baselineId) ?? null;
  const setup = baseline ? assessExperimentChange(baseline.params, values) : null;
  const presetRuns = baseline ? findComparablePresetRuns(candidates, baseline.params) : null;
  const candidateComparable = Boolean(
    baseline && run?.status === 'completed' && run.id !== baseline.id
    && isExperimentContextComparable(baseline.params, run.params),
  );
  const metricComparison = candidateComparable && baseline && run
    ? compareExperimentMetrics(baseline, run)
    : null;

  return (
    <Card title="3. 比较并保存实验" className="surface-card" style={{ marginTop: 18 }} data-testid="experiment-workbench">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6 }}>实验基准</Text>
          <Select
            aria-label="实验基准"
            value={baselineId ?? undefined}
            placeholder="选择已保存实验"
            style={{ width: '100%', maxWidth: 520 }}
            options={candidates.map((item) => ({
              value: item.id,
              label: `#${item.id} · ${item.symbol} · MA${item.params.short_window}/${item.params.long_window}`,
            }))}
            onChange={(id) => onBaselineChange(id)}
            allowClear
            onClear={() => onBaselineChange(null)}
          />
        </div>

        {!baseline ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<><Text>先选择一个已保存实验作为基准</Text><div><Text type="secondary">这里只读取真实结果，不会自动运行或保存。</Text></div></>}
          />
        ) : (
          <>
            <Alert
              showIcon
              type={setup?.status === 'single' ? 'success' : setup?.status === 'multiple' ? 'warning' : 'info'}
              message={setup?.status === 'single' ? '单参数实验可归因' : setup?.status === 'multiple' ? `当前同时改变 ${setup.differences.length} 项` : '当前参数与基准相同'}
              description={setup?.status === 'same'
                ? '修改一个参数后再运行，可更清楚地解释结果差异。'
                : <Space wrap>{setup?.differences.map((item) => <Tag key={item.key}>{item.label}：{item.before} → {item.after}</Tag>)}</Space>}
            />

            <div>
              <Text strong>同口径预设结果</Text>
              <div><Text type="secondary">仅匹配相同标的、区间、资金、成本和基准的已保存结果。</Text></div>
            </div>
            <Row gutter={[12, 12]}>
              {(Object.keys(STRATEGY_PRESETS) as StrategyPresetKey[]).map((key) => {
                const item = STRATEGY_PRESETS[key];
                const saved = presetRuns?.[key] ?? null;
                return (
                  <Col xs={24} md={8} key={key}>
                    <Card size="small" data-testid={`preset-${key}`} style={{ height: '100%' }}>
                      <Space wrap><Text strong>{item.label}</Text><Tag>{item.parameters}</Tag></Space>
                      {saved?.metrics ? (
                        <Space direction="vertical" size={2} style={{ display: 'flex', marginTop: 10 }}>
                          <Text>总收益 {pct(saved.metrics.total_return)}</Text>
                          <Text type="secondary">超额 {pct(saved.metrics.excess_return)} · 回撤 {pct(saved.metrics.max_drawdown)} · {saved.metrics.trade_count} 笔</Text>
                          <Text type="secondary">已保存实验 #{saved.id}</Text>
                        </Space>
                      ) : <Tag style={{ marginTop: 10 }}>未运行（当前口径）</Tag>}
                    </Card>
                  </Col>
                );
              })}
            </Row>

            {run?.status === 'completed' && run.id !== baseline.id && !candidateComparable && (
              <Alert type="warning" showIcon message="当前结果与基准口径不同" description="标的、区间、资金、成本或基准不一致，因此不展示指标差异。" />
            )}

            {metricComparison && (
              <div>
                <Text strong>当前完成结果 vs. 实验基准</Text>
                <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
                  {metricComparison.map((metric) => {
                    const render = (value: number) => metric.format === 'percent' ? pct(value) : String(value);
                    const delta = metric.format === 'percent' ? pct(metric.delta) : `${metric.delta >= 0 ? '+' : ''}${metric.delta}`;
                    return (
                      <Col xs={12} lg={6} key={metric.key}>
                        <Card size="small" data-testid={`experiment-metric-${metric.key}`}>
                          <Statistic title={metric.label} value={render(metric.candidate)} />
                          <Text type="secondary">基准 {render(metric.baseline)} · 变化 {delta}</Text>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              </div>
            )}
          </>
        )}
        <Text type="secondary">运行只生成新结果；点击结果区“保存实验”后才会持久化。</Text>
      </Space>
    </Card>
  );
}
