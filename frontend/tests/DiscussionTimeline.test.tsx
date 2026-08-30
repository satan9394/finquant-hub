// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import DiscussionTimeline from '../src/components/DiscussionTimeline';
import type { DiscussionRoom, Message } from '../src/types';

const room: DiscussionRoom = {
  id: 9,
  conversation_id: 19,
  topic: '长期持有复核',
  participants: [{ role_key: 'risk_manager', name: '风控委员', avatar: '' }],
  total_rounds: 2,
  current_phase: 'done',
  summary: '风险可控但需跟踪估值。',
  created_at: '2026-08-30T00:00:00Z',
};

const message: Message = {
  id: 1,
  conversation_id: 19,
  role: 'agent',
  agent_name: 'risk_manager',
  content: '控制回撤优先。',
  round_number: 2,
  token_count: 5,
  created_at: '2026-08-30T00:01:00Z',
};

describe('DiscussionTimeline', () => {
  test('renders the deterministic empty state without a room', () => {
    render(<DiscussionTimeline room={null} messages={[]} />);
    expect(screen.getByText('请选择或创建一个讨论房间')).toBeTruthy();
  });

  test('renders room metadata, summary, and the current agent message', () => {
    const { container } = render(<DiscussionTimeline room={room} messages={[message]} currentAgent="risk_manager" />);

    expect(screen.getByText('长期持有复核')).toBeTruthy();
    expect(screen.getByText('风险可控但需跟踪估值。')).toBeTruthy();
    expect(screen.getByText('控制回撤优先。')).toBeTruthy();
    expect(container.querySelector('[style*="animation: pulse"]')).toBeTruthy();
  });
});
