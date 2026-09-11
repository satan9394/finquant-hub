import apiClient from './api';

export type AlphaCategory = { name: string; examples: string[]; count: number };
export type AlphaCatalogueMetadata = {
  schema_version: 'alpha-catalogue/v1';
  mode: 'BUNDLED_EXTERNAL' | 'FINQUANT_STARTER';
  data_status: 'OK' | 'PARTIAL';
  source: 'local_bundled_file' | 'finquant.starter';
  redistribution_status: 'UNKNOWN' | 'PROJECT_AUTHORED';
  field_count: number;
};
export type AlphaTemplateField = { id: string; description: string; coverage?: number | null };
export type AlphaTemplate = {
  id: string;
  name: string;
  expression: string;
  fields: AlphaTemplateField[];
  settings: { neutralization: string; decay: number; delay: number; nanHandling: string };
};
export type AlphaSearchResult = {
  name: string;
  field?: string;
  formula?: string;
  desc: string;
  type: 'wq_field' | 'custom_field' | 'alpha';
  dataset?: string;
  category?: string;
  region?: string;
};
export type AlphaObservation = { date: string; symbol: string; factor: number; forward_return: number };
export type AlphaSimulationPerformance = {
  status: 'ok' | 'insufficient';
  sample_days: number;
  start_date: string | null;
  end_date: string | null;
  annualized_return: number | null;
  annualized_volatility: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  max_drawdown_peak_date: string | null;
  max_drawdown_trough_date: string | null;
  max_drawdown_recovery_date: string | null;
  average_turnover: number | null;
};
export type AlphaSimulationResult = {
  equity_curve: Array<{ date: string; value: number }>;
  period_returns: number[];
  metrics: {
    total_return: number;
    annualized_return: number | null;
    benchmark_return: number;
    excess_return: number;
    max_drawdown: number;
    sharpe_ratio: number | null;
    sortino_ratio: number | null;
    calmar_ratio: number | null;
    information_ratio: number | null;
    average_turnover: number;
    positive_period_rate: number;
  };
  factor_analysis?: {
    status: string;
    method: 'cross_sectional_pearson_and_spearman';
    total_periods: number;
    valid_periods: number;
    minimum_assets_per_period: number;
    minimum_valid_periods: number;
    mean_ic: number | null;
    mean_rank_ic: number | null;
    rank_ic_std: number | null;
    icir: number | null;
    excluded_periods: Array<{ date: string; assets: number; reason: string }>;
    periods: Array<{ date: string; assets: number; ic: number; rank_ic: number }>;
  };
  /** 绩效摘要（旧保存结果可能缺失 → 前端诚实占位）。 */
  performance?: AlphaSimulationPerformance;
};
export type AlphaCorrelationResult = { correlation: number; p_value: number; n: number; note?: string | null };

export async function fetchAlphaCatalog() {
  const [categories, templates] = await Promise.all([
    apiClient.get('/wq/categories'),
    apiClient.get('/wq/templates'),
  ]);
  return {
    categories: (categories.data.items ?? []) as AlphaCategory[],
    templates: (templates.data.items ?? []) as AlphaTemplate[],
    catalogue: categories.data.catalogue as AlphaCatalogueMetadata,
  };
}

export async function searchAlpha(query: string): Promise<AlphaSearchResult[]> {
  const response = await apiClient.get('/wq/search', { params: { q: query } });
  return response.data.items ?? [];
}

export async function simulateAlphaLocally(payload: {
  observations: AlphaObservation[];
  quantile: number;
  periods_per_year: number;
}): Promise<AlphaSimulationResult> {
  const response = await apiClient.post('/wq/simulate/local', payload);
  return response.data;
}

export async function correlateAlphaSeries(seriesA: number[], seriesB: number[]): Promise<AlphaCorrelationResult> {
  const response = await apiClient.post('/wq/correlation', { series_a: seriesA, series_b: seriesB });
  return response.data;
}
