// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import EntityHeader from '../src/components/EntityHeader';
import { LanguageProvider } from '../src/i18n/LanguageContext';

function renderHeader(overrides = {}) {
  const callbacks = { onWatch: vi.fn(), onMonitor: vi.fn(), onCompare: vi.fn() };
  render(
    <LanguageProvider>
      <EntityHeader name="贵州茅台" ticker="600519" market="A 股" industry="白酒" price="¥1,500" change="+1.2%" changeTone="up" asOf="2026-08-30" provider="Tencent" {...callbacks} {...overrides} />
    </LanguageProvider>,
  );
  return callbacks;
}

describe('EntityHeader', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders identity and market provenance', () => {
    renderHeader();

    expect(screen.getByRole('heading', { name: '贵州茅台' })).toBeTruthy();
    expect(screen.getByText('600519')).toBeTruthy();
    expect(screen.getByText('¥1,500')).toBeTruthy();
    expect(screen.getByText(/Tencent/)).toBeTruthy();
  });

  test('invokes all entity actions', () => {
    const callbacks = renderHeader();

    fireEvent.click(screen.getByRole('button', { name: /观察$/ }));
    fireEvent.click(screen.getByRole('button', { name: /监控$/ }));
    fireEvent.click(screen.getByRole('button', { name: /比较$/ }));
    expect(callbacks.onWatch).toHaveBeenCalledTimes(1);
    expect(callbacks.onMonitor).toHaveBeenCalledTimes(1);
    expect(callbacks.onCompare).toHaveBeenCalledTimes(1);
  });
});
