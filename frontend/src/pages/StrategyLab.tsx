import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Alert, Button, Card, Col, Collapse, Descriptions, Empty, Form, Input, InputNumber, List, Row, Space,
  Select, Steps, Table, Tabs, Tag, Typography, message,
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
import { useLanguage } from '../i18n/LanguageContext';

const { Title, Text, Paragraph } = Typography;
const runningStates = ['queued', 'loading_data', 'running', 'calculating_metrics'];

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
    labelKey: 'strategy.fee.eastmoney', commission_bps: 2.5, slippage_bps: 2,
    sell_stamp_duty_bps: 10, minimum_commission_cny: 5,
    noteKey: 'strategy.fee.eastmoneyNote',
  },
  custom: {
    labelKey: 'strategy.fee.custom', commission_bps: 3, slippage_bps: 2,
    sell_stamp_duty_bps: 0, minimum_commission_cny: 0,
    noteKey: 'strategy.fee.customNote',
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
  const { lang, t } = useLanguage();
  const listSeparator = lang === 'zh' ? '、' : ', ';
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
  const [resultTab, setResultTab] = useState('overview');
  const pollToken = useRef(0);

  const loadHistory = async () => {
    try {
      setHistory(await listBacktests(true));
    } catch (error: any) {
      setRequestError(error.message || t('strategy.message.loadSavedFailed'));
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
      setValidationIntentError(t('strategy.message.intentInvalid'));
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
        setValidationIntentError(error instanceof Error ? error.message : t('strategy.message.intentLoadFailed'));
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
      if (history.items.length < 60) throw new Error(t('strategy.message.historyInsufficient'));
      update('symbol', item.code.toUpperCase());
      message.success(t('strategy.message.referenceSelected', { name: item.name }));
    } catch {
      message.warning(t('strategy.message.referenceInsufficient', { name: item.name }));
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
      const result = response.data;
      if (result.status === 'valid' && (!result.ir?.instrument || !Array.isArray(result.ir.conditions))) {
        throw new Error(t('strategy.message.missingIr'));
      }
      if (result.status === 'invalid' && !Array.isArray(result.issues)) {
        throw new Error(t('strategy.message.missingIssues'));
      }
      setStrategyIRResponse(result);
    } catch (error: unknown) {
      setStrategyIRError(error instanceof Error ? error.message : t('strategy.message.parseFailed'));
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
      setStrategyDraftError(error instanceof Error ? error.message : t('strategy.message.compileFailed'));
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
    throw new Error(t('strategy.message.timeout'));
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
      if (completed.status === 'failed') throw new Error(completed.error_message || t('strategy.message.backtestFailed'));
      if (completed.status === 'completed') message.success(t('strategy.message.completed'));
    } catch (error: any) {
      setRequestError(error.message || t('strategy.message.requestFailed'));
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
      message.success(t('strategy.message.saved'));
    } catch (error: any) {
      message.error(error.message || t('strategy.message.saveFailed'));
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
      setRequestError(error.message || t('strategy.message.loadBarsFailed'));
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
      setSharePreviewError(error instanceof Error ? error.message : t('strategy.message.previewFailed'));
    } finally {
      setSharePreviewLoading(false);
    }
  };

  const stepIndex = useMemo(() => {
    if (!run) return 0;
    return Math.max(0, ['queued', 'loading_data', 'running', 'calculating_metrics', 'completed'].indexOf(run.status));
  }, [run]);

  const tradeColumns = [
    { title: t('strategy.trade.entryDay'), dataIndex: 'entry_time', key: 'entry_time' },
    { title: t('strategy.trade.exitDay'), dataIndex: 'exit_time', key: 'exit_time' },
    { title: t('strategy.trade.entryPrice'), dataIndex: 'entry_price', key: 'entry_price', render: (value: number) => value.toFixed(4) },
    { title: t('strategy.trade.exitPrice'), dataIndex: 'exit_price', key: 'exit_price', render: (value: number) => value.toFixed(4) },
    { title: t('strategy.trade.quantity'), dataIndex: 'quantity', key: 'quantity', render: (value: number) => value.toFixed(4) },
    { title: t('strategy.trade.fees'), key: 'fees', render: (_: unknown, item: BacktestTrade) => (item.entry_fee + item.exit_fee).toFixed(2) },
    { title: t('strategy.trade.pnl'), dataIndex: 'pnl', key: 'pnl', render: (value: number) => <Text className={value >= 0 ? 'price-up' : 'price-down'}>{value.toFixed(2)}</Text> },
    { title: t('strategy.trade.return'), dataIndex: 'return', key: 'return', render: (value: number) => pct(value) },
  ];
  const runStatusText = (status: string) => t(`strategy.runStatus.${status}`);

  const strategyStatus = running
    ? t('strategy.status.running')
    : run?.status === 'completed'
      ? requestError ? t('strategy.status.partial') : t('strategy.status.updated')
      : requestError || run?.status === 'failed'
        ? t('strategy.status.failed')
        : t('strategy.status.waiting');
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
        eyebrow={t('strategy.eyebrow')}
        title={t('strategy.title')}
        goal={t('strategy.goal')}
        object={`${values.symbol || t('strategy.noSymbol')} · MA${values.short_window}/MA${values.long_window}`}
        status={strategyStatus}
        statusTone={strategyStatusTone}
        actions={(
          <Button type="primary" icon={run?.status === 'completed' ? <ReloadOutlined /> : <ExperimentOutlined />} loading={running} onClick={() => void execute()}>
            {t(run?.status === 'completed' ? 'strategy.rerun' : 'strategy.run')}
          </Button>
        )}
      />

      {validationIntentLoading && (
        <Alert style={{ marginBottom: 18 }} type="info" showIcon message={t('strategy.intent.checking')} />
      )}
      {validationIntentError && (
        <Alert style={{ marginBottom: 18 }} type="error" showIcon message={t('strategy.intent.unavailable')} description={validationIntentError} />
      )}
      {validationIntent && (
        <Alert
          style={{ marginBottom: 18 }}
          type="warning"
          showIcon
          message={t('strategy.intent.source', { title: validationIntent.source.title })}
          description={(
            <Space direction="vertical" size={4}>
              <Text>{t('strategy.intent.symbolOnly', { symbol: validationIntent.parameters.symbol })}</Text>
              <Text>{t('strategy.confirm', { items: validationIntent.requires_confirmation.join(listSeparator) })}</Text>
              <Text type="secondary">{t('strategy.intent.notice')}</Text>
              <Link to={`/thesis?id=${validationIntent.source.id}`}>{t('strategy.intent.back')}</Link>
            </Space>
          )}
        />
      )}

      <div className="strategy-lab-layout">
        <aside className="strategy-lab-layout__setup" aria-label={t('strategy.setup.pane')}>
      <Collapse
        ghost
        bordered={false}
        className="strategy-ir-entry"
        style={{ marginBottom: 18 }}
        items={[{
          key: 'ir',
          label: (
            <Space wrap>
              <span className="strategy-ir-entry__title">{t('strategy.ir.title')}</span>
              {strategyDraft ? <Tag color="green">{t('strategy.ir.appliedTag')}</Tag> : null}
              {strategyDescription.trim() ? <Text type="secondary" ellipsis style={{ maxWidth: 360 }}>{strategyDescription}</Text> : null}
            </Space>
          ),
          extra: (
            <Button size="small" onClick={() => {
              setStrategyDescription(t('strategy.ir.example'));
              setStrategyIRResponse(null);
              setStrategyIRError('');
              setStrategyDraft(null);
              setStrategyDraftError('');
            }}>
              {t('strategy.ir.fillExample')}
            </Button>
          ),
          children: (
            <div className="strategy-ir-entry__panel">
              <Paragraph type="secondary" style={{ marginTop: 0 }}>
                {t('strategy.ir.description')}
              </Paragraph>
              <Input.TextArea
                aria-label={t('strategy.ir.label')}
                rows={4}
                maxLength={2000}
                value={strategyDescription}
                placeholder={t('strategy.ir.placeholder', { example: t('strategy.ir.example') })}
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
                  {t('strategy.ir.parse')}
                </Button>
              </Space>
              {!strategyDescription && !strategyIRResponse && !strategyIRError && (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('strategy.ir.empty')} />
              )}
              {strategyIRLoading && <Alert style={{ marginTop: 12 }} type="info" showIcon message={t('strategy.ir.validating')} />}
              {strategyIRError && (
                <Alert style={{ marginTop: 12 }} type="error" showIcon message={t('strategy.ir.failed')} description={strategyIRError} />
              )}
              {strategyIRResponse?.status === 'invalid' && (
                <Alert
                  style={{ marginTop: 12 }}
                  type="warning"
                  showIcon
                  message={t('strategy.ir.invalid')}
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
                  message={t('strategy.ir.generated')}
                  description={(
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Descriptions size="small" column={{ xs: 1, md: 3 }}>
                        <Descriptions.Item label={t('strategy.ir.instrument')}>{strategyIRResponse.ir.instrument.symbol}</Descriptions.Item>
                        <Descriptions.Item label={t('strategy.ir.data')}>{t('strategy.ir.dailyClose')}</Descriptions.Item>
                        <Descriptions.Item label={t('strategy.ir.execution')}>{t('strategy.ir.nextOpen')}</Descriptions.Item>
                      </Descriptions>
                      {strategyIRResponse.ir.conditions.map((condition) => (
                        <Text key={condition.id}>{t(condition.id === 'entry' ? 'strategy.ir.entry' : 'strategy.ir.exit')}: {condition.explanation}</Text>
                      ))}
                      <Text type="secondary">{t('strategy.confirmExplicit', { items: strategyIRResponse.ir.requires_confirmation.join(listSeparator) })}</Text>
                      <Button loading={strategyDraftLoading} onClick={() => void applyStrategyIR()}>
                        {t('strategy.ir.apply')}
                      </Button>
                    </Space>
                  )}
                />
              )}
              {strategyDraftError && (
                <Alert style={{ marginTop: 12 }} type="error" showIcon message={t('strategy.ir.compileFailed')} description={strategyDraftError} />
              )}
              {strategyDraft && (
                <Alert
                  style={{ marginTop: 12 }}
                  type="warning"
                  showIcon
                  message={t('strategy.ir.applied')}
                  description={(
                    <Space direction="vertical" size={4}>
                      <Text>{t('strategy.ir.mapping', { symbol: strategyDraft.parameters.symbol, short: strategyDraft.parameters.short_window, long: strategyDraft.parameters.long_window })}</Text>
                      <Text>{t('strategy.ir.noLookahead')}</Text>
                      <Text type="secondary">{t('strategy.ir.review', { items: strategyDraft.requires_confirmation.join(listSeparator) })}</Text>
                    </Space>
                  )}
                />
              )}
            </div>
          ),
        }]}
      />

      <Card
        title={t('strategy.watchlist.title')}
        className="surface-card"
        style={{ marginBottom: 18 }}
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>{t('strategy.watchlist.description')}</Paragraph>
        <Space wrap>
          {watchedSymbols.map((item) => <Button key={item.code} onClick={() => update('symbol', item.code.toUpperCase())}>{item.name} · {item.code.toUpperCase()}</Button>)}
          {!watchedSymbols.length && <Text type="secondary">{t('strategy.watchlist.empty')}</Text>}
        </Space>
      </Card>

      <Card
        title={t('strategy.references.title')}
        className="surface-card"
        style={{ marginBottom: 18 }}
        extra={<Button size="small" icon={<ReloadOutlined spin={referenceLoading} />} onClick={() => void loadReferences()}>{t('strategy.references.refresh')}</Button>}
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          {t('strategy.references.description')}
        </Paragraph>
        <Space wrap>
          {referenceCandidates.map((item) => (
            <Button key={item.code} onClick={() => void chooseReference(item)}>
              {item.name} · {t('strategy.references.week', { value: pct(item.weekly_change_percent / 100) })}
            </Button>
          ))}
          {!referenceLoading && !referenceCandidates.length && <Text type="secondary">{t('strategy.references.empty')}</Text>}
        </Space>
      </Card>

      <StrategySetup
        goal={strategyGoal}
        preset={strategyPreset}
        onGoalChange={setStrategyGoal}
        onPresetChange={applyStrategyPreset}
      />

      <Card title={t('strategy.form.title')} className="surface-card" data-testid="backtest-form">
        <Form layout="vertical">
          <Row gutter={[14, 0]}>
            <Col xs={24} md={12} xl={6}>
              <Form.Item label={t('strategy.form.symbol')} validateStatus={errors.symbol ? 'error' : ''} help={errors.symbol}>
                <Input aria-label={t('strategy.form.symbol')} value={values.symbol} onChange={(event) => update('symbol', event.target.value.toUpperCase())} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={6}>
              <Form.Item label={t('strategy.form.start')}>
                <Input aria-label={t('strategy.form.start')} type="date" value={values.start_date} onChange={(event) => update('start_date', event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} xl={6}>
              <Form.Item label={t('strategy.form.end')} validateStatus={errors.end_date ? 'error' : ''} help={errors.end_date}>
                <Input aria-label={t('strategy.form.end')} type="date" value={values.end_date} onChange={(event) => update('end_date', event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8} xl={6}>
              <Form.Item label={t('strategy.form.capital')} validateStatus={errors.initial_capital ? 'error' : ''} help={errors.initial_capital}>
                <InputNumber aria-label={t('strategy.form.capital')} min={1} value={values.initial_capital} onChange={(value) => update('initial_capital', Number(value ?? 0))} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
        <Collapse
          items={[{
            key: 'advanced',
            label: t('strategy.form.advanced'),
            children: (
              <Form layout="vertical">
                <Row gutter={[14, 0]}>
                  <Col xs={12} md={6}><Form.Item label={t('strategy.form.shortMa')} validateStatus={errors.short_window ? 'error' : ''} help={errors.short_window}><InputNumber aria-label={t('strategy.form.shortMa')} min={2} value={values.short_window} onChange={(value) => update('short_window', Number(value ?? 0))} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label={t('strategy.form.longMa')} validateStatus={errors.long_window ? 'error' : ''} help={errors.long_window}><InputNumber aria-label={t('strategy.form.longMa')} min={3} value={values.long_window} onChange={(value) => update('long_window', Number(value ?? 0))} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={24} md={6}><Form.Item label={t('strategy.form.costPreset')}><Select aria-label={t('strategy.form.costPreset')} value={feePreset} onChange={applyFeePreset} options={Object.entries(feePresets).map(([value, preset]) => ({ value, label: t(preset.labelKey) }))} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label={t('strategy.form.commission')} validateStatus={errors.commission_bps ? 'error' : ''} help={errors.commission_bps}><InputNumber aria-label={t('strategy.form.commissionAria')} min={0} step={0.1} value={values.commission_bps} onChange={(value) => { setFeePreset('custom'); update('commission_bps', Number(value ?? 0)); }} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label={t('strategy.form.slippage')} validateStatus={errors.slippage_bps ? 'error' : ''} help={errors.slippage_bps}><InputNumber aria-label={t('strategy.form.slippageAria')} min={0} value={values.slippage_bps} onChange={(value) => { setFeePreset('custom'); update('slippage_bps', Number(value ?? 0)); }} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label={t('strategy.form.stampDuty')} validateStatus={errors.sell_stamp_duty_bps ? 'error' : ''} help={errors.sell_stamp_duty_bps}><InputNumber aria-label={t('strategy.form.stampDutyAria')} min={0} value={values.sell_stamp_duty_bps} onChange={(value) => { setFeePreset('custom'); update('sell_stamp_duty_bps', Number(value ?? 0)); }} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label={t('strategy.form.minimumCommission')} validateStatus={errors.minimum_commission_cny ? 'error' : ''} help={errors.minimum_commission_cny}><InputNumber aria-label={t('strategy.form.minimumCommissionAria')} min={0} value={values.minimum_commission_cny} onChange={(value) => { setFeePreset('custom'); update('minimum_commission_cny', Number(value ?? 0)); }} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label={t('strategy.form.drawdownStop')} validateStatus={errors.max_drawdown_stop_pct ? 'error' : ''} help={errors.max_drawdown_stop_pct}><InputNumber aria-label={t('strategy.form.drawdownStopAria')} min={0} max={99} value={values.max_drawdown_stop_pct * 100} onChange={(value) => update('max_drawdown_stop_pct', Number(value ?? 0) / 100)} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={6}><Form.Item label={t('strategy.form.benchmark')}><Input aria-label={t('strategy.form.benchmark')} value={t('strategy.form.buyHold')} disabled /></Form.Item></Col>
                </Row>
                <Text type="secondary">{t(feePresets[feePreset].noteKey)} {t('strategy.form.costNotice')}</Text>
              </Form>
            ),
          }]}
        />
      </Card>
        </aside>
        <section className="strategy-lab-layout__results" aria-label={t('strategy.setup.resultPane')}>

      <ExperimentWorkbench
        values={values}
        history={history}
        run={run}
        baselineId={baselineId}
        onBaselineChange={setBaselineId}
      />

      <Card title={t('strategy.saved.title')} className="surface-card" style={{ marginTop: 18 }} data-testid="saved-backtests">
        {history.length ? (
          <List
            dataSource={history}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key="preview" onClick={() => void openSharePreview(item.id)}>{t('strategy.saved.preview')}</Button>,
                  <Button key="view" onClick={() => void openSavedRun(item)}>{t('strategy.saved.open')}</Button>,
                ]}
              >
                <List.Item.Meta
                  title={<Space><Text strong>{item.symbol}</Text><Tag>MA{item.params.short_window}/MA{item.params.long_window}</Tag><Tag color="green">{runStatusText(item.status)}</Tag></Space>}
                  description={t('strategy.saved.description', { start: item.params.start_date, end: item.params.end_date, result: item.metrics ? t('strategy.saved.return', { value: pct(item.metrics.total_return) }) : t('strategy.saved.waiting') })}
                />
              </List.Item>
            )}
          />
        ) : <Empty description={t('strategy.saved.empty')} />}
      </Card>

      {(requestError || run?.status === 'failed') && (
        <BacktestFailurePanel
          error={run?.error_message || requestError || t('strategy.failure.execution')}
          title={run?.status === 'completed' ? t('strategy.failure.partial') : t('strategy.failure.incomplete')}
        />
      )}

      {run && (
        <Card className="surface-card" style={{ marginTop: 18 }} title={t('strategy.runTitle', { id: run.id, status: runStatusText(run.status) })}>
          <Steps
            current={stepIndex}
            status={run.status === 'failed' ? 'error' : run.status === 'completed' ? 'finish' : 'process'}
            size="small"
            items={['queued', 'loading_data', 'running', 'calculating_metrics', 'completed'].map((state) => ({ title: runStatusText(state) }))}
          />
        </Card>
      )}

      {run?.status === 'completed' && run.metrics && (
        <section data-testid="backtest-completed">
          <Tabs
            className="strategy-result-tabs"
            activeKey={resultTab}
            onChange={setResultTab}
            items={[
              { key: 'overview', label: t('strategy.result.tab.overview') },
              { key: 'equity', label: t('strategy.result.tab.equity') },
              { key: 'trades', label: t('strategy.result.tab.trades') },
              { key: 'risk', label: t('strategy.result.tab.risk') },
              { key: 'diagnostics', label: t('strategy.result.tab.diagnostics') },
              { key: 'parameters', label: t('strategy.result.tab.parameters') },
            ]}
          />
          <div hidden={resultTab !== 'overview'}>
          <ResultLayer
            layer="summary"
            title={t('strategy.result.summary')}
            description={t('strategy.result.summaryDescription')}
            actions={(
              <Space wrap>
                {run.is_saved ? <Button onClick={() => void openSharePreview(run.id)}>{t('strategy.saved.preview')}</Button> : null}
                <Button type="primary" icon={<SaveOutlined />} disabled={run.is_saved} onClick={() => void save()}>
                  {t(run.is_saved ? 'strategy.result.saved' : 'strategy.result.save')}
                </Button>
              </Space>
            )}
          >
            <BacktestSummary run={run} />
          </ResultLayer>
          </div>

          <div hidden={!['equity', 'trades', 'risk'].includes(resultTab)}>
          <ResultLayer layer="evidence" title={t('strategy.result.evidence')}>
            {resultTab === 'equity' && <Card title={t('strategy.result.charts')} className="surface-card">
              <BacktestCharts run={run} bars={bars} />
            </Card>}

            {resultTab === 'risk' && run.validation && (
              <Card title={t('strategy.result.robustness')} className="surface-card" style={{ marginTop: 18 }}>
                <Descriptions column={{ xs: 1, md: 3 }} size="small">
                  <Descriptions.Item label={t('strategy.result.bootstrapInterval')}>{pct(run.validation.bootstrap.confidence_interval[0])} ～ {pct(run.validation.bootstrap.confidence_interval[1])}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.result.bootstrapPositive')}>{pct(run.validation.bootstrap.probability_positive)}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.result.monteCarloMedian')}>{pct(run.validation.monte_carlo.terminal_return.median)}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.result.monteCarloLoss')}>{pct(run.validation.monte_carlo.probability_loss)}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.result.walkForwardPositive')}>{run.validation.walk_forward.status === 'ok' ? pct(run.validation.walk_forward.positive_fold_ratio) : t('strategy.result.insufficient')}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.result.walkForwardFolds')}>{run.validation.walk_forward.fold_count ?? '—'}</Descriptions.Item>
                </Descriptions>
              </Card>
            )}
            {resultTab === 'risk' && !run.validation ? <Empty description={t('strategy.result.noValidation')} /> : null}

            {resultTab === 'trades' && <Card title={t('strategy.result.trades', { count: run.trades?.length ?? 0 })} className="surface-card" style={{ marginTop: 18 }} data-testid="trades-table">
              <Table<BacktestTrade>
                rowKey={(item) => `${item.entry_time}-${item.exit_time}`}
                dataSource={run.trades ?? []}
                columns={tradeColumns}
                pagination={false}
                scroll={{ x: 900 }}
                locale={{ emptyText: t('strategy.result.noTrades') }}
                size="small"
              />
            </Card>}
          </ResultLayer>
          </div>

          <div hidden={!['diagnostics', 'parameters'].includes(resultTab)}>
          <ResultLayer layer="method">
            <Row gutter={[18, 18]}>
              {resultTab === 'parameters' && (
              <Col xs={24} xl={16}>
              <Card title={t('strategy.method.title')} className="surface-card">
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
                  <Descriptions.Item label={t('strategy.method.instrument')}>{run.symbol}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.method.period')}>{t('strategy.method.periodValue', { start: run.params.start_date, end: run.params.end_date })}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.method.ma')}>MA{run.params.short_window} / MA{run.params.long_window}</Descriptions.Item>
                <Descriptions.Item label={t('strategy.method.costs')}>{t('strategy.method.costsValue', { commission: run.params.commission_bps, slippage: run.params.slippage_bps })}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.method.cnFees')}>{t('strategy.method.cnFeesValue', { stamp: run.params.sell_stamp_duty_bps ?? 0, minimum: run.params.minimum_commission_cny ?? 0 })}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.method.drawdown')}>
                    {run.risk_controls?.max_drawdown_stop_pct
                      ? t('strategy.method.drawdownTriggered', { value: pct(run.risk_controls.max_drawdown_stop_pct), count: run.risk_controls.trigger_count })
                      : t('strategy.method.drawdownOff')}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('strategy.method.rules')}>
                    {run.execution_rules?.market === 'CN'
                      ? t('strategy.method.cnRules', { limit: pct(run.execution_rules.price_limit_ratio) })
                      : t('strategy.method.genericRules')}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('strategy.method.rejected')}>{run.rejected_orders?.length ?? 0}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.method.provider')}>{run.provenance?.provider ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.method.asOf')}>{run.provenance?.as_of ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.method.timezone')}>{run.provenance?.timezone ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label={t('strategy.method.adjustmentFrequency')}>{run.provenance?.adjustment ?? '—'} / {run.provenance?.frequency ?? '—'}</Descriptions.Item>
                </Descriptions>
              </Card>
              </Col>
              )}
              {resultTab === 'diagnostics' && (
              <Col xs={24} xl={8}>
              <Card title={t('strategy.warning.title')} className="surface-card" style={{ marginTop: 18 }}>
                <Space wrap>{(run.warnings?.length ? run.warnings : ['none']).map((warning) => (
                  <Tag key={warning} color={warning === 'none' ? 'green' : 'gold'}>{warning === 'none' ? t('strategy.warning.none') : warning === 'max_drawdown_stop_triggered' ? t('strategy.warning.drawdown') : t(`strategy.warning.${warning}`)}</Tag>
                ))}</Space>
              </Card>
              </Col>
              )}
            </Row>
          </ResultLayer>
          </div>
        </section>
      )}
        </section>
      </div>
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
