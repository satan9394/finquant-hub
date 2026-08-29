# {PROJECT_NAME}

> 使用：复制本文件到项目根目录 → 替换 {占位符} → 保持约 100 行，超出内容下沉到 docs/。

## 项目概览
技术栈：{stack}
一句话：{one_line_desc}

## 核心命令
- 启动开发服务器：`{dev_cmd}`
- 运行测试：`{test_cmd}`
- 类型检查：`{typecheck_cmd}`
- {lint_cmd}

## 架构不变量（不存在什么）
- 不存在 {不变量1}
- 不存在 {不变量2}
- 不存在 {不变量3}

## 目录约定（各目录放什么）
{workspace}/{dir1}/ → {用途}
{workspace}/{dir2}/ → {用途}
{workspace}/{dir3}/ → {用途}

## 常见陷阱
- {陷阱1（来自一次真实事故，别凭空造）}
- {陷阱2}

## 指针
- 架构指南 → docs/ARCHITECTURE.md
- 设计决策 → docs/decisions/（ADR）
- 活跃任务 → docs/exec-plans/
- 依赖层级（强制执行）：{dep_hierarchy}，违反者 CI 拦截。

## 项目 Harness 指针（工作前必读）

本项目嵌入了 harness-engineering（v4.11.0）。开始工作前，先读下列文件了解项目治理信息：

- `.harness/manifest.json` → 嵌入清单（装了什么组件、验证结果）
- `STATE.json` → 规则与事故记忆（同错 ≥2 次 / 返工率 ≥50% 的信号源）
- `HANDOFF.md` → 当前目标 / 完成标准 / 验证命令 / 未决问题（跨会话接续权威）
- `notes/` → 决策记录（Agent Notes 四态：为什么这么做、放弃了什么）
- `docs/ARCHITECTURE.md` → 架构地图（模块职责 / 架构不变量 / 依赖层级）

读取优先级：`HANDOFF.md` 与 `.harness/manifest.json` 最先读，`STATE.json` 与 `docs/ARCHITECTURE.md` 按需读。
文件不存在说明该组件未嵌入（未跑 `bootstrap.py --init`），跳过即可。

## Harness 日常用法（v4.11.0）

- **一句话嵌入/重装**：用户说"嵌入 harness"→ 自动跑 `python scripts/bootstrap.py --init --dir . --name <项目名>`（默认 single，不提问；用户明说团队/生产才加 --mode）
- **一句话体检**：用户说"执行 harness / 跑一下 harness"→ 自动跑 `python scripts/harness-check.py .`（汇总体检报告）
- **收尾必做**：`python scripts/handoff-log.py --append "做了什么" --verify "验证结果"` → 追加 HANDOFF.md 变更日志
- **审计健康**：`python scripts/audit.py .`（0=健康，1=有问题）
- **记决策**：`python scripts/note-lifecycle.py new --class architecture --title "..."`；提交前 `note-lifecycle.py verify`
- **记事故**：`python scripts/record-error.py`（agent 反复犯的错 → STATE.json）
- 完整上手见 `docs/HARNESS-QUICKSTART.md`
