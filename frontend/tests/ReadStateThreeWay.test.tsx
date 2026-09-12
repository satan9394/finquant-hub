// @vitest-environment jsdom
/* VS29：三态契约收口 —— **加载中 / 没有数据 / 读取失败** 必须互斥可辨
 *
 * 本文件针对的根因（A5 组件级观察）：`LoadFailureAlert` 旧契约只有 `error` / `onRetry`，没有
 * loading/empty 维度 ⇒ 每个使用点各自拼状态判断 ⇒ "加载中仍渲染空态文案"反复出现
 * （VS22 只分开了"失败 vs 空"，"加载中 vs 空"未分）。
 *
 * 因此本文件按**契约 → 各面**的顺序验证：
 *   ①`readStateOf` 的优先级（唯一判据处）；②`LoadStateView` 的四分支互斥（唯一渲染处）；
 *   ③各回填面的 loading / empty / error 三夹具；④ loading 期间**不出现**空态文案或 UNKNOWN；
 *   ⑤切房间失败**不串台**；⑥MemoryManager 同屏不矛盾；⑦全产品统一口径：**仅成功才清失败态**。
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoadStateView, readStateOf } from '../src/components/LoadFailureAlert';
import MemoryManager from '../src/components/MemoryManager';
import Chat from '../src/pages/Chat';
import Dashboard from '../src/pages/Dashboard';
import Discussion from '../src/pages/Discussion';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import apiClient from '../src/services/api';
import * as researchApi from '../src/services/researchApi';
import { useChatStore } from '../src/store/chatStore';
import { useDiscussionStore } from '../src/store/discussionStore';
import type { DashboardStats } from '../src/types';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() } }));
vi.mock('../src/services/researchApi', () => ({
  fetchMemories: vi.fn(),
  actOnMemory: vi.fn(),
  deleteMemory: vi.fn(),
  exportMemories: vi.fn(),
}));
vi.mock('../src/components/InvestmentCommittee', () => ({
  default: ({ topic }: { topic: string }) => <div data-testid="committee">{topic}</div>,
}));

const RETRY = /重\s*试/;
/** 永不 settle 的请求：稳定的"在途"夹具（比 fake timer 更接近真实竞态）。 */
const pending = () => new Promise(() => {}) as never;

// ==================== ① 判据：readStateOf 的优先级（唯一一处） ====================

describe('VS29 readStateOf: 三态判据只在这里定义一次', () => {
  it('失败优先于一切 —— 失败时绝不冒称"没有数据"', () => {
    expect(readStateOf({ failed: true, error: 'boom', resolved: true, count: 0 })).toEqual({ status: 'error', error: 'boom' });
    // 即使在途/已有内容，失败仍然是失败。
    expect(readStateOf({ failed: true, error: '', resolved: false, count: 3 }).status).toBe('error');
  });

  it('有内容就先给内容 —— 刷新在途不清空已读到的内容', () => {
    expect(readStateOf({ failed: false, resolved: true, count: 3 }).status).toBe('ready');
    expect(readStateOf({ failed: false, resolved: false, count: 3 }).status).toBe('ready');
  });

  it('"确实没有数据"（空态）只在成功读过且为空时成立', () => {
    expect(readStateOf({ failed: false, resolved: true, count: 0 }).status).toBe('empty');
  });

  it('还没有任何结论时兜底为 loading —— 而不是空态', () => {
    expect(readStateOf({ failed: false, resolved: false, count: 0 }).status).toBe('loading');
    expect(readStateOf({}).status).toBe('loading');
    // 四种状态两两不同（判别联合，不是三个可以被同时置真的布尔量）。
    const all = [
      readStateOf({ failed: false, resolved: false, count: 0 }).status,
      readStateOf({ failed: false, resolved: true, count: 0 }).status,
      readStateOf({ failed: true, resolved: true, count: 3 }).status,
      readStateOf({ failed: false, resolved: true, count: 1 }).status,
    ];
    expect(new Set(all).size).toBe(4);
  });
});

// ==================== ② 渲染：四分支互斥（唯一一处） ====================

