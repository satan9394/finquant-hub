import apiClient from './api';
import type {
  BacktestCreatePayload,
  BacktestRun,
  BarsResponse,
  ChipDistributionResponse,
  FundamentalsResponse,
  InstrumentSearchResponse,
  ResearchDiscussionSummary,
  ResearchHistoryGroup,
  ResearchReportDetail,
  ResearchThesisSummary,
  ResearchWorkspace,
  SnapshotResponse,
} from '../types/research';

export interface InvestmentMemory {
  id: number;
  subject_type: string;
  subject_id: string;
  memory_type: string;
  information_kind: string;
  content: Record<string, unknown>;
  source_kind: string;
  source_id: string | null;
  evidence_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  observed_at: string | null;
  status: 'candidate' | 'confirmed' | 'superseded' | 'invalidated' | 'deleted';
  confidence: number | null;
  quality_flags: string[];
  supersedes_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryExport {
  schema_version: string;
  generated_at: string;
  record_count: number;
  records: InvestmentMemory[];
}

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

export async function fetchChipDistribution(symbol: string): Promise<ChipDistributionResponse> {
  const response = await apiClient.get(`/instruments/${encodeURIComponent(symbol)}/chip-distribution`);
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

export async function fetchResearchHistory(): Promise<ResearchHistoryGroup[]> {
  const response = await apiClient.get('/research/history');
  return response.data.items ?? [];
}

export async function fetchResearchReport(id: number): Promise<ResearchReportDetail> {
  const response = await apiClient.get(`/research/${id}`);
  return response.data;
}

export async function fetchResearchDiscussions(): Promise<ResearchDiscussionSummary[]> {
  const response = await apiClient.get('/discussion/rooms');
  return response.data.items ?? [];
}

export async function fetchResearchTheses(): Promise<ResearchThesisSummary[]> {
  const response = await apiClient.get('/thesis');
  return response.data.items ?? [];
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

export async function fetchMemories(includeDeleted = false): Promise<InvestmentMemory[]> {
  const response = await apiClient.get('/research/memory', {
    params: { include_deleted: includeDeleted },
  });
  return response.data.items ?? [];
}

export async function actOnMemory(
  id: number,
  payload: {
    action: 'confirm' | 'edit' | 'invalidate';
    content?: Record<string, unknown>;
  },
): Promise<InvestmentMemory> {
  const response = await apiClient.patch(`/research/memory/${id}`, payload);
  return response.data;
}

export async function deleteMemory(id: number): Promise<void> {
  await apiClient.delete(`/research/memory/${id}`);
}

export async function exportMemories(): Promise<MemoryExport> {
  const response = await apiClient.get('/research/memory/export');
  return response.data;
}
