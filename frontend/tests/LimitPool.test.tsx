// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../src/i18n/LanguageContext';
import LimitPool from '../src/pages/LimitPool';

const api = vi.hoisted(() => ({ fetchLimitPool: vi.fn() }));
vi.mock('../src/services/researchApi', () => api);

function ResearchLocation() {
  return <div data-testid="research-location">{useLocation().pathname}</div>;
}

function renderPool() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/discover/limit-pool']}>
        <Routes>
          <Route path="/discover/limit-pool" element={<LimitPool />} />
          <Route path="/research/:symbol" element={<ResearchLocation />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe('LimitPool research links', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
    api.fetchLimitPool.mockResolvedValue({
      date: '20260831', pool: 'limit_up', source: 'eastmoney.push2ex', quality: 'DIRECT',
      items: [{
        code: '600519', name: '贵州茅台', limit_up_count: 2, seal_amount: 12_345_678,
        break_times: 1, industry: '白酒', limit_stat: '3天2板',
      }],
    });
  });

  it('renders codes, names and formatted seal amounts with a research hint', async () => {
    renderPool();

    expect(await screen.findByRole('cell', { name: '600519' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '贵州茅台' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '1,234.57 万元' })).toBeTruthy();
    expect(within(screen.getByRole('columnheader', { name: '代码' })).getByTitle('点击打开研究工作区')).toBeTruthy();
  });

  it('navigates to the stock research workspace when its code link is clicked', async () => {
    renderPool();

    const link = await screen.findByRole('link', { name: '600519' });
    expect(link.getAttribute('href')).toBe('/research/600519');
    fireEvent.click(link);

    expect(screen.getByTestId('research-location').textContent).toBe('/research/600519');
  });
});
