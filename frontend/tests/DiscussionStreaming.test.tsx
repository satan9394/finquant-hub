// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';
import {
  interruptDiscussionStream,
  reduceDiscussionStream,
  type DiscussionStreamingByAgent,
} from '../src/features/discussionStream';

describe('Discussion stream reducer', () => {
  test('collects an agent lifecycle and preserves its round and final content', () => {
    let state: DiscussionStreamingByAgent = {};
    state = reduceDiscussionStream(state, 'agent_start', { agent: 'value_investor', name: '价值投资官', round: 1 });
    state = reduceDiscussionStream(state, 'token', { delta: '我认为' });
    state = reduceDiscussionStream(state, 'token', { agent: 'value_investor', delta: '估值合理' });
    state = reduceDiscussionStream(state, 'agent_end', { agent: 'value_investor', message_id: 31, token_count: 8 });

    expect(state.value_investor).toEqual({ round: 1, content: '我认为估值合理', status: 'completed' });
  });

  test('marks the current agent failed when the stream emits an error', () => {
    const running = reduceDiscussionStream({}, 'agent_start', { agent: 'risk_manager', round: 2 });
    const failed = reduceDiscussionStream(running, 'error', { error: '讨论上游失败' });

    expect(failed.risk_manager.status).toBe('failed');
  });

  test('settles a running entry when summary or done closes the stream', () => {
    const running = reduceDiscussionStream({}, 'agent_start', { agent: 'quant_researcher', round: 3 });
    const summarized = reduceDiscussionStream(running, 'summary', { content: '讨论总结' });
    const done = reduceDiscussionStream(summarized, 'done', { room_id: 9 });

    expect(done.quant_researcher.status).toBe('completed');
  });

  test('fails a previous running entry before a new agent starts', () => {
    const running = reduceDiscussionStream({}, 'agent_start', { agent: 'value_investor', round: 1 });
    const interrupted = interruptDiscussionStream(reduceDiscussionStream(running, 'token', { delta: '部分文本' }));

    expect(interrupted.value_investor).toEqual({ round: 1, content: '部分文本', status: 'failed' });
  });

  test('ignores unrelated frames without changing state', () => {
    const state = { risk_manager: { round: 1, content: '完成', status: 'completed' as const } };
    expect(reduceDiscussionStream(state, 'round_start', { round: 2 })).toBe(state);
  });
});
