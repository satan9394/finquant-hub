export type SwarmAgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';
export type SwarmRunStatus = 'idle' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';

export interface SwarmAgentDefinition {
  key: string;
  name: string;
  avatar: string;
  dependencies: string[];
  tools: string[];
}

export interface SwarmTeamDefinition {
  key: string;
  name: string;
  description: string;
  agents: SwarmAgentDefinition[];
}

export interface SwarmAgentState extends SwarmAgentDefinition {
  status: SwarmAgentStatus;
  tokenCount: number;
  toolCalls: number;
  content: string;
  error?: string;
}

export interface SwarmRunState {
  status: SwarmRunStatus;
  agents: Record<string, SwarmAgentState>;
  totalTokens: number;
  reportId?: number;
  error?: string;
}

export interface SwarmEvent {
  event: string;
  data: Record<string, unknown>;
}

const TERMINAL_AGENT_STATUSES = new Set<SwarmAgentStatus>([
  'completed', 'failed', 'skipped', 'cancelled',
]);

export function createSwarmRunState(team: SwarmTeamDefinition): SwarmRunState {
  return {
    status: 'idle',
    agents: Object.fromEntries(team.agents.map((agent) => [agent.key, {
      ...agent,
      status: 'pending' as const,
      tokenCount: 0,
      toolCalls: 0,
      content: '',
    }])),
    totalTokens: 0,
  };
}

function updateAgent(
  state: SwarmRunState,
  roleKey: string | undefined,
  update: (agent: SwarmAgentState) => SwarmAgentState,
): SwarmRunState {
  if (!roleKey || !state.agents[roleKey]) return state;
  return {
    ...state,
    agents: { ...state.agents, [roleKey]: update(state.agents[roleKey]) },
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function applySwarmEvent(state: SwarmRunState, frame: SwarmEvent): SwarmRunState {
  const roleKey = stringValue(frame.data.role_key);

  switch (frame.event) {
    case 'report_started':
      return { ...state, reportId: numberValue(frame.data.report_id) ?? state.reportId };
    case 'team_started':
      return { ...state, status: 'running', error: undefined };
    case 'agent_started':
      return updateAgent(state, roleKey, (agent) => ({ ...agent, status: 'running', error: undefined }));
    case 'tool_call':
      return updateAgent(state, roleKey, (agent) => ({ ...agent, toolCalls: agent.toolCalls + 1 }));
    case 'agent_completed': {
      const next = updateAgent(state, roleKey, (agent) => ({
        ...agent,
        status: 'completed',
        tokenCount: numberValue(frame.data.token_count) ?? agent.tokenCount,
      }));
      return {
        ...next,
        totalTokens: Object.values(next.agents).reduce((total, agent) => total + agent.tokenCount, 0),
      };
    }
    case 'agent_failed':
      return updateAgent(state, roleKey, (agent) => ({
        ...agent,
        status: 'failed',
        error: stringValue(frame.data.error) ?? 'Agent 运行失败',
      }));
    case 'agent_skipped':
      return updateAgent(state, roleKey, (agent) => ({ ...agent, status: 'skipped' }));
    case 'done': {
      const rawResults = frame.data.agent_results;
      const results = rawResults && typeof rawResults === 'object'
        ? rawResults as Record<string, Record<string, unknown>>
        : {};
      const completed = stringValue(frame.data.status) === 'completed';
      const agents = Object.fromEntries(Object.entries(state.agents).map(([key, agent]) => {
        const result = results[key];
        if (result) {
          return [key, {
            ...agent,
            status: 'completed' as const,
            tokenCount: numberValue(result.token_count) ?? agent.tokenCount,
            content: stringValue(result.content) ?? agent.content,
          }];
        }
        return [key, TERMINAL_AGENT_STATUSES.has(agent.status)
          ? agent
          : { ...agent, status: 'skipped' as const }];
      }));
      const allResultsPresent = Object.keys(state.agents).every((key) => results[key]);
      return {
        ...state,
        agents,
        status: completed && allResultsPresent ? 'completed' : 'partial',
        totalTokens: numberValue(frame.data.token_count) ?? state.totalTokens,
      };
    }
    case 'error':
      return {
        ...state,
        status: 'failed',
        error: stringValue(frame.data.error) ?? stringValue(frame.data.message) ?? 'Swarm 运行失败',
      };
    default:
      return state;
  }
}

export function cancelSwarmRun(state: SwarmRunState): SwarmRunState {
  if (state.status !== 'running') return state;
  return {
    ...state,
    status: 'cancelled',
    agents: Object.fromEntries(Object.entries(state.agents).map(([key, agent]) => [
      key,
      agent.status === 'running' ? { ...agent, status: 'cancelled' as const } : agent,
    ])),
  };
}

export function swarmProgress(state: SwarmRunState): number {
  const agents = Object.values(state.agents);
  if (agents.length === 0) return 0;
  const terminal = agents.filter((agent) => TERMINAL_AGENT_STATUSES.has(agent.status)).length;
  return Math.round((terminal / agents.length) * 100);
}

export function swarmToolCalls(state: SwarmRunState): number {
  return Object.values(state.agents).reduce((total, agent) => total + agent.toolCalls, 0);
}
