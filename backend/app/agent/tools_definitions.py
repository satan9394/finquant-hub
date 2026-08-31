"""具体 Agent 工具定义。

每个工具继承 BaseTool，注册到 ToolRegistry。
工具按领域分：行情、技术指标、估值验算、选股、新闻搜索、精确计算。
"""
from decimal import Decimal, Context, ROUND_HALF_EVEN
from typing import Any

from ..agent.tools import BaseTool, ToolResult, ToolRegistry
from ..services.a_stock_extra import AStockExtraError, AStockExtraService
from ..services.market_data import MarketDataService
from ..services.news_search import NewsSearchService
from ..tools.trading_analysis import analyze_shadow_trades, connector_design_assessment
from ..tools.report_audit import extract_data_points, render_verdict, sample_points
from ..tools.stock_screener import screen as run_stock_screen

# ---------------------------------------------------------------------------
# 共享依赖
# ---------------------------------------------------------------------------

_CTX = Context(prec=28, rounding=ROUND_HALF_EVEN)

EASTMONEY_SEARCH = "https://searchadapter.eastmoney.com/api/suggest/get"
TENCENT_QUOTE = "https://qt.gtimg.cn/q={codes}"
# ===================================================================
# 1. GetStockData — 获取实时行情
# ===================================================================

_STOCK_QUERY_PARAMS = {
    "type": "object",
    "properties": {
        "ticker": {
            "type": "string",
            "description": "股票代码，如 600519（A股6位）、00700（港股4-5位）、AAPL（美股）",
        }
    },
    "required": ["ticker"],
}


class GetStockData(BaseTool):
    """获取股票实时行情数据，支持 A 股/港股/美股。"""

    name = "get_stock_data"
    description = "获取股票实时行情，含现价、涨跌幅、PE、PB、总市值等"
    parameters = _STOCK_QUERY_PARAMS

    async def run(self, **kwargs: Any) -> ToolResult:
        ticker = kwargs.get("ticker", "")
        if not ticker:
            return ToolResult(False, error="参数 ticker 不能为空")

        from ..services.market_data import MarketDataService, MarketError
        try:
            service = MarketDataService()
            try:
                quote = await service.quote(ticker)
            finally:
                await service.aclose()
        except (MarketError, ValueError) as e:
            return ToolResult(False, error=f"行情获取失败：{e}")
        return ToolResult(True, data=quote)


def _parse_tencent(raw: str) -> list[dict[str, Any]]:
    import re
    results = []
    pattern = re.compile(r'^v_(sh|sz|hk|us)(\w+)="(.*)";?\s*$', re.M)
    for m in pattern.finditer(raw):
        market, scode, payload = m.group(1), m.group(2), m.group(3)
        f = payload.split("~")
        if len(f) < 50:
            continue

        def num(i: int, default: float = 0.0) -> float:
            try:
                v = float(f[i])
                return v if v == v else default
            except (ValueError, IndexError):
                return default

        price, last_close = num(3), num(4)
        change = num(31) or round(price - last_close, 3)
        results.append({
            "code": f"{market}{scode}",
            "name": f[1] or scode,
            "price": price,
            "last_close": last_close,
            "open": num(5),
            "high": num(33),
            "low": num(34),
            "volume": num(6),
            "amount": num(37),
            "change": change,
            "change_percent": num(32),
            "turnover_rate": num(38),
            "pe": num(39),
            "pb": num(46),
            "market_cap": num(45),
            "amplitude": num(43),
            "timestamp": int(num(30) or 0),
        })
    return results


# ===================================================================
# 2. CalculateIndicators — 技术指标计算
# ===================================================================

_INDICATOR_PARAMS = {
    "type": "object",
    "properties": {
        "ticker": {"type": "string", "description": "股票代码"},
        "indicators": {
            "type": "string",
            "description": "指标列表逗号分隔：ma,macd,rsi,kdj,boll,atr,volma，不传则计算全部",
        },
    },
    "required": ["ticker"],
}


