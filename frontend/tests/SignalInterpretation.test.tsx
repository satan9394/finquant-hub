// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SignalInterpretation, { interpretSignals } from '../src/components/SignalInterpretation';

describe('SignalInterpretation', () => {
  it('localizes known codes and explains mixed directional evidence', () => {
    const signals = [
      { type: 'bullish' as const, label: 'golden_cross', description: 'DIF 上穿 DEA' },
      { type: 'bullish' as const, label: 'breakout_up', description: '突破 20 日高点' },
      { type: 'bearish' as const, label: 'rsi_overbought', description: 'RSI 高于 70' },
      { type: 'neutral' as const, label: 'volume_surge', description: '成交量放大' },
    ];

    expect(interpretSignals(signals)).toMatchObject({
      verdict: '偏强',
      horizon: '日线 · 短中期',
      hasConflict: true,
      bullish: 2,
      bearish: 1,
      neutral: 1,
    });

    render(<SignalInterpretation signals={signals} ready />);

    expect(screen.getByText('偏强')).toBeTruthy();
    expect(screen.getByText('多空信号并存')).toBeTruthy();
    expect(screen.getByText('MACD 金叉')).toBeTruthy();
    expect(screen.getByText('成交量显著放大')).toBeTruthy();
    expect(screen.queryByText(/golden_cross|volume_surge/)).toBeNull();
  });

  it('keeps absent and unknown signals conservative', () => {
    const { rerender } = render(<SignalInterpretation signals={[]} ready={false} />);
    expect(screen.getByText('尚未计算技术信号')).toBeTruthy();

    rerender(<SignalInterpretation signals={[{ type: 'neutral', label: 'new_signal' }]} ready />);
    expect(screen.getByText('中性')).toBeTruthy();
    expect(screen.getByText('未识别技术信号')).toBeTruthy();
    expect(screen.queryByText('new_signal')).toBeNull();
  });

  it('covers every signal code emitted by the current detector', () => {
    const codes = [
      'golden_cross', 'death_cross', 'top_divergence', 'bottom_divergence',
      'breakout_up', 'breakout_down', 'volume_surge', 'rsi_oversold', 'rsi_overbought',
    ];

    const { container } = render(
      <SignalInterpretation
        ready
        mode="evidence"
        signals={codes.map((label) => ({ type: 'neutral', label }))}
      />,
    );

    for (const code of codes) expect(container.textContent).not.toContain(code);
    expect(screen.queryByText('未识别技术信号')).toBeNull();
  });
});
