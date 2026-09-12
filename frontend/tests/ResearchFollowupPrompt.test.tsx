// @vitest-environment jsdom
/*
 * VS-24：标的研究页 / 分析页的追问条提交后，问题必须**真的被接住**。
 *
 * 修前：`?prompt=` 只在挂载时被读一次、且带 `!currentSymbol` 条件 ⇒
 * `/research/:symbol`（同一 Route 只改查询串，不重挂载）提交后界面零反馈，
 * 问题只躺在地址栏；而 `/analysis/:ticker` 因 Route 变化重挂载 "看起来正常"
 * ——同一个按钮两条路径行为相反。本文件把"两路径同源"作为核心断言。
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FollowupComposer, followupResearchPath } from '../src/App';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import ResearchWorkspace from '../src/pages/ResearchWorkspace';
import StockAnalysis from '../src/pages/StockAnalysis';
import apiClient from '../src/services/api';

const researchApi = vi.hoisted(() => ({
  fetchChipDistribution: vi.fn(),
  fetchDragonTiger: vi.fn(),
  fetchInstrumentBars: vi.fn(),
  fetchInstrumentFundamentals: vi.fn(),
  fetchInstrumentSnapshot: vi.fn(),
  fetchMoneyFlow: vi.fn(),
  fetchResearchDiscussions: vi.fn(),
  fetchResearchHistory: vi.fn(),
  fetchResearchReport: vi.fn(),
  fetchResearchTheses: vi.fn(),
  fetchResearchWorkspace: vi.fn(),
  listResearchWorkspaces: vi.fn(),
  saveResearchWorkspace: vi.fn(),
  searchInstruments: vi.fn(),
}));
const stockApi = vi.hoisted(() => ({ fetchQuote: vi.fn(), searchStocks: vi.fn() }));

vi.mock('../src/services/researchApi', () => researchApi);
vi.mock('../src/services/stockApi', () => stockApi);
// api.ts 单例：Chat / StockAnalysis 都走它（追问落点是否发生真实请求由它见证）。
vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() } }));
vi.mock('../src/components/research/ResearchCharts', () => ({ default: () => <div>CHARTS</div> }));
vi.mock('../src/components/SwarmStatusCard', () => ({ default: () => null }));
vi.mock('../src/components/research/ResearchContinuity', () => ({ default: () => null }));
vi.mock('../src/components/research/ResearchIntentPicker', () => ({ default: () => null }));
vi.mock('../src/components/research/FundamentalMetricsPanel', () => ({ default: () => null }));
vi.mock('../src/components/ChipHistoryChart', () => ({ default: () => null }));
vi.mock('../src/components/MoneyFlowChart', () => ({ default: () => null }));

const snapshot = {
  instrument: { symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE', currency: 'CNY', asset_type: 'stock' },
  data: {
    price: 1500, last_close: 1490, open: 1495, high: 1510, low: 1480,
    volume: 1000, amount: 1_000_000, change: 10, change_percent: 0.67,
    turnover_rate: 0.2, pe: 20, pb: 8, market_cap: 1_000_000_000, amplitude: 2,
  },
  provider: 'eastmoney', as_of: '2026-08-31T15:00:00+08:00', timezone: 'Asia/Shanghai',
  currency: 'CNY', adjustment: null, frequency: null, quality_flags: [],
};

/** 复刻 AppLayout 的追问条接线（`/analysis/:ticker`、`/research/:symbol` 共用同一组件）。 */
function FollowupRoute() {
  const { ticker, symbol } = useParams<{ ticker?: string; symbol?: string }>();
  const raw = ticker ?? symbol;
  return raw && raw !== 'reports' ? <FollowupComposer symbol={raw} /> : null;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderApp(path: string) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/analysis/:ticker" element={<><StockAnalysis /><FollowupRoute /><LocationProbe /></>} />
          <Route path="/research" element={<><ResearchWorkspace /><FollowupRoute /><LocationProbe /></>} />
          <Route path="/research/:symbol" element={<><ResearchWorkspace /><FollowupRoute /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

/** 从追问条提交一个问题（与用户操作同路径：输入 + 回车）。 */
function submitFollowup(question: string) {
  const input = screen.getByRole('textbox', { name: /继续追问/ });
  fireEvent.change(input, { target: { value: question } });
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });
}

