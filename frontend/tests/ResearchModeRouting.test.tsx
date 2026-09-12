// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ResearchWorkspace from '../src/pages/ResearchWorkspace';
import { addLocalWatchlistItem } from '../src/pages/StockAnalysis';
import { LanguageProvider } from '../src/i18n/LanguageContext';

vi.mock('../src/pages/Chat', () => ({
  default: ({ initialPrompt }: { initialPrompt?: string }) => <div data-testid="fast-capability">{initialPrompt || 'FAST'}</div>,
}));
vi.mock('../src/pages/Discussion', () => ({
  default: ({ initialTopic }: { initialTopic?: string }) => <div data-testid="review-capability">{initialTopic || 'REVIEW'}</div>,
}));
vi.mock('../src/pages/Research', () => ({
  default: ({ initialTicker }: { initialTicker?: string }) => <div data-testid="deep-capability">{initialTicker || 'DEEP'}</div>,
}));
vi.mock('../src/pages/Thesis', () => ({
  default: () => <div data-testid="thesis-capability">THESIS</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderMode(path: string) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/research" element={<><ResearchWorkspace /><LocationProbe /></>} />
          <Route path="/research/:symbol" element={<><ResearchWorkspace /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe('Research mode routing', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
  });

  it('loads the existing Fast, Deep, Review, and Thesis capabilities inside Research routes', () => {
    const fast = renderMode('/research?mode=fast&prompt=hello');
    expect(screen.getByTestId('fast-capability')).toBeTruthy();
    fast.unmount();

    const deep = renderMode('/research/600519?mode=deep');
    expect(screen.getByTestId('deep-capability').textContent).toBe('600519');
    deep.unmount();

    const review = renderMode('/research/600519?mode=review');
    expect(screen.getByTestId('review-capability').textContent).toContain('600519');
    review.unmount();

    renderMode('/research?mode=thesis');
    expect(screen.getByTestId('thesis-capability')).toBeTruthy();
  });

  it('adds an Entity to the shared local watchlist once and preserves malformed-storage recovery', () => {
    localStorage.setItem('finquant_watchlist', '{broken');
    expect(addLocalWatchlistItem('usAAPL', 'Apple')).toBe(true);
    expect(addLocalWatchlistItem('USAAPL', 'Apple')).toBe(false);
    expect(JSON.parse(localStorage.getItem('finquant_watchlist') || '[]')).toEqual([
      { code: 'usAAPL', name: 'Apple' },
    ]);
  });

  it('switches depth inside Research while keeping the company context', () => {
    renderMode('/research/600519?mode=fast');
    expect(screen.getByTestId('fast-capability').textContent).toContain('600519');
    fireEvent.click(screen.getByRole('radio', { name: '深度研究' }));
    expect(screen.getByTestId('deep-capability').textContent).toBe('600519');
    expect(screen.queryByTestId('fast-capability')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: '审查' }));
    expect(screen.getByTestId('review-capability').textContent).toContain('600519');
  });

  // VS16：切模式不得把"某一条记录"的深链 id 带到新模式（fast 带 session / review 带 room）。
  it('drops the fast-mode session deep link when switching depth', () => {
    renderMode('/research?mode=fast&session=7');
    expect(screen.getByTestId('location').textContent).toContain('session=7');

    fireEvent.click(screen.getByRole('radio', { name: '深度研究' }));
    expect(screen.getByTestId('location').textContent).toContain('mode=deep');
    expect(screen.getByTestId('location').textContent).not.toContain('session');

    fireEvent.click(screen.getByRole('radio', { name: '审查' }));
    expect(screen.getByTestId('location').textContent).toContain('mode=review');
    expect(screen.getByTestId('location').textContent).not.toContain('session');
  });

  it('drops the review-mode room deep link when switching depth', () => {
    renderMode('/research?mode=review&room=42');
    expect(screen.getByTestId('location').textContent).toContain('room=42');

    fireEvent.click(screen.getByRole('radio', { name: '快速' }));
    expect(screen.getByTestId('location').textContent).toContain('mode=fast');
    expect(screen.getByTestId('location').textContent).not.toContain('room');
  });
});
