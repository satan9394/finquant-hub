// @vitest-environment jsdom
/* VS25：AI 讨论的首用不得"静默死胡同"
 *
 * 角色下拉的**全部**选项来自 `GET /agents`。修前 `Discussion.tsx` 把它写成
 * `apiClient.get('/agents').catch(() => {})` —— 错误被静默吞掉，于是"下拉是空的"与"请求失败了"
 * 在界面上长得一模一样；用户按提示选不够 3 个时，只会被一句"至少选择 3 个角色"挡回来，
 * **按提示也做不成**，且永远不知道真正的失败原因。
 *
 * 本文件验证四件事（对应验收标准 1~4）：
 *   ①失败 ⇒ 原位可见错误态（失败文案 + 具体原因 + 可点重试），且"至少选择 3 个角色"不再是唯一解释；
 *   ②重试 ⇒ 真的重新发起该请求（以请求计数证明 1→2→3）；恢复成功 ⇒ 错误态消失、角色真的可选；
 *   ③请求成功但可用角色不足 3 个 ⇒ 如实说明（"当前仅 N 个角色可用"），不是失败态、不给重试；
 *   ④成功路径零回归：3 个以上角色时既有的预选/创建流程一字不变。
 *
 * 复用 VS22 的 `LoadFailureAlert`（失败态只有一种写法），本文件对它只做"契约级"断言：
 * error Alert + description 就是底层错误原文 + 一个重试按钮。
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { message } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Discussion from '../src/pages/Discussion';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import apiClient from '../src/services/api';
import { useDiscussionStore } from '../src/store/discussionStore';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/components/InvestmentCommittee', () => ({ default: () => <div data-testid="investment-committee" /> }));

const RETRY = /重\s*试/;
const ROLE_FAILURE = '角色列表读取失败';

const roles = [
  { id: 1, name: '风险官', role_key: 'risk_manager', avatar: 'AI' },
  { id: 2, name: '多头分析师', role_key: 'bull_analyst', avatar: 'AI' },
  { id: 3, name: '空头分析师', role_key: 'bear_analyst', avatar: 'AI' },
  { id: 4, name: '价值投资者', role_key: 'value_investor', avatar: 'AI' },
].map((r) => ({ ...r, system_prompt: '', model_id: null, is_preset: 1, created_at: '2026-09-01T00:00:00Z' }));

/** 只关心 `/agents` 的实现，其余请求一律成功返回空数据。 */
function agentsApi(agentsImpl: () => Promise<unknown>) {
  vi.mocked(apiClient.get).mockImplementation((url) => {
    if (url === '/agents') return agentsImpl() as never;
    if (url === '/discussion/rooms') return Promise.resolve({ data: { items: [] } }) as never;
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

const rail = () => document.querySelector('.ant-layout-sider') as HTMLElement;
const dialog = () => document.querySelector('.ant-modal') as HTMLElement;
/** 创建对话框的确定按钮（antd 会在两个汉字之间插空格，所以用正则匹配可及名）。 */
const dialogSubmit = () => within(dialog()).getByRole('button', { name: /创\s*建/ });
const selectedRoles = () => document.querySelectorAll('.ant-select-selection-item');

describe('Discussion role list: a failed GET /agents is never a silent dead end (VS25)', () => {
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

  it('surfaces the failure in place with its real cause and a retry, instead of only "至少选择 3 个角色"', async () => {
    let calls = 0;
    agentsApi(() => { calls += 1; return Promise.reject(new Error('agents 503')); });
    const warn = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    renderDiscussion();

    // 左栏（不需要任何点击就看得见）：失败文案 + 底层原因 + 可点的重试。
    await waitFor(() => expect(calls).toBe(1));
    await waitFor(() => expect(within(rail()).getByText(ROLE_FAILURE)).toBeTruthy());
    expect(within(rail()).getByText('agents 503')).toBeTruthy();
    expect(within(rail()).getByRole('button', { name: RETRY })).toBeTruthy();
    expect(rail().querySelector('.ant-alert-error')).toBeTruthy();
    expect(rail().querySelector('.ant-alert-description')?.textContent).toBe('agents 503');

    // 创建对话框内原位同样给出（遮罩挡住左栏时，"重试"必须在这里也能点到）。
    fireEvent.click(screen.getByRole('button', { name: '创建讨论' }));
    const topicInput = await screen.findByRole('textbox', { name: '讨论主题' });
    expect(within(dialog()).getByText(ROLE_FAILURE)).toBeTruthy();
    expect(within(dialog()).getByText('agents 503')).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: RETRY })).toBeTruthy();

    // 按提示老老实实填了主题再点"创建"：给的说法必须指向真正的成因，而不是"你没选够"。
    fireEvent.change(topicInput, { target: { value: '600519 的现金流' } });
    fireEvent.click(dialogSubmit());
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn).not.toHaveBeenCalledWith('至少选择 3 个角色');
    expect(warn).toHaveBeenCalledWith('角色列表读取失败，无法选择角色；请先点“重试”重新加载角色');
    // 失败时不得发出创建请求。
    expect(apiClient.post).not.toHaveBeenCalled();
    // 本用例是全文件最重的一条（整页渲染 + 打开 antd Modal + 三次 waitFor），
    // 本机在其它 agent 并行跑测试时会超过默认 5s —— 显式给足时间，避免把"机器忙"误读成缺陷。
  }, 20000);

  it('surfaces every failure shape the same way (401 / 500 / timeout), not just one of them', async () => {
    const shapes: Array<[string, Error]> = [
      ['401', Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } })],
      ['500', Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } })],
      ['timeout', Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' })],
    ];
    for (const [label, failure] of shapes) {
      let calls = 0;
      agentsApi(() => { calls += 1; return Promise.reject(failure); });
      const view = renderDiscussion();

      await waitFor(() => expect(calls).toBe(1));
      await waitFor(() => expect(within(rail()).getByText(ROLE_FAILURE)).toBeTruthy());
      // 具体原因原样带出（不是笼统的"失败了"），且与状态码/错误类型无关 —— 一条路径吃下全部。
      expect(within(rail()).getByText(failure.message)).toBeTruthy();
      expect(within(rail()).getByRole('button', { name: RETRY })).toBeTruthy();

      view.unmount();
      expect(screen.queryByText(ROLE_FAILURE), `${label} 卸载后不该残留`).toBeNull();
    }
  });

  it('really refetches the role list from retry (1→2→3), then clears the error state and makes roles selectable again', async () => {
    let calls = 0;
    agentsApi(() => {
      calls += 1;
      if (calls <= 2) return Promise.reject(new Error(`agents down #${calls}`));
      return Promise.resolve({ data: { items: roles } });
    });
    // ?topic= 的既有语义：agents 到位（≥3）就预选前 4 个角色并打开创建对话框。
    // 这里正好用它证明"恢复后角色真的可选"，而不只是"提示消失了"。
    renderDiscussion('/research?mode=review&topic=600519 的现金流');

    await waitFor(() => expect(calls).toBe(1));
    await waitFor(() => expect(within(rail()).getByText('agents down #1')).toBeTruthy());

    fireEvent.click(within(rail()).getByRole('button', { name: RETRY }));
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(within(rail()).getByText('agents down #2')).toBeTruthy());

    fireEvent.click(within(rail()).getByRole('button', { name: RETRY }));
    await waitFor(() => expect(calls).toBe(3));
    // 严格等于点击次数：失败本身不触发任何自动重发（无重试死循环）。
    expect(calls).toBe(3);

    // 恢复成功 ⇒ 两处错误态都消失（不得残留）。
    await waitFor(() => expect(screen.queryByText(ROLE_FAILURE)).toBeNull());
    expect(screen.queryByText(/agents down/)).toBeNull();

    // 且角色真的进入了既有选择流程（不再是空下拉）。
    const topicInput = await screen.findByRole('textbox', { name: '讨论主题' });
    expect((topicInput as HTMLTextAreaElement).value).toBe('600519 的现金流');
    await waitFor(() => expect(selectedRoles()).toHaveLength(4));
  });

  it('says plainly how many roles exist when the read succeeds with fewer than 3 (no unreachable prompt)', async () => {
    agentsApi(() => Promise.resolve({ data: { items: roles.slice(0, 1) } }));
    const warn = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    renderDiscussion();

    fireEvent.click(screen.getByRole('button', { name: '创建讨论' }));
    const topicInput = await screen.findByRole('textbox', { name: '讨论主题' });

    // 原位如实说明；这是"成功但受限"，不是故障 —— 不给重试（重试也变不出角色）。
    await waitFor(() => expect(within(dialog()).getByText('当前仅 1 个角色可用，无法选择至少 3 个角色')).toBeTruthy());
    expect(within(dialog()).queryByRole('button', { name: RETRY })).toBeNull();
    expect(dialog().querySelector('.ant-alert-error')).toBeNull();
    expect(within(dialog()).queryByText(ROLE_FAILURE)).toBeNull();

    fireEvent.change(topicInput, { target: { value: '测试议题' } });
    fireEvent.click(dialogSubmit());
    await waitFor(() => expect(warn).toHaveBeenCalledWith('当前仅 1 个角色可用，无法选择至少 3 个角色'));
    expect(warn).not.toHaveBeenCalledWith('至少选择 3 个角色');
  });

  it('treats a successful but empty role list as "no roles available" instead of crashing', async () => {
    agentsApi(() => Promise.resolve({ data: { items: [] } }));
    const warn = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    renderDiscussion();

    fireEvent.click(screen.getByRole('button', { name: '创建讨论' }));
    const topicInput = await screen.findByRole('textbox', { name: '讨论主题' });
    await waitFor(() => expect(within(dialog()).getByText('当前没有可用的角色，无法选择至少 3 个角色')).toBeTruthy());

    fireEvent.change(topicInput, { target: { value: '测试议题' } });
    fireEvent.click(dialogSubmit());
    await waitFor(() => expect(warn).toHaveBeenCalledWith('当前没有可用的角色，无法选择至少 3 个角色'));
    expect(warn).not.toHaveBeenCalledWith('至少选择 3 个角色');
  });

  it('keeps the success path unchanged: no failure state, roles selectable, room created', async () => {
    agentsApi(() => Promise.resolve({ data: { items: roles } }));
    vi.mocked(apiClient.post).mockResolvedValue({ data: {
      id: 7, conversation_id: 107, topic: '600519 的现金流',
      participants: [{ role_key: 'risk_manager', name: '风险官', avatar: 'AI' }],
      total_rounds: 3, current_phase: 'active', summary: null, created_at: '2026-09-12T00:00:00Z',
    } } as never);
    renderDiscussion('/research?mode=review&topic=600519 的现金流');

    // 既有行为：?topic= 预填主题、预选 4 个角色、打开创建对话框。
    const topicInput = await screen.findByRole('textbox', { name: '讨论主题' });
    expect((topicInput as HTMLTextAreaElement).value).toBe('600519 的现金流');
    await waitFor(() => expect(selectedRoles()).toHaveLength(4));

    // 成功路径上不得出现任何错误/受限提示。
    expect(screen.queryByText(ROLE_FAILURE)).toBeNull();
    expect(document.querySelector('.ant-alert-error')).toBeNull();
    expect(document.querySelector('.ant-alert-warning')).toBeNull();

    fireEvent.click(dialogSubmit());
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/discussion/rooms', expect.objectContaining({
      topic: '600519 的现金流',
      role_keys: roles.map((role) => role.role_key),
      total_rounds: 3,
    })));
  });
});
