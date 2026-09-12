// @vitest-environment jsdom
/* VS16：首页"最近会话"深链 ?session=<id> —— 点击后必须打开"那一条"，非法 id 必须优雅回落。 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Chat from '../src/pages/Chat';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import apiClient from '../src/services/api';
import { useChatStore } from '../src/store/chatStore';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() } }));

const sessions = [
  {
    id: 42, title: '较早的会话', mode: 'single', role_preset: null, model_id: 1, status: 'active',
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', message_count: 1, last_message: '旧消息',
  },
  {
    id: 43, title: '首页点进来的会话', mode: 'single', role_preset: null, model_id: 1, status: 'active',
    created_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-10T00:00:00Z', message_count: 1, last_message: '现金流如何',
  },
] as const;

const messageOf43 = {
  id: 431, conversation_id: 43, role: 'user' as const, agent_name: null,
  content: '只回放属于 43 的历史消息', round_number: 0, token_count: null, created_at: '2026-09-10T00:00:00Z',
};
const messageOf42 = {
  id: 421, conversation_id: 42, role: 'user' as const, agent_name: null,
  content: '只回放属于 42 的历史消息', round_number: 0, token_count: null, created_at: '2026-09-01T00:00:00Z',
};

function mockApi() {
  vi.mocked(apiClient.get).mockImplementation((url) => {
    if (url === '/chat/sessions') return Promise.resolve({ data: { items: [...sessions] } }) as never;
    if (url === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
    if (url === '/chat/sessions/43/messages') return Promise.resolve({ data: { items: [messageOf43] } }) as never;
    if (url === '/chat/sessions/42/messages') return Promise.resolve({ data: { items: [messageOf42] } }) as never;
    return Promise.resolve({ data: { items: [] } }) as never;
  });
}

function renderChat(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <Routes>
          <Route path="/research" element={<Chat />} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('Chat ?session= deep link (VS16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('finquant_lang', 'zh');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    useChatStore.setState({ sessions: [], currentSessionId: null, messages: {}, streamingContent: '', isStreaming: false });
    mockApi();
  });

  afterEach(() => {
    act(() => message.destroy());
    vi.restoreAllMocks();
    useChatStore.setState({ sessions: [], currentSessionId: null, messages: {}, streamingContent: '', isStreaming: false });
  });

  it('selects the deep-linked session and loads exactly that record', async () => {
    renderChat('/research?mode=fast&session=43');

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/chat/sessions/43/messages'));
    expect(useChatStore.getState().currentSessionId).toBe(43);
    // "点击后真的打开了那一条"：渲染出的是 43 的历史消息，且从未为 42 发过请求。
    expect(await screen.findByText('只回放属于 43 的历史消息')).toBeTruthy();
    expect(apiClient.get).not.toHaveBeenCalledWith('/chat/sessions/42/messages');
  });

  it('falls back quietly when the requested session does not exist', async () => {
    renderChat('/research?mode=fast&session=999');

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/chat/sessions'));
    await waitFor(() => expect(screen.getByText('请选择或创建一个会话')).toBeTruthy());
    expect(apiClient.get).not.toHaveBeenCalledWith('/chat/sessions/999/messages');
    expect(useChatStore.getState().currentSessionId).toBeNull();
  });

  it.each([['abc'], ['0'], ['-1'], ['1.5'], ['43x'], ['']])(
    'treats the malformed session value %s as "no deep link"',
    async (raw) => {
      renderChat(`/research?mode=fast&session=${raw}`);

      await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/chat/sessions'));
      expect(apiClient.get).not.toHaveBeenCalledWith('/chat/sessions/0/messages');
      expect(useChatStore.getState().currentSessionId).toBeNull();
      expect(screen.getByText('请选择或创建一个会话')).toBeTruthy();
    },
  );

  it('keeps the session list clickable after a deep link (no snap-back to the URL id)', async () => {
    renderChat('/research?mode=fast&session=43');
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/chat/sessions/43/messages'));

    fireEvent.click(screen.getByText('较早的会话'));

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/chat/sessions/42/messages'));
    expect(useChatStore.getState().currentSessionId).toBe(42);
    expect(await screen.findByText('只回放属于 42 的历史消息')).toBeTruthy();
  });

  it('keeps the existing ?prompt= behavior alongside a session deep link', async () => {
    renderChat('/research?mode=fast&prompt=核验贵州茅台风险&session=43');

    expect(await screen.findByDisplayValue('核验贵州茅台风险')).toBeTruthy();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/chat/sessions/43/messages'));
  });

  it('still shows the editable starter draft for ?prompt= without a session', async () => {
    renderChat('/research?mode=fast&prompt=核验贵州茅台风险');

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/chat/sessions'));
    expect(await screen.findByDisplayValue('核验贵州茅台风险')).toBeTruthy();
    expect(screen.getByText(/URL 预填不会自动发送/)).toBeTruthy();
    expect(useChatStore.getState().currentSessionId).toBeNull();
  });
});
