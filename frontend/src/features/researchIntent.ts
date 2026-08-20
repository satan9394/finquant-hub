export type ResearchIntent = 'quick' | 'deep' | 'review';

export const RESEARCH_INTENTS: Array<{
  key: ResearchIntent;
  title: string;
  purpose: string;
  output: string;
  duration: string;
  budget: string;
  finalAction: string;
}> = [
  {
    key: 'quick',
    title: '快速问答',
    purpose: '解释一个具体问题，适合先澄清概念或缩小研究范围。',
    output: '单次回答；可继续追问。',
    duration: '相对耗时：短。',
    budget: '模型额度：发送后消耗一次回答。',
    finalAction: '在问答页点击“发送”。',
  },
  {
    key: 'deep',
    title: '深度研究',
    purpose: '从商业、财务、行业和风险角度生成可保存的结构化报告。',
    output: '多角色分析、13 章报告和历史版本。',
    duration: '相对耗时：长，受数据源和模型影响。',
    budget: '模型额度：多个角色与报告整合，消耗较高。',
    finalAction: '在深度研究页点击“开始研究”。',
  },
  {
    key: 'review',
    title: '多视角审查',
    purpose: '主动寻找反证、分歧和脆弱假设，适合挑战已有观点。',
    output: '至少三位角色的多轮讨论与总结。',
    duration: '相对耗时：中长，随角色和轮次增加。',
    budget: '模型额度：多角色多轮调用，消耗较高。',
    finalAction: '创建房间后点击“开始讨论”。',
  },
];

export function researchIntentPath(intent: ResearchIntent, symbol: string): string {
  const target = symbol.trim().toUpperCase();
  if (intent === 'deep') return `/research/reports?symbol=${encodeURIComponent(target)}`;
  if (intent === 'review') {
    return `/discussion?topic=${encodeURIComponent(`${target} 多视角审查：寻找反证、分歧和脆弱假设`)}`;
  }
  return `/chat?prompt=${encodeURIComponent(`请解释 ${target} 当前最值得核验的三项研究问题，并区分事实、推断和未知。`)}`;
}
