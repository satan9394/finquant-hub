// @vitest-environment jsdom
//
// VS27：整轮截止信号（`truncated_by_deadline`）必须有**真实消费方**——用户看得见。
//
// 反面教材（VS-23）：chat 的 `done.truncated_by_deadline` 在 frontend 全库零消费方，
// "字段存在"并不等于"用户看得见"。本文件钉住两件事：
//   ① 回放（GET /research/{id} → report_data）与实时（SSE done）两条路径**读同一个字段**、
//      渲染同一段用户可见文案；
//   ② 缺字段（历史报告 / 未截断）**不得误报**。
//
// 另外覆盖环节级原因码 `deadline_exceeded` → 中文原因（VS20 的提示列表是它的消费方）。

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Research, { deriveAgentOutcomes, describeOutcomeReason, resolveTruncatedByDeadline } from '../src/pages/Research';
import apiClient from '../src/services/api';
import { readSSE } from '../src/services/sse';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { translate } from '../src/i18n';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/services/sse', () => ({ readSSE: vi.fn() }));

const t = (key: string, values?: Record<string, string | number>) => translate('zh', key, values);
const KEYS = ['business_analyst', 'financial_analyst', 'industry_researcher', 'risk_assessor', 'report_lead'];

function agentResults(overrides: Record<string, Record<string, unknown>> = {}) {
  const base: Record<string, Record<string, unknown>> = {};
  for (const key of KEYS) base[key] = { name: key, content: `${key} 的分析`, status: 'completed' };
  return { ...base, ...overrides };
}

function storedReport(reportData: Record<string, unknown>, results: Record<string, unknown>) {
  return {
    id: 9,
    ticker: '600519',
    company_name: '贵州茅台',
    model_id: null,
    status: 'completed',
    created_at: '2026-09-01 10:00:00',
    updated_at: null,
    report_data: { company_name: '贵州茅台', quality: 'degraded', executive_summary: '摘要正文', ...reportData },
    agent_results: results,
    events: [],
  };
}

beforeEach(() => {
  localStorage.setItem('finquant_lang', 'zh');
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(readSSE).mockReset();
});

describe('VS27：整轮截断信号有消费方（用户看得见）', () => {
  it('回放：落库 report_data.truncated_by_deadline=true ⇒ 屏上出现"提前结束"提示', async () => {
    vi.mocked(apiClient.get).mockImplementation((url: unknown) => {
      if (String(url) === '/research/history') return Promise.resolve({ data: { items: [] } }) as never;
      return Promise.resolve({
        data: storedReport(
          { truncated_by_deadline: true },
          agentResults({
            financial_analyst: {
              name: '财务分析师',
              content: '财务分析（部分）',
              status: 'degraded',
              degraded_reasons: ['deadline_exceeded'],
            },
          }),
        ),
      }) as never;
    });

    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/research/reports?symbol=600519&report=9']}>
          <Research />
        </MemoryRouter>
      </LanguageProvider>,
    );

    await screen.findByText('摘要正文');
    expect(screen.getByText(t('deep.report.truncatedByDeadline'))).toBeTruthy();
    // 环节级：哪个 Agent 被截断、为什么（结构化原因码 → 中文）
    expect(screen.getByText('财务分析：已降级（产出可能不完整）—— 原因：超过研究总时长上限，分析被提前结束（已完成的部分已保留）'))
      .toBeTruthy();
  }, 30_000);

  it('回放：历史报告没有该字段 ⇒ 不得误报截断', async () => {
    vi.mocked(apiClient.get).mockImplementation((url: unknown) => {
      if (String(url) === '/research/history') return Promise.resolve({ data: { items: [] } }) as never;
      return Promise.resolve({ data: storedReport({}, agentResults()) }) as never;
    });

    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/research/reports?symbol=600519&report=9']}>
          <Research />
        </MemoryRouter>
      </LanguageProvider>,
    );

    await screen.findByText('摘要正文');
    expect(screen.queryByText(t('deep.report.truncatedByDeadline'))).toBeNull();
  }, 30_000);

  it('实时：SSE done 携带 truncated_by_deadline=true ⇒ 同一条提示同样出现', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [] } } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: {} }));
    vi.mocked(readSSE).mockImplementation(async (_body, onEvent) => {
      onEvent({ event: 'agent_started', data: { role_key: 'business_analyst' } } as never);
      onEvent({
        event: 'done',
        data: {
          report: { company_name: '贵州茅台', quality: 'degraded', executive_summary: '摘要正文', truncated_by_deadline: true },
          quality: 'degraded',
          truncated_by_deadline: true,
          agent_results: agentResults({
            risk_assessor: {
              name: '风险评估师',
              content: '风险分析（部分）',
              status: 'degraded',
              degraded_reasons: ['deadline_exceeded'],
            },
          }),
        },
      } as never);
    });

    render(
      <LanguageProvider>
        <MemoryRouter>
          <Research initialTicker="600519" />
        </MemoryRouter>
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /开始研究/ }));

    await waitFor(() => {
      expect(screen.getByText(t('deep.report.truncatedByDeadline'))).toBeTruthy();
    });
    expect(screen.getByText('风险评估：已降级（产出可能不完整）—— 原因：超过研究总时长上限，分析被提前结束（已完成的部分已保留）'))
      .toBeTruthy();
    vi.unstubAllGlobals();
  }, 30_000);
});

describe('VS27：信号读取是纯粹且同源的', () => {
  it('顶层与嵌套两种形态都认；false/缺失一律不算截断', () => {
    expect(resolveTruncatedByDeadline({ truncated_by_deadline: true })).toBe(true);
    expect(resolveTruncatedByDeadline({ report: { truncated_by_deadline: true } })).toBe(true);
    expect(resolveTruncatedByDeadline({ truncated_by_deadline: false, report: { truncated_by_deadline: true } })).toBe(false);
    expect(resolveTruncatedByDeadline({ report: {} })).toBe(false);
    expect(resolveTruncatedByDeadline(undefined)).toBe(false);
  });

  it('deadline_exceeded 是已登记的原因码（不是原样打印的裸码）', () => {
    const outcomes = deriveAgentOutcomes({
      financial_analyst: { name: '财务分析师', content: '部分', status: 'degraded', degraded_reasons: ['deadline_exceeded'] },
    });
    expect(outcomes.financial_analyst).toMatchObject({ status: 'completed', degraded: true, degradedReasons: ['deadline_exceeded'] });
    const reason = describeOutcomeReason(outcomes.financial_analyst, t);
    expect(reason).toBe('超过研究总时长上限，分析被提前结束（已完成的部分已保留）');
    expect(reason).not.toContain('deadline_exceeded');
  });
});
