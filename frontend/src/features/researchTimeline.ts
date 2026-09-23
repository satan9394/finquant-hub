import { readPortfolioReviews, type PortfolioReview } from './comparisonWorkspace';
import type {
  ResearchHistoryGroup, ResearchThesisSummary, ResearchWorkspace,
} from '../types/research';

export type ResearchTimelineEntry = {
  id: string;
  source: 'workspace' | 'report' | 'thesis' | 'portfolio_review';
  persistence: 'server' | 'local';
  title: string;
  object: string;
  occurredAt: string;
  status: string;
  detail: string;
  href: string;
  dueAt?: string;
};

const known = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());

function timestamp(value: unknown): string {
  return known(value) ? value.trim() : 'UNKNOWN';
}

function timeValue(value: string): number {
  if (value === 'UNKNOWN') return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value.replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function buildResearchTimeline(
  workspaces: ResearchWorkspace[],
  history: ResearchHistoryGroup[],
  theses: ResearchThesisSummary[],
  reviews: PortfolioReview[] = readPortfolioReviews(),
): ResearchTimelineEntry[] {
  const entries: ResearchTimelineEntry[] = [
    ...workspaces.filter((item) => item.saved !== false).map((item) => ({
      id: `workspace:${item.id ?? item.symbol.toUpperCase()}`,
      source: 'workspace' as const,
      persistence: 'server' as const,
      title: '研究工作区更新',
      object: item.name?.trim() || item.symbol.toUpperCase(),
      occurredAt: timestamp(item.updated_at),
      status: item.updated_at ? '已保存' : '时间未知',
      detail: `${item.symbol.toUpperCase()} · ${item.evidence?.length ?? 0} 条保存证据`,
      href: `/research/${encodeURIComponent(item.symbol)}`,
    })),
    ...history.flatMap((group) => group.runs.map((report) => ({
      id: `report:${report.id}`,
      source: 'report' as const,
      persistence: 'server' as const,
      title: '深度报告状态',
      object: report.company_name?.trim() || report.ticker.toUpperCase(),
      occurredAt: timestamp(report.updated_at ?? report.created_at),
      status: report.status,
      detail: `报告 #${report.id} · 创建 ${timestamp(report.created_at)} · 更新 ${timestamp(report.updated_at)}`,
      href: `/research/reports?symbol=${encodeURIComponent(report.ticker)}&report=${report.id}`,
    }))),
    ...theses.map((thesis) => ({
      id: `thesis:${thesis.id}`,
      source: 'thesis' as const,
      persistence: 'server' as const,
      title: thesis.drift_status === 'drifted' ? '论文观点发生漂移' : '论文更新',
      object: thesis.title,
      occurredAt: timestamp(thesis.updated_at),
      status: `${thesis.status} · ${thesis.drift_status}`,
      detail: `${thesis.ticker.toUpperCase()} · 来源报告 ${thesis.source_report_id ? `#${thesis.source_report_id}` : '手动'}`,
      href: `/thesis?id=${thesis.id}`,
    })),
    ...reviews.map((review) => ({
      id: `portfolio-review:${review.id}`,
      source: 'portfolio_review' as const,
      persistence: 'local' as const,
      title: '组合复盘待办',
      object: review.portfolio,
      occurredAt: timestamp(review.createdAt),
      dueAt: timestamp(review.dueAt),
      status: review.completed ? '已完成' : '待复盘',
      detail: review.summary,
      href: '/portfolio',
    })),
  ];

  return [...new Map(entries.map((entry) => [entry.id, entry])).values()].sort((left, right) => (
    timeValue(right.occurredAt) - timeValue(left.occurredAt) || left.id.localeCompare(right.id)
  ));
}
