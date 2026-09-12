// @vitest-environment jsdom
/* VS22：**失败不得伪装成空态**（第二批：左栏列表与"研究运行"记录）
 *
 * 原则（VS19 在首页"最近记录"卡片上建立）：空态只能代表"确实没有数据"。
 * 本文件把三处显现面放在一起验证，且**三处用同一套断言模式**：
 *   ①失败 ⇒ 原位出现错误态（失败文案 + 具体错误 + 可点的重试），
 *   ②失败 ⇒ "暂无…"一个字都不许出现，
 *   ③重试 ⇒ 真的重新发起该请求；仍失败则错误态保持、可再试（不死循环），恢复成功则错误态消失。
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { message } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Chat from '../src/pages/Chat';
import Dashboard from '../src/pages/Dashboard';
import Discussion from '../src/pages/Discussion';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import apiClient from '../src/services/api';
import { useChatStore } from '../src/store/chatStore';
import { useDiscussionStore } from '../src/store/discussionStore';
import type { DashboardStats } from '../src/types';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() } }));

const RETRY = /重\s*试/;

/** 三处共用的判据：失败必须在该表面**原位**说出来，且形态一致（antd error Alert + 具体错误 + 重试）。 */
function expectFailureSurfaced(scope: HTMLElement, texts: { failure: string; detail: string }) {
  const s = within(scope);
  expect(s.getByText(texts.failure)).toBeTruthy();
  expect(s.getByText(texts.detail)).toBeTruthy();
  expect(s.getByRole('button', { name: RETRY })).toBeTruthy();
  // "同一种错误态写法"的可判定形式：同一个组件渲染出的 error Alert，description 就是底层错误原文。
  expect(scope.querySelector('.ant-alert-error')).toBeTruthy();
  expect(scope.querySelector('.ant-alert-description')?.textContent).toBe(texts.detail);
}

/** 三处共用的判据：失败时该列表的空态文案不得出现。 */
function expectEmptyClaimAbsent(emptyText: string) {
  expect(screen.queryByText(emptyText)).toBeNull();
}

// ==================== Chat 左栏：会话列表 ====================

const chatSession = {
  id: 42, title: '较早的会话', mode: 'single', role_preset: null, model_id: 1, status: 'active',
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', message_count: 1, last_message: '旧消息',
};

function chatApi(sessionsImpl: () => Promise<unknown>) {
  vi.mocked(apiClient.get).mockImplementation((url) => {
    if (url === '/chat/sessions') return sessionsImpl() as never;
    if (url === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
    return Promise.resolve({ data: { items: [] } }) as never;
  });
}

function renderChat(path = '/research') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider><Chat /></LanguageProvider>
    </MemoryRouter>,
  );
}

const chatRail = () => document.querySelector('.ant-layout-sider') as HTMLElement;

