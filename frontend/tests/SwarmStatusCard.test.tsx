// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SwarmStatusCard from '../src/components/SwarmStatusCard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { useModelStore } from '../src/store/modelStore';

const mocks = vi.hoisted(() => ({
  fetchFour: vi.fn(), fetchEarnings: vi.fn(), streamFour: vi.fn(), streamEarnings: vi.fn(),
}));
vi.mock('../src/services/swarmApi', () => ({
  fetchFourMastersTeam: mocks.fetchFour,
  fetchEarningsReviewTeam: mocks.fetchEarnings,
  streamFourMasters: mocks.streamFour,
  streamEarningsReview: mocks.streamEarnings,
}));

const team = {
  key: 'four-masters', name: '四大师', description: '独立并行分析',
  agents: [{ key: 'value', name: '价值专家', avatar: 'V', dependencies: [], tools: ['quote'] }],
};

describe('SwarmStatusCard', () => {
  beforeEach(() => {
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
    useModelStore.setState({ currentModelId: null });
    mocks.fetchFour.mockResolvedValue(team);
    mocks.fetchEarnings.mockResolvedValue({ ...team, key: 'earnings', name: '财报团队' });
    mocks.streamFour.mockResolvedValue('done');
  });

  it('loads the team definition and renders independent agent status', async () => {
    render(<LanguageProvider><SwarmStatusCard ticker="600519" /></LanguageProvider>);

    expect(await screen.findByTestId('swarm-status-card')).toBeTruthy();
    expect(screen.getByText('四大师')).toBeTruthy();
    expect(screen.getByText('价值专家')).toBeTruthy();
    expect(screen.getByText('独立并行研究')).toBeTruthy();
  });

  it('starts the selected team with ticker, model, event callback, and abort signal', async () => {
    render(<LanguageProvider><SwarmStatusCard ticker="600519" /></LanguageProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /启动团队/ }));

    await waitFor(() => expect(mocks.streamFour).toHaveBeenCalledTimes(1));
    expect(mocks.streamFour.mock.calls[0][0]).toBe('600519');
    expect(mocks.streamFour.mock.calls[0][1]).toBeNull();
    expect(mocks.streamFour.mock.calls[0][2]).toEqual(expect.any(Function));
    expect(mocks.streamFour.mock.calls[0][3]).toBeInstanceOf(AbortSignal);
  });

  it('shows a degraded agent as degraded (with its structured reason), not as a clean completion', async () => {
    mocks.streamFour.mockImplementation(async (
      _ticker: string,
      _model: number | null,
      onEvent: (event: { event: string; data: Record<string, unknown> }) => void,
    ) => {
      onEvent({ event: 'agent_started', data: { role_key: 'value' } });
      onEvent({
        event: 'agent_completed',
        data: { role_key: 'value', status: 'degraded', degraded_reasons: ['tool_failed'], token_count: 10 },
      });
      onEvent({
        event: 'done',
        data: {
          status: 'completed',
          token_count: 10,
          agent_results: {
            value: { content: '结论', status: 'degraded', degraded_reasons: ['tool_failed'], token_count: 10 },
          },
        },
      });
      return 'done';
    });

    render(<LanguageProvider><SwarmStatusCard ticker="600519" /></LanguageProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /启动团队/ }));

    expect(await screen.findByText('工具调用失败')).toBeTruthy();
  });
});