class CalculateIndicators(BaseTool):
    """计算股票技术指标（MA、MACD、RSI、KDJ、布林带、ATR、成交量均线）。"""

    name = "calculate_indicators"
    description = "基于日K线计算常用技术指标，返回各指标最新值"
    parameters = _INDICATOR_PARAMS

    async def run(self, **kwargs: Any) -> ToolResult:
        from ..services import indicators

        ticker = kwargs.get("ticker", "")
        ind_str = kwargs.get("indicators", "")

        if not ticker:
            return ToolResult(False, error="参数 ticker 不能为空")

        names = [s.strip() for s in ind_str.split(",")] if ind_str else None

        from ..services.market_data import MarketDataService, MarketError
        try:
            service = MarketDataService()
            try:
                kline = await service.kline(ticker, count=120)
            finally:
                await service.aclose()
        except (MarketError, ValueError) as e:
            return ToolResult(False, error=f"K线获取失败：{e}")

        try:
            result = indicators.compute(kline, names)
        except ValueError as e:
            return ToolResult(False, error=str(e))

        # 只返回最新值供 Agent 参考
        latest = {}
        for ind_name, sub in result.items():
            latest[ind_name] = {k: v[-1] if isinstance(v, list) and v else None for k, v in sub.items()}
        return ToolResult(True, data={"latest": latest, "days": [k["day"] for k in kline]})


# ===================================================================
# 3. VerifyValuation — 估值指标验算
# ===================================================================

_VAL_PARAMS = {
    "type": "object",
    "properties": {
        "price": {"type": "number", "description": "当前股价"},
        "eps": {"type": "number", "description": "每股收益（TTM）"},
        "bvps": {"type": "number", "description": "每股净资产"},
        "fcf_per_share": {"type": "number", "description": "每股自由现金流"},
        "dividend": {"type": "number", "description": "每股股息"},
        "revenue_per_share": {"type": "number", "description": "每股营收"},
    },
    "required": ["price"],
}


class VerifyValuation(BaseTool):
    """验算估值指标：PE/PB/P-FCF/股息率/PS，基于精确十进制计算。"""

    name = "verify_valuation"
    description = "根据输入的股价和财务数据，精确计算PE、PB、P/FCF、股息率、盈利收益率等估值指标"
    parameters = _VAL_PARAMS

    async def run(self, **kwargs: Any) -> ToolResult:
        price = kwargs.get("price")
        if price is None:
            return ToolResult(False, error="参数 price 不能为空")

        from ..tools.financial_rigor import verify_valuation as fr_verify

        try:
            result = fr_verify(
                price=price,
                eps=kwargs.get("eps"),
                bvps=kwargs.get("bvps"),
                fcf_per_share=kwargs.get("fcf_per_share"),
                dividend=kwargs.get("dividend"),
                revenue_per_share=kwargs.get("revenue_per_share"),
            )
            return ToolResult(True, data=result)
        except Exception as e:
            return ToolResult(False, error=f"估值计算异常：{e}")


# ===================================================================
# 4. ScreenStocks — 选股筛选器
# ===================================================================

_SCREEN_PARAMS = {
    "type": "object",
    "properties": {
        "tickers": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "maxItems": 30,
            "description": "待筛选的 A 股、港股或美股代码列表",
        },
    },
    "required": ["tickers"],
}


class ScreenStocks(BaseTool):
    """Run the shared two-stage momentum and valuation screener."""

    name = "screen_stocks"
    description = "对用户给定的 A股、港股或美股代码执行动量发现与价值评分"
    parameters = _SCREEN_PARAMS

    async def run(self, **kwargs: Any) -> ToolResult:
        tickers = [str(item).strip() for item in kwargs.get("tickers", []) if str(item).strip()]
        if not tickers or len(tickers) > 30:
            return ToolResult(False, error="tickers 必须包含 1-30 个股票代码")
        market = MarketDataService()
        try:
            result = await run_stock_screen([{"ticker": ticker} for ticker in tickers], market)
            return ToolResult(True, data=result)
        except ValueError as exc:
            return ToolResult(False, error=str(exc))
        finally:
            await market.aclose()


