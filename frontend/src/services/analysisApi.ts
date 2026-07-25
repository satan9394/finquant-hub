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
  ScreenRequest,
  ScreenResult,
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
  const res = await apiClient.get('/portfolio/groups');
  return res.data.items ?? [];
}

/** 获取投资组合摘要 */
export async function fetchPortfolioSummary(): Promise<PortfolioSummary> {
  const res = await apiClient.get('/portfolio/summary');
  return res.data;
}

/** 获取持仓列表 */
export async function fetchPortfolioHoldings(groupId?: number): Promise<PortfolioHolding[]> {
  const params = groupId != null ? { group_id: groupId } : {};
  const res = await apiClient.get('/portfolio/holdings', { params });
  return res.data.items ?? [];
}

/** 添加持仓 */
export async function addPortfolioHolding(data: {
  group_id: number;
  code: string;
  name: string;
  shares: number;
  cost_price: number;
}): Promise<PortfolioHolding> {
  const res = await apiClient.post('/portfolio/holdings', data);
  return res.data;
}

/** 更新持仓 */
export async function updatePortfolioHolding(
  id: number,
  data: Partial<Pick<PortfolioHolding, 'shares' | 'cost_price' | 'group_id'>>
): Promise<PortfolioHolding> {
  const res = await apiClient.put(`/portfolio/holdings/${id}`, data);
  return res.data;
}

/** 删除持仓 */
export async function deletePortfolioHolding(id: number): Promise<void> {
  await apiClient.delete(`/portfolio/holdings/${id}`);
}

/** 获取持仓配置分布 */
export async function fetchPortfolioAllocation(): Promise<PortfolioAllocation[]> {
  const res = await apiClient.get('/portfolio/allocation');
  return res.data.items ?? [];
}

// ==================== 信号 ====================

/** 获取信号摘要 */
export async function fetchSignalSummary(): Promise<SignalSummary> {
  const res = await apiClient.get('/signals/summary');
  return res.data;
}

// ==================== 选股器 ====================

/** 获取选股结果 */
export async function fetchScreenResults(params: ScreenRequest): Promise<ScreenResult[]> {
  const res = await apiClient.get('/screening/results', { params });
  return res.data.items ?? [];
}
