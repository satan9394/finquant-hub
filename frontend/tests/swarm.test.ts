import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  applySwarmEvent,
  cancelSwarmRun,
  createSwarmRunState,
  swarmProgress,
  swarmToolCalls,
  type SwarmTeamDefinition,
} from '../src/features/swarm/state';
import { parseSSEChunk, streamEarningsReview, streamFourMasters } from '../src/services/swarmApi';
import { readSSE } from '../src/services/sse';

afterEach(() => vi.unstubAllGlobals());

const team: SwarmTeamDefinition = {
  key: 'four-masters',
  name: '四大师投研团队',
  description: 'test',
  agents: [
    { key: 'value_investor', name: '价值投资官', avatar: 'V', dependencies: [], tools: ['stock'] },
    { key: 'tech_analyst', name: '技术分析师', avatar: 'T', dependencies: [], tools: ['chart'] },
    { key: 'macro_strategist', name: '宏观策略师', avatar: 'M', dependencies: [], tools: ['news'] },
    {
      key: 'risk_manager', name: '风控委员', avatar: 'R',
      dependencies: ['value_investor', 'tech_analyst', 'macro_strategist'], tools: ['stock'],
    },
  ],
};

describe('Swarm state machine', () => {
  test('tracks progress, tools, per-agent tokens and final results', () => {
    let state = createSwarmRunState(team);
    state = applySwarmEvent(state, { event: 'report_started', data: { report_id: 17 } });
    state = applySwarmEvent(state, { event: 'team_started', data: {} });
    state = applySwarmEvent(state, { event: 'agent_started', data: { role_key: 'value_investor' } });
    state = applySwarmEvent(state, { event: 'tool_call', data: { role_key: 'value_investor' } });
    state = applySwarmEvent(state, {
      event: 'agent_completed', data: { role_key: 'value_investor', token_count: 42 },
    });

    expect(state.status).toBe('running');
    expect(state.reportId).toBe(17);
    expect(state.agents.value_investor.status).toBe('completed');
    expect(state.agents.value_investor.tokenCount).toBe(42);
    expect(state.totalTokens).toBe(42);
    expect(swarmToolCalls(state)).toBe(1);
    expect(swarmProgress(state)).toBe(25);

    state = applySwarmEvent(state, {
      event: 'done',
      data: {
        status: 'completed',
        token_count: 180,
        agent_results: {
          value_investor: { content: '价值结论', token_count: 42 },
          tech_analyst: { content: '技术结论', token_count: 40 },
          macro_strategist: { content: '宏观结论', token_count: 38 },
          risk_manager: { content: '风控结论', token_count: 60 },
        },
      },
    });

    expect(state.status).toBe('completed');
    expect(state.totalTokens).toBe(180);
    expect(state.agents.risk_manager.content).toBe('风控结论');
    expect(swarmProgress(state)).toBe(100);
  });

  test('keeps partial failures and supports local cancellation', () => {
    let state = { ...createSwarmRunState(team), status: 'running' as const };
    state = applySwarmEvent(state, {
      event: 'agent_started', data: { role_key: 'value_investor' },
    });
    state = applySwarmEvent(state, {
      event: 'agent_failed', data: { role_key: 'value_investor', error: 'boom' },
    });
    state = applySwarmEvent(state, {
      event: 'agent_skipped', data: { role_key: 'risk_manager' },
    });
    expect(state.agents.value_investor.error).toBe('boom');
    expect(state.agents.risk_manager.status).toBe('skipped');

    state = applySwarmEvent(state, {
      event: 'agent_started', data: { role_key: 'tech_analyst' },
    });
    state = cancelSwarmRun(state);
    expect(state.status).toBe('cancelled');
    expect(state.agents.tech_analyst.status).toBe('cancelled');
  });
});

describe('Swarm SSE parser', () => {
  test('handles CRLF frames and preserves an incomplete trailing frame', () => {
    const first = parseSSEChunk(
      'event: agent_started\r\ndata: {"role_key":"value_investor"}\r\n\r\n'
      + 'event: agent_completed\r\ndata: {"role_key":"value_investor"',
    );
    expect(first.events).toEqual([
      { event: 'agent_started', data: { role_key: 'value_investor' } },
    ]);
    expect(first.remainder.startsWith('event: agent_completed')).toBe(true);

    const second = parseSSEChunk(`${first.remainder},"token_count":42}\r\n\r\n`);
    expect(second.events[0]).toEqual({
      event: 'agent_completed',
      data: { role_key: 'value_investor', token_count: 42 },
    });
    expect(second.remainder).toBe('');
  });

  test('shared reader handles fragmented CRLF frames, heartbeats and final flush', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: token\r\nda',
      'ta: {"delta":"你"}\r\n\r\n: ping\r\n\r\n',
      'event: done\ndata: {"message_id":7}',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];

    await readSSE(stream, (event) => events.push(event));

    expect(events).toEqual([
      { event: 'token', data: { delta: '你' } },
      { event: 'done', data: { message_id: 7 } },
    ]);
  });

  test('shared reader reports missing bodies and cancels after consumer failure', async () => {
    await expect(readSSE(null, () => undefined, '没有事件流')).rejects.toThrow('没有事件流');

    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: token\ndata: {"delta":"x"}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });

    await expect(readSSE(stream, () => { throw new Error('consumer failed'); }))
      .rejects.toThrow('consumer failed');
    expect(cancelled).toBe(true);
  });

  test('uses the product analyze endpoint and forwards the saved report id', async () => {
    const frames = [
      'event: report_started\ndata: {"report_id":17}\n\n',
      'event: done\ndata: {"status":"completed","report_id":17,"agent_results":{}}\n\n',
    ].join('');
    const fetchMock = vi.fn().mockResolvedValue(new Response(frames, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const events: { event: string; data: Record<string, unknown> }[] = [];

    const terminal = await streamFourMasters(
      'usAAPL',
      7,
      (event) => events.push(event),
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/swarm/analyze');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ticker: 'usAAPL', model_id: 7 });
    expect(events.map((event) => event.event)).toEqual(['report_started', 'done']);
    expect(events[0].data.report_id).toBe(17);
    expect(terminal).toBe('done');
  });

  test('uses the earnings-review endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      'event: done\ndata: {"status":"completed"}\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const terminal = await streamEarningsReview(
      'usAAPL',
      null,
      () => undefined,
      new AbortController().signal,
    );

    expect(fetchMock.mock.calls[0][0]).toBe('/api/swarm/teams/earnings-review/run');
    expect(terminal).toBe('done');
  });
});
