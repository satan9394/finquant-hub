// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { NavigateFunction } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DiscoverResults from '../src/components/DiscoverResults';
import DiscoverSearch from '../src/components/DiscoverSearch';
import PortfolioOverview from '../src/components/PortfolioOverview';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const renderInLanguage = (node: React.ReactNode) => render(<LanguageProvider>{node}</LanguageProvider>);

describe('Strategy, Discover, and Portfolio decision workspaces', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  it('exposes all five Discover follow-up actions without inventing values', () => {
    const navigate = vi.fn() as unknown as NavigateFunction;
    const onWatch = vi.fn();
    renderInLanguage(<DiscoverResults
      loading={false}
      navigate={navigate}
      onWatch={onWatch}
      items={[{ ticker: '600519', name: '贵州茅台', price: 1418, change_percent: 1.2, return_60d_pct: 4.8, signal: '动量偏强' }]}
    />);
    expect(screen.getByRole('button', { name: '研究' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '比较' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '加入观察池' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '创建监控' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '运行策略' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '加入观察池' }));
    expect(onWatch).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('applies Discover filter chips to the editable query without running automatically', () => {
    const onApplyFilter = vi.fn();
    const onSubmit = vi.fn();
    renderInLanguage(<DiscoverSearch value="" loading={false} onChange={vi.fn()} onSubmit={onSubmit} onApplyFilter={onApplyFilter} />);
    fireEvent.click(screen.getByText('ROE > 20%'));
    expect(onApplyFilter).toHaveBeenCalledWith('ROE > 20%', true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the eight Portfolio tabs and keeps unavailable daily data UNKNOWN', () => {
    const navigate = vi.fn() as unknown as NavigateFunction;
    renderInLanguage(<PortfolioOverview
      navigate={navigate}
      summary={{ total_invested: 100, total_current: 110, total_profit: 10, total_profit_percent: 10, group_summaries: [] }}
      allocation={[]}
      holdings={[]}
    />);
    for (const tab of ['概览', '持仓', '表现', '敞口', '风险', '事件', '情景', '研究']) {
      expect(screen.getByRole('tab', { name: tab })).toBeTruthy();
    }
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
  }, 15_000);

  it('opens a ticker-prefilled Thesis draft from Portfolio research actions', () => {
    const navigate = vi.fn() as unknown as NavigateFunction;
    renderInLanguage(<PortfolioOverview
      navigate={navigate}
      summary={null}
      allocation={[]}
      holdings={[{ id: 7, code: '600519', name: '贵州茅台', quantity: 1, cost_price: 100, current_price: 110, market_value: 110, profit: 10, profit_percent: 10, weight: 1 }]}
    />);
    fireEvent.click(screen.getByRole('tab', { name: '研究' }));
    fireEvent.click(screen.getByRole('button', { name: /论\s*文/ }));
    expect(navigate).toHaveBeenCalledWith('/research?mode=thesis&new=1&ticker=600519');
  }, 15_000);
});
