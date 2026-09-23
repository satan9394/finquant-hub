// @vitest-environment jsdom
//
// VS-36：Discover 的检索状态（结果 / 空态 / 公司名检索失败）是否**按查询词作用域**。
// 本文件**只新增断言**，不动既有断言、不放宽任何既有判据。
// 判据是结构性的：状态自带"属于哪个查询词"，渲染处只认属于当前词的那一份。
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Discover from '../src/pages/Discover';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: api }));

const alpha = vi.hoisted(() => ({ searchAlpha: vi.fn() }));
vi.mock('../src/services/alphaApi', () => ({ searchAlpha: alpha.searchAlpha }));

vi.mock('../src/components/alpha/AlphaResearchPanel', () => ({ default: () => null }));

const NAME_FAILED = /公司搜索暂不可用/;
const NO_STOCKS_EMPTY = '没有可验证的股票结果；请输入明确代码后再试';
const NO_FACTORS_EMPTY = '没有匹配的真实因子目录结果';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const stock = (ticker: string, name: string) => ({
  ticker, name, price: 1, change_percent: 0, return_60d_pct: 0, signal: 'UNKNOWN',
});
const factor = (name: string) => ({ type: 'alpha' as const, name, desc: '本地目录' });

function renderDiscover(path = '/discover') {
  return render(<MemoryRouter initialEntries={[path]}><Discover /></MemoryRouter>);
}

function submitQuery(text: string) {
  fireEvent.change(screen.getByLabelText('发现条件'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /开始发现/ }));
}

const searchCallCount = () => api.get.mock.calls.filter((call) => call[0] === '/market/search').length;

beforeEach(() => {
  vi.clearAllMocks();
  alpha.searchAlpha.mockResolvedValue([]);
  api.post.mockResolvedValue({ data: { items: [], errors: [] } });
  api.get.mockImplementation(async (url: string) => {
    if (url === '/market/search') return { data: { items: [{ code: '600519', name: '贵州茅台' }] } };
    return { data: {} };
  });
});

describe('Discover：检索状态按查询词作用域（VS-36）', () => {
  it('当前查询词自己失败时显示它自己的失败；换成新词后不得再挂在新词上', async () => {
    api.get.mockImplementation(async (url: string, config?: { params?: { q?: string } }) => {
      if (url !== '/market/search') return { data: {} };
      if (config?.params?.q === '茅台') throw new Error('market search offline');
      return { data: { items: [{ code: '00700', name: '腾讯控股' }] } };
    });
    api.post.mockResolvedValue({ data: { items: [stock('00700', '腾讯控股')], errors: [] } });
    alpha.searchAlpha.mockResolvedValue([factor('因子乙')]);

    renderDiscover();
    submitQuery('茅台');
    // 反向断言：当前词（茅台）真的失败 ⇒ 必须显示它自己的失败
    expect(await screen.findByText(NAME_FAILED)).toBeTruthy();

    submitQuery('腾讯');
    expect(await screen.findByText('因子乙')).toBeTruthy();
    // 换词不串：上一词的失败原文不得出现在新词上
    expect(screen.queryByText(NAME_FAILED)).toBeNull();
  });

  it('换查询词在途时不得继续显示上一词的结果，也不得把在途渲染成"空"', async () => {
    const pendingScreen = deferred<{ data: { items: ReturnType<typeof stock>[]; errors: unknown[] } }>();
    const pendingFactors = deferred<unknown[]>();
    api.get.mockImplementation(async (url: string, config?: { params?: { q?: string } }) => {
      if (url !== '/market/search') return { data: {} };
      return {
        data: {
          items: config?.params?.q === '茅台'
            ? [{ code: '600519', name: '贵州茅台' }]
            : [{ code: '00700', name: '腾讯控股' }],
        },
      };
    });
    api.post
      .mockImplementationOnce(async () => ({ data: { items: [stock('600519', '贵州茅台')], errors: [] } }))
      .mockImplementationOnce(() => pendingScreen.promise);
    alpha.searchAlpha
      .mockImplementationOnce(async () => [factor('因子甲')])
      .mockImplementationOnce(() => pendingFactors.promise);

    renderDiscover();
    submitQuery('茅台');
    expect(await screen.findByText('贵州茅台')).toBeTruthy();
    expect(screen.getByText('因子甲')).toBeTruthy();

    submitQuery('腾讯');
    await waitFor(() => expect(searchCallCount()).toBe(2));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));

    // 上一词的结果不得挂在新词上
    expect(screen.queryByText('贵州茅台')).toBeNull();
    expect(screen.queryByText('因子甲')).toBeNull();
    // 在途不得伪装成"确实没有"
    expect(screen.queryByText(NO_FACTORS_EMPTY)).toBeNull();
    expect(screen.queryByText(NO_STOCKS_EMPTY)).toBeNull();
  });

  it('公司名检索失败可重试，且重试真的重发请求（请求计数）', async () => {
    let firstAttempt = true;
    api.get.mockImplementation(async (url: string) => {
      if (url !== '/market/search') return { data: {} };
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error('market offline');
      }
      return { data: { items: [{ code: '600519', name: '贵州茅台' }] } };
    });
    api.post.mockResolvedValue({ data: { items: [stock('600519', '贵州茅台')], errors: [] } });

    renderDiscover();
    submitQuery('茅台');
    expect(await screen.findByText(NAME_FAILED)).toBeTruthy();
    expect(searchCallCount()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    // 重试是**真的重发**：同一查询词的 /market/search 计数从 1 变 2（与成功与否解耦）
    await waitFor(() => expect(searchCallCount()).toBe(2));
    expect(api.get).toHaveBeenLastCalledWith('/market/search', { params: { q: '茅台' } });
    // 成功之后失败态才被清掉（不是"发起时清"）
    expect(await screen.findByText('贵州茅台')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(NAME_FAILED)).toBeNull());
  });

  it('公司名检索失败不得被渲染成"没有股票结果"的空态', async () => {
    api.get.mockImplementation(async (url: string) => {
      if (url !== '/market/search') return { data: {} };
      throw new Error('market offline');
    });

    renderDiscover();
    submitQuery('茅台');
    expect(await screen.findByText(NAME_FAILED)).toBeTruthy();
    expect(screen.queryByText(NO_STOCKS_EMPTY)).toBeNull();
  });
});
