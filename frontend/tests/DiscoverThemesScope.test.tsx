// @vitest-environment jsdom
//
// VS-39：DiscoverThemes 的板块检索状态是否**按关键词作用域**、失败是否可重试。
//
// 修前：`payload` / `error` 是两个各自赋值的 state，且都在**发起时**被清
// （`setPayload(null)` / `setError(false)`）；`error` 是个无归属布尔量、还把底层错误原文吞掉，
// 失败也没有任何重试入口 ⇒ 改动输入框换成别的词之后，上一词的失败仍然挂在屏幕上。
//
// 本文件**只新增断言**，不动既有断言、不放宽任何既有判据。
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DiscoverThemes from '../src/components/DiscoverThemes';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: api }));

const THEMES_FAILED = /行业 \/ 概念数据暂不可用/;
const SEARCH_LABEL = '按行业 / 概念找公司';

const themesPayload = (themeName: string, code: string) => ({
  source: ['eastmoney'],
  as_of: '2026-09-07',
  status: 'ok',
  themes: [{ code: 'industry', name: themeName, kind: 'industry', stocks: [{ code, name: `${themeName}成分` }] }],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderThemes() {
  return render(<MemoryRouter><DiscoverThemes /></MemoryRouter>);
}

const search = (value: string) => fireEvent.click(screen.getByRole('button', { name: value }));
const editDraft = (value: string) => fireEvent.change(screen.getByLabelText(SEARCH_LABEL), { target: { value } });
const themesCalls = () => api.get.mock.calls.filter((call) => call[0] === '/market/themes');

beforeEach(() => {
  // 用 reset 而不是 clear：`clearAllMocks` 不会清掉上一条用例排队但未被消费的 `*Once` 实现，
  // 半途失败的用例会把 pending promise 泄漏给下一条（同 DiscoverFactorScope 的说明）。
  vi.resetAllMocks();
});

describe('DiscoverThemes：板块检索状态按关键词作用域（VS-39）', () => {
  it('板块读取失败 ⇒ 显示失败与底层原文，重试真的重发同一关键词（计数 1→2）', async () => {
    api.get
      .mockRejectedValueOnce(new Error('THEMES-DOWN-1'))
      .mockRejectedValueOnce(new Error('THEMES-DOWN-2'));

    renderThemes();
    search('半导体');

    expect(await screen.findByText(THEMES_FAILED)).toBeTruthy();
    // 底层原文被带出（修前 catch 吞掉错误、只置一个布尔量）
    expect(screen.getByText('THEMES-DOWN-1')).toBeTruthy();
    expect(themesCalls().length).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    // 重试是**真的重发**：同一关键词的请求计数从 1 变 2（与成功与否解耦）
    await waitFor(() => expect(themesCalls().length).toBe(2));
    expect((themesCalls()[1][1] as { params: { keyword: string } }).params.keyword).toBe('半导体');
    // 第二次仍然失败 ⇒ 失败态仍在，且没有退化成"空"
    expect(await screen.findByText('THEMES-DOWN-2')).toBeTruthy();
  });

  it('改动输入框换成别的词后上一词的失败不得继续显示；切回旧词仍显示它自己的失败（不重发）', async () => {
    api.get.mockRejectedValue(new Error('THEMES-DOWN-半导体'));

    renderThemes();
    search('半导体');
    expect(await screen.findByText('THEMES-DOWN-半导体')).toBeTruthy();
    expect(themesCalls().length).toBe(1);

    editDraft('新能源');
    // 换词不串：输入框已经是别的词 ⇒ 上一词的失败必须退出视野
    expect(screen.queryByText(THEMES_FAILED)).toBeNull();
    expect(screen.queryByText('THEMES-DOWN-半导体')).toBeNull();

    editDraft('半导体');
    // 归属保留：切回旧词仍然显示"它自己的"失败，且这份归属靠状态本身保留（没有再发请求）
    expect(screen.getByText('THEMES-DOWN-半导体')).toBeTruthy();
    expect(themesCalls().length).toBe(1);
  });

  it('当前关键词自己失败 ⇒ 显示它自己的错误原文；换词后新词的失败不带旧词的原文', async () => {
    api.get.mockImplementation(async (_url: string, config: { params?: { keyword?: string } }) => {
      throw new Error(`THEMES-FAIL-${config?.params?.keyword}`);
    });

    renderThemes();
    search('半导体');
    expect(await screen.findByText('THEMES-FAIL-半导体')).toBeTruthy();

    search('新能源');
    expect(await screen.findByText('THEMES-FAIL-新能源')).toBeTruthy();
    expect(screen.queryByText('THEMES-FAIL-半导体')).toBeNull();
  });

  it('换词在途时不得继续显示上一词的结果', async () => {
    const pending = deferred<{ data: unknown }>();
    api.get.mockImplementation(async (_url: string, config: { params?: { keyword?: string } }) => (
      config?.params?.keyword === '半导体'
        ? { data: themesPayload('半导体行业', '600000') }
        : pending.promise
    ));

    renderThemes();
    search('半导体');
    expect(await screen.findByRole('link', { name: /半导体行业成分/ })).toBeTruthy();

    search('新能源');
    await waitFor(() => expect(themesCalls().length).toBe(2));
    // 上一词的结果不得挂在新词上（在途也不得退化成"空"以外的任何上一词残留）
    expect(screen.queryByRole('link', { name: /半导体行业成分/ })).toBeNull();

    pending.resolve({ data: themesPayload('新能源行业', '600001') });
    expect(await screen.findByRole('link', { name: /新能源行业成分/ })).toBeTruthy();
  });

  it('在途时点另一个快捷词（按钮不受 loading 门控）⇒ 迟到的失败不得挂到新词上', async () => {
    const first = deferred<{ data: unknown }>();
    const second = deferred<{ data: unknown }>();
    api.get.mockImplementation(async (_url: string, config: { params?: { keyword?: string } }) => (
      config?.params?.keyword === '半导体' ? first.promise : second.promise
    ));

    renderThemes();
    search('半导体');
    await waitFor(() => expect(themesCalls().length).toBe(1));
    // 快捷选词按钮**不受 loading 门控** ⇒ 在途点击真的发出第二个请求（并发可达）
    search('新能源');
    await waitFor(() => expect(themesCalls().length).toBe(2));

    second.resolve({ data: themesPayload('新能源行业', '600001') });
    expect(await screen.findByRole('link', { name: /新能源行业成分/ })).toBeTruthy();

    // 迟到的失败属于发起它的那个词（半导体），不得落到当前词（新能源）上
    first.reject(new Error('THEMES-LATE-FAIL'));
    await waitFor(() => expect(screen.queryByText('THEMES-LATE-FAIL')).toBeNull());
    expect(screen.queryByText(THEMES_FAILED)).toBeNull();
    expect(screen.queryByRole('link', { name: /新能源行业成分/ })).toBeTruthy();
  });
});
