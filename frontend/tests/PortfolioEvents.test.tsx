// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import PortfolioEvents from '../src/components/PortfolioEvents';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('PortfolioEvents', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('explains that the portfolio event feed is unavailable', () => {
    render(<LanguageProvider><PortfolioEvents /></LanguageProvider>);

    expect(screen.getByText('当前组合接口未提供公司行动、财报或宏观事件')).toBeTruthy();
  });

  test('renders an UNKNOWN timeline instead of fabricated events', () => {
    render(<LanguageProvider><PortfolioEvents /></LanguageProvider>);

    expect(screen.getAllByText('UNKNOWN')).toHaveLength(3);
  });
});
