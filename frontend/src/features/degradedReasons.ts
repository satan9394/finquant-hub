/**
 * VS-20 契约的**展示端**共享件：`degraded_reasons` 原因码 → i18n 键。
 *
 * 原先只存在于 `pages/Research.tsx` 内部；VS-35 起 swarm 卡片也要展示同一批原因码，
 * 两处各存一份就会漂移（仓内铁律：同一件事的两条路径必须同源），故提到这里共用。
 *
 * 未知码**原样展示**（如实，不编造）——绝不把不认识的原因悄悄吞掉。
 */
export const DEGRADED_REASON_KEYS: Record<string, string> = {
  tool_failed: 'deep.agent.reason.toolFailed',
  tool_loop_exhausted: 'deep.agent.reason.toolLoopExhausted',
  empty_content: 'deep.agent.reason.emptyContent',
  output_truncated: 'deep.agent.reason.outputTruncated',
  // VS27：整轮截止（research_orch.DEADLINE_REASON_*）。这是"提前结束"在**环节级**
  // 的可见文案；报告级另有 resolveTruncatedByDeadline 的提示条。
  deadline_exceeded: 'deep.agent.reason.deadlineExceeded',
  deadline_exceeded_before_start: 'deep.agent.reason.deadlineBeforeStart',
};

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** 把任意载荷里的原因码数组收敛成非空字符串码（非法项丢弃，不编造）。 */
export function reasonCodes(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

/** 原因码 → 一行可读摘要；**没有**原因码时返回 undefined（调用方须如实显示"原因未记录"）。 */
export function describeDegradedReasons(codes: string[], t: Translate): string | undefined {
  if (!codes.length) return undefined;
  return codes
    .map((code) => (DEGRADED_REASON_KEYS[code] ? t(DEGRADED_REASON_KEYS[code]) : code))
    .join('、');
}
