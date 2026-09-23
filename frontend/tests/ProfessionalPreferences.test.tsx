// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProfessionalPreferencesPanel from '../src/components/settings/ProfessionalPreferencesPanel';
import { ProductMetricsPanel, ScheduledResearchLinkagePanel } from '../src/pages/Settings';
import {
  PROFESSIONAL_PREFERENCES_EVENT,
  PROFESSIONAL_PREFERENCES_KEY,
  readProfessionalPreferences,
  resetProfessionalPreferences,
  saveProfessionalPreferences,
} from '../src/features/professionalPreferences';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../src/services/api', () => ({
  default: { get: apiMocks.get, patch: apiMocks.patch, delete: apiMocks.delete },
}));

describe('professional preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMocks.get.mockReset(); apiMocks.patch.mockReset(); apiMocks.delete.mockReset();
  });

  it('falls back safely for corrupt, old, or invalid stored values', () => {
    localStorage.setItem(PROFESSIONAL_PREFERENCES_KEY, '{bad json');
    expect(readProfessionalPreferences().indicatorKeys).toEqual(['ma', 'macd', 'kdj', 'rsi']);

    localStorage.setItem(PROFESSIONAL_PREFERENCES_KEY, JSON.stringify({ version: 0, layoutDensity: 'compact' }));
    expect(readProfessionalPreferences().layoutDensity).toBe('comfortable');

    localStorage.setItem(PROFESSIONAL_PREFERENCES_KEY, JSON.stringify({
      version: 1, indicatorKeys: ['macd', 'unknown'], layoutDensity: 'huge', alphaTemplateId: '../secret',
    }));
    expect(readProfessionalPreferences()).toEqual({
      version: 1, indicatorKeys: ['macd'], layoutDensity: 'comfortable', alphaTemplateId: null,
    });
  });

  it('saves validated preferences, notifies the app, and resets to defaults', () => {
    const listener = vi.fn();
    window.addEventListener(PROFESSIONAL_PREFERENCES_EVENT, listener);
    saveProfessionalPreferences({ indicatorKeys: ['rsi', 'ma'], layoutDensity: 'compact', alphaTemplateId: 'price_reversal' });
    expect(readProfessionalPreferences()).toEqual({
      version: 1, indicatorKeys: ['ma', 'rsi'], layoutDensity: 'compact', alphaTemplateId: 'price_reversal',
    });
    expect(listener).toHaveBeenCalledTimes(1);

    resetProfessionalPreferences();
    expect(localStorage.getItem(PROFESSIONAL_PREFERENCES_KEY)).toBeNull();
    expect(readProfessionalPreferences().layoutDensity).toBe('comfortable');
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(PROFESSIONAL_PREFERENCES_EVENT, listener);
  });

  it('requires an explicit save and restores the current defaults', () => {
    render(<ProfessionalPreferencesPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'KDJ' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'RSI' }));
    fireEvent.click(screen.getByRole('radio', { name: '紧凑' }));
    expect(localStorage.getItem(PROFESSIONAL_PREFERENCES_KEY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '保存专业偏好' }));
    expect(readProfessionalPreferences().indicatorKeys).toEqual(['ma', 'macd']);
    expect(readProfessionalPreferences().layoutDensity).toBe('compact');

    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    expect(localStorage.getItem(PROFESSIONAL_PREFERENCES_KEY)).toBeNull();
    expect((screen.getByRole('radio', { name: '舒适（默认）' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('scheduled research linkage', () => {
  it('shows report, evidence, memory and retry linkage without inventing evidence', async () => {
    apiMocks.get.mockImplementation((path: string) => Promise.resolve(path.endsWith('/runs') ? { data: { items: [{
      id: 8, attempt: 2, retry_of_run_id: 7, report_id: 21, status: 'completed',
      evidence_status: 'UNKNOWN', evidence_ids: [], memory_record_ids: [31, 32], error: null,
      started_at: '2026-08-12 08:00:00', completed_at: '2026-08-12 08:01:00',
    }] } } : { data: { items: [{ id: 3, name: 'Apple daily', ticker: 'usAAPL', last_status: 'completed' }] } }));
    render(<ScheduledResearchLinkagePanel />);
    fireEvent.click(await screen.findByRole('button', { name: '运行历史' }));
    expect(await screen.findByText('#2 · 重试 7')).toBeTruthy();
    expect(screen.getByText('UNKNOWN')).toBeTruthy();
    expect(screen.getByText('报告 21 · evidence 0 · memory 2')).toBeTruthy();
  });

  it('keeps a durable error state', async () => {
    apiMocks.get.mockRejectedValue(new Error('run linkage unavailable'));
    render(<ScheduledResearchLinkagePanel />);
    await waitFor(() => expect(screen.getByText('run linkage unavailable')).toBeTruthy());
  });
});

describe('local product metrics', () => {
  beforeEach(() => {
    apiMocks.get.mockReset(); apiMocks.patch.mockReset(); apiMocks.delete.mockReset();
  });

  const enabledSummary = {
    enabled: true, retention_days: 90, events_total: 13,
    counts: { result_saved: 2, workflow_continued: 3, repeat_research: 4, repeat_research_within_7d: 1 },
    ttfv: { count: 10, median_ms: 5500, p90_ms: 9000, insufficient_sample: false },
  };

  it('shows the default disabled state and explicitly enables owner-local metrics', async () => {
    const disabled = {
      enabled: false, retention_days: 90, events_total: 0,
      counts: { result_saved: 0, workflow_continued: 0, repeat_research: 0, repeat_research_within_7d: 0 },
      ttfv: { count: 0, median_ms: null, p90_ms: null, insufficient_sample: true },
    };
    apiMocks.get.mockResolvedValue({ data: disabled });
    apiMocks.patch.mockResolvedValue({ data: { ...disabled, enabled: true } });
    render(<ProductMetricsPanel />);

    expect(await screen.findByText('指标已关闭，事件写入为零')).toBeTruthy();
    expect(screen.getByText(/不记录 ticker、对象 ID/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: '启用本地产品指标' }));
    await waitFor(() => expect(apiMocks.patch).toHaveBeenCalledWith(
      '/settings/product-metrics', { enabled: true },
    ));
  });

  it('shows aggregate-only data and clears the current user events', async () => {
    apiMocks.get
      .mockResolvedValueOnce({ data: enabledSummary })
      .mockResolvedValueOnce({ data: { ...enabledSummary, events_total: 0 } });
    apiMocks.delete.mockResolvedValue({ data: { deleted: 13 } });
    render(<ProductMetricsPanel />);

    expect(await screen.findByText('5,500')).toBeTruthy();
    expect(screen.getByText('13')).toBeTruthy();
    expect(screen.getByText(/不记录 ticker、对象 ID/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '清除本地指标' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认清除' }));
    await waitFor(() => expect(apiMocks.delete).toHaveBeenCalledWith('/settings/product-metrics/events'));
  });

  it('keeps the enabled-empty state explicit', async () => {
    apiMocks.get.mockResolvedValueOnce({ data: {
      ...enabledSummary, events_total: 0,
      ttfv: { count: 0, median_ms: null, p90_ms: null, insufficient_sample: true },
    } });
    render(<ProductMetricsPanel />);
    expect(await screen.findByText('尚无本地产品事件')).toBeTruthy();
  });

  it('keeps a durable load-error state', async () => {
    apiMocks.get.mockRejectedValue(new Error('local metrics unavailable'));
    render(<ProductMetricsPanel />);
    expect(await screen.findByText('local metrics unavailable')).toBeTruthy();
    expect(screen.getByText('本地产品指标不可用')).toBeTruthy();
  });
});
