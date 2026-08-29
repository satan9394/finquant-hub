import type { ResearchReportDetail } from '../types/research';

export function tickerKey(value: string): string {
  const raw = value.trim();
  const canonical = raw.match(/^(sh|sz|bj)(\d{6})$/);
  if (canonical) return `CN:${canonical[2]}`;
  const canonicalHk = raw.match(/^hk(\d{4,5})$/);
  if (canonicalHk) return `HK:${canonicalHk[1].padStart(5, '0')}`;
  const canonicalUs = raw.match(/^us([A-Za-z][A-Za-z0-9.-]*)$/);
  if (canonicalUs) return `US:${canonicalUs[1].toUpperCase()}`;

  const upper = raw.toUpperCase();
  if (/^\d{6}$/.test(upper)) return `CN:${upper}`;
  const externalHk = upper.match(/^(\d{4,5})(?:\.HK)?$/);
  if (externalHk) return `HK:${externalHk[1].padStart(5, '0')}`;
  return `US:${upper}`;
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
