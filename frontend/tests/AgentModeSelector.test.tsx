// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AgentModeSelector from '../src/components/AgentModeSelector';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('AgentModeSelector', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders all four research modes', () => {
    render(<LanguageProvider><AgentModeSelector value="fast" onChange={vi.fn()} /></LanguageProvider>);

    for (const label of ['快速', '分析师', '深度研究', '审查']) expect(screen.getByText(label)).toBeTruthy();
  });

  test('reports the selected mode', () => {
    const onChange = vi.fn();
    render(<LanguageProvider><AgentModeSelector value="fast" onChange={onChange} /></LanguageProvider>);

    fireEvent.click(screen.getByText('深度研究'));
    expect(onChange).toHaveBeenCalledWith('deep');
  });
});
