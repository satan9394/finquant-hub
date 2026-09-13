// @vitest-environment jsdom
//
// W1：「已保存研究」(`saved`) 的读取三态。
//
// 修前（`cec2c12:frontend/src/components/GlobalTaskEntry.tsx`）的 `show()` 里是
//     `void listResearchWorkspaces().then(...).catch(() => setSaved([]))`
// —— 读取失败被**归约成空数组**；而 `targetList(title, items)` 在 `items.length === 0` 时
// 整块渲染 `false` ⇒ **"读取失败"与"确实没有已保存研究"在屏幕上完全同形**。
//
// 本文件只断言四件事（判据都是结构性的，不靠"文案看起来对"）：
//   ①失败必须**原位说出来**（失败文案 + 底层原文 + 可点的重试），而不是"什么都没有"；
//   ②成功且确实为空 ⇒ 一个字都不许说失败（空态只能代表"确实没有"）；
//   ③重试**真的重发** `listResearchWorkspaces()`，且与"成功"解耦：重发在途失败态仍在，成功之后才消失；
//   ④迟到 / 并发 / 重开面板的那一次，不得改写最新那次的状态。
//
// 本文件**只新增断言**，不 import 也不改动既有测试文件的任何内容。

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GlobalTaskEntry, { GLOBAL_TASK_OPEN_EVENT } from '../src/components/GlobalTaskEntry';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { listResearchWorkspaces } from '../src/services/researchApi';
import { searchStocks } from '../src/services/stockApi';
import type { ResearchWorkspace } from '../src/types/research';

vi.mock('../src/services/stockApi', () => ({ searchStocks: vi.fn() }));
vi.mock('../src/services/researchApi', () => ({ listResearchWorkspaces: vi.fn() }));

/** 底层错误原文：必须原样带出，不能被吞成空串。 */
const RAW = 'workspace store offline';
/** 失败文案里必须出现"读不出来的是什么"（本组唯一的 saved 区块标题就是 `command.saved`）。 */
const SAVED_TITLE = '已保存研究';
const RETRY = /重\s*试/;

// 本机负载下 vitest 的 import/transform 可能被拖到分钟级（本卡实测：同族文件 import 曾 151s）。
// 这里给"等待同一条断言落定"更长的观察窗 —— **判据本身不变**。
const PER_TEST_MS = 15_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const workspace = (symbol: string, name: string): ResearchWorkspace => ({ symbol, name, notes: '', evidence: [] });

const savedCalls = () => vi.mocked(listResearchWorkspaces).mock.calls.length;

/** `saved` 区块（本卡新增的可寻址区块）：失败/空态/内容都只在这一块内成立。 */
const savedSection = () => document.querySelector('.global-task-entry__saved') as HTMLElement | null;

/** 打开全局命令栏（唯一弹窗实例，由 header 的触发按钮打开 ⇒ `show()`）。 */
function openEntry() {
  const onNavigate = vi.fn();
  render(<LanguageProvider><GlobalTaskEntry onNavigate={onNavigate} /></LanguageProvider>);
  fireEvent.click(screen.getByRole('button', { name: '打开全局命令栏' }));
  return onNavigate;
}

/**
 * 失败判据（与 VS-22 `ListFailureNotEmptiness` / VS-29 同形）：
 * 属内 error Alert + 说清"是什么东西读不出来" + description 就是底层原文 + 可点的重试。
 */
function expectSavedFailureSurfaced(detail: string) {
  const section = savedSection();
  expect(section).toBeTruthy();
  const alert = within(section as HTMLElement).queryByRole('alert');
  expect(alert).toBeTruthy();
  expect(alert?.querySelector('.ant-alert-message')?.textContent).toContain(SAVED_TITLE);
  expect(alert?.querySelector('.ant-alert-description')?.textContent).toBe(detail);
  expect(within(alert as HTMLElement).getByRole('button', { name: RETRY })).toBeTruthy();
}

