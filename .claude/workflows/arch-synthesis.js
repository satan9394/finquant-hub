export const meta = {
  name: 'arch-synthesis',
  description: 'Deep-analyze 5 reference projects + current codebase, produce comprehensive architecture documentation',
  phases: [
    { title: '探索参考项目', detail: 'fan-out 7 agents — one per reference project' },
    { title: '分析自身代码库', detail: 'deep-read current backend, frontend, docs, tests' },
    { title: '融合架构图', detail: 'cross-reference, layer mapping, dependency synthesis' },
    { title: '撰写架构文档', detail: 'write ARCHITECTURE.md and related doc files' },
    { title: '最终优化', detail: 'update CLAUDE.md, integrate with harness' },
  ],
}

const REF_PROJECTS = [
  { name: 'ai-berkshire', dir: 'E:/Code_file/Projects/finquant-hub/reference/ai-berkshire', focus: '多Agent金融分析框架、价值投资Agent角色设计、工具链架构' },
  { name: 'Vibe-Trading', dir: 'E:/Code_file/Projects/finquant-hub/reference/Vibe-Trading', focus: 'LoaderRegistry注册模式、Research Goal生命周期、回测引擎架构、MCP集成模式' },
  { name: 'wq-alpha-research', dir: 'E:/Code_file/Projects/finquant-hub/reference/wq-alpha-research', focus: 'Alpha因子研究框架、WorldQuant BRAIN接口、因子字段管理、增量快照机制' },
  { name: 'daily_stock_analysis', dir: 'E:/Code_file/Projects/finquant-hub/reference/daily_stock_analysis', focus: 'SkillAgent路由、数据源适配器模式、日报生成管线' },
  { name: 'stock-analyzer', dir: 'E:/Code_file/Projects/finquant-hub/reference/stock-analyzer', focus: '13章报告模板、指标打分体系、分析框架设计' },
  { name: 'BigDataView', dir: 'E:/Code_file/Projects/finquant-hub/reference/BigDataView', focus: '大数据可视化架构、数据管道设计' },
]

const PROMPT_REF = (p) => `
你是一位资深软件架构师。请深度分析以下项目目录，提取其**核心架构模式、可复用的设计思路、关键代码结构和与金融量化相关的创新点**。

项目: ${p.name}
路径: ${p.dir}
关注要点: ${p.focus}

要求：
1. 先列出该项目的主要目录结构和关键文件
2. 提取核心架构模式（路由注册、工具链、Agent编排、数据流等）
3. 指出哪些设计可以**直接复用**到FinQuant Hub中
4. 指出哪些设计需要**改造后借鉴**
5. 给出每个可借鉴点的具体位置（文件路径+行范围）和实施建议
6. 最后给出0-10的"借鉴价值评分"

请结构化输出 JSON，包含字段: projectName, summary, corePatterns (array), directlyReusable (array), adaptedReuse (array), keyFiles (object), score, recommendations
`

phase('探索参考项目')
const refResults = await pipeline(
  REF_PROJECTS,
  p => {
    const label = `scan:${p.name}`
    const phase = '探索参考项目'
    return agent(PROMPT_REF(p), { label, phase, schema: {
      type: 'object',
      properties: {
        projectName: { type: 'string' },
        summary: { type: 'string' },
        corePatterns: { type: 'array', items: { type: 'string' } },
        directlyReusable: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, location: { type: 'string' }, detail: { type: 'string' } }, required: ['item','location','detail'] } },
        adaptedReuse: { type: 'array', items: { type: 'object', properties: { concept: { type: 'string' }, value: { type: 'string' }, adaptation: { type: 'string' } }, required: ['concept','value','adaptation'] } },
        keyFiles: { type: 'object' },
        score: { type: 'number' },
        recommendations: { type: 'string' },
      },
      required: ['projectName','summary','score','recommendations'],
    }})
  },
)

