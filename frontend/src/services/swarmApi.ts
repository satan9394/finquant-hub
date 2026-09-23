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

/** `GET /api/swarm/runs` 的一条历史运行（后端 `routers/swarm.py:111-135` 的 items 元素）。 */
export interface SwarmRunSummary {
  report_id: number;
  ticker: string;
  company_name?: string | null;
  status: string;
  created_at: string;
  /** 取自该次运行首条 `team_started` 的 payload；载荷不可解析时后端给 null（不猜）。 */
  team_key?: string | null;
  team_name?: string | null;
}

/**
 * W3：只读列出某个 ticker 的历史 swarm 团队运行（按时间倒序）。不触发任何 LLM 调用。
 *
 * **响应形状不符 ⇒ 抛错，不降级成空数组**：`items` 不是数组意味着"没读到"，
 * 而空数组意味着"成功读到了 0 条"。把前者渲染成后者，就是本卡要消灭的
 * "读不出来伪装成没有历史运行"——所以这个区分必须在**数据层**就立住，
 * 不能留给调用方去猜（`data.items ?? []` 正是那个错误写法）。
 */
export async function fetchSwarmRuns(ticker: string): Promise<SwarmRunSummary[]> {
  const response = await apiClient.get('/swarm/runs', { params: { ticker } });
  const payload = response.data as { items?: unknown } | null | undefined;
  const items = payload?.items;
  if (!Array.isArray(items)) {
    throw new Error('GET /api/swarm/runs 的响应里没有 items 数组：无法判定是否存在历史运行');
  }
  return items as SwarmRunSummary[];
}

export async function requestSwarmRunCancellation(reportId: number): Promise<{ report_id: number; status: string }> {
  const response = await apiClient.post(`/swarm/runs/${reportId}/cancel`);
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
