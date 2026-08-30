// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import PortfolioWhy from '../src/components/PortfolioWhy';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('PortfolioWhy', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('shows the honest empty state without attribution data', () => {
    render(<LanguageProvider><PortfolioWhy summary={null} /></LanguageProvider>);

    expect(screen.getByText('没有可归因的真实组合数据')).toBeTruthy();
  });

  test('formats positive and negative group attribution values', () => {
    render(<LanguageProvider><PortfolioWhy summary={{
      total_invested: 300,
      total_current: 310,
      total_profit: 10,
      total_profit_percent: 3.33,
      group_summaries: [
        { group_id: 1, group_name: '核心仓', invested: 200, current: 220, profit: 20, profit_percent: 10 },
        { group_id: 2, group_name: '观察仓', invested: 100, current: 90, profit: -10, profit_percent: -10 },
      ],
    }} /></LanguageProvider>);

    expect(screen.getByText('核心仓')).toBeTruthy();
    expect(screen.getByText('+¥20.00')).toBeTruthy();
    expect(screen.getByText('¥-10.00')).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN')).toHaveLength(2);
  });
});
