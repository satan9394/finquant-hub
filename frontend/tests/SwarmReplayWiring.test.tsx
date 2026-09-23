// @vitest-environment jsdom

/* ============================================================
 * W3 接线测试：swarm 历史运行入口 + 点选回放
 *
 * 覆盖卡里的 ②–⑦：
 *   ② 历史列表三态（有数据 / 确实为空 / 读取失败）
 *   ③ 失败不得伪装成空（文案 + 底层原文 + 可点重试，且不出现空态文案）
 *   ④ 重试真重发（请求调用计数 1 → 2）
 *   ⑤ 点选即回放（Agent 状态/内容来自该份 events，而不是初始 pending）
 *   ⑥ 同源（回放态与"同一批帧喂给实时路径"渲染出的**整段子树**逐字相同）
 *   ⑦ 不可判定不伪装（{ok:false} ⇒ 显式说明，不出现 Agent 列表 / 空态文案）
 * ============================================================ */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SwarmStatusCard from '../src/components/SwarmStatusCard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { useModelStore } from '../src/store/modelStore';
import type { SwarmTeamDefinition } from '../src/features/swarm/state';
import type { ResearchReportEvent } from '../src/types/research';

const mocks = vi.hoisted(() => ({
  fetchFour: vi.fn(),
  fetchEarnings: vi.fn(),
  streamFour: vi.fn(),
  streamEarnings: vi.fn(),
  fetchRuns: vi.fn(),
  fetchReport: vi.fn(),
  cancelRun: vi.fn(),
}));

vi.mock('../src/services/swarmApi', () => ({
  fetchFourMastersTeam: mocks.fetchFour,
  fetchEarningsReviewTeam: mocks.fetchEarnings,
  streamFourMasters: mocks.streamFour,
  streamEarningsReview: mocks.streamEarnings,
  fetchSwarmRuns: mocks.fetchRuns,
  requestSwarmRunCancellation: mocks.cancelRun,
}));

vi.mock('../src/services/researchApi', () => ({
  fetchResearchReport: mocks.fetchReport,
}));

const team: SwarmTeamDefinition = {
  key: 'four-masters',
  name: '四大师',
  description: '独立并行分析',
  agents: [
    { key: 'value_investor', name: '价值投资官', avatar: '🏛️', dependencies: [], tools: ['get_stock_data'] },
    { key: 'risk_manager', name: '风控委员', avatar: '🛡️', dependencies: ['value_investor'], tools: [] },
  ],
};

/** 一次完整运行的落库事件（形状对齐 `routers/research.py` 的 research_events 行）。 */
const SOURCE: Array<[string, unknown]> = [
  ['report_started', { report_id: 4242, ticker: '600519' }],
  ['team_started', { team, ticker: '600519' }],
  ['agent_started', { role_key: 'value_investor' }],
  ['tool_call', { role_key: 'value_investor', tool_name: 'get_stock_data', arguments: { symbol: '600519' } }],
  ['agent_completed', { role_key: 'value_investor', token_count: 42, status: 'completed' }],
  ['agent_started', { role_key: 'risk_manager' }],
  ['agent_completed', { role_key: 'risk_manager', token_count: 20, status: 'completed' }],
  ['done', {
    team,
    status: 'completed',
    token_count: 62,
    agent_results: {
      value_investor: { content: '价值结论：低估', status: 'completed', token_count: 42 },
      risk_manager: { content: '风控结论：通过', status: 'completed', token_count: 20 },
    },
  }],
];

/** 每次调用都造一份**独立**的数据（避免两条路径共享同一个对象而让对照失去意义）。 */
function storedRows(source: Array<[string, unknown]> = SOURCE): ResearchReportEvent[] {
  return source.map(([event, payload], index) => ({
    id: index + 1,
    research_id: 4242,
    event_type: event,
    agent_role_key: null,
    payload: JSON.parse(JSON.stringify(payload)) as unknown,
    created_at: `2026-09-13 10:00:0${index % 10}`,
  }));
}

function liveFrames(source: Array<[string, unknown]> = SOURCE) {
  return storedRows(source).map((row) => ({ event: row.event_type, data: row.payload as Record<string, unknown> }));
}

