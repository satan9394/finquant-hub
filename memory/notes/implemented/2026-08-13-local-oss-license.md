# Agent Note: Local OSS 源码许可证与公开导出边界

Status: implemented

## Problem

Local OSS v1 准备审计确认根目录没有 LICENSE；`reference/` 有 5,329 个 tracked entries 和六个嵌套 Git 仓库；`wq_fields.json` 的 WorldQuant 来源尚无再分发许可证据。

## Decision

1. **许可证**：Apache-2.0，版权声明 `Copyright 2026 Satanchen`（@Satanchen 2026-08-13 授权）
2. **公开导出**：allowlisted exporter 生成独立公开源码树，排除 `reference/`、WQ JSON/summary、用户 env/DB、依赖和构建证据
3. **Alpha 降级**：缺少扩展目录时使用项目自编 8 个通用字段合同，coverage 为 null，报告 `FINQUANT_STARTER/PARTIAL/PROJECT_AUTHORED`

## Alternatives considered

1. **MIT 许可证**：更短更宽松，但无明确专利授权条款。Apache-2.0 对投研系统更安全。
2. **暂不授权再分发**：不属于开源发布，与 GitHub 开源目标矛盾。放弃。
3. **直接复制 reference/ 到公开树**：再分发许可未知，法律风险不可控。放弃。

## Consequences

- 发布物不需要携带许可未知内容即可工作
- 私有开发树不受影响，reference/ 继续用于本地研究
- 显式降级状态比补造 coverage 更可审计
- 根目录 LICENSE 文件仍需创建（RELEASE BLOCKED）
