// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import DiscoverSearch from '../src/components/DiscoverSearch';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('DiscoverSearch', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('reports edits and submits Enter without Shift', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<LanguageProvider><DiscoverSearch value="" loading={false} onChange={onChange} onSubmit={onSubmit} /></LanguageProvider>);

    const input = screen.getByLabelText('发现条件');
    fireEvent.change(input, { target: { value: '高 ROE' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });
    expect(onChange).toHaveBeenCalledWith('高 ROE');
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  test('reports filter toggles without auto-submitting', () => {
    const onApplyFilter = vi.fn();
    const onSubmit = vi.fn();
    render(<LanguageProvider><DiscoverSearch value="" loading={false} onChange={vi.fn()} onSubmit={onSubmit} onApplyFilter={onApplyFilter} /></LanguageProvider>);

    fireEvent.click(screen.getByText('ROE > 20%'));
    expect(onApplyFilter).toHaveBeenCalledWith('ROE > 20%', true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
