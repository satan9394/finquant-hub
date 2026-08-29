import { Alert, Card, Col, Empty, Row, Select, Space, Statistic, Tag, Typography } from 'antd';

import {
  assessExperimentChange, compareExperimentMetrics, findComparablePresetRuns,
  isExperimentContextComparable,
} from '../../features/backtest/experiments';
import { STRATEGY_PRESETS, type StrategyPresetKey } from '../../features/backtest/presets';
import type { BacktestFormValues } from '../../features/backtest/validation';
import type { BacktestRun } from '../../types/research';
import { useLanguage } from '../../i18n/LanguageContext';

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
  const { t } = useLanguage();
  const candidates = history.filter((item) => item.is_saved && item.status === 'completed' && item.metrics);
  const baseline = candidates.find((item) => item.id === baselineId) ?? null;
  const setup = baseline ? assessExperimentChange(baseline.params, values, t) : null;
  const presetRuns = baseline ? findComparablePresetRuns(candidates, baseline.params) : null;
  const candidateComparable = Boolean(
    baseline && run?.status === 'completed' && run.id !== baseline.id
    && isExperimentContextComparable(baseline.params, run.params),
  );
  const metricComparison = candidateComparable && baseline && run
    ? compareExperimentMetrics(baseline, run)
    : null;

  return (
    <Card title={t('strategy.experiment.title')} className="surface-card" style={{ marginTop: 18 }} data-testid="experiment-workbench">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6 }}>{t('strategy.experiment.baseline')}</Text>
          <Select
            aria-label={t('strategy.experiment.baseline')}
            value={baselineId ?? undefined}
            placeholder={t('strategy.experiment.placeholder')}
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
            description={<><Text>{t('strategy.experiment.emptyTitle')}</Text><div><Text type="secondary">{t('strategy.experiment.emptyDescription')}</Text></div></>}
          />
        ) : (
          <>
            <Alert
              showIcon
              type={setup?.status === 'single' ? 'success' : setup?.status === 'multiple' ? 'warning' : 'info'}
              message={setup?.status === 'single' ? t('strategy.experiment.single') : setup?.status === 'multiple' ? t('strategy.experiment.multiple', { count: setup.differences.length }) : t('strategy.experiment.same')}
              description={setup?.status === 'same'
                ? t('strategy.experiment.sameDescription')
                : <Space wrap>{setup?.differences.map((item) => <Tag key={item.key}>{t('strategy.experiment.difference', { label: t(`strategy.experiment.field.${item.key}`), before: item.before, after: item.after })}</Tag>)}</Space>}
            />

            <div>
              <Text strong>{t('strategy.experiment.presetResults')}</Text>
              <div><Text type="secondary">{t('strategy.experiment.presetDescription')}</Text></div>
            </div>
            <Row gutter={[12, 12]}>
              {(Object.keys(STRATEGY_PRESETS) as StrategyPresetKey[]).map((key) => {
                const saved = presetRuns?.[key] ?? null;
                return (
                  <Col xs={24} md={8} key={key}>
                    <Card size="small" data-testid={`preset-${key}`} style={{ height: '100%' }}>
                      <Space wrap><Text strong>{t(`strategy.preset.${key}.label`)}</Text><Tag>{t(`strategy.preset.${key}.parameters`)}</Tag></Space>
                      {saved?.metrics ? (
                        <Space direction="vertical" size={2} style={{ display: 'flex', marginTop: 10 }}>
                          <Text>{t('strategy.experiment.result', { value: pct(saved.metrics.total_return) })}</Text>
                          <Text type="secondary">{t('strategy.experiment.resultDetail', { excess: pct(saved.metrics.excess_return), drawdown: pct(saved.metrics.max_drawdown), count: saved.metrics.trade_count })}</Text>
                          <Text type="secondary">{t('strategy.experiment.saved', { id: saved.id })}</Text>
                        </Space>
                      ) : <Tag style={{ marginTop: 10 }}>{t('strategy.experiment.notRun')}</Tag>}
                    </Card>
                  </Col>
                );
              })}
            </Row>

            {run?.status === 'completed' && run.id !== baseline.id && !candidateComparable && (
              <Alert type="warning" showIcon message={t('strategy.experiment.incomparable')} description={t('strategy.experiment.incomparableDescription')} />
            )}

            {metricComparison && (
              <div>
                <Text strong>{t('strategy.experiment.comparison')}</Text>
                <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
                  {metricComparison.map((metric) => {
                    const render = (value: number) => metric.format === 'percent' ? pct(value) : String(value);
                    const delta = metric.format === 'percent' ? pct(metric.delta) : `${metric.delta >= 0 ? '+' : ''}${metric.delta}`;
                    return (
                      <Col xs={12} lg={6} key={metric.key}>
                        <Card size="small" data-testid={`experiment-metric-${metric.key}`}>
                          <Statistic title={t(`strategy.metric.${metric.key === 'trade_count' ? 'tradeCount' : metric.key === 'total_return' ? 'totalReturn' : metric.key === 'excess_return' ? 'excessReturn' : 'maxDrawdown'}`)} value={render(metric.candidate)} />
                          <Text type="secondary">{t('strategy.experiment.delta', { baseline: render(metric.baseline), delta })}</Text>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              </div>
            )}
          </>
        )}
        <Text type="secondary">{t('strategy.experiment.notice')}</Text>
      </Space>
    </Card>
  );
}
