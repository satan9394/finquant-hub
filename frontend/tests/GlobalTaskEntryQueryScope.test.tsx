// @vitest-environment jsdom
//
// VS-38：GlobalTaskEntry 的检索状态（候选 / 空态 / 在途 / 检索失败）是否**按查询词作用域**。
// 本文件**只新增断言**，不动既有断言、不放宽任何既有判据。
// 判据是结构性的：状态自带"属于哪个查询词"，渲染处只认属于当前输入词的那一份 ——
// 所以"换词不串"靠归属成立，而不是靠"切词时清一下"（后者会闪一帧旧内容，且丢掉"这条是谁的"）。
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GlobalTaskEntry from '../src/components/GlobalTaskEntry';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { searchStocks } from '../src/services/stockApi';

vi.mock('../src/services/stockApi', () => ({ searchStocks: vi.fn() }));
vi.mock('../src/services/researchApi', () => ({ listResearchWorkspaces: vi.fn().mockResolvedValue([]) }));

const FAILED = /标的搜索失败/;
const EMPTY_HINT = '输入证券或任务，系统只会路由和预填，不会自动执行。';
const RETRY = /重\s*试/;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const stock = (code: string, name: string) => ({ code, name, market: 'A股', type: 'stock' });

/** 打开全局命令栏（唯一弹窗实例，由全局事件打开）。 */
function openEntry() {
  const onNavigate = vi.fn();
  render(<LanguageProvider><GlobalTaskEntry onNavigate={onNavigate} /></LanguageProvider>);
  fireEvent.click(screen.getByRole('button', { name: '打开全局命令栏' }));
  return onNavigate;
}

const input = () => screen.getByLabelText('证券代码、公司名称或研究任务');
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const submit = (text: string) => {
  type(text);
  // 注意：antd 的 loading 图标自带 aria-label，按钮在 loading/离场动画期间可访问名会变成
  // "loading识别意图"。这里用正则匹配，避免把动画残留误判成"按钮不存在"。
  fireEvent.click(screen.getByRole('button', { name: /识别意图/ }));
};
const searchCallCount = () => vi.mocked(searchStocks).mock.calls.length;
const candidate = (name: string, code: string) => screen.queryByRole('button', { name: `选择 ${name} ${code}` });

// 本机负载下 vitest 的 import/transform 可能被拖到分钟级（本卡实测：同一文件 import 151s）。
// 这里给"等待同一条断言落定"更长的观察窗 —— **判据本身不变**，鉴别力由"退回修复必红"证明。
const WAIT = { timeout: 5000 } as const;
const PER_TEST_MS = 15_000; // 与同族既有 GlobalTaskEntry.test.tsx 的既有取值一致

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks 不清"一次性实现"的队列：上一个用例失败时残留的 once 会串到本用例（实测踩到）。
  vi.mocked(searchStocks).mockReset();
  localStorage.clear();
  localStorage.setItem('finquant_lang', 'zh');
});

