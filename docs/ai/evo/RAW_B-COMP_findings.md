# RAW B-COMP audit findings (extracted from subagent transcript)


--- finding 1 ---
Let me start by understanding my task. I'm SUBAGENT B — COMPETITOR_RESEARCHER. My job:

1. Read `docs/ai/evo/PROJECT_BRIEF.md` (read-only) to understand the product
2. Research 3-8 mature competing products via web search
3. Write a report to `docs/ai/evo/CAPABILITY_MATRIX.md`
4. Send a summary to parent agent session-3d7ed6b1-e748-4013-b264-da68ccbe2213

Let me start by reading the project brief, and I can also look at the workspace structure first. Let me do the reads first before researching.

Let me begin with reading the brief and checking the docs/ai/evo directory.

--- finding 2 ---
I've read the PROJECT_BRIEF. Now let me understand the product:

**FinQuant Hub**: 个人全栈金融量化研究 Web 系统（本地自用、可开源分发）。
- 多市场行情（A股/港股/美股）：腾讯/新浪/东方财富/Yahoo 多源
- AI 多 Agent 投研报告（4-agent 并行 → 13 章中文报告）
- Alpha 因子研究（WQ 4367 字段）
- 投资组合管理、策略回测（自然语言→策略）
- 会话讨论（IR 自然语言→策略）
- Token 用量与计价统计（对齐 CC Switch）
- MCP 供应商管理
- 知识库（FTS5 memory）
- SSE 实时流
- 目标用户：非技术中文个人投资者，本地部署

Now I need to research 3-8 mature competing products. Categories suggested:
1. 个人本地量化研究平台: OpenBB / Qlib / backtrader 生态 / FreeQuant / TuShare 周边
2. AI 投研助手: ChatGPT/DeepSeek 套壳差异点
3. 行情终端: 同花顺/东财的本地化替代差异点
4. 模型路由/用量管理: CC Switch 之类

Let me do web research on competitors. I should use web_search extensively. Let me plan the queries:

1. OpenBB (open-source investment research platform)
2. Qlib (Microsoft AI quant platform)
3. backtrader ecosystem
4. TuShare + AkShare (Chinese market data)
5. 同花顺/东方财富 终端
6. CC Switch (LLM model routing)
7. FreeQuant / 掘金量化 (GoldMiner)
8. AI 投研助手 (like Adam (券商AI), 汇正财经, Wind AI)
9. Maybe: RQAlpha (Ricequant open source), vnpy (VeighNa), JoinQuant (聚宽) 云端
10. Also: Bloomberg/Python terminal alternatives — OpenBB

Let me also search Chinese-specific things: 聚宽 JoinQuant, 米筐 RiceQuant, 掘金量化, BigQuant, 优矿 Uqer.

Strategy: run multiple searches in parallel batches. Then use web_fetch for a few key sources. Then write the report.

Let me start with the first batch of searches. I can make multiple web_search calls in one block since they're independent.

--- finding 3 ---
The web_search tool is failing with an auth error. Per the workspace instructions:

"## 网络搜索工具路由
联网优先直连。搜索按优先级：内置 `web_search` → `mcp__tavily__*` → `mcp__exa__*` → curl。"

The built-in web_search fails (DeepSeek search API key invalid). I don't have mcp__tavily__ or mcp__exa__ tools available in this session. So fallback: use curl via pwsh. The local proxy is 7897, direct connect preferred (直连优先), clear proxy variables or use --noproxy '*'.

I can curl search engines. Options:
- DuckDuckGo HTML endpoint: https://html.duckduckgo.com/html/?q=...
- Bing: https://www.bing.com/search?q=...
- Or fetch GitHub repos directly for the known competitors.

Since I know the key competitors well, I can fetch their GitHub repos / official pages directly via web_fetch? Wait — web_fetch might also route through the same failing endpoint? Actually web_fetch is a separate tool ("Fetch the content of a specific HTTP(S) URL and return it decoded to text"). Let me test web_fetch. It might work since it's a direct HTTP fetch, not the DeepSeek search API.

Let me try web_fetch on a known URL like https://github.com/OpenBB-finance/OpenBB. If that works, great — I can gather evidence from official repos directly.

Also test curl in pwsh as a fallback: `curl.exe -s --noproxy '*' "https://api.github.com/repos/OpenBB-finance/OpenBB"` — GitHub API gives stars, description, etc. That's a solid evidence source.

Let me try multiple approaches in parallel:
1. web_fetch on GitHub OpenBB repo page
2. pwsh curl to GitHub API for a few repos

Actually, per instructions, network: "联网前先清代理变量或加 --noproxy '*'". Let me use curl with --noproxy '*'.

Let me do a batch:
- web_fetch https://github.com/OpenBB-finance/OpenBB
- pwsh: curl.exe -s --noproxy '*' https://api.github.com/repos/OpenBB-finance/OpenBB

Hmm, web_fetch may fail the same way. Try both.内置 web_search 工具因 API Key 失效报错。按项目规则降级：优先直连（curl / web_fetch）。先测试两条通路是否可用。

--- finding 4 ---
web_fetch works, and GitHub API works via curl. Built-in web_search is broken (DeepSeek search API auth fails). I'll rely on GitHub API + web_fetch of official docs + maybe DuckDuckGo HTML search via curl as fallback.

Let me gather competitor data efficiently. Competitor shortlist (3-8 mature products):

**A. 本地量化研究平台类**
1. **OpenBB** — Python 开源投资研究终端/数据平台（72.8k stars）。OpenBB Platform (API) + Workspace (GUI)。多资产数据、AI agent。
2. **Microsoft Qlib** — AI 量化投资平台（微软），机器学习 pipeline、Alpha 因子挖掘（Alpha158/Alpha360）、回测。
3. **backtrader** — 回测框架（8万+... actually backtrader is ~15k stars，合并后 mementum/backtrader）。社区生态。
4. **vn.py (VeighNa)** — 国内量化交易开源框架（vnpy），CTA 回测、实盘。
5. **聚宽 JoinQuant / 米筐 RiceQuant** — 国内云端/本地量化研究平台（研究环境+回测+因子库）。
6. **AkShare / TuShare** — 中文开源金融数据接口（数据层）。
7. **FreeQuant / 掘金量化 (GoldMiner)** — 量化终端。

