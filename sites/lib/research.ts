import { getSnapshot, searchNews } from "./market";
import type { Evidence, MarketSnapshot, ResearchReport } from "./types";

type RuntimeEnv = {
  OPENAI_COMPAT_API_KEY?: string;
  OPENAI_COMPAT_BASE_URL?: string;
  OPENAI_COMPAT_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
};

const number = (value: number | null, digits = 2) => value == null ? "暂无" : value.toFixed(digits);
const percent = (value: number | null) => value == null ? "暂无" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function trend(snapshot: MarketSnapshot): string {
  const { price, metrics } = snapshot;
  if (metrics.ma20 == null || metrics.ma60 == null) return "历史样本不足，暂不判定趋势";
  if (price > metrics.ma20 && metrics.ma20 > metrics.ma60) return "价格位于 20 日与 60 日均线上方，中期趋势偏强";
  if (price < metrics.ma20 && metrics.ma20 < metrics.ma60) return "价格位于 20 日与 60 日均线下方，中期趋势偏弱";
  return "价格与中期均线交错，趋势处于过渡阶段";
}

function risk(snapshot: MarketSnapshot): string {
  const vol = snapshot.metrics.volatility20d;
  const drawdown = snapshot.metrics.maxDrawdown1y;
  if (vol == null || drawdown == null) return "风险样本不足";
  if (vol > 45 || drawdown < -35) return "波动或回撤较高，仓位与止损需要保守设置";
  if (vol > 28 || drawdown < -20) return "风险处于中等区间，应结合基本面催化验证";
  return "近期波动与一年回撤相对温和，但仍需关注事件冲击";
}

function directAnswer(snapshot: MarketSnapshot, query: string): string {
  const supported = /(趋势|走势|技术|均线|动量|涨跌|波动|回撤|风险|rsi|trend|technical|momentum|volatility|drawdown|risk)/i.test(query);
  if (!supported) {
    return `**UNKNOWN**：当前已验证数据只覆盖行情、技术指标和标题级资讯，无法可靠回答“${query || "综合研究"}”。不能用价格指标替代现金流、产品周期、估值或其他基本面事实；需要接入并核验财报、公告或监管文件后再回答。`;
  }
  return `**FACT**：${trend(snapshot)}；20 日收益 ${percent(snapshot.metrics.return20d)}，60 日收益 ${percent(snapshot.metrics.return60d)}。` +
    `\n\n**INFERENCE**：${risk(snapshot)}。这是基于行情数据的风险判断，不等同于基本面结论。`;
}

export function buildBaseReport(snapshot: MarketSnapshot, evidence: Evidence[], query: string): string {
  const m = snapshot.metrics;
  const sources = evidence.length
    ? evidence.map((item, index) => `${index + 1}. [${item.title}](${item.url}) — ${item.publisher}${item.publishedAt ? `，${item.publishedAt.slice(0, 10)}` : ""}；相关性 ${(item.relevanceScore * 100).toFixed(0)}%`).join("\n")
    : "**UNKNOWN**：未检索到通过股票代码或公司实体相关性门控的近期资讯；不以通用新闻填充证据。";
  return `# ${snapshot.name}（${snapshot.symbol}）研究快照

> 生成时间：${new Date(snapshot.asOf).toLocaleString("zh-CN")}
> 用户问题：${query || "综合研究"}
> 行情来源：${snapshot.source}

## 对用户问题的直接回答

${directAnswer(snapshot, query)}

## 结论摘要

- **趋势**：${trend(snapshot)}。
- **动量**：20 日收益 ${percent(m.return20d)}，60 日收益 ${percent(m.return60d)}，RSI(14) ${number(m.rsi14)}。
- **风险**：20 日年化波动 ${percent(m.volatility20d)}，一年最大回撤 ${percent(m.maxDrawdown1y)}；${risk(snapshot)}。
- **使用边界**：这是基于可验证行情与公开资讯生成的研究材料，不构成投资建议。

## 市场数据

| 指标 | 数值 |
|---|---:|
| 最新价 | ${snapshot.currency} ${number(snapshot.price)} |
| 昨日收盘 | ${snapshot.currency} ${number(snapshot.previousClose)} |
| 日涨跌额 | ${snapshot.currency} ${number(snapshot.dailyChange)} |
| 日涨跌幅 | ${percent(snapshot.dailyChangePercent)} |
| 一年区间收益 | ${percent(snapshot.periodReturnPercent)} |
| 20 日均线 | ${number(m.ma20)} |
| 60 日均线 | ${number(m.ma60)} |
| 52 周高点 | ${number(snapshot.fiftyTwoWeekHigh)} |
| 52 周低点 | ${number(snapshot.fiftyTwoWeekLow)} |
| 一年最大回撤 | ${percent(m.maxDrawdown1y)} |

## 证据与近期资讯

${sources}

## 下一步核验清单

1. 对照最近一期财报核验收入、利润、自由现金流与净负债变化。
2. 区分价格趋势与基本面变化，避免仅凭短期涨跌作出结论。
3. 对新闻中的预测性表述回查公司公告或监管文件。
4. 在估值、催化与下行情景齐备前，不将本报告视为交易指令。
`;
}

