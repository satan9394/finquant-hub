import { describe, expect, test } from 'vitest';
import {
  applySwarmEvent,
  createSwarmRunState,
  swarmProgress,
  swarmToolCalls,
  type SwarmEvent,
  type SwarmRunState,
  type SwarmTeamDefinition,
} from '../src/features/swarm/state';
import {
  replaySwarmRun,
  type SwarmReplayOutcome,
} from '../src/features/swarm/replay';
import type { ResearchReportEvent } from '../src/types/research';

/* ============================================================
 * W1 回放数据层单测（**纯单元**：不渲染 React、零 I/O）
 *
 * 夹具的形状逐字对齐后端：
 *  - 行字段：`id / event_type / agent_role_key / payload / created_at`
 *    （`routers/research.py:474-481`，`payload` 已 `json.loads`）；
 *  - `team_started.payload.team` = `public_team_definition()` 的产物
 *    （`services/swarm_orch.py:56-73`：`{key,name,description,agents:[{key,name,avatar,dependencies,tools}]}`）；
 *  - 各事件的 `data` 形状对齐 `swarm_orch._run_team` 的 `context.emit(...)`。
 * ============================================================ */

const fourMastersTeam: SwarmTeamDefinition = {
  key: 'four-masters',
  name: '四大师投研团队',
  description: '三位独立专家并行研究，风控委员读取全部前序结论后完成反方检验。',
  agents: [
    {
      key: 'value_investor', name: '价值投资官', avatar: '🏛️', dependencies: [],
      tools: ['get_stock_data', 'verify_valuation', 'calculate_by_financial_rigor', 'search_news'],
    },
    {
      key: 'tech_analyst', name: '技术分析师', avatar: '📈', dependencies: [],
      tools: ['get_stock_data', 'calculate_indicators', 'search_news'],
    },
    {
      key: 'macro_strategist', name: '宏观策略师', avatar: '🌐', dependencies: [],
      tools: ['get_stock_data', 'search_news'],
    },
    {
      key: 'risk_manager', name: '风控委员', avatar: '🛡️',
      dependencies: ['value_investor', 'tech_analyst', 'macro_strategist'],
      tools: ['get_stock_data', 'adversarial_review'],
    },
    {
      key: 'report_lead', name: '投研主编', avatar: '🧠',
      dependencies: ['value_investor', 'tech_analyst', 'macro_strategist', 'risk_manager'],
      tools: ['audit_report_data'],
    },
  ],
};

const earningsReviewTeam: SwarmTeamDefinition = {
  key: 'earnings-review',
  name: '六 Agent 财报精读团队',
  description: '四个独立视角并行审阅一手财报，编辑合成后由读者 Agent 做最终可信度与可读性复核。',
  agents: [
    { key: 'business_analyst', name: '生意本质分析师', avatar: '🧭', dependencies: [], tools: ['get_stock_data', 'search_news'] },
    { key: 'financial_analyst', name: '财务质量分析师', avatar: '🧾', dependencies: [], tools: ['get_stock_data', 'verify_valuation'] },
    { key: 'competition_analyst', name: '竞争格局分析师', avatar: '♟️', dependencies: [], tools: ['get_stock_data', 'search_news'] },
    { key: 'risk_analyst', name: '风险与做空审查员', avatar: '🔍', dependencies: [], tools: ['adversarial_review'] },
    {
      key: 'earnings_editor', name: '财报研究编辑', avatar: '✍️',
      dependencies: ['business_analyst', 'financial_analyst', 'competition_analyst', 'risk_analyst'],
      tools: ['check_buffett_rules'],
    },
    { key: 'reader_reviewer', name: '投资者读者审阅员', avatar: '🧐', dependencies: ['earnings_editor'], tools: [] },
  ],
};

/**
 * `Research.tsx:32` 的深度研究角色常量——本测试**故意复刻**它，用来证明
 * "拿它建名册"会让碰撞键落到错误的角色集合。回放实现本身绝不能读这个常量。
 */
