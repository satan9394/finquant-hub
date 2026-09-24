/**
 * Pure derivations behind the usage hero card and the dimension stats table
 * (BACKLOG-045). Everything here is honest by construction: missing prices stay
 * missing, a zero denominator yields "no share" instead of a fabricated 0%, and
 * unknown costs never sort as if they were the cheapest.
 */

import type {
  UsageCostResponse,
  UsageCostStatus,
  UsageStatsItem,
  UsageStatsResponse,
  UsageSummaryResponse,
  UsageEfficiency,
} from '../services/usageApi';

export interface UsageHeroData {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
  windowDays: number;
  /** Mean tokens per day in the window; null when the window is empty. */
  dailyAverageTokens: number | null;
  /** Most-used model of the window, by tokens; null when there is no usage. */
  topModelKey: string | null;
  topModelTokens: number | null;
  costStatus: UsageCostStatus;
  costCurrency: string | null;
  estimatedCost: number | null;
  unpricedModels: number;
  unpricedTotalTokens: number;
  efficiency: UsageEfficiency | null;
}

function pickTopModel(items: UsageStatsItem[]): UsageStatsItem | null {
  let best: UsageStatsItem | null = null;
  for (const item of items) {
    if (!Number.isFinite(item.total_tokens)) continue;
    if (best === null || item.total_tokens > best.total_tokens) {
      best = item;
    } else if (item.total_tokens === best.total_tokens && (item.key ?? '') < (best.key ?? '')) {
      best = item;
    }
  }
  return best;
}

/**
 * Combine the daily summary, the per-model stats and the cost rollup into the
 * hero card values. Returns null until the summary arrives — the caller shows a
 * loading or empty state instead of zeros that look like real usage.
 */
export function buildUsageHero(input: {
  usage: UsageSummaryResponse | null;
  cost: UsageCostResponse | null;
  stats: UsageStatsResponse | null;
}): UsageHeroData | null {
  const { usage, cost, stats } = input;
  if (!usage) return null;

  const total = usage.total;
  const windowDays = Number.isFinite(usage.days) ? usage.days : 0;
  const top = pickTopModel(stats?.items ?? []);
  const costTotal = cost?.total;
  // A response without the cost rollup fields (older/partial payload) is treated
  // as "no cost data" rather than as a priced 0.
  const costStatus: UsageCostStatus =
    costTotal && typeof costTotal.cost_status === 'string' ? costTotal.cost_status : 'none';

  return {
    totalTokens: total.total_tokens,
    promptTokens: total.prompt_tokens,
    completionTokens: total.completion_tokens,
    requestCount: total.request_count,
    windowDays,
    dailyAverageTokens: windowDays > 0 ? total.total_tokens / windowDays : null,
    topModelKey: top ? top.key : null,
    topModelTokens: top ? top.total_tokens : null,
    costStatus,
    costCurrency: costTotal?.currency ?? null,
    estimatedCost: costTotal?.estimated_cost ?? null,
    unpricedModels: costTotal?.unpriced_models ?? 0,
    unpricedTotalTokens: costTotal?.unpriced_total_tokens ?? 0,
    efficiency: stats?.efficiency ?? null,
  };
}

export interface UsageStatsRow {
  /** Stable row identity; the raw key may be null (unrecorded model/session). */
  id: string;
  rawKey: string | null;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number | null;
  cacheHitRate: number | null;
  avgSpeedTps: number | null;
  avgTtftMs: number | null;
  /** Share of the window total; null when the window has no tokens to divide by. */
  tokenShare: number | null;
  requestShare: number | null;
  costStatus: UsageCostStatus;
  currency: string | null;
  estimatedCost: number | null;
  unpricedModels: number;
  unpricedTotalTokens: number;
}

function share(value: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return value / denominator;
}

/** Flatten a stats response into sortable rows with window shares. */
export function buildUsageStatsRows(response: UsageStatsResponse | null): UsageStatsRow[] {
  if (!response) return [];
  const totalTokens = response.total?.total_tokens ?? 0;
  const totalRequests = response.total?.request_count ?? 0;
  return response.items.map((item, index) => ({
    id: `${item.key ?? `__null-${index}`}`,
    rawKey: item.key,
    requestCount: item.request_count,
    promptTokens: item.prompt_tokens,
    completionTokens: item.completion_tokens,
    totalTokens: item.total_tokens,
    cachedTokens: item.cached_tokens ?? null,
    cacheHitRate: item.cache_hit_rate ?? null,
    avgSpeedTps: item.avg_speed_tps ?? null,
    avgTtftMs: item.avg_ttft_ms ?? null,
    tokenShare: share(item.total_tokens, totalTokens),
    requestShare: share(item.request_count, totalRequests),
    costStatus: item.cost_status,
    currency: item.currency,
    estimatedCost: item.estimated_cost,
    unpricedModels: item.unpriced_models,
    unpricedTotalTokens: item.unpriced_total_tokens,
  }));
}

export type UsageStatsSortKey =
  | 'rawKey'
  | 'requestCount'
  | 'totalTokens'
  | 'tokenShare'
  | 'estimatedCost';

export type UsageStatsSortOrder = 'ascend' | 'descend';

function compareNullable(a: number | null, b: number | null, order: UsageStatsSortOrder): number {
  // Unknown values are never ranked as the smallest; they always sink to the end.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return order === 'ascend' ? a - b : b - a;
}

/** Deterministic, non-mutating sort used by the stats table. */
export function sortUsageStatsRows(
  rows: UsageStatsRow[],
  key: UsageStatsSortKey,
  order: UsageStatsSortOrder,
): UsageStatsRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let result: number;
    if (key === 'rawKey') {
      const left = a.rawKey ?? '';
      const right = b.rawKey ?? '';
      result = left.localeCompare(right);
      if (order === 'descend') result = -result;
    } else if (key === 'estimatedCost') {
      result = compareNullable(a.estimatedCost, b.estimatedCost, order);
    } else if (key === 'tokenShare') {
      result = compareNullable(a.tokenShare, b.tokenShare, order);
    } else if (key === 'requestCount') {
      result = order === 'ascend' ? a.requestCount - b.requestCount : b.requestCount - a.requestCount;
    } else {
      result = order === 'ascend' ? a.totalTokens - b.totalTokens : b.totalTokens - a.totalTokens;
    }
    // Stable tie-break keeps the table deterministic for equal values.
    return result !== 0 ? result : a.id.localeCompare(b.id);
  });
  return sorted;
}
