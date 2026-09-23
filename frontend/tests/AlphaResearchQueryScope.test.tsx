// @vitest-environment jsdom
//
// VS-36：AlphaResearchPanel 的字段检索状态（结果 / 空态 / 失败）是否**按查询词作用域**。
// 本文件**只新增断言**，不动既有断言、不放宽任何既有判据。
// 判据是结构性的：错误与结果各自带"属于哪个查询词"，渲染处只认属于当前词的那一份。
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlphaResearchPanel from '../src/components/alpha/AlphaResearchPanel';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import type { AlphaSearchResult } from '../src/services/alphaApi';

const mocks = vi.hoisted(() => ({ fetchCatalog: vi.fn(), searchAlpha: vi.fn() }));
vi.mock('../src/services/alphaApi', () => ({
  fetchAlphaCatalog: mocks.fetchCatalog,
  searchAlpha: mocks.searchAlpha,
}));
vi.mock('../src/components/alpha/AlphaSimulationWorkbench', () => ({ default: () => <div data-testid="simulation-workbench" /> }));

const emptyCatalog = {
  categories: [], templates: [],
  catalogue: { mode: 'FINQUANT_STARTER', source: 'mock-catalogue', field_count: 0, data_status: 'PARTIAL' },
};

const READY_TEXT = '接口未返回类别或模板；不会用静态数据替代。';
const SEARCH_FAILED = '字段搜索失败';
const NO_MATCH_EMPTY = '未找到匹配字段，请换用英文 ID、指标名称或 Alpha 编号。';

