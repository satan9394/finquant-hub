# 仓库健康修复记录 · 2026-10-10

由 satan9394 自有仓库健康体检产生，文件改动经 PR #1 合并：

- **供应链**：`.github/workflows/ci.yml` 的 11 处 `uses:` 钉到完整 commit SHA（actions/checkout@v6、actions/setup-python@v6、actions/setup-node@v7、pnpm/action-setup@v6、oven-sh/setup-bun@v2）。
- **依赖自动化**：新增 `.github/dependabot.yml`（pip `/backend`、npm `/frontend`、npm `/sites`、github-actions `/`）。
- **仓库设置**：启用 Dependabot 漏洞告警与自动安全修复；默认分支保护（禁强制推送、禁删除分支）。