# Native Monitor Target Contract

- 支持对象为 owner-scoped Thesis、Portfolio 和已保存 Strategy；Portfolio 必须明确选择属于该组合的 ticker。
- 草稿只校验对象、规则名称和用户明确选择的既有技术 signal type/direction，零写入。缺 `signal_type` 返回 UNKNOWN，不猜测阈值或方向。
- condition 的 source 为 `user_selection`，尚未运行行情扫描时 quality 为 UNKNOWN；fixture/schema 测试不是真实上游验证。
- 显式 confirm 后才复用既有 `alert_rules` 创建并启用规则，写入 target binding、SHA-256 confirmation key 与 confirmed_at；相同草稿重复确认返回既有规则。
- 本流程不新增调度器、不自动运行高成本研究、不发送外部通知；后续扫描仍遵守既有技术信号和通知边界。
