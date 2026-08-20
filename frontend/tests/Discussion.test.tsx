// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import Discussion from '../src/pages/Discussion';
import apiClient from '../src/services/api';
import { useDiscussionStore } from '../src/store/discussionStore';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/components/DiscussionTimeline', () => ({ default: () => <div data-testid="discussion-timeline" /> }));
vi.mock('../src/components/InvestmentCommittee', () => ({ default: () => <div data-testid="investment-committee" /> }));

const room = {
  id: 42,
  conversation_id: 142,
  topic: '测试议题',
  participants: [{ role_key: 'risk_manager', name: '风险官', avatar: '盾' }],
  total_rounds: 3,
  current_phase: 'active',
  summary: null,
  created_at: '2026-08-20T00:00:00Z',
} as const;

describe('Discussion async room detail guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDiscussionStore.setState({
      rooms: [room],
      currentRoomId: room.id,
      messages: { [room.id]: [] },
      streamingContent: '',
      isStreaming: false,
    });
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === `/discussion/rooms/${room.id}`) return new Promise(() => {}) as never;
      if (url === '/discussion/rooms') return Promise.resolve({ data: { items: [room] } }) as never;
      if (url === '/agents') return Promise.resolve({ data: [] }) as never;
      return Promise.resolve({ data: {} }) as never;
    });
  });

  afterEach(() => {
    useDiscussionStore.setState({
      rooms: [], currentRoomId: null, messages: {}, streamingContent: '', isStreaming: false,
    });
  });

  it('shows a loading state when a room is selected before its detail arrives', () => {
    render(<MemoryRouter><Discussion /></MemoryRouter>);

    expect(screen.getByRole('status').textContent).toContain('正在加载讨论详情');
    expect(screen.queryByTestId('investment-committee')).toBeNull();
  });
});
