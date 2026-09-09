/* Provider card state: connection health + local enable/disable preference.
 *
 * Two independent concerns, both persisted locally (no backend column exists
 * and BACKLOG-043 is forbidden from adding one):
 *
 * 1. health — the result of the last "test connection" call against the
 *    existing `POST /api/models/{id}/test` endpoint. Three states:
 *    untested / ok / error, plus the last check time and the honest reason.
 * 2. enabled — a purely local UI preference: a disabled provider is folded away
 *    from the default card list (still reachable via "show disabled") and is
 *    never deleted. The UI copy states this, so the toggle never implies a
 *    backend routing change.
 */

const HEALTH_KEY = 'finquant_provider_health';
const DISABLED_KEY = 'finquant_provider_disabled';

/** Result of one connection test, keyed by model id. */
export interface ProviderHealthEntry {
  /** `ok` when the provider answered, `error` when the test failed honestly. */
  status: 'ok' | 'error';
  /** ISO timestamp of the check that produced this entry. */
  checkedAt: string;
  /** Human-readable reason straight from the backend (never invented). */
  message: string;
  latencyMs: number | null;
}

export type ProviderHealthStatus = 'untested' | 'ok' | 'error';

export type ProviderHealthMap = Record<string, ProviderHealthEntry>;

function storage(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}

function readJson<T>(key: string, fallback: T): T {
  const store = storage();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* Quota or private-mode failures must never break the page. */
  }
}

/** All stored health entries; corrupt payloads degrade to an empty map. */
export function readProviderHealth(): ProviderHealthMap {
  return readJson<ProviderHealthMap>(HEALTH_KEY, {});
}

/** Record one test result and return the updated map. */
export function recordProviderHealth(
  modelId: number,
  entry: ProviderHealthEntry,
  current: ProviderHealthMap = readProviderHealth(),
): ProviderHealthMap {
  const next = { ...current, [String(modelId)]: entry };
  writeJson(HEALTH_KEY, next);
  return next;
}

/** Drop a deleted provider's health entry. */
export function forgetProviderHealth(
  modelId: number,
  current: ProviderHealthMap = readProviderHealth(),
): ProviderHealthMap {
  const next = { ...current };
  delete next[String(modelId)];
  writeJson(HEALTH_KEY, next);
  return next;
}

/** Three-state badge status for one provider. */
export function healthStatusOf(entry: ProviderHealthEntry | undefined): ProviderHealthStatus {
  if (!entry) return 'untested';
  return entry.status === 'ok' ? 'ok' : 'error';
}

/** Locally disabled provider ids. */
export function readDisabledProviderIds(): number[] {
  const raw = readJson<unknown>(DISABLED_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

/** Toggle one provider's local enable state and return the new disabled id list. */
export function setProviderEnabled(
  modelId: number,
  enabled: boolean,
  current: number[] = readDisabledProviderIds(),
): number[] {
  const next = new Set(current);
  if (enabled) next.delete(modelId);
  else next.add(modelId);
  const list = [...next].sort((a, b) => a - b);
  writeJson(DISABLED_KEY, list);
  return list;
}

export function isProviderEnabled(modelId: number, disabled: number[]): boolean {
  return !disabled.includes(modelId);
}

/** Card list filter: hide locally disabled providers unless asked to show them. */
export function visibleProviders<T extends { id: number }>(
  models: T[],
  disabled: number[],
  showDisabled: boolean,
): T[] {
  if (showDisabled) return models;
  return models.filter((model) => !disabled.includes(model.id));
}

/** Card list search over name / provider / base URL (CC Switch ProviderList.tsx:309-318). */
export function filterProviders<T extends { name: string; provider: string; base_url: string }>(
  models: T[],
  query: string,
): T[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return models;
  return models.filter((model) =>
    [model.name, model.provider, model.base_url].some((field) => (field || '').toLowerCase().includes(keyword)),
  );
}

/** Compact "last checked" label; empty string when never checked. */
export function formatCheckedAt(checkedAt: string | undefined, locale: string): string {
  if (!checkedAt) return '';
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
