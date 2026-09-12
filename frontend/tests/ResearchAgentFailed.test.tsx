import { describe, expect, it } from 'vitest';

import { applyAgentEvent } from '../src/pages/Research';
import type { ResearchAgent } from '../src/types';

/**
 * VS13 回归防线：Agent 级 SSE 事件的状态迁移。
 *
 * 背景：`agent_failed` 分支此前**不存在**，导致后端标记为失败的 Agent 卡片被
 * `agent_started` 置为 `running` 后再无人终结（永远转圈）。该缺陷逃逸的原因之一
 * 就是这三条迁移**没有测试覆盖**，故在此补齐。
 */

const KEYS = ['business_analyst', 'financial_analyst', 'industry_researcher', 'risk_assessor'];

function makeAgents(): ResearchAgent[] {
  return KEYS.map((role) => ({ name: role, role, status: 'pending' as const }));
}

describe('applyAgentEvent — agent_failed 必须终结卡片', () => {
  it('把失败的 Agent 置为 failed 并写入原因（不再是 running）', () => {
    const started = applyAgentEvent(makeAgents(), 'agent_started', 'financial_analyst');
    expect(started.find((a) => a.role === 'financial_analyst')?.status).toBe('running');

    const failed = applyAgentEvent(started, 'agent_failed', 'financial_analyst', '研究 Agent 异常：boom');
    const card = failed.find((a) => a.role === 'financial_analyst');
    expect(card?.status).toBe('failed');
    expect(card?.progress).toBe('研究 Agent 异常：boom');
  });

  it('不影响其他 Agent 的状态', () => {
    let agents = applyAgentEvent(makeAgents(), 'agent_started', 'business_analyst');
    agents = applyAgentEvent(agents, 'agent_completed', 'industry_researcher');
    agents = applyAgentEvent(agents, 'agent_started', 'financial_analyst');
    agents = applyAgentEvent(agents, 'agent_failed', 'financial_analyst', 'boom');

    const byRole = Object.fromEntries(agents.map((a) => [a.role, a.status]));
    expect(byRole.business_analyst).toBe('running');
    expect(byRole.industry_researcher).toBe('completed');
    expect(byRole.financial_analyst).toBe('failed');
    expect(byRole.risk_assessor).toBe('pending');
  });

  it('未提供原因时不写入 progress（不渲染 undefined）', () => {
    const failed = applyAgentEvent(makeAgents(), 'agent_failed', 'risk_assessor');
    const card = failed.find((a) => a.role === 'risk_assessor');
    expect(card?.status).toBe('failed');
    expect(card?.progress).toBeUndefined();
  });
});

describe('applyAgentEvent — 既有迁移零回归', () => {
  it('agent_started → running', () => {
    const agents = applyAgentEvent(makeAgents(), 'agent_started', 'business_analyst');
    expect(agents.find((a) => a.role === 'business_analyst')?.status).toBe('running');
  });

  it('agent_completed → completed', () => {
    const agents = applyAgentEvent(makeAgents(), 'agent_completed', 'industry_researcher');
    expect(agents.find((a) => a.role === 'industry_researcher')?.status).toBe('completed');
  });

  it('未知 role_key 原样返回同一引用（等价于改动前的 idx>=0 守卫，不触发重渲染）', () => {
    const input = makeAgents();
    expect(applyAgentEvent(input, 'agent_failed', 'not_a_real_agent', 'x')).toBe(input);
    expect(applyAgentEvent(input, 'agent_started', undefined)).toBe(input);
  });
});
