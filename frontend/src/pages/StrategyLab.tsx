import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Alert, Button, Card, Col, Collapse, Descriptions, Empty, Form, Input, InputNumber, List, Row, Space,
  Select, Steps, Table, Tag, Typography, message,
} from 'antd';
import { ExperimentOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import BacktestCharts from '../components/research/BacktestCharts';
import TaskPageHeader from '../components/TaskPageHeader';
import ResultLayer from '../components/ResultLayer';
import CitationDetails, { type CitationStatus } from '../components/CitationDetails';
import SharePreviewModal from '../components/SharePreviewModal';
import { validateBacktestForm, type BacktestFormErrors, type BacktestFormValues } from '../features/backtest/validation';
import {
  createBacktest, fetchBacktest, fetchInstrumentBars, listBacktests, saveBacktest,
} from '../services/researchApi';
import { fetchMarketPulse } from '../services/marketDiscoveryApi';
import { markProductProgress } from '../features/productProgress';
import type { BacktestRun, BacktestTrade, Bar, SharePreview } from '../types/research';
import type { WeeklyMarketMover } from '../types';
import StrategySetup from '../components/strategy/StrategySetup';
import BacktestSummary from '../components/strategy/BacktestSummary';
import BacktestFailurePanel from '../components/strategy/BacktestFailurePanel';
import ExperimentWorkbench from '../components/strategy/ExperimentWorkbench';
import { STRATEGY_PRESETS, type StrategyGoal, type StrategyPresetKey } from '../features/backtest/presets';
import apiClient from '../services/api';
import { fetchStrategySharePreview } from '../services/sharePreviewApi';

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

function pct(value: number | null | undefined) {
  return value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function provenanceStatus(run: BacktestRun): CitationStatus {
  const flags = run.provenance?.quality_flags ?? [];
  if (flags.includes('UPSTREAM_ERROR')) return 'UPSTREAM_ERROR';
  if (!run.provenance?.provider || flags.includes('UNKNOWN')) return 'UNKNOWN';
  return flags.length ? 'PARTIAL' : 'OK';
}

interface StrategyIRIssue {
  field: string;
  code: string;
  message: string;
}

interface StrategyIR {
  schema_version: 'strategy-ir/v1';
  strategy_type: 'ma_crossover';
  instrument: { symbol: string };
  data: { frequency: '1d'; price_field: 'close' };
  conditions: Array<{
    id: 'entry' | 'exit';
    left: { indicator: 'sma'; window: number; price_field: 'close' };
    operator: 'crosses_above' | 'crosses_below';
    right: { indicator: 'sma'; window: number; price_field: 'close' };
    explanation: string;
    target_position: 'long' | 'flat';
  }>;
  execution: { signal_at: 'close'; execute_at: 'next_open'; position_mode: 'long_only' };
  requires_confirmation: string[];
  canonical_key: string;
}

type StrategyIRResponse =
  | { status: 'valid'; ir: StrategyIR }
  | { status: 'invalid'; code: 'strategy_ir_invalid'; issues: StrategyIRIssue[] };

interface StrategyDraft {
  schema_version: 'ma-crossover-draft/v1';
  source_ir_version: 'strategy-ir/v1';
  source_canonical_key: string;
  capability: 'backtests.ma_crossover';
  parameters: { symbol: string; short_window: number; long_window: number };
  data: { frequency: '1d'; price_field: 'close' };
  execution: { signal_at: 'close'; execute_at: 'next_open'; position_mode: 'long_only' };
  requires_confirmation: string[];
}

type StrategyDraftResponse =
  | { status: 'valid'; draft: StrategyDraft }
  | { status: 'invalid'; code: 'strategy_ir_compile_invalid'; issues: StrategyIRIssue[] };

interface ThesisValidationIntent {
  schema_version: 'thesis-validation-experiment/v1';
  source: { type: 'thesis'; id: number; title: string; ticker: string };
  capability: 'backtests.ma_crossover';
  fixed_semantics: {
    frequency: '1d'; price_field: 'close'; signal_at: 'close';
    execute_at: 'next_open'; position_mode: 'long_only';
  };
  parameters: { symbol: string };
  requires_confirmation: string[];
  result_interpretation: 'VALIDATION_ONLY_NOT_CAUSAL_PROOF';
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
  const [baselineId, setBaselineId] = useState<number | null>(null);
  const [feePreset, setFeePreset] = useState<keyof typeof feePresets>('eastmoney_cn');
  const [strategyGoal, setStrategyGoal] = useState<StrategyGoal>('trend');
  const [strategyPreset, setStrategyPreset] = useState<StrategyPresetKey>('standard');
  const [referenceCandidates, setReferenceCandidates] = useState<WeeklyMarketMover[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [strategyDescription, setStrategyDescription] = useState('');
  const [strategyIRResponse, setStrategyIRResponse] = useState<StrategyIRResponse | null>(null);
  const [strategyIRLoading, setStrategyIRLoading] = useState(false);
  const [strategyIRError, setStrategyIRError] = useState('');
  const [strategyDraft, setStrategyDraft] = useState<StrategyDraft | null>(null);
  const [strategyDraftLoading, setStrategyDraftLoading] = useState(false);
  const [strategyDraftError, setStrategyDraftError] = useState('');
  const [validationIntent, setValidationIntent] = useState<ThesisValidationIntent | null>(null);
  const [validationIntentLoading, setValidationIntentLoading] = useState(false);
  const [validationIntentError, setValidationIntentError] = useState('');
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
  const [sharePreviewLoading, setSharePreviewLoading] = useState(false);
  const [sharePreviewError, setSharePreviewError] = useState('');
  const [sharePreview, setSharePreview] = useState<SharePreview | null>(null);
  const [sharePreviewRunId, setSharePreviewRunId] = useState<number | null>(null);
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

  useEffect(() => {
    const rawId = searchParams.get('validation_thesis_id');
    if (rawId == null) return;
    const thesisId = Number(rawId);
    if (!Number.isInteger(thesisId) || thesisId <= 0) {
      setValidationIntentError('验证实验来源无效，请返回 Thesis 重新创建。');
      return;
    }
    const loadIntent = async () => {
      setValidationIntentLoading(true);
      setValidationIntentError('');
      try {
        const response = await apiClient.get<ThesisValidationIntent>(
          `/thesis/${thesisId}/validation-experiment`,
        );
        setValidationIntent(response.data);
        setValues((current) => ({ ...current, symbol: response.data.parameters.symbol }));
      } catch (error: unknown) {
        setValidationIntent(null);
        setValidationIntentError(error instanceof Error ? error.message : '加载验证实验来源失败');
      } finally {
        setValidationIntentLoading(false);
      }
    };
    void loadIntent();
  }, [searchParams]);

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

  const applyStrategyPreset = (preset: StrategyPresetKey) => {
    setStrategyPreset(preset);
    setValues((current) => ({ ...current, ...STRATEGY_PRESETS[preset].values }));
  };

  const parseStrategyDescription = async () => {
    if (!strategyDescription.trim()) return;
    setStrategyIRLoading(true);
    setStrategyIRError('');
    setStrategyIRResponse(null);
    setStrategyDraft(null);
    setStrategyDraftError('');
    try {
      const response = await apiClient.post<StrategyIRResponse>('/backtests/strategy-ir/parse', {
        description: strategyDescription,
      });
      setStrategyIRResponse(response.data);
    } catch (error: unknown) {
      setStrategyIRError(error instanceof Error ? error.message : '策略描述解析失败');
    } finally {
      setStrategyIRLoading(false);
    }
  };

  const applyStrategyIR = async () => {
    if (strategyIRResponse?.status !== 'valid') return;
    setStrategyDraftLoading(true);
    setStrategyDraftError('');
    setStrategyDraft(null);
    try {
      const response = await apiClient.post<StrategyDraftResponse>('/backtests/strategy-ir/compile', {
        ir: strategyIRResponse.ir,
      });
      if (response.data.status === 'invalid') {
        setStrategyDraftError(response.data.issues.map((issue) => issue.message).join('；'));
        return;
      }
      const draft = response.data.draft;
      setValues((current) => ({
        ...current,
        symbol: draft.parameters.symbol,
        short_window: draft.parameters.short_window,
        long_window: draft.parameters.long_window,
      }));
      setErrors({});
      setStrategyDraft(draft);
    } catch (error: unknown) {
      setStrategyDraftError(error instanceof Error ? error.message : '策略 IR 编译失败');
    } finally {
      setStrategyDraftLoading(false);
    }
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
          markProductProgress('backtest');
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
      markProductProgress('saved');
      setRun({ ...run, is_saved: true });
      await loadHistory();
      if (baselineId == null) setBaselineId(run.id);
      message.success('回测实验已保存');
    } catch (error: any) {
      message.error(error.message || '保存失败');
    }
  };

  const openSavedRun = async (item: BacktestRun) => {
    setRun(item);
    setValues(item.params);
    setBaselineId(item.id);
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

  const openSharePreview = async (runId: number) => {
    setSharePreviewRunId(runId);
    setSharePreviewOpen(true);
    setSharePreviewLoading(true);
    setSharePreviewError('');
    try {
      setSharePreview(await fetchStrategySharePreview(runId));
    } catch (error: unknown) {
      setSharePreview(null);
      setSharePreviewError(error instanceof Error ? error.message : '私有预览生成失败');
    } finally {
      setSharePreviewLoading(false);
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

  const strategyStatus = running
    ? '正在执行真实行情回测'
    : run?.status === 'completed'
      ? requestError ? '回测完成，部分证据不可用' : '回测结果已更新'
      : requestError || run?.status === 'failed'
        ? '回测失败'
        : '参数等待确认';
  const strategyStatusTone = running
    ? 'loading' as const
    : run?.status === 'completed'
      ? requestError ? 'warning' as const : 'success' as const
      : requestError || run?.status === 'failed'
        ? 'error' as const
        : 'neutral' as const;

  return (
    <main className="product-page" data-testid="ma-crossover-lab">
      <TaskPageHeader
        eyebrow="STRATEGY LAB · EXECUTABLE"
        title="双均线策略实验室"
        goal="信号在当日收盘确认，下一交易日开盘执行；结果扣除佣金与滑点，不触发真实交易。"
        object={`${values.symbol || '尚未选择'} · MA${values.short_window}/MA${values.long_window}`}
        status={strategyStatus}
        statusTone={strategyStatusTone}
        actions={(
          <Button type="primary" icon={run?.status === 'completed' ? <ReloadOutlined /> : <ExperimentOutlined />} loading={running} onClick={() => void execute()}>
            {run?.status === 'completed' ? '重新运行' : '运行回测'}
          </Button>
        )}
      />

      {validationIntentLoading && (
        <Alert style={{ marginBottom: 18 }} type="info" showIcon message="正在核对 Thesis 验证实验来源" />
      )}
      {validationIntentError && (
        <Alert style={{ marginBottom: 18 }} type="error" showIcon message="验证实验来源不可用" description={validationIntentError} />
      )}
      {validationIntent && (
        <Alert
          style={{ marginBottom: 18 }}
          type="warning"
          showIcon
          message={`来自 Thesis：${validationIntent.source.title}`}
          description={(
            <Space direction="vertical" size={4}>
              <Text>只带入标的 {validationIntent.parameters.symbol}；未从论文正文猜测均线或金融参数。</Text>
              <Text>仍需确认：{validationIntent.requires_confirmation.join('、')}</Text>
              <Text type="secondary">回测仅用于验证假设，不构成 Thesis 的因果证明。</Text>
              <Link to={`/thesis?id=${validationIntent.source.id}`}>返回来源 Thesis</Link>
            </Space>
          )}
        />
      )}

      <Card title="用自然语言生成有限策略 IR（不执行）" className="surface-card" style={{ marginBottom: 18 }}>
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          当前只接受一个明确 ticker、两条日线简单均线、上穿买入、下穿卖出，以及“收盘确认、下一交易日开盘执行”。解析只生成数据，不运行或保存回测。
        </Paragraph>
        <Input.TextArea
          aria-label="策略描述"
          rows={4}
          maxLength={2000}
          value={strategyDescription}
          placeholder="例如：标的 600519，日线 MA20 上穿 MA50 时买入，MA20 下穿 MA50 时卖出；收盘确认信号，下一交易日开盘执行。"
          onChange={(event) => {
            setStrategyDescription(event.target.value);
            setStrategyIRResponse(null);
            setStrategyIRError('');
            setStrategyDraft(null);
            setStrategyDraftError('');
          }}
        />
        <Space wrap style={{ marginTop: 12 }}>
          <Button
            type="primary"
            loading={strategyIRLoading}
            disabled={!strategyDescription.trim()}
            onClick={() => void parseStrategyDescription()}
          >
            解析为有限 IR
          </Button>
          <Button onClick={() => {
            setStrategyDescription('标的 600519，日线 MA20 上穿 MA50 时买入，MA20 下穿 MA50 时卖出；收盘确认信号，下一交易日开盘执行。');
            setStrategyIRResponse(null);
            setStrategyIRError('');
            setStrategyDraft(null);
            setStrategyDraftError('');
          }}>
            填入明确示例
          </Button>
        </Space>

        {!strategyDescription && !strategyIRResponse && !strategyIRError && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未输入或解析策略描述" />
        )}
        {strategyIRLoading && <Alert style={{ marginTop: 12 }} type="info" showIcon message="正在验证有限语法" />}
        {strategyIRError && (
          <Alert style={{ marginTop: 12 }} type="error" showIcon message="策略描述解析失败" description={strategyIRError} />
        )}
        {strategyIRResponse?.status === 'invalid' && (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            message="描述不够明确或超出当前能力"
            description={(
              <List
                size="small"
                dataSource={strategyIRResponse.issues}
                renderItem={(issue) => <List.Item>{issue.field} · {issue.message}</List.Item>}
              />
            )}
          />
        )}
        {strategyIRResponse?.status === 'valid' && (
          <Alert
            style={{ marginTop: 12 }}
            type="success"
            showIcon
            message="已生成不可执行 IR，尚未运行回测"
            description={(
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Descriptions size="small" column={{ xs: 1, md: 3 }}>
                  <Descriptions.Item label="标的">{strategyIRResponse.ir.instrument.symbol}</Descriptions.Item>
                  <Descriptions.Item label="数据">日线收盘价</Descriptions.Item>
                  <Descriptions.Item label="执行">收盘确认 · 下一交易日开盘</Descriptions.Item>
                </Descriptions>
                {strategyIRResponse.ir.conditions.map((condition) => (
                  <Text key={condition.id}>{condition.id === 'entry' ? '入场' : '退出'}：{condition.explanation}</Text>
                ))}
                <Text type="secondary">仍需显式确认：{strategyIRResponse.ir.requires_confirmation.join('、')}</Text>
                <Button loading={strategyDraftLoading} onClick={() => void applyStrategyIR()}>
                  应用到回测参数
                </Button>
              </Space>
            )}
          />
        )}
        {strategyDraftError && (
          <Alert style={{ marginTop: 12 }} type="error" showIcon message="策略 IR 编译失败" description={strategyDraftError} />
        )}
        {strategyDraft && (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            message="已应用标的与均线参数，尚未运行回测"
            description={(
              <Space direction="vertical" size={4}>
                <Text>映射：{strategyDraft.parameters.symbol} · MA{strategyDraft.parameters.short_window}/MA{strategyDraft.parameters.long_window}</Text>
                <Text>无前视：收盘确认 · 下一交易日开盘执行 · 只做多</Text>
                <Text type="secondary">仍需确认：{strategyDraft.requires_confirmation.join('、')}；请检查当前表单后再主动运行。</Text>
              </Space>
            )}
          />
        )}
      </Card>

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

      <StrategySetup
        goal={strategyGoal}
        preset={strategyPreset}
        onGoalChange={setStrategyGoal}
        onPresetChange={applyStrategyPreset}
      />

      <Card title="2. 确认标的与回测区间" className="surface-card" data-testid="backtest-form">
        <Form layout="vertical">
          <Row gutter={[14, 0]}>
            <Col xs={24} md={12} xl={6}>
              <Form.Item label="股票代码" validateStatus={errors.symbol ? 'error' : ''} help={errors.symbol}>
                <Input aria-label="股票代码" value={values.symbol} onChange={(event) => update('symbol', event.target.value.toUpperCase())} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={6}>
              <Form.Item label="开始日期">
                <Input aria-label="开始日期" type="date" value={values.start_date} onChange={(event) => update('start_date', event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={6}>
              <Form.Item label="结束日期" validateStatus={errors.end_date ? 'error' : ''} help={errors.end_date}>
                <Input aria-label="结束日期" type="date" value={values.end_date} onChange={(event) => update('end_date', event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8} xl={6}>
              <Form.Item label="初始资金" validateStatus={errors.initial_capital ? 'error' : ''} help={errors.initial_capital}>
                <InputNumber aria-label="初始资金" min={1} value={values.initial_capital} onChange={(value) => update('initial_capital', Number(value ?? 0))} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
        <Collapse
          items={[{
            key: 'advanced',
            label: '高级：均线、费用与风控参数',
            children: (
              <Form layout="vertical">
                <Row gutter={[14, 0]}>
                  <Col xs={12} md={6}><Form.Item label="短均线" validateStatus={errors.short_window ? 'error' : ''} help={errors.short_window}><InputNumber aria-label="短均线" min={2} value={values.short_window} onChange={(value) => update('short_window', Number(value ?? 0))} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label="长均线" validateStatus={errors.long_window ? 'error' : ''} help={errors.long_window}><InputNumber aria-label="长均线" min={3} value={values.long_window} onChange={(value) => update('long_window', Number(value ?? 0))} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={24} md={6}><Form.Item label="成本预设"><Select aria-label="成本预设" value={feePreset} onChange={applyFeePreset} options={Object.entries(feePresets).map(([value, preset]) => ({ value, label: preset.label }))} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label="手续费（bps）" validateStatus={errors.commission_bps ? 'error' : ''} help={errors.commission_bps}><InputNumber aria-label="手续费" min={0} step={0.1} value={values.commission_bps} onChange={(value) => { setFeePreset('custom'); update('commission_bps', Number(value ?? 0)); }} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label="滑点（bps）" validateStatus={errors.slippage_bps ? 'error' : ''} help={errors.slippage_bps}><InputNumber aria-label="滑点" min={0} value={values.slippage_bps} onChange={(value) => { setFeePreset('custom'); update('slippage_bps', Number(value ?? 0)); }} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label="卖出印花税（bps）" validateStatus={errors.sell_stamp_duty_bps ? 'error' : ''} help={errors.sell_stamp_duty_bps}><InputNumber aria-label="卖出印花税" min={0} value={values.sell_stamp_duty_bps} onChange={(value) => { setFeePreset('custom'); update('sell_stamp_duty_bps', Number(value ?? 0)); }} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label="最低佣金（¥）" validateStatus={errors.minimum_commission_cny ? 'error' : ''} help={errors.minimum_commission_cny}><InputNumber aria-label="最低佣金" min={0} value={values.minimum_commission_cny} onChange={(value) => { setFeePreset('custom'); update('minimum_commission_cny', Number(value ?? 0)); }} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label="回撤止损（%）" validateStatus={errors.max_drawdown_stop_pct ? 'error' : ''} help={errors.max_drawdown_stop_pct}><InputNumber aria-label="回撤止损" min={0} max={99} value={values.max_drawdown_stop_pct * 100} onChange={(value) => update('max_drawdown_stop_pct', Number(value ?? 0) / 100)} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label="基准"><Input aria-label="基准" value="买入并持有" disabled /></Form.Item></Col>
                </Row>
                <Text type="secondary">{feePresets[feePreset].note} 印花税与最低佣金仅对 A 股规则生效；回撤止损为 0 时关闭，开启后收盘触发、下一交易日开盘尝试退出。</Text>
              </Form>
            ),
          }]}
        />
      </Card>

      <ExperimentWorkbench
        values={values}
        history={history}
        run={run}
        baselineId={baselineId}
        onBaselineChange={setBaselineId}
      />

      <Card title="已保存实验" className="surface-card" style={{ marginTop: 18 }} data-testid="saved-backtests">
        {history.length ? (
          <List
            dataSource={history}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key="preview" onClick={() => void openSharePreview(item.id)}>私有分享预览</Button>,
                  <Button key="view" onClick={() => void openSavedRun(item)}>打开实验</Button>,
                ]}
              >
                <List.Item.Meta
                  title={<Space><Text strong>{item.symbol}</Text><Tag>MA{item.params.short_window}/MA{item.params.long_window}</Tag><Tag color="green">{statusLabels[item.status]}</Tag></Space>}
                  description={`${item.params.start_date} 至 ${item.params.end_date} · ${item.metrics ? `总收益 ${pct(item.metrics.total_return)}` : '等待结果'}`}
                />
              </List.Item>
            )}
          />
        ) : <Empty description="暂无已保存实验" />}
      </Card>

      {(requestError || run?.status === 'failed') && (
        <BacktestFailurePanel
          error={run?.error_message || requestError || '回测执行失败'}
          title={run?.status === 'completed' ? '部分证据不可用' : '回测未完成'}
        />
      )}

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
          <ResultLayer
            layer="summary"
            title="回测结论摘要"
            description="先比较策略、基准、回撤和样本，再决定是否保存。"
            actions={(
              <Space wrap>
                {run.is_saved ? <Button onClick={() => void openSharePreview(run.id)}>私有分享预览</Button> : null}
                <Button type="primary" icon={<SaveOutlined />} disabled={run.is_saved} onClick={() => void save()}>
                  {run.is_saved ? '实验已保存' : '保存实验'}
                </Button>
              </Space>
            )}
          >
            <BacktestSummary run={run} />
          </ResultLayer>

          <ResultLayer layer="evidence" title="收益、稳健性与成交证据">
            <Card title="曲线与成交点" className="surface-card">
              <BacktestCharts run={run} bars={bars} />
            </Card>

            {run.validation && (
              <Card title="统计显著性与稳健性" className="surface-card" style={{ marginTop: 18 }}>
                <Descriptions column={{ xs: 1, md: 3 }} size="small">
                  <Descriptions.Item label="Bootstrap 置信区间">{pct(run.validation.bootstrap.confidence_interval[0])} ～ {pct(run.validation.bootstrap.confidence_interval[1])}</Descriptions.Item>
                  <Descriptions.Item label="Bootstrap 正收益概率">{pct(run.validation.bootstrap.probability_positive)}</Descriptions.Item>
                  <Descriptions.Item label="Monte Carlo 中位收益">{pct(run.validation.monte_carlo.terminal_return.median)}</Descriptions.Item>
                  <Descriptions.Item label="Monte Carlo 亏损概率">{pct(run.validation.monte_carlo.probability_loss)}</Descriptions.Item>
                  <Descriptions.Item label="Walk-forward 正收益折数">{run.validation.walk_forward.status === 'ok' ? pct(run.validation.walk_forward.positive_fold_ratio) : '样本不足'}</Descriptions.Item>
                  <Descriptions.Item label="Walk-forward 折数">{run.validation.walk_forward.fold_count ?? '—'}</Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            <Card title={`交易明细 · ${run.trades?.length ?? 0}`} className="surface-card" style={{ marginTop: 18 }} data-testid="trades-table">
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
          </ResultLayer>

          <ResultLayer layer="method">
            <Row gutter={[18, 18]}>
              <Col xs={24} xl={16}>
              <Card title="参数与数据来源" className="surface-card">
                <CitationDetails
                  status={provenanceStatus(run)}
                  source={run.provenance?.provider}
                  vendor={run.provenance?.provider}
                  asOf={run.provenance?.as_of}
                  currency={run.provenance?.currency}
                  adjustment={run.provenance?.adjustment}
                  frequency={run.provenance?.frequency}
                  qualityFlags={run.provenance?.quality_flags}
                />
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
              </Col>
              <Col xs={24} xl={8}>
              <Card title="回测警告" className="surface-card" style={{ marginTop: 18 }}>
                <Space wrap>{(run.warnings?.length ? run.warnings : ['none']).map((warning) => (
                  <Tag key={warning} color={warning === 'none' ? 'green' : 'gold'}>{warning === 'none' ? '无警告' : warning === 'max_drawdown_stop_triggered' ? '回撤止损已触发' : warningLabels[warning] ?? warning}</Tag>
                ))}</Space>
              </Card>
              </Col>
            </Row>
          </ResultLayer>
        </section>
      )}
      <SharePreviewModal
        open={sharePreviewOpen}
        loading={sharePreviewLoading}
        error={sharePreviewError}
        preview={sharePreview}
        onClose={() => setSharePreviewOpen(false)}
        onRetry={() => {
          if (sharePreviewRunId) void openSharePreview(sharePreviewRunId);
        }}
      />
    </main>
  );
}