describe('GlobalTaskEntry：检索状态按查询词作用域（VS-38）', () => {
  it('换查询词（还没提交）后不得再挂着上一词的候选；词改回来候选回来（归属保留）', async () => {
    vi.mocked(searchStocks).mockResolvedValue([stock('600519', '贵州茅台')]);

    openEntry();
    submit('茅台');
    expect(await screen.findByRole('button', { name: '选择 贵州茅台 600519' }, WAIT)).toBeTruthy();

    // 只改输入框、不提交 —— 修前这里仍然挂着"茅台"的候选
    type('五粮液');
    expect(candidate('贵州茅台', '600519')).toBeNull();

    // 词改回来：候选出自归属匹配（不是"切词时清"之后再没回来）
    type('茅台');
    expect(candidate('贵州茅台', '600519')).toBeTruthy();
  }, PER_TEST_MS);

  it('换词在途时：不得显示上一词的候选，也不得把"在途"渲染成"没有结果"', async () => {
    const pending = deferred<ReturnType<typeof stock>[]>();
    vi.mocked(searchStocks)
      .mockImplementationOnce(async () => [stock('600519', '贵州茅台')])
      .mockImplementationOnce(() => pending.promise);

    openEntry();
    submit('茅台');
    expect(await screen.findByRole('button', { name: '选择 贵州茅台 600519' }, WAIT)).toBeTruthy();

    submit('五粮液');
    await waitFor(() => expect(searchCallCount()).toBe(2), WAIT);
    // 上一词的候选不得挂在新词下
    expect(candidate('贵州茅台', '600519')).toBeNull();
    // 在途不得伪装成"确实没有"（VS-29：还没有结论 ≠ 没有数据）
    expect(screen.queryByText(EMPTY_HINT)).toBeNull();

    // 新词自己的响应回来后，显示的必须是新词自己的候选
    await act(async () => { pending.resolve([stock('000858', '五粮液')]); });
    expect(candidate('五粮液', '000858')).toBeTruthy();
    expect(candidate('贵州茅台', '600519')).toBeNull();
  }, PER_TEST_MS);

  it('反向断言：当前词自己失败 ⇒ 必须显示它自己的失败，且不得伪装成"没有结果"', async () => {
    vi.mocked(searchStocks).mockRejectedValue(new Error('market search offline'));

    openEntry();
    submit('茅台');
    expect(await screen.findByText(FAILED, undefined, WAIT)).toBeTruthy();
    // 底层原文原样带出（不吞掉）
    expect(screen.getByText('market search offline')).toBeTruthy();
    // 失败不得被渲染成"空态"
    expect(screen.queryByText(EMPTY_HINT)).toBeNull();
  }, PER_TEST_MS);

  it('重试真的重发同一个词（请求计数），且失败态与"成功"解耦：重发在途仍保持、成功后才消失', async () => {
    const retryPending = deferred<ReturnType<typeof stock>[]>();
    vi.mocked(searchStocks)
      .mockRejectedValueOnce(new Error('market search offline'))
      .mockImplementationOnce(() => retryPending.promise);

    openEntry();
    submit('茅台');
    expect(await screen.findByText(FAILED, undefined, WAIT)).toBeTruthy();
    expect(searchCallCount()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    await waitFor(() => expect(searchCallCount()).toBe(2), WAIT);
    expect(vi.mocked(searchStocks)).toHaveBeenLastCalledWith('茅台');

    // 与成功解耦：重发**在途**时失败态必须还在（不是"发起时清"）
    expect(screen.getByText(FAILED)).toBeTruthy();
    expect(screen.getByText('market search offline')).toBeTruthy();

    await act(async () => { retryPending.resolve([stock('600519', '贵州茅台')]); });
    await waitFor(() => expect(screen.queryByText(FAILED)).toBeNull(), WAIT);
    expect(candidate('贵州茅台', '600519')).toBeTruthy();
  }, PER_TEST_MS);

  it('切回旧词仍显示旧词自己的失败（归属保留，而不是被"切词时清"丢掉）', async () => {
    vi.mocked(searchStocks).mockImplementation(async (value: string) => {
      if (value === '茅台') throw new Error('market search offline');
      return [stock('000858', '五粮液')];
    });

    openEntry();
    submit('茅台');
    expect(await screen.findByText(FAILED, undefined, WAIT)).toBeTruthy();

    // 换到新词：旧失败不得挂在新词上
    submit('五粮液');
    expect(await screen.findByRole('button', { name: '选择 五粮液 000858' }, WAIT)).toBeTruthy();
    expect(screen.queryByText(FAILED)).toBeNull();

    // 切回旧词：**不重发**，它自己的失败仍在
    type('茅台');
    expect(screen.getByText(FAILED)).toBeTruthy();
    expect(searchCallCount()).toBe(2);
  }, PER_TEST_MS);

  it('连点重试产生并发时，迟到的旧失败不得覆盖已经成功的新结果', async () => {
    const older = deferred<ReturnType<typeof stock>[]>();
    const newer = deferred<ReturnType<typeof stock>[]>();
    vi.mocked(searchStocks)
      .mockRejectedValueOnce(new Error('market search offline'))
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);

    openEntry();
    submit('茅台');
    expect(await screen.findByText(FAILED, undefined, WAIT)).toBeTruthy();

    // 失败态在重发期间保持 ⇒ 重试按钮仍可点：连点两次即两个并发请求
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    await waitFor(() => expect(searchCallCount()).toBe(2), WAIT);
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    await waitFor(() => expect(searchCallCount()).toBe(3), WAIT);

    await act(async () => { newer.resolve([stock('600519', '贵州茅台')]); });
    expect(await screen.findByRole('button', { name: '选择 贵州茅台 600519' }, WAIT)).toBeTruthy();

    // 更早那次重试迟到的失败，不得把已经成功的结果改写成失败
    await act(async () => { older.reject(new Error('market search offline late')); });
    expect(screen.queryByText(FAILED)).toBeNull();
    expect(screen.queryByText('market search offline late')).toBeNull();
    expect(candidate('贵州茅台', '600519')).toBeTruthy();
  }, PER_TEST_MS);
});
