// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Chat from '../src/pages/Chat';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import apiClient from '../src/services/api';
import { useChatStore } from '../src/store/chatStore';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

function Destination() {
  const location = useLocation();
  return <output data-testid="destination">{location.pathname + location.search}</output>;
}

function renderChat() {
  return render(
    <MemoryRouter initialEntries={['/research?mode=fast']}>
      <LanguageProvider>
        <Routes>
          <Route path="/research" element={<Chat />} />
          <Route path="/strategy-lab/ma-crossover" element={<Destination />} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('Chat backtest handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(message, 'info').mockImplementation(() => undefined as never);
    localStorage.setItem('finquant_lang', 'zh');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [] } });
    useChatStore.setState({ sessions: [], currentSessionId: 7, messages: {}, isStreaming: false, streamingContent: '' });
  });

  afterEach(() => {
    act(() => message.destroy());
    vi.restoreAllMocks();
  });

  it.each([
    ['回测 600519 ma_cross', '600519'],
    ['请用 RSI 回测 AAPL', 'AAPL'],
    ['backtest 0700.HK bollinger', '00700.HK'],
    ['backtest BRK.B', 'BRK-B'],
    ['回测 MA ma_cross', 'MA'],
  ])('opens Strategy Lab with only the ticker from %s without submitting a backtest', async (description, ticker) => {
    renderChat();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: description } });
    fireEvent.click(screen.getByRole('button', { name: '打开策略实验室' }));

    expect((await screen.findByTestId('destination')).textContent).toBe(
      '/strategy-lab/ma-crossover?symbol=' + encodeURIComponent(ticker),
    );
    expect(message.info).toHaveBeenCalledWith('已转到策略实验室，请在页面确认参数后运行');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('keeps empty input disabled without navigating or submitting', async () => {
    renderChat();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    const button = screen.getByRole('button', { name: '打开策略实验室' }) as HTMLButtonElement;

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/chat/sessions/7/messages'));
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(screen.queryByTestId('destination')).toBeNull();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('warns and preserves the input when no ticker can be parsed', async () => {
    renderChat();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '请帮我回测' } });
    fireEvent.click(screen.getByRole('button', { name: '打开策略实验室' }));

    expect(await screen.findByText('策略描述中需要包含股票代码，例如 600519 或 AAPL')).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('请帮我回测');
    expect(screen.queryByTestId('destination')).toBeNull();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('explains the handoff and parameter confirmation in English', async () => {
    localStorage.setItem('finquant_lang', 'en');
    renderChat();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'backtest AAPL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open Strategy Lab' }));

    expect((await screen.findByTestId('destination')).textContent).toBe('/strategy-lab/ma-crossover?symbol=AAPL');
    expect(message.info).toHaveBeenCalledWith('Opened Strategy Lab. Review the parameters before running.');
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
