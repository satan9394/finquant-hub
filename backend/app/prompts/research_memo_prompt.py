"""投资研究备忘录模板（11 节）。

用于 research_orch 完成后将四个 Agent 的分析结果整合为结构化备忘录。
"""
RESEARCH_MEMO_TEMPLATE = """# 投资研究备忘录

**标的**：{ticker_name}（{ticker}）
**生成时间**：{timestamp}
**数据截止**：{data_date}

---

## 1. 核心摘要

{executive_summary}

**综合倾向**：{verdict}
**置信度**：{confidence}

---

## 2. 公司概览

- 公司全称：{company_name}
- 所属行业：{industry}
- 上市地点：{market}
- 当前股价：{price} {currency}
- 总市值：{market_cap} {currency}
- 52周范围：{year_range}

---

## 3. 商业模式分析

{business_model_analysis}

---

## 4. 行业与竞争格局

{industry_analysis}

---

## 5. 财务分析

### 关键财务数据

{financial_highlights}

### 估值分析

| 指标 | 当前值 | 行业均值 | 历史分位 |
|------|--------|----------|----------|
{valuation_table}

---

## 6. 技术分析

{technical_analysis}

---

## 7. 风险分析

{risk_analysis}

---

## 8. 催化剂与事件日历

{catalysts}

---

## 9. 多情景分析

### 乐观情景（概率 {bull_prob}%）
{bull_case}

### 中性情景（概率 {base_prob}%）
{base_case}

### 悲观情景（概率 {bear_prob}%）
{bear_case}

---

## 10. 关键问题清单

{key_questions}

---

## 11. 参考来源

{references}

---

*此研究报告由 AI 生成，仅供参考，不构成投资建议。投资有风险，决策需谨慎。*
"""


def get_memo_sections() -> list[str]:
    """返回各节标题，用于流式生成时跟踪进度。"""
    return [
        "核心摘要",
        "公司概览",
        "商业模式分析",
        "行业与竞争格局",
        "财务分析",
        "技术分析",
        "风险分析",
        "催化剂与事件日历",
        "多情景分析",
        "关键问题清单",
        "参考来源",
    ]
