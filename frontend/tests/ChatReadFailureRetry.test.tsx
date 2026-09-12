// @vitest-environment jsdom
/* VS34：Chat 的两处**静默吞错**必须变成「可归因 + 可重试 + 不伪装成空」
 *
 * 修前（`git show HEAD:frontend/src/pages/Chat.tsx`）：
 *   ①`apiClient.get('/agents').then(...).catch(() => {})`（HEAD:134-138）—— 喂角色下拉与
 *     "新建会话"的 role_preset。失败被吞掉 ⇒ 下拉永远是空的，"读不到"与"确实没有角色"长得一样。
 *   ②`apiClient.get(.../messages).then(...).catch(() => {})`（HEAD:176-178）—— 喂消息区。
 *     失败被吞掉 ⇒ 消息区**什么都不渲染**，等价于冒称"这个会话没有消息"。
 * 两个独立来源（VS-25 实现者报 :119-127、VS-32 评估者报 :176-179）指向的正是这两处。
 *
 * 本文件与 VS25（Discussion 角色列表）、VS22（左栏列表）、VS29（三态契约）**同一套断言模式**：
 *   ①失败 ⇒ 原位出现错误态（失败文案 + **底层原因原文** + 可点的重试）；
 *   ②失败 ⇒ 该面的空态文案一个字都不许出现；
 *   ③重试 ⇒ **真的重新发起该请求**（以**请求计数** n=1→n=2 证明，不是"重试后成功"）；
 *   ④重试在途 ⇒ 仅成功才清失败态（不闪回加载/空）；
 *   ⑤失败**不串台**：错误原文按会话作用域；
 *   ⑥反向断言：请求成功但确实为空 ⇒ **不得**出现失败态（否则就是把"失败可见"做成了"永远报错"）。
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { message } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Chat from '../src/pages/Chat';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import apiClient from '../src/services/api';
import { useChatStore } from '../src/store/chatStore';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() } }));

const RETRY = /重\s*试/;
/** 永不 settle 的请求：稳定的"在途"夹具（与 ReadStateThreeWay 同款）。 */
const pending = () => new Promise(() => {}) as never;

const MESSAGES_FAILED = '消息记录读取失败';
const MESSAGES_EMPTY = '这个会话还没有消息';
const MESSAGES_LOADING = '正在读取消息记录…';
const ROLES_FAILED = '角色列表读取失败';

const SESSION_42 = {
  id: 42, title: '较早的会话', mode: 'single', role_preset: null, model_id: 1, status: 'active',
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', message_count: 1, last_message: '旧消息',
};
const SESSION_43 = { ...SESSION_42, id: 43, title: '新选的会话', last_message: '新消息' };

const MESSAGE_42 = {
  id: 421, conversation_id: 42, role: 'user' as const, agent_name: null,
  content: '只回放属于 42 的历史消息', round_number: 0, token_count: null, created_at: '2026-09-01T00:00:00Z',
};

const rail = () => document.querySelector('.ant-layout-sider') as HTMLElement;
const content = () => document.querySelector('.ant-layout-content') as HTMLElement;

/** 与 VS22/VS25/VS29 同款判据：失败必须在该表面**原位**说出来（error Alert + 原因原文 + 重试）。 */
function expectFailureSurfaced(scope: HTMLElement, texts: { failure: string; detail: string }) {
  const s = within(scope);
  expect(s.getByText(texts.failure)).toBeTruthy();
  expect(s.getByText(texts.detail)).toBeTruthy();
  expect(s.getByRole('button', { name: RETRY })).toBeTruthy();
  expect(scope.querySelector('.ant-alert-error')).toBeTruthy();
  expect(scope.querySelector('.ant-alert-description')?.textContent).toBe(texts.detail);
}

type Impl = () => Promise<unknown>;

/** 三个读取面各自的实现，并返回逐面调用计数 —— "重试真重发"靠它证明，而不是靠"重试后成功"。 */
function stubApi(opts: { sessions?: Impl; agents?: Impl; messages?: Impl } = {}) {
  const calls = { sessions: 0, agents: 0, messages: 0 };
  vi.mocked(apiClient.get).mockImplementation((url: unknown) => {
    const path = String(url);
    if (path === '/chat/sessions') {
      calls.sessions += 1;
      return (opts.sessions ?? (() => Promise.resolve({ data: { items: [SESSION_42] } })))() as never;
    }
    if (path === '/agents') {
      calls.agents += 1;
      return (opts.agents ?? (() => Promise.resolve({ data: { items: [] } })))() as never;
    }
    if (path.startsWith('/chat/sessions/') && path.endsWith('/messages')) {
      calls.messages += 1;
      return (opts.messages ?? (() => Promise.resolve({ data: { items: [MESSAGE_42] } })))() as never;
    }
    return Promise.resolve({ data: { items: [] } }) as never;
  });
  return calls;
}