const AGENT_KEYS = ['business_analyst', 'financial_analyst', 'industry_researcher', 'risk_assessor', 'report_lead'];

/** 按 id 升序补上行字段；`payload` 走 JSON 往返，确保拿到的是"数据"而不是共享引用。 */
function rows(entries: Array<[string, unknown]>): ResearchReportEvent[] {
  return entries.map(([event, payload], index) => ({
    id: index + 1,
    research_id: 4242,
    event_type: event,
    agent_role_key: null,
    payload: JSON.parse(JSON.stringify(payload)) as unknown,
    created_at: `2026-09-13 00:00:0${index % 10}`,
  }));
}

function teamStarted(team: SwarmTeamDefinition) {
  return { team, ticker: 'usAAPL', company_name: 'Apple Inc.', model: { id: 7, name: 'demo' } };
}

/** 实时路径：初态由团队定义建立，再逐帧喂给**同一个** `applySwarmEvent`。 */
function liveFold(team: SwarmTeamDefinition, frames: SwarmEvent[]): SwarmRunState {
  return frames.reduce<SwarmRunState>(applySwarmEvent, createSwarmRunState(team));
}

function expectOk(outcome: SwarmReplayOutcome) {
  if (!outcome.ok) {
    throw new Error(`期望回放成功，实际是 ${outcome.reason}：${outcome.detail}`);
  }
  return outcome;
}

function agentKeys(state: SwarmRunState): string[] {
  return Object.keys(state.agents);
}

// ------------------------------------------------------------------
// ② 正常回放 + 与实时路径逐字段相同
// ------------------------------------------------------------------

