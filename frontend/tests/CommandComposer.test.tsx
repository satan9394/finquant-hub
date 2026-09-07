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

  test('renders as a follow-up bar carrying the current research object', () => {
    // BACKLOG-032 Step B：研究对象语境下的追问条——contextLabel 呈现当前对象，
    // 提交透传原问题（去向由调用方按对象拼装，App 层导航到 /research/:symbol?prompt=）。
    const onSubmit = vi.fn();
    render(<LanguageProvider><CommandComposer contextLabel="600519" onSubmit={onSubmit} /></LanguageProvider>);
    const input = screen.getByRole('textbox', { name: '就 600519 继续追问…（原问题会带进研究页）' });

    expect(screen.getByText('600519')).toBeTruthy();
    fireEvent.change(input, { target: { value: '现金流质量如何？' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });
    expect(onSubmit).toHaveBeenCalledWith('现金流质量如何？');
    expect((input as HTMLTextAreaElement).value).toBe('');
  });
});
