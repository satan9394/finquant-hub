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
  /**
   * VS-35：结构化 `status === 'degraded'`（产出在、过程有残缺）——与 VS-20 在
   * `Research.tsx#deriveAgentOutcome` 里的读法一致：degraded 的卡片状态仍是 completed，
   * 但必须额外标出"降级"，不得当成干净完成。
   */
  degraded?: boolean;
  /** VS-35：结构化原因码（后端 `degraded_reasons`），未知码原样展示。 */
  degradedReasons?: string[];
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

/**
 * VS-35：VS-20 结构化状态 → swarm 卡片状态。**与 `research_orch` 同一套读法**
 * （见 `Research.tsx#deriveAgentOutcome`）：`degraded` 的卡片状态仍是 `completed`，
 * 另由 `degraded` 标志位承载；`skipped` 是 swarm（DAG）对 VS-20 词表的**扩展**
 * ——"前序依赖失败 ⇒ 本环节未执行"，research 的 4 个 Agent 相互独立、不存在该结局。
 * 未知取值**不猜**：退化为 `completed` 仅当条目确实存在（向后兼容旧载荷）。
 */
const STRUCTURED_STATUS_MAP: Record<string, SwarmAgentStatus> = {
  completed: 'completed',
  degraded: 'completed',
  failed: 'failed',
  skipped: 'skipped',
};

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

function reasonList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

/** 结构化状态 → 卡片状态；缺字段（历史载荷）退化为"有条目即完成"。 */
function statusFromStructured(value: unknown): SwarmAgentStatus {
  const key = stringValue(value);
  return (key && STRUCTURED_STATUS_MAP[key]) || 'completed';
}

export function applySwarmEvent(state: SwarmRunState, frame: SwarmEvent): SwarmRunState {
  const roleKey = stringValue(frame.data.role_key);

  switch (frame.event) {
    case 'report_started':
      return { ...state, reportId: numberValue(frame.data.report_id) ?? state.reportId };
    case 'team_started':
      return { ...state, status: 'running', error: undefined };
    case 'team_canceled':
      return cancelSwarmRun(state);
    case 'agent_started':
      return updateAgent(state, roleKey, (agent) => ({ ...agent, status: 'running', error: undefined }));
    case 'tool_call':
      return updateAgent(state, roleKey, (agent) => ({ ...agent, toolCalls: agent.toolCalls + 1 }));
    case 'agent_completed': {
      // VS-35：实时事件与落库条目**同源**——`research_orch` 的 agent_completed 一直带
      // status/degraded_reasons，swarm 侧现已对齐，故这里按结构化字段读（不再无条件"完成"）。
      const structured = stringValue(frame.data.status);
      const degradedReasons = reasonList(frame.data.degraded_reasons);
      const next = updateAgent(state, roleKey, (agent) => ({
        ...agent,
        status: structured === 'failed' ? 'failed' : 'completed',
        degraded: structured === 'degraded',
        ...(degradedReasons.length ? { degradedReasons } : {}),
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
        degraded: false,
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
          // VS-35：**结构化 status 是主判据**（与 `Research.tsx#deriveAgentOutcome` 同一读法）。
          // 改动前这里硬编码 `status: 'completed'`：一旦后端在条目里标了 failed/degraded，
          // 界面就会把失败渲染成完成。缺 status 的历史条目仍退化为"有条目即完成"。
          const structured = stringValue(result.status);
          const status = statusFromStructured(structured);
          const degradedReasons = reasonList(result.degraded_reasons);
          const error = stringValue(result.error) ?? agent.error;
          return [key, {
            ...agent,
            status,
            degraded: structured === 'degraded',
            ...(degradedReasons.length ? { degradedReasons } : {}),
            ...(status === 'failed' && error ? { error } : {}),
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
