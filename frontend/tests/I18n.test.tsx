// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import LangSwitcher from '../src/components/LangSwitcher';
import { LanguageProvider, useLanguage } from '../src/i18n/LanguageContext';

function Probe() {
  const { t } = useLanguage();
  return <span>{t('nav.research')}</span>;
}

describe('language context', () => {
  beforeEach(() => localStorage.clear());

  it('switches immediately and persists the selected language', () => {
    localStorage.setItem('finquant_lang', 'zh');
    render(<LanguageProvider><Probe /><LangSwitcher /></LanguageProvider>);
    expect(screen.getByText('研究')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '切换到英文' }));
    expect(screen.getByText('Research')).toBeTruthy();
    expect(localStorage.getItem('finquant_lang')).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Chinese' }));
    expect(screen.getByText('研究')).toBeTruthy();
    expect(localStorage.getItem('finquant_lang')).toBe('zh');
  });
});
