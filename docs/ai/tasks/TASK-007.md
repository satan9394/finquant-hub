# TASK-007: report_audit 工具吸收

## 目标
从 `reference/ai-berkshire/tools/report_audit.py` 提取审计报告生成功能，新建 `backend/app/tools/report_audit.py`。

## 非目标
- 不改 `financial_rigor.py`
- 不改 `reference/` 目录
- 不改架构不变量

## 允许修改
- `backend/app/tools/report_audit.py`（新建）

## 实现思路
report_audit.py 含 553 行，核心能力：
1. `extract_data_points(md_text)` — 从 markdown 表格提取关键数据点
2. `render_verdict(results)` — 生成审计结论报告
3. `_parse_md_tables(lines)` — markdown 表格解析器
4. `cross_validate` — 已存在于 financial_rigor.py，不再重复

提取前两个到新模块，依赖 `financial_rigor.py` 的已有验证函数（`verify_market_cap`, `verify_valuation` 等）。

但 Codex CLI 在 Windows 沙箱无法执行 shell 命令，无法运行 pytest/ruff 验证。本次任务只需要用 MCP 工具读取参考文件和写入新模块。

## 验收（由我手动执行）
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
cd frontend && bun run build
```

## 回滚
```bash
git checkout -- backend/app/tools/report_audit.py
```
