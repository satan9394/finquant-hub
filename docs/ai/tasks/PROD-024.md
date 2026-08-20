# PROD-024: AI 意图入口：快速问答、深度研究、多视角审查

> 状态：`[DONE]`  
> 阶段：Productization Phase 2

## 用户问题

研究工作区直接暴露团队与角色实现，用户需要先理解 Agent 架构，才能判断应该提一个问题、生成完整报告，还是主动寻找反证和分歧。

## 目标行为

先以任务语言呈现三种研究强度，说明产物、相对耗时、模型额度和最后启动动作；选择后只导航和预填。各目标页在真正调用模型前再次说明行为边界，现有团队角色细节移入高级披露。

## 范围内文件

- `frontend/src/features/researchIntent.ts`
- `frontend/src/components/research/ResearchIntentPicker.tsx`
- `frontend/src/pages/ResearchWorkspace.tsx`
- `frontend/src/pages/Chat.tsx`
- `frontend/src/pages/Research.tsx`
- `frontend/src/pages/Discussion.tsx`
- `frontend/src/app.css`
- `frontend/tests/ChatStarterDraft.test.tsx`
- `frontend/tests/ResearchIntentPicker.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不新增或替换任何 AI pipeline、角色、prompt、模型或计费逻辑。
- 不给出无法验证的分钟数、token 数或金额，只使用相对耗时/额度级别。
- 选择意图只导航和预填；不得自动发送、运行研究、创建讨论或启动团队。
- 不修改 `reference/`，不提交或发布。

## 验收

- 研究工作区首要 AI 入口明确区分快速问答、深度研究和多视角审查。
- 每个选项说明产物、相对耗时、模型额度及最终由用户确认启动。
- 目标页保留预填且不自动调用模型，并在发送/运行前显示额度提示。
- 团队角色与工具细节仍可用，但默认位于高级披露。
- 测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除意图选择组件与三处额度提示，将四大师团队卡恢复为工作区直属内容；AI API 和持久化不受影响。

## 验证结果

- 测试先覆盖三种意图的导航边界；浏览器发现无当前会话时 Chat 隐藏 URL 草稿，补充回归测试后改为显式草稿和“新建会话并继续”，仍不自动创建或发送。
- 前端全量测试：25 files / 57 tests passed；`bun run build` 通过；`git diff --check` 通过。
- 实时 600519 工作区显示快速问答、深度研究和多视角审查三种选择，均说明产物、相对耗时、模型额度和最终确认动作；团队详情默认折叠在高级披露。
- 快速问答仅打开带 prompt 的 Chat 草稿；深度研究仅预填 600519；多视角审查仅打开带主题的创建房间弹窗。未点击发送、开始研究、创建房间或开始讨论。
- 390×844 下三张意图卡单列展示，`scrollWidth=375 <= innerWidth=390`。
- 证据：`artifacts/productization/phase2/13-ai-intent-desktop.png`、`14-ai-intent-narrow-390x844.png`。
- GitHub-first 搜索因搜索服务网络错误未完成；实现复用现有 Chat、Research、Discussion 路由和组件，无新依赖、API 或持久化变更。
