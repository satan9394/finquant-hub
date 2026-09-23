// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PortfolioOverview from '../src/components/PortfolioOverview';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

vi.mock('../src/components/PortfolioEvents', () => ({ default: () => <div>mock events</div> }));
vi.mock('../src/components/PortfolioWhy', () => ({ default: () => <div>mock attribution</div> }));

describe('PortfolioOverview', () => {
  it('keeps absent portfolio values and holdings explicitly UNKNOWN', () => {
    render(<LanguageProvider><PortfolioOverview summary={null} allocation={[]} holdings={[]} navigate={vi.fn()} /></LanguageProvider>);

    expect(screen.getByRole('region', { name: '组合决策工作台' })).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: '持仓' }));
    expect(screen.getByText('暂无真实持仓')).toBeTruthy();
  });

  it('routes a holding to its research workspace from the research tab', () => {
    const navigate = vi.fn();
    const holding = { id: 1, code: '600519', name: '贵州茅台', weight: 0.6 } as any;
    render(<LanguageProvider><PortfolioOverview summary={null} allocation={[]} holdings={[holding]} navigate={navigate} /></LanguageProvider>);

    fireEvent.click(screen.getByRole('tab', { name: '研究' }));
    fireEvent.click(screen.getByRole('button', { name: '研究 贵州茅台' }));
    expect(navigate).toHaveBeenCalledWith('/research/600519');
  });
});
