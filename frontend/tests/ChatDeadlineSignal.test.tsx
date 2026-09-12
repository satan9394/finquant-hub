// @vitest-environment jsdom
//
// VS28：chat 的整轮截止信号（`done.truncated_by_deadline`）必须有**真实消费方**——用户看得见，
// 而且是**持久**的（挂在消息本体上，不是 `message.warning` 那种一闪而过的 toast）。
//
// 反面教材（VS-23）：该字段在 frontend 全库**零命中**，"字段存在"≠"用户看得见"。
// 本文件钉住四件事：
//   ① 实时（SSE `done`）为 true ⇒ 出现提示，且流结束后**仍在**（不是流式气泡的一部分）；
//   ② 回放（GET /chat/sessions/{id}/messages 的同一字段）⇒ 同一条提示，用户回看仍知道；
//   ③ 未截断 / 缺字段 / 非法值 ⇒ **一律不得**出现提示（不误报）；
//   ④ 读取是纯粹且同源的（只有显式 true 才算截断）。

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Chat, { resolveTruncatedByDeadline } from '../src/pages/Chat';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { translate } from '../src/i18n';
import apiClient from '../src/services/api';
import { readSSE } from '../src/services/sse';
import { useChatStore } from '../src/store/chatStore';
import type { Message, Session } from '../src/types';

vi.mock('../src/services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('../src/services/sse', () => ({ readSSE: vi.fn() }));

const t = (key: string) => translate('zh', key);
const NOTICE = '（因超过总时长上限提前结束，以下为已完成部分）';
const SESSION: Session = {
  id: 7,
  title: '截断会话',
  mode: 'single',
  role_preset: null,
  model_id: null,
  status: 'active',
  created_at: '2026-09-01 10:00:00',
  updated_at: '2026-09-01 10:00:00',
};

function assistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 55,
    conversation_id: 7,
    role: 'assistant',
    agent_name: null,
    content: '已完成的部分正文',
    round_number: 0,
    token_count: 30,
    created_at: '2026-09-01 10:00:00',
    ...overrides,
  };
}

function stubGet(history: Message[]) {
  vi.mocked(apiClient.get).mockImplementation((url: unknown) => {
    const path = String(url);
    if (path === '/chat/sessions') return Promise.resolve({ data: { items: [SESSION] } }) as never;
    if (path === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
    if (path === '/chat/sessions/7/messages') return Promise.resolve({ data: { items: history } }) as never;
    return Promise.resolve({ data: { items: [] } }) as never;
  });
}

function renderChat() {
  return render(
    <MemoryRouter initialEntries={['/chat']}>
      <LanguageProvider>
        <Chat />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

/** 走一次真实的发送流程（输入 → 点"发送"），由 mock 的 readSSE 驱动事件。 */
async function sendMessage(text = '帮我分析一下') {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  // 发送按钮带 SendOutlined 图标，可访问名是 "send 发送" ⇒ 用子串匹配。
  fireEvent.click(screen.getByRole('button', { name: new RegExp(t('chat.send')) }));
}

beforeEach(() => {
  localStorage.setItem('finquant_lang', 'zh');
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(readSSE).mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: {} }));
  useChatStore.setState({
    sessions: [],
    currentSessionId: 7,
    messages: {},
    streamingContent: '',
    isStreaming: false,
  });
});

afterEach(() => {
  act(() => useChatStore.setState({ messages: {}, streamingContent: '', isStreaming: false }));
  vi.unstubAllGlobals();
});

describe('VS28：chat 整轮截断信号有消费方（用户看得见且持久）', () => {
  it('实时：done.truncated_by_deadline=true ⇒ 屏上出现提示，且流结束后仍在消息上', async () => {
    stubGet([]);
    vi.mocked(readSSE).mockImplementation(async (_body, onEvent) => {
      onEvent({ event: 'token', data: { delta: `${NOTICE}\n\n已完成的部分正文` } } as never);
      onEvent({
        event: 'done',
        data: { message_id: 55, token_count: 30, truncated_by_deadline: true, user_message_id: 54 },
      } as never);
    });

    renderChat();
    await sendMessage();

    await waitFor(() => expect(screen.getByTestId('chat-truncated-by-deadline')).toBeTruthy());
    expect(screen.getByText(t('chat.truncatedByDeadline'))).toBeTruthy();
    // 正文前缀（VS-23 通道①）同样在——两条通道同源、都指向"被提前结束"。
    expect(screen.getByText(new RegExp(NOTICE))).toBeTruthy();

    // "持久"：流已经结束（不再有流式气泡），提示仍挂在消息本身上。
    await waitFor(() => expect(useChatStore.getState().isStreaming).toBe(false));
    expect(screen.queryByText(new RegExp(t('chatBubble.typing')))).toBeNull();
    expect(screen.getByTestId('chat-truncated-by-deadline')).toBeTruthy();
  }, 30_000);

  it('回放：重新加载会话（GET messages 带同一字段）⇒ 用户回看时仍看得见提示', async () => {
    stubGet([assistantMessage({ truncated_by_deadline: true, content: `${NOTICE}\n\n已完成的部分正文` })]);

    renderChat();

    await waitFor(() => expect(screen.getByTestId('chat-truncated-by-deadline')).toBeTruthy());
    expect(screen.getByText(t('chat.truncatedByDeadline'))).toBeTruthy();
  }, 30_000);

  it('未截断：done 明确为 false ⇒ 不得出现任何"被截断"提示', async () => {
    stubGet([]);
    vi.mocked(readSSE).mockImplementation(async (_body, onEvent) => {
      onEvent({ event: 'token', data: { delta: '正常回答' } } as never);
      onEvent({
        event: 'done',
        data: { message_id: 56, token_count: 5, truncated_by_deadline: false, user_message_id: 54 },
      } as never);
    });

    renderChat();
    await sendMessage();

    await waitFor(() => expect(screen.getByText('正常回答')).toBeTruthy());
    expect(screen.queryByTestId('chat-truncated-by-deadline')).toBeNull();
    expect(screen.queryByText(t('chat.truncatedByDeadline'))).toBeNull();
  }, 30_000);

  it('回放：历史消息缺该字段（旧数据）⇒ 同样不得误报', async () => {
    stubGet([assistantMessage({ content: '一条历史回答' })]);

    renderChat();

    await waitFor(() => expect(screen.getByText('一条历史回答')).toBeTruthy());
    expect(screen.queryByTestId('chat-truncated-by-deadline')).toBeNull();
  }, 30_000);
});

describe('VS28：信号读取是纯粹且同源的', () => {
  it('只有显式 true 才算截断；false / 缺字段 / 非布尔一律不算', () => {
    expect(resolveTruncatedByDeadline(true)).toBe(true);
    expect(resolveTruncatedByDeadline(false)).toBe(false);
    expect(resolveTruncatedByDeadline(undefined)).toBe(false);
    expect(resolveTruncatedByDeadline(null)).toBe(false);
    expect(resolveTruncatedByDeadline('true')).toBe(false);
    expect(resolveTruncatedByDeadline(1)).toBe(false);
  });
});
