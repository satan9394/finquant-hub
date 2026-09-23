import apiClient from './api';

/** BACKLOG-044: owner-scoped model unit prices + derived cost estimates. */

export interface ModelPricingItem {
  id: number;
  model_name: string;
  input_per_1m: number;
  output_per_1m: number;
  currency: string;
  source: 'manual' | 'builtin';
  updated_at: string;
}

export interface ModelPricingInput {
  model_name: string;
  input_per_1m: number;
  output_per_1m: number;
  currency: string;
}

export interface UsageCostItem {
  model_name: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
  priced: boolean;
  currency: string | null;
  input_per_1m: number | null;
  output_per_1m: number | null;
  price_source: string | null;
  estimated_cost: number | null;
}

export interface UsageCostTotal {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
  priced_models: number;
  unpriced_models: number;
  unpriced_model_names: Array<string | null>;
  unpriced_total_tokens: number;
  cost_by_currency: Record<string, number>;
  currency: string | null;
  mixed_currency: boolean;
  estimated_cost: number | null;
  cost_status: UsageCostStatus;
}

export interface UsageCostResponse {
  days: number;
  start?: string;
  end?: string;
  session_type: string | null;
  items: UsageCostItem[];
  total: UsageCostTotal;
}

/**
 * Window selector shared by every usage endpoint: `days` (legacy, unchanged) or
 * an explicit inclusive `start`/`end` pair of UTC dates.
 */
export interface UsageRangeParams {
  days?: number;
  start?: string;
  end?: string;
}

export type UsageCostStatus = 'none' | 'priced' | 'unpriced' | 'partial' | 'mixed_currency';

export interface UsageTotals {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
}

export interface UsageDayItem extends UsageTotals {
  day: string;
}

export interface UsageSessionTypeItem {
  session_type: string;
  total_tokens: number;
  request_count: number;
}

export interface UsageSummaryResponse {
  days: number;
  start: string;
  end: string;
  session_type: string | null;
  items: UsageDayItem[];
  total: UsageTotals;
  by_session_type: UsageSessionTypeItem[];
}

export type UsageDimension = 'model' | 'session_type';

export interface UsageStatsItem {
  key: string | null;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  priced_models: number;
  unpriced_models: number;
  unpriced_total_tokens: number;
  cost_by_currency: Record<string, number>;
  currency: string | null;
  mixed_currency: boolean;
  estimated_cost: number | null;
  cost_status: UsageCostStatus;
}

export type UsageStatsTotal = Omit<UsageStatsItem, 'key'>;

export interface UsageStatsResponse {
  dimension: UsageDimension;
  days: number;
  start: string;
  end: string;
  session_type: string | null;
  items: UsageStatsItem[];
  total: UsageStatsTotal;
}

export async function listModelPricing(): Promise<ModelPricingItem[]> {
  const response = await apiClient.get('/model-pricing');
  return response.data.items;
}

export async function createModelPricing(input: ModelPricingInput): Promise<ModelPricingItem> {
  const response = await apiClient.post('/model-pricing', input);
  return response.data;
}

export async function updateModelPricing(id: number, input: ModelPricingInput): Promise<ModelPricingItem> {
  const response = await apiClient.put(`/model-pricing/${id}`, input);
  return response.data;
}

export async function deleteModelPricing(id: number): Promise<void> {
  await apiClient.delete(`/model-pricing/${id}`);
}

export async function fetchUsageCost(params: UsageRangeParams): Promise<UsageCostResponse> {
  const response = await apiClient.get('/usage/cost', { params });
  return response.data;
}

/** Daily totals over the selected window (the range picker drives every panel). */
export async function fetchUsageSummary(params: UsageRangeParams): Promise<UsageSummaryResponse> {
  const response = await apiClient.get('/usage', { params });
  return response.data;
}

/** Per-dimension aggregation (model or session type) with derived, honest cost. */
export async function fetchUsageStats(
  dimension: UsageDimension,
  params: UsageRangeParams,
): Promise<UsageStatsResponse> {
  const response = await apiClient.get('/usage/stats', { params: { ...params, dimension } });
  return response.data;
}

/**
 * Format an estimated amount without ever turning a small non-zero cost into 0.
 * Unpriced values are the caller's responsibility (they must render as 未配置单价).
 */
export function formatCost(value: number | null | undefined, currency?: string | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  const unit = currency ? `${currency} ` : '';
  if (value === 0) return `${unit}0`;
  const magnitude = Math.abs(value);
  if (magnitude < 0.000001) return `${unit}<0.000001`;
  const digits = magnitude < 0.01 ? 6 : magnitude < 1 ? 4 : 2;
  return `${unit}${value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')}`;
}