describe('VS29 LoadStateView: 一个 switch ⇒ 三态互斥可辨', () => {
  const renderWith = (facts: Parameters<typeof readStateOf>[0]) => render(
    <LanguageProvider>
      <LoadStateView
        state={readStateOf(facts)}
        failureMessage="会话列表读取失败"
        onRetry={vi.fn()}
        loadingText="正在读取会话列表…"
        emptyContent={<span>暂无会话</span>}
      >
        <span>真实内容</span>
      </LoadStateView>
    </LanguageProvider>,
  );

  it('loading / empty / error / ready 四态各自只渲染自己那一支', () => {
    const loading = renderWith({ failed: false, resolved: false, count: 0 });
    expect(screen.getByText('正在读取会话列表…')).toBeTruthy();
    expect(screen.queryByText('暂无会话')).toBeNull();
    expect(screen.queryByText('会话列表读取失败')).toBeNull();
    expect(screen.queryByText('真实内容')).toBeNull();
    loading.unmount();

    const empty = renderWith({ failed: false, resolved: true, count: 0 });
    expect(screen.getByText('暂无会话')).toBeTruthy();
    expect(screen.queryByText('正在读取会话列表…')).toBeNull();
    expect(screen.queryByText('会话列表读取失败')).toBeNull();
    empty.unmount();

    const error = renderWith({ failed: true, error: 'network down', resolved: true, count: 0 });
    expect(screen.getByText('会话列表读取失败')).toBeTruthy();
    expect(screen.getByText('network down')).toBeTruthy();
    expect(screen.queryByText('暂无会话')).toBeNull();
    expect(screen.queryByText('正在读取会话列表…')).toBeNull();
    error.unmount();

    renderWith({ failed: false, resolved: true, count: 2 });
    expect(screen.getByText('真实内容')).toBeTruthy();
    expect(screen.queryByText('暂无会话')).toBeNull();
  });
});

// ==================== ③ 首页：两张卡片 + "研究运行"区块 ====================

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

describe('VS29 首页：loading / empty / error 三态互斥（两张卡片 + 研究运行区块）', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); localStorage.setItem('finquant_lang', 'zh'); });

  it('loading：在途期间不出现"暂无会话/暂无讨论"，研究运行区块也不出现 UNKNOWN', async () => {
    dashboardApi(pending);
    renderDashboard();

    // **先**断言"空态文案一个字都没有"（三态里最容易漏的就是这一条：修前 stats 没有 loading 维度，
    // 首帧两张卡片直接写"暂无会话/暂无讨论"、研究运行区块直接写 <p>UNKNOWN</p>）。
    expect(screen.queryByText('暂无会话')).toBeNull();
    expect(screen.queryByText('暂无讨论')).toBeNull();
    expect(within(runsBlock()).queryByText('UNKNOWN')).toBeNull();
    // 请求确实还在途（不是"已经空着"）：加载态与三态互斥才成立。
    await waitFor(() => expect(screen.getAllByText('正在读取最近记录…')).toHaveLength(2));
    expect(within(runsBlock()).getByText('正在读取研究运行记录…')).toBeTruthy();
    expect(screen.queryByText('暂无会话')).toBeNull();
    expect(screen.queryByText('暂无讨论')).toBeNull();
    expect(within(runsBlock()).queryByText('UNKNOWN')).toBeNull();
    // 三态互斥：加载中不同时出现失败态。
    expect(screen.queryByText('近期记录读取失败')).toBeNull();
    expect(screen.queryByText('研究运行记录读取失败')).toBeNull();
  }, 20000);

  it('empty：请求成功且为空 ⇒ 才出现"暂无…"与 UNKNOWN，且不出现任何加载/失败态', async () => {
    dashboardApi(() => Promise.resolve({ data: statsFixture }));
    renderDashboard();

    expect(await screen.findByText('暂无会话')).toBeTruthy();
    expect(screen.getByText('暂无讨论')).toBeTruthy();
    expect(within(runsBlock()).getByText('UNKNOWN')).toBeTruthy();
    expect(screen.queryByText('正在读取最近记录…')).toBeNull();
    expect(within(runsBlock()).queryByText('正在读取研究运行记录…')).toBeNull();
    expect(screen.queryByText('近期记录读取失败')).toBeNull();
    expect(screen.queryByText('研究运行记录读取失败')).toBeNull();
  }, 20000);

  it('error：失败 ⇒ 无空态文案、无 UNKNOWN、无加载文案（三态一个都不含糊）', async () => {
    dashboardApi(() => Promise.reject(new Error('stats upstream unavailable')));
    renderDashboard();

    await waitFor(() => expect(within(recentCards()).getAllByText('近期记录读取失败')).toHaveLength(2));
    expect(within(runsBlock()).getByText('研究运行记录读取失败')).toBeTruthy();
    expect(screen.queryByText('暂无会话')).toBeNull();
    expect(screen.queryByText('暂无讨论')).toBeNull();
    expect(within(runsBlock()).queryByText('UNKNOWN')).toBeNull();
    expect(screen.queryByText('正在读取最近记录…')).toBeNull();
    expect(within(runsBlock()).queryByText('正在读取研究运行记录…')).toBeNull();
  }, 20000);

  it('口径：重试在途**不清失败态**（不闪回空态、也不退回加载态）', async () => {
    let attempts = 0;
    dashboardApi(() => { attempts += 1; return attempts === 1 ? Promise.reject(new Error('boom')) as never : pending(); });
    renderDashboard();

    await waitFor(() => expect(within(recentCards()).getAllByText('近期记录读取失败')).toHaveLength(2));

    fireEvent.click(within(recentCards()).getAllByRole('button', { name: RETRY })[0]);
    await waitFor(() => expect(attempts).toBe(2));

    // 仅成功才清：重试在途时失败态必须仍在原位（修前 loadStats 先 setStatsFailed(false) ⇒ 这里会闪回"暂无会话"）。
    expect(within(recentCards()).getAllByText('近期记录读取失败')).toHaveLength(2);
    expect(screen.queryByText('暂无会话')).toBeNull();
    expect(screen.queryByText('暂无讨论')).toBeNull();
    expect(screen.queryByText('正在读取最近记录…')).toBeNull();
  }, 20000);
});

