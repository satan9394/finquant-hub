// @vitest-environment jsdom
//
// VS20 回放判据防线：重新打开历史报告时，"哪个 Agent 失败/被降级、为什么"必须与实时一致。
//
// 背景（编排者已核码 + 本卡实测）：
//   · 回放旧判据是 `content?.startsWith('【分析失败】')` —— 字符串前缀哨兵（AGENTS.md 禁止的形态）。
//   · 主编失败时后端把 content 置为**空串**并 yield agent_failed ⇒ 哨兵不命中 ⇒ 重开显示"完成"。
//   · 实时路径同样自相矛盾：主编失败后还会补发一条 agent_completed，把 failed 卡片翻回 completed。
//
// 本文件覆盖三类判据：
//   ① 主判据已换成结构化字段（矛盾输入用例：结构化说 completed、content 带哨兵 ⇒ 必须是 completed）
//   ② 主编失败回放显示 failed 且原因可见
//   ③ 历史兼容（只有哨兵、无结构化字段的旧报告仍显示 failed）
// 另有纯函数用例覆盖"降级原因可见 / 原因未记录 / 缺 key 不得默认完成"。

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Research, {
  deriveAgentOutcomes,
  describeOutcomeReason,
  summarizeReason,
  type AgentReplayOutcome,
  type StoredAgentResult,
} from '../src/pages/Research';
import apiClient from '../src/services/api';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { translate } from '../src/i18n';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const KEYS = ['business_analyst', 'financial_analyst', 'industry_researcher', 'risk_assessor', 'report_lead'];

const t = (key: string, values?: Record<string, string | number>) => translate('zh', key, values);

type AgentResultFixture = StoredAgentResult;

function completeResults(overrides: Record<string, AgentResultFixture> = {}): Record<string, AgentResultFixture> {
  const base: Record<string, AgentResultFixture> = {};
  for (const key of KEYS) base[key] = { name: key, content: `${key} 的分析`, status: 'completed' };
  return { ...base, ...overrides };
}

function storedReport(
  agentResults: Record<string, AgentResultFixture> | undefined,
  events: unknown[] = [],
) {
  return {
    id: 7,
    ticker: '600519',
    company_name: '贵州茅台',
    model_id: null,
    status: 'completed',
    created_at: '2026-09-01 10:00:00',
    updated_at: null,
    report_data: {
      company_name: '贵州茅台',
      quality: 'degraded',
      executive_summary: '摘要正文',
      verdict: '中性',
    },
    agent_results: agentResults,
    events,
  };
}

function renderReplay(report: ReturnType<typeof storedReport>) {
  vi.mocked(apiClient.get).mockImplementation((url: unknown) => {
    if (String(url) === '/research/history') return Promise.resolve({ data: { items: [] } }) as never;
    return Promise.resolve({ data: report }) as never;
  });
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/research/reports?symbol=600519&report=7']}>
        <Research />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem('finquant_lang', 'zh');
});

describe('回放：主编失败必须显示 failed（此前显示"完成"）', () => {
  it('结构化 status=failed 的主编 ⇒ 卡片 failed + 原因可见，不再是"完成"', async () => {
    const { container } = renderReplay(storedReport(completeResults({
      // 后端 research_orch：主编 LLMError 时 content 为空串、status=failed、error=可读原因
      report_lead: { name: '投研主编', content: '', status: 'failed', error: '主编模型不可用' },
    })));

    // ① 卡片进入失败态（旧实现恒为 completed，本断言是其鉴别力所在）
    await waitFor(() => {
      expect(container.querySelectorAll('.agent-status-card--failed').length).toBe(1);
    });
    // ② 失败原因出现在卡片上
    expect(screen.getByText('主编模型不可用')).toBeTruthy();
    // ③ 原因同时进入"环节状态"提示列表（用户能看到是哪个 Agent、为什么）
    expect(screen.getByText('投研主编：失败 —— 原因：主编模型不可用')).toBeTruthy();
    // ④ 其余 Agent 不受影响
    expect(container.querySelectorAll('.agent-status-card--completed').length).toBe(4);
  }, 30_000);
});

