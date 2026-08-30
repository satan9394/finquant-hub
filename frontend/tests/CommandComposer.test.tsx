// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CommandComposer from '../src/components/CommandComposer';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('CommandComposer', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('ignores an empty submission', () => {
    const onSubmit = vi.fn();
    render(<LanguageProvider><CommandComposer onSubmit={onSubmit} /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: '发送到研究工作区' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('submits a trimmed prompt on Enter and clears the field', () => {
    const onSubmit = vi.fn();
    render(<LanguageProvider><CommandComposer onSubmit={onSubmit} /></LanguageProvider>);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '  核验现金流  ' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });
    expect(onSubmit).toHaveBeenCalledWith('核验现金流');
    expect((input as HTMLTextAreaElement).value).toBe('');
  });
});
