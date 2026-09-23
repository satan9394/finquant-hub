// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import EventTimeline from '../src/components/EventTimeline';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('EventTimeline', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders event title, time, and detail', () => {
    render(<LanguageProvider><EventTimeline events={[
      { key: 'done', title: '研究完成', time: '10:30', detail: '报告已生成', status: 'complete' },
      { key: 'pending', title: '等待复核', status: 'pending' },
    ]} /></LanguageProvider>);

    expect(screen.getByText('研究完成')).toBeTruthy();
    expect(screen.getByText('10:30')).toBeTruthy();
    expect(screen.getByText('报告已生成')).toBeTruthy();
    expect(screen.getByText('等待复核')).toBeTruthy();
  });

  test('shows an explicit UNKNOWN event for an empty timeline', () => {
    render(<LanguageProvider><EventTimeline events={[]} /></LanguageProvider>);

    expect(screen.getAllByText('UNKNOWN')).toHaveLength(3);
  });
});
