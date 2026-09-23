// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import MetricStrip from '../src/components/MetricStrip';

describe('MetricStrip', () => {
  test('renders metric labels, values, and tone classes', () => {
    const { container } = render(<MetricStrip items={[
      { key: 'return', label: '收益率', value: '+8.2%', tone: 'up' },
      { key: 'pe', label: 'PE', value: 'UNKNOWN' },
    ]} />);

    expect(screen.getByText('收益率')).toBeTruthy();
    expect(screen.getByText('UNKNOWN')).toBeTruthy();
    expect(container.querySelector('.metric-strip__item--up')).toBeTruthy();
    expect(container.querySelector('.metric-strip__item--neutral')).toBeTruthy();
  });

  test('opens an evidence reference with its source number', () => {
    const onReference = vi.fn();
    render(<MetricStrip items={[{ key: 'roe', label: 'ROE', value: '30%', sourceRef: 2 }]} onReference={onReference} />);

    fireEvent.click(screen.getByRole('button', { name: '[2]' }));
    expect(onReference).toHaveBeenCalledWith(2);
  });
});
