// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GlobalTaskEntry from '../src/components/GlobalTaskEntry';
import { globalTaskPath } from '../src/features/globalTaskEntry';
import { searchStocks } from '../src/services/stockApi';

vi.mock('../src/services/stockApi', () => ({ searchStocks: vi.fn() }));
vi.mock('../src/services/researchApi', () => ({ listResearchWorkspaces: vi.fn().mockResolvedValue([]) }));

describe('global task entry', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(searchStocks).mockResolvedValue([
      { code: '600519', name: '贵州茅台', market: 'A股', type: 'stock' },
    ]);
  });

  it('builds prefill-only destinations without submitting work', () => {
    expect(globalTaskPath('analysis', { code: '600519', name: '贵州茅台' })).toBe('/analysis/600519?autorun=0');
    expect(globalTaskPath('backtest', { code: '600519', name: '贵州茅台' })).toBe('/strategy-lab/ma-crossover?symbol=600519');
    expect(globalTaskPath('portfolio', { code: '600519', name: '贵州茅台' })).toBe('/portfolio?code=600519&name=%E8%B4%B5%E5%B7%9E%E8%8C%85%E5%8F%B0');
    expect(globalTaskPath('question', null, '这家公司护城河如何？')).toBe('/chat?prompt=%E8%BF%99%E5%AE%B6%E5%85%AC%E5%8F%B8%E6%8A%A4%E5%9F%8E%E6%B2%B3%E5%A6%82%E4%BD%95%EF%BC%9F');
  });

  it('searches, selects a target, and navigates only after an explicit task click', async () => {
    const onNavigate = vi.fn();
    render(<GlobalTaskEntry onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: '打开全局标的与任务入口' }));
    expect(screen.getByText(/它们不是普通研究任务的前置步骤/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /模型|MCP|设置/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('标的代码、公司名称或问题'), { target: { value: '茅台' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索标的' }));

    fireEvent.click(await screen.findByRole('button', { name: '选择 贵州茅台 600519' }));
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '分析股票' }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/analysis/600519?autorun=0'));
  });
});