phase('分析自身代码库')
const codebaseIntro = `
你是一位资深软件架构师。请深度分析 FinQuant Hub 项目自身代码库。

项目在 E:/Code_file/Projects/finquant-hub

需要分析的范围：
1. 后端 backend/app/ — 所有 routers/ services/ agent/ backtest/ 目录
2. 前端 frontend/src/ — pages/ components/ services/ types/
3. 文档 docs/ 目录下所有 .md 文件

请特别关注：
- 路由架构（14个router的注册方式、依赖关系）
- 服务层设计（市场数据、LLM客户端、分析管线、回测引擎）
- Agent框架（6个工具的定义、注册、调用模式）
- 数据库架构（15个表的设计、关系、数据流）
- 前端路由/组件架构（13个页面、状态管理、API调用模式）
- 现有文档的覆盖缺口
- 架构不变量（当前代码中隐含的规则）

输出结构化JSON:
{
  "routerArchitecture": { "description": "...", "routers": {...}, "patterns": [...] },
  "serviceArchitecture": { "services": {...}, "dataFlow": "...", "dependencies": [...] },
  "agentArchitecture": { "tools": [...], "orchestrators": [...], "patterns": [...] },
  "databaseArchitecture": { "tables": [...], "relationships": "...", "patterns": [...] },
  "frontendArchitecture": { "pages": {...}, "componentMap": "...", "dataFlow": "..." },
  "docGaps": [...],
  "architecturalInvariants": [...],
  "recommendations": "..."
}
`

// Fan out to specializations within the codebase
const codebaseResults = await parallel([
  () => agent(`Analyze backend architecture deeply:\n${codebaseIntro}\nFocus especially on routers/ services/ agent/ backtest/ and database.py`, {
    label: 'deep:backend',
    phase: '分析自身代码库',
    schema: {
      type: 'object',
      properties: {
        apiSurface: { type: 'string' },
        routerPatterns: { type: 'array', items: { type: 'string' } },
        serviceLayers: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, responsibility: { type: 'string' }, deps: { type: 'array', items: { type: 'string' } } }, required: ['name'] } },
        agentSystem: { type: 'object', properties: { tools: { type: 'array' }, orchestrators: { type: 'array' } } },
        dataFlowDiagram: { type: 'string' },
        invariants: { type: 'array', items: { type: 'string' } },
        techDebt: { type: 'array', items: { type: 'string' } },
      },
      required: ['apiSurface','dataFlowDiagram','invariants'],
    }
  }),
  () => agent(`Analyze frontend architecture deeply:\n${codebaseIntro}\nFocus especially on pages/ components/ services/ types/ and build config`, {
    label: 'deep:frontend',
    phase: '分析自身代码库',
    schema: {
      type: 'object',
      properties: {
        pageMap: { type: 'object' },
        componentTree: { type: 'string' },
        apiClientPattern: { type: 'string' },
        stateManagement: { type: 'string' },
        buildConfig: { type: 'string' },
        bundleAnalysis: { type: 'string' },
        invariants: { type: 'array', items: { type: 'string' } },
        gaps: { type: 'array', items: { type: 'string' } },
      },
      required: ['pageMap','apiClientPattern','gaps'],
    }
  }),
  () => agent(`Analyze project docs and test coverage:\n${codebaseIntro}\nFocus on docs/ directory, test coverage, and overall documentation completeness`, {
    label: 'deep:docs+tests',
    phase: '分析自身代码库',
    schema: {
      type: 'object',
      properties: {
        existingDocs: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, purpose: { type: 'string' }, stale: { type: 'boolean' } } } },
        coverageAnalysis: { type: 'string' },
        docGaps: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'string' },
      },
      required: ['existingDocs','docGaps'],
    }
  }),
])

phase('融合架构图')
// Synthesize everything
const synthesisInput = JSON.stringify({
  refProjects: refResults.filter(Boolean),
  codebaseBackend: codebaseResults[0],
  codebaseFrontend: codebaseResults[1],
  codebaseDocs: codebaseResults[2],
  currentCLAUDE: "Current CLAUDE.md has ~80 lines — key files list, broken items, data sources. Good start but lacks: architecture invariants, dependency rules, error conventions, route pattern docs."
})