/** 一次追问的"落地指纹"：地址栏 + 可见回执 + 问答面草稿。 */
async function followupOutcome(question: string) {
  const location = () => screen.getByTestId('location').textContent ?? '';
  await waitFor(() => expect(location()).toContain('mode=fast'));
  const receipt = (await screen.findByTestId('followup-received')).textContent ?? '';
  const draft = (await screen.findByDisplayValue(question)) as HTMLTextAreaElement;
  return { location: location(), receipt, draft: draft.value };
}

/*
 * VS-31：本文件首条用例要**首次**挂载整个研究页（antd 组件树 + 追问条接线），
 * 实测正常耗时 1.5–4.6s，逼近 vitest 默认 testTimeout = 5000ms ⇒ 负载下必红。
 * 这里只把该条用例的**时间上限**抬到 15s，**不是放宽断言**：它的三条断言逐字未变，
 * 也没有新增任何"弱断言"（查询-不存在式 / 不抛错式 / 存在即可式 / 任意值匹配器）。
 * 既无法在不削弱该用例的前提下削减其前置工作量（它要渲染的就是真实页面本身，
 * 再 mock 掉组件就等于不再验证"追问真的被接住"），也不该给全文件放宽——
 * 其余用例实测最长 ~1.5s，保留默认 5s 才能让"真挂起"快速失败。
 */
const FIRST_PAGE_MOUNT_TIMEOUT_MS = 15_000;