describe('Chat left rail: a failed session list is never dressed up as "no sessions" (VS22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('finquant_lang', 'zh');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    useChatStore.setState({ sessions: [], currentSessionId: null, messages: {}, streamingContent: '', isStreaming: false });
  });

  afterEach(() => {
    act(() => message.destroy());
    vi.restoreAllMocks();
    useChatStore.setState({ sessions: [], currentSessionId: null, messages: {}, streamingContent: '', isStreaming: false });
  });

  it('shows an in-place error with a retry instead of the empty state when /chat/sessions fails', async () => {
    chatApi(() => Promise.reject(new Error('network down')));
    renderChat();

    await waitFor(() => expectFailureSurfaced(chatRail(), { failure: '会话列表读取失败', detail: 'network down' }));
    // 修前：这一格写着"暂无会话"，用户会以为自己从没保存过任何对话。
    expectEmptyClaimAbsent('暂无会话');
  });

  it('still shows the honest empty state when the list request succeeds and is empty', async () => {
    chatApi(() => Promise.resolve({ data: { items: [] } }));
    renderChat();

    expect(await screen.findByText('暂无会话')).toBeTruthy();
    expect(screen.queryByText('会话列表读取失败')).toBeNull();
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
  });

  it('really refetches the list from the retry, and recovers once it succeeds', async () => {
    let calls = 0;
    chatApi(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('boom'));
      return Promise.resolve({ data: { items: [chatSession] } });
    });
    renderChat();

    await waitFor(() => expectFailureSurfaced(chatRail(), { failure: '会话列表读取失败', detail: 'boom' }));
    expect(calls).toBe(1);

    fireEvent.click(within(chatRail()).getByRole('button', { name: RETRY }));

    // "重试确会重新发起"：请求次数真的 +1，而不是只把提示关掉。
    expect(await screen.findByText('较早的会话')).toBeTruthy();
    expect(calls).toBe(2);
    // 恢复成功 ⇒ 错误态消失（不得残留）。
    expect(screen.queryByText('会话列表读取失败')).toBeNull();
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('keeps the error state and stays retryable when the retry fails again (no retry loop)', async () => {
    let calls = 0;
    chatApi(() => { calls += 1; return Promise.reject(new Error('still down')); });
    renderChat();

    await waitFor(() => expectFailureSurfaced(chatRail(), { failure: '会话列表读取失败', detail: 'still down' }));
    expect(calls).toBe(1);

    fireEvent.click(within(chatRail()).getByRole('button', { name: RETRY }));
    await waitFor(() => expect(calls).toBe(2));
    expectFailureSurfaced(chatRail(), { failure: '会话列表读取失败', detail: 'still down' });
    expectEmptyClaimAbsent('暂无会话');

    // 可再试；且"失败"本身不触发任何自动重发（次数严格等于点击次数，无死循环）。
    fireEvent.click(within(chatRail()).getByRole('button', { name: RETRY }));
    await waitFor(() => expect(calls).toBe(3));
    expectFailureSurfaced(chatRail(), { failure: '会话列表读取失败', detail: 'still down' });
    expect(calls).toBe(3);
  });

  it('keeps a session created after a failed list read visible (the failure hides no real record)', async () => {
    chatApi(() => Promise.reject(new Error('network down')));
    vi.mocked(apiClient.post).mockResolvedValue({ data: {
      id: 77, title: '失败后新建的会话', mode: 'single', role_preset: null, model_id: 1, status: 'active',
      created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z', message_count: 0, last_message: null,
    } } as never);
    renderChat();

    await waitFor(() => expectFailureSurfaced(chatRail(), { failure: '会话列表读取失败', detail: 'network down' }));

    fireEvent.click(screen.getByRole('button', { name: /新建会话/ }));

    // 错误态仍在（列表确实没有被成功读取过），但这条**真实存在**的会话必须照常可见——
    // 失败态不能顺手把应用自己知道的记录也藏起来。
    expect(await within(chatRail()).findByText('失败后新建的会话')).toBeTruthy();
    expect(within(chatRail()).getByText('会话列表读取失败')).toBeTruthy();
    // 而"暂无会话"仍然不许出现（列表非空，antd 也不会渲染空态文案）。
    expectEmptyClaimAbsent('暂无会话');
  });

  it('keeps the deep-link notice and the list-read failure distinct (never blames missing data)', async () => {
    chatApi(() => Promise.reject(new Error('network down')));
    const warn = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    renderChat('/research?mode=fast&session=43');

    // 常驻的内联错误态（左栏原位）+ VS19 的一次性深链提示：同一次失败、两个粒度，都指向"读取失败"。
    await waitFor(() => expectFailureSurfaced(chatRail(), { failure: '会话列表读取失败', detail: 'network down' }));
    await waitFor(() => expect(warn).toHaveBeenCalledWith('会话列表读取失败，未能打开指定会话'));
    // 列表都没拿到，就无法判定"已不存在"——这条一个字都不许出现（错误归因）。
    expect(warn).not.toHaveBeenCalledWith('该会话已不存在，已显示当前会话列表');
    // VS16 语义不变：不为该 id 发请求。
    expect(apiClient.get).not.toHaveBeenCalledWith('/chat/sessions/43/messages');
  });
});

// ==================== Discussion 左栏：讨论列表 ====================

const discussionRoom = {
  id: 42, conversation_id: 142, topic: '测试议题',
  participants: [{ role_key: 'risk_manager', name: '风险官', avatar: '盾' }],
  total_rounds: 3, current_phase: 'active', summary: null, created_at: '2026-08-20T00:00:00Z',
};

function discussionApi(roomsImpl: () => Promise<unknown>) {
  vi.mocked(apiClient.get).mockImplementation((url) => {
    if (url === '/discussion/rooms') return roomsImpl() as never;
    if (url === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
    return Promise.resolve({ data: {} }) as never;
  });
}

function renderDiscussion(path = '/research') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider><Discussion /></LanguageProvider>
    </MemoryRouter>,
  );
}

const discussionRail = () => document.querySelector('.ant-layout-sider') as HTMLElement;