**B. AI 投研助手类**
8. **同花顺问财 (iwencai)** — 中文自然语言选股/投研。
9. **东方财富 Choice / 同花顺 iFinD** — 金融数据终端。
10. **Bloomberg 类**。
11. **AI 投研报告**: 界面的通用 ChatGPT/DeepSeek 直接用法。

**C. 模型路由/用量管理**
12. **CC Switch** — Claude Code 模型切换 + 加密配置 + 用量统计（项目已对齐它）。
13. **one-api / NewAPI** — LLM API 网关（供应商管理、Key 池、用量统计、计价）。这在本地还部署在 3111 端口（NewAPI）。注意：项目里 MCP 供应商管理、Token 用量计价很像 one-api/NewAPI 的功能子集！

**D. 终端类**
14. **同花顺 / 东方财富终端** — 本地化替代参考。

我应该聚焦 3-8 个，选最相关的：
1. OpenBB（本地开源投研平台，最直接对标）
2. Microsoft Qlib（AI 因子研究）
3. backtrader（回测生态）
4. vn.py / VeighNa（国内量化框架，含实盘）
5. 聚宽 JoinQuant（中文量化研究环境，因子库/回测/文档化研究）—— 网页版，但可借鉴研究环境
6. 同花顺 iFinD / 问财（AI 投研助手+终端，中文 NLP 选股）
7. AkShare/TuShare（数据层）
8. one-api / NewAPI（模型路由与用量计价，因为项目有供应商管理+计价模块）
9. CC Switch（项目已对齐，作为参照）

用户任务说 3~8 个。我可以做 8 个，外加把 AkShare/TuShare 作为数据层补充说明。

Let me now gather facts per competitor via GitHub API (stars, description, license, language) + a couple of web_fetch for official docs where I need capability details.

Plan the curl calls (batch them in one pwsh command to be efficient — one command querying multiple repos). Also fetch some docs pages.

GitHub API repos to query:
- OpenBB-finance/OpenBB
- microsoft/qlib
- mementum/backtrader (or backtrader2/backtrader)
- vnpy/vnpy
- akshare: akshare/akshare  (repo is akfamily/akshare)
- tushare: waditu/tushare
- joinquant — no GitHub (cloud platform), may have github.com/JoinQuant
- songquanpeng/one-api
- QuantumNous/new-api (NewAPI)

Let me batch one pwsh command that queries several repos and outputs name/desc/stars/license. GitHub API unauthenticated rate limit is 60/hr per IP — 9 repos OK.

Also fetch official pages:
- OpenBB docs: https://docs.openbb.co/ (maybe skip, GitHub description is enough + I know the platform features)
- Qlib docs: https://qlib.readthedocs.io/
- JoinQuant: https://www.joinquant.com/
- 同花顺问财: https://www.iwencai.com/
- iFinD: https://www.51ifind.com/

For Chinese sites, web_fetch may or may not work through network. Let me try curl with --noproxy '*' for them too. Actually direct connect first, per rules. My machine: curl direct may work.

Let me also check what the project itself has so the matrix's "我们现状" column is grounded. But my task is competitor research; the parent will fill in "我们现状". Actually the report requires "能力矩阵表（能力维度 × 竞品 × 我们现状）" — I should ground our现状 from the PROJECT_BRIEF and AGENTS.md info (which I have). I could also quickly glance at docs/API_CONTRACT.md or docs/ARCHITECTURE.md for capability confirmation. Let me do a quick look at docs/ARCHITECTURE.md and docs/DATA_SOURCES.md to ground our current state. Hmm, but the task is weighted to competitor research. A quick read of ARCHITECTURE.md would help fill 我们现状 accurately.

Let me batch:
1. pwsh GitHub API for 9 repos
2. read docs/ARCHITECTURE.md (first 300 lines) — for 我们现状 grounding
3. web_fetch JoinQuant official site
4. web_fetch iFinD or iwencai

Actually let me be careful about parallel fetches to Chinese sites — might be slow. Start with GitHub API batch + architecture read. Then docs fetches.web_fetch 与直连 GitHub API 均可用。开始批量采集竞品数据（GitHub API + 官方站点），同时读架构文档以便"我们现状"列落准。

--- finding 5 ---
Good progress. I have GitHub data for most competitors. Now I need a few more data points:

1. JoinQuant (聚宽) — not on GitHub; fetch their site or docs. https://www.joinquant.com/
2. 同花顺问财 iwencai / iFinD — AI 投研/自然语言选股。https://www.iwencai.com/
3. 掘金量化 GoldMiner — https://www.myquant.cn/
4. RiceQuant 米筐 — https://www.ricequant.com/
5. OpenBB Workspace features, Qlib alpha 因子细节 — maybe fetch Qlib docs quickly.

