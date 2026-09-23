// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import TodayNeedAttention from '../src/components/TodayNeedAttention';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('TodayNeedAttention', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders each queue metric and the supplied work queue', () => {
    render(<LanguageProvider><TodayNeedAttention attention={2} running={1} changes={3} events={4}><div>待处理研究</div></TodayNeedAttention></LanguageProvider>);

    expect(screen.getByText('需要处理')).toBeTruthy();
    expect(screen.getByText('Agent 运行中')).toBeTruthy();
    expect(screen.getByText('新重大变化')).toBeTruthy();
    expect(screen.getByText('今日事件')).toBeTruthy();
    expect(screen.getByText('待处理研究')).toBeTruthy();
  });

  test('preserves UNKNOWN values instead of coercing them to zero', () => {
    render(<LanguageProvider><TodayNeedAttention attention="UNKNOWN" running="UNKNOWN" changes="UNKNOWN" events="UNKNOWN"><span>空队列</span></TodayNeedAttention></LanguageProvider>);

    expect(screen.getAllByText('UNKNOWN')).toHaveLength(4);
  });
});
