// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import TodayUniverse from '../src/components/TodayUniverse';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('TodayUniverse', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders all four universe entry points with honest UNKNOWN values', () => {
    render(<LanguageProvider><TodayUniverse onOpen={vi.fn()} /></LanguageProvider>);

    expect(screen.getByRole('button', { name: /组合/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /观察池/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /IPO 观察/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /主题/ })).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN')).toHaveLength(4);
  });

  test('navigates to the selected universe path', () => {
    const onOpen = vi.fn();
    render(<LanguageProvider><TodayUniverse onOpen={onOpen} /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: /IPO 观察/ }));
    expect(onOpen).toHaveBeenCalledWith('/alerts?type=ipo');
  });
});
