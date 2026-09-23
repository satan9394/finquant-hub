// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import LangSwitcher from '../src/components/LangSwitcher';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('LangSwitcher', () => {
  beforeEach(() => localStorage.clear());

  test('switches Chinese to English and persists it', () => {
    localStorage.setItem('finquant_lang', 'zh');
    render(<LanguageProvider><LangSwitcher /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: '切换到英文' }));
    expect(screen.getByRole('button', { name: 'Switch to Chinese' })).toBeTruthy();
    expect(localStorage.getItem('finquant_lang')).toBe('en');
  });

  test('switches English to Chinese and updates the document language', () => {
    localStorage.setItem('finquant_lang', 'en');
    render(<LanguageProvider><LangSwitcher /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Chinese' }));
    expect(screen.getByRole('button', { name: '切换到英文' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
