// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProviderPresetSelector from '../src/components/models/ProviderPresetSelector';
import { LanguageProvider } from '../src/i18n/LanguageContext';

function renderSelector(value?: string) {
  const onChange = vi.fn();
  render(<LanguageProvider><ProviderPresetSelector value={value} onChange={onChange} /></LanguageProvider>);
  return onChange;
}

describe('ProviderPresetSelector', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  it('groups presets by category and keeps custom available', () => {
    renderSelector();
    expect(screen.getByTestId('provider-preset-selector')).toBeTruthy();
    expect(screen.getByText('国内供应商')).toBeTruthy();
    expect(screen.getByText('国际供应商')).toBeTruthy();
    expect(screen.getByRole('button', { name: '其他 OpenAI 兼容接口' })).toBeTruthy();
  });

  it('reports the picked preset id', () => {
    const onChange = renderSelector('openai');
    fireEvent.click(screen.getByRole('button', { name: '硅基流动 SiliconFlow（OpenAI 兼容）' }));
    expect(onChange).toHaveBeenCalledWith('siliconflow');
    fireEvent.click(screen.getByRole('button', { name: '其他 OpenAI 兼容接口' }));
    expect(onChange).toHaveBeenCalledWith('custom');
  });

  it('filters presets by search text and shows an empty state', () => {
    renderSelector();
    const search = screen.getByPlaceholderText('搜索供应商预设');
    fireEvent.change(search, { target: { value: 'moonshot' } });
    expect(screen.getByRole('button', { name: '月之暗面 Kimi（OpenAI 兼容）' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cerebras（OpenAI 兼容）' })).toBeNull();

    fireEvent.change(search, { target: { value: 'no-such-provider' } });
    expect(screen.getByText('没有匹配的预设')).toBeTruthy();
  });

  it('keeps the manual-entry hint visible', () => {
    renderSelector();
    expect(screen.getByText(/选择预设会自动填入接口地址/)).toBeTruthy();
  });
});
