import apiClient from './api';

export type AlertDirection = 'bullish' | 'bearish' | 'neutral';

export interface AlertRule {
  id: number;
  name: string;
  ticker: string;
  signal_type: string;
  direction: AlertDirection | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertTrigger {
  id: number;
  rule_id: number | null;
  rule_name: string;
  ticker: string;
  signal_type: string;
  direction: AlertDirection;
  confidence: 'high' | 'medium' | 'low' | null;
  signal_date: string;
  description: string;
  notification_id: number | null;
  created_at: string;
}

export interface AlertRuleInput {
  name: string;
  ticker: string;
  signal_type: string;
  direction: AlertDirection | null;
  is_enabled: boolean;
}

export interface TriggerFilters {
  rule_id?: number;
  ticker?: string;
  limit?: number;
}

export async function fetchAlertSignalTypes(): Promise<string[]> {
  const response = await apiClient.get('/alerts/signal-types');
  return response.data.items;
}

export async function fetchAlertRules(): Promise<AlertRule[]> {
  const response = await apiClient.get('/alerts/rules');
  return response.data.items;
}

export async function createAlertRule(input: AlertRuleInput): Promise<AlertRule> {
  const response = await apiClient.post('/alerts/rules', input);
  return response.data;
}

export async function updateAlertRule(
  ruleId: number,
  changes: Partial<AlertRuleInput>,
): Promise<AlertRule> {
  const response = await apiClient.put(`/alerts/rules/${ruleId}`, changes);
  return response.data;
}

export async function deleteAlertRule(ruleId: number): Promise<void> {
  await apiClient.delete(`/alerts/rules/${ruleId}`);
}

export async function fetchAlertTriggers(filters: TriggerFilters = {}): Promise<AlertTrigger[]> {
  const response = await apiClient.get('/alerts/triggers', { params: filters });
  return response.data.items;
}
