// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ResearchRuns from '../src/components/ResearchRuns';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

describe('ResearchRuns', () => {
  it('renders run state, progress, and timestamp', () => {
    render(<LanguageProvider><ResearchRuns runs={[{ id: 1, title: 'AAPL Review', state: 'done', progress: 100, updatedAt: '2026-08-30' }]} /></LanguageProvider>);

    expect(screen.getByText('AAPL Review')).toBeTruthy();
    expect(screen.getByText('done')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('2026-08-30')).toBeTruthy();
  });

  it('keeps empty runs explicit and unknown progress honest', () => {
    const { rerender } = render(<LanguageProvider><ResearchRuns runs={[]} /></LanguageProvider>);
    expect(screen.getByText('UNKNOWN')).toBeTruthy();

    rerender(<LanguageProvider><ResearchRuns runs={[{ id: 2, title: 'Pending', state: 'running', progress: null }]} /></LanguageProvider>);
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
  });
});
