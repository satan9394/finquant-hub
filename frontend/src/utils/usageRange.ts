/**
 * Range selection for the usage detail module (BACKLOG-045).
 *
 * Presets deliberately go through the backend's legacy `days` window (so the
 * "last N days" semantics stay exactly what they always were, in UTC), while a
 * custom range pins explicit inclusive UTC dates. Nothing here guesses a date:
 * an invalid or inverted range is rejected instead of silently corrected.
 */

import type { UsageRangeParams } from '../services/usageApi';

export const RANGE_PRESETS = [7, 30, 90] as const;

export type UsageRangePreset = (typeof RANGE_PRESETS)[number];

export interface UsageRange {
  kind: 'preset' | 'custom';
  /** Present when `kind === 'preset'`. */
  days?: UsageRangePreset;
  /** Inclusive UTC dates, present when `kind === 'custom'`. */
  start?: string;
  end?: string;
}

export const DEFAULT_USAGE_RANGE: UsageRange = { kind: 'preset', days: 30 };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a real calendar date in `YYYY-MM-DD` form. */
export function isValidUsageDate(value: string | undefined | null): boolean {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Validate a custom range without touching the network.
 * Returns an i18n key for the honest reason, or null when the range is usable.
 */
export function usageRangeError(range: UsageRange): string | null {
  if (range.kind !== 'custom') return null;
  if (!isValidUsageDate(range.start) || !isValidUsageDate(range.end)) {
    return 'settings.usage.range.invalidDate';
  }
  if (range.start! > range.end!) return 'settings.usage.range.invalidOrder';
  return null;
}

/** Request parameters for the backend: presets use `days`, custom uses start/end. */
export function usageRangeParams(range: UsageRange): UsageRangeParams {
  if (range.kind === 'custom') {
    return { start: range.start, end: range.end };
  }
  return { days: range.days ?? DEFAULT_USAGE_RANGE.days };
}

/** Days covered by a custom range, or the preset length; null when unusable. */
export function usageRangeDays(range: UsageRange): number | null {
  if (range.kind !== 'custom') return range.days ?? null;
  if (usageRangeError(range)) return null;
  const start = Date.parse(`${range.start}T00:00:00Z`);
  const end = Date.parse(`${range.end}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Label for the picker trigger; a custom range shows the exact dates queried. */
export function usageRangeLabel(
  range: UsageRange,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (range.kind === 'custom') {
    return t('settings.usage.range.customLabel', { start: range.start ?? '', end: range.end ?? '' });
  }
  const days = range.days ?? 30;
  return t('settings.usage.range.presetLabel', { days });
}
