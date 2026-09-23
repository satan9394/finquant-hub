# IMPLEMENT_RESULT — VS-2：G-01 启动自动备份 + 恢复指引

> Implementer（Orchestrator 接管——子代理环境反复卡死）｜ 2026-09-13 ｜ **待独立 Evaluator 质疑**

## 结论
start.bat 启动前自动备份 DB + QUICKSTART 恢复指引，零依赖、零删除。

## 改动
1. **start.bat**：`:environment` 之后插入 `:backup` 段（L88-95），控制流 `:environment → :backup → :launch`：
   - 无 `backend/data/finquant.db` → 直接 `goto launch`（首次运行不建目录）；
   - 有 DB → PowerShell 复制到 `backend/data/backups/finquant-backup-<yyyyMMdd-HHmmss>.db`；
   - 超过 7 份 → **只提示不自动删**（遵守"删除一律回收站"铁律）；
   - 备份失败不阻塞启动（提示后继续）。
2. **docs/QUICKSTART.md**：新增「自动备份与如何恢复」小节（5 步恢复流程 + 说明备份只含 DB 不含密钥）。

## 实测验证（Orchestrator 亲测，非推断）
- **备份逻辑**：临时目录模拟 → 备份文件正确创建、内容一致、计数正确 ✓
- **cmd 语法**：CRLF 临时 bat 复刻同结构 → `^` 续行 + PowerShell 引号解析正常，产生备份并继续到 launch ✓
- **跳过路径**：无 DB 时直接到 launch、不创建目录 ✓
- **换行完整**：start.bat 保持纯 CRLF（132 CRLF / 0 LF-only）——编辑未引入 LF ✓
- **铁律合规**：滚动超限只提示、不调用任何删除 ✓

## 未解决问题 / 风险
1. WAL 模式：备份的是 `finquant.db` 主文件；服务未启动时 WAL 已 checkpoint（进程退出时自动），风险低；若异常断电后立即启动，可能漏掉极少未落盘数据（可接受，迁移备份同样如此）。
2. 备份不加密（含加密凭据列，但密钥文件 `.credential-key` 不备份 → 备份内凭据无法解密，属安全设计）。
3. bat 无自动化测试框架覆盖，验收靠实测 + 人工推演（已做）。

## 证据
- start.bat L78-97（`:environment` → `:backup` → `:launch`）
- docs/QUICKSTART.md「自动备份与如何恢复」小节