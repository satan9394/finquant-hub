// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommandBar from '../src/components/CommandBar';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

vi.mock('../src/components/GlobalTaskEntry', () => ({
  default: ({ onNavigate }: { onNavigate: (path: string) => void }) => (
    <button onClick={() => onNavigate('/research/600519')}>mock command</button>
  ),
}));

describe('CommandBar', () => {
  it('renders its hero variant and accessible current context', () => {
    const { container } = render(<LanguageProvider><CommandBar variant="hero" context="贵州茅台" onNavigate={() => undefined} /></LanguageProvider>);

    expect(container.querySelector('.command-bar--hero')).toBeTruthy();
    expect(screen.getByLabelText('当前上下文：贵州茅台')).toBeTruthy();
  });

  it('forwards navigation from the shared task entry', () => {
    const onNavigate = vi.fn();
    render(<LanguageProvider><CommandBar onNavigate={onNavigate} /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'mock command' }));
    expect(onNavigate).toHaveBeenCalledWith('/research/600519');
  });
});
