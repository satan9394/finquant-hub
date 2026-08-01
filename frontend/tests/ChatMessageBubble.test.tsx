// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import ChatMessageBubble from '../src/components/ChatMessageBubble';
import type { Message } from '../src/types';

vi.mock('../src/components/RoleAvatar', () => ({
  default: ({ name, pulsing }: { name?: string; pulsing?: boolean }) => (
    <div data-testid="role-avatar" data-pulsing={String(Boolean(pulsing))}>{name}</div>
  ),
}));

vi.mock('../src/components/StreamingText', () => ({
  default: ({ content }: { content: string }) => (
    <span data-testid="streaming-text">{content}</span>
  ),
}));

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 1,
    conversation_id: 2,
    role: 'user',
    agent_name: null,
    content: '用户问题',
    round_number: 0,
    token_count: 12,
    created_at: '2026-07-29T12:34:00',
    ...overrides,
  };
}

describe('ChatMessageBubble', () => {
  test('renders a user message with its timestamp, tokens and right alignment', () => {
    const { container } = render(<ChatMessageBubble message={message()} />);

    expect(screen.getByText('用户问题')).toBeTruthy();
    expect(screen.getByText('U')).toBeTruthy();
    expect(screen.getByText('07-29 12:34 · 12 tokens')).toBeTruthy();
    expect((container.firstElementChild as HTMLElement).style.flexDirection).toBe('row-reverse');
  });

  test('uses live content and exposes the streaming state for an agent', () => {
    render(
      <ChatMessageBubble
        message={message({
          role: 'agent',
          agent_name: 'risk_manager',
          content: '已完成内容',
          token_count: null,
        })}
        isStreaming
        streamingContent="正在生成"
      />,
    );

    expect(screen.getByTestId('streaming-text').textContent).toBe('正在生成');
    expect(screen.queryByText('已完成内容')).toBeNull();
    expect(screen.getByText('07-29 12:34 · 输入中...')).toBeTruthy();
    expect(screen.getByTestId('role-avatar').dataset.pulsing).toBe('true');
    expect(screen.getAllByText('risk_manager')).toHaveLength(2);
  });
});