Also I should double check star counts (the table got truncated — columns beyond desc didn't show fully; the Format-Table -Wrap might have cut stars/license/lang/updated columns. Actually the output shows only repo/desc columns — columns were likely truncated by terminal width. Let me re-run with Format-List per repo to capture stars/license/lang. Not critical but nice for the report — star counts quantify "成熟度/活跃度".

Also fetch:
- JoinQuant 官网首页
- iwencai 问财 首页
- OpenBB docs quickstart? Maybe enough to describe features from knowledge. Better to fetch official docs to ground key claims: OpenBB Platform features (providers, AI agent support, graphql, python/rest APIs).
- Qlib: alpha factor library (Alpha158/Alpha360/Alpha101) — well documented; could fetch qlib docs factor page.

Let me batch: one pwsh re-run for stars with Format-List; two web_fetch (joinquant, iwencai).

For Chinese websites, HTTPS direct via web_fetch. Try.

Also CC Switch — it's a local tool (CC Switch 是 Claude Code 模型切换工具). The project brief says 用量详情"对齐 CC Switch". I'll describe it from knowledge; maybe quick search via curl on GitHub: "farion1231/cc-switch" is the repo. Let me include it in GitHub batch. Actually farion1231/cc-switch — Claude Code 配置切换工具 (proxy/config switcher), not really usage metering... There's also "CC-switch"? The project said 用量统计详情（对齐 CC Switch）. There is a ceve/... hmm. Let me query GitHub search API for "cc-switch".

GitHub search API: https://api.github.com/search/repositories?q=cc-switch+claude — unauthenticated rate limit is shared (10/min for search). Let me try one search.

Batch next:
1. pwsh: stars via Format-List for the 8 repos + count limit
2. web_fetch https://www.joinquant.com/
3. web_fetch https://www.iwencai.com/

Let me do that.GitHub API 可用，补全 star/license 详情，并抓取国内平台官网（聚宽、问财）与 CC Switch 仓库定位。

--- finding 6 ---
Good. Chinese websites return HTTP 200 but the fetched text is nearly empty (JS-rendered SPAs). So I need other evidence for JoinQuant/问财 — maybe their docs pages or blog articles. GitHub for JoinQuant: they have a GitHub org "JoinQuant". Also docs: https://www.joinquant.com/help/index/study or research docs. Let me instead rely on well-known documented features and try fetching a couple of key doc pages.

Key capability questions per competitor for the matrix:

**能力维度** I should define (based on the product's own modules):
1. 行情数据（多市场 A/港/美，实时/日线，扩展数据）
2. AI 多 Agent 投研报告（自然语言研究）
3. Alpha 因子研究（因子库/搜索/回测）
4. 技术指标/技术分析
5. 策略回测
6. 组合/持仓管理 + 风控
7. 自然语言→策略（IR）
8. 模型供应商管理（多模型路由）
9. Token 用量/计价统计
10. MCP 客户端/Agent 工具生态
11. 知识库/记忆
12. 中文界面/本地化
13. 本地私有部署（离线/本地模式）
14. 多用户/开源分发/自托管
15. 实盘交易/券商对接（license 风险）— 我们设计上避免
16. 实时推送（SSE/WebSocket）
17. 数据质量/清洗与财务数据
18. 社区/文档生态

Let me define ~14 rows. That's fine.

Competitor list (final 8):
1. **OpenBB** (OpenBB-finance/OpenBB, 72.9k★, Python, AGPL? — license NOASSERTION... OpenBB is AGPL-3.0. The API returned "other"/NOASSERTION probably because custom license file "SSPL"? Actually OpenBB moved to a custom license "OpenBB Common"? Let me not overstate; I'll say AGPL-3.0 historically / 现为自定义许可（GitHub 返回 NOASSERTION）. Hmm — need accuracy. OpenBB 4.0 changed license to AGPL-3.0 with additional terms? I recall OpenBB Platform is AGPL. The NOASSERTION suggests a custom license file named "LICENSE" with nonstandard text. I could fetch the license quickly. Not critical — I'll write "AGPL-3.0（现行仓库返回自定义许可 NOASSERTION，需核）". Better: check via curl the license key only returned NOASSERTION. Fine, mark as 需核.

2. **Microsoft Qlib** (48.5k★, MIT) — AI 量化：Alpha158/Alpha360 因子集、机器学习 pipeline、RD-Agent（自动化因子挖掘 + 论文级 R&D）、回测。缺点：无 GUI、无中文报告、面向研究员。

3. **backtrader** — 回测框架（原 mementum/backtrader ~16k★；backtrader2 fork 只有 268★）。功能：多数据源、撮合模拟、券商/实盘（含 IB）、社区策略集。无 GUI/AI。注意活跃度低（原 repo 存档？）。I'll cite mementum/backtrader (original) — let me be accurate: count it as classic mature framework. It's GPL-3.0. Backtrader original stars ~16000. Let me quickly query mementum/backtrader.

4. **vn.py / VeighNa** (45.3k★, MIT) — 国内量化交易框架：CTA 策略、回测引擎、实盘柜台（富途/华泰等）、社区。偏交易执行，研究弱。

5. **聚宽 JoinQuant** — 云端中文量化研究平台：研究环境（Notebook）、因子库、回测、模拟/实盘、文档社区。核心对标"研究环境"。证据：官网 joinquant.com（已 fetch，内容空，但 URL 可引用）。

6. **同花顺问财 iwencai** — 中文自然语言选股/投研助手（NLP 问句→选股/数据），证据：iwencai.com。属于"AI 问答/自然语言投研"方向，与 IR（自然语言→策略）对标。

7. **AkShare** (22.5k★, MIT) — 中文开源数据接口库（A/港/美，含两融、龙虎榜、资金流、财报）。与"数据层"对标；我们已有 fundamentals 经 AkShare。

8. **NewAPI / one-api** (47.9k★ AGPL / 36.8k★ MIT) — LLM 网关：多供应商 key 管理、统一 API、用量统计、计价、渠道。对标"模型供应商管理 + Token 用量计价"。项目已说"对齐 CC Switch"，但 CC Switch 实际是 Claude Code 配置切换工具（132k★，all-in-one assistant），并非用量统计工具。而 NewAPI 才是真正的"用量统计+计价"。这发现值得写：我们的"供应商管理+计价"更接近 NewAPI/one-api 的能力子集；CC Switch 只是配置切换（我们已对齐其体验），可补充借鉴 NewAPI 的"渠道/分组/计价"模型。

Wait — the brief says "用量统计详情（对齐 CC Switch）". CC Switch (farion1231) now is an all-in-one desktop assistant for Claude Code etc with provider switching. Not usage metering. The parent/summary should note this nuance: 用量计价借鉴 one-api/NewAPI 更贴切。

Also candidate: **掘金量化 GoldMiner** (myquant.cn) — maybe skip, 8 is enough. Or include instead of backtrader? 任务"3~8 个最相关"。8 个正好。

Also **RiceQuant 米筐** — similar to 聚宽. Skip or mention in one line under 聚宽 as同质。

Also **同花顺 iFinD / 东方财富 Choice** — 机构级行情终端 + AI，本地化替代的"对照物"。Maybe mention briefly in 分类而不是竞品清单（因为它们是终端巨头，不是直接对标的可本地化产品）。Actually they're relevant as the "用户心智中的参照系" — I'll mention in 产品类别判断 and 分类部分。

Feature claims need evidence. I'll ground key claims with official URLs:
- OpenBB: github repo + docs.openbb.co
- Qlib: github + qlib.readthedocs.io (factor: Alpha158/Alpha360). Let me fetch qlib docs quick? The README already says features. GitHub README via API contents? I can fetch https://raw.githubusercontent.com/microsoft/qlib/main/README.md quickly via curl to ground feature claims. That's cheap. Same for OpenBB README.
- vnpy README: https://raw.githubusercontent.com/vnpy/vnpy/master/README.md
- JoinQuant: fetch https://www.joinquant.com/help (docs) — may be SPA too. Alternatively cite joinquant.com homepage URL and describe from knowledge with "未取得"标记？Better: use GitHub org JoinQuant? They publish joinquant/algorithms examples. Or use知乎/文档. Let me try fetching https://www.joinquant.com/help/index/study or docs listing. Hmm, these might render. Try one.
- iwencai: similar SPA. Try https://www.iwencai.com/home/index got content empty.

Given time, I'll ground with: GitHub READMEs (raw) for OpenBB/Qlib/vnpy/AkShare/NewAPI/one-api + official homepage URLs for 聚宽/问财 (标注"官网为 SPA，正文未取得，依据公开资料+社区共识描述" — 诚实标注)。

Let me fetch READMEs via curl in one batch (raw.githubusercontent). And query mementum/backtrader stars.

Then I'll also want Qlib factor specifics: Alpha158/Alpha360/Alpha101 — from memory + README mentions. Qlib README mentions "Alpha158/Alpha360" and "High-frequency data" etc. Good enough.

One more useful evidence: OpenBB 的"AI agent 特性"与价格模式（free/plus）——现在 OpenBB Platform 开源+Workspace 商业化。来自 README。

Batch:
1. pwsh: raw READMEs for OpenBB, Qlib, vnpy, AkShare, one-api, new-api — but READMEs are long. Instead of dumping, I'll grep key lines. Simpler: fetch each README head (first ~80 lines) using curl and select. Let me just capture first 60 lines of each and print. Actually curl raw READMEs and Select-Object -First 40 lines each. That gives feature bullets.

Let me be efficient: one pwsh command looping READMEs, printing first 45 lines each with separator. Output could be long but manageable (~45*6=270 lines). Maybe limit to 30 lines each.

Also mementum/backtrader repo query.国内官网是 SPA，正文抓不到（如实标注）。改用 GitHub raw README 提取各竞品功能要点作为证据。

--- finding 7 ---
Great data. Key evidence secured:

- **OpenBB**: 72.9k★, Python "Open Data Platform for analysts, quants and AI agents" — "connect once, consume everywhere" infra: Python for quants, Workspace (enterprise UI, pro.openbb.co, AI agents), Excel, **MCP servers for AI agents**, REST APIs. License NOASSERTION (需核，历史 AGPL-3.0).
- **Qlib**: 48.5k★ MIT. AI-quant platform; RD-Agent (LLM-based autonomous factor mining + model optimization, arXiv 2505.15155). Alpha158/360 etc (from docs knowledge).
- **backtrader** (mementum): 23.2k★ GPL-3.0, last push 2024-08, essentially maintenance mode; backtrader2 fork 268★. Good point: 回测框架生态成熟但停滞、无 GUI/AI。
- **vn.py VeighNa**: 45.3k★ MIT, v4.4.0. 交易框架：CTA 策略、实盘柜台、数据中心；4.0 新增 vnpy.alpha（ML 因子策略一站式）+ **智策投研（自然语言→策略代码）** in VeighNa Fusion — that's直接对标 IR 功能！Evidence: README mentions "智策投研：根据策略描述辅助梳理逻辑、生成代码，并衔接历史回测与参数优化流程".
- **new-api**: 47.9k★ AGPL, Go. "Next-Generation LLM Gateway and AI Asset Management System" — 渠道管理、统一 OpenAI/Claude/Gemini 兼容、用量统计、计价。对标供应商管理+计价。
- **one-api**: 36.8k★ MIT, JS. LLM API 管理&分发、key 管理、统一适配。
- **AkShare**: 22.5k★ MIT, 中文财经数据接口（A/港/美 + 龙虎榜/资金流/两融等）——我们 fundamentals 已在用。
- **TuShare**: 15.4k★ BSD, 更新停（2024-03）——说明 Tushare 活跃度下降，AkShare 主导。加分项：数据层选型证据。
- **CC Switch** (farion1231/cc-switch): 132k★ — 跨平台桌面 All-in-One 助手（Claude Code/Codex/OpenCode/OpenClaw/Grok/Hermes 的配置/切换），官方站 ccswitch.io。它本质是"模型配置切换 + 多工具管理"，不是用量统计/计价。项目"对齐 CC Switch"针对的是供应商管理/用量详情 UI 的参照物 — 但有偏差：真正的用量统计计价对标是 one-api/NewAPI。这点值得在报告中指出（帮助主代理纠偏）。

Now, for 聚宽 (JoinQuant) and 问财 (iwencai): official sites are SPA, content 未取得. I can cite homepage URLs + describe from well-established public knowledge, marking clearly. Maybe try one more fetch: JoinQuant 帮助文档 might be static-ish: https://www.joinquant.com/help. And iwencai: https://www.iwencai.com/gateway/... probably not. Alternatively, Baidu Baike pages via web_fetch might work. Let me try https://baike.baidu.com/item/聚宽 and https://baike.baidu.com/item/问财 — these often render server-side. Also might be blocked. Quick attempt (parallel web_fetch x2), low cost.

Also useful evidence for iwencai: 同花顺官网 iFinD/问财介绍页. Or news articles describing 问财选股. Alternatively use DuckDuckGo HTML search via curl (works often without JS): 
`curl -s --noproxy '*' "https://html.duckduckgo.com/html/?q=同花顺问财+自然语言选股+AI"` and parse. That could give me sources. Let me try that as evidence-gathering for 聚宽/问财/米筐.

Actually — DDG html endpoint sometimes blocks datacenter IPs, but with my residential proxy maybe works. Let me try one search via curl to get snippets + URLs for "聚宽 因子 研究 回测" and "同花顺问财 AI 投研". If it works, great for evidence; if not, rely on homepage URLs + public knowledge with 未取得标注.

Plan: 
1. pwsh curl DDG for 聚宽 and 问财 (two searches, extract result titles+URLs+snippets)
2. web_fetch baike for 聚宽 & 问财 in parallel (independent)

Then write the report. I should also glance at what our product's capability现状 is — I have PROJECT_BRIEF + AGENTS.md + ARCHITECTURE first 150 lines, which covers routers, market data chain, agents, alpha (WQ 4367 fields), backtest v1/v2, portfolio, model/usage/mcp routers. That's enough to fill 我们现状 column accurately. Maybe quickly grep README.md for the feature list to double-check? The brief + architecture suffice.

Let me run the last evidence round.主要竞品 README 证据已到手（OpenBB/Qlib/vnpy/new-api/backtrader）。再补两条中文平台证据（聚宽、问财），用 DuckDuckGo HTML 直连搜索 + 百度百科双通道。

--- finding 8 ---
The parent is steering me: don't wait on interactive sites; use curl with timeouts; skip iwencai-style SPA sites; focus on GitHub repos + official docs I can curl. Finish the report and deliver.

I already have strong evidence for: OpenBB, Qlib, backtrader (mementum), vnpy, AkShare, TuShare, one-api, new-api, cc-switch. For 聚宽/问财 I only have homepage URLs with empty content — I'll mark "官网主页可访问，正文为 JS 渲染未取得；能力描述基于公开资料" honestly, or better: try quick curl with timeout for their docs/static pages — but parent said skip browser-interactive sites. I can do ONE quick attempt via GitHub org for JoinQuant (they have public repos with examples) — actually joinquant examples repo exists. But not necessary. I'll cite their official pages + mark partially 未取得.

One more useful quick evidence: quantstats (backtrader 生态的绩效分析) — repo ranaroussi/quantstats. And maybe one Chinese quant platform static doc site: 掘金量化 myquant — skip, 8 competitors is enough.

Let me also do a very quick check of OpenBB license (for accuracy in matrix) and Qlib feature table (README continued past line 45 — the feature table). Not critical; I know Qlib features: ML pipeline, Alpha158/Alpha360, high-frequency, rolling retrain, model zoo. I'll cite qlib.readthedocs.io + RD-Agent repo.

Now write the report. Structure per task:

```
# CAPABILITY_MATRIX
## 产品类别判断（+理由）
## 竞品清单（每品：名称/官网或repo/定位/一句话）
## 能力矩阵表（能力维度 × 竞品 × 我们现状）
## 分类：
- 行业基础能力（不做就无法立足）
- 行业常见能力（做了更完整）
- 差异化能力（我们的独特价值）
- 当前项目缺失但有依据值得做的（必须解释"为什么值得做"，禁止"竞品有所以我们也必须有"）
- 不适合当前项目的能力（+理由）
```

每条"缺失能力"必须有：证据（竞品来源 URL）+ 为什么值得做（用户价值/成熟度）→ 建议优先级。

Let me decide the matrix dimensions vs competitors. 8 competitors:
1. OpenBB (ODP) — 开源数据平台+Workspace(商业 UI), 数据聚合/多源、MCP、REST/Excel/Python、AI copilot
2. Microsoft Qlib — AI 量化研究框架（因子库 Alpha158/360、ML pipeline、RD-Agent 自动因子挖掘）
3. backtrader (+quantstats) — 回测框架生态（不可编程性弱，无 GUI/AI）
4. VeighNa vn.py — 交易框架（CTA 回测/实盘柜台/数据中心/Fusion 智策投研 NLP→策略）、4.0 vnpy.alpha ML 因子
5. 聚宽 JoinQuant — 云端中文量化研究平台（Notebook 研究环境、因子库、回测、社区教程）
6. 同花顺问财 — 中文自然语言选股/数据问答（浏览器交互，能力描述基于公开资料，正文未取得）
7. AkShare (+TuShare) — 中文财经数据接口库（数据层）
8. one-api / NewAPI — LLM 网关（供应商管理、统一 API、用量统计、计价）

能力维度 rows (14):
A. 多市场行情数据（A/港/美实时+K线）
B. 技术指标与技术面分析
C. AI 研究分析/报告生成（LLM）
D. 多 Agent 编排（并行/辩论/工具调用）
E. Alpha 因子研究（因子库/搜索/IC 检验）
F. 策略回测（含 A 股规则）
G. 自然语言→策略（IR）
H. 组合管理/风控
I. 模型供应商管理与多模型切换
J. Token 用量统计与计价
K. MCP/Agent 工具生态集成
L. 数据源降级链/熔断、数据质量
M. 中文 UI/面向非技术用户
N. 本地私有部署/开源分发
O. 实盘交易/券商接口
P. 研究环境/Notebook/文档化研究

That's 16 rows — fine for a matrix. Keep cells terse: ✔ (有) / △ (部分/弱) / ✖ (无) / — (不适用). For 我们现状 use the brief details.

Actually to keep the matrix readable in Markdown, I'll build a compact table with columns: 能力维度 | OpenBB | Qlib | backtrader | VeighNa | 聚宽 | 问财 | AkShare | one-api/NewAPI | FinQuant Hub(我们现状). That's 10 columns + row label = 11 columns. Wide but OK in markdown; keep cells 1-3 chars with footnotes.

Then the classification sections. Missing-but-worthy capabilities (must have URL evidence + user value + priority). Candidates:

1. **数据层能力深化：财务三大表/资产负债表等基本面明细**（现 fundamentals 经 AkShare→Tushare→Yahoo）— AkShare 提供完整财报（balance/income/cashflow）、机构持仓、龙虎榜、两融、资金流。证据：akshare GitHub (https://github.com/akfamily/akshare)。为什么值得：AI 投研报告缺乏精确财务数据支撑时结论易空泛；已依赖 AkShare 做 fundamentals，扩展同源即可低风险获得。优先级：高（低成本高收益）。Hmm, but 报告说 "Missing capabilities" — our产品已有多项。需谨慎：我们现状有多少？PROJECT_BRIEF 说 alpha WQ 4367 字段、13 章报告、fundamentals。我不知道具体是否已有财务三表。为避免误报"缺失"，我应基于 brief 已知模块判断。brief 核心任务 1-5 外,未提: 财务三表数据、行业板块成分股数据（港美）、通知推送（已有 alerts router）、移动端、实盘、研究 notebook、批量导出、数据质量监控。I'll frame missing items at a capability level with "现状缺失（据 PROJECT_BRIEF 未覆盖）" wording and let parent verify. That's honest.

Top missing-with-evidence candidates:

1. **回测绩效报告/参数优化与风险指标缺口**（quantstats 生态）：backtrader + quantstats 提供夏普/最大回撤/卡玛等绩效分析。证据：https://github.com/ranaroussi/quantstats。我们回测 v1/v2 已有，但 brief 没提绩效统计报告。为什么值得：非技术用户需要"这策略行不行"的一页纸结论，量化数字比曲线更可信。优先级：高。

Actually I need to be careful—Alpha 模拟绩效统计 recently completed ("Alpha 模拟绩效统计" in brief). Hmm. It says 近期连续完成: 供应商管理、计价模块、用量统计详情（对齐 CC Switch）、Alpha 模拟绩效统计等. So绩效统计 exists for Alpha. For backtest maybe exists too. I'll phrase missing items as "提升方向" with evidence and let parent triage against codebase. The task explicitly wants "当前项目缺失但有依据值得做的" — I'll provide candidates with clear "为什么值得做" and note "是否需要由主 Agent 在原代码中核实".

2. **自然语言→因子/策略 → 因子库自动化挖掘（RD-Agent 式自动因子挖掘）**：Qlib README 的 RD-Agent（https://github.com/microsoft/RD-Agent, arXiv 2505.15155）做自动因子挖掘与模型优化；VeighNa Fusion 智策投研做"策略描述→代码→回测→参数优化"（https://github.com/vnpy/vnpy README）。我们已有 IR 自然语言→策略（基础），但缺"自动因子挖掘/参数优化闭环"。为什么值得：用户价值 = 从"问一句"到"持续优化"，把投研从一次性提问变成迭代研究；成熟度 = RD-Agent 是 2025 arXiv+开源实现，可按 Qlib 因子体系（Alpha158/360）借鉴。优先级：中-高（建立在已完成的 IR 之上）。

3. **用量统计/计价模块对标偏差校正：借鉴 one-api/NewAPI 的渠道-计价模型**：证据：https://github.com/QuantumNous/new-api、https://github.com/songquanpeng/one-api。项目 brief 说"对齐 CC Switch"，而 CC Switch（https://github.com/farion1231/cc-switch）实为 Claude Code 配置/供应商切换工具（132k★），不含用量统计与计价核心；真正的用量/计价/多 key 池管理参考是 one-api/NewAPI（模型映射、模型价格倍率、分组、key 池轮询、额度）。我建议：保持 CC Switch 的交互简洁度 + 引入 new-api 的"模型价格倍率/分组/额度"数据模型提升计价准确性。优先级：中。This is a genuinely valuable finding for the parent.

4. **数据可追溯性/引用来源（OpenBB "connect once, consume everywhere"+数据标准化 provider 模型）**：OpenBB ODP 把多数据源统一为 provider 层+REST/MCP/Excel 多出口（README）。我们已有数据源降级链——已有能力，不算缺失。可作为"行业基础能力已具备"的确认。

5. **中文研究社区/教程/模板（聚宽式研究文档）**：证据：https://www.joinquant.com/（未取得正文，标注）。用户价值：非技术用户上手需要"例子库/模板报告/教学"。优先级：低-中（发布后可做 docs/示例）。

6. **金融知识问答数据集/投教（问财式自然语言问答）**：我们已做 IR+聊天，问财能力是"数据问答"，用户价值=降低查询门槛（"茅台最近市盈率多少"）。证据：https://www.iwencai.com/（未取得正文）。优先级：低（与 IR 重叠，数据问答是 IR 的自然组件）。

7. **实盘交易/券商接口** → 不适合：VeighNa 才做实盘（柜台/合规），个人用户风险高；our 13 工具中 AssessTradingConnector 是 design_only 无账户/订单 I/O — 架构已明确避免。理由：合规/资金风险、用户是非技术个人、本地系统不应承担交易执行；资源应投向研究闭环。优先级：不做。

8. **Notebook 研究环境（聚宽/OpenBB workspace 式）** → 不适合当前：brief 明确非技术用户避免 CLI/代码；Notebook 面向会写代码的研究员，与目标用户错位。低优先级/不做（除非未来开 Vuln 给量化进阶用户）。

9. **高频数据/分钟级因子（Qlib HF）** → 不适合：数据源（腾讯/新浪/Yahoo 免费源）不支持可靠分钟级历史；成本高收益低。

10. **报表导出/报告 PDF（研究产出沉淀）**、**移动端** — maybe mention briefly? Keep report focused; 3-5 missing items enough.

Now product category judgment (产品类别判断):
- FinQuant Hub 在竞品谱系中的位置：它是"面向中文非技术个人投资者的本地部署一体化投研工作台"——融合了 4 类产品的子集：
  a) 本地量化研究平台（OpenBB/Qlib 的方向，但全中文+全栈一体+无代码）
  b) AI 投研助手（问财/通用 LLM 用法，但带多 Agent+工具闭环）
  c) 行情终端的本地化替代（同花顺/东财，但私有自托管）
  d) LLM 基建（one-api/NewAPI 的用量计价子集 + CC Switch 的供应商切换体验）
