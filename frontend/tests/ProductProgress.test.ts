// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  markProductProgress,
  readProductProgress,
  setProductHelpDismissed,
  PRODUCT_PROGRESS_EVENT,
  PRODUCT_PROGRESS_KEY,
} from '../src/features/productProgress';

describe('local product progress', () => {
  beforeEach(() => localStorage.clear());

  test('stores only completion flags and notifies the current page', () => {
    const listener = vi.fn();
    window.addEventListener(PRODUCT_PROGRESS_EVENT, listener);

    markProductProgress('analysis');
    markProductProgress('backtest');

    expect(readProductProgress()).toEqual({ analysis: true, backtest: true, saved: false, helpDismissed: false });
    expect(JSON.parse(localStorage.getItem(PRODUCT_PROGRESS_KEY) || '{}')).toEqual({
      analysis: true,
      backtest: true,
      saved: false,
      helpDismissed: false,
    });
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(PRODUCT_PROGRESS_EVENT, listener);
  });

  test('recovers from invalid storage and allows help to be hidden and restored', () => {
    localStorage.setItem(PRODUCT_PROGRESS_KEY, '{bad json');
    expect(readProductProgress()).toEqual({ analysis: false, backtest: false, saved: false, helpDismissed: false });

    setProductHelpDismissed(true);
    expect(readProductProgress().helpDismissed).toBe(true);
    setProductHelpDismissed(false);
    expect(readProductProgress().helpDismissed).toBe(false);
  });
});
