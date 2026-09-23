// @vitest-environment jsdom
//
// VS13 接线防线：用**真实组件 + 真实 SSE 解析路径**验证 `agent_failed` 的 switch 接线。
//
// 为什么需要这个文件（评估者 F1）：
//   `ResearchAgentFailed.test.tsx` 只驱动导出纯函数 `applyAgentEvent`，**从不渲染页面**。
//   因此它守不住本卡真正的逃逸路径——`Research.tsx` 的 `case 'agent_failed'`：
//   把那一条 case 删掉，纯函数测试**依然全绿**（它根本没引用页面默认导出）。
//   "删掉缺陷修复仍然全绿"的测试会制造虚假信心，故在此补上会真挂的接线防线。
//
// 覆盖的真实链路：mock `fetch` 返回 `ReadableStream` → `services/sse.ts` 解析并 dispatch
// → `Research.tsx` 的 switch → `applyAgentEvent` → `AgentStatusCard` 渲染 failed + 原因。
//
// harness 写法参考 `tests/ResearchDeepPlan.test.tsx`。

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { message } from 'antd';

import Research from '../src/pages/Research';
import apiClient from '../src/services/api';
import { LanguageProvider } from '../src/i18n/LanguageContext';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

/** 构造一个真实 ReadableStream，按 SSE 文本协议编码事件（与后端 sse-starlette 同形）。 */
function sseBody(events: Array<{ event: string; data: unknown }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      }
      controller.close();
    },
  });
}

describe('Research SSE 接线 — agent_failed', () => {
  beforeEach(() => {
    localStorage.setItem('finquant_lang', 'zh');
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [] } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  });

  it('把失败 Agent 的卡片终结为 failed 并显示原因，且不弹全局错误、不误报整轮失败', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: sseBody([
        { event: 'report_started', data: { report_id: 1 } },
        { event: 'agent_started', data: { role_key: 'financial_analyst' } },
        // 后端 research_orch 的两条非致命失败路径发的都是这个事件（载荷用 role_key + error）
        { event: 'agent_failed', data: { role_key: 'financial_analyst', error: '研究 Agent 异常：boom' } },
        { event: 'agent_completed', data: { role_key: 'risk_assessor' } },
        { event: 'done', data: { report: { company_name: '贵州茅台' }, quality: 'degraded' } },
      ]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LanguageProvider>
        <MemoryRouter>
          <Research initialTicker="600519" />
        </MemoryRouter>
      </LanguageProvider>,
    );

    const startBtn = await screen.findByRole('button', { name: /开始/ });
    fireEvent.click(startBtn);

    // ① 失败原因文本：只有 switch -> applyAgentEvent -> progress -> AgentStatusCard.stage 这一条路能渲染它
    expect(await screen.findByText('研究 Agent 异常：boom')).toBeTruthy();
    // ② 恰好一张卡片进入失败态（finance 之外的 Agent 不受影响）
    await waitFor(() => {
      expect(container.querySelectorAll('.agent-status-card--failed').length).toBe(1);
    });
    expect(screen.getAllByText('失败，可继续').length).toBe(1);
    // ③ agent_failed 非致命：不得弹全局错误提示
    await waitFor(() => expect(errorSpy).not.toHaveBeenCalled());
    // ④ 整轮仍正常完成并显示降级横幅（不误报整轮失败）
    expect(screen.getAllByText(/不完整|降级/).length).toBeGreaterThan(0);
  }, 60_000);
});
