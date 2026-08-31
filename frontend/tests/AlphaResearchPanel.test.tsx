// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlphaResearchPanel from '../src/components/alpha/AlphaResearchPanel';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({ fetchCatalog: vi.fn(), searchAlpha: vi.fn() }));
vi.mock('../src/services/alphaApi', () => ({
  fetchAlphaCatalog: mocks.fetchCatalog,
  searchAlpha: mocks.searchAlpha,
}));
vi.mock('../src/components/alpha/AlphaSimulationWorkbench', () => ({ default: () => <div data-testid="simulation-workbench" /> }));

const emptyCatalog = {
  categories: [], templates: [],
  catalogue: { mode: 'FINQUANT_STARTER', source: 'mock-catalogue', field_count: 0, data_status: 'PARTIAL' },
};

describe('AlphaResearchPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    mocks.fetchCatalog.mockReset().mockResolvedValue(emptyCatalog);
    mocks.searchAlpha.mockReset().mockResolvedValue([]);
  });

  it('loads the real catalogue contract and keeps an explicit empty state', async () => {
    render(<LanguageProvider><AlphaResearchPanel /></LanguageProvider>);

    expect(await screen.findByText('接口未返回类别或模板；不会用静态数据替代。')).toBeTruthy();
    expect(mocks.fetchCatalog).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/mock-catalogue/)).toBeTruthy();
  });

  it('searches through the mocked alpha API and renders returned evidence', async () => {
    mocks.searchAlpha.mockResolvedValue([{ type: 'wq_field', name: 'Operating Income', field: 'operating_income', desc: '营业利润' }]);
    render(<LanguageProvider><AlphaResearchPanel /></LanguageProvider>);
    await screen.findByText('接口未返回类别或模板；不会用静态数据替代。');

    fireEvent.change(screen.getByPlaceholderText(/operating_income/), { target: { value: 'income' } });
    fireEvent.click(screen.getByRole('button', { name: /检索/ }));

    await waitFor(() => expect(mocks.searchAlpha).toHaveBeenCalledWith('income'));
    expect(await screen.findByText('Operating Income')).toBeTruthy();
    expect(screen.getByText(/operating_income/)).toBeTruthy();
  });
});
