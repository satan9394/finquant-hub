# IMPLEMENTATION_BRIEF — Vertical Slice 17：备份产物在多实例与硬中断下不留隐患

> Orchestrator 第五阶段产物，2026-09-11（机器实际日期）。来源：**R3 审计 D3 的两条备份风险**（`RELIABILITY_REPORT_R3.md`）。编排者已核实代码与 Windows 语义。

## 目标
让备份产物**只以"完整可用"或"明确的残缺件"两种形态存在**：既不因并发而互删有效备份，也不让硬中断的残件混进有效备份里。

## 用户场景
用户双击 `start.bat` 启动。两种人会受伤：
- **手快连点两次**（或杀毒/资源管理器重复触发）：两个进程在同一秒内进入备份段；
- **启动过程中强制关机 / 关掉窗口**：备份写到一半被打断。
现状下前者可能**删掉对方刚写好的有效备份**，后者会留下一个**看起来像备份、实际不可用**的文件，还会被算进"7 份"限额里、把真正有效的备份挤出提示范围。

## 当前问题（均已核实）
`start.bat:117` 的备份 PowerShell 里：
1. **目标名只有秒级精度**：`$dest = Join-Path $dir ('finquant-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.db')` ⇒ 同秒进入的两个进程**得到同一个 `$dest`**。
2. **失败侧会删掉该路径**：`if($LASTEXITCODE -ne 0 -or -not (Test-Path $dest)){ if(Test-Path $dest){ ...DeleteFile($dest,'OnlyErrorDialogs','SendToRecycleBin') }; exit 1 }` ⇒ 若同秒的另一个进程**已成功写出有效备份**，这个失败进程会把它**回收掉**。
3. **残缺件与有效件无法区分**：中断后留下的是 `finquant-backup-<ts>.db`，与正常产物同名同形；且它会命中 7 份计数用的 `-Filter 'finquant-backup-*.db'`（`:117` 末尾），**把有效备份挤出提示范围**。
4. **"同秒双启动"确实可达**：端口检查（`:22`）在**备份之前**，且首启还要过 venv/pip/Bun 若干步骤，两次快速触发都可能在端口被占用前走到 `:backup`。

## 理想行为
1. **两阶段落盘**：先写到 **`<dest>.partial`**；**完整性校验通过后**再 `Move-Item -Force` 改名为最终 `<dest>`。
2. **失败只清自己**：清理时**只回收 `<dest>.partial`**，**绝不触碰任何 `.db`**（无论它是谁的）。
3. **7 份计数只看有效备份**：`-Filter 'finquant-backup-*.db'` **天然不匹配 `.partial`**（**编排者已实测**：`Get-ChildItem -Filter 'finquant-backup-*.db'` 与 `-Include` 均不匹配 `....db.partial`）⇒ 残缺件不再挤占限额。
4. （可选，建议）若存在遗留 `*.db.partial`，给一行提示，让用户知道有残缺件可自行清理（回收站）——**不要自动删**（遵守"删除一律进回收站"且避免误删他人产物）。
5. **文件名格式与用户可见行为不变**：最终产物仍是 `finquant-backup-<yyyyMMdd-HHmmss>.db`（`QUICKSTART:169` 已把它写给用户）。

## 涉及模块
- `start.bat`（仅 `:backup` 段内的那一条 PowerShell 载荷与紧随的提示）

## 不能破坏
- **快照仍必须是 `sqlite3.Connection.backup()`** 并含 `PRAGMA integrity_check`（VS-9 的核心成果）——**不得退回只复制 `finquant.db`**。
- **失败不阻塞启动**：失败仍走 `:backup_failed`（提示 + `goto launch`），**不得改成硬失败**。
- 三条既有语义：`:114` 无库则 `goto launch`；`:115` 无 venv 则 `:backup_failed`；`:118` 非零则 `:backup_failed`。
- 最终文件名格式、7 份提示文案、`QUICKSTART` 的恢复指引。
- `start.bat` 保持 **CRLF**（`.gitattributes` 已锁 `*.bat eol=crlf`）与有效 UTF-8；不删文件（一律回收站）；不 commit。

## 验收标准（可判定）
1. **正常路径**：产出**最终 `.db`**（文件名格式同前）、**无 `.partial` 残留**、`PRAGMA integrity_check` 为 `ok`、PowerShell 退出 0。
2. **失败路径**：令源库损坏（或让校验失败）⇒ **非零退出**、**不留下最终 `.db`**、**自己的 `.partial` 被送回收站**。
3. **硬中断路径**：在"写完 `.partial`、尚未改名"时终止 ⇒ 残留为 **`*.db.partial`**，且它**不被 7 份计数匹配**（用夹具实测计数）。
4. **并发路径（本卡重点）**：**同一秒**启动两个备份（可将秒级命名对齐或用夹具模拟）⇒ ①双方都不会删掉对方的**有效 `.db`**；②最终目录里有效备份**至少一份且 `integrity_check = ok`**；③无进程因同名而报错崩溃。
5. **不误删**：失败进程清理后，另一个进程已写好的有效 `.db` **仍然存在且完整**（给出前后清单为证）。
6. 字节级：CRLF 完整（LF-only = 0）、严格 UTF-8、`git diff --check` 干净。

## 错误场景
- `.partial` 改名前**目标已存在**（同秒另一进程已完成）⇒ `-Force` 覆盖；两份内容同源同秒，覆盖无损失（如需更保守可先比对大小，但**不要**引入复杂逻辑）。
- 目录不可写 / 磁盘满 ⇒ 仍是"失败不阻塞启动"，且**不得留下半成品 `.db`**。
- 已存在同名遗留 `.partial`（上次中断所留）⇒ 本次写入应**覆盖它**（同一台机器上同秒同名的概率极低；覆盖是安全的，因为它是残缺件）。
- 源库存在但 PowerShell 无法读取 ⇒ 维持现状失败路径。

## 测试要求
bat 无自动化框架，沿用 VS-6/VS-8/VS-9/VS-14 的**夹具实测**手法：
- 把 `:backup` 段的 PowerShell 载荷**逐字抽出**成临时脚本，在 `$env:TEMP` 沙箱里用**合成库**（建库 → `journal_mode=WAL` → 插数据 → **保持连接不关闭**，使数据留在 `-wal`，参照 VS-9）跑：正常 / 校验失败 / 中断 / 并发的四类场景，给出**原始输出与目录清单**。
- 断言必须包含"**失败进程未删掉有效备份**"的正向证据（清理前后文件清单）。
- 临时文件放 `$env:TEMP`、用完**送回收站**；读 `start.bat` 必须显式指定 UTF-8（PS 5.1 默认 ANSI 会损坏中文）。
- 由独立 Evaluator 复核：①**是否退回了"只复制 .db"**（不得）②**失败是否只删自己的 `.partial`**（不得碰 `.db`）③**中断残件是否真被 7 份计数排除**④CRLF/UTF-8。
