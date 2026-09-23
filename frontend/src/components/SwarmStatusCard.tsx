import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, Segmented, Skeleton, Space, Spin, Tag, Typography, message,
} from 'antd';
import { CloseCircleOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import SwarmRunView from './SwarmRunView';
import LoadFailureAlert, { LoadStateView, readStateOf } from './LoadFailureAlert';
import {
  applySwarmEvent,
  cancelSwarmRun,
  createSwarmRunState,
  type SwarmRunState,
  type SwarmTeamDefinition,
} from '../features/swarm/state';
import {
  replaySwarmRun,
  type SwarmReplayFailureReason,
  type SwarmReplayOutcome,
} from '../features/swarm/replay';
import {
  fetchEarningsReviewTeam,
  fetchFourMastersTeam,
  fetchSwarmRuns,
  requestSwarmRunCancellation,
  streamEarningsReview,
  streamFourMasters,
  type SwarmRunSummary,
} from '../services/swarmApi';
import { fetchResearchReport } from '../services/researchApi';
import type { ResearchReportDetail, ResearchReportEvent } from '../types/research';
import { useModelStore } from '../store/modelStore';
import { useLanguage } from '../i18n/LanguageContext';

const { Paragraph, Text } = Typography;

interface SwarmStatusCardProps {
  ticker: string;
}

/* ============================================================
 * W3：历史运行列表 + 点选回放
 *
 * 三条结构约定（与卡里的"必须遵守的结构"一一对应）：
 *
 *  1. **同源**：回放得到的 `SwarmRunState` 与实时折叠得到的 `SwarmRunState` 是**同一种值**，
 *     两者都交给 `./SwarmRunView` 渲染。本文件里**没有**第二份 Agent 卡片 / 进度 /
 *     状态标签渲染，也没有第二个状态文案来源。
 *  2. **三态**：列表读取的三态事实交给族内唯一实现 `readStateOf` / `LoadStateView`
 *     （`./LoadFailureAlert`）——失败带文案 + 底层原文 + 真会重发的重试；空态只在
 *     "成功读取且确实为空"时出现。**不得**把"读不出来"渲染成"没有历史运行"。
 *  3. **不猜**：`replaySwarmRun` 返回 `{ ok: false, reason }` 时**显式呈现**该原因，
 *     不渲染成空卡片、也不渲染成全 pending 的 Agent 列表。
 * ============================================================ */

/** 回放不可判定时的显式文案（三种原因各自一句，`replay.ts` 的 `reason` 是有限枚举）。 */
const REPLAY_UNAVAILABLE_KEYS: Record<SwarmReplayFailureReason, string> = {
  empty_stream: 'research.swarm.replayEmptyStream',
  no_team_started: 'research.swarm.replayNotSwarmRun',
  invalid_team_definition: 'research.swarm.replayInvalidTeam',
};

/**
 * 回放区块的状态。**每条都带 `ticker`**：数据与它所属的股票绑在一起，
 * 渲染时只认"属于当前 ticker"的那一条 ⇒ 切换股票的那一帧也不可能显示上一只的
 * 列表或回放（不靠 `useEffect` 事后清空——那是在**提交之后**才跑，中间帧照样会串台）。
 */
type ReplayView =
  | { ticker: string; reportId: number; status: 'loading' }
  | { ticker: string; reportId: number; status: 'error'; error: string }
  | { ticker: string; reportId: number; status: 'ready'; outcome: SwarmReplayOutcome };

interface RunsFact {
  /** 这批列表属于哪个 ticker。 */
  ticker: string;
  items: SwarmRunSummary[];
  failed: boolean;
  /** 是否已经成功读取过一次（哪怕读回来是空的）。只有它为真，"确实没有历史运行"才成立。 */
  resolved: boolean;
  error: string;
}

/** 缺失或损坏的事件字段仍按读取失败处理，不归约成空历史。 */
function readStoredEvents(report: ResearchReportDetail): ResearchReportEvent[] | null {
  const raw: unknown = report.events;
  if (!Array.isArray(raw)) return null;
  const rows: ResearchReportEvent[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const candidate = entry as { id?: unknown; event_type?: unknown };
    if (typeof candidate.id !== 'number' || typeof candidate.event_type !== 'string') return null;
    rows.push(entry as ResearchReportEvent);
  }
  return rows;
}

export default function SwarmStatusCard({ ticker }: SwarmStatusCardProps) {
  const { t } = useLanguage();
  const currentModelId = useModelStore((state) => state.currentModelId);
  const [team, setTeam] = useState<SwarmTeamDefinition | null>(null);
  const [run, setRun] = useState<SwarmRunState | null>(null);
  const [cancelReady, setCancelReady] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [teamKind, setTeamKind] = useState<'four-masters' | 'earnings-review'>('four-masters');
  const abortRef = useRef<AbortController | null>(null);
  const [runsFact, setRunsFact] = useState<RunsFact>({ ticker, items: [], failed: false, resolved: false, error: '' });
  const [replayView, setReplayView] = useState<ReplayView | null>(null);
  /** 回放请求的序号：只有"最后一次点选"的结果才允许落到界面上（避免慢响应覆盖新选择）。 */
  const replaySeq = useRef(0);

  const loadTeam = useCallback(async () => {
    setLoadingTeam(true);
    setLoadError('');
    try {
      const definition = teamKind === 'four-masters'
        ? await fetchFourMastersTeam()
        : await fetchEarningsReviewTeam();
      setTeam(definition);
      setRun(createSwarmRunState(definition));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('research.swarm.teamLoadFailed'));
    } finally {
      setLoadingTeam(false);
    }
  }, [t, teamKind]);

  /** W3：读取当前 ticker 的历史 swarm 运行。重试**真的重发本函数**。 */
  const loadRuns = useCallback(async () => {
    const forTicker = ticker;
    try {
      const items = await fetchSwarmRuns(forTicker);
      setRunsFact({ ticker: forTicker, items, failed: false, resolved: true, error: '' });
    } catch (error) {
      // 失败时**不**把已读到的记录丢掉（那会让"失败"顺手藏掉真实存在的运行），
      // 也**不**置 `resolved`——`readStateOf` 的第 3 条据此永远不会把失败降级成空态。
      setRunsFact((previous) => ({
        ticker: forTicker,
        items: previous.ticker === forTicker ? previous.items : [],
        failed: true,
        resolved: false,
        error: error instanceof Error ? error.message : t('research.swarm.historyLoadFailed'),
      }));
    }
  }, [t, ticker]);

  useEffect(() => {
    void loadTeam();
    return () => abortRef.current?.abort();
  }, [loadTeam]);

  useEffect(() => {
    abortRef.current?.abort();
    setCancelReady(false);
    if (team) setRun(createSwarmRunState(team));
  }, [team, ticker]);

  useEffect(() => {
    // 列表与回放都属于当前 ticker（各自带 ticker 字段做渲染作用域），
    // 所以这里只负责"为这个 ticker 发起一次读取"，不负责清理上一只股票的状态。
    void loadRuns();
  }, [loadRuns]);

  const start = useCallback(async () => {
    if (!team || run?.status === 'running') return;
    const controller = new AbortController();
    abortRef.current = controller;
    setCancelReady(false);
    setRun({ ...createSwarmRunState(team), status: 'running' });

    try {
      const streamTeam = teamKind === 'four-masters' ? streamFourMasters : streamEarningsReview;
      const terminal = await streamTeam(
        ticker,
        currentModelId,
        (event) => {
          if (event.event === 'team_started') setCancelReady(true);
          setRun((current) => current ? applySwarmEvent(current, event) : current);
        },
        controller.signal,
      );
      if (!terminal && !controller.signal.aborted) {
        setRun((current) => current ? applySwarmEvent(current, {
          event: 'error',
          data: { error: t('research.swarm.streamInterrupted') },
        }) : current);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setRun((current) => current ? cancelSwarmRun(current) : current);
      } else {
        const message = error instanceof Error ? error.message : t('research.swarm.runFailed');
        setRun((current) => current ? applySwarmEvent(current, {
          event: 'error', data: { error: message },
        }) : current);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [currentModelId, run?.status, t, team, teamKind, ticker]);

  const stop = useCallback(async () => {
    const reportId = run?.reportId;
    if (reportId == null) return;
    try {
      const result = await requestSwarmRunCancellation(reportId);
      if (result.status !== 'canceled') return;
      setRun((current) => current ? applySwarmEvent(current, {
        event: 'team_canceled',
        data: { report_id: reportId },
      }) : current);
      abortRef.current?.abort();
    } catch (error) {
      const detail = error instanceof Error ? `：${error.message}` : '';
      message.error(`${t('research.swarm.cancelFailed')}${detail}`);
    }
  }, [run?.reportId, t]);

  /**
   * W3：点选一次历史运行 ⇒ 读该报告的落库事件 ⇒ 用 W1 的纯函数折叠成 `SwarmRunState`。
   * 折叠**不在这里做任何事**（没有第二套事件语义）：`replay.ts` 是唯一折叠点。
   */
  const openReplay = useCallback(async (reportId: number) => {
    const seq = replaySeq.current + 1;
    replaySeq.current = seq;
    const forTicker = ticker;
    setReplayView({ ticker: forTicker, reportId, status: 'loading' });
    try {
      const report = await fetchResearchReport(reportId);
      if (replaySeq.current !== seq) return;
      const events = readStoredEvents(report);
      if (!events) {
        // 响应里没有可用的 `events` ⇒ **读取失败**，不是"这次运行没有事件"。
        // 后者（`events: []`）会走下面的 empty_stream 分支，两者必须可区分。
        setReplayView({ ticker: forTicker, reportId, status: 'error', error: t('research.swarm.replayNoEventsField') });
        return;
      }
      setReplayView({ ticker: forTicker, reportId, status: 'ready', outcome: replaySwarmRun(events) });
    } catch (error) {
      if (replaySeq.current !== seq) return;
      setReplayView({
        ticker: forTicker,
        reportId,
        status: 'error',
        error: error instanceof Error ? error.message : t('research.swarm.replayLoadFailed'),
      });
    }
  }, [t, ticker]);

  const closeReplay = useCallback(() => {
    replaySeq.current += 1;
    setReplayView(null);
  }, []);

  if (loadingTeam) {
    return <Card className="surface-card" style={{ marginBottom: 18 }}><Skeleton active paragraph={{ rows: 3 }} /></Card>;
  }
  if (!team || !run) {
    return (
      <Alert
        type="error"
        showIcon
        message={t('research.swarm.loadFailed')}
        description={loadError}
        action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void loadTeam()}>{t('research.swarm.retry')}</Button>}
        style={{ marginBottom: 18 }}
      />
    );
  }

  // 只认属于当前 ticker 的列表 / 回放（见上面 `RunsFact` 的说明）。
  const scopedRuns = runsFact.ticker === ticker
    ? runsFact
    : { ticker, items: [] as SwarmRunSummary[], failed: false, resolved: false, error: '' };
  const replay = replayView && replayView.ticker === ticker ? replayView : null;
  const historyState = readStateOf({
    failed: scopedRuns.failed,
    resolved: scopedRuns.resolved,
    error: scopedRuns.error,
    count: scopedRuns.items.length,
  });

  const renderReplay = (view: ReplayView) => {
    if (view.status === 'loading') {
      return (
        <div className="fq-load-state fq-load-state--loading" style={{ padding: 16, textAlign: 'center' }}>
          <Spin size="small" />
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            {t('research.swarm.replayLoading')}
          </Text>
        </div>
      );
    }
    if (view.status === 'error') {
      return (
        <LoadFailureAlert
          message={t('research.swarm.replayLoadFailed')}
          error={view.error}
          onRetry={() => void openReplay(view.reportId)}
        />
      );
    }
    if (!view.outcome.ok) {
      // 不可判定 ⇒ **显式呈现**：既不是空卡片，也不是全 pending 的 Agent 列表。
      return (
        <div data-testid="swarm-replay-unavailable">
          <Alert
            type="warning"
            showIcon
            message={t(REPLAY_UNAVAILABLE_KEYS[view.outcome.reason])}
            description={view.outcome.detail}
          />
        </div>
      );
    }
    return <SwarmRunView run={view.outcome.state} ticker={ticker} />;
  };

  return (
    <Card
      className="surface-card"
      data-testid="swarm-status-card"
      style={{ marginBottom: 18 }}
      title={<Space><span>{team.name}</span><Tag>{ticker}</Tag><Tag color="purple">SWARM</Tag></Space>}
      extra={replay
        ? <Button onClick={closeReplay}>{t('research.swarm.replayBack')}</Button>
        : run.status === 'running'
          ? <Button danger icon={<CloseCircleOutlined />} disabled={run.reportId == null || !cancelReady} onClick={() => void stop()}>{t('research.swarm.stop')}</Button>
          : <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void start()}>{t('research.swarm.start')}</Button>}
    >
      {/* W3：历史运行入口。三态事实交给族内唯一的 readStateOf / LoadStateView。 */}
      <section data-testid="swarm-run-history" style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 4 }}>{t('research.swarm.historyTitle')}</Text>
        <LoadStateView
          state={historyState}
          failureMessage={t('research.swarm.historyLoadFailed')}
          onRetry={() => void loadRuns()}
          loadingText={t('research.swarm.historyLoading')}
          emptyContent={<Text type="secondary">{t('research.swarm.historyEmpty')}</Text>}
          retainedCount={scopedRuns.items.length}
          showContentOnError
        >
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {scopedRuns.items.map((item) => (
              <Button
                key={item.report_id}
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }}
                data-testid={`swarm-history-item-${item.report_id}`}
                onClick={() => void openReplay(item.report_id)}
              >
                {t('research.swarm.historyItem', {
                  id: item.report_id,
                  team: item.team_name ?? t('research.swarm.historyUnknownTeam'),
                  time: item.created_at,
                })}
              </Button>
            ))}
          </Space>
        </LoadStateView>
      </section>

      {replay ? (
        <>
          <Paragraph type="secondary" style={{ marginBottom: 12 }}>{t('research.swarm.replayHint')}</Paragraph>
          {renderReplay(replay)}
        </>
      ) : (
        <>
          <Segmented
            value={teamKind}
            onChange={(value) => setTeamKind(value as 'four-masters' | 'earnings-review')}
            options={[
              { label: t('research.swarm.fourMasters'), value: 'four-masters' },
              { label: t('research.swarm.earningsReview'), value: 'earnings-review' },
            ]}
            disabled={run.status === 'running'}
            style={{ marginBottom: 12 }}
          />
          <Paragraph type="secondary" style={{ marginTop: -4 }}>{team.description}</Paragraph>
          {/* 实时态与回放态**共用**这一段：同一个组件、同一个 SwarmRunState 契约。 */}
          <SwarmRunView run={run} ticker={ticker} />
        </>
      )}
    </Card>
  );
}
