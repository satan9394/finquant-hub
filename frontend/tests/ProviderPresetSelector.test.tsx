// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProviderPresetSelector from '../src/components/models/ProviderPresetSelector';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import type { ModelConfig } from '../src/types';

function renderSelector(value?: string, configuredProviders: ModelConfig[] = []) {
  const onChange = vi.fn();
  render(<LanguageProvider><ProviderPresetSelector value={value} onChange={onChange} configuredProviders={configuredProviders} /></LanguageProvider>);
  return onChange;
}

describe('ProviderPresetSelector', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  it('puts protocol selection first and keeps public presets collapsed', () => {
    renderSelector();
    expect(screen.getByTestId('provider-preset-selector')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'OpenAI 兼容协议' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Anthropic 原生协议' })).toBeTruthy();
    expect(screen.queryByTestId('provider-preset-drawer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'DeepSeek（OpenAI 兼容）' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '从常见厂商快速填入（可选）' }));
    expect(screen.getByTestId('provider-preset-drawer')).toBeTruthy();
    expect(screen.getByText('国内供应商')).toBeTruthy();
    expect(screen.getByRole('button', { name: '其他 OpenAI 兼容接口' })).toBeTruthy();
  });

  it('switches to the native Anthropic protocol', () => {
    const onChange = renderSelector('openai');
    fireEvent.click(screen.getByRole('radio', { name: 'Anthropic 原生协议' }));
    expect(onChange).toHaveBeenCalledWith('anthropic');
  });

  it('filters preset choices by protocol and reports the picked preset id', () => {
    const anthropicChange = renderSelector('anthropic');
    fireEvent.click(screen.getByRole('button', { name: '从常见厂商快速填入（可选）' }));
    expect(screen.getByRole('button', { name: 'Anthropic Claude（原生 Messages）' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'DeepSeek（OpenAI 兼容）' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Anthropic Claude（原生 Messages）' }));
    expect(anthropicChange).toHaveBeenCalledWith('anthropic');
  });

  it('reports the picked OpenAI preset and preserves manual-entry selection', () => {
    const openAIChange = renderSelector('openai');
    fireEvent.click(screen.getByRole('button', { name: '从常见厂商快速填入（可选）' }));
    fireEvent.click(screen.getByRole('button', { name: '硅基流动 SiliconFlow（OpenAI 兼容）' }));
    expect(openAIChange).toHaveBeenCalledWith('siliconflow');
    fireEvent.click(screen.getByRole('button', { name: '其他 OpenAI 兼容接口' }));
    expect(openAIChange).toHaveBeenCalledWith('custom');
  });

  it('filters presets by search text and shows an empty state', () => {
    renderSelector();
    fireEvent.click(screen.getByRole('button', { name: '从常见厂商快速填入（可选）' }));
    const search = screen.getByPlaceholderText('搜索供应商预设');
    fireEvent.change(search, { target: { value: 'moonshot' } });
    expect(screen.getByRole('button', { name: '月之暗面 Kimi（OpenAI 兼容）' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cerebras（OpenAI 兼容）' })).toBeNull();

    fireEvent.change(search, { target: { value: 'no-such-provider' } });
    expect(screen.getByText('没有匹配的预设')).toBeTruthy();
  });

  it('keeps the manual-entry hint visible', () => {
    renderSelector();
    fireEvent.click(screen.getByRole('button', { name: '从常见厂商快速填入（可选）' }));
    expect(screen.getByText(/选择预设会自动填入接口地址/)).toBeTruthy();
  });

  it('highlights only user-configured providers above the collapsed public presets', () => {
    const provider = {
      id: 1,
      name: 'CommandCode model',
      provider: 'commandcode',
      base_url: 'https://private.commandcode.test/v1',
      model_name: 'deepseek/deepseek-v4.1-flash',
      api_key_env: null,
      has_api_key: true,
      credential_source: 'stored',
      temperature: 0.7,
      max_tokens: 4096,
      is_default: 1,
      created_at: '2026-09-25T00:00:00Z',
      updated_at: '2026-09-25T00:00:00Z',
    } satisfies ModelConfig;
    renderSelector('commandcode', [provider]);
    const highlights = screen.getByTestId('configured-provider-highlights');
    expect(highlights.textContent).toContain('CommandCode AI（OpenAI 兼容）');
    expect(highlights.textContent).toContain('API 密钥不会显示');
    expect(screen.queryByRole('button', { name: 'DeepSeek（OpenAI 兼容）' })).toBeNull();
  });
});
