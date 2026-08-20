// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LatestNews from '../src/components/LatestNews';

describe('LatestNews', () => {
  it('renders provenance and safe external links for normalized items', () => {
    render(<LatestNews data={{ queried_at: '2026-08-20T08:00:00Z', as_of: '2026-08-20T08:00:00Z', providers_attempted: ['google_news'], providers_used: ['google_news'], errors: {}, data_status: 'OK', news: [{ title: '市场快讯', source: '公开来源', published_at: '2026-08-20', url: 'https://example.test/news', snippet: '摘要', provider: 'google_news' }] }} />);
    expect(screen.getByText('市场快讯')).toBeTruthy();
    expect(screen.getByText('google_news')).toBeTruthy();
    expect(screen.getByRole('link', { name: '市场快讯' }).getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('link', { name: '市场快讯' }).getAttribute('rel')).toContain('noreferrer');
  });

  it('does not invent items for an upstream error', () => {
    render(<LatestNews data={{ queried_at: '2026-08-20T08:00:00Z', as_of: '2026-08-20T08:00:00Z', providers_attempted: ['google_news'], providers_used: [], errors: { google_news: 'HTTPStatusError' }, data_status: 'UPSTREAM_ERROR', news: [] }} />);
    expect(screen.getByText('UPSTREAM_ERROR')).toBeTruthy();
    expect(screen.getByText(/没有可展示的最新消息/)).toBeTruthy();
  });
});
