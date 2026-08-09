import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Alert, Button, Card, Col, Descriptions, Empty, Form, Input, InputNumber, List, Row, Space,
  Select, Statistic, Steps, Table, Tag, Typography, message,
} from 'antd';
import { ExperimentOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import BacktestCharts from '../components/research/BacktestCharts';
import { validateBacktestForm, type BacktestFormErrors, type BacktestFormValues } from '../features/backtest/validation';
import {
  createBacktest, fetchBacktest, fetchInstrumentBars, listBacktests, saveBacktest,
} from '../services/researchApi';
import { fetchMarketPulse } from '../services/marketDiscoveryApi';
import type { BacktestRun, BacktestTrade, Bar } from '../types/research';
import type { WeeklyMarketMover } from '../types';

const { Title, Text, Paragraph } = Typography;
const runningStates = ['queued', 'loading_data', 'running', 'calculating_metrics'];
const statusLabels: Record<string, string> = {
  queued: '已排队',
  loading_data: '加载真实行情',
  running: '执行交易模拟',
  calculating_metrics: '计算指标',
  completed: '回测完成',
  failed: '回测失败',
  cancelled: '已取消',
};
const warningLabels: Record<string, string> = {
  partial_history: '提供方返回的历史长度少于请求长度',
  position_forced_closed_at_end: '期末持仓按最后收盘价并计入费用后强制平仓',
  no_trades_in_period: '当前参数在区间内没有触发完整交易',
  profit_factor_undefined_without_losses: '区间内没有亏损交易，盈亏比不可定义',
  unadjusted_prices: '行情序列未复权，公司行动可能影响结果',
  position_open_at_end_due_to_t_plus_one: '期末买入仓位受 T+1 约束，按市值保留未实现收益',
  position_open_at_end_due_to_limit_down: '期末跌停无法成交，按市值保留未实现收益',
};

const initialValues = (symbol: string): BacktestFormValues => ({
  symbol: symbol || 'AAPL',
  start_date: dayjs().subtract(2, 'year').format('YYYY-MM-DD'),
  end_date: dayjs().format('YYYY-MM-DD'),
  short_window: 20,
  long_window: 50,
  initial_capital: 100000,
  commission_bps: 2.5,
  slippage_bps: 2,
  sell_stamp_duty_bps: 10,
  minimum_commission_cny: 5,
  max_drawdown_stop_pct: 0,
  benchmark: 'buy_and_hold',
});

const feePresets = {
  eastmoney_cn: {
    label: '东方财富证券 A 股参考', commission_bps: 2.5, slippage_bps: 2,
    sell_stamp_duty_bps: 10, minimum_commission_cny: 5,
    note: '佣金万 2.5、卖出印花税千 1、单笔最低佣金 ¥5；实际佣金以账户交割单为准。',
  },
  custom: {
    label: '自定义成本', commission_bps: 3, slippage_bps: 2,
    sell_stamp_duty_bps: 0, minimum_commission_cny: 0,
    note: '自定义值会写入本次回测参数。',
  },
} as const;

const strategyPresets = {
  steady: { label: '稳健 · MA30/90 · 回撤止损 12%', short_window: 30, long_window: 90, max_drawdown_stop_pct: 0.12 },
  standard: { label: '标准 · MA20/50 · 不设止损', short_window: 20, long_window: 50, max_drawdown_stop_pct: 0 },
  active: { label: '进取 · MA10/30 · 回撤止损 8%', short_window: 10, long_window: 30, max_drawdown_stop_pct: 0.08 },
} as const;

function pct(value: number | null | undefined) {
  return value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

export default function StrategyLab() {
  const [searchParams] = useSearchParams();
  const [values, setValues] = useState<BacktestFormValues>(() => initialValues(searchParams.get('symbol') ?? ''));
  const [errors, setErrors] = useState<BacktestFormErrors>({});
  const [run, setRun] = useState<BacktestRun | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [running, setRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [history, setHistory] = useState<BacktestRun[]>([]);
  const [feePreset, setFeePreset] = useState<keyof typeof feePresets>('eastmoney_cn');
  const [strategyPreset, setStrategyPreset] = useState<keyof typeof strategyPresets>('standard');
  const [referenceCandidates, setReferenceCandidates] = useState<WeeklyMarketMover[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const pollToken = useRef(0);

  const loadHistory = async () => {
    try {
      setHistory(await listBacktests(true));
    } catch (error: any) {
      setRequestError(error.message || '加载已保存回测失败');
    }
  };

  useEffect(() => { void loadHistory(); }, []);

  const loadReferences = async () => {
    setReferenceLoading(true);
    try {
      const pulse = await fetchMarketPulse(12, 8, 0);
      setReferenceCandidates([...(pulse.sections.weekly.items ?? [])]
        .sort((a, b) => Math.abs(b.weekly_change_percent) - Math.abs(a.weekly_change_percent))
        .slice(0, 6));
    } catch {
      setReferenceCandidates([]);
    } finally {
      setReferenceLoading(false);
    }
  };

  useEffect(() => { void loadReferences(); }, []);

  const update = <K extends keyof BacktestFormValues>(key: K, value: BacktestFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const chooseReference = async (item: WeeklyMarketMover) => {
    try {
      const history = await fetchInstrumentBars(item.code, 60);
      if (history.items.length < 60) throw new Error('历史数据不足');
      update('symbol', item.code.toUpperCase());
      message.success(`已带入 ${item.name}，历史 K 线可用于回测`);
    } catch {
      message.warning(`${item.name} 当前公开历史 K 线不足，保留为观察候选，不带入回测。`);
    }
  };

  const applyFeePreset = (preset: keyof typeof feePresets) => {
    setFeePreset(preset);
    const values = feePresets[preset];
    setValues((current) => ({
      ...current,
      commission_bps: values.commission_bps,
      slippage_bps: values.slippage_bps,
      sell_stamp_duty_bps: values.sell_stamp_duty_bps,
      minimum_commission_cny: values.minimum_commission_cny,
    }));
  };

  const applyStrategyPreset = (preset: keyof typeof strategyPresets) => {
    setStrategyPreset(preset);
    const selected = strategyPresets[preset];
    setValues((current) => ({ ...current, ...selected }));
  };

  const watchedSymbols = useMemo(() => {
    try {
      const items = JSON.parse(localStorage.getItem('finquant_watchlist') || '[]') as Array<{ code: string; name: string }>;
      return items.slice(0, 12);
    } catch { return []; }
  }, []);

  const poll = async (id: number, token: number) => {
    for (let attempt = 0; attempt < 240 && pollToken.current === token; attempt += 1) {
      const latest = await fetchBacktest(id);
      setRun(latest);
      if (!runningStates.includes(latest.status)) {
        if (latest.status === 'completed') {
          const history = await fetchInstrumentBars(latest.symbol, 800);
          setBars(history.items.filter((bar) => (
            latest.params.start_date <= bar.day.slice(0, 10) && bar.day.slice(0, 10) <= latest.params.end_date
          )));
        }
        return latest;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    throw new Error('等待回测完成超时');
  };

  const execute = async () => {
    const nextErrors = validateBacktestForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setRunning(true);
    setRequestError(null);
    setBars([]);
    const token = ++pollToken.current;
    try {
      const queued = await createBacktest(values);
      setRun(queued);
      const completed = await poll(queued.id, token);
      if (completed.status === 'failed') throw new Error(completed.error_message || '回测失败');
      if (completed.status === 'completed') message.success('双均线回测已完成');
    } catch (error: any) {
      setRequestError(error.message || '回测请求失败');
    } finally {
      if (pollToken.current === token) setRunning(false);
    }
  };

  const save = async () => {
    if (!run) return;
    try {
      await saveBacktest(run.id);
      setRun({ ...run, is_saved: true });
      await loadHistory();
      message.success('回测结果已保存');
    } catch (error: any) {
      message.error(error.message || '保存失败');
    }
  };

  const openSavedRun = async (item: BacktestRun) => {
    setRun(item);
    setValues(item.params);
    setRequestError(null);
    try {
      const historyPayload = await fetchInstrumentBars(item.symbol, 800);
      setBars(historyPayload.items.filter((bar) => (
        item.params.start_date <= bar.day.slice(0, 10) && bar.day.slice(0, 10) <= item.params.end_date
      )));
    } catch (error: any) {
      setRequestError(error.message || '加载已保存回测行情失败');
    }
  };

  const stepIndex = useMemo(() => {
    if (!run) return 0;
    return Math.max(0, ['queued', 'loading_data', 'running', 'calculating_metrics', 'completed'].indexOf(run.status));
  }, [run]);

  const decision = useMemo(() => {
    if (run?.status !== 'completed' || !run.metrics) return null;
    const robust = run.metrics.total_return > 0 && run.metrics.max_drawdown >= -0.2 && run.metrics.trade_count >= 5;
    return robust
      ? { type: 'success' as const, message: '可继续验证', description: '收益为正、回撤受控且交易样本足够；仍需结合稳健性统计和真实账户成本判断。' }
      : { type: 'warning' as const, message: '暂不建议据此交易', description: '当前收益、回撤或交易样本未达到基础门槛；可比较策略预设和更长区间，而非据此下单。' };
  }, [run]);

  const tradeColumns = [
    { title: '买入日', dataIndex: 'entry_time', key: 'entry_time' },
    { title: '卖出日', dataIndex: 'exit_time', key: 'exit_time' },
    { title: '买入价', dataIndex: 'entry_price', key: 'entry_price', render: (value: number) => value.toFixed(4) },
    { title: '卖出价', dataIndex: 'exit_price', key: 'exit_price', render: (value: number) => value.toFixed(4) },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', render: (value: number) => value.toFixed(4) },
    { title: '总费用', key: 'fees', render: (_: unknown, item: BacktestTrade) => (item.entry_fee + item.exit_fee).toFixed(2) },
    { title: '净收益', dataIndex: 'pnl', key: 'pnl', render: (value: number) => <Text className={value >= 0 ? 'price-up' : 'price-down'}>{value.toFixed(2)}</Text> },
    { title: '收益率', dataIndex: 'return', key: 'return', render: (value: number) => pct(value) },
  ];

  return (
    <main className="product-page" data-testid="ma-crossover-lab">
      <section className="page-hero compact-hero lab-hero">
        <Text className="eyebrow">STRATEGY LAB · EXECUTABLE</Text>
        <Title level={2}><ExperimentOutlined /> 双均线策略实验室</Title>
        <Paragraph>信号在当日收盘确认，下一交易日开盘执行；结果扣除佣金与滑点，不触发真实交易。</Paragraph>
      </section>

      <Card
        title="我的自选股"
        className="surface-card"
        style={{ marginBottom: 18 }}
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>优先从已跟踪的标的开始；点击后会带入本次回测。</Paragraph>
        <Space wrap>
          {watchedSymbols.map((item) => <Button key={item.code} onClick={() => update('symbol', item.code.toUpperCase())}>{item.name} · {item.code.toUpperCase()}</Button>)}
          {!watchedSymbols.length && <Text type="secondary">尚无自选股，可先从仪表盘搜索并添加。</Text>}
        </Space>
      </Card>

      <Card
        title="从市场雷达选择参考标的"
        className="surface-card"
        style={{ marginBottom: 18 }}
        extra={<Button size="small" icon={<ReloadOutlined spin={referenceLoading} />} onClick={() => void loadReferences()}>刷新候选</Button>}
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          候选来自东方财富周异动公开数据，默认按一周绝对涨跌幅降序。它们只是研究起点；带入后仍需查看回测、回撤和稳健性。
        </Paragraph>
        <Space wrap>
          {referenceCandidates.map((item) => (
            <Button key={item.code} onClick={() => void chooseReference(item)}>
              {item.name} · 周{pct(item.weekly_change_percent / 100)}
            </Button>
          ))}
          {!referenceLoading && !referenceCandidates.length && <Text type="secondary">暂无可验证的周异动候选，可直接输入代码。</Text>}
        </Space>
      </Card>

      <Card title="回测参数" className="surface-card" data-testid="backtest-form">
        <Form layout="vertical">
          <Row gutter={[14, 0]}>
            <Col xs={24} md={8} xl={6}>
              <Form.Item label="股票代码" validateStatus={errors.symbol ? 'error' : ''} help={errors.symbol}>
                <Input aria-label="股票代码" value={values.symbol} onChange={(event) => update('symbol', event.target.value.toUpperCase())} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8} xl={6}>
              <Form.Item label="开始日期">
                <Input aria-label="开始日期" type="date" value={values.start_date} onChange={(event) => update('start_date', event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8} xl={6}>
              <Form.Item label="结束日期" validateStatus={errors.end_date ? 'error' : ''} help={errors.end_date}>
                <Input aria-label="结束日期" type="date" value={values.end_date} onChange={(event) => update('end_date', event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={3}>
              <Form.Item label="短均线" validateStatus={errors.short_window ? 'error' : ''} help={errors.short_window}>
                <InputNumber aria-label="短均线" min={2} value={values.short_window} onChange={(value) => update('short_window', Number(value ?? 0))} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Form.Item label="策略预设">
                <Select aria-label="策略预设" value={strategyPreset} onChange={applyStrategyPreset} options={Object.entries(strategyPresets).map(([value, preset]) => ({ value, label: preset.label }))} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={3}>
              <Form.Item label="长均线" validateStatus={errors.long_window ? 'error' : ''} help={errors.long_window}>
                <InputNumber aria-label="长均线" min={3} value={values.long_window} onChange={(value) => update('long_window', Number(value ?? 0))} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={6}>
              <Form.Item label="初始资金" validateStatus={errors.initial_capital ? 'error' : ''} help={errors.initial_capital}>
                <InputNumber aria-label="初始资金" min={1} value={values.initial_capital} onChange={(value) => update('initial_capital', Number(value ?? 0))} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={4}>
              <Form.Item label="成本预设">
                <Select aria-label="成本预设" value={feePreset} onChange={applyFeePreset} options={Object.entries(feePresets).map(([value, preset]) => ({ value, label: preset.label }))} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={4}>
              <Form.Item label="手续费（bps）" validateStatus={errors.commission_bps ? 'error' : ''} help={errors.commission_bps}>
                <InputNumber aria-label="手续费" min={0} step={0.1} value={values.commission_bps} onChange={(value) => { setFeePreset('custom'); update('commission_bps', Number(value ?? 0)); }} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={4}>
              <Form.Item label="滑点（bps）" validateStatus={errors.slippage_bps ? 'error' : ''} help={errors.slippage_bps}>
                <InputNumber aria-label="滑点" min={0} value={values.slippage_bps} onChange={(value) => { setFeePreset('custom'); update('slippage_bps', Number(value ?? 0)); }} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={4}>
              <Form.Item label="卖出印花税（bps）" validateStatus={errors.sell_stamp_duty_bps ? 'error' : ''} help={errors.sell_stamp_duty_bps}>
                <InputNumber aria-label="卖出印花税" min={0} value={values.sell_stamp_duty_bps} onChange={(value) => { setFeePreset('custom'); update('sell_stamp_duty_bps', Number(value ?? 0)); }} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={4}>
              <Form.Item label="最低佣金（¥）" validateStatus={errors.minimum_commission_cny ? 'error' : ''} help={errors.minimum_commission_cny}>
                <InputNumber aria-label="最低佣金" min={0} value={values.minimum_commission_cny} onChange={(value) => { setFeePreset('custom'); update('minimum_commission_cny', Number(value ?? 0)); }} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={4}>
              <Form.Item label="回撤止损（%）" validateStatus={errors.max_drawdown_stop_pct ? 'error' : ''} help={errors.max_drawdown_stop_pct}>
                <InputNumber aria-label="回撤止损" min={0} max={99} value={values.max_drawdown_stop_pct * 100} onChange={(value) => update('max_drawdown_stop_pct', Number(value ?? 0) / 100)} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={5}>
              <Form.Item label="基准">
                <Input aria-label="基准" value="买入并持有" disabled />
              </Form.Item>
            </Col>
            <Col xs={24} xl={5} className="form-action-col">
              <Button type="primary" size="large" icon={run?.status === 'completed' ? <ReloadOutlined /> : <ExperimentOutlined />} loading={running} onClick={() => void execute()} block>
                {run?.status === 'completed' ? '重新运行' : '运行回测'}
              </Button>
            </Col>
          </Row>
        </Form>
        <Text type="secondary">{feePresets[feePreset].note} 印花税与最低佣金仅对 A 股规则生效；回撤止损为 0 时关闭，开启后收盘触发、下一交易日开盘尝试退出。</Text>
      </Card>

      <Card title="已保存回测" className="surface-card" style={{ marginTop: 18 }} data-testid="saved-backtests">
        {history.length ? (
          <List
            dataSource={history}
            renderItem={(item) => (
              <List.Item actions={[<Button key="view" onClick={() => void openSavedRun(item)}>查看结果</Button>]}>
                <List.Item.Meta
                  title={<Space><Text strong>{item.symbol}</Text><Tag>MA{item.params.short_window}/MA{item.params.long_window}</Tag><Tag color="green">{statusLabels[item.status]}</Tag></Space>}
                  description={`${item.params.start_date} 至 ${item.params.end_date} · ${item.metrics ? `总收益 ${pct(item.metrics.total_return)}` : '等待结果'}`}
                />
              </List.Item>
            )}
          />
        ) : <Empty description="暂无已保存回测" />}
      </Card>

      {requestError && <Alert type="error" showIcon message={requestError} style={{ marginTop: 16 }} />}

      {run && (
        <Card className="surface-card" style={{ marginTop: 18 }} title={`运行 #${run.id} · ${statusLabels[run.status] ?? run.status}`}>
          <Steps
            current={stepIndex}
            status={run.status === 'failed' ? 'error' : run.status === 'completed' ? 'finish' : 'process'}
            size="small"
            items={['queued', 'loading_data', 'running', 'calculating_metrics', 'completed'].map((state) => ({ title: statusLabels[state] }))}
          />
        </Card>
      )}

      {run?.status === 'completed' && run.metrics && (
        <section data-testid="backtest-completed">
          <div className="result-heading">
            <div><Text className="eyebrow">RESULT</Text><Title level={3}>回测已完成</Title></div>
            <Button type="primary" icon={<SaveOutlined />} disabled={run.is_saved} onClick={() => void save()}>
              {run.is_saved ? '已保存' : '保存结果'}
            </Button>
          </div>

          {decision && <Alert type={decision.type} showIcon message={decision.message} description={decision.description} style={{ marginBottom: 14 }} />}

          <Row gutter={[12, 12]}>
            {[
              ['总收益', pct(run.metrics.total_return), 'metric-total-return'],
              ['年化收益', pct(run.metrics.annualized_return), 'metric-annualized-return'],
              ['基准收益', pct(run.metrics.benchmark_return), 'metric-benchmark-return'],
              ['超额收益', pct(run.metrics.excess_return), 'metric-excess-return'],
              ['最大回撤', pct(run.metrics.max_drawdown), 'metric-max-drawdown'],
              ['Sharpe', run.metrics.sharpe_ratio?.toFixed(3) ?? '—', 'metric-sharpe'],
              ['Sortino', run.metrics.sortino_ratio?.toFixed(3) ?? '—', 'metric-sortino'],
              ['Calmar', run.metrics.calmar_ratio?.toFixed(3) ?? '—', 'metric-calmar'],
              ['信息比率', run.metrics.information_ratio?.toFixed(3) ?? '—', 'metric-information'],
              ['胜率', pct(run.metrics.win_rate), 'metric-win-rate'],
              ['盈亏比', run.metrics.profit_factor?.toFixed(3) ?? '—', 'metric-profit-factor'],
              ['换手', `${run.metrics.turnover.toFixed(2)}×`, 'metric-turnover'],
              ['交易数', String(run.metrics.trade_count), 'metric-trade-count'],
            ].map(([label, value, testId]) => (
              <Col xs={12} sm={8} lg={6} xl={3} key={label}>
                <Card size="small" className="metric-card" data-testid={testId}><Statistic title={label} value={value} /></Card>
              </Col>
            ))}
          </Row>

          <Card title="曲线与成交点" className="surface-card" style={{ marginTop: 18 }}>
            <BacktestCharts run={run} bars={bars} />
          </Card>

          {run.validation && (
            <Card title="统计显著性与稳健性" className="surface-card" style={{ marginTop: 18 }}>
              <Descriptions column={{ xs: 1, md: 3 }} size="small">
                <Descriptions.Item label="Bootstrap 置信区间">
                  {pct(run.validation.bootstrap.confidence_interval[0])} ～ {pct(run.validation.bootstrap.confidence_interval[1])}
                </Descriptions.Item>
                <Descriptions.Item label="Bootstrap 正收益概率">
                  {pct(run.validation.bootstrap.probability_positive)}
                </Descriptions.Item>
                <Descriptions.Item label="Monte Carlo 中位收益">
                  {pct(run.validation.monte_carlo.terminal_return.median)}
                </Descriptions.Item>
                <Descriptions.Item label="Monte Carlo 亏损概率">
                  {pct(run.validation.monte_carlo.probability_loss)}
                </Descriptions.Item>
                <Descriptions.Item label="Walk-forward 正收益折数">
                  {run.validation.walk_forward.status === 'ok'
                    ? pct(run.validation.walk_forward.positive_fold_ratio)
                    : '样本不足'}
                </Descriptions.Item>
                <Descriptions.Item label="Walk-forward 折数">
                  {run.validation.walk_forward.fold_count ?? '—'}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          <Row gutter={[18, 18]} style={{ marginTop: 18 }}>
            <Col xs={24} xl={15}>
              <Card title={`交易明细 · ${run.trades?.length ?? 0}`} className="surface-card" data-testid="trades-table">
                <Table<BacktestTrade>
                  rowKey={(item) => `${item.entry_time}-${item.exit_time}`}
                  dataSource={run.trades ?? []}
                  columns={tradeColumns}
                  pagination={false}
                  scroll={{ x: 900 }}
                  locale={{ emptyText: '当前参数没有产生交易' }}
                  size="small"
                />
              </Card>
            </Col>
            <Col xs={24} xl={9}>
              <Card title="参数与数据来源" className="surface-card">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="标的">{run.symbol}</Descriptions.Item>
                  <Descriptions.Item label="区间">{run.params.start_date} 至 {run.params.end_date}</Descriptions.Item>
                  <Descriptions.Item label="均线">MA{run.params.short_window} / MA{run.params.long_window}</Descriptions.Item>
                <Descriptions.Item label="费用">佣金 {run.params.commission_bps} bps + 滑点 {run.params.slippage_bps} bps</Descriptions.Item>
                  <Descriptions.Item label="A股税费">卖出印花税 {run.params.sell_stamp_duty_bps ?? 0} bps · 最低佣金 ¥{run.params.minimum_commission_cny ?? 0}</Descriptions.Item>
                  <Descriptions.Item label="回撤控制">
                    {run.risk_controls?.max_drawdown_stop_pct
                      ? `${pct(run.risk_controls.max_drawdown_stop_pct)} · 触发 ${run.risk_controls.trigger_count} 次`
                      : '关闭（仅报告回撤）'}
                  </Descriptions.Item>
                  <Descriptions.Item label="交易规则">
                    {run.execution_rules?.market === 'CN'
                      ? `A股 T+1 · 禁做空 · 涨跌停 ${pct(run.execution_rules.price_limit_ratio)}`
                      : '通用长仓规则'}
                  </Descriptions.Item>
                  <Descriptions.Item label="拒单数">{run.rejected_orders?.length ?? 0}</Descriptions.Item>
                  <Descriptions.Item label="提供方">{run.provenance?.provider ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="截止时间">{run.provenance?.as_of ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="时区">{run.provenance?.timezone ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="复权/频率">{run.provenance?.adjustment ?? '—'} / {run.provenance?.frequency ?? '—'}</Descriptions.Item>
                </Descriptions>
              </Card>
              <Card title="回测警告" className="surface-card" style={{ marginTop: 18 }}>
                <Space wrap>{(run.warnings?.length ? run.warnings : ['none']).map((warning) => (
                  <Tag key={warning} color={warning === 'none' ? 'green' : 'gold'}>{warning === 'none' ? '无警告' : warning === 'max_drawdown_stop_triggered' ? '回撤止损已触发' : warningLabels[warning] ?? warning}</Tag>
                ))}</Space>
              </Card>
            </Col>
          </Row>
        </section>
      )}
    </main>
  );
}
