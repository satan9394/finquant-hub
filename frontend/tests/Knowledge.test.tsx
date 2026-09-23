// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import Knowledge from '../src/pages/Knowledge';

vi.mock('../src/services/researchApi', () => ({
  fetchMemories: vi.fn().mockResolvedValue([]),
  actOnMemory: vi.fn(),
  deleteMemory: vi.fn(),
  exportMemories: vi.fn(),
}));

describe('Knowledge indicator topics', () => {
  it('opens a shared indicator topic from the query string', () => {
    render(<MemoryRouter initialEntries={['/knowledge?indicator=rsi']}><Knowledge /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'RSI 相对强弱指标' })).toBeTruthy();
    expect(screen.getByText(/RSI6、RSI12、RSI24/)).toBeTruthy();
    expect(screen.getByText('常见误区')).toBeTruthy();
  });

  it('opens user-controlled research memory from the query string', async () => {
    render(<MemoryRouter initialEntries={['/knowledge?view=memory']}><Knowledge /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: '我的研究记忆' })).toBeTruthy();
    expect(screen.getByText(/AI 内容只会进入待确认状态/)).toBeTruthy();
  });
});