describe('Discussion left rail: a failed room list is never dressed up as "no discussions" (VS22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('finquant_lang', 'zh');
    useDiscussionStore.setState({ rooms: [], currentRoomId: null, messages: {}, streamingContent: '', isStreaming: false });
  });

  afterEach(() => {
    act(() => message.destroy());
    vi.restoreAllMocks();
    useDiscussionStore.setState({ rooms: [], currentRoomId: null, messages: {}, streamingContent: '', isStreaming: false });
  });

  it('shows an in-place error with a retry instead of the empty state when /discussion/rooms fails', async () => {
    discussionApi(() => Promise.reject(new Error('network down')));
    renderDiscussion();

    await waitFor(() => expectFailureSurfaced(discussionRail(), { failure: '讨论列表读取失败', detail: 'network down' }));
    expectEmptyClaimAbsent('暂无讨论');
  });

  it('still shows the honest empty state when the list request succeeds and is empty', async () => {
    discussionApi(() => Promise.resolve({ data: { items: [] } }));
    renderDiscussion();

    expect(await screen.findByText('暂无讨论')).toBeTruthy();
    expect(screen.queryByText('讨论列表读取失败')).toBeNull();
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
  });

  it('really refetches the list from the retry, and recovers once it succeeds', async () => {
    let calls = 0;
    discussionApi(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('boom'));
      return Promise.resolve({ data: { items: [discussionRoom] } });
    });
    renderDiscussion();

    await waitFor(() => expectFailureSurfaced(discussionRail(), { failure: '讨论列表读取失败', detail: 'boom' }));
    expect(calls).toBe(1);

    fireEvent.click(within(discussionRail()).getByRole('button', { name: RETRY }));

    expect(await screen.findByText('测试议题')).toBeTruthy();
    expect(calls).toBe(2);
    expect(screen.queryByText('讨论列表读取失败')).toBeNull();
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('keeps the error state and stays retryable when the retry fails again (no retry loop)', async () => {
    let calls = 0;
    discussionApi(() => { calls += 1; return Promise.reject(new Error('still down')); });
    renderDiscussion();

    await waitFor(() => expectFailureSurfaced(discussionRail(), { failure: '讨论列表读取失败', detail: 'still down' }));
    fireEvent.click(within(discussionRail()).getByRole('button', { name: RETRY }));
    await waitFor(() => expect(calls).toBe(2));
    expectFailureSurfaced(discussionRail(), { failure: '讨论列表读取失败', detail: 'still down' });
    expectEmptyClaimAbsent('暂无讨论');

    fireEvent.click(within(discussionRail()).getByRole('button', { name: RETRY }));
    await waitFor(() => expect(calls).toBe(3));
    expect(calls).toBe(3);
    expectFailureSurfaced(discussionRail(), { failure: '讨论列表读取失败', detail: 'still down' });
  });

  it('keeps a room created after a failed list read visible (the failure hides no real record)', async () => {
    discussionApi(() => Promise.reject(new Error('network down')));
    renderDiscussion();

    await waitFor(() => expectFailureSurfaced(discussionRail(), { failure: '讨论列表读取失败', detail: 'network down' }));

    // 模拟"失败后在本地新建了讨论"：store 里出现一条真实存在的房间记录。
    act(() => {
      useDiscussionStore.getState().addRoom({ ...discussionRoom, id: 77, topic: '失败后新建的讨论' });
    });

    expect(await within(discussionRail()).findByText('失败后新建的讨论')).toBeTruthy();
    expect(within(discussionRail()).getByText('讨论列表读取失败')).toBeTruthy();
    expectEmptyClaimAbsent('暂无讨论');
  });
});

// ==================== 首页"研究运行"区块 ====================

const statsFixture = {
  model_count: 0, conversation_count: 0, discussion_count: 0, message_count: 0, default_model: null,
  recent_conversations: [], recent_rooms: [],
  capabilities: {
    contract_version: 'local-capabilities/v1', runtime_mode: 'LOCAL_ONLY',
    local_core: { status: 'AVAILABLE', quality_status: 'OK' },
    model_ai: { status: 'UNCONFIGURED', quality_status: 'UNKNOWN', credential_source: 'none', model_id: 1, action_path: '/models' },
    market_data: { status: 'RUNTIME_CHECK_REQUIRED', quality_status: 'UNKNOWN' },
  },
} as unknown as DashboardStats;