describe('replaySwarmRun：正常回放', () => {
  test('四大师全程：终态与"把同一批帧喂给实时 applySwarmEvent"逐字段相同', () => {
    // 两条路径各自的输入是**结构相同但互相独立**的两份数据（JSON 往返各做一遍），
    // 复用同一个数组会让这个对照失去意义。
    const source: Array<[string, unknown]> = [
      ['report_started', { report_id: 4242, ticker: 'usAAPL' }],
      ['team_started', teamStarted(fourMastersTeam)],
      ['agent_started', { role_key: 'value_investor', name: '价值投资官', avatar: '🏛️', dependencies: [] }],
      ['tool_call', { role_key: 'value_investor', tool_name: 'get_stock_data', arguments: { symbol: 'usAAPL' } }],
      ['tool_call', { role_key: 'value_investor', tool_name: 'search_news', arguments: {} }],
      ['agent_completed', { role_key: 'value_investor', name: '价值投资官', length: 120, token_count: 42, status: 'completed' }],
      ['agent_started', { role_key: 'tech_analyst', name: '技术分析师' }],
      ['agent_completed', { role_key: 'tech_analyst', name: '技术分析师', token_count: 30, status: 'degraded', degraded_reasons: ['tool_failed'] }],
      ['agent_failed', { role_key: 'macro_strategist', error: 'llm down' }],
      ['agent_skipped', { role_key: 'risk_manager', failed_dependencies: ['macro_strategist'] }],
      ['agent_completed', { role_key: 'report_lead', name: '投研主编', token_count: 88, status: 'completed' }],
      ['done', {
        team: fourMastersTeam,
        status: 'partial',
        token_count: 160,
        agent_results: {
          value_investor: { content: '价值结论', status: 'completed', token_count: 42 },
          tech_analyst: { content: '技术结论', status: 'degraded', degraded_reasons: ['tool_failed'], token_count: 30 },
          macro_strategist: { content: '', status: 'failed', error: 'llm down', token_count: 0 },
          risk_manager: { content: '', status: 'skipped', error: '前序专家未完成，本环节未执行', token_count: 0 },
          report_lead: { content: '主编稿', status: 'completed', token_count: 88 },
        },
      }],
    ];

    const persistedRows = rows(source);
    const liveFrames: SwarmEvent[] = rows(source).map((row) => ({
      event: row.event_type,
      data: row.payload as Record<string, unknown>,
    }));

    const outcome = expectOk(replaySwarmRun(persistedRows));
    const live = liveFold(fourMastersTeam, liveFrames);

    // ① 两条路径逐字段相同（同一个 applySwarmEvent 折叠出的结果）
    expect(outcome.state).toEqual(live);
    expect(outcome.frames).toEqual(liveFrames);

    // ② 具体终态（避免"两边一起错"也能通过空的对照）
    expect(outcome.state.reportId).toBe(4242);
    expect(outcome.state.status).toBe('partial');
    expect(outcome.state.totalTokens).toBe(160);
    expect(agentKeys(outcome.state)).toEqual([
      'value_investor', 'tech_analyst', 'macro_strategist', 'risk_manager', 'report_lead',
    ]);
    expect(outcome.state.agents.value_investor).toMatchObject({
      status: 'completed', tokenCount: 42, toolCalls: 2, content: '价值结论',
    });
    expect(outcome.state.agents.tech_analyst).toMatchObject({
      status: 'completed', degraded: true, degradedReasons: ['tool_failed'],
    });
    expect(outcome.state.agents.macro_strategist).toMatchObject({ status: 'failed', error: 'llm down' });
    expect(outcome.state.agents.risk_manager).toMatchObject({ status: 'skipped' });
    expect(outcome.state.agents.report_lead).toMatchObject({ status: 'completed', content: '主编稿' });
    expect(swarmToolCalls(outcome.state)).toBe(2);
    // 终态分布：completed / completed(degraded) / failed / skipped / completed
    // —— 五者都在「终态」集合里（`state.ts:48` 的 TERMINAL_AGENT_STATUSES 含
    // skipped/failed），故进度是 100%；"整轮不圆满"由 run.status==='partial' 承载。
    expect(swarmProgress(outcome.state)).toBe(100);
  });

  test('行序打乱不影响结果（按 id 升序折叠，不按数组位置假设）', () => {
    const source: Array<[string, unknown]> = [
      ['report_started', { report_id: 9 }],
      ['team_started', teamStarted(fourMastersTeam)],
      ['agent_started', { role_key: 'value_investor' }],
      ['agent_completed', { role_key: 'value_investor', token_count: 11, status: 'completed' }],
      ['done', { status: 'partial', token_count: 11, agent_results: { value_investor: { content: 'x', status: 'completed' } } }],
    ];
    const inOrder = expectOk(replaySwarmRun(rows(source)));
    const shuffled = expectOk(replaySwarmRun([...rows(source)].reverse()));

    expect(shuffled.state).toEqual(inOrder.state);
    expect(shuffled.frames).toEqual(inOrder.frames);
    expect(shuffled.state.agents.value_investor.tokenCount).toBe(11);
  });

  test('⑥ reportId 从 report_started 还原（且不依赖它在 team_started 之前）', () => {
    const before = expectOk(replaySwarmRun(rows([
      ['report_started', { report_id: 4242, ticker: 'usAAPL' }],
      ['team_started', teamStarted(fourMastersTeam)],
    ])));
    expect(before.state.reportId).toBe(4242);

    const after = expectOk(replaySwarmRun(rows([
      ['team_started', teamStarted(fourMastersTeam)],
      ['report_started', { report_id: 77, ticker: 'usAAPL' }],
    ])));
    expect(after.state.reportId).toBe(77);

    // 没有 report_started ⇒ 不猜，保持 undefined（未持久化）
    const none = expectOk(replaySwarmRun(rows([['team_started', teamStarted(fourMastersTeam)]])));
    expect(none.state.reportId).toBeUndefined();
  });

  test('⑥ team_canceled 落库回放为取消态，并与实时归约逐字段相同', () => {
    const source: Array<[string, unknown]> = [
      ['report_started', { report_id: 4242, ticker: 'usAAPL' }],
      ['team_started', teamStarted(fourMastersTeam)],
      ['agent_started', { role_key: 'value_investor', name: '价值投资官' }],
      ['team_canceled', { report_id: 4242 }],
    ];
    const persisted = expectOk(replaySwarmRun(rows(source)));
    const live = liveFold(fourMastersTeam, rows(source).map((row) => ({
      event: row.event_type,
      data: row.payload as Record<string, unknown>,
    })));

    expect(persisted.state).toEqual(live);
    expect(persisted.state.status).toBe('cancelled');
    expect(persisted.state.agents.value_investor.status).toBe('cancelled');
    expect(persisted.state.agents.risk_manager.status).toBe('pending');
  });
});

