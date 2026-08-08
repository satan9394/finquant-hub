# TASK-026: 全系统真实用户级 E2E 验证

## 背景
认证系统（TASK-021~025）刚完成，26 张业务表迁移了 user_id，所有读写 SQL 加了归属过滤。这是全项目回归风险最高的改动。部署前必须证明：真实用户能走通全部主要流程，且用户间数据完全隔离。

## 目标
以真实用户视角，用浏览器/HTTP 端到端跑通全部核心功能，找出认证迁移引入的回归并修复。

## 方式
启动后端 + 前端，注册两个测试用户（userA@test.local, userB@test.local），按以下清单逐项验证：

### 1. 认证流程
- [ ] 未登录访问 `/` → 重定向登录页
- [ ] userA 请求验证码 → 收码 → 登录成功（本地无 SMTP 时验证码在日志）
- [ ] 刷新保持会话；登出后再访问 → 回登录页
- [ ] 错误验证码 → 拒绝；连续错误 5 次 → 锁定

### 2. 核心功能（userA 视角，全部走通）
- [ ] Dashboard：统计卡片、大屏概览、自选股加载
- [ ] 行情：搜索 600519 → 实时报价 / K线 / 指标
- [ ] 组合：创建组合 → 加持仓（600519）→ 实时盈亏
- [ ] 投研：四大师团队跑 600519 → 13 章报告生成 → 报告可查看/导出
- [ ] 论文：从报告一键转论文 → 论文列表可见 → claims 状态
- [ ] 回测：Chat 里「运行回测」→ 权益曲线展示；StrategyLab 页面回测
- [ ] 选股：Screening 页面两阶段筛选
- [ ] 预警：创建一条预警规则 → 列表可见 → 启停
- [ ] Alpha：AlphaResearch 字段搜索
- [ ] 讨论：创建讨论房间 → 多 Agent 轮序
- [ ] 智能导入：CSV/剪贴板导入自选股
- [ ] 设置：角色管理、模型管理、**API 密钥管理**（存 Tushare/新闻密钥，验证明文不回传）

### 3. 数据隔离（关键）
- [ ] userA 创建的组合/报告/论文/预警，**userB 登录后完全看不到**
- [ ] userB 的数据 userA 也看不到（双向）
- [ ] 直接 HTTP 请求越权访问（如带 userA 的 id 查 userB 资源）→ 404 或 403，不泄露

### 4. 发现的任何回归 → 修复 + 补测试

## 允许修改
- 后端任何文件（修回归）
- 前端任何文件（修回归）
- 测试文件

## 禁止修改
- `docs/ai/ARCHITECTURE.md` 不变量
- `reference/` 目录

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
cd backend && .venv\Scripts\python.exe -m mypy app
cd frontend && bun run build
```

## 回滚
逐文件 `git checkout -- <file>`；若大规模改动先备份。

## 关键判断
- **隔离是重中之重**：任何一处漏 user_id 过滤 = 跨用户数据泄露（公网灾难）。逐个 router 核验
- 测试数据库用临时文件，不动现有 finquant.db（或复制一份）
- 全流程走完后，把结果写入 `docs/ai/E2E_VALIDATION.md`（清单逐项勾选 + 发现的问题 + 修复记录）
