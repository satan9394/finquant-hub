// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import TodayMarketPulse from '../src/components/TodayMarketPulse';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('TodayMarketPulse', () => {
  test('renders the Chinese heading and supplied market content', () => {
    localStorage.setItem('finquant_lang', 'zh');
    render(<LanguageProvider><TodayMarketPulse><div>沪深 300 +1.2%</div></TodayMarketPulse></LanguageProvider>);

    expect(screen.getByRole('heading', { name: '市场脉搏' })).toBeTruthy();
    expect(screen.getByText('沪深 300 +1.2%')).toBeTruthy();
  });

  test('respects the persisted English language', () => {
    localStorage.setItem('finquant_lang', 'en');
    render(<LanguageProvider><TodayMarketPulse><span>Market data</span></TodayMarketPulse></LanguageProvider>);

    expect(screen.getByRole('heading', { name: 'Market Pulse' })).toBeTruthy();
  });
});
