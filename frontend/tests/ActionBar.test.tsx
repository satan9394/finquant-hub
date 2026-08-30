// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ActionBar from '../src/components/ActionBar';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('ActionBar', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders every configured action', () => {
    render(<LanguageProvider><ActionBar actions={[
      { key: 'save', label: '保存', primary: true, onClick: vi.fn() },
      { key: 'cancel', label: '取消', onClick: vi.fn() },
    ]} /></LanguageProvider>);

    expect(screen.getByRole('button', { name: /保\s*存/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /取\s*消/ })).toBeTruthy();
  });

  test('invokes the selected action callback', () => {
    const onClick = vi.fn();
    render(<LanguageProvider><ActionBar actions={[{ key: 'run', label: '运行', onClick }]} /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: /运\s*行/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('does not invoke a disabled action', () => {
    const onClick = vi.fn();
    render(<LanguageProvider><ActionBar actions={[{ key: 'delete', label: '删除', disabled: true, onClick }]} /></LanguageProvider>);

    const button = screen.getByRole('button', { name: /删\s*除/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
