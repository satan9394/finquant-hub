// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import EvidenceCard from '../src/components/EvidenceCard';
import { LanguageProvider } from '../src/i18n/LanguageContext';

function renderCard(onAdd?: () => void) {
  return render(
    <LanguageProvider>
      <EvidenceCard evidence={{ id: 7, title: '2025 年报', sourceType: '年报', authority: '交易所', page: 42, excerpt: '现金流改善', url: 'https://example.com/report', provider: 'SSE' }} onAdd={onAdd} />
    </LanguageProvider>,
  );
}

describe('EvidenceCard', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders provenance fields and invokes the add action', () => {
    const onAdd = vi.fn();
    renderCard(onAdd);

    expect(screen.getByText('#7 2025 年报')).toBeTruthy();
    expect(screen.getByText('现金流改善')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '加入 Thesis' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test('disables unavailable actions and preserves UNKNOWN fields', () => {
    render(
      <LanguageProvider>
        <EvidenceCard evidence={{ id: 8, title: '缺失证据' }} />
      </LanguageProvider>,
    );

    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: '打开文档' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '加入 Thesis' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
