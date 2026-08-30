// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import EvidenceChip from '../src/components/EvidenceChip';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const evidence = {
  id: 'ev-1',
  kind: 'FACT' as const,
  quality: 'OK' as const,
  title: '年报原文',
  detail: '经营现金流改善',
  source: '交易所公告',
  asOf: '2025-12-31',
};

describe('EvidenceChip', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('opens evidence details on click', async () => {
    render(<LanguageProvider><EvidenceChip evidence={evidence} label="已核验事实" /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: /已核验事实/ }));
    expect(await screen.findByText('经营现金流改善')).toBeTruthy();
  });

  test('opens from the keyboard and exposes non-OK quality', async () => {
    render(<LanguageProvider><EvidenceChip evidence={{ ...evidence, kind: 'UNKNOWN', quality: 'PARTIAL' }} /></LanguageProvider>);

    const chip = screen.getByRole('button', { name: /未知/ });
    expect(screen.getByLabelText('质量 PARTIAL')).toBeTruthy();
    fireEvent.keyDown(chip, { key: 'Enter' });
    expect(await screen.findByText('年报原文')).toBeTruthy();
  });
});