describe('回放：结构化字段是主判据（哨兵已降级为历史兜底）', () => {
  it('矛盾输入——结构化说 completed 但 content 带哨兵 ⇒ 以结构为准，显示 completed', async () => {
    const { container } = renderReplay(storedReport(completeResults({
      financial_analyst: {
        name: '财务分析师',
        content: '【分析失败】上游模型暂不可用', // 旧哨兵形态，若无条件命中会把这里判成 failed
        status: 'completed',
      },
    })));

    // 等页面完成回放（报告正文渲染出来）
    await screen.findByText('摘要正文');
    expect(container.querySelectorAll('.agent-status-card--failed').length).toBe(0);
    expect(screen.queryByText('失败，可继续')).toBeNull();
    expect(screen.queryByText('⚠️ 本次研究的环节状态')).toBeNull();
    expect(container.querySelectorAll('.agent-status-card--completed').length).toBe(5);
  }, 30_000);

  it('历史兼容——只有哨兵、没有结构化字段的旧报告仍显示 failed', async () => {
    const { container } = renderReplay(storedReport({
      ...completeResults(),
      // 改动前落库的形态：只有 content，没有 status/error/events
      financial_analyst: { name: '财务分析师', content: '【分析失败】上游模型暂不可用' },
    }));

    await waitFor(() => {
      expect(container.querySelectorAll('.agent-status-card--failed').length).toBe(1);
    });
    expect(screen.getByText('上游模型暂不可用')).toBeTruthy();
    expect(screen.getByText('财务分析：失败 —— 原因：上游模型暂不可用')).toBeTruthy();
  }, 30_000);

  it('历史兼容——主编失败但只有落库事件（content 为空串）也能看出 failed', async () => {
    const { container } = renderReplay(storedReport(completeResults({
      report_lead: { name: '投研主编', content: '' },
    }), [
      { event_type: 'agent_started', agent_role_key: 'report_lead', payload: { role_key: 'report_lead' }, created_at: 'x' },
      // 旧实现还会多发一条 agent_completed —— 失败是终态，不得被它翻回完成
      { event_type: 'agent_failed', agent_role_key: 'report_lead', payload: { role_key: 'report_lead', error: '主编模型不可用' }, created_at: 'x' },
      { event_type: 'agent_completed', agent_role_key: 'report_lead', payload: { role_key: 'report_lead' }, created_at: 'x' },
    ]));

    await waitFor(() => {
      expect(container.querySelectorAll('.agent-status-card--failed').length).toBe(1);
    });
    expect(screen.getByText('主编模型不可用')).toBeTruthy();
  }, 30_000);
});

describe('回放：降级原因可见、缺失时如实说"原因未记录"', () => {
  it('工具失败导致的降级 ⇒ 显示"哪个 Agent + 可读原因"（不显示原始码）', async () => {
    const { container } = renderReplay(storedReport(completeResults({
      financial_analyst: { name: '财务分析师', content: '财务分析', status: 'degraded', degraded_reasons: ['tool_failed'] },
    })));

    await screen.findByText('摘要正文');
    // 降级 Agent 的产出仍在 ⇒ 卡片仍是 completed（与实时 agent_completed 一致）
    expect(container.querySelectorAll('.agent-status-card--failed').length).toBe(0);
    expect(screen.getByText('⚠️ 本次研究的环节状态')).toBeTruthy();
    expect(screen.getByText('财务分析：已降级（产出可能不完整）—— 原因：工具调用失败')).toBeTruthy();
    expect(screen.queryByText(/tool_failed/)).toBeNull();
  }, 30_000);

  it('无原因可记录的降级（主编返回无法解析的散文）⇒ 如实显示"原因未记录"', async () => {
    const { container } = renderReplay(storedReport(completeResults({
      report_lead: { name: '投研主编', content: '抱歉，我无法完成本次审核。', status: 'degraded' },
    })));

    await screen.findByText('摘要正文');
    expect(screen.getByText('投研主编：已降级（产出可能不完整）—— 原因：原因未记录')).toBeTruthy();
    // 不得用报告级"可能不完整"含糊过去 —— 环节级提示必须同时在场
    expect(screen.getByText('⚠️ 本次研究的环节状态')).toBeTruthy();
    expect(container.querySelectorAll('.agent-status-card--failed').length).toBe(0);
  }, 30_000);

  it('agent_results 缺某个 key ⇒ 该 Agent 显示未运行/未知，不得默认成"完成"', async () => {
    const results = completeResults();
    delete results.risk_assessor;
    const { container } = renderReplay(storedReport(results));

    await screen.findByText('摘要正文');
    await waitFor(() => {
      expect(container.querySelectorAll('.agent-status-card--completed').length).toBe(4);
    });
    expect(container.querySelectorAll('.agent-status-card--waiting').length).toBe(1);
    expect(screen.getByText('风险评估：状态未知（未运行或没有记录）')).toBeTruthy();
  }, 30_000);
});

