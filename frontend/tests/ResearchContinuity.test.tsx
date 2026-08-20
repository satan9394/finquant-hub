// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import ResearchContinuity from '../src/components/research/ResearchContinuity';
import { compareReportViewpoints, tickerKey } from '../src/features/researchContinuity';

const reports = [
  {
    id: 12, ticker: 'sh600519', status: 'completed' as const, created_at: '2026-08-02 10:00:00',
    report_data: { executive_summary: '中性偏多', source: 'https://example.com/a' },
  },
  {
    id: 11, ticker: 'sh600519', status: 'completed' as const, created_at: '2026-08-01 10:00:00',
    report_data: { executive_summary: '中性偏空' },
  },
];

describe('research continuity', () => {
  it('matches external and canonical ticker forms and compares stored text only', () => {
    expect(tickerKey('600519')).toBe(tickerKey('sh600519'));
    expect(tickerKey('00700.HK')).toBe(tickerKey('hk00700'));
    expect(tickerKey('AAPL')).toBe(tickerKey('usAAPL'));
    expect(compareReportViewpoints(reports)).toBe('最新两版核心结论文本有变化，请逐版核对差异');
  });

  it('shows persisted versions, discussion disagreement, thesis checks, and schema limits', () => {
    render(
      <MemoryRouter>
        <ResearchContinuity
          symbol="600519"
          currentAsOf="2026-08-07"
          savedAsOf="2026-08-01"
          workspaceUpdatedAt="2026-08-01 12:00:00"
          notes="关注批价与需求"
          reports={reports}
          discussions={[{
            id: 3,
            topic: '600519 贵州茅台是否值得关注',
            current_phase: 'done',
            created_at: '2026-08-01 09:00:00',
            summary: '核心共识：估值下降。主要分歧：需求何时企稳。',
          }]}
          theses={[{
            id: 7,
            ticker: '600519',
            title: '需求修复论文',
            status: 'open',
            drift_status: 'drifted',
            updated_at: '2026-08-03 08:00:00',
            source_report_id: 11,
          }]}
          errors={[]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('数据已刷新：2026-08-01 → 2026-08-07')).toBeTruthy();
    expect(screen.getByText('最新两版核心结论文本有变化，请逐版核对差异')).toBeTruthy();
    expect(screen.getByText('核心共识：估值下降。主要分歧：需求何时企稳。')).toBeTruthy();
    expect(screen.getByText('需求修复论文')).toBeTruthy();
    expect(screen.getByText('发生漂移')).toBeTruthy();
    expect(screen.getByText(/当前 schema 仅保留最新笔记/)).toBeTruthy();
    expect(screen.getByText('可点击引用 1')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: '查看版本' })[0].getAttribute('href')).toBe('/research/reports?symbol=600519&report=12');
    expect(screen.getByRole('link', { name: '打开讨论' }).getAttribute('href')).toBe('/discussion?room=3');
    expect(screen.getByRole('link', { name: '查看论文' }).getAttribute('href')).toBe('/thesis?id=7');
    expect(screen.getByRole('link', { name: '设置预警' }).getAttribute('href')).toContain('/alerts?new=1');
    expect(screen.getAllByRole('link', { name: '创建论文' })[0].getAttribute('href')).toBe('/research/reports?symbol=600519&report=12');
  });
});
