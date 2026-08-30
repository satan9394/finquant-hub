export type DiscussionStreamStatus = 'running' | 'completed' | 'failed';

export interface DiscussionStreamingEntry {
  round: number;
  content: string;
  status: DiscussionStreamStatus;
}

export type DiscussionStreamingByAgent = Record<string, DiscussionStreamingEntry>;

export interface DiscussionStreamData {
  error?: string;
  message?: string;
  agent?: string;
  name?: string;
  round?: number;
  delta?: string;
  message_id?: number;
  token_count?: number | null;
  content?: string;
  room_id?: number;
}

function currentAgent(state: DiscussionStreamingByAgent): string | undefined {
  return Object.entries(state).find(([, entry]) => entry.status === 'running')?.[0];
}

function settleRunning(
  state: DiscussionStreamingByAgent,
  status: Extract<DiscussionStreamStatus, 'completed' | 'failed'>,
): DiscussionStreamingByAgent {
  return Object.fromEntries(Object.entries(state).map(([agent, entry]) => [
    agent,
    entry.status === 'running' ? { ...entry, status } : entry,
  ]));
}

export function reduceDiscussionStream(
  prev: DiscussionStreamingByAgent,
  event: string,
  data: DiscussionStreamData,
): DiscussionStreamingByAgent {
  if (event === 'agent_start') {
    const agent = data.agent ?? data.name;
    if (!agent) return prev;
    return {
      ...settleRunning(prev, 'completed'),
      [agent]: { round: data.round ?? 0, content: '', status: 'running' },
    };
  }

  if (event === 'token') {
    const agent = data.agent ?? currentAgent(prev);
    const entry = agent ? prev[agent] : undefined;
    if (!agent || !entry || data.delta === undefined) return prev;
    return { ...prev, [agent]: { ...entry, content: entry.content + data.delta } };
  }

  if (event === 'agent_end') {
    const agent = data.agent ?? currentAgent(prev);
    const entry = agent ? prev[agent] : undefined;
    if (!agent || !entry) return prev;
    return { ...prev, [agent]: { ...entry, status: 'completed' } };
  }

  if (event === 'error') {
    const agent = data.agent ?? currentAgent(prev);
    const entry = agent ? prev[agent] : undefined;
    if (!agent || !entry) return prev;
    return { ...prev, [agent]: { ...entry, status: 'failed' } };
  }

  if (event === 'summary' || event === 'done') return settleRunning(prev, 'completed');
  return prev;
}

export function interruptDiscussionStream(prev: DiscussionStreamingByAgent): DiscussionStreamingByAgent {
  return settleRunning(prev, 'failed');
}
