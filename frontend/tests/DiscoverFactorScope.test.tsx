// @vitest-environment jsdom
//
// VS-39：Discover 的**因子目录检索**失败是否被说成"确实没有"。
//
// 修前：`run()` 把 `factorResult` 的 rejection 折成 `factors: []`，再弹一个瞬时 toast；
// 因子卡片把 `locale={{ emptyText: t('discover.noFactors') }}` 直接挂在 List 上
// ⇒ 检索**失败**在屏幕上显示为"没有匹配的真实因子目录结果"（失败伪装成空）。
//
// 本文件**只新增断言**，不动既有断言、不放宽任何既有判据。判据是结构性的：
// 失败态自带"属于哪个查询词"的归属，三态（错误/加载/空）由族内唯一的 `readStateOf` 决定。
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Discover from '../src/pages/Discover';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: api }));

const alpha = vi.hoisted(() => ({ searchAlpha: vi.fn() }));
vi.mock('../src/services/alphaApi', () => ({ searchAlpha: alpha.searchAlpha }));

vi.mock('../src/components/alpha/AlphaResearchPanel', () => ({ default: () => null }));

const FACTOR_FAILED = /因子目录检索失败/;
const NO_FACTORS_EMPTY = '没有匹配的真实因子目录结果';

const factor = (name: string) => ({ type: 'alpha' as const, name, desc: '本地目录' });
const stock = (ticker: string, name: string) => ({
  ticker, name, price: 1, change_percent: 0, return_60d_pct: 0, signal: 'UNKNOWN',
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

function renderDiscover() {
  return render(<MemoryRouter initialEntries={['/discover']}><Discover /></MemoryRouter>);
}

function submitQuery(text: string) {
  fireEvent.change(screen.getByLabelText('发现条件'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /开始发现/ }));
}

const factorCalls = () => alpha.searchAlpha.mock.calls.length;

beforeEach(() => {
  // 这里用 reset 而不是 clear：`clearAllMocks` **不会**清掉上一条用例排队但未被消费的 `*Once` 实现，
  // 一旦某条用例在半途失败，残留的 pending promise 会泄漏到下一条用例（本卡实测：正是它把
  // "空态未被误伤"那条压成假红）。每条用例必须自带完整的 mock 背景。
  vi.resetAllMocks();
  api.post.mockResolvedValue({ data: { items: [stock('600519', '贵州茅台')], errors: [] } });
  api.get.mockImplementation(async (url: string) => (
    url === '/market/search' ? { data: { items: [{ code: '600519', name: '贵州茅台' }] } } : { data: {} }
  ));
});

describe('Discover：因子目录检索失败不得伪装成空（VS-39）', () => {
  it('当前查询词的因子检索失败 ⇒ 显示它自己的失败与底层原文，且不渲染 noFactors 空态', async () => {
    alpha.searchAlpha.mockRejectedValue(new Error('WQ catalogue offline'));

    renderDiscover();
    submitQuery('茅台');

    // 反向断言：当前词自己失败 ⇒ 必须显示它自己的失败（且带出底层原文，不吞掉）
    expect(await screen.findByText(FACTOR_FAILED)).toBeTruthy();
    expect(screen.getByText('WQ catalogue offline')).toBeTruthy();
    // 失败不得伪装成"确实没有"
    expect(screen.queryByText(NO_FACTORS_EMPTY)).toBeNull();
  });

  it('换查询词后上一词的因子失败不得挂在新词上；新词显示它自己的错误原文', async () => {
    alpha.searchAlpha.mockImplementation(async (keyword: string) => {
      throw new Error(`WQ-FAIL-${keyword}`);
    });

    renderDiscover();
    submitQuery('茅台');
    expect(await screen.findByText('WQ-FAIL-茅台')).toBeTruthy();

    submitQuery('腾讯');
    // 反向断言：新词自己的失败显示新词自己的错误
    expect(await screen.findByText('WQ-FAIL-腾讯')).toBeTruthy();
    // 换词不串：上一词的失败原文不得留在新词上
    expect(screen.queryByText('WQ-FAIL-茅台')).toBeNull();
    expect(screen.queryByText(NO_FACTORS_EMPTY)).toBeNull();
  });

  it('因子检索重试真的重发同一查询词（计数 1→2），且重试期间失败态保持显示', async () => {
    const pending = deferred<unknown[]>();
    alpha.searchAlpha
      .mockRejectedValueOnce(new Error('WQ-DOWN-1'))
      .mockImplementationOnce(() => pending.promise);

    renderDiscover();
    submitQuery('茅台');
    expect(await screen.findByText('WQ-DOWN-1')).toBeTruthy();
    expect(factorCalls()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    // 重试是**真的重发**：同一查询词的检索计数从 1 变 2（与成功与否解耦）
    await waitFor(() => expect(factorCalls()).toBe(2));
    expect(alpha.searchAlpha).toHaveBeenLastCalledWith('茅台');
    // "成功才清"：重试在途时失败态**没有**被清掉，也没有退化成空态
    expect(screen.getByText('WQ-DOWN-1')).toBeTruthy();
    expect(screen.queryByText(NO_FACTORS_EMPTY)).toBeNull();

    pending.resolve([factor('因子甲')]);
    expect(await screen.findByText('因子甲')).toBeTruthy();
    // 成功之后失败态才消失
    await waitFor(() => expect(screen.queryByText(FACTOR_FAILED)).toBeNull());
  });

  it('因子检索成功但确实没有匹配 ⇒ 仍然显示"没有匹配的真实因子目录结果"（空态未被误伤）', async () => {
    alpha.searchAlpha.mockResolvedValue([]);

    renderDiscover();
    submitQuery('茅台');

    expect(await screen.findByText(NO_FACTORS_EMPTY)).toBeTruthy();
    expect(screen.queryByText(FACTOR_FAILED)).toBeNull();
  });
});