async function aiEnhancement(base: string, snapshot: MarketSnapshot): Promise<string | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as RuntimeEnv;
  const config = runtime.OPENAI_COMPAT_API_KEY
    ? { key: runtime.OPENAI_COMPAT_API_KEY, base: runtime.OPENAI_COMPAT_BASE_URL ?? "https://api.openai.com/v1", model: runtime.OPENAI_COMPAT_MODEL ?? "gpt-4.1-mini" }
    : runtime.DEEPSEEK_API_KEY
      ? { key: runtime.DEEPSEEK_API_KEY, base: "https://api.deepseek.com/v1", model: "deepseek-chat" }
      : runtime.OPENAI_API_KEY
        ? { key: runtime.OPENAI_API_KEY, base: "https://api.openai.com/v1", model: "gpt-4.1-mini" }
        : null;
  if (!config) return null;
  const baseUrl = new URL(config.base);
  if (baseUrl.protocol !== "https:") throw new Error("模型 API 必须使用 HTTPS");
  const response = await fetch(`${baseUrl.href.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: "你是严谨的股票研究员。只能基于输入证据推理，缺失信息必须明确说明，禁止编造财务数据。输出中文 Markdown。" },
        { role: "user", content: `为 ${snapshot.name}（${snapshot.symbol}）补充“多情景研判”与“关键风险”两个章节。不要重复表格，不超过 700 字。\n\n${base}` },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`模型 API 返回 ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content?.trim() || null;
}

export async function runResearch(input: string, query: string): Promise<ResearchReport> {
  const snapshot = await getSnapshot(input);
  const evidence = await searchNews(snapshot.symbol, snapshot.name).catch(() => [] as Evidence[]);
  let contentMd = buildBaseReport(snapshot, evidence, query);
  let aiEnhanced = false;
  try {
    const enhancement = await aiEnhancement(contentMd, snapshot);
    if (enhancement) {
      contentMd += `\n${enhancement}\n`;
      aiEnhanced = true;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "模型调用失败";
    contentMd += `\n> AI 增强未执行：${reason}。基础研究结果已完整保留。\n`;
  }
  const createdAt = new Date().toISOString();
  const groupId = `symbol-${snapshot.symbol.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return {
    id: crypto.randomUUID(),
    groupId,
    symbol: snapshot.symbol,
    name: snapshot.name,
    title: `${snapshot.name}研究 · ${createdAt.slice(0, 10)}`,
    query,
    contentMd,
    evidence,
    snapshot,
    createdAt,
    aiEnhanced,
    persistence: "ephemeral",
  };
}