// ------------------------------------------------------------------
// ③ 名册取自数据 + 反例（用 AGENT_KEYS 会错）
// ------------------------------------------------------------------

describe('replaySwarmRun：名册取自 team_started.payload.team', () => {
  test('③ 终态名册 = payload.team.agents（逐字段、含顺序），且 team_started 不在首位也能取到', () => {
    // team_started 故意放在 report_started 之后（不是第 0 行）：按事件类型找，不按位置假设。
    const outcome = expectOk(replaySwarmRun(rows([
      ['report_started', { report_id: 1 }],
      ['agent_started', { role_key: 'value_investor' }],
      ['team_started', teamStarted(fourMastersTeam)],
      ['agent_completed', { role_key: 'value_investor', token_count: 5, status: 'completed' }],
    ])));

    expect(outcome.team).toEqual(fourMastersTeam);
    expect(agentKeys(outcome.state)).toEqual(fourMastersTeam.agents.map((agent) => agent.key));
    expect(Object.values(outcome.state.agents).map((agent) => ({
      key: agent.key, name: agent.name, avatar: agent.avatar,
      dependencies: agent.dependencies, tools: agent.tools,
    }))).toEqual(fourMastersTeam.agents);
    // value_investor 的事件在 team_started 之前，但折叠顺序由 id 决定 ⇒ 仍被记到
    expect(outcome.state.agents.value_investor).toMatchObject({ status: 'completed', tokenCount: 5 });
  });

  test('③ 反例：用 AGENT_KEYS 建名册会让 report_lead / business_analyst 落到错误的角色集合', () => {
    const outcome = expectOk(replaySwarmRun(rows([
      ['team_started', teamStarted(fourMastersTeam)],
    ])));

    // 错误的建法（用页面常量建一个"固定 5 角色"的假名册）
    const wrongState = createSwarmRunState({
      key: fourMastersTeam.key,
      name: fourMastersTeam.name,
      description: fourMastersTeam.description,
      agents: AGENT_KEYS.map((key) => ({ key, name: key, avatar: '?', dependencies: [], tools: [] })),
    });

    expect(agentKeys(wrongState)).toEqual(AGENT_KEYS);
    expect(agentKeys(outcome.state)).not.toEqual(AGENT_KEYS);
    // ① 名册集合完全不同（四大师有 5 人，但和深度研究不是同一批人）
    expect(agentKeys(outcome.state)).toEqual([
      'value_investor', 'tech_analyst', 'macro_strategist', 'risk_manager', 'report_lead',
    ]);
    // ② 名字撞了也没用：report_lead 在正确名册里是"投研主编"
    expect(outcome.state.agents.report_lead.name).toBe('投研主编');
    expect(wrongState.agents.report_lead.name).toBe('report_lead');
    // ③ 两个真实碰撞键在两份名册里的角色名都不同
    expect(outcome.state.agents.report_lead.tools).toEqual(['audit_report_data']);
    expect(outcome.state.agents.value_investor.name).toBe('价值投资官');
  });

  test('③ 反例的判别力：错误名册下 report_lead 的 token 计数读不到（回放必须能识别）', () => {
    const outcome = expectOk(replaySwarmRun(rows([
      ['team_started', teamStarted(fourMastersTeam)],
      ['agent_completed', { role_key: 'report_lead', token_count: 66, status: 'completed' }],
    ])));

    const wrongState = liveFold(
      {
        key: fourMastersTeam.key,
        name: fourMastersTeam.name,
        description: fourMastersTeam.description,
        agents: AGENT_KEYS.map((key) => ({ key, name: key, avatar: '?', dependencies: [], tools: [] })),
      },
      outcome.frames,
    );

    expect(outcome.state.agents.report_lead.tokenCount).toBe(66);
    expect(outcome.state.totalTokens).toBe(66);
    // 错误名册里根本没有 value_investor / tech_analyst / ... ⇒ 这些事件被静默丢弃
    expect(wrongState.agents.value_investor).toBeUndefined();
    expect(agentKeys(wrongState)).toEqual(AGENT_KEYS);
  });
});