_REPORT_AUDIT_PARAMS = {
    "type": "object",
    "properties": {
        "markdown": {"type": "string", "description": "待抽取财务数据点的 Markdown 报告"},
        "verified_results": {
            "type": "array",
            "items": {"type": "object"},
            "description": "已补充 fetched_value/fetched_source 的核验结果；省略时仅返回抽样点",
        },
    },
    "required": ["markdown"],
}


class AuditReportData(BaseTool):
    """Extract report data points and render a release verdict when verified."""

    name = "audit_report_data"
    description = "抽取研究报告财务数据点，并对已核验数值生成准出或打回结论"
    parameters = _REPORT_AUDIT_PARAMS

    async def run(self, **kwargs: Any) -> ToolResult:
        markdown = str(kwargs.get("markdown", ""))
        if not markdown.strip():
            return ToolResult(False, error="markdown 不能为空")
        points = extract_data_points(markdown)
        verified = kwargs.get("verified_results")
        if verified is None:
            return ToolResult(True, data={"points": points, "sample": sample_points(points) if points else []})
        if not isinstance(verified, list):
            return ToolResult(False, error="verified_results 必须是数组")
        return ToolResult(True, data=render_verdict(verified))


# ===================================================================
# 5. SearchNews — 新闻搜索
# ===================================================================

_NEWS_PARAMS = {
    "type": "object",
    "properties": {
        "keyword": {"type": "string", "description": "搜索关键词，如股票名称/代码/行业"},
        "max_results": {"type": "integer", "description": "返回条数，默认5，最多10"},
    },
    "required": ["keyword"],
}


class SearchNews(BaseTool):
    """搜索股票相关新闻资讯，返回标题、来源、摘要。"""

    name = "search_news"
    description = "搜索指定关键词的财经新闻，返回新闻标题、来源与摘要"
    parameters = _NEWS_PARAMS

    async def run(self, **kwargs: Any) -> ToolResult:
        keyword = kwargs.get("keyword", "")
        max_results = min(int(kwargs.get("max_results", 5)), 10)

        if not keyword:
            return ToolResult(False, error="参数 keyword 不能为空")

        from ..services.auth import current_user_id
        from ..services.credential_store import get_credentials

        try:
            user_id = current_user_id()
        except RuntimeError:
            credentials = {}
        else:
            credentials = await get_credentials(
                user_id,
                ("tavily", "serpapi", "bocha", "brave", "searxng"),
            )
        service = NewsSearchService(credentials=credentials)
        try:
            return ToolResult(True, data=await service.search(keyword, max_results=max_results))
        except (ValueError, RuntimeError) as e:
            return ToolResult(False, error=f"新闻搜索失败：{e}")
        finally:
            await service.aclose()


# ===================================================================
# 6. CalculateByFinancialRigor — 精确算术/估值
# ===================================================================

_CALC_PARAMS = {
    "type": "object",
    "properties": {
        "expression": {
            "type": "string",
            "description": "算术表达式，如 '510 * 9.11e9'、'(23.5 * 1.1**3) * 25'",
        },
    },
    "required": ["expression"],
}


class CalculateByFinancialRigor(BaseTool):
    """使用精确十进制执行金融算术/估值运算，零浮点误差。"""

    name = "calculate_by_financial_rigor"
    description = "精确计算金融表达式，支持科学计数法，返回人类可读格式"
    parameters = _CALC_PARAMS

    async def run(self, **kwargs: Any) -> ToolResult:
        expr = kwargs.get("expression", "")
        if not expr:
            return ToolResult(False, error="参数 expression 不能为空")

        allowed = set("0123456789.+-*/() eE")
        if not all(c in allowed for c in expr.replace(" ", "")):
            return ToolResult(False, error="表达式包含非法字符")

        try:
            result = eval(expr, {"__builtins__": {}}, {})
            d = Decimal(str(result))
            return ToolResult(True, data={"expression": expr, "result": str(d), "result_float": float(d)})
        except Exception as e:
            return ToolResult(False, error=f"计算异常：{e}")