// ==================== ④ 左栏列表：加载中不伪装成"暂无…" ====================

const room = {
  id: 42, conversation_id: 142, topic: '上一条讨论',
  participants: [{ role_key: 'risk_manager', name: '风险官', avatar: '盾' }],
  total_rounds: 3, current_phase: 'active', summary: null, created_at: '2026-08-20T00:00:00Z',
};

describe('VS29 左栏列表：在途时不得出现空态文案', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('finquant_lang', 'zh');
    useChatStore.setState({ sessions: [], currentSessionId: null, messages: {}, streamingContent: '', isStreaming: false });
    useDiscussionStore.setState({ rooms: [], currentRoomId: null, messages: {}, streamingContent: '', isStreaming: false });
  });

  it('Chat 左栏：/chat/sessions 在途 ⇒ 加载态，且"暂无会话"一个字都没有', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => (url === '/chat/sessions' ? pending() : Promise.resolve({ data: { items: [] } }) as never));
    render(<MemoryRouter><LanguageProvider><Chat /></LanguageProvider></MemoryRouter>);

    const rail = document.querySelector('.ant-layout-sider') as HTMLElement;
    // 先断言"空态文案不得出现"，再断言加载态确实在（顺序是承重的：这是本卡的核心判据）。
    expect(screen.queryByText('暂无会话')).toBeNull();
    await waitFor(() => expect(within(rail).getByText('正在读取会话列表…')).toBeTruthy());
    expect(screen.queryByText('暂无会话')).toBeNull();
    expect(screen.queryByText('会话列表读取失败')).toBeNull();
  }, 20000);

  it('Chat 左栏：成功且为空 ⇒ 才出现"暂无会话"（空态只代表确实没有数据）', async () => {
    vi.mocked(apiClient.get).mockImplementation(() => Promise.resolve({ data: { items: [] } }) as never);
    render(<MemoryRouter><LanguageProvider><Chat /></LanguageProvider></MemoryRouter>);

    expect(await screen.findByText('暂无会话')).toBeTruthy();
    expect(screen.queryByText('正在读取会话列表…')).toBeNull();
  }, 20000);

  it('Discussion 左栏：/discussion/rooms 在途 ⇒ 加载态，且"暂无讨论"一个字都没有', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => (url === '/discussion/rooms' ? pending() : Promise.resolve({ data: { items: [] } }) as never));
    render(<MemoryRouter><LanguageProvider><Discussion /></LanguageProvider></MemoryRouter>);

    const rail = document.querySelector('.ant-layout-sider') as HTMLElement;
    expect(screen.queryByText('暂无讨论')).toBeNull();
    await waitFor(() => expect(within(rail).getByText('正在读取讨论列表…')).toBeTruthy());
    expect(screen.queryByText('暂无讨论')).toBeNull();
    expect(screen.queryByText('讨论列表读取失败')).toBeNull();
  }, 20000);
});

