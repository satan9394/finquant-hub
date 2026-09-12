// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Dashboard, {
  DecisionInboxPanel, LocalCapabilityBanner, MarketSignalAvailability, type DecisionInboxItem,
} from '../src/pages/Dashboard';
import apiClient from '../src/services/api';
import type { DashboardStats, DiscussionRoom, Session } from '../src/types';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));


const item: DecisionInboxItem = {
  id: 'thesis-claim-event:9',
  kind: 'thesis_claim_change',
  priority: 'high',
  why_now: '价格越过已保存阈值',
  occurred_at: '2026-08-12 08:00:00',
  object_ref: { type: 'thesis', id: 7, title: 'Apple Thesis', ticker: 'usAAPL', path: '/thesis?id=7' },
  evidence_refs: [{
    evidence_id: 'ev_price_current', kind: 'observed_fact', data_status: 'OK',
    source: 'fixture.market', as_of: '2026-08-12', retrieved_at: '2026-08-12T08:00:00Z',
  }],
  quality_status: 'OK',
  next_action: { kind: 'navigate', label: '复核论文与证据', path: '/thesis?id=7' },
};

describe('DecisionInboxPanel', () => {
  it('renders loading, error, and empty states explicitly', () => {
    const { rerender } = render(<DecisionInboxPanel items={[]} loading error="" onRetry={vi.fn()} onNavigate={vi.fn()} />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();

    const retry = vi.fn();
    rerender(<DecisionInboxPanel items={[]} loading={false} error="upstream unavailable" onRetry={retry} onNavigate={vi.fn()} />);
    expect(screen.getByText('upstream unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<DecisionInboxPanel items={[]} loading={false} error="" onRetry={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('今天没有需要复核的用户对象变化')).toBeTruthy();
  });

  it('shows why-now and routes evidence detail through the chip-opened drawer', () => {
    const navigate = vi.fn();
    render(<DecisionInboxPanel items={[item]} loading={false} error="" onRetry={vi.fn()} onNavigate={navigate} />);

    expect(screen.getByText('价格越过已保存阈值')).toBeTruthy();
    expect(screen.getByText('OK')).toBeTruthy();
    // BACKLOG-032 Step D：卡面不再平铺逐条 provenance（id/source/asOf/quality）；
    // 证据细节移入既有 EvidenceDrawer——点证据 chip 打开抽屉并展示同一信息。
    expect(screen.queryByText(/ev_price_current · fixture\.market · 2026-08-12 · OK/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /FACT，点击查看证据/ }));
    expect(screen.getByText(/fixture\.market/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '复核论文与证据' }));
    expect(navigate).toHaveBeenCalledWith('/thesis?id=7');
  });
});

const capabilities: DashboardStats['capabilities'] = {
  contract_version: 'local-capabilities/v1',
  runtime_mode: 'LOCAL_ONLY',
  local_core: { status: 'AVAILABLE', quality_status: 'OK' },
  model_ai: {
    status: 'UNCONFIGURED', quality_status: 'UNKNOWN', credential_source: 'none', model_id: 1, action_path: '/models',
  },
  market_data: { status: 'RUNTIME_CHECK_REQUIRED', quality_status: 'UNKNOWN' },
};

describe('LocalCapabilityBanner', () => {
  it('keeps missing model configuration non-blocking and links to the existing repair path', () => {
    const navigate = vi.fn();
    render(<LocalCapabilityBanner capabilities={capabilities} onNavigate={navigate} />);

    expect(screen.getByText('本地核心已可用，AI 模型尚未配置')).toBeTruthy();
    expect(screen.getByText(/模型：UNCONFIGURED \/ UNKNOWN/)).toBeTruthy();
    expect(screen.getByText(/行情：RUNTIME_CHECK_REQUIRED \/ UNKNOWN/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '配置模型' }));
    expect(navigate).toHaveBeenCalledWith('/models');
  });

  it('does not turn configured credentials into a connectivity claim', () => {
    render(<LocalCapabilityBanner
      capabilities={{ ...capabilities, model_ai: { ...capabilities.model_ai, status: 'CONFIGURED_UNVERIFIED', credential_source: 'environment' } }}
      onNavigate={vi.fn()}
    />);

    expect(screen.getByText('模型凭据已配置，连通性尚未验证')).toBeTruthy();
    expect(screen.getByText(/配置存在不等于上游可用/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '去模型管理测试' })).toBeTruthy();
  });

  it('keeps the model row intact when market data is pending and adds an honest pending row', () => {
    const navigate = vi.fn();
    render(<LocalCapabilityBanner capabilities={capabilities} onNavigate={navigate} />);

    // model_ai 行保留现状（文案/按钮/导航不变）。
    expect(screen.getByText('本地核心已可用，AI 模型尚未配置')).toBeTruthy();
    expect(screen.getByText(/模型：UNCONFIGURED \/ UNKNOWN/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '配置模型' }));
    expect(navigate).toHaveBeenCalledWith('/models');

    // market_data 行：RUNTIME_CHECK_REQUIRED → 诚实提示 + 动作。
    expect(screen.getByText(/行情源状态待检查/)).toBeTruthy();
    expect(screen.getByText(/检查网络后重试/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '去行情检索试试' }));
    expect(navigate).toHaveBeenCalledWith('/discover');
  });

  it('hides the market-data pending row once quality_status is confirmed OK', () => {
    render(<LocalCapabilityBanner
      capabilities={{ ...capabilities, market_data: { status: 'RUNTIME_CHECK_REQUIRED', quality_status: 'OK' } }}
      onNavigate={vi.fn()}
    />);

    expect(screen.getByText('本地核心已可用，AI 模型尚未配置')).toBeTruthy();
    expect(screen.queryByText(/行情源状态待检查/)).toBeNull();
    expect(screen.queryByRole('button', { name: '去行情检索试试' })).toBeNull();
  });
});

