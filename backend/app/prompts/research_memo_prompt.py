"""Canonical 13-chapter research report contract."""

REPORT_CHAPTERS = (
    ("company_overview", "公司概况"),
    ("industry_analysis", "行业分析"),
    ("business_model_analysis", "主营业务分析"),
    ("financial_overview", "财务概览"),
    ("profitability_analysis", "盈利能力分析"),
    ("growth_analysis", "成长能力分析"),
    ("solvency_analysis", "偿债能力分析"),
    ("operating_efficiency_analysis", "运营能力分析"),
    ("cash_flow_analysis", "现金流分析"),
    ("shareholder_analysis", "股东结构分析"),
    ("institutional_rating", "机构评级"),
    ("risk_analysis", "风险提示"),
    ("investment_conclusion", "投资结论"),
)


def get_memo_sections() -> list[str]:
    return [title for _key, title in REPORT_CHAPTERS]