// ==================== ⑤ 不串台：切房间失败 ⇒ 右栏不得显示上一条 ====================

describe('VS29 Discussion 详情：切房间失败不串台', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('finquant_lang', 'zh');
    useDiscussionStore.setState({
      rooms: [room, { ...room, id: 43, conversation_id: 143, topic: '新选的讨论' }],
      currentRoomId: 42, messages: {}, streamingContent: '', isStreaming: false,
    });
  });

  it('切房间失败 ⇒ 右栏显示失败态 + 重试，绝不显示上一条内容', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/discussion/rooms') return Promise.resolve({ data: { items: [room, { ...room, id: 43, topic: '新选的讨论' }] } }) as never;
      if (url === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
      if (url === '/discussion/rooms/42') return Promise.resolve({ data: { room, messages: [] } }) as never;
      if (url === '/discussion/rooms/43') return Promise.reject(new Error('room 43 unavailable')) as never;
      return Promise.resolve({ data: {} }) as never;
    });
    render(<MemoryRouter><LanguageProvider><Discussion /></LanguageProvider></MemoryRouter>);

    const content = () => document.querySelector('.ant-layout-content') as HTMLElement;
    // 选中 42 ⇒ 右栏是上一条讨论的内容。
    expect(await within(content()).findByText('上一条讨论')).toBeTruthy();

    // 切到 43（该请求失败）。
    fireEvent.click(screen.getByText('新选的讨论'));

    await waitFor(() => expect(within(content()).getByText('讨论详情读取失败')).toBeTruthy());
    expect(within(content()).getByText('room 43 unavailable')).toBeTruthy();
    expect(within(content()).getByRole('button', { name: RETRY })).toBeTruthy();
    // 串台判据：右栏**不再**渲染任何委员会内容（更不是上一条的议题）。
    expect(within(content()).queryByTestId('committee')).toBeNull();
    expect(within(content()).queryByText('上一条讨论')).toBeNull();
    expect(within(content()).queryByText('正在加载讨论详情…')).toBeNull();
  }, 20000);

  it('详情在途 ⇒ 加载态（不是上一条内容、也不是空），失败后重试在途仍保持失败态', async () => {
    let detailCalls = 0;
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/discussion/rooms') return Promise.resolve({ data: { items: [room] } }) as never;
      if (url === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
      if (url === '/discussion/rooms/42') {
        detailCalls += 1;
        return detailCalls === 1 ? Promise.reject(new Error('first read failed')) as never : pending();
      }
      return Promise.resolve({ data: {} }) as never;
    });
    render(<MemoryRouter><LanguageProvider><Discussion /></LanguageProvider></MemoryRouter>);

    const content = () => document.querySelector('.ant-layout-content') as HTMLElement;
    await waitFor(() => expect(within(content()).getByText('讨论详情读取失败')).toBeTruthy());

    fireEvent.click(within(content()).getByRole('button', { name: RETRY }));
    await waitFor(() => expect(detailCalls).toBe(2));

    // 仅成功才清：重试在途仍是失败态（既不闪回加载中，也不显示"空"）。
    expect(within(content()).getByText('讨论详情读取失败')).toBeTruthy();
    expect(within(content()).queryByText('正在加载讨论详情…')).toBeNull();
    expect(within(content()).queryByTestId('committee')).toBeNull();
  }, 20000);
});

