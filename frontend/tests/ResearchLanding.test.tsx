// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ResearchWorkspace from '../src/pages/ResearchWorkspace';

const researchApi = vi.hoisted(() => ({
  listResearchWorkspaces: vi.fn(),
  fetchResearchHistory: vi.fn(),
  fetchResearchTheses: vi.fn(),
  fetchResearchDiscussions: vi.fn(),
  fetchResearchReport: vi.fn(),
  searchInstruments: vi.fn(),
}));

vi.mock('../src/services/stockApi', () => ({ searchStocks: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/services/researchApi', () => researchApi);

describe('Research landing hierarchy', () => {
  beforeEach(() => {
    researchApi.listResearchWorkspaces.mockResolvedValue([]);
    researchApi.fetchResearchHistory.mockResolvedValue([]);
    researchApi.fetchResearchTheses.mockResolvedValue([]);
    researchApi.fetchResearchDiscussions.mockResolvedValue([]);
    researchApi.fetchResearchReport.mockResolvedValue(null);
    researchApi.searchInstruments.mockResolvedValue({ items: [] });
  });

  it('keeps the full activity timeline collapsed by default', async () => {
    render(<MemoryRouter><ResearchWorkspace /></MemoryRouter>);
    expect(await screen.findByText('最近研究')).toBeTruthy();
    const disclosure = screen.getByText(/完整研究活动与待办/).closest('div');
    expect(disclosure?.getAttribute('aria-expanded')).not.toBe('true');
  });
});

describe('Astra B6 — URL prompt is received by the default research page', () => {
  beforeEach(() => {
    researchApi.listResearchWorkspaces.mockResolvedValue([]);
    researchApi.fetchResearchHistory.mockResolvedValue([]);
    researchApi.fetchResearchTheses.mockResolvedValue([]);
    researchApi.fetchResearchDiscussions.mockResolvedValue([]);
    researchApi.fetchResearchReport.mockResolvedValue(null);
    researchApi.searchInstruments.mockResolvedValue({ items: [] });
  });

  it('prefills the search box with the prompt and auto-searches once', async () => {
    render(
      <MemoryRouter initialEntries={['/research?prompt=%E8%8C%85%E5%8F%B0']}>
        <ResearchWorkspace />
      </MemoryRouter>,
    );
    // 自动执行一次标的搜索（prompt 接住，不再丢在 URL）
    await waitFor(() => expect(researchApi.searchInstruments).toHaveBeenCalledTimes(1));
    expect(researchApi.searchInstruments).toHaveBeenCalledWith('茅台');
    // 原问题预填进默认研究页搜索框（可见，不丢弃）
    const searchInput = document.querySelector('.instrument-search input') as HTMLInputElement | null;
    await waitFor(() => expect(searchInput?.value).toBe('茅台'));
  });
});