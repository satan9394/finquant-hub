// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import EvidenceRail from '../src/components/EvidenceRail';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const evidence = {
  id: 7,
  title: '年报原文',
  sourceType: 'PRIMARY',
  authority: '交易所',
  publisher: '上市公司',
  publishedAt: '2025-12-31',
  page: 12,
  excerpt: '经营现金流改善',
  url: 'https://example.test/report',
  confidence: 'HIGH',
  provider: 'exchange',
};

describe('EvidenceRail', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders evidence details and invokes add', () => {
    const onAdd = vi.fn();
    render(<LanguageProvider><EvidenceRail open evidence={evidence} onClose={vi.fn()} onAdd={onAdd} /></LanguageProvider>);

    expect(screen.getByText('#7 年报原文')).toBeTruthy();
    expect(screen.getByText('经营现金流改善')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '加入 Thesis' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test('shows the UNKNOWN empty state and closes from the drawer button', () => {
    const onClose = vi.fn();
    render(<LanguageProvider><EvidenceRail open evidence={null} onClose={onClose} /></LanguageProvider>);

    expect(screen.getByText('UNKNOWN')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
