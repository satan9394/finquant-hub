// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MCPServerSettingsPanel from '../src/components/settings/MCPServerSettingsPanel';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
}));
vi.mock('../src/services/mcpApi', () => ({
  listMCPServerConfigs: mocks.list,
  createMCPServerConfig: mocks.create,
  updateMCPServerConfig: mocks.update,
  deleteMCPServerConfig: mocks.remove,
  connectMCPServer: mocks.connect,
  disconnectMCPServer: mocks.disconnect,
}));

const server = { id: 7, name: 'research', url: 'https://mcp.test/api', transport: 'http', is_enabled: false, connected: false, last_error: null, created_at: '2026-01-01', updated_at: '2026-01-01' };

describe('MCPServerSettingsPanel', () => {
  beforeEach(() => {
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([server]);
    mocks.connect.mockResolvedValue({ ...server, connected: true, is_enabled: true });
    mocks.create.mockResolvedValue(server);
  });

  it('loads a server and connects it through the panel callback', async () => {
    render(<LanguageProvider><MCPServerSettingsPanel /></LanguageProvider>);

    expect(await screen.findByText('research')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /连\s*接/ }));
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith(7));
    expect(await screen.findByText('已连接')).toBeTruthy();
  });

  it('creates a validated HTTP server from the editor', async () => {
    render(<LanguageProvider><MCPServerSettingsPanel /></LanguageProvider>);
    await screen.findByText('research');

    fireEvent.click(screen.getByRole('button', { name: /添加服务器/ }));
    fireEvent.change(screen.getByLabelText('服务器名称'), { target: { value: 'news' } });
    fireEvent.change(screen.getByLabelText('HTTP(S) MCP 地址'), { target: { value: 'https://news.test/mcp' } });
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ name: 'news', url: 'https://news.test/mcp' }));
  });
});
