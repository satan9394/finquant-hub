/* ============================================================
 * swarm/replay —— swarm 历史回放数据层（**纯函数**）
 *
 * 把一份已落库的 swarm 运行的 `research_events` 行折叠成与**实时完全相同**的
 * `SwarmRunState`。与实时路径（`SwarmStatusCard` 消费 SSE）的三条同源约定：
 *
 *  1. **同一套事件语义**：折叠的就是 `state.ts` 的 `applySwarmEvent`，本文件
 *     **不复制、不改写**任何事件语义。落库行 → 事件帧的映射是
 *     `{ event: row.event_type, data: row.payload }`（后端 `GET /api/research/{id}`
 *     返回的行字段为 `id / event_type / agent_role_key / payload / created_at`，
 *     且 `payload` 已在后端 `json.loads`）。
 *  2. **名册来自数据**：初态由**首个** `event_type === 'team_started'` 的行的
 *     `payload.team`（= 后端 `public_team_definition()` 的产物）经
 *     `createSwarmRunState(team)` 建立——**不得**用页面里的 `AGENT_KEYS`
 *     常量建名册（那些是深度研究的 5 个角色，与 swarm 团队存在**真实键碰撞**：
 *     `report_lead` 同属四大师与深度研究；`business_analyst` / `financial_analyst`
 *     同属财报精读与深度研究。用常量建名册会把碰撞的键映射到**错误的角色集合**）。
 *  3. **不可判定时不猜**：事件流里没有（或没有合法的）`team_started` 时，
 *     返回**判别联合**的失败分支（`ok: false` + `reason`），**不得**退化成
 *     "一个空的 / 全 pending 的 RunState"——那会把"不是 swarm 运行"渲染成
 *     "swarm 什么都没跑"，是两种完全不同的事实。
 *
 * 本模块**零 I/O、零 React**：输入是一份行数组，输出是一个普通对象。
 * ============================================================ */

import {
  applySwarmEvent,
  createSwarmRunState,
  type SwarmEvent,
  type SwarmRunState,
  type SwarmTeamDefinition,
} from './state';
import type { ResearchReportEvent } from '../../types/research';

/** 回放成功的产物：终态 + 从数据里取出的团队定义。 */
export interface SwarmReplayResult {
  state: SwarmRunState;
  /** 取自 `team_started.payload.team` 的名册来源（回放时**唯一**的角色事实来源）。 */
  team: SwarmTeamDefinition;
  /** 实际参与折叠的事件帧（按 id 升序，与实时 SSE 帧同形）。 */
  frames: SwarmEvent[];
}

/** 不可判定 ⇒ 显式可区分的原因码（判别联合的判别式）。 */
export type SwarmReplayFailureReason =
  /** 事件流是空的：连一行都没有，谈不上"跑过"。 */
  | 'empty_stream'
  /** 有事件，但没有 `team_started`（例如这是一份深度研究报告，不是 swarm 运行）。 */
  | 'no_team_started'
  /** 有 `team_started`，但 `payload.team` 不构成合法团队定义（名册不可信）。 */
  | 'invalid_team_definition';

export type SwarmReplayOutcome =
  | ({ ok: true } & SwarmReplayResult)
  | { ok: false; reason: SwarmReplayFailureReason; detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : undefined;
}

/**
 * 从 `team_started.payload.team` 收窄出 `SwarmTeamDefinition`。
 *
 * 判据是**结构**，不是"字段看起来像"：`key` / `name` / `description` 必须是字符串，
 * `agents` 必须是非空数组，且每个条目的 `key` / `name` / `avatar` 都是字符串、
 * `dependencies` / `tools` 都是字符串数组。
 *
 * **任一 Agent 不合法 ⇒ 整个团队不合法**（而不是丢掉那个 Agent 继续）：
 * 名册少一个人和名册里多一个伪造的人，都是"这份数据不足以判定归属"，
 * 此时正确的动作是把不确定性显式报出去，而不是挑一个看起来能跑的读法。
 */
function readTeamDefinition(payload: unknown): SwarmTeamDefinition | null {
  if (!isRecord(payload)) return null;
  const raw = payload.team;
  if (!isRecord(raw)) return null;

  const key = stringField(raw.key);
  const name = stringField(raw.name);
  const description = stringField(raw.description);
  if (!key || !name || !description) return null;
  if (!Array.isArray(raw.agents) || raw.agents.length === 0) return null;

  const agents = [];
  for (const entry of raw.agents) {
    if (!isRecord(entry)) return null;
    const agentKey = stringField(entry.key);
    const agentName = stringField(entry.name);
    const avatar = stringField(entry.avatar);
    const dependencies = stringList(entry.dependencies ?? []);
    const tools = stringList(entry.tools ?? []);
    if (!agentKey || !agentName || !avatar || !dependencies || !tools) return null;
    agents.push({ key: agentKey, name: agentName, avatar, dependencies, tools });
  }

  return { key, name, description, agents };
}

/** 落库行 → 实时同形的事件帧。**这是唯一的映射点**（`{ event: row.event_type, data: row.payload }`）。 */
function toFrame(row: ResearchReportEvent): SwarmEvent {
  return { event: row.event_type, data: isRecord(row.payload) ? row.payload : {} };
}

/**
 * 折叠一份已落库的 swarm 运行：`research_events` 行 → `SwarmRunState`。
 *
 * 顺序**按 `id` 升序**（与后端 `ORDER BY id` 同口径），不依赖调用方传入的数组顺序。
 * `team_started` 自身也参与折叠——它只是把 `status` 置为 `running` 并清空 `error`，
 * 与 `createSwarmRunState` 的初态幂等，所以"包含它"不会引入任何实时路径没有的语义；
 * 反过来，若把它排除在外，"回放 = 把同一批帧喂给实时"这条同源判据就无法逐字成立。
 */
export function replaySwarmRun(events: ResearchReportEvent[]): SwarmReplayOutcome {
  if (!Array.isArray(events) || events.length === 0) {
    return { ok: false, reason: 'empty_stream', detail: '事件流为空：没有可回放的 research_events 行' };
  }

  // 按事件类型找，**不按位置假设**——`team_started` 出现在第 0 行是当前后端的实现细节，
  // 不是契约。这里允许它在任意位置，包括它前面还有行的情况。
  const teamStarter = events.find((row) => row?.event_type === 'team_started');
  if (!teamStarter) {
    return {
      ok: false,
      reason: 'no_team_started',
      detail: `事件流里没有 team_started（共 ${events.length} 行）：无法判定这是一次 swarm 运行`,
    };
  }

  const team = readTeamDefinition(teamStarter.payload);
  if (!team) {
    return {
      ok: false,
      reason: 'invalid_team_definition',
      detail: 'team_started.payload.team 不是合法的团队定义：名册不可信，拒绝按猜测回放',
    };
  }

  const frames = [...events]
    .sort((left, right) => left.id - right.id)
    .map(toFrame);

  const state = frames.reduce<SwarmRunState>(applySwarmEvent, createSwarmRunState(team));

  return { ok: true, state, team, frames };
}