describe('MarketSignalAvailability', () => {
  it('keeps the unsupported cross-ticker aggregate UNKNOWN and offers a concrete analysis path', () => {
    const navigate = vi.fn();
    render(<MarketSignalAvailability onNavigate={navigate} />);

    expect(screen.getByText('UNKNOWN')).toBeTruthy();
    expect(screen.getByText('暂无可审计的跨标的信号汇总')).toBeTruthy();
    expect(screen.getByText(/UNKNOWN 不代表近期没有信号/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '分析示例 600519' }));
    expect(navigate).toHaveBeenCalledWith('/analysis/600519');
  });
});

// ==================== BACKLOG-035b：Dashboard 首屏挂载 LocalCapabilityBanner ====================

const statsFixture: DashboardStats = {
  model_count: 1,
  conversation_count: 1,
  discussion_count: 1,
  message_count: 1,
  default_model: null,
  recent_conversations: [],
  recent_rooms: [],
  capabilities,
};

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

function mockDashboardApis(statsImpl: () => Promise<{ data: DashboardStats }>) {
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

describe('Dashboard page mount of LocalCapabilityBanner (BACKLOG-035b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('keeps the banner hidden while stats are loading (stats null → no flash)', async () => {
    mockDashboardApis(() => new Promise(() => {}) as never);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    // 等其它数据源落定后再断言：stats 未返回时 Banner 整块不渲染。
    expect(await screen.findByText('今天没有需要复核的用户对象变化')).toBeTruthy();
    expect(screen.queryByText('本地核心已可用，AI 模型尚未配置')).toBeNull();
    expect(screen.queryByText(/行情源状态待检查/)).toBeNull();
    expect(screen.queryByRole('button', { name: '配置模型' })).toBeNull();
    expect(screen.queryByRole('button', { name: '去行情检索试试' })).toBeNull();
  });

  it('renders the LocalCapabilityBanner on first paint once stats resolve with capabilities', async () => {
    mockDashboardApis(() => Promise.resolve({ data: statsFixture }));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    // stats 就绪 → 首屏渲染 Banner：model_ai 行（未配置）+ market_data 行（UNKNOWN 诚实提示）。
    expect(await screen.findByText('本地核心已可用，AI 模型尚未配置')).toBeTruthy();
    expect(screen.getByText(/模型：UNCONFIGURED \/ UNKNOWN/)).toBeTruthy();
    expect(screen.getByText(/行情源状态待检查/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '配置模型' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '去行情检索试试' })).toBeTruthy();
  });

  it('hides the market-data pending row at page level once quality_status is OK', async () => {
    mockDashboardApis(() => Promise.resolve({
      data: {
        ...statsFixture,
        capabilities: {
          ...capabilities,
          market_data: { status: 'RUNTIME_CHECK_REQUIRED', quality_status: 'OK' },
        },
      },
    }));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByText('本地核心已可用，AI 模型尚未配置')).toBeTruthy();
    expect(screen.queryByText(/行情源状态待检查/)).toBeNull();
    expect(screen.queryByRole('button', { name: '去行情检索试试' })).toBeNull();
    // model_ai 行动作仍可用。
    expect(screen.getByRole('button', { name: '配置模型' })).toBeTruthy();
  });
});

// ==================== VS16：首页"最近会话/最近讨论"点击后打开"那一条" ====================

const recentConversation: Session = {
  id: 7, title: '关于 600519 的追问', mode: 'single', role_preset: null, model_id: 1, status: 'active',
  created_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-10T00:00:00Z',
  message_count: 2, last_message: '现金流如何',
};

const recentRoom: DiscussionRoom = {
  id: 42, conversation_id: 142, topic: '上周那篇 600519 的讨论',
  participants: [{ role_key: 'risk_manager', name: '风险官', avatar: '盾' }],
  total_rounds: 3, current_phase: 'done', summary: null, created_at: '2026-09-09T00:00:00Z',
};

const recordStats: DashboardStats = {
  ...statsFixture, recent_conversations: [recentConversation], recent_rooms: [recentRoom],
};

function Destination() {
  const location = useLocation();
  return <output data-testid="destination">{location.pathname + location.search}</output>;
}

describe('Dashboard recent-record deep links (VS16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('links each recent conversation and discussion item to that exact record', async () => {
    mockDashboardApis(() => Promise.resolve({ data: recordStats }));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    const conversationLink = await screen.findByRole('link', { name: /关于 600519 的追问/ });
    expect(conversationLink.getAttribute('href')).toBe('/research?mode=fast&session=7');
    const roomLink = screen.getByRole('link', { name: /上周那篇 600519 的讨论/ });
    expect(roomLink.getAttribute('href')).toBe('/research?mode=review&room=42');
  });

  it.each([['/chat', 0], ['/discussion', 1]] as const)(
    'keeps the card-level 查看全部 entry free of any record id (%s)',
    async (expected, index) => {
      mockDashboardApis(() => Promise.resolve({ data: recordStats }));
      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<Destination />} />
            <Route path="/discussion" element={<Destination />} />
          </Routes>
        </MemoryRouter>,
      );

      const viewAll = await screen.findAllByRole('button', { name: '查看全部' });
      expect(viewAll).toHaveLength(2);
      fireEvent.click(viewAll[index]);
      expect((await screen.findByTestId('destination')).textContent).toBe(expected);
    },
  );
});
