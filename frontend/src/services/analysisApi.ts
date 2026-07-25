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

/** 请求 AI 股票分析（POST /api/analysis/stock） */
export async function requestAnalysis(data: AnalysisRequest): Promise<AnalysisResponse> {
  const res = await apiClient.post('/analysis/stock', data);
  return res.data;
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