// ------------------------------------------------------------------
// ④ 反向断言：碰撞键在两个团队语境里互不干扰
// ------------------------------------------------------------------

describe('replaySwarmRun：碰撞键的角色归属', () => {
  test('④ four-masters 的 report_lead 是"投研主编"，不带任何深度研究角色语义', () => {
    const outcome = expectOk(replaySwarmRun(rows([
      ['team_started', teamStarted(fourMastersTeam)],
      ['agent_completed', { role_key: 'report_lead', token_count: 12, status: 'completed' }],
    ])));

    expect(outcome.team.key).toBe('four-masters');
    expect(outcome.state.agents.report_lead.name).toBe('投研主编');
    expect(outcome.state.agents.report_lead.dependencies).toEqual([
      'value_investor', 'tech_analyst', 'macro_strategist', 'risk_manager',
    ]);
    expect(outcome.state.totalTokens).toBe(12);
  });

  test('④ earnings-review 有 6 个角色：business_analyst 不是深度研究角色，deep-research 专属键不出现', () => {
    const outcome = expectOk(replaySwarmRun(rows([
      ['report_started', { report_id: 202 }],
      ['team_started', teamStarted(earningsReviewTeam)],
      ['agent_completed', { role_key: 'business_analyst', token_count: 20, status: 'completed' }],
      ['agent_completed', { role_key: 'financial_analyst', token_count: 21, status: 'completed' }],
      ['agent_completed', { role_key: 'competition_analyst', token_count: 22, status: 'completed' }],
      ['agent_completed', { role_key: 'risk_analyst', token_count: 23, status: 'completed' }],
      ['agent_completed', { role_key: 'earnings_editor', token_count: 24, status: 'completed' }],
      ['agent_completed', { role_key: 'reader_reviewer', token_count: 25, status: 'completed' }],
      ['done', {
        team: earningsReviewTeam,
        status: 'completed',
        token_count: 135,
        agent_results: Object.fromEntries(earningsReviewTeam.agents.map((agent) => [
          agent.key, { content: `${agent.key} 结论`, status: 'completed', token_count: 20 },
        ])),
      }],
    ])));

    expect(outcome.team.key).toBe('earnings-review');
    expect(agentKeys(outcome.state)).toEqual([
      'business_analyst', 'financial_analyst', 'competition_analyst',
      'risk_analyst', 'earnings_editor', 'reader_reviewer',
    ]);
    expect(outcome.state.agents.business_analyst.name).toBe('生意本质分析师');
    expect(outcome.state.agents.financial_analyst.name).toBe('财务质量分析师');
    // 深度研究专属角色**不得**因为键碰撞而被塞进 swarm 名册
    expect(outcome.state.agents.industry_researcher).toBeUndefined();
    expect(outcome.state.agents.risk_assessor).toBeUndefined();
    // 6 个 Agent 全部完成且 done 的 agent_results 齐全 ⇒ completed（不是 partial）
    expect(outcome.state.status).toBe('completed');
    expect(outcome.state.totalTokens).toBe(135);
    expect(swarmProgress(outcome.state)).toBe(100);
    expect(outcome.state.agents.reader_reviewer.content).toBe('reader_reviewer 结论');
  });

  test('④ 团队外的 role_key 事件被忽略，不会凭空造出 Agent（两个真实碰撞键都验一遍）', () => {
    const earnings = expectOk(replaySwarmRun(rows([
      ['team_started', teamStarted(earningsReviewTeam)],
      // 深度研究语境里的 report_lead 落进了财报精读运行里 ⇒ 不属于该团队
      ['agent_completed', { role_key: 'report_lead', token_count: 99, status: 'completed' }],
      // 反向：四大师语境里的 business_analyst 落进了财报精读运行里 ⇒ 这次它**是**该团队成员
      ['agent_completed', { role_key: 'business_analyst', token_count: 30, status: 'completed' }],
    ])));
    expect(agentKeys(earnings.state)).toEqual(earningsReviewTeam.agents.map((agent) => agent.key));
    expect(earnings.state.agents.report_lead).toBeUndefined();
    expect(earnings.state.agents.business_analyst.tokenCount).toBe(30);
    expect(earnings.state.totalTokens).toBe(30);
  });
});