const RUN_ITEM = {
  report_id: 4242,
  ticker: '600519',
  company_name: '贵州茅台',
  status: 'completed',
  created_at: '2026-09-13 10:00',
  team_key: 'four-masters',
  team_name: '四大师',
};

const HISTORY_EMPTY_TEXT = '该股票暂无历史 swarm 团队运行';
const HISTORY_FAILED_TEXT = '历史运行列表读取失败';
const REPLAY_HINT_TEXT = '以下是该次运行落库事件的历史回放，不是实时状态。';

function renderCard(ticker = '600519') {
  return render(<LanguageProvider><SwarmStatusCard ticker={ticker} /></LanguageProvider>);
}

async function historySection() {
  return within(await screen.findByTestId('swarm-run-history'));
}

describe('W3：SwarmStatusCard 历史运行入口与回放', () => {
  beforeEach(() => {
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
    useModelStore.setState({ currentModelId: null });
    mocks.fetchFour.mockResolvedValue(team);
    mocks.fetchEarnings.mockResolvedValue({ ...team, key: 'earnings', name: '财报团队' });
    mocks.streamFour.mockResolvedValue('done');
    mocks.fetchRuns.mockResolvedValue([RUN_ITEM]);
    mocks.fetchReport.mockResolvedValue({ id: 4242, ticker: '600519', status: 'completed', created_at: '', report_data: {}, events: storedRows() });
    mocks.cancelRun.mockResolvedValue({ report_id: 4242, status: 'canceled' });
  });

  // ---------------------------------------------------------------- ②
  it('② 有数据：列出该 ticker 的历史 swarm 运行（含团队名与时间）', async () => {
    renderCard();

    const item = await screen.findByTestId('swarm-history-item-4242');
    expect(item.textContent).toContain('运行 #4242');
    expect(item.textContent).toContain('四大师');
    expect(item.textContent).toContain('2026-09-13 10:00');
    // 用的是当前 ticker 发起的请求
    expect(mocks.fetchRuns).toHaveBeenCalledWith('600519');
    // 有数据 ⇒ 不是空态
    expect(screen.queryByText(HISTORY_EMPTY_TEXT)).toBeNull();
  });

  it('② 确实为空：成功读取且 0 条时才出现空态文案', async () => {
    mocks.fetchRuns.mockResolvedValue([]);
    renderCard();

    expect(await screen.findByText(HISTORY_EMPTY_TEXT)).toBeTruthy();
    // 空态与失败态互斥：成功读取时不得同时出现失败呈现
    expect(screen.queryByText(HISTORY_FAILED_TEXT)).toBeNull();
  });

  // ---------------------------------------------------------------- ③
  it('③ 读取失败不得伪装成空：失败文案 + 底层原文 + 可点的重试，且**不出现**空态文案', async () => {
    mocks.fetchRuns.mockRejectedValue(new Error('历史运行接口 503'));
    renderCard();

    const history = within(await screen.findByTestId('swarm-run-history'));
    expect(await history.findByText(HISTORY_FAILED_TEXT)).toBeTruthy();
    // 底层原文原样带出（不吞掉）
    expect(history.getByText('历史运行接口 503')).toBeTruthy();
    // 真会重发的重试按钮（antd 会在两个汉字之间插空格，故用正则匹配可访问名）
    expect(history.getByRole('button', { name: /重\s*试/ })).toBeTruthy();
    // 关键否定断言：读不出来**绝不**渲染成"没有历史运行"
    expect(screen.queryByText(HISTORY_EMPTY_TEXT)).toBeNull();
  });

  // ---------------------------------------------------------------- ④
  it('④ 重试真重发：以调用计数证明（1 → 2）', async () => {
    mocks.fetchRuns.mockRejectedValueOnce(new Error('历史运行接口 503'));
    mocks.fetchRuns.mockResolvedValue([RUN_ITEM]);
    renderCard();

    const history = within(await screen.findByTestId('swarm-run-history'));
    expect(await history.findByText(HISTORY_FAILED_TEXT)).toBeTruthy();
    expect(mocks.fetchRuns).toHaveBeenCalledTimes(1);

    fireEvent.click(history.getByRole('button', { name: /重\s*试/ }));

    await waitFor(() => expect(mocks.fetchRuns).toHaveBeenCalledTimes(2));
    // 重发的是同一个 ticker，且成功后失败态被内容取代
    expect(mocks.fetchRuns.mock.calls[1][0]).toBe('600519');
    expect(await screen.findByTestId('swarm-history-item-4242')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(HISTORY_FAILED_TEXT)).toBeNull());
  });

  // ---------------------------------------------------------------- ⑤
  it('⑤ 点选即回放：Agent 状态与内容来自该份 events，不是初始 pending', async () => {
    renderCard();

    fireEvent.click(await screen.findByTestId('swarm-history-item-4242'));
    expect(await screen.findByText(REPLAY_HINT_TEXT)).toBeTruthy();

    const valueAgent = await screen.findByTestId('swarm-agent-value_investor');
    // 初始态是"等待 / 0 tokens / 0 次工具调用"，回放后必须变成 events 里的事实
    expect(valueAgent.textContent).toContain('完成');
    expect(valueAgent.textContent).not.toContain('等待');
    expect(valueAgent.textContent).toContain('工具 1 次 · 42 tokens');
    expect(screen.getByTestId('swarm-agent-risk_manager').textContent).toContain('完成');
    // 统计区来自同一份折叠结果
    expect(screen.getByTestId('swarm-run-view').textContent).toContain('62');

    // 内容也来自该份 events（展开输出折叠）
    fireEvent.click(screen.getByText('🏛️ 价值投资官 · 42 tokens'));
    expect(await screen.findByText('价值结论：低估')).toBeTruthy();
  });

  it('⑤ 多条历史：点选的是**那一条**（按它的 report_id 取事件），不是"第一条"', async () => {
    mocks.fetchRuns.mockResolvedValue([
      RUN_ITEM,
      { ...RUN_ITEM, report_id: 7777, created_at: '2026-09-12 09:00' },
    ]);
    renderCard();

    fireEvent.click(await screen.findByTestId('swarm-history-item-7777'));

    expect(await screen.findByText(REPLAY_HINT_TEXT)).toBeTruthy();
    expect(mocks.fetchReport).toHaveBeenCalledWith(7777);
    expect(mocks.fetchReport).not.toHaveBeenCalledWith(4242);
  });

  // ---------------------------------------------------------------- ⑥
  it('⑥ 同源：回放态与"把同一批帧喂给实时路径"渲染出**逐字相同**的一段', async () => {
    // 实时路径：SSE 帧由同一个 SOURCE 造出（独立的一份数据）
    const frames = liveFrames();
    mocks.streamFour.mockImplementation(async (
      _ticker: string,
      _model: number | null,
      onEvent: (event: { event: string; data: Record<string, unknown> }) => void,
    ) => {
      frames.forEach(onEvent);
      return 'done';
    });

    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /启动团队/ }));
    await waitFor(() => {
      expect(screen.getByTestId('swarm-agent-value_investor').textContent).toContain('完成');
    });
    const liveText = screen.getByTestId('swarm-run-view').textContent;

    // 回放路径：点选历史运行，用 replay.ts 折叠同一批帧
    fireEvent.click(screen.getByTestId('swarm-history-item-4242'));
    expect(await screen.findByText(REPLAY_HINT_TEXT)).toBeTruthy();

    // 若两条路径各写一份渲染，这里的整段子树不可能逐字相同
    expect(screen.getByTestId('swarm-run-view').textContent).toBe(liveText);
    expect(liveText).toContain('工具 1 次 · 42 tokens');
  });

  it('⑥ 取消态同源：确认后持久化请求成功，实时与历史回放徽章完全一致', async () => {
    const canceledSource: Array<[string, unknown]> = [
      ['report_started', { report_id: 4242, ticker: '600519' }],
      ['team_started', { team, ticker: '600519' }],
      ['agent_started', { role_key: 'value_investor' }],
      ['team_canceled', { report_id: 4242 }],
    ];
    const initialLiveFrames = liveFrames(canceledSource.slice(0, 3));
    mocks.streamFour.mockImplementation(async (
      _ticker: string,
      _model: number | null,
      onEvent: (event: { event: string; data: Record<string, unknown> }) => void,
      signal: AbortSignal,
    ) => {
      initialLiveFrames.forEach(onEvent);
      return await new Promise<string | null>((resolve) => {
        signal.addEventListener('abort', () => resolve(null), { once: true });
      });
    });
    mocks.fetchRuns.mockResolvedValue([{ ...RUN_ITEM, status: 'canceled' }]);
    mocks.fetchReport.mockResolvedValue({
      id: 4242,
      ticker: '600519',
      status: 'canceled',
      created_at: '',
      report_data: {},
      events: storedRows(canceledSource),
    });

    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /启动团队/ }));
    const stopButton = await screen.findByRole('button', { name: /停止/ });
    expect(stopButton.hasAttribute('disabled')).toBe(false);
    fireEvent.click(stopButton);

    expect(mocks.cancelRun).toHaveBeenCalledWith(4242);
    await waitFor(() => {
      expect(screen.getByTestId('swarm-run-view').textContent).toContain('已停止');
    });
    const liveText = screen.getByTestId('swarm-run-view').textContent;
    expect(liveText).toContain('已停止');

    fireEvent.click(await screen.findByTestId('swarm-history-item-4242'));
    expect(await screen.findByText(REPLAY_HINT_TEXT)).toBeTruthy();
    expect(screen.getByTestId('swarm-run-view').textContent).toBe(liveText);
  });

  // ---------------------------------------------------------------- ⑦
  it('⑦ 不可判定不伪装：没有 team_started ⇒ 显式说明，且不出现 Agent 列表 / 空态', async () => {
    mocks.fetchReport.mockResolvedValue({
      id: 4242, ticker: '600519', status: 'completed', created_at: '', report_data: {},
      events: storedRows([
        ['report_started', { report_id: 4242 }],
        ['agent_started', { role_key: 'value_investor' }],
        ['done', { status: 'completed', agent_results: {} }],
      ]),
    });
    renderCard();

    fireEvent.click(await screen.findByTestId('swarm-history-item-4242'));

    const unavailable = await screen.findByTestId('swarm-replay-unavailable');
    expect(unavailable.textContent).toContain('这份记录不是 swarm 团队运行');
    // 底层原因原样带出（`replay.ts` 的 detail）
    expect(unavailable.textContent).toContain('没有 team_started');
    // 不得渲染成全 pending 的 Agent 列表
    expect(screen.queryAllByTestId(/^swarm-agent-/)).toHaveLength(0);
    expect(screen.queryByTestId('swarm-run-view')).toBeNull();
    expect(screen.queryByText(HISTORY_EMPTY_TEXT)).toBeNull();
  });

  it('⑦ 空事件流是另一种不可判定：显式说"没有可回放的事件"，同样不出现 Agent 列表', async () => {
    mocks.fetchReport.mockResolvedValue({
      id: 4242, ticker: '600519', status: 'completed', created_at: '', report_data: {}, events: [],
    });
    renderCard();

    fireEvent.click(await screen.findByTestId('swarm-history-item-4242'));

    const unavailable = await screen.findByTestId('swarm-replay-unavailable');
    expect(unavailable.textContent).toContain('这份记录没有可回放的事件');
    expect(screen.queryAllByTestId(/^swarm-agent-/)).toHaveLength(0);
  });

  it('⑦ 响应里没有 events 字段 ⇒ 读取失败（带重试），不得当成"没有事件"', async () => {
    mocks.fetchReport.mockResolvedValue({
      id: 4242, ticker: '600519', status: 'completed', created_at: '', report_data: {},
    });
    renderCard();

    fireEvent.click(await screen.findByTestId('swarm-history-item-4242'));

    expect(await screen.findByText('该次运行的事件读取失败')).toBeTruthy();
    expect(screen.getByText('该次运行的响应里没有 events 字段：无法回放；这不代表这次运行没有事件')).toBeTruthy();
    expect(screen.queryAllByTestId(/^swarm-agent-/)).toHaveLength(0);
    expect(screen.queryByTestId('swarm-replay-unavailable')).toBeNull();
  });
});
