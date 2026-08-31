// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FundamentalsSourcePanel from '../src/components/settings/FundamentalsSourcePanel';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: { get: mocks.get, patch: mocks.patch } }));

describe('FundamentalsSourcePanel', () => {
  beforeEach(() => {
    localStorage.setItem('finquant_lang', 'zh');
    mocks.get.mockReset().mockResolvedValue({ data: { priorities: { fundamentals: ['akshare', 'tushare', 'yahoo'] } } });
    mocks.patch.mockReset().mockResolvedValue({ data: {} });
  });

  it('loads the configured provider order into the form', async () => {
    render(<LanguageProvider><FundamentalsSourcePanel /></LanguageProvider>);

    expect(await screen.findByTestId('fundamentals-source-panel')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBe(3));
    expect(mocks.get).toHaveBeenCalledWith('/market/sources');
  });

  it('saves the visible provider order through the settings callback', async () => {
    render(<LanguageProvider><FundamentalsSourcePanel /></LanguageProvider>);
    await screen.findByRole('button', { name: /保存优先级/ });

    fireEvent.click(screen.getByRole('button', { name: /保存优先级/ }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/market/sources', {
      fundamentals: ['akshare', 'tushare', 'yahoo'],
    }));
  });
});