// ==================== ⑥ MemoryManager：同屏不得自相矛盾 ====================

const candidate = {
  id: 7, subject_type: 'instrument', subject_id: 'usAAPL', memory_type: 'hypothesis',
  information_kind: 'AI_INFERENCE', content: { text: 'Services margin needs verification' },
  source_kind: 'ai', source_id: 'research_report:4', evidence_id: null, valid_from: null, valid_to: null,
  observed_at: null, status: 'candidate' as const, confidence: null, quality_flags: ['UNVERIFIED'],
  supersedes_id: null, created_at: '2026-08-11T00:00:00Z', updated_at: '2026-08-11T00:00:00Z',
};

const renderMemory = () => render(<LanguageProvider><MemoryManager /></LanguageProvider>);
const FAILURE = '记忆读取失败，请稍后重试。';
const EMPTY = '暂无研究记忆';

/** 同屏不矛盾的判据：失败文案与空态文案**不得同时**出现在屏幕上。 */
function expectNotBothFailureAndEmpty() {
  const failure = screen.queryAllByText(FAILURE).length;
  const empty = screen.queryAllByText(EMPTY).length;
  expect(`${failure > 0 ? 'F' : '-'}${empty > 0 ? 'E' : '-'}`).not.toBe('FE');
}

describe('VS29 MemoryManager：三态互斥（修前"读取失败"与"暂无研究记忆"同屏并存）', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.setItem('finquant_lang', 'zh'); });

  it('loading：在途 ⇒ 加载态，既不说失败也不说"暂无"', async () => {
    vi.mocked(researchApi.fetchMemories).mockImplementation(() => pending());
    renderMemory();

    expect(screen.queryByText(EMPTY)).toBeNull();
    await waitFor(() => expect(screen.getByText('正在读取研究记忆…')).toBeTruthy());
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByText(FAILURE)).toBeNull();
    expectNotBothFailureAndEmpty();
  }, 20000);

  it('empty：成功且为空 ⇒ 才出现"暂无研究记忆"', async () => {
    vi.mocked(researchApi.fetchMemories).mockResolvedValue([]);
    renderMemory();

    expect(await screen.findByText(EMPTY)).toBeTruthy();
    expect(screen.queryByText(FAILURE)).toBeNull();
    expect(screen.queryByText('正在读取研究记忆…')).toBeNull();
    expectNotBothFailureAndEmpty();
  }, 20000);

  it('error：失败 ⇒ 只说失败，且**绝不**同时说"暂无研究记忆"', async () => {
    vi.mocked(researchApi.fetchMemories).mockRejectedValue(new Error('memory upstream unavailable'));
    renderMemory();

    expect(await screen.findByText(FAILURE)).toBeTruthy();
    expect(screen.getByText('memory upstream unavailable')).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByText('正在读取研究记忆…')).toBeNull();
    expectNotBothFailureAndEmpty();
  }, 20000);

  it('口径：读取失败后重试在途 ⇒ 失败态保持（不闪回"暂无"、也不退回加载态）', async () => {
    let calls = 0;
    vi.mocked(researchApi.fetchMemories).mockImplementation(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('boom')) as never : pending();
    });
    renderMemory();

    expect(await screen.findByText(FAILURE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    await waitFor(() => expect(calls).toBe(2));

    expect(screen.getByText(FAILURE)).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByText('正在读取研究记忆…')).toBeNull();
    expectNotBothFailureAndEmpty();
  }, 20000);

  it('恢复成功 ⇒ 失败态消失、内容出现（失败后重试成功这条路径）', async () => {
    let calls = 0;
    vi.mocked(researchApi.fetchMemories).mockImplementation(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('boom')) as never : Promise.resolve([candidate]) as never;
    });
    renderMemory();

    expect(await screen.findByText(FAILURE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: RETRY }));

    expect(await screen.findByText('AI_INFERENCE')).toBeTruthy();
    expect(screen.queryByText(FAILURE)).toBeNull();
    expect(screen.queryByText(EMPTY)).toBeNull();
  }, 20000);
});
