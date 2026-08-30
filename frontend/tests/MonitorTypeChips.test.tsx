// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MonitorTypeChips, { MONITOR_TYPES } from '../src/components/MonitorTypeChips';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('MonitorTypeChips', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders all ten types plus the all filter', () => {
    render(<LanguageProvider><MonitorTypeChips selected="all" onChange={vi.fn()} /></LanguageProvider>);

    expect(MONITOR_TYPES).toHaveLength(10);
    for (const label of ['全部', '价格', '技术', '基本面', 'IPO', '产业链', '定时研究']) expect(screen.getByText(label)).toBeTruthy();
  });

  test('reports the selected monitor type', () => {
    const onChange = vi.fn();
    render(<LanguageProvider><MonitorTypeChips selected="all" onChange={onChange} /></LanguageProvider>);

    fireEvent.click(screen.getByText('新闻'));
    expect(onChange).toHaveBeenCalledWith('news');
  });
});
