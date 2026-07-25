/* ============================================================
 * analysisApi — 分析/研究/投资组合/信号 API 客户端
 * ============================================================ */
import apiClient from './api';
import type {
  AnalysisRequest,
  AnalysisResponse,
  PortfolioGroup,
  PortfolioSummary,
  PortfolioHolding,
  PortfolioAllocation,
  SignalSummary,
} from '../types';

// ==================== 股票分析 ====================

/** 请求可即时完成的技术分析；深度 LLM 研究由 /research 页面承载。 */
export async function requestAnalysis(data: AnalysisRequest): Promise<AnalysisResponse> {
  const res = await apiClient.get(`/analysis/${encodeURIComponent(data.ticker)}/indicators`);
  const raw = res.data;
  const scoring = raw.scoring ?? {};
  const components = scoring.components ?? {};
  const content = [
    `综合技术评分：${scoring.composite_score ?? '--'}（范围 -100 至 +100）`,
    `趋势：${components.trend?.score ?? '--'}；动量：${components.momentum?.score ?? '--'}；成交量：${components.volume?.score ?? '--'}。`,
    '评分基于当前可用行情与技术指标，仅供研究参考，不构成投资建议。',
  ].join('\n');
  return {
    ticker: raw.ticker ?? data.ticker,
    name: raw.ticker ?? data.ticker,
    sections: [{ title: '技术指标评分', content, order: 1 }],
    signals: (raw.signals ?? []).slice(-8).map((signal: { direction?: string; type?: string; description?: string }) => ({
      type: signal.direction === 'bullish' ? 'bullish' : signal.direction === 'bearish' ? 'bearish' : 'neutral',
      label: signal.type ?? '技术信号',
      description: signal.description,
    })),
    generated_at: new Date().toISOString(),
  };
}

// ==================== 投资组合 ====================

/** 获取分组列表 */
export async function fetchPortfolioGroups(): Promise<PortfolioGroup[]> {
  const res = await apiClient.get('/portfolio');
  return res.data.items ?? [];
}

/** 新建可承载持仓的投资组合。 */
export async function createPortfolio(data: { name: string; description?: string; currency?: string }): Promise<PortfolioGroup> {
  const res = await apiClient.post('/portfolio', data);
  return res.data;
}

/** 获取投资组合摘要 */
export async function fetchPortfolioSummary(): Promise<PortfolioSummary> {
  const groups = await fetchPortfolioGroups();
  const reports = await Promise.all(groups.map((group) => apiClient.get(`/portfolio/${group.id}/pnl`)));
  const group_summaries = reports.map((res, index) => ({
    group_id: groups[index].id,
    group_name: groups[index].name,
    invested: res.data.total_cost,
    current: res.data.total_market_value,
    profit: res.data.total_pnl,
    profit_percent: res.data.total_pnl_pct,
  }));
  const total_invested = group_summaries.reduce((sum, item) => sum + item.invested, 0);
  const total_current = group_summaries.reduce((sum, item) => sum + item.current, 0);
  return {
    total_invested,
    total_current,
    total_profit: total_current - total_invested,
    total_profit_percent: total_invested ? (total_current - total_invested) / total_invested * 100 : 0,
    group_summaries,
  };
}

/** 获取持仓列表 */
export async function fetchPortfolioHoldings(groupId?: number): Promise<PortfolioHolding[]> {
  if (groupId == null) return [];
  const res = await apiClient.get(`/portfolio/${groupId}/pnl`);
  return (res.data.positions ?? []).map((position: any) => ({
    id: position.id, group_id: groupId, code: position.ticker, name: position.name,
    shares: position.shares, cost_price: position.avg_cost, current_price: position.current_price,
    market_value: position.market_value, cost_value: position.cost,
    profit: position.pnl, profit_percent: position.pnl_pct,
  }));
}

/** 添加持仓 */
export async function addPortfolioHolding(data: {
  group_id: number;
  code: string;
  name?: string;
  shares: number;
  cost_price: number;
}): Promise<PortfolioHolding> {
  const res = await apiClient.post(`/portfolio/${data.group_id}/positions`, {
    ticker: data.code, name: data.name, shares: data.shares, avg_cost: data.cost_price,
  });
  return { ...res.data, group_id: data.group_id, code: res.data.ticker, cost_price: res.data.avg_cost };
}

/** 更新持仓 */
export async function updatePortfolioHolding(
  id: number,
  data: Partial<Pick<PortfolioHolding, 'shares' | 'cost_price' | 'group_id'>>
): Promise<PortfolioHolding> {
  const res = await apiClient.put(`/portfolio/positions/${id}`, {
    shares: data.shares, avg_cost: data.cost_price,
  });
  return { ...res.data, code: res.data.ticker, cost_price: res.data.avg_cost };
}

/** 删除持仓 */
export async function deletePortfolioHolding(id: number): Promise<void> {
  await apiClient.delete(`/portfolio/positions/${id}`);
}

/** 获取持仓配置分布 */
export async function fetchPortfolioAllocation(): Promise<PortfolioAllocation[]> {
  const summary = await fetchPortfolioSummary();
  return summary.group_summaries.map((group) => ({
    group_id: group.group_id,
    group_name: group.group_name,
    weight: summary.total_current ? group.current / summary.total_current : 0,
    items: [],
  }));
}

// ==================== 信号 ====================

/** 获取信号摘要 */
export async function fetchSignalSummary(): Promise<SignalSummary> {
  const res = await apiClient.get('/signals/summary');
  return res.data;
}