_BUFFETT_GATE_PROPERTIES = {
    gate: {
        "type": "string",
        "enum": ["pass", "fail", "unknown"],
        "description": label,
    }
    for gate, label in {
        "circle_of_competence": "能力圈",
        "business_quality": "生意质量",
        "moat": "护城河",
        "management": "管理层",
        "margin_of_safety": "安全边际",
        "discipline": "仓位与决策纪律",
    }.items()
}


class CheckBuffettRules(BaseTool):
    """Evaluate the six value-investing gates from evidence-backed judgments."""

    name = "check_buffett_rules"
    description = "检查能力圈、生意质量、护城河、管理层、安全边际和决策纪律六关；缺证据必须填 unknown"
    parameters = {
        "type": "object",
        "properties": {
            "assessments": {
                "type": "object",
                "properties": _BUFFETT_GATE_PROPERTIES,
                "required": list(_BUFFETT_GATE_PROPERTIES),
                "additionalProperties": False,
            },
            "notes": {
                "type": "object",
                "description": "可选的逐关证据摘要，键名与 assessments 相同",
                "additionalProperties": {"type": "string"},
            },
        },
        "required": ["assessments"],
        "additionalProperties": False,
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        from ..tools.investment_checklist import check_buffett_rules

        assessments = kwargs.get("assessments")
        if not isinstance(assessments, dict):
            return ToolResult(False, error="参数 assessments 必须是对象")
        notes = kwargs.get("notes")
        if notes is not None and not isinstance(notes, dict):
            return ToolResult(False, error="参数 notes 必须是对象")
        try:
            return ToolResult(True, data=check_buffett_rules(assessments, notes))
        except ValueError as exc:
            return ToolResult(False, error=str(exc))


class AdversarialReview(BaseTool):
    """Challenge thesis evidence and common financial-quality signals."""

    name = "adversarial_review"
    description = "从做空者视角检查论点证据、反证缺口、应收/存货增速和现金转化；只提出核验问题"
    parameters = {
        "type": "object",
        "properties": {
            "claims": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "properties": {
                        "statement": {"type": "string"},
                        "evidence_count": {"type": "integer", "minimum": 0},
                        "primary_source": {"type": "boolean"},
                        "contrary_evidence": {"type": "string"},
                    },
                    "required": ["statement", "evidence_count", "primary_source"],
                    "additionalProperties": False,
                },
            },
            "financial_signals": {
                "type": "object",
                "properties": {
                    "revenue_growth_pct": {"type": "number"},
                    "receivables_growth_pct": {"type": "number"},
                    "inventory_growth_pct": {"type": "number"},
                    "net_income": {"type": "number"},
                    "operating_cash_flow": {"type": "number"},
                },
                "additionalProperties": False,
            },
        },
        "required": ["claims"],
        "additionalProperties": False,
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        from ..tools.adversarial_review import adversarial_review

        claims = kwargs.get("claims")
        signals = kwargs.get("financial_signals")
        if not isinstance(claims, list):
            return ToolResult(False, error="参数 claims 必须是数组")
        if signals is not None and not isinstance(signals, dict):
            return ToolResult(False, error="参数 financial_signals 必须是对象")
        try:
            return ToolResult(True, data=adversarial_review(claims, signals))
        except ValueError as exc:
            return ToolResult(False, error=str(exc))


