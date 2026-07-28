import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Alert, Button, Card, Col, Descriptions, Empty, Form, Input, InputNumber, List, Row, Space,
  Statistic, Steps, Table, Tag, Typography, message,
} from 'antd';
import { ExperimentOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import BacktestCharts from '../components/research/BacktestCharts';
import { validateBacktestForm, type BacktestFormErrors, type BacktestFormValues } from '../features/backtest/validation';
import {
  createBacktest, fetchBacktest, fetchInstrumentBars, listBacktests, saveBacktest,
} from '../services/researchApi';
import type { BacktestRun, BacktestTrade, Bar } from '../types/research';

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
};

const initialValues = (symbol: string): BacktestFormValues => ({
  symbol: symbol || 'AAPL',
  start_date: dayjs().subtract(2, 'year').format('YYYY-MM-DD'),
  end_date: dayjs().format('YYYY-MM-DD'),
  short_window: 20,
  long_window: 50,
  initial_capital: 100000,
  commission_bps: 3,
  slippage_bps: 2,
  benchmark: 'buy_and_hold',
});

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
  const pollToken = useRef(0);

  const loadHistory = async () => {
    try {
      setHistory(await listBacktests(true));
    } catch (error: any) {
      setRequestError(error.message || '加载已保存回测失败');
    }
  };

  useEffect(() => { void loadHistory(); }, []);

  const update = <K extends keyof BacktestFormValues>(key: K, value: BacktestFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

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
              <Form.Item label="手续费（bps）" validateStatus={errors.commission_bps ? 'error' : ''} help={errors.commission_bps}>
                <InputNumber aria-label="手续费" min={0} value={values.commission_bps} onChange={(value) => update('commission_bps', Number(value ?? 0))} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={4}>
              <Form.Item label="滑点（bps）" validateStatus={errors.slippage_bps ? 'error' : ''} help={errors.slippage_bps}>
                <InputNumber aria-label="滑点" min={0} value={values.slippage_bps} onChange={(value) => update('slippage_bps', Number(value ?? 0))} style={{ width: '100%' }} />
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

          <Row gutter={[12, 12]}>
            {[
              ['总收益', pct(run.metrics.total_return), 'metric-total-return'],
              ['年化收益', pct(run.metrics.annualized_return), 'metric-annualized-return'],
              ['基准收益', pct(run.metrics.benchmark_return), 'metric-benchmark-return'],
              ['超额收益', pct(run.metrics.excess_return), 'metric-excess-return'],
              ['最大回撤', pct(run.metrics.max_drawdown), 'metric-max-drawdown'],
              ['Sharpe', run.metrics.sharpe_ratio?.toFixed(3) ?? '—', 'metric-sharpe'],
              ['Sortino', run.metrics.sortino_ratio?.toFixed(3) ?? '—', 'metric-sortino'],
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
                  <Descriptions.Item label="提供方">{run.provenance?.provider ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="截止时间">{run.provenance?.as_of ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="时区">{run.provenance?.timezone ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="复权/频率">{run.provenance?.adjustment ?? '—'} / {run.provenance?.frequency ?? '—'}</Descriptions.Item>
                </Descriptions>
              </Card>
              <Card title="回测警告" className="surface-card" style={{ marginTop: 18 }}>
                <Space wrap>{(run.warnings?.length ? run.warnings : ['none']).map((warning) => (
                  <Tag key={warning} color={warning === 'none' ? 'green' : 'gold'}>{warning === 'none' ? '无警告' : warningLabels[warning] ?? warning}</Tag>
                ))}</Space>
              </Card>
            </Col>
          </Row>
        </section>
      )}
    </main>
  );
}
