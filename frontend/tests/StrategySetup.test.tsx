// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import StrategySetup from '../src/components/strategy/StrategySetup';

describe('StrategySetup', () => {
  it('separates executable goals from the unavailable mean-reversion engine', () => {
    const onGoalChange = vi.fn();
    const onPresetChange = vi.fn();
    render(
      <StrategySetup
        goal="trend"
        preset="standard"
        onGoalChange={onGoalChange}
        onPresetChange={onPresetChange}
      />,
    );

    expect(screen.getByText('趋势跟随')).toBeTruthy();
    expect(screen.getByText('均值回归')).toBeTruthy();
    expect(screen.getByText('风险控制')).toBeTruthy();
    expect(screen.getByText(/当前没有均值回归引擎/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /选择均值回归/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(onGoalChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /选择风险控制/ }));
    expect(onGoalChange).toHaveBeenCalledWith('risk_control');
    expect(onPresetChange).toHaveBeenCalledWith('steady');
  });

  it('explains the purpose and tradeoff of every executable preset', () => {
    render(
      <StrategySetup goal="trend" preset="standard" onGoalChange={vi.fn()} onPresetChange={vi.fn()} />,
    );

    expect(screen.getByText(/减少换手/)).toBeTruthy();
    expect(screen.getByText(/平衡响应速度/)).toBeTruthy();
    expect(screen.getByText(/更快捕捉趋势/)).toBeTruthy();
    expect(screen.getAllByText(/主要取舍/)).toHaveLength(3);
  });
});