describe('GlobalTaskEntry：已保存研究（saved）读取失败不得伪装成"确实为空"（W1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks 不清"一次性实现"的队列：上一个用例残留的 once 会串到本用例（同族 VS-38 实测踩到）。
    vi.mocked(listResearchWorkspaces).mockReset();
    vi.mocked(searchStocks).mockReset();
    vi.mocked(listResearchWorkspaces).mockResolvedValue([]);
    vi.mocked(searchStocks).mockResolvedValue([]);
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
  });

  it('saved 读取失败 ⇒ 失败必须出现在屏幕上（底层原文 + 重试），不得"什么都没有"', async () => {
    const failing = deferred<ResearchWorkspace[]>();
    vi.mocked(listResearchWorkspaces).mockImplementation(() => failing.promise);

    openEntry();
    expect(savedCalls()).toBe(1);
    // 还没有任何结论：不许凭空说"失败"。
    expect(screen.queryByRole('alert')).toBeNull();

    await act(async () => { failing.reject(new Error(RAW)); });

    // 修前：`.catch(() => setSaved([]))` ⇒ `targetList` 整块渲染 `false` ⇒ 屏幕上**什么都没有**，
    // 与"确实没有已保存研究"完全同形 —— `getByRole('alert')` 在修前抛 TestingLibraryElementError。
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(RAW)).toBeTruthy();
    expectSavedFailureSurfaced(RAW);
  }, PER_TEST_MS);

  it('三态互斥可辨：未落定 ⇒ 加载中；成功且为空 ⇒ 空态且无任何失败文案；失败 ⇒ 错误态', async () => {
    const first = deferred<ResearchWorkspace[]>();
    vi.mocked(listResearchWorkspaces).mockImplementationOnce(() => first.promise);

    openEntry();
    // ① 未落定：是"加载中"，既不冒称"没有已保存研究"，也不冒称失败。
    expect(savedSection()?.querySelector('.fq-load-state--loading')).toBeTruthy();
    expect(savedSection()?.querySelector('.fq-load-state--empty')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    // ② 反向断言：成功**且确实为空** ⇒ 空态成立，且失败文案一个字都不许出现。
    await act(async () => { first.resolve([]); });
    expect(savedSection()?.querySelector('.fq-load-state--empty')).toBeTruthy();
    expect(savedSection()?.querySelector('.fq-load-state--loading')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull();

    // ③ 同一个面板上再读一次（重开）：这次失败 ⇒ 错误态，且**不得与空态同屏**。
    const second = deferred<ResearchWorkspace[]>();
    vi.mocked(listResearchWorkspaces).mockImplementationOnce(() => second.promise);
    act(() => { window.dispatchEvent(new Event(GLOBAL_TASK_OPEN_EVENT)); });
    expect(savedCalls()).toBe(2);
    await act(async () => { second.reject(new Error(RAW)); });
    expect(savedSection()?.querySelector('.fq-load-state--error')).toBeTruthy();
    expect(savedSection()?.querySelector('.fq-load-state--empty')).toBeNull();
    expectSavedFailureSurfaced(RAW);
  }, PER_TEST_MS);

  it('反向断言：saved 读取成功且有内容 ⇒ 显示自己的候选项，且不出现失败呈现', async () => {
    const read = deferred<ResearchWorkspace[]>();
    vi.mocked(listResearchWorkspaces).mockImplementation(() => read.promise);

    openEntry();
    await act(async () => { read.resolve([workspace('600519', '贵州茅台'), workspace('000858', '五粮液')]); });

    expect(screen.getByRole('button', { name: '贵州茅台 · 600519' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '五粮液 · 000858' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
  }, PER_TEST_MS);

  it('重试真的重发（调用计数 1→2），且与"成功"解耦：重发在途失败态仍在，成功之后才消失', async () => {
    const first = deferred<ResearchWorkspace[]>();
    const retryPending = deferred<ResearchWorkspace[]>();
    vi.mocked(listResearchWorkspaces)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => retryPending.promise);

    openEntry();
    await act(async () => { first.reject(new Error(RAW)); });
    expectSavedFailureSurfaced(RAW);
    expect(savedCalls()).toBe(1);

    fireEvent.click(within(savedSection() as HTMLElement).getByRole('button', { name: RETRY }));

    // "重试确会重新发起"：请求次数真的 +1，而不是只把提示关掉。
    expect(savedCalls()).toBe(2);
    // VS-32 口径：重发**在途**时失败态必须还在（不是"发起时清"）。
    expectSavedFailureSurfaced(RAW);

    await act(async () => { retryPending.resolve([workspace('600519', '贵州茅台')]); });
    // 只有**真的成功**之后失败态才消失。
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '贵州茅台 · 600519' })).toBeTruthy();
  }, PER_TEST_MS);

  it('连点重试产生并发时，迟到的旧失败不得覆盖已经成功的新结果', async () => {
    const first = deferred<ResearchWorkspace[]>();
    const older = deferred<ResearchWorkspace[]>();
    const newer = deferred<ResearchWorkspace[]>();
    vi.mocked(listResearchWorkspaces)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);

    openEntry();
    await act(async () => { first.reject(new Error('first down')); });
    expectSavedFailureSurfaced('first down');

    // 失败态在重发期间保持 ⇒ 重试按钮仍可点：连点两次即两个并发请求。
    fireEvent.click(within(savedSection() as HTMLElement).getByRole('button', { name: RETRY }));
    expect(savedCalls()).toBe(2);
    fireEvent.click(within(savedSection() as HTMLElement).getByRole('button', { name: RETRY }));
    expect(savedCalls()).toBe(3);

    await act(async () => { newer.resolve([workspace('600519', '贵州茅台')]); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '贵州茅台 · 600519' })).toBeTruthy();

    // 更早那次重试迟到的失败，不得把已经成功的结果改写成失败。
    await act(async () => { older.reject(new Error('late failure')); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('late failure')).toBeNull();
    expect(screen.getByRole('button', { name: '贵州茅台 · 600519' })).toBeTruthy();
  }, PER_TEST_MS);

  it('重开面板：上一次那次读取的迟到结果不得改写本次的状态', async () => {
    const first = deferred<ResearchWorkspace[]>();
    const second = deferred<ResearchWorkspace[]>();
    vi.mocked(listResearchWorkspaces)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    openEntry();
    expect(savedCalls()).toBe(1);

    // 重开（App 层 ⌘K / hero 触发按钮派发的是同一个全局事件）⇒ 第二次读取。
    act(() => { window.dispatchEvent(new Event(GLOBAL_TASK_OPEN_EVENT)); });
    expect(savedCalls()).toBe(2);

    // 上一次（已被本次取代）的读取迟到失败：不得改写本次刚发起的那一次。
    await act(async () => { first.reject(new Error('stale failure')); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('stale failure')).toBeNull();

    await act(async () => { second.resolve([workspace('000858', '五粮液')]); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '五粮液 · 000858' })).toBeTruthy();
  }, PER_TEST_MS);

  it('归因不串：检索失败不得被显示成"已保存研究"的失败；saved 的失败也只在自己那一块里', async () => {
    vi.mocked(searchStocks).mockRejectedValue(new Error('market search offline'));
    const read = deferred<ResearchWorkspace[]>();
    vi.mocked(listResearchWorkspaces).mockImplementation(() => read.promise);

    openEntry();
    fireEvent.change(screen.getByLabelText('证券代码、公司名称或研究任务'), { target: { value: '茅台' } });
    fireEvent.click(screen.getByRole('button', { name: /识别意图/ }));

    // 检索自己失败：必须说它自己的失败，但**不属于** saved 这一块。
    expect(await screen.findByText(/标的搜索失败/)).toBeTruthy();
    expect(within(savedSection() as HTMLElement).queryByRole('alert')).toBeNull();

    // 反过来：saved 失败时，失败态出现在 saved 区块内、带它自己的底层原文，且不覆盖检索的失败。
    await act(async () => { read.reject(new Error(RAW)); });
    expectSavedFailureSurfaced(RAW);
    expect(screen.getByText(/标的搜索失败/)).toBeTruthy();
  }, PER_TEST_MS);
});
