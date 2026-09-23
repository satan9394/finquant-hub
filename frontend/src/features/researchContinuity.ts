import type { ResearchReportDetail } from '../types/research';
import { tickerContract } from './tickerContract';

export function tickerKey(value: string): string {
  const parsed = tickerContract(value);
  if (parsed.kind !== 'supported') return `RAW:${value.trim().toUpperCase()}`;
  if (parsed.market === 'sh' || parsed.market === 'sz') return `CN:${parsed.canonical.slice(2)}`;
  if (parsed.market === 'hk') return `HK:${parsed.canonical.slice(2)}`;
  return `US:${parsed.canonical.slice(2)}`;
}

export function sameTicker(left: string, right: string): boolean {
  return tickerKey(left) === tickerKey(right);
}

export function matchesResearchSubject(text: string, symbol: string, name?: string): boolean {
  const compact = text.toUpperCase().replace(/\s+/g, '');
  const keys = [
    symbol.toUpperCase(),
    tickerKey(symbol).split(':')[1],
    name?.toUpperCase().replace(/\s+/g, ''),
  ].filter((item): item is string => Boolean(item));
  return keys.some((key) => compact.includes(key));
}

export function reportCoreText(report: ResearchReportDetail): string | null {
  const data = report.report_data ?? {};
  for (const key of ['executive_summary', 'investment_conclusion', 'verdict']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (Array.isArray(data.chapters)) {
    const conclusion = data.chapters.find((chapter) => (
      typeof chapter === 'object' && chapter !== null
      && ['investment_conclusion', 'verdict'].includes(String((chapter as { key?: unknown }).key ?? ''))
    )) as { content?: unknown } | undefined;
    if (typeof conclusion?.content === 'string' && conclusion.content.trim()) return conclusion.content.trim();
  }
  return null;
}

type Translate = (key: string) => string;

export function compareReportViewpoints(reports: ResearchReportDetail[], t?: Translate): string {
  const comparable = reports.map(reportCoreText).filter((text): text is string => Boolean(text)).slice(0, 2);
  if (!reports.length) return t ? t('research.continuity.compare.none') : '暂无历史报告，无法比较观点变化';
  if (reports.length === 1) return t ? t('research.continuity.compare.one') : '仅有一个报告版本，尚无可比较的观点变化';
  if (comparable.length < 2) return t ? t('research.continuity.compare.missing') : '最近两版缺少可比较的核心结论文本';
  return comparable[0] === comparable[1]
    ? (t ? t('research.continuity.compare.same') : '最新两版核心结论文本未变化')
    : (t ? t('research.continuity.compare.changed') : '最新两版核心结论文本有变化，请逐版核对差异');
}

export function reportUrls(report: ResearchReportDetail): string[] {
  const text = JSON.stringify({ report_data: report.report_data, agent_results: report.agent_results });
  return [...new Set(text.match(/https?:\/\/[^\s"'<>\\]+/g) ?? [])];
}
