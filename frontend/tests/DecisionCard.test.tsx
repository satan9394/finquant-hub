// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import DecisionCard from '../src/components/DecisionCard';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('DecisionCard', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders decision context and honest unknown metadata', () => {
    render(<LanguageProvider><DecisionCard type="risk" title="估值风险" whyNow="估值分位上升" impact="高" /></LanguageProvider>);

    expect(screen.getByText('风险')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '估值风险' })).toBeTruthy();
    expect(screen.getByText('估值分位上升')).toBeTruthy();
    expect(screen.getAllByText(/UNKNOWN/).length).toBeGreaterThan(0);
  });

  test('invokes its explicit action', () => {
    const onAction = vi.fn();
    render(<LanguageProvider><DecisionCard title="复核" whyNow="出现新证据" actionLabel="查看详情" onAction={onAction} /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
