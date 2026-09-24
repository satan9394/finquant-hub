# BACKLOG-053: 全局效能用量看板升级与 Prompt Caching 自动优化

> 目标模型：Codex (GPT-6 Luna · 最大思考模式)
> 依赖前置：BACKLOG-052 已合入
> 核心定位：自动 Prompt Caching 标记注入 + 全局效能大盘统计

---

## 1. 目标 (Task)
打通金融长研报与多 Agent 分析的成本杀手级特性：在 Anthropic 协议下自动注入 Prompt Caching 标记，削减 90% 长上下文重复费用；同时在全局 Settings 用量统计中，将遥测指标聚合为效能大盘（全站平均速率、TTFT 曲线、缓存节省金额汇总）。

---

## 2. 边界控制 (Touch Boundaries)
- **允许修改/新建**：
  - `backend/app/services/anthropic_protocol.py` (MODIFY: 自动 Prompt Caching 注入器)
  - `backend/app/routers/usage.py` (MODIFY: 扩展 /api/usage/stats 聚合指标)
  - `frontend/src/components/settings/UsageHero.tsx` (MODIFY: 增加效能收益卡片)
  - `frontend/src/components/settings/UsageStatsTable.tsx` (MODIFY: 增加速率与缓存列)
  - `frontend/src/services/usageApi.ts` (MODIFY: 扩展类型定义)
  - `backend/tests/test_prompt_caching.py` (NEW)
  - `backend/tests/test_usage_telemetry_stats.py` (NEW)
  - `frontend/tests/UsageDetail.test.tsx` (MODIFY: 同步测试断言)
- **严禁触碰**：
  - 严禁篡改既有基础单价与计价换算公式（保持单一换算口径 `estimate_cost()`）。
  - 严禁臆造虚假缓存节省数据，必须严格以数据库落盘的 `cached_tokens` 为事实来源。

---

## 3. 架构规则与参考指针 (Decision Rules & Reference)
- **自动 Prompt Caching 规则**：
  - 参考本地 `E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src\src-tauri\src\proxy\cache_injector.rs` 设计。
  - 在 Anthropic 模式下，当请求的 `system` 提示词或工具参数列表总预估 Token 超过 1024 时，自动在 System Prompt 字典尾部附加 `cache_control: {"type": "ephemeral"}`。
  - 发送请求时自动附加请求头 `anthropic-beta: prompt-caching-2024-07-31`。
- **效能统计聚合计算（`routers/usage.py`）**：
  - `avg_tokens_per_second`：`AVG(tokens_per_second)`（仅统计有效正数）。
  - `avg_ttft_ms`：`AVG(ttft_ms)`。
  - `overall_cache_hit_rate`：`SUM(cached_tokens) * 100.0 / NULLIF(SUM(prompt_tokens), 0)`。
  - `total_saved_cost`：根据各模型单价与 `cached_tokens` 折算出按 90% 优惠抵扣的资金总额。

---

## 4. 契约规范 (Output Contract)
- `GET /api/usage/stats` 响应中新增 `efficiency` 对象：
  - `avg_speed_tps` (float | null)
  - `avg_ttft_ms` (int | null)
  - `overall_cache_hit_rate` (float | null)
  - `total_saved_cost` (float | null)
  - `currency` (str)

---

## 5. 验证门禁 (Validation Gates)
```bash
# 1. 后端单元测试（缓存标记自动注入、效能指标聚合与防除零处理）
cd backend && .venv\Scripts\python.exe -m pytest tests/test_prompt_caching.py tests/test_usage_telemetry_stats.py -q

# 2. 后端代码规范检查
cd backend && .venv\Scripts\python.exe -m ruff check .

# 3. 前端编译与测试
cd frontend && bun run build
cd frontend && bun run test tests/UsageDetail.test.tsx
```

---

## 6. 完工闭环 (Documentation Closeout)
1. 更新 `docs/ai/evo/NEXT_BACKLOG.md`，将 BACKLOG-050~053 全序列状态标记为已完成。
2. 同步 `docs/ai/EXEC_PLAN.md` 对应任务卡。
3. 在 `task/CHANGELOG.md` 尾部追加完整交付日志。
