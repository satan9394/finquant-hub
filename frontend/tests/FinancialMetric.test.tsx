// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import FinancialMetric from '../src/components/FinancialMetric';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('FinancialMetric', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders a sourced value with its unit and period', () => {
    render(<LanguageProvider><FinancialMetric label="ROIC" value={18.2} unit="%" period="TTM" asOf="2026-06-30" /></LanguageProvider>);

    expect(screen.getByText('ROIC')).toBeTruthy();
    expect(screen.getByText('18.2')).toBeTruthy();
    expect(screen.getByText('%')).toBeTruthy();
    expect(screen.getByText('TTM · 2026-06-30')).toBeTruthy();
  });

  test('shows UNKNOWN quality and its explanatory hint', async () => {
    render(<LanguageProvider><FinancialMetric label="现金流" value={null} quality="UNKNOWN" hint="上游未返回" /></LanguageProvider>);

    expect(screen.getByText('未知')).toBeTruthy();
    expect(screen.getByText('UNKNOWN')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByText('现金流'));
    expect(await screen.findByText('上游未返回')).toBeTruthy();
  });
});
