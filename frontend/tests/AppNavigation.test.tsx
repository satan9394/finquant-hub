// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMenuKey, isSystemToolPath, LegacyResearchRedirect, navigationGroups, SystemStatusIndicator } from '../src/App';
import { LanguageProvider } from '../src/i18n/LanguageContext';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('product navigation', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  it('separates ordinary product routes from system maintenance routes', () => {
    expect(navigationGroups.map((group) => group.name)).toEqual([
      '今日',
      '研究',
      '发现',
      '策略',
      '组合',
      '监控',
      '资料库',
      '设置',
    ]);

    const paths = navigationGroups.flatMap((group) => group.children.map((item) => item.path));

    expect(paths).toEqual(expect.arrayContaining(['/', '/research', '/discover', '/strategy-lab/ma-crossover', '/portfolio', '/alerts', '/knowledge', '/settings']));
    expect(paths).not.toEqual(expect.arrayContaining(['/chat', '/discussion', '/thesis', '/screening', '/alpha']));
    expect(new Set(paths).size).toBe(paths.length);
    expect(navigationGroups.find((group) => group.key === 'library')?.children.map((item) => item.path)).toEqual(['/knowledge']);
    expect(navigationGroups.find((group) => group.key === 'settings')?.children.map((item) => item.path)).toEqual(['/settings', '/models', '/mcp-market']);
    expect(isSystemToolPath('/models')).toBe(true);
    expect(isSystemToolPath('/settings/security')).toBe(true);
    expect(isSystemToolPath('/research')).toBe(false);
  });

  it('selects the owning navigation entry for dynamic routes', () => {
    expect(getMenuKey('/analysis/600519')).toBe('/research');
    expect(getMenuKey('/research/600519')).toBe('/research');
    expect(getMenuKey('/research/reports')).toBe('/research');
    expect(getMenuKey('/compare')).toBe('/research');
    expect(getMenuKey('/chat')).toBe('/research');
    expect(getMenuKey('/alpha')).toBe('/discover');
    expect(getMenuKey('/models')).toBe('/settings');
    expect(getMenuKey('/strategy-lab/ma-crossover')).toBe('/strategy-lab/ma-crossover');
  });

  it('preserves legacy-route query parameters when merging capabilities into Research', () => {
    render(
      <MemoryRouter initialEntries={['/thesis?id=7&ticker=AAPL']}>
        <Routes>
          <Route path="/thesis" element={<LegacyResearchRedirect mode="thesis" />} />
          <Route path="/research" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const location = screen.getByTestId('location').textContent || '';
    expect(location).toContain('/research?');
    expect(location).toContain('id=7');
    expect(location).toContain('ticker=AAPL');
    expect(location).toContain('mode=thesis');
  });

  it('does not claim the system is healthy before the health check succeeds', () => {
    const open = vi.fn();
    const { rerender } = render(<LanguageProvider><SystemStatusIndicator status="checking" onOpen={open} /></LanguageProvider>);
    expect(screen.getByRole('button', { name: /正在检查系统/ })).toBeTruthy();
    expect(screen.queryByText('系统正常')).toBeNull();

    rerender(<LanguageProvider><SystemStatusIndicator status="unavailable" onOpen={open} /></LanguageProvider>);
    expect(screen.getByRole('button', { name: /系统状态未知/ })).toBeTruthy();

    rerender(<LanguageProvider><SystemStatusIndicator status="ok" onOpen={open} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: /系统正常/ }));
    expect(open).toHaveBeenCalledOnce();
  });
});
