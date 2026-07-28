import apiClient from './api';
import type {
  BacktestCreatePayload,
  BacktestRun,
  BarsResponse,
  FundamentalsResponse,
  InstrumentSearchResponse,
  ResearchWorkspace,
  SnapshotResponse,
} from '../types/research';

export async function searchInstruments(q: string): Promise<InstrumentSearchResponse> {
  const response = await apiClient.get('/instruments/search', { params: { q } });
  return response.data;
}

export async function fetchInstrumentSnapshot(symbol: string): Promise<SnapshotResponse> {
  const response = await apiClient.get(`/instruments/${encodeURIComponent(symbol)}/snapshot`);
  return response.data;
}

export async function fetchInstrumentBars(symbol: string, count = 260): Promise<BarsResponse> {
  const response = await apiClient.get(`/instruments/${encodeURIComponent(symbol)}/bars`, {
    params: { period: '1d', count },
  });
  return response.data;
}

export async function fetchInstrumentFundamentals(symbol: string): Promise<FundamentalsResponse> {
  const response = await apiClient.get(`/instruments/${encodeURIComponent(symbol)}/fundamentals`);
  return response.data;
}

export async function fetchResearchWorkspace(symbol: string): Promise<ResearchWorkspace> {
  const response = await apiClient.get(`/instruments/${encodeURIComponent(symbol)}/workspace`);
  return response.data;
}

export async function listResearchWorkspaces(): Promise<ResearchWorkspace[]> {
  const response = await apiClient.get('/instruments/workspaces');
  return response.data.items;
}

export async function saveResearchWorkspace(symbol: string, payload: Record<string, unknown>) {
  const response = await apiClient.put(`/instruments/${encodeURIComponent(symbol)}/workspace`, payload);
  return response.data;
}

export async function createBacktest(payload: BacktestCreatePayload): Promise<BacktestRun> {
  const response = await apiClient.post('/backtests', payload);
  return response.data;
}

export async function fetchBacktest(id: number): Promise<BacktestRun> {
  const response = await apiClient.get(`/backtests/${id}`);
  return response.data;
}

export async function fetchBacktestTrades(id: number) {
  const response = await apiClient.get(`/backtests/${id}/trades`);
  return response.data.items;
}

export async function saveBacktest(id: number) {
  const response = await apiClient.post(`/backtests/${id}/save`);
  return response.data;
}

export async function listBacktests(savedOnly = false): Promise<BacktestRun[]> {
  const response = await apiClient.get('/backtests', { params: { saved_only: savedOnly } });
  return response.data.items;
}
