// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import ResearchTimeline from '../src/components/research/ResearchTimeline';
import { buildResearchTimeline } from '../src/features/researchTimeline';

describe('research timeline', () => {
  beforeEach(() => localStorage.clear());

  it('sorts and deduplicates real records while preserving persistence boundaries', () => {
    const entries = buildResearchTimeline(
      [{ id: 1, symbol: 'AAPL', name: 'Apple', notes: '', evidence: [] }],
      [{
        ticker: 'sh600519', run_count: 1, completed_count: 1, failed_count: 0,
        latest_at: '2026-08-02 10:00:00',
        runs: [{ id: 8, ticker: 'sh600519', status: 'completed', created_at: '2026-08-02 09:00:00', updated_at: '2026-08-02 10:00:00' }],
      }],
      [{ id: 7, ticker: '600519', title: '需求修复论文', status: 'open', drift_status: 'drifted', updated_at: '2026-08-03 08:00:00', source_report_id: 8 }],
      [
        { id: 'risk-1', portfolio: '测试组合', summary: '集中度高', createdAt: '2026-08-04T00:00:00Z', dueAt: '2026-08-11T00:00:00Z', completed: false },
        { id: 'risk-1', portfolio: '测试组合', summary: '重复记录', createdAt: '2026-08-04T00:00:00Z', dueAt: '2026-08-11T00:00:00Z', completed: false },
      ],
    );

    expect(entries.map((entry) => entry.id)).toEqual([
      'portfolio-review:risk-1', 'thesis:7', 'report:8', 'workspace:1',
    ]);
    expect(entries.at(-1)?.occurredAt).toBe('UNKNOWN');
    expect(entries[0].persistence).toBe('local');
    expect(entries[1].title).toBe('论文观点发生漂移');
  });

  it('renders source labels, unknowns, due dates, and original links without actions', () => {
    const entries = buildResearchTimeline(
      [{ id: 1, symbol: 'AAPL', name: 'Apple', notes: '', evidence: [], saved: true }],
      [],
      [],
      [{ id: 'risk-1', portfolio: '测试组合', summary: '集中度高', createdAt: '2026-08-04T00:00:00Z', dueAt: '2026-08-11T00:00:00Z', completed: false }],
    );
    render(<MemoryRouter><ResearchTimeline entries={entries} errors={[]} /></MemoryRouter>);

    expect(screen.getByText('只读聚合，不创建事件')).toBeTruthy();
    expect(screen.getByText('SERVER_PERSISTED')).toBeTruthy();
    expect(screen.getByText('LOCAL_DERIVED')).toBeTruthy();
    expect(screen.getByText(/发生\/保存：UNKNOWN/)).toBeTruthy();
    expect(screen.getByText(/到期：2026-08-11/)).toBeTruthy();
    const links = screen.getAllByRole('link', { name: '打开原记录' }).map((link) => link.getAttribute('href'));
    expect(links).toEqual(['/portfolio', '/research/AAPL']);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
