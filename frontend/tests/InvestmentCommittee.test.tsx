// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import InvestmentCommittee, { type CommitteeMember } from '../src/components/InvestmentCommittee';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const baseMember: CommitteeMember = {
  key: 'value_investor',
  name: '价值投资官',
  role: 'value_investor',
  status: 'waiting',
};

function renderCommittee(members: CommitteeMember[] = [baseMember], props = {}) {
  return render(
    <LanguageProvider>
      <InvestmentCommittee topic="贵州茅台是否值得长期持有" members={members} {...props} />
    </LanguageProvider>,
  );
}

describe('InvestmentCommittee', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders the topic, member, and phase', () => {
    renderCommittee([baseMember], { phase: 'awaiting-confirmation' });

    expect(screen.getByRole('heading', { name: '贵州茅台是否值得长期持有' })).toBeTruthy();
    expect(screen.getByText('价值投资官')).toBeTruthy();
    expect(screen.getByText('等待确认')).toBeTruthy();
  });

  test('calls the agenda confirmation action when supplied', () => {
    const onConfirm = vi.fn();
    renderCommittee([baseMember], { phase: 'agenda-draft', onConfirm });

    fireEvent.click(screen.getByRole('button', { name: '确认开会' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('shows live text and a running marker', () => {
    renderCommittee([{ ...baseMember, status: 'running', streaming: { round: 1, content: '正在发言', status: 'running' } }]);

    expect(screen.getByRole('region', { name: '流式时间线' })).toBeTruthy();
    expect(screen.getByText('正在发言')).toBeTruthy();
    expect(screen.getByText('发言中')).toBeTruthy();
  });

  test('shows completed content with its round label', () => {
    renderCommittee([{ ...baseMember, status: 'completed', streaming: { round: 2, content: '最终结论', status: 'completed' } }]);

    expect(screen.getByText('最终结论')).toBeTruthy();
    expect(screen.getByText('第 2 轮')).toBeTruthy();
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);
  });

  test('shows a failed stream without discarding partial text', () => {
    renderCommittee([{ ...baseMember, status: 'failed', streaming: { round: 3, content: '已生成部分', status: 'failed' } }]);

    expect(screen.getByText('已生成部分')).toBeTruthy();
    expect(screen.getAllByText('失败').length).toBeGreaterThan(0);
  });

  test('does not render the live region for legacy members without streaming', () => {
    renderCommittee();

    expect(screen.queryByRole('region', { name: '流式时间线' })).toBeNull();
  });
});
