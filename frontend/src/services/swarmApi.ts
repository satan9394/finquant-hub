import apiClient from './api';
import type { SwarmEvent, SwarmTeamDefinition } from '../features/swarm/state';
import { readSSE } from './sse';

export { parseSSEChunk } from './sse';

export async function fetchFourMastersTeam(): Promise<SwarmTeamDefinition> {
  const response = await apiClient.get('/swarm/teams/four-masters');
  return response.data;
}

export async function fetchEarningsReviewTeam(): Promise<SwarmTeamDefinition> {
  const response = await apiClient.get('/swarm/teams/earnings-review');
  return response.data;
}

async function streamSwarmTeam(
  path: string,
  ticker: string,
  modelId: number | null,
  onEvent: (event: SwarmEvent) => void,
  signal: AbortSignal,
): Promise<'done' | 'error' | null> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker, model_id: modelId ?? undefined }),
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  let terminal: 'done' | 'error' | null = null;
  await readSSE(response.body, (event: SwarmEvent) => {
    onEvent(event);
    if (event.event === 'done' || event.event === 'error') terminal = event.event;
  }, 'Swarm 服务未返回事件流');
  return terminal;
}

export async function streamFourMasters(
  ticker: string,
  modelId: number | null,
  onEvent: (event: SwarmEvent) => void,
  signal: AbortSignal,
): Promise<'done' | 'error' | null> {
  return streamSwarmTeam('/api/swarm/analyze', ticker, modelId, onEvent, signal);
}

export async function streamEarningsReview(
  ticker: string,
  modelId: number | null,
  onEvent: (event: SwarmEvent) => void,
  signal: AbortSignal,
): Promise<'done' | 'error' | null> {
  return streamSwarmTeam('/api/swarm/teams/earnings-review/run', ticker, modelId, onEvent, signal);
}