const pulseFixture = {
  as_of: '2026-08-08T10:30:00+08:00', market: 'cn', scope: 'public_market_dimensions',
  status: 'ok', sources: ['eastmoney'],
  sections: {
    breadth: { status: 'ok', advancers: 10, decliners: 5, unchanged: 2 },
    movers: { status: 'ok', gainers: [], decliners: [] },
    industry: { status: 'ok', items: [] },
    concept: { status: 'ok', items: [] },
    sector_flow: { status: 'ok', items: [] },
    stock_flow: { status: 'ok', items: [] },
    weekly: { status: 'ok', items: [] },
    popular: { status: 'ok', items: [] },
  },
};

function dashboardApi(statsImpl: () => Promise<unknown>) {
  vi.mocked(apiClient.get).mockImplementation((url) => {
    if (String(url) === '/dashboard/stats') return statsImpl() as never;
    if (String(url) === '/dashboard/decision-inbox') return Promise.resolve({ data: { items: [] } }) as never;
    if (String(url) === '/dashboard/news') {
      return Promise.resolve({ data: {
        queried_at: '2026-08-08T10:30:00Z', as_of: '2026-08-08T10:30:00Z',
        providers_attempted: [], providers_used: [], errors: {}, data_status: 'OK', news: [],
      } }) as never;
    }
    if (String(url) === '/market/pulse') return Promise.resolve({ data: pulseFixture }) as never;
    return Promise.resolve({ data: {} }) as never;
  });
}

const renderDashboard = () => render(<MemoryRouter><LanguageProvider><Dashboard /></LanguageProvider></MemoryRouter>);
const runsBlock = () => document.querySelector('.research-runs') as HTMLElement;
const recentCards = () => document.querySelector('.workbench-context-grid') as HTMLElement;

describe('Dashboard research-runs block: a failed stats read is never dressed up as an empty run list (VS22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
  });

  it('surfaces the same failure in place instead of only rendering the empty run list', async () => {
    dashboardApi(() => Promise.reject(new Error('stats upstream unavailable')));
    renderDashboard();

    await waitFor(() => expectFailureSurfaced(runsBlock(), {
      failure: '研究运行记录读取失败', detail: 'stats upstream unavailable',
    }));
    // 修前：这一块只剩 `<p>UNKNOWN</p>`（空列表），同页两张卡片却显示 Alert —— 同页两种待遇。
    expect(within(runsBlock()).queryByText('UNKNOWN')).toBeNull();
    expect(runsBlock().querySelector('article')).toBeNull();

    // VS19 成果不受影响：两张"最近记录"卡片位置仍各有自己的 Alert 与重试。
    const cards = within(recentCards());
    expect(cards.getAllByText('近期记录读取失败')).toHaveLength(2);
    expect(cards.getAllByRole('button', { name: RETRY })).toHaveLength(2);
  });

  it('really refetches stats from the block retry and renders the runs once it succeeds', async () => {
    let calls = 0;
    dashboardApi(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('boom'));
      return Promise.resolve({ data: {
        ...statsFixture,
        recent_rooms: [{
          id: 42, conversation_id: 142, topic: '上周那篇 600519 的讨论',
          participants: [{ role_key: 'risk_manager', name: '风险官', avatar: '盾' }],
          total_rounds: 3, current_phase: 'done', summary: null, created_at: '2026-09-09T00:00:00Z',
        }],
      } });
    });
    renderDashboard();

    await waitFor(() => expectFailureSurfaced(runsBlock(), {
      failure: '研究运行记录读取失败', detail: 'boom',
    }));
    expect(calls).toBe(1);

    fireEvent.click(within(runsBlock()).getByRole('button', { name: RETRY }));

    expect(await within(runsBlock()).findByText('上周那篇 600519 的讨论')).toBeTruthy();
    expect(calls).toBe(2);
    expect(screen.queryByText('研究运行记录读取失败')).toBeNull();
  });

  it('keeps the honest empty state when stats succeed without any run (a legal empty must not look like a failure)', async () => {
    dashboardApi(() => Promise.resolve({ data: statsFixture }));
    renderDashboard();

    // stats 成功但 recent_rooms 为空 ⇒ 该区块显示其空态，且不得出现失败文案 / 重试。
    expect(await screen.findByText('近期会话')).toBeTruthy();
    expect(within(runsBlock()).getByText('UNKNOWN')).toBeTruthy();
    expect(screen.queryByText('研究运行记录读取失败')).toBeNull();
    expect(within(runsBlock()).queryByRole('button', { name: RETRY })).toBeNull();
  });
});
