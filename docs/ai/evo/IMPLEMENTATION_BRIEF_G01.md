# IMPLEMENTATION_BRIEF — Vertical Slice 2：G-01 启动自动备份 + 恢复指引

> Orchestrator 第五阶段产物，2026-09-13。来源：PRODUCT_GAP_MAP G-01（数据风险）。
> 背景：迁移时才有 `.pre-vN.bak`（14 份全库快照、不清理）；无日常自动备份、无恢复工具；start.bat 无备份步骤；QUICKSTART 备份=手动复制 data/。

## 目标
1. **启动自动备份**：start.bat 在启动 uvicorn 前，对 `backend/data/finquant.db` 做滚动备份（保留最近 N 份，如 7 份），命名 `finquant-backup-YYYYMMDD-HHMMSS.db`，存 `backend/data/backups/`。WAL 模式下拷贝需在服务停止时做（start.bat 启动时服务未起，安全）。
2. **恢复指引**：QUICKSTART「更新与备份」补"如何从备份恢复"（停止服务 → 用备份文件替换 finquant.db → 删除 -wal/-shm → 重启）。

## 用户场景
用户升级/磁盘故障/误操作后数据丢失，从自动备份恢复，而不是"迁移 .bak 不清理 + 无恢复路径"。

## 涉及模块
- `start.bat`（Windows 双击路径，目标用户主入口）
- `docs/QUICKSTART.md`（恢复指引）
- `docs/LOCAL_DATA_AND_PRIVACY.md`（若已有备份段则同步，否则跳过）

## 不能破坏
- 不动 database.py 迁移逻辑（既有 .pre-vN.bak 保留）；不动 `.env`/凭据（备份只含 DB）。
- **零新依赖**（纯 bat + 文件拷贝）；不碰 Docker 路径（Docker 数据在卷内，已有文档）。
- 既有 QUICKSTART 升级流程语义不变（在启动前加备份不影响手动备份步骤）。

## 验收标准
1. start.bat 启动流程里，若 `backend/data/finquant.db` 存在 → 在启动前创建 `backups/finquant-backup-<时间戳>.db`。
2. 备份目录滚动：超过 7 份时删最旧（按文件名时间戳）。
3. 恢复指引写入 QUICKSTART（停止→替换→删 wal/shm→重启）。
4. 不破坏首次运行（无 DB 时跳过备份）。
5. 门禁：`git diff --check`；手动推演脚本路径（无测试框架覆盖 bat，靠代码审阅 + 语法核对）。

## 错误场景
- 备份目录创建失败 → 提示但不中断启动（备份非阻塞）。
- 磁盘满 → 备份失败提示，服务照常启动（数据仍可用，仅无新备份）。

## 测试要求
- bat 逻辑手工推演 + 文档审阅（项目无 bat 测试框架）；确保无 rm（用 del 走回收站？bat 里清理旧备份会删文件——**注意删除铁律**：bat 里滚动删除旧备份是内部机制，但与"删除进回收站"规则冲突）；**处理**：滚动删除在 bat 用 `del /q` 会违反铁律——改为不自动删除，仅当超过阈值时提示用户手动清理，或保留 N 份后停止（最旧保留）。**决策：不自动删**，超过 7 份时仅提示，让用户按回收站规则处理——避免铁律冲突。