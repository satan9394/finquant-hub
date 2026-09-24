// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ContextBudgetBar, { estimateContextTokens } from '../src/components/ContextBudgetBar';
import ModelTelemetryBadge, { type LLMExecutionMetrics } from '../src/components/ModelTelemetryBadge';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const metrics: LLMExecutionMetrics = {
  model: 'claude-3-7-sonnet',
  ttft_ms: 48,
  speed_tps: 22.5,
  prompt_tokens: 1200,
  cached_tokens: 800,
  cache_hit_rate: 66.7,
  completion_tokens: 240,
  reasoning_tokens: 30,
  context_used: 1200,
};

describe('ModelTelemetryBadge', () => {
  it('gracefully renders nothing before metrics are available', () => {
    const { container } = render(<LanguageProvider><ModelTelemetryBadge /></LanguageProvider>);
    expect(container.firstChild).toBeNull();
  });

  it('shows compact measurements and expands to token and cache details', async () => {
    render(<LanguageProvider><ModelTelemetryBadge metrics={metrics} /></LanguageProvider>);

    expect(screen.getByText('claude-3-7-sonnet')).toBeTruthy();
    expect(screen.getByText(/22\.5 tok\/s/)).toBeTruthy();
    expect(screen.getByText(/48ms/)).toBeTruthy();
    expect(screen.getByText(/66\.7%/)).toBeTruthy();

    fireEvent.mouseEnter(screen.getByRole('button', { name: /claude-3-7-sonnet/i }));
    await waitFor(() => expect(screen.getByText('Prompt Token')).toBeTruthy());
    expect(screen.getAllByText('1,200').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/费用节省估算比例：约 60\.0%/).length).toBeGreaterThan(0);
  });

  it('estimates CJK and Latin draft tokens and exposes an accessible budget meter', () => {
    expect(estimateContextTokens('你好abcd')).toBe(3);
    render(<LanguageProvider><ContextBudgetBar value={'中'.repeat(120)} contextLimit={100} /></LanguageProvider>);
    const meter = screen.getByRole('progressbar', { name: '当前输入上下文预算估算' });
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-valuenow')).toBe('100');
    expect(meter.getAttribute('aria-valuetext')).toContain('预算偏高');
  });
});
