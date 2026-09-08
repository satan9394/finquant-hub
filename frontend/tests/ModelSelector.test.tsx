// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ModelSelector from '../src/components/ModelSelector';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { useModelStore } from '../src/store/modelStore';

describe('ModelSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    useModelStore.setState({ models: [], currentModelId: null, researchMode: 'fast' });
  });

  it('shows an explicit unconfigured advanced selector', () => {
    render(<LanguageProvider><ModelSelector /></LanguageProvider>);

    expect(screen.queryByRole('combobox', { name: '研究模式' })).toBeNull();
    expect((screen.getByRole('combobox', { name: '高级：覆盖模型', hidden: true }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('前往设置添加模型配置')).toBeTruthy();
  });

  it('does not expose a second research mode control in the global shell', () => {
    render(<LanguageProvider><ModelSelector /></LanguageProvider>);

    expect(screen.queryByText('深度研究')).toBeNull();
    expect(screen.queryByText('快速分析')).toBeNull();
    expect(localStorage.getItem('finquant_research_mode')).toBeNull();
  });
});
