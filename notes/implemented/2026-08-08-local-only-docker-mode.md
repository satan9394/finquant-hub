# Agent Note: 显式本地单用户 Docker 模式

Status: implemented

## Problem

项目最初设计为公网多用户部署（邮箱认证 + 用户隔离），但当前 MVP 只需在个人电脑运行并发布源码到 GitHub。直接删除认证会破坏已有数据和回归面。

## Decision

保留生产邮箱认证与全表 `user_id` 约束；新增仅限 development 的 `LOCAL_ONLY_MODE`：
- 自动使用一个内部本地所有者，不提供验证码、session 或登录/退出 UI
- 前后端由独立本地 Compose 启动，唯一宿主入口绑定 `127.0.0.1`
- SQLite 使用专用 Docker Volume
- production 模式下 `LOCAL_ONLY_MODE=true` 必须拒绝启动

## Alternatives considered

1. **直接删除认证和 user_id 列**：扩大回归面，破坏已有数据，不利于未来恢复公网能力。放弃。
2. **使用环境变量切换认证/无认证**：容易误入公网生产，安全边界模糊。放弃。
3. **保留认证但跳过登录页**：仍需维护 session 逻辑，增加不必要的复杂度。放弃。

## Consequences

- 零登录体验，个人用户开箱即用
- 代码中保留完整的认证路径，未来恢复公网只需关闭 `LOCAL_ONLY_MODE`
- `LOCAL_ONLY_MODE=true` 在 production 必须拒绝启动，防止旁路误入公网
- 所有用户数据表仍强制 `user_id` 归属，架构不变量未被削弱
