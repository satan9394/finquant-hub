// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MonitorCard from '../src/components/MonitorCard';
import MonitorTypeChips, { MONITOR_TYPES } from '../src/components/MonitorTypeChips';
import ResearchRuns from '../src/components/ResearchRuns';
import TodayNeedAttention from '../src/components/TodayNeedAttention';
import TodayUniverse from '../src/components/TodayUniverse';

describe('Monitor and Today workspaces', () => {
  it('exposes all ten monitor types and keeps missing schedule fields unknown', () => {
    const onChange = vi.fn();
    const onRunNow = vi.fn();
    render(<><MonitorTypeChips selected="all" onChange={onChange} /><MonitorCard monitor={{ id: 1, name: '长鑫科技 IPO Watch', type: 'ipo', state: 'RUNNING', changes: 1, latestEvent: 'UNKNOWN' }} onRunNow={onRunNow} /></>);
    expect(MONITOR_TYPES).toHaveLength(10);
    expect(screen.getAllByText('IPO')).toHaveLength(2);
    expect(screen.getByText('产业链')).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(2);
    fireEvent.click(screen.getByText('基本面'));
    expect(onChange).toHaveBeenCalledWith('fundamental');
    fireEvent.click(screen.getByRole('button', { name: '立即运行' }));
    expect(onRunNow).toHaveBeenCalledOnce();
  }, 15_000);

  it('renders the Today hierarchy with real counts and unknown gaps', () => {
    render(<>
      <TodayNeedAttention attention={2} running={1} changes={1} events="UNKNOWN"><div>queue</div></TodayNeedAttention>
      <TodayUniverse onOpen={vi.fn()} />
      <ResearchRuns runs={[{ id: 1, title: '600519 Review', state: 'running', progress: null }]} />
    </>);
    expect(screen.getByText('需要处理')).toBeTruthy();
    expect(screen.getByText('My Universe · 我的对象')).toBeTruthy();
    expect(screen.getByText('Research Runs · 研究运行')).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(4);
  }, 15_000);
});
