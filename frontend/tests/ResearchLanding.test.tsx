// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import ResearchWorkspace from '../src/pages/ResearchWorkspace';

vi.mock('../src/services/stockApi', () => ({ searchStocks: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/services/researchApi', () => ({ listResearchWorkspaces: vi.fn().mockResolvedValue([]), fetchResearchHistory: vi.fn().mockResolvedValue([]), fetchResearchTheses: vi.fn().mockResolvedValue([]), fetchResearchDiscussions: vi.fn().mockResolvedValue([]), fetchResearchReport: vi.fn().mockResolvedValue(null), searchInstruments: vi.fn().mockResolvedValue({ items: [] }) }));

describe('Research landing hierarchy', () => {
  it('keeps the full activity timeline collapsed by default', async () => {
    render(<MemoryRouter><ResearchWorkspace /></MemoryRouter>);
    expect(await screen.findByText('最近研究')).toBeTruthy();
    const disclosure = screen.getByText(/完整研究活动与待办/).closest('div');
    expect(disclosure?.getAttribute('aria-expanded')).not.toBe('true');
  });
});
