// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CitationDetails, { type CitationStatus } from '../src/components/CitationDetails';

describe('CitationDetails', () => {
  it.each([
    ['OK', '数据正常'],
    ['PARTIAL', '部分证据'],
    ['UNKNOWN', 'UNKNOWN'],
    ['UPSTREAM_ERROR', '上游错误'],
  ] as [CitationStatus, string][])('renders %s without collapsing it into another state', (status, label) => {
    render(<CitationDetails status={status} />);
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it('reveals source and calculation lineage from a keyboard-operable summary', () => {
    render(
      <CitationDetails
        status="PARTIAL"
        source="yahoo.fundamentals_timeseries"
        vendor="yahoo"
        asOf="2026-06-30"
        periodType="TTM"
        currency="USD"
        adjustment="not_applicable"
        frequency="TTM"
        qualityFlags={['DELAY_UNKNOWN']}
        formula="ending_equity / initial_equity - 1"
        methodVersion="calculate-performance-v1"
        inputEvidenceIds={['ev_input_curve_0001']}
      />,
    );

    const summary = screen.getByText('查看来源/计算方法').closest('summary');
    expect(summary).toBeTruthy();
    fireEvent.click(summary!);
    expect(screen.getByText('yahoo.fundamentals_timeseries')).toBeTruthy();
    expect(screen.getByText('calculate-performance-v1')).toBeTruthy();
    expect(screen.getByText('ev_input_curve_0001')).toBeTruthy();
  });

  it('keeps missing lineage visibly UNKNOWN', () => {
    render(<CitationDetails status="UPSTREAM_ERROR" qualityFlags={['UPSTREAM_ERROR']} />);
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText('UPSTREAM_ERROR')).toBeTruthy();
  });
});