class RunBacktest(BaseTool):
    """Run the compact v2 MA backtest path for research agents."""

    name = "run_backtest"
    description = "运行 MA 双均线回测；A 股默认模拟 T+1、涨跌停和禁做空，仅返回紧凑绩效与稳健性结果"
    parameters = {
        "type": "object",
        "properties": {
            "ticker": {"type": "string"},
            "short_window": {"type": "integer", "minimum": 2, "maximum": 120},
            "long_window": {"type": "integer", "minimum": 3, "maximum": 250},
            "count": {"type": "integer", "minimum": 60, "maximum": 500},
        },
        "required": ["ticker"],
        "additionalProperties": False,
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        from ..backtest.ma_crossover import run_ma_crossover
        from ..backtest.significance import validate_ma_strategy

        ticker = str(kwargs.get("ticker") or "").strip()
        short_window = int(kwargs.get("short_window", 20))
        long_window = int(kwargs.get("long_window", 50))
        count = int(kwargs.get("count", 260))
        if not ticker or not 2 <= short_window < long_window <= 250 or not 60 <= count <= 500:
            return ToolResult(False, error="ticker、均线窗口或 count 参数无效")
        market = MarketDataService()
        try:
            bars = await market.kline(ticker, "1d", max(count, long_window + 12))
            result = run_ma_crossover(
                bars,
                short_window=short_window,
                long_window=long_window,
                initial_capital=100_000,
                commission_bps=3,
                slippage_bps=2,
                symbol=ticker,
            )
            validation = validate_ma_strategy(
                bars, result,
                short_window=short_window, long_window=long_window,
                initial_capital=100_000, commission_bps=3, slippage_bps=2,
                symbol=ticker, period="1d", market_rules="auto",
                price_limit_ratio=None, samples=200,
            )
            return ToolResult(True, data={
                "ticker": ticker,
                "metrics": result["metrics"],
                "execution_rules": result["execution_rules"],
                "rejected_orders": result["rejected_orders"],
                "validation": validation,
                "warnings": result["warnings"],
                "provenance": {
                    "providers": list(dict.fromkeys(str(bar.get("source") or "unknown") for bar in bars)),
                    "from": bars[0]["day"],
                    "to": bars[-1]["day"],
                },
            })
        except (ValueError, RuntimeError) as exc:
            return ToolResult(False, error=f"回测失败：{exc}")
        finally:
            await market.aclose()


class AnalyzeShadowTrades(BaseTool):
    """Analyze hypothetical or recorded fills without account connectivity."""

    name = "analyze_shadow_trades"
    description = "分析影子成交相对计划价格的滑点和已实现盈亏；不连接账户、不提交订单"
    parameters = {
        "type": "object",
        "properties": {
            "trades": {
                "type": "array", "minItems": 1, "maxItems": 200,
                "items": {
                    "type": "object",
                    "properties": {
                        "symbol": {"type": "string"},
                        "side": {"type": "string", "enum": ["buy", "sell"]},
                        "planned_price": {"type": "number", "exclusiveMinimum": 0},
                        "executed_price": {"type": "number", "exclusiveMinimum": 0},
                        "quantity": {"type": "number", "exclusiveMinimum": 0},
                        "realized_pnl": {"type": "number"},
                    },
                    "required": ["side", "planned_price", "executed_price", "quantity"],
                },
            },
        },
        "required": ["trades"],
        "additionalProperties": False,
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        try:
            return ToolResult(True, data=analyze_shadow_trades(kwargs.get("trades") or []))
        except (TypeError, ValueError) as exc:
            return ToolResult(False, error=str(exc))


class AnalyzePortfolioRisk(BaseTool):
    """Run the shared pure portfolio risk X-ray on supplied curves."""

    name = "analyze_portfolio_risk"
    description = "计算组合集中度、回撤、历史 VaR/ES 和分散化；输入必须是已归一化的权益曲线"
    parameters = {
        "type": "object",
        "properties": {
            "assets": {"type": "array", "minItems": 1, "maxItems": 20, "items": {"type": "object"}},
            "weights": {"type": "object", "additionalProperties": {"type": "number"}},
            "equity_curve": {"type": "array", "minItems": 2, "items": {"type": "object"}},
        },
        "required": ["assets", "weights", "equity_curve"],
        "additionalProperties": False,
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        from ..backtest.risk import portfolio_risk_xray

        try:
            data = portfolio_risk_xray(
                kwargs.get("assets") or [], kwargs.get("weights") or {}, kwargs.get("equity_curve") or []
            )
            return ToolResult(True, data=data)
        except (TypeError, ValueError, KeyError) as exc:
            return ToolResult(False, error=str(exc))


class AssessTradingConnector(BaseTool):
    """Return a design-only safety assessment; deliberately has no execution path."""

    name = "assess_trading_connector"
    description = "评估实盘连接器所需安全控制；只返回设计结论，不访问凭据、账户、资金或订单接口"
    parameters = {
        "type": "object",
        "properties": {
            "broker": {"type": "string"},
            "requested_capabilities": {"type": "array", "items": {"type": "string"}, "maxItems": 20},
        },
        "required": ["broker"],
        "additionalProperties": False,
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        return ToolResult(True, data=connector_design_assessment(
            str(kwargs.get("broker") or ""), kwargs.get("requested_capabilities") or []
        ))


# ===================================================================
# A 股深度数据 — 筹码 / 资金流 / 龙虎榜 / 涨停池
# ===================================================================


class GetChipDistribution(BaseTool):
    """Infer the current A-share chip distribution from OHLC and turnover."""

    name = "get_chip_distribution"
    description = "获取 A 股筹码分布推演，含获利比例、平均成本、成本区间、集中度与筹码峰"
    parameters = {
        "type": "object",
        "properties": {"ticker": {"type": "string", "description": "6 位 A 股代码"}},
        "required": ["ticker"],
        "additionalProperties": False,
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        service = AStockExtraService()
        try:
            return ToolResult(True, data=await service.chip_distribution(str(kwargs.get("ticker") or "")))
        except (AStockExtraError, ValueError) as exc:
            return ToolResult(False, error=str(exc))
        finally:
            await service.aclose()


class GetMoneyFlow(BaseTool):
    """Fetch minute or 120-day A-share money flow."""

    name = "get_money_flow"
    description = "获取 A 股主力、大单、中单和小单资金流，支持分钟或 120 日周期"
    parameters = {
        "type": "object",
        "properties": {
            "ticker": {"type": "string", "description": "6 位 A 股代码"},
            "period": {"type": "string", "enum": ["minute", "120d"], "default": "minute"},
        },
        "required": ["ticker"],
        "additionalProperties": False,
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        service = AStockExtraService()
        try:
            data = await service.money_flow(
                str(kwargs.get("ticker") or ""), str(kwargs.get("period") or "minute")
            )
            return ToolResult(True, data=data)
        except (AStockExtraError, ValueError) as exc:
            return ToolResult(False, error=str(exc))
        finally:
            await service.aclose()


class GetDragonTiger(BaseTool):
    """Fetch A-share dragon-tiger records and latest top-five seats."""

    name = "get_dragon_tiger"
    description = "获取指定 A 股与日期窗口内的龙虎榜记录及最近买卖席位 TOP5"
    parameters = {
        "type": "object",
        "properties": {
            "ticker": {"type": "string", "description": "6 位 A 股代码"},
            "date": {"type": "string", "description": "交易日 YYYY-MM-DD"},
        },
        "required": ["ticker", "date"],
        "additionalProperties": False,
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        service = AStockExtraService()
        try:
            data = await service.dragon_tiger(
                str(kwargs.get("ticker") or ""), str(kwargs.get("date") or "")
            )
            return ToolResult(True, data=data)
        except (AStockExtraError, ValueError) as exc:
            return ToolResult(False, error=str(exc))
        finally:
            await service.aclose()


class GetLimitUpPool(BaseTool):
    """Fetch the Eastmoney A-share limit-up pool for one trade date."""

    name = "get_limit_up_pool"
    description = "获取指定交易日 A 股涨停池，含连板数、封板资金、炸板次数与行业"
    parameters = {
        "type": "object",
        "properties": {"date": {"type": "string", "description": "交易日 YYYY-MM-DD"}},
        "required": ["date"],
        "additionalProperties": False,
    }

    async def run(self, **kwargs: Any) -> ToolResult:
        service = AStockExtraService()
        try:
            return ToolResult(True, data=await service.limit_pool(str(kwargs.get("date") or "")))
        except (AStockExtraError, ValueError) as exc:
            return ToolResult(False, error=str(exc))
        finally:
            await service.aclose()


# ===================================================================
# 自动注册
# ===================================================================

ToolRegistry()