// ------------------------------------------------------------------
// ⑤ 无 team_started ⇒ 显式不可判定（不是空 RunState）
// ------------------------------------------------------------------

describe('replaySwarmRun：不可判定时显式失败', () => {
  test('⑤ 一份深度研究报告（没有 team_started）⇒ reason=no_team_started，且没有 state', () => {
    const outcome = replaySwarmRun(rows([
      ['report_started', { report_id: 7 }],
      ['agent_started', { role_key: 'business_analyst' }],
      ['agent_completed', { role_key: 'business_analyst', token_count: 10, status: 'completed' },],
      ['done', { status: 'completed', agent_results: { business_analyst: { content: 'x', status: 'completed' } } }],
    ]));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('不可判定的输入不得返回成功');
    expect(outcome.reason).toBe('no_team_started');
    // 判别联合：失败分支**没有** state 字段 ⇒ 消费方不可能误读成"空的 RunState"
    expect('state' in outcome).toBe(false);
    expect(Object.keys(outcome).sort()).toEqual(['detail', 'ok', 'reason']);
    expect(outcome.detail).toContain('没有 team_started');
  });

  test('⑤ 空事件流是另一种"不可判定"，与 no_team_started 可区分', () => {
    const outcome = replaySwarmRun([]);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('空事件流不得返回成功');
    expect(outcome.reason).toBe('empty_stream');
  });

  test('⑤ team_started 的 payload 不构成合法团队 ⇒ reason=invalid_team_definition（不退化成空名册）', () => {
    const broken: Array<[string, unknown]> = [
      ['team_started', { team: null, ticker: 'usAAPL' }],
      ['team_started', { team: { key: 'four-masters', name: '四大师', description: 'x' }, ticker: 'usAAPL' }],
      ['team_started', { team: { key: 'x', name: 'x', description: 'x', agents: [] } }],
      ['team_started', { team: { key: 'x', name: 'x', description: 'x', agents: [{ key: 'a', name: 'a' }] } }],
    ];

    for (const [event, payload] of broken) {
      const outcome = replaySwarmRun(rows([['report_started', { report_id: 1 }], [event, payload]]));
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('名册不可信时不得返回成功');
      expect(outcome.reason).toBe('invalid_team_definition');
      expect('state' in outcome).toBe(false);
    }
  });

  test('⑤ 失败分支的 reason 是有限枚举：三种原因各自可区分', () => {
    const reasons = [
      replaySwarmRun([]),
      replaySwarmRun(rows([['report_started', { report_id: 1 }]])),
      replaySwarmRun(rows([['team_started', { team: { key: 'x', name: 'x', description: 'x', agents: [] } }]])),
    ].map((outcome) => (outcome.ok ? 'unexpected-ok' : outcome.reason));

    expect(reasons).toEqual(['empty_stream', 'no_team_started', 'invalid_team_definition']);
  });
});
