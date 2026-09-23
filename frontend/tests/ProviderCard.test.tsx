// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProviderCard from '../src/components/models/ProviderCard';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import type { ModelConfig } from '../src/types';

const model: ModelConfig = {
  id: 3,
  name: 'DeepSeek V4 Flash',
  provider: 'deepseek',
  base_url: 'https://api.deepseek.com',
  model_name: 'deepseek-v4-flash',
  api_key_env: 'DEEPSEEK_API_KEY',
  has_api_key: true,
  credential_source: 'environment',
  temperature: 0.2,
  max_tokens: 4096,
  is_default: 0,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

function renderCard(overrides: Partial<React.ComponentProps<typeof ProviderCard>> = {}) {
  const props = {
    model,
    enabled: true,
    onEdit: vi.fn(),
    onTest: vi.fn(),
    onSetDefault: vi.fn(),
    onDelete: vi.fn(),
    onToggleEnabled: vi.fn(),
    ...overrides,
  };
  render(<LanguageProvider><ProviderCard {...props} /></LanguageProvider>);
  return props;
}

describe('ProviderCard', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  it('shows the CC Switch style information hierarchy', () => {
    renderCard();
    expect(screen.getByText('DeepSeek V4 Flash')).toBeTruthy();
    expect(screen.getByText('https://api.deepseek.com')).toBeTruthy();
    expect(screen.getByText('DeepSeek（OpenAI 兼容）')).toBeTruthy();
    expect(screen.getByText(/deepseek-v4-flash/)).toBeTruthy();
    expect(screen.getByText(/环境变量已载入：DEEPSEEK_API_KEY/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /设为默认/ })).toBeTruthy();
  });

  it('renders the untested state before any connection test', () => {
    renderCard();
    expect(screen.getByTestId('provider-health-3').getAttribute('data-status')).toBe('untested');
    expect(screen.getByText('未测试')).toBeTruthy();
  });

  it('renders a healthy state with the last check time', () => {
    renderCard({ entry: { status: 'ok', checkedAt: '2026-09-13T08:30:00.000Z', message: '连通成功', latencyMs: 210 } });
    expect(screen.getByTestId('provider-health-3').getAttribute('data-status')).toBe('ok');
    expect(screen.getByText('正常')).toBeTruthy();
    expect(screen.getByText(/最后检查：/)).toBeTruthy();
  });

  it('renders a failed state without pretending the provider is fine', () => {
    renderCard({ entry: { status: 'error', checkedAt: '2026-09-13T08:30:00.000Z', message: '连接被拒绝', latencyMs: null } });
    expect(screen.getByTestId('provider-health-3').getAttribute('data-status')).toBe('error');
    expect(screen.getByText('异常')).toBeTruthy();
  });

  it('toggles the local enable preference and marks disabled providers', () => {
    const props = renderCard({ enabled: false });
    expect(screen.getAllByText('已停用').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('switch', { name: '启用 DeepSeek V4 Flash' }));
    expect(props.onToggleEnabled).toHaveBeenCalledWith(true);
  });

  it('hides the default action for the current default provider', () => {
    renderCard({ model: { ...model, is_default: 1 } });
    expect(screen.queryByRole('button', { name: /设为默认/ })).toBeNull();
    expect(screen.getByText('默认')).toBeTruthy();
  });

  it('wires the edit, test and delete actions', () => {
    const props = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    expect(props.onEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /测试/ }));
    expect(props.onTest).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /删除/ }));
    fireEvent.click(screen.getByRole('button', { name: /OK|确\s*定/ }));
    expect(props.onDelete).toHaveBeenCalled();
  });
});
