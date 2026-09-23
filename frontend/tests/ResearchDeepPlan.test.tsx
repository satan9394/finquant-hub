// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Research from '../src/pages/Research';
import apiClient from '../src/services/api';
import { LanguageProvider } from '../src/i18n/LanguageContext';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

describe('Deep Research plan', () => {
  beforeEach(() => {
    localStorage.setItem('finquant_lang', 'zh');
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [] } });
  });

  it('shows plan, progress boundary, sources, activity, and honest unsupported controls', async () => {
    render(<LanguageProvider><MemoryRouter><Research initialTicker="600519" /></MemoryRouter></LanguageProvider>);

    expect(screen.getByRole('textbox', { name: '输入股票代码，如 600519' })).toBeTruthy();
    expect(await screen.findByText('深度研究计划')).toBeTruthy();
    expect(screen.getAllByText('商业模式').length).toBeGreaterThan(0);
    expect(screen.getAllByText('投研主编').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
    expect(screen.getByText('等待开始')).toBeTruthy();
    expect((screen.getByRole('button', { name: /暂\s*停/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '调整范围' }) as HTMLButtonElement).disabled).toBe(true);
  }, 15_000);
});
