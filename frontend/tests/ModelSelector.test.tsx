// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    expect(screen.getByRole('combobox', { name: '研究模式' })).toBeTruthy();
    expect((screen.getByRole('combobox', { name: '高级：覆盖模型' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('前往设置添加模型配置')).toBeTruthy();
  });

  it('updates research mode through the selector callback', async () => {
    render(<LanguageProvider><ModelSelector /></LanguageProvider>);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '研究模式' }));
    fireEvent.click(await screen.findByText('深度研究'));
    await waitFor(() => expect(useModelStore.getState().researchMode).toBe('deep'));
    expect(localStorage.getItem('finquant_research_mode')).toBe('deep');
  });
});