describe('纯函数：结构化判据与原因摘要', () => {
  it('结构化 failed 优先于内容；结构化 completed 不被哨兵推翻', () => {
    const outcomes = deriveAgentOutcomes({
      business_analyst: { content: '【分析失败】不该命中', status: 'completed' },
      financial_analyst: { content: '【分析失败】boom', status: 'failed', error: '上游不可用' },
      industry_researcher: { content: '正文', status: 'degraded', degraded_reasons: ['tool_loop_exhausted'] },
      risk_assessor: { content: '正文' },
      report_lead: { content: '' },
    });

    expect(outcomes.business_analyst).toMatchObject({ status: 'completed', degraded: false });
    expect(outcomes.financial_analyst).toMatchObject({ status: 'failed', reason: '上游不可用' });
    expect(outcomes.industry_researcher).toMatchObject({ status: 'completed', degraded: true, degradedReasons: ['tool_loop_exhausted'] });
    // 无结构化状态的旧条目：有正文 ⇒ completed；空正文且无任何证据 ⇒ unknown（不得默认完成）
    expect(outcomes.risk_assessor).toMatchObject({ status: 'completed' });
    expect(outcomes.report_lead).toMatchObject({ status: 'unknown' });
  });

  it('无结构化状态时按 事件 → 哨兵 兜底', () => {
    const noEvidence = deriveAgentOutcomes({ report_lead: { content: '' } }, []);
    expect(noEvidence.report_lead.status).toBe('unknown');

    const fromEvent = deriveAgentOutcomes({ report_lead: { content: '' } }, [
      { event_type: 'agent_failed', agent_role_key: 'report_lead', payload: { role_key: 'report_lead', error: '主编模型不可用' } },
      { event_type: 'agent_completed', agent_role_key: 'report_lead', payload: { role_key: 'report_lead' } },
    ]);
    expect(fromEvent.report_lead).toMatchObject({ status: 'failed', reason: '主编模型不可用' });

    const fromSentinel = deriveAgentOutcomes({ risk_assessor: { content: '【分析失败】工具炸了' } });
    expect(fromSentinel.risk_assessor).toMatchObject({ status: 'failed', reason: '工具炸了' });
  });

  it('describeOutcomeReason：未记录原因返回 undefined（界面据此显示"原因未记录"）', () => {
    const unrecorded: AgentReplayOutcome = { status: 'failed', degraded: false };
    expect(describeOutcomeReason(unrecorded, t)).toBeUndefined();
    expect(t('deep.agent.reasonUnrecorded')).toBe('原因未记录');
  });

  it('summarizeReason：不把异常堆栈塞给用户，长文本截断', () => {
    const traceback = 'Traceback (most recent call last):\n  File "app/x.py", line 3, in run\nValueError: boom';
    expect(summarizeReason(traceback)).toBe('ValueError: boom');
    expect(summarizeReason('a'.repeat(200))?.length).toBe(121);
    expect(summarizeReason(undefined)).toBeUndefined();
  });
});
