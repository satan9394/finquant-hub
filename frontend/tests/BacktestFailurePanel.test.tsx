// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BacktestFailurePanel from '../src/components/strategy/BacktestFailurePanel';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

describe('BacktestFailurePanel', () => {
  it('classifies an unavailable market-data failure and preserves the raw error', () => {
    render(<LanguageProvider><BacktestFailurePanel error="无法获取 AAPL 的行情数据" /></LanguageProvider>);

    expect(screen.getByText('数据不可用')).toBeTruthy();
    expect(screen.getByText('无法获取 AAPL 的行情数据')).toBeTruthy();
  });

  it('uses the supplied title while exposing a parameter recovery action', () => {
    render(<LanguageProvider><BacktestFailurePanel error="short_window 必须小于 long_window" title="参数检查" /></LanguageProvider>);

    expect(screen.getByText('参数检查')).toBeTruthy();
    expect(screen.getByText('参数不合法')).toBeTruthy();
    expect(screen.getByText(/展开高级参数/)).toBeTruthy();
  });
});
