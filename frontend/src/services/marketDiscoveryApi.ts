import apiClient from './api';
import type {
  MarketMoversResponse,
  MarketPulseResponse,
  MarketThemesResponse,
  ThemeSort,
} from '../types';

export async function fetchMarketMovers(limit = 12): Promise<MarketMoversResponse> {
  const response = await apiClient.get<MarketMoversResponse>('/market/movers', { params: { limit } });
  return response.data;
}

export async function fetchMarketPulse(
  limit = 20,
  thresholdPercent = 8,
  tonghuashunLimit = 20,
): Promise<MarketPulseResponse> {
  const response = await apiClient.get<MarketPulseResponse>('/market/pulse', {
    params: {
      limit,
      threshold_percent: thresholdPercent,
      ths_limit: tonghuashunLimit,
    },
  });
  return response.data;
}

export async function fetchMarketThemes(
  keyword: string,
  sortBy: ThemeSort = 'change',
  limit = 8,
  stocksPerTheme = 10,
  tonghuashunLimit = 10,
): Promise<MarketThemesResponse> {
  const response = await apiClient.get<MarketThemesResponse>('/market/themes', {
    params: {
      keyword,
      sort_by: sortBy,
      limit,
      stocks_per_theme: stocksPerTheme,
      ths_limit: tonghuashunLimit,
    },
  });
  return response.data;
}