function renderChat() {
  return render(
    <MemoryRouter initialEntries={['/research']}>
      <LanguageProvider><Chat /></LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('finquant_lang', 'zh');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  useChatStore.setState({
    sessions: [SESSION_42], currentSessionId: 42, messages: {}, streamingContent: '', isStreaming: false,
  });
});

afterEach(() => {
  act(() => message.destroy());
  vi.restoreAllMocks();
  useChatStore.setState({ sessions: [], currentSessionId: null, messages: {}, streamingContent: '', isStreaming: false });
});

// ==================== 吞错点 B：消息记录读取（HEAD:176-178） ====================

describe('VS34 吞错点 B：消息记录读取失败必须可归因、可重试、绝不伪装成空', () => {
  it('失败 ⇒ 消息区原位给出失败文案 + 底层原因 + 可点重试，且绝不出现空态文案', async () => {
    stubApi({ messages: () => Promise.reject(new Error('message store unavailable')) });
    renderChat();

    await waitFor(() => expectFailureSurfaced(content(), {
      failure: MESSAGES_FAILED, detail: 'message store unavailable',
    }));
    // 修前：`.catch(() => {})` 之后消息区一片空白 —— 与"这个会话确实没有消息"完全同形。
    expect(within(content()).queryByText(MESSAGES_EMPTY)).toBeNull();
    // 也没有"加载中"残留（三态互斥）。
    expect(within(content()).queryByText(MESSAGES_LOADING)).toBeNull();
  });

  it('重试**真的重发请求**（计数 n=1→n=2），且恢复成功后失败态消失、历史消息出现', async () => {
    let n = 0;
    const calls = stubApi({
      messages: () => {
        n += 1;
        return n === 1
          ? Promise.reject(new Error('boom')) as never
          : Promise.resolve({ data: { items: [MESSAGE_42] } }) as never;
      },
    });
    renderChat();

    await waitFor(() => expectFailureSurfaced(content(), { failure: MESSAGES_FAILED, detail: 'boom' }));
    expect(calls.messages).toBe(1);

    fireEvent.click(within(content()).getByRole('button', { name: RETRY }));

    // "重试确会重新发起"：请求次数真的 +1，而不是只把提示关掉。
    expect(await within(content()).findByText('只回放属于 42 的历史消息')).toBeTruthy();
    expect(calls.messages).toBe(2);
    expect(within(content()).queryByText(MESSAGES_FAILED)).toBeNull();
    expect(within(content()).queryByText('boom')).toBeNull();
  });

  it('重试在途 ⇒ 失败态保持（不闪回"加载中"，也不闪回空态）', async () => {
    let n = 0;
    const calls = stubApi({
      messages: () => {
        n += 1;
        return n === 1 ? Promise.reject(new Error('still down')) as never : pending();
      },
    });
    renderChat();

    await waitFor(() => expectFailureSurfaced(content(), { failure: MESSAGES_FAILED, detail: 'still down' }));

    fireEvent.click(within(content()).getByRole('button', { name: RETRY }));
    await waitFor(() => expect(calls.messages).toBe(2));

    // 仅成功才清失败态：第二次仍在途，失败态必须原地不动。
    expect(within(content()).getByText(MESSAGES_FAILED)).toBeTruthy();
    expect(within(content()).getByText('still down')).toBeTruthy();
    expect(within(content()).queryByText(MESSAGES_LOADING)).toBeNull();
    expect(within(content()).queryByText(MESSAGES_EMPTY)).toBeNull();
  });

  it('成功且确实为空 ⇒ 才出现空态文案（诚实的空 ≠ 失败）', async () => {
    stubApi({ messages: () => Promise.resolve({ data: { items: [] } }) });
    renderChat();

    expect(await within(content()).findByText(MESSAGES_EMPTY)).toBeTruthy();
    expect(within(content()).queryByText(MESSAGES_FAILED)).toBeNull();
    expect(within(content()).queryByRole('button', { name: RETRY })).toBeNull();
  });

  it('42 失败后切到 43（在途）⇒ 消息区不得再显示 42 的错误原文，也不得退化成空态', async () => {
    stubApi({
      sessions: () => Promise.resolve({ data: { items: [SESSION_42, SESSION_43] } }),
      messages: () => (useChatStore.getState().currentSessionId === 43
        ? pending()
        : Promise.reject(new Error('session 42 read failed')) as never),
    });
    renderChat();

    // 前提：42 的失败确实显示在消息区（否则本用例不能证明"串台被消除"）。
    await waitFor(() => expect(within(content()).getByText('session 42 read failed')).toBeTruthy());

    fireEvent.click(within(rail()).getByText('新选的会话'));

    // 核心判据先断言（顺序承重）：43 在途期间，42 的错误原文必须消失。
    await waitFor(() => expect(within(content()).queryByText('session 42 read failed')).toBeNull());
    expect(within(content()).queryByText(MESSAGES_FAILED)).toBeNull();
    expect(within(content()).queryByText(MESSAGES_EMPTY)).toBeNull();
    // 且必须是"加载中"这一态，不是"什么都没有"。
    expect(within(content()).getByText(MESSAGES_LOADING)).toBeTruthy();
  });

  it('43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言：不得修成"错误永不显示"）', async () => {
    stubApi({
      sessions: () => Promise.resolve({ data: { items: [SESSION_42, SESSION_43] } }),
      messages: () => (useChatStore.getState().currentSessionId === 43
        ? Promise.reject(new Error('session 43 read failed'))
        : Promise.reject(new Error('session 42 read failed')) as never),
    });
    renderChat();

    await waitFor(() => expect(within(content()).getByText('session 42 read failed')).toBeTruthy());

    fireEvent.click(within(rail()).getByText('新选的会话'));

    await waitFor(() => expect(within(content()).getByText('session 43 read failed')).toBeTruthy());
    expect(within(content()).getByText(MESSAGES_FAILED)).toBeTruthy();
    expect(within(content()).getByRole('button', { name: RETRY })).toBeTruthy();
    // 显示的是 43 自己的原文，不是 42 的。
    expect(within(content()).queryByText('session 42 read failed')).toBeNull();
  });
});

