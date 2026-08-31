// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TimeseriesChart from '../src/components/TimeseriesChart';

localStorage.setItem('finquant_lang', 'zh');

describe('TimeseriesChart', () => {
  it('renders a titled chart slot with provider provenance', () => {
    render(<TimeseriesChart title="权益曲线" provider="sina" asOf="2026-08-30"><div>mock chart body</div></TimeseriesChart>);

    expect(screen.getByRole('heading', { name: '权益曲线' })).toBeTruthy();
    expect(screen.getByText('sina')).toBeTruthy();
    expect(screen.getByText('mock chart body')).toBeTruthy();
  });

  it('keeps a missing provider explicitly UNKNOWN', () => {
    render(<TimeseriesChart title="空序列" provider={null} asOf={null}><div>no points</div></TimeseriesChart>);

    expect(screen.getByText('UNKNOWN')).toBeTruthy();
    expect(screen.getByText('no points')).toBeTruthy();
  });
});
