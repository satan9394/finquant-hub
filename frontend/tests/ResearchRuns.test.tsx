// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResearchRuns from '../src/components/ResearchRuns';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

describe('ResearchRuns', () => {
  it('renders run state, progress, and timestamp', () => {
    render(<LanguageProvider><ResearchRuns runs={[{ id: 1, title: 'AAPL Review', state: 'done', progress: 100, updatedAt: '2026-08-30' }]} onRetry={vi.fn()} /></LanguageProvider>);

    expect(screen.getByText('AAPL Review')).toBeTruthy();
    expect(screen.getByText('done')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('2026-08-30')).toBeTruthy();
  });

  it('keeps empty runs explicit and unknown progress honest', () => {
    const { rerender } = render(<LanguageProvider><ResearchRuns runs={[]} onRetry={vi.fn()} /></LanguageProvider>);
    expect(screen.getByText('UNKNOWN')).toBeTruthy();

    rerender(<LanguageProvider><ResearchRuns runs={[{ id: 2, title: 'Pending', state: 'running', progress: null }]} onRetry={vi.fn()} /></LanguageProvider>);
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
  });

  // ==================== VS22：读取失败不得伪装成"确实没有运行记录" ====================
  it('reports a read failure in place instead of the empty run list, with a working retry', () => {
    const retry = vi.fn();
    render(<LanguageProvider><ResearchRuns runs={[]} error="upstream down" onRetry={retry} /></LanguageProvider>);

    expect(screen.getByText('研究运行记录读取失败')).toBeTruthy();
    expect(screen.getByText('upstream down')).toBeTruthy();
    // 失败时连"空列表"占位都不许出现。
    expect(screen.queryByText('UNKNOWN')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('treats success as "error is null", never as "the error text is empty"', () => {
    const { rerender } = render(<LanguageProvider><ResearchRuns runs={[]} error={null} onRetry={vi.fn()} /></LanguageProvider>);
    expect(screen.getByText('UNKNOWN')).toBeTruthy();
    expect(screen.queryByText('研究运行记录读取失败')).toBeNull();

    // 底层错误可以没有 message（空串）——那仍是失败，不得据此渲染成"空"。
    rerender(<LanguageProvider><ResearchRuns runs={[]} error="" onRetry={vi.fn()} /></LanguageProvider>);
    expect(screen.getByText('研究运行记录读取失败')).toBeTruthy();
    expect(screen.queryByText('UNKNOWN')).toBeNull();
  });
});