// ==================== 吞错点 A：角色列表读取（HEAD:134-138） ====================

describe('VS34 吞错点 A：角色列表读取失败必须可归因（两处消费方都原位可见）、可重试', () => {
  it('失败 ⇒ 左栏（新建会话的 role_preset）与角色下拉下方两处都原位给出失败态', async () => {
    stubApi({ agents: () => Promise.reject(new Error('agents upstream down')) });
    renderChat();

    await waitFor(() => expectFailureSurfaced(rail(), { failure: ROLES_FAILED, detail: 'agents upstream down' }));
    expectFailureSurfaced(content(), { failure: ROLES_FAILED, detail: 'agents upstream down' });
  });

  it('重试**真的重发请求**（计数 n=1→n=2），恢复后两处失败态都消失', async () => {
    let n = 0;
    const calls = stubApi({
      agents: () => {
        n += 1;
        return n === 1
          ? Promise.reject(new Error('agents upstream down')) as never
          : Promise.resolve({ data: { items: [{ role_key: 'analyst', name: '分析师', avatar: '析' }] } }) as never;
      },
    });
    renderChat();

    await waitFor(() => expectFailureSurfaced(rail(), { failure: ROLES_FAILED, detail: 'agents upstream down' }));
    expect(calls.agents).toBe(1);

    fireEvent.click(within(rail()).getByRole('button', { name: RETRY }));

    await waitFor(() => expect(calls.agents).toBe(2));
    // 恢复成功 ⇒ 两处失败态都消失（含下拉下方那一份），且不得残留底层原文。
    await waitFor(() => expect(screen.queryByText(ROLES_FAILED)).toBeNull());
    expect(screen.queryByText('agents upstream down')).toBeNull();
  });

  it('成功但确实没有角色 ⇒ 不得出现失败态（把"失败可见"做成"永远报错"同样是缺陷）', async () => {
    stubApi({ agents: () => Promise.resolve({ data: { items: [] } }) });
    renderChat();

    await waitFor(() => expect(useChatStore.getState().sessions).toHaveLength(1));
    expect(screen.queryByText(ROLES_FAILED)).toBeNull();
    expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
  });
});
