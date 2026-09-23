# EVALUATION_RESULT_G01

- 判定：**ACCEPT**
- 控制流：`start.bat:78 :environment` → 缺 `.env` 时复制后才落到 `:backup`(88) → 无 DB 时 `:backup:91 if not exist ... goto launch` 跳过 → `:launch`(97)，顺序正确。
- 备份目标：`backend\data\backups\finquant-backup-yyyyMMdd-HHmmss.db`（`start.bat:93`），目录不存在时 `New-Item -Force` 自建；失败仅打印提示并继续，不阻塞启动（94-95）。
- 删除铁律：grep `del |rmdir|Remove-Item|DeleteFile|rd /s` 对 start.bat **无匹配**；超 7 份仅 `Write-Host '[提示] 备份超过 7 份…手动清理（回收站）'`，无自动删除。
- 换行：`CRLF=132 LFonly=0`（全文 132 行），CRLF 未被破坏。
- QUICKSTART：`docs/QUICKSTART.md:155-167` 恢复步骤可执行（停服 → 选备份 → 先留退路再覆盖 → 清 wal/shm → 重启），与脚本路径一致。
- 次要观察（不阻断）：`start.bat:93` 的 `$excess` 计算后未使用；`$ErrorActionPreference='SilentlyContinue'` 下复制失败通常返回 0，故 94 行提示可能不触发，且 95 行总会打印「已备份」——建议改为按 `Test-Path $dest` 判断后再提示。
