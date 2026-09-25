// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Models from '../src/pages/Models';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import type { ModelConfig } from '../src/types';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: api }));

const models: ModelConfig[] = [
  {
    id: 3, name: 'DeepSeek V4 Flash', provider: 'deepseek', base_url: 'https://api.deepseek.com',
    model_name: 'deepseek-v4-flash', api_key_env: 'DEEPSEEK_API_KEY', has_api_key: true,
    credential_source: 'environment', temperature: 0.2, max_tokens: 4096, is_default: 1,
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  },
  {
    id: 4, name: 'Kimi K2', provider: 'kimi', base_url: 'https://api.moonshot.cn/v1',
    model_name: 'kimi-k2', api_key_env: null, has_api_key: false,
    credential_source: 'none', temperature: 0.7, max_tokens: 4096, is_default: 0,
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  },
];

function renderPage() {
  render(<LanguageProvider><Models /></LanguageProvider>);
}

describe('Models provider cards', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { items: models } });
  });

  it('renders one card per configured provider', async () => {
    renderPage();
    expect(await screen.findByTestId('provider-card-3')).toBeTruthy();
    expect(screen.getByTestId('provider-card-4')).toBeTruthy();
    expect(screen.getByText('https://api.moonshot.cn/v1')).toBeTruthy();
    expect(screen.getByTestId('provider-health-3').getAttribute('data-status')).toBe('untested');
  });

  it('records a successful connection test on the health badge', async () => {
    api.post.mockResolvedValue({ data: { ok: true, latency_ms: 210, message: '连通成功', reply: 'deepseek' } });
    renderPage();
    fireEvent.click(await screen.findByTestId('provider-card-3'));
    fireEvent.click(screen.getAllByRole('button', { name: /测试/ })[0]);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/models/3/test'));
    await waitFor(() => expect(screen.getByTestId('provider-health-3').getAttribute('data-status')).toBe('ok'));
    expect(screen.getAllByText('连通成功').length).toBeGreaterThan(0);
  });

  it('keeps a failed connection honest on the badge', async () => {
    api.post.mockResolvedValue({ data: { ok: false, latency_ms: 30, message: '连接被拒绝' } });
    renderPage();
    fireEvent.click(await screen.findByTestId('provider-card-3'));
    fireEvent.click(screen.getAllByRole('button', { name: /测试/ })[0]);

    await waitFor(() => expect(screen.getByTestId('provider-health-3').getAttribute('data-status')).toBe('error'));
    expect(screen.getAllByText('连接被拒绝').length).toBeGreaterThan(0);
  });

  it('folds disabled providers away and can reveal them again', async () => {
    renderPage();
    const toggle = await screen.findByRole('switch', { name: '启用 Kimi K2' });
    fireEvent.click(toggle);

    await waitFor(() => expect(screen.queryByTestId('provider-card-4')).toBeNull());
    expect(screen.getByTestId('provider-card-3')).toBeTruthy();

    fireEvent.click(screen.getByRole('switch', { name: '显示已停用' }));
    await waitFor(() => expect(screen.getByTestId('provider-card-4')).toBeTruthy());
    expect(screen.getAllByText('已停用').length).toBeGreaterThan(0);
  });

  it('filters the card list with the provider search box', async () => {
    renderPage();
    expect(await screen.findByTestId('provider-card-3')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('搜索供应商'), { target: { value: 'moonshot' } });
    await waitFor(() => expect(screen.queryByTestId('provider-card-3')).toBeNull());
    expect(screen.getByTestId('provider-card-4')).toBeTruthy();
  });

  it('puts protocol choices and configured providers before collapsed quick-fill presets', async () => {
    renderPage();
    await screen.findByTestId('provider-card-3');
    fireEvent.click(await screen.findByRole('button', { name: /新增模型/ }));
    expect(await screen.findByRole('dialog', { name: '新增模型' })).toBeTruthy();
    expect(screen.getByTestId('provider-preset-selector')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'OpenAI 兼容协议' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Anthropic 原生协议' })).toBeTruthy();
    const highlights = screen.getByTestId('configured-provider-highlights');
    expect(highlights.textContent).toContain('DeepSeek（OpenAI 兼容）');
    expect(highlights.textContent).toContain('月之暗面 Kimi（OpenAI 兼容）');
    expect(screen.queryByTestId('provider-preset-drawer')).toBeNull();
    expect(screen.queryByRole('button', { name: '阶跃星辰 StepFun（OpenAI 兼容）' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Anthropic 原生协议' }));
    expect(screen.getByDisplayValue('https://api.anthropic.com')).toBeTruthy();
    expect(screen.getByDisplayValue('claude-3-7-sonnet')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI 兼容协议' }));
    expect(screen.getByDisplayValue('https://api.openai.com/v1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '从常见厂商快速填入（可选）' }));
    fireEvent.click(screen.getByRole('button', { name: '阶跃星辰 StepFun（OpenAI 兼容）' }));
    expect(screen.getByDisplayValue('https://api.stepfun.com/v1')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('https://api.openai.com/v1'), { target: { value: 'https://custom.test/v1' } });
    fireEvent.click(screen.getByRole('button', { name: '其他 OpenAI 兼容接口' }));
    expect(screen.getByDisplayValue('https://custom.test/v1')).toBeTruthy();
  });
});
