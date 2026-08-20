const categoryExplanations: Record<string, { label: string; description: string }> = {
  Fundamental: { label: '基本面数据', description: '财务报表、资产负债与经营结果字段。' },
  Analyst: { label: '分析师预期', description: '盈利预测、目标与修正等共识字段。' },
  News: { label: '新闻事件', description: '新闻、事件与文本衍生字段。' },
  'Price Volume': { label: '价格与成交', description: '价格、成交量、VWAP 与流动性字段。' },
  Option: { label: '期权数据', description: '期权定价、波动率与期限结构字段。' },
  Model: { label: '模型衍生', description: '由已有数据计算的模型或风险字段。' },
  'Social Media': { label: '社交媒体', description: '社交热度、情绪与文本向量字段。' },
};

const templateExplanations: Record<string, { category: string; hypothesis: string; limitation: string }> = {
  fundamental_quality: {
    category: '基本面',
    hypothesis: '经营利润相对股东权益持续较高的公司，可能具有更稳定的经营质量。',
    limitation: '季度字段覆盖有限，行业中性只能减少行业差异，不能消除会计口径和估值风险。',
  },
  free_cash_flow_yield: {
    category: '基本面',
    hypothesis: '自由现金流相对股东权益较高的公司，可能具备更强的现金创造能力。',
    limitation: '季度现金流可能波动且 coverage 不完整；该比率不是市值口径的估值收益率。',
  },
  analyst_earnings_yield: {
    category: '分析师预期',
    hypothesis: '预期每股收益相对价格较高的股票，可能反映更低的预期盈利定价。',
    limitation: '依赖分析师预测与覆盖，存在修正滞后、幸存者偏差和预期失准风险。',
  },
  price_reversal: {
    category: '价格行为',
    hypothesis: '当日开收盘跌幅较大的股票，短期可能出现价格反转。',
    limitation: '反转可能只是下跌延续；高换手、交易成本和涨跌停会削弱可实现性。',
  },
  volume_price_divergence: {
    category: '量价关系',
    hypothesis: '成交量与 VWAP 排名近期背离时，价格与交易活跃度可能暂时失衡。',
    limitation: '相关性不等于因果；窗口、流动性和市场状态变化可能让信号失效。',
  },
};

export function explainAlphaCategory(name: string) {
  return categoryExplanations[name] ?? {
    label: name,
    description: '接口返回的新类别，当前版本尚无专门说明。',
  };
}

export function explainAlphaTemplate(id: string) {
  return templateExplanations[id] ?? {
    category: '未分类',
    hypothesis: '接口返回的新模板，当前版本尚无通俗假设说明。',
    limitation: '请先核对表达式、真实字段和设置，再决定是否模拟。',
  };
}

export function formatAlphaCoverage(coverage: number | null | undefined) {
  return coverage == null ? 'UNKNOWN' : `${(coverage * 100).toFixed(1)}%`;
}