const alphaResult = (name: string): AlphaSearchResult => ({ type: 'alpha', name, desc: '项目自有经典 Alpha' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderPanel() {
  render(<LanguageProvider><AlphaResearchPanel /></LanguageProvider>);
  await screen.findByText(READY_TEXT);
}

function submit(keyword: string) {
  fireEvent.change(screen.getByPlaceholderText(/operating_income/), { target: { value: keyword } });
  fireEvent.click(screen.getByRole('button', { name: /检索/ }));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('finquant_lang', 'zh');
  mocks.fetchCatalog.mockReset().mockResolvedValue(emptyCatalog);
  mocks.searchAlpha.mockReset().mockResolvedValue([]);
});

describe('AlphaResearchPanel：检索状态按查询词作用域（VS-36）', () => {
  // 注：两个"提交"入口在请求在途时都被 antd 挡住了（`Input.Search` 的 enterButton 是
  // antd Button ⇒ loading 期间点击被忽略；Search.js:78 对回车也有 loading 门），所以
  // "连续提交两个词"的竞态在 UI 上不可达。仍然可达的并发入口是 `allowClear` 的 ×
  // （Search.js:56 的 clear 分支不受 loading 门控），下面的用例就走这条真实路径。
  it('迟到的失败不得落到新的检索上（清空输入框触发的新检索）', async () => {
    const slow = deferred<AlphaSearchResult[]>();
    mocks.searchAlpha
      .mockImplementationOnce(() => slow.promise) // 'momentum'：在途，稍后失败
      .mockResolvedValueOnce([]);                 // 清空后的空词检索：先成功返回

    await renderPanel();
    submit('momentum');
    await waitFor(() => expect(mocks.searchAlpha).toHaveBeenCalledTimes(1));

    const clearButton = document.querySelector('.ant-input-clear-icon') as HTMLElement;
    expect(clearButton).toBeTruthy();
    fireEvent.click(clearButton);
    // 证明这条路径真的发起了第二次检索（不是断言依赖了不起作用的选择器）
    await waitFor(() => expect(mocks.searchAlpha).toHaveBeenCalledTimes(2));

    // 'momentum' 此刻才失败 —— 它属于 momentum，不属于这次检索
    await act(async () => { slow.reject(new Error('MOMENTUM-FAILED')); });

    expect(screen.queryByText(/MOMENTUM-FAILED/)).toBeNull();
    expect(screen.queryByText(SEARCH_FAILED)).toBeNull();
  });

  it('改动查询词后不再显示上一词的失败原文；切回同一个词仍然显示它自己的失败', async () => {
    mocks.searchAlpha.mockRejectedValueOnce(new Error('OLD-WORD-FAIL'));

    await renderPanel();
    const input = screen.getByPlaceholderText(/operating_income/);
    submit('oldword');
    expect(await screen.findByText(/OLD-WORD-FAIL/)).toBeTruthy();

    fireEvent.change(input, { target: { value: 'newword' } });
    // ② 换词不串：失败原文与"失败"这一结论都不得挂在新词上
    expect(screen.queryByText(/OLD-WORD-FAIL/)).toBeNull();
    expect(screen.queryByText(SEARCH_FAILED)).toBeNull();
    // ⑤ 也不得退化成"未找到匹配字段"（在途/无结论 ≠ 空）
    expect(screen.queryByText(NO_MATCH_EMPTY)).toBeNull();

    // 归属信息被保住（VS-32 范式）：切回去时这条失败仍然是"它自己的"
    fireEvent.change(input, { target: { value: 'oldword' } });
    expect(screen.getByText(/OLD-WORD-FAIL/)).toBeTruthy();
  });

  it('当前查询词自己失败时必须显示它自己的错误，且不得把失败渲染成"空"', async () => {
    mocks.searchAlpha.mockRejectedValue(new Error('ALPHA-BOOM'));

    await renderPanel();
    submit('zzz-no-such-field');

    // 反向断言：少了它就是把修复做成"错误永不显示"
    expect(await screen.findByText(/ALPHA-BOOM/)).toBeTruthy();
    expect(screen.getByText(SEARCH_FAILED)).toBeTruthy();
    // ⑤ 失败不得伪装成"没有匹配"
    expect(screen.queryByText(NO_MATCH_EMPTY)).toBeNull();
  });

  it('失败可重试，且重试真的重发请求（请求计数 + 同一查询词）', async () => {
    mocks.searchAlpha
      .mockRejectedValueOnce(new Error('FIRST-FAIL'))
      .mockResolvedValueOnce([{ type: 'wq_field', name: 'Operating Income', field: 'operating_income', desc: '营业利润' }]);

    await renderPanel();
    submit('income');
    expect(await screen.findByText(/FIRST-FAIL/)).toBeTruthy();
    expect(mocks.searchAlpha).toHaveBeenCalledTimes(1);

    // antd 会在两个汉字之间插空格（"重 试"），因此用宽松匹配而不是精确串
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    // 与成功解耦：计数先证明"真的重发了同一次查询"
    await waitFor(() => expect(mocks.searchAlpha).toHaveBeenCalledTimes(2));
    expect(mocks.searchAlpha).toHaveBeenLastCalledWith('income');
    expect(await screen.findByText('Operating Income')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/FIRST-FAIL/)).toBeNull());
  });

  it('换查询词后不出现上一词的失败原文，也不出现上一词的结果', async () => {
    mocks.searchAlpha
      .mockRejectedValueOnce(new Error('OLD-WORD-FAIL'))
      .mockResolvedValueOnce([alphaResult('Alpha002')]);

    await renderPanel();
    submit('oldword');
    expect(await screen.findByText(/OLD-WORD-FAIL/)).toBeTruthy();

    submit('newword');
    expect(await screen.findByText('Alpha002')).toBeTruthy();
    expect(screen.queryByText(/OLD-WORD-FAIL/)).toBeNull();
  });

  it('换查询词在途时不得显示上一词的结果，也不得把在途渲染成"空"', async () => {
    const pending = deferred<AlphaSearchResult[]>();
    mocks.searchAlpha
      .mockResolvedValueOnce([alphaResult('Alpha001')])
      .mockImplementationOnce(() => pending.promise);

    await renderPanel();
    submit('alpha001');
    expect(await screen.findByText('Alpha001')).toBeTruthy();

    submit('newer');
    expect(screen.queryByText('Alpha001')).toBeNull();
    expect(screen.queryByText(NO_MATCH_EMPTY)).toBeNull();
  });
});
