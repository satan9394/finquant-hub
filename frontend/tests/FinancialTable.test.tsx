// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import FinancialTable from '../src/components/FinancialTable';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('FinancialTable', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders financial rows and column metadata', () => {
    render(<LanguageProvider><FinancialTable rows={[
      { key: 'revenue', metric: 'Revenue', value: '¥12.50B', period: 'FY2025', source: 'Annual report' },
    ]} /></LanguageProvider>);

    expect(screen.getByRole('columnheader', { name: 'Metric' })).toBeTruthy();
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('¥12.50B')).toBeTruthy();
    expect(screen.getByText('Annual report')).toBeTruthy();
  });

  test('preserves UNKNOWN for missing period and source', () => {
    render(<LanguageProvider><FinancialTable rows={[{ key: 'roe', metric: 'ROE', value: '18.2%' }]} /></LanguageProvider>);

    expect(screen.getAllByText('UNKNOWN')).toHaveLength(2);
  });
});
