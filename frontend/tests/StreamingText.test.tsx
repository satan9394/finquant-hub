// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import StreamingText from '../src/components/StreamingText';

describe('StreamingText', () => {
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  test('reveals content incrementally at the configured speed', () => {
    vi.useFakeTimers();
    render(<StreamingText content="ABC" speed={10} />);

    expect(screen.queryByText('ABC')).toBeNull();
    act(() => vi.advanceTimersByTime(10));
    expect(screen.getByText('A')).toBeTruthy();
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByText('ABC')).toBeTruthy();
  });

  test('resets when the incoming content becomes shorter', () => {
    vi.useFakeTimers();
    const { rerender } = render(<StreamingText content="LONG" speed={5} />);
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByText('LONG')).toBeTruthy();

    rerender(<StreamingText content="X" speed={5} />);
    act(() => vi.advanceTimersByTime(5));
    expect(screen.getByText('X')).toBeTruthy();
    expect(screen.queryByText('LONG')).toBeNull();
  });
});