- 最接近国际对标 = OpenBB（数据层+AI agent 方向）∪ Qlib（因子研究）；中文情境最接近 = 聚宽（研究环境）∪ 问财（自然语言）；基础设施 = one-api/NewAPI。
- 独特定位：**"中文、本地私有、无代码、全栈一体"** 的组合在现有产品中没有直接同品位竞品；OpenBB 偏数据和专业用户、聚宽偏云端代码研究、问财偏查询问答、vnpy 偏交易执行。

竞品清单 with URLs:
1. OpenBB — https://github.com/OpenBB-finance/OpenBB（72.9k★）— 开源数据平台+AI agent（ODP）+Workspace 商业 UI
2. Microsoft Qlib — https://github.com/microsoft/qlib（48.5k★ MIT）+ RD-Agent https://github.com/microsoft/RD-Agent — AI 量化研究框架、Alpha158/360 因子库
3. backtrader — https://github.com/mementum/backtrader（23.2k★ GPL）— 老牌回测框架，维护停滞；生态 quantstats
4. VeighNa vn.py — https://github.com/vnpy/vnpy（45.3k★ MIT v4.4）— 交易框架：CTA/实盘柜台/Fusion 智策投研 NLP→策略/vnpy.alpha
5. 聚宽 JoinQuant — https://www.joinquant.com/（正文未取得，SPA）— 云端中文量化研究平台（Notebook/因子/回测/社区）
6. 同花顺问财 — https://www.iwencai.com/（正文未取得，SPA）— 中文自然语言选股/数据问答
7. AkShare（+TuShare）— https://github.com/akfamily/akshare（22.5k★ MIT）/ https://github.com/waditu/tushare（15.4k★，2024-03 后停更）— 中文财经数据接口
8. one-api / NewAPI — https://github.com/songquanpeng/one-api（36.8k★ MIT）/ https://github.com/QuantumNous/new-api（47.9k★ AGPL Go）— LLM 网关：多供应商、统一 API、用量统计、计价
(旁注：CC Switch https://github.com/farion1231/cc-switch 132k★ — Claude Code/Codex 等配置切换助手，项目已用它做供应商管理对照)

Also mention 米筐 RiceQuant / 掘金量化 as 同质参照 one line? Keep to 8 main + note.

Now matrix. Let me build it. Use symbols: ● 完整/强, ◐ 部分/中等, ○ 弱/基础, ✖ 无/不适用, ~ 未取得. And 我们现状 column with short descriptors.

Let me carefully assign values (my judgment, evidence-backed where fetched):

1. 多市场行情数据: OpenBB ●(多provider:原生+第三方集成), Qlib ○(自带数据组件但以A股为主?Qlib主要美股/A股数据,通过 QlibDataLoader;实际Qlib数据组件较弱,主要靠用户提供), backtrader ✖(需自备数据源,但有feed adapters), VeighNa ◐(数据中心+期货为主,A股数据需自己), 聚宽 ●(A股数据全), 问财 ●(数据问答), AkShare ●(数据层之王), one-api ✖.
   我们: ● (腾讯/新浪/东财/Yahoo 多源降级链+A/港/美).

2. 技术指标: OpenBB ◐(indicator 接口), Qlib ◐(技术衍生特征), backtrader ●(内置大量指标), VeighNa ○, 聚宽 ◐, 问财 ◐, AkShare ✖, one-api ✖.
   我们: ● (7 numpy 指标 SMA 系列+A股惯例) — 但 7 个指标其实偏少 — mark ◐? 我用 ◐ 或注明"7个基础指标"。OK ◐.

3. AI 研究分析/LLM: OpenBB ◐(Workspace AI copilot/agent), Qlib ◐(RD-Agent + QlibLLM?), backtrader ✖, VeighNa ◐(vnpy.alpha/Fusion AI,较新), 聚宽 ○, 问财 ●(AI 问答), AkShare ✖, one-api ✖(只是网关).
   我们: ● (13章中文报告, 4-agent).

4. 多 Agent 编排/工具: OpenBB ●(AI agents + MCP — "MCP servers for AI agents" README), Qlib ◐(RD-Agent 多Agent), backtrader ✖, VeighNa ○, 聚宽 ○, 问财 ○, AkShare ✖, one-api ✖.
   我们: ● (4-agent 并行→team lead + 13 本地工具 + MCP 运行时).

5. Alpha 因子研究: OpenBB ◐(数据获取, 无因子库), Qlib ●(Alpha158/360/101 因子库+IC 评估+自动挖掘 RD-Agent), backtrader ✖, VeighNa ◐(vnpy.alpha dataset 特征工程), 聚宽 ●(因子库/因子平台), 问财 ○, AkShare ◐(原始数据可构造), one-api ✖.
   我们: ◐ (WQ 4367 字段目录/搜索/相关性/模拟) — 有因子搜索+模拟, 无自动挖掘/IC 检验闭环? 写 ◐.

6. 策略回测: OpenBB ◐(有 backtesting extension? OpenBB 曾整合 backtrader — 有 openbb-backtesting; 标 ◐), Qlib ●(回测+真实市场交易模拟), backtrader ●(核心), VeighNa ●(CTA 回测+参数优化), 聚宽 ●, 问财 ○, AkShare ✖, one-api ✖.
   我们: ● (v1 向量 + v2 下一开盘价 A 股规则).

7. 自然语言→策略: OpenBB ○, Qlib ○, backtrader ✖, VeighNa ●(Fusion 智策投研: 描述→代码→回测→参数优化), 聚宽 ○(社区案例), 问财 ●(查询问答, 非策略), AkShare ✖, one-api ✖.
   我们: ● (IR 策略实验室: 自然语言→策略) — 但"→代码"程度? brief 说 IR 自然语言→策略。◐~●. 我标 ●（基础）或 ◐。用 ◐ 因为缺参数优化闭环。

8. 组合管理/风控: OpenBB ◐(portfolio extension 有限), Qlib ○, backtrader ○(analyzer 收益序列), VeighNa ○(仓位管理在策略内), 聚宽 ◐(组合研究), 问财 ○, AkShare ✖, one-api ✖.
   我们: ● (组合管理、持仓、风控工具 AnalyzePortfolioRisk/ShadowTrades).

9. 模型供应商管理/多模型: OpenBB ○, Qlib ○(模型训练框架, 非 LLM 供应商), backtrader ✖, VeighNa ○, 聚宽 ✖, 问财 ✖, AkShare ✖, one-api ●, new-api ●.
   我们: ● (供应商管理 + credentials).

10. Token 用量/计价: OpenBB ✖, Qlib ✖, backtrader ✖, VeighNa ✖, 聚宽 ✖, 问财 ✖, AkShare ✖, one-api ●(用量统计+额度), new-api ●(计价倍率/分组).
    我们: ● (用量/计价模块, 对齐 CC Switch 体验).

11. MCP/工具生态: OpenBB ●(MCP servers for AI agents — README), Qlib ○, backtrader ✖, VeighNa ○, 聚宽 ✖, 问财 ✖, AkShare ✖(可作为 MCP 数据源), one-api ✖.
    我们: ● (MCP 客户端 http+stdio, 供应商管理).

12. 数据源降级/熔断/质量: OpenBB ●(多 provider 架构), Qlib ○, backtrader ○(feed), VeighNa ◐(数据中心), 聚宽 ●(自建数据), 问财 ●, AkShare ◐(多接口爬取), one-api ✖.
    我们: ● (多源链+熔断+prefetch).

13. 中文 UI/非技术用户: OpenBB ○(英文, 专业), Qlib ✖(库), backtrader ✖, VeighNa ◐(中文但面向开发者), 聚宽 ◐(中文但面向代码用户), 问财 ●(中文问答), AkShare ✖(库), one-api ○(中文 UI).
    我们: ● (全中文, 非技术目标, 无 CLI).

14. 本地私有部署/开源分发: OpenBB ◐(开源核心, Workspace 商业 SaaS), Qlib ●(pip 库), backtrader ●(pip), VeighNa ●, 聚宽 ✖(云端 SaaS), 问财 ✖(SaaS), AkShare ●(库), one-api ●(自托管).
    我们: ● (本地 127.0.0.1 + Docker LOCAL_ONLY, Local OSS 目标).

15. 实盘交易: OpenBB ○(broker 功能少), Qlib ✖(模拟), backtrader ◐(broker 抽象+IB), VeighNa ●(柜台实盘), 聚宽 ◐(模拟盘为主), 问财 ✖, AkShare ✖, one-api ✖.
    我们: ○ (13 工具中 AssessTradingConnector 为 design_only, 无账户/订单 I/O — 架构上明确不做).

16. 文档化研究环境/Notebook: OpenBB ◐(Python/Excel 出口), Qlib ◐(notebook 示例), backtrader ○, VeighNa ○, 聚宽 ●(Notebook 研究环境), 问财 ✖, AkShare ○, one-api ✖.
    我们: ○ (无 Notebook, 有研究报告/讨论会话) — 标 ○.

Good. Matrix built.

Now write the file. Use Chinese, follow structure. Length: comprehensive but not bloated. Include evidence URLs. Note 未取得 for 聚宽/问财/CC Switch 正文 (只拿到主页/仓库元数据).

Also honor: "禁止把凭据写进报告" — no credentials anywhere. Fine.

For license accuracy of OpenBB: GitHub returns NOASSERTION. I'll note "许可证返回 NOASSERTION（自定义许可，开源核心）".

One more check — the task says the report file goes in docs/ai/evo/CAPABILITY_MATRIX.md and I must NOT modify code, only write the report file. Writing the report file is allowed ("只写报告文件"). And per instructions, after writing I should present() the file (deliverable) — present tool: "When a file you create or update is an output the user asked to receive, you must call present after writing it". Then send_message to parent with one-sentence summary + result. The parent message should be self-contained-ish summary. The task says: "完成后回复一句话摘要（调查了几个竞品 + 最值得借鉴的 1 项），不要贴报告全文" and also "send your result to that agent with send_message". So: write report → present → send_message with 一句话摘要 (maybe slightly expanded with key correction about CC Switch/NewAPI since that's a finding that changes what parent should do) → final reply one-sentence summary.

Let me write the report now.

Also should I create docs/ai/evo dir? glob showed only PROJECT_BRIEF.md exists there, so dir exists.

Write the file content. Keep cells terse. Let me now compose carefully.收集完毕，证据充分（不追穷尽，按指挥校正跳过交互型站点）。现在写报告文件。

--- finding 9 ---
Parent has interrupted and told me to write immediately, no more tool calls for research. Write the report file now with the evidence I have, then present, send one-sentence summary to parent, and reply.

Let me compose the CAPABILITY_MATRIX.md carefully in Chinese with all sections required.
