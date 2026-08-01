// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import McpMarket from '../src/pages/McpMarket';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  toggle: vi.fn(),
}));

vi.mock('../src/services/mcpApi', () => ({
  listMCPServers: api.list,
  setMCPToolEnabled: api.toggle,
}));

const tool = {
  name: 'add',
  local_name: 'mcp__math__add',
  description: 'Add two numbers',
  parameters: {
    type: 'object',
    properties: { a: { type: 'number' }, b: { type: 'number' } },
    required: ['a', 'b'],
  },
  enabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({
    items: [{ name: 'math', transport: 'http', tools: [tool] }],
    total_servers: 1,
    total_tools: 1,
  });
  api.toggle.mockResolvedValue({ ...tool, enabled: false });
});

describe('MCP tool market', () => {
  test('renders discovered metadata and changes Agent runtime availability', async () => {
    render(<McpMarket />);

    expect(await screen.findByText('math')).toBeTruthy();
    expect(screen.getByText('Add two numbers')).toBeTruthy();
    expect(screen.getByText('参数：a、b')).toBeTruthy();
    expect(screen.getByText('mcp__math__add')).toBeTruthy();

    const toggle = screen.getByRole('switch', { name: 'add 工具启用状态' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);

    await waitFor(() => expect(api.toggle).toHaveBeenCalledWith('mcp__math__add', false));
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
  });
});