const synthesis = await agent(`
你是一位资深软件架构师和文档工程师。现在要将以上分析结果融合成一个**完整、内在一致的架构视图**。

输入是：
1. 6个参考项目的深度分析结果
2. FinQuant Hub自身后端/前端/文档分析结果

请完成以下融合任务：

### 1. 架构总览（高层定位）
一句话概括 FinQuant Hub 是什么。然后给出系统分层的层次图。

### 2. 核心架构模式
从自身代码和参考项目中提取出 FinQuant Hub **实际使用**的核心架构模式（不是想要什么，是代码里已经有什么）：
- 路由注册模式（14个路由器的统一注册）
- 服务层分层模式
- Agent 工具框架
- 数据源适配器模式（Tencent/Sina/EastMoney + 未来Yahoo）
- SSE 流式通信模式（chat/discussion/research）
- LLM 客户端抽象层

### 3. 架构不变量（用"不存在什么"表达）
从代码中提取实际隐式规则。

### 4. 数据流图（文字描述）
从用户请求到数据库/外部API再回来，完整的一个请求生命周期。

### 5. 参考项目影响地图
每个参考项目的哪些具体设计已经被采纳或应该被采纳到 FinQuant Hub 中。

### 6. 组件依赖关系
后端各服务之间的依赖图（谁调谁）。

### 7. 技术债务与改进路线图
分短期（容易修）、中期（需要设计）、长期（架构级）。

输出是一个完整的 Markdown 文档（中文），约 2000-3000 字，结构清晰，准备直接写入 docs/ARCHITECTURE.md。
`, { label: 'synthesize:architecture', phase: '融合架构图', schema: {
  type: 'object',
  properties: {
    markdown: { type: 'string' },
    archInvariants: { type: 'array', items: { type: 'string' } },
    dataFlowSummary: { type: 'string' },
    refImpactMap: { type: 'array', items: { type: 'object', properties: { project: { type: 'string' }, influence: { type: 'string' }, priority: { type: 'string' } } } },
    techDebtRoadmap: { type: 'object', properties: { immediate: { type: 'array', items: { type: 'string' } }, medium: { type: 'array', items: { type: 'string' } }, longterm: { type: 'array', items: { type: 'string' } } } },
  },
  required: ['markdown','archInvariants','dataFlowSummary','techDebtRoadmap'],
}})

phase('撰写架构文档')
// Write the architecture doc
await agent(`
你现在要基于以下融合架构内容，实际撰写两个文档文件。

下面是你已经合成的架构内容（用作素材）：
${synthesis.markdown}

### 文件1: docs/ARCHITECTURE.md
项目架构文档，面向新维护者和 agent。
- 中文
- 2000-3000 字
- 包含：一句话定位、分层架构图(文字)、路由地图、服务依赖、数据流、架构不变量、参考项目影响地图、技术债务路线图
- 不要重复 HANDOVER.md 已经详细写过的内容（bug fixes、具体的测试数量等）
- 格式是给人和 AI agent 都能读的结构化 Markdown

### 文件2: docs/API_CONTRACT.md
如果现有 API_CONTRACT.md 过时了，重写/更新它为当前 API 表面目录（仅覆盖 MVP + 新端点，不要穷举每个参数）：
- 按 router 分组的端点清单
- 每个端点的路径、方法、简要功能
- 标记哪些是 MVP、哪些是新增的
- 以表格形式呈现

输出 markdown1 和 markdown2 两个字段。
`, {
  label: 'write:docs',
  phase: '撰写架构文档',
  schema: {
    type: 'object',
    properties: {
      archDoc: { type: 'string' },
      apiContract: { type: 'string' },
    },
    required: ['archDoc','apiContract'],
  },
})

phase('最终优化')
// Write the files
