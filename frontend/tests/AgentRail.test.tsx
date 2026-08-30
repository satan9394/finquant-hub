// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AgentRail from '../src/components/AgentRail';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('AgentRail', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('reflects its open state and calls close', () => {
    const onClose = vi.fn();
    const { container } = render(<LanguageProvider><AgentRail open onClose={onClose} /></LanguageProvider>);

    expect(container.querySelector('.agent-rail--open')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭 Agent Rail' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('exposes the four deterministic task tabs when closed', () => {
    const { container } = render(<LanguageProvider><AgentRail open={false} onClose={() => undefined} /></LanguageProvider>);

    expect(container.querySelector('.agent-rail--open')).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    fireEvent.click(screen.getByRole('tab', { name: '来源' }));
    expect(screen.getByRole('tab', { name: '来源' }).getAttribute('aria-selected')).toBe('true');
  });
});
