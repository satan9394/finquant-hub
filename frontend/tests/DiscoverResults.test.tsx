// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { NavigateFunction } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import DiscoverResults from '../src/components/DiscoverResults';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const item = { ticker: '600519', name: '贵州茅台', price: 1418, change_percent: 1.2, return_60d_pct: -4.8, signal: '动量偏强' };

describe('DiscoverResults', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders the explicit empty contract', () => {
    render(<LanguageProvider><DiscoverResults items={[]} loading={false} navigate={vi.fn() as unknown as NavigateFunction} onWatch={vi.fn()} /></LanguageProvider>);

    expect(screen.getByText('没有可验证的股票结果；请输入明确代码后再试')).toBeTruthy();
  });

  test('renders sourced values and dispatches follow-up actions', () => {
    const navigate = vi.fn() as unknown as NavigateFunction;
    const onWatch = vi.fn();
    render(<LanguageProvider><DiscoverResults items={[item]} loading={false} navigate={navigate} onWatch={onWatch} /></LanguageProvider>);

    expect(screen.getByText('1418.00')).toBeTruthy();
    expect(screen.getByText('-4.80%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '研究' }));
    fireEvent.click(screen.getByRole('button', { name: '加入观察池' }));
    expect(navigate).toHaveBeenCalledWith('/research/600519');
    expect(onWatch).toHaveBeenCalledWith(item);
  });
});
