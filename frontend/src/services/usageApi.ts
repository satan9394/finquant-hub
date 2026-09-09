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
}

export interface UsageCostResponse {
  days: number;
  session_type: string | null;
  items: UsageCostItem[];
  total: UsageCostTotal;
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

export async function fetchUsageCost(days: number): Promise<UsageCostResponse> {
  const response = await apiClient.get('/usage/cost', { params: { days } });
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
