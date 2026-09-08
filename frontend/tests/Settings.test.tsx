// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import Settings from '../src/pages/Settings';

const mocks = vi.hoisted(() => ({
  getSystem: vi.fn(),
  updateSystem: vi.fn(),
  listConfigs: vi.fn(),
  createConfig: vi.fn(),
  updateConfig: vi.fn(),
  deleteConfig: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock('../src/services/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: mocks.apiPut,
    delete: mocks.apiDelete,
  },
}));

vi.mock('../src/services/settingsApi', () => ({
  getSystemSettings: mocks.getSystem,
  updateSystemSettings: mocks.updateSystem,
}));

vi.mock('../src/services/mcpApi', () => ({
  listMCPServerConfigs: mocks.listConfigs,
  createMCPServerConfig: mocks.createConfig,
  updateMCPServerConfig: mocks.updateConfig,
  deleteMCPServerConfig: mocks.deleteConfig,
  connectMCPServer: mocks.connect,
  disconnectMCPServer: mocks.disconnect,
}));

vi.mock('../src/hooks/useLightweightCharts', () => ({
  useLightweightCharts: () => ({
    switchToArea: vi.fn(), clearAllSeries: vi.fn(), fitContent: vi.fn(),
  }),
}));

const settings = {
  scheduler_enabled: false,
  scheduler_concurrency: 2,
  scheduler_max_targets: 20,
  scheduler_hour: 18,
  scheduler_minute: 0,
};

const server = {
  id: 1,
  name: 'research',
  url: 'https://mcp.example.test/api',
  transport: 'http' as const,
  is_enabled: false,
  connected: false,
  last_error: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSystem.mockResolvedValue({
    settings,
    metadata: { app_version: '1.0.0', editable_keys: Object.keys(settings), secrets_exposed: false },
  });
  mocks.updateSystem.mockResolvedValue({
    settings,
    metadata: { app_version: '1.0.0', editable_keys: Object.keys(settings), secrets_exposed: false },
  });
  mocks.listConfigs.mockResolvedValue([server]);
  mocks.connect.mockResolvedValue({ ...server, is_enabled: true, connected: true, tool_count: 2 });
  mocks.disconnect.mockResolvedValue({ ...server, is_enabled: false, connected: false });
  mocks.createConfig.mockResolvedValue(server);
  mocks.updateConfig.mockResolvedValue(server);
  mocks.deleteConfig.mockResolvedValue(undefined);
  mocks.apiGet.mockResolvedValue({ data: { items: [] } });
  mocks.apiPost.mockResolvedValue({ data: {} });
  mocks.apiPut.mockResolvedValue({ data: {} });
  mocks.apiDelete.mockResolvedValue({ data: { ok: true } });
});

describe('Settings configuration management', () => {
  test('loads and saves the allowlisted system configuration', async () => {
    render(<Settings />);

    expect(await screen.findByText('盘后任务调度')).toBeTruthy();
    expect(screen.getByText(/API Key 和环境变量值不会返回浏览器/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /保存并应用/ }));

    await waitFor(() => expect(mocks.updateSystem).toHaveBeenCalledWith(settings));
  });

  test('manages persisted HTTP MCP servers and runtime connection state', async () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('tab', { name: 'MCP 服务器' }));

    expect(await screen.findByText('research')).toBeTruthy();
    expect(screen.getByText('https://mcp.example.test/api')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /连\s*接/ }));
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith(1));
    expect(await screen.findByText('已连接')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /添加服务器/ }));
    fireEvent.change(screen.getByLabelText('服务器名称'), { target: { value: 'news' } });
    fireEvent.change(screen.getByLabelText('HTTP(S) MCP 地址'), { target: { value: 'https://news.example.test/mcp' } });
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));
    await waitFor(() => expect(mocks.createConfig).toHaveBeenCalledWith({
      name: 'news',
      url: 'https://news.example.test/mcp',
    }));
  }, 15_000);

  test('saves service credentials without rendering the plaintext again', async () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('tab', { name: 'API 密钥' }));

    expect(await screen.findByText('Tushare Token')).toBeTruthy();
    const configureButtons = screen.getAllByRole('button', { name: /配置/ });
    fireEvent.click(configureButtons[0]);
    fireEvent.change(screen.getByLabelText('Tushare Token 凭据'), {
      target: { value: 'private-tushare-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: '加密保存' }));

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledWith('/me/credentials/tushare', {
      value: 'private-tushare-key',
      provider: 'tushare.pro',
    }));
    await waitFor(() => {
      const input = screen.queryByLabelText('Tushare Token 凭据') as HTMLInputElement | null;
      expect(input?.value ?? '').toBe('');
    });
  }, 15_000);

  test('usage tab renders the daily trend chart and session detail panel', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        days: 30,
        items: [
          { day: '2026-09-01', prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, request_count: 2 },
        ],
        total: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, request_count: 2 },
        by_session_type: [{ session_type: 'research', total_tokens: 150, request_count: 2 }],
      },
    });
    render(<Settings />);
    fireEvent.click(screen.getByRole('tab', { name: 'LLM 用量' }));

    expect(await screen.findByTestId('usage-trend-chart')).toBeTruthy();
    expect(mocks.apiGet).toHaveBeenCalledWith('/usage', { params: { days: 30 } });
    expect(mocks.apiGet).toHaveBeenCalledWith('/usage/records', { params: { limit: 50 } });
  });
});
