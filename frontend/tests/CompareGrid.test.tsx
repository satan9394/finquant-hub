// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CompareGrid, { type CompareRow } from '../src/components/CompareGrid';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const row: CompareRow = { key: 'roe', metric: 'ROE', left: '30%', right: '18%', source: 'annual-report' };

describe('CompareGrid', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders comparison headings and row values', () => {
    render(<LanguageProvider><CompareGrid leftName="贵州茅台" rightName="五粮液" rows={[row]} /></LanguageProvider>);

    for (const text of ['维度', '贵州茅台', '五粮液', 'ROE', '30%', '18%']) expect(screen.getByText(text)).toBeTruthy();
  });

  test('passes the selected row to the agent action', () => {
    const onAsk = vi.fn();
    render(<LanguageProvider><CompareGrid leftName="左" rightName="右" rows={[row]} onAsk={onAsk} /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: '询问 Agent' }));
    expect(onAsk).toHaveBeenCalledWith(row);
  });
});
