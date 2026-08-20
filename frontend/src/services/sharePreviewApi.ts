import apiClient from './api';
import type { SharePreview } from '../types/research';

export async function fetchThesisSharePreview(thesisId: number): Promise<SharePreview> {
  const response = await apiClient.get(`/thesis/${thesisId}/share-preview`);
  return response.data;
}

export async function fetchStrategySharePreview(runId: number): Promise<SharePreview> {
  const response = await apiClient.get(`/backtests/${runId}/share-preview`);
  return response.data;
}