describe('VS-24 追问被接住（唯一消费点）', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
    researchApi.fetchInstrumentSnapshot.mockResolvedValue(snapshot);
    researchApi.fetchInstrumentBars.mockResolvedValue({ ...snapshot, instrument: snapshot.instrument, items: [], indicators: {}, frequency: '1d' });
    researchApi.fetchInstrumentFundamentals.mockResolvedValue({ ...snapshot, instrument: snapshot.instrument, items: [] });
    researchApi.fetchResearchWorkspace.mockResolvedValue({ symbol: '600519', notes: '', evidence: [], saved: false });
    researchApi.fetchChipDistribution.mockResolvedValue(null);
    researchApi.fetchMoneyFlow.mockResolvedValue(null);
    researchApi.fetchDragonTiger.mockResolvedValue({ ticker: '600519', date: '2026-08-31', source: 'eastmoney.datacenter-web', quality: 'DIRECT', items: [] });
    researchApi.fetchResearchHistory.mockResolvedValue([]);
    researchApi.fetchResearchDiscussions.mockResolvedValue([]);
    researchApi.fetchResearchTheses.mockResolvedValue([]);
    researchApi.listResearchWorkspaces.mockResolvedValue([]);
    researchApi.searchInstruments.mockResolvedValue({ items: [] });
    stockApi.fetchQuote.mockResolvedValue({ code: '600519', name: '贵州茅台', price: 1500, change_percent: 0.67 });
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/chat/sessions') return Promise.resolve({ data: { items: [] } }) as never;
      if (url === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
      return Promise.resolve({ data: { items: [] } }) as never;
    });
  });

  it('标的研究页：追问真的被接住（问答面 + 可见回执 + 可发送草稿），不再停在原地', async () => {
    renderApp('/research/600519?prompt=%E7%8E%B0%E9%87%91%E6%B5%81%E8%B4%A8%E9%87%8F%E5%A6%82%E4%BD%95%EF%BC%9F');

    const outcome = await followupOutcome('现金流质量如何？');
    // ① 界面确实变了：分析面 → 问答面（不是"点了没反应"）
    expect(screen.getByTestId('research-mode-fast')).toBeTruthy();
    // ② 原问题被可见地接住（回执 + 问答面草稿），原样不截断
    expect(outcome.receipt).toContain('现金流质量如何？');
    expect(outcome.draft).toBe('现金流质量如何？');
    // ③ 有标的时绝不退化成标的检索（修前"有标的永不出手"的反面：也不能乱检索）
    expect(researchApi.searchInstruments).not.toHaveBeenCalled();
  }, FIRST_PAGE_MOUNT_TIMEOUT_MS);

  it('追问去向只有一个规范形态（两条入口都由它拼 URL）', () => {
    expect(followupResearchPath('600519', '现金流质量如何？'))
      .toBe('/research/600519?prompt=%E7%8E%B0%E9%87%91%E6%B5%81%E8%B4%A8%E9%87%8F%E5%A6%82%E4%BD%95%EF%BC%9F');
    expect(followupResearchPath('AAPL', 'a b')).toBe('/research/AAPL?prompt=a%20b');
  });

  it('两路径对照：同一次追问从两条入口提交，落地指纹完全相同', async () => {
    const fromResearch = renderApp('/research/600519');
    submitFollowup('现金流质量如何？');
    const viaResearch = await followupOutcome('现金流质量如何？');
    fromResearch.unmount();

    const fromAnalysis = renderApp('/analysis/600519');
    submitFollowup('现金流质量如何？');
    const viaAnalysis = await followupOutcome('现金流质量如何？');
    fromAnalysis.unmount();

    expect(viaAnalysis).toEqual(viaResearch);
    expect(viaResearch.location).toBe('/research/600519?mode=fast');
  });

  it('追问优先于 mode：?mode=deep 也照样把问题交给能作答的问答面', async () => {
    renderApp('/research/600519?mode=deep&prompt=%E7%8E%B0%E9%87%91%E6%B5%81%E8%B4%A8%E9%87%8F%E5%A6%82%E4%BD%95%EF%BC%9F');

    await followupOutcome('现金流质量如何？');
    expect(screen.getByTestId('location').textContent).toBe('/research/600519?mode=fast');
  });

  it('消费后清理：地址栏不再带 prompt，刷新（无 state 重新进入）不再重放', async () => {
    const first = renderApp('/research/600519?prompt=%E5%B7%B2%E6%B6%88%E8%B4%B9');
    await followupOutcome('已消费');
    expect(screen.getByTestId('location').textContent).not.toContain('prompt');
    first.unmount();

    // "刷新"：同一 URL 重新挂载（浏览器不会恢复这次 replace 之前的历史记录）
    renderApp('/research/600519?mode=fast');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/research/600519?mode=fast'));
    expect(screen.queryByTestId('followup-received')).toBeNull();
    expect(researchApi.searchInstruments).not.toHaveBeenCalled();
  });

  it('无标的的既有 B6 行为不变：预填 + 自动检索一次，并清理地址栏', async () => {
    renderApp('/research?prompt=%E8%8C%85%E5%8F%B0');

    await waitFor(() => expect(researchApi.searchInstruments).toHaveBeenCalledTimes(1));
    expect(researchApi.searchInstruments).toHaveBeenCalledWith('茅台');
    const searchInput = document.querySelector('.instrument-search input') as HTMLInputElement | null;
    await waitFor(() => expect(searchInput?.value).toBe('茅台'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/research'));
  });

  it('空 prompt：不发起任何研究/追问，只清理地址栏', async () => {
    renderApp('/research/600519?prompt=');

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/research/600519'));
    expect(screen.queryByTestId('followup-received')).toBeNull();
    expect(screen.queryByTestId('research-mode-fast')).toBeNull();
    expect(screen.getByTestId('instrument-research-page')).toBeTruthy();
    expect(researchApi.searchInstruments).not.toHaveBeenCalled();
  });

  it('纯空白 prompt：同"空"，不得发起空追问', async () => {
    renderApp('/research/600519?prompt=%20%20');

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/research/600519'));
    expect(screen.queryByTestId('followup-received')).toBeNull();
  });

  it('连续提交两次不同追问：以最后一次为准，且不重跑第一次', async () => {
    renderApp('/research/600519');
    submitFollowup('第一次追问');
    const first = await followupOutcome('第一次追问');

    // 第二次提交（入口仍在：/research/:symbol 上常驻追问条）
    submitFollowup('第二次追问');
    await waitFor(() => expect(screen.getByTestId('followup-received').textContent).toContain('第二次追问'));
    expect(screen.getByTestId('followup-received').textContent).not.toContain('第一次追问');
    expect(screen.getByTestId('location').textContent).toBe('/research/600519?mode=fast');
    // 第一次的那份草稿不再存在（没有把两次追问排队，也没有重跑第一次）
    expect(screen.queryByDisplayValue('第一次追问')).toBeNull();
    expect(first.receipt).toContain('第一次追问');
    expect(researchApi.searchInstruments).not.toHaveBeenCalled();
  });

  it('回归：无标的 + mode=fast 时 Chat 自己的 ?prompt= 草稿契约不变（不动它）', async () => {
    renderApp('/research?mode=fast&prompt=%E6%A0%B8%E9%AA%8C%E8%B4%B5%E5%B7%9E%E8%8C%85%E5%8F%B0%E9%A3%8E%E9%99%A9');

    expect(await screen.findByDisplayValue('核验贵州茅台风险')).toBeTruthy();
    // 该类 URL 仍由 Chat 自己消费：不看回执、不发检索
    expect(screen.queryByTestId('followup-received')).toBeNull();
    expect(researchApi.searchInstruments).not.toHaveBeenCalled();
  });
});
