# AIOS-081 - 跨平台本地启动器与 doctor

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

从 GitHub 获取代码的用户可在 Windows PowerShell 或 POSIX shell 中使用一致的本地命令；在构建前先运行 doctor，得到 Docker/Compose、配置、端口和 Compose 解析的明确 PASS/FAIL 与修复提示，不需要猜测环境问题。

## 允许修改

- `scripts/local.ps1`
- `scripts/local.sh`（新建）
- `scripts/tests/local_scripts_contract.ps1`（新建）
- `README.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/tasks/AIOS-081.md`
- `docs/ai/tasks/AIOS-082.md`（仅在完成后创建）

## 禁止修改

- backend/frontend 业务代码、数据库、Compose/Dockerfile、依赖、CI、生产部署、`reference/`
- 删除 volume/data、自动执行 `down -v`、占用端口时杀进程、输出 MASTER_KEY 或其他 secret
- commit、push、release、部署或外部写操作

## 完成标准

- PowerShell 与 POSIX 均支持 `up/down/logs/status/doctor`，复用同一 `docker-compose.local.yml` 和 `.env.local`。
- 首次 `up` 使用密码学安全随机值创建 Git 忽略的 `.env.local`；已有文件绝不覆盖；doctor 不创建或修改配置。
- doctor 检查项目关键文件、Docker CLI、daemon、Compose v2、`.env.local`/MASTER_KEY 格式、LOCAL_PORT、端口占用和 `docker compose config --quiet`，每项输出明确 PASS/FAIL/WARN；不回显 secret。
- `up` 在预检失败时不启动；`down` 不删除 volume；所有动作传播 Compose 退出码。
- README 只描述当前受支持的本地 Docker 路径，Windows/POSIX 命令一致，并明确无 key 可启动但 AI 能力需要配置。
- 脚本合同测试、PowerShell parser、`bash -n`、doctor 正常/缺配置/无效端口 fixture、Compose config 与 diff check 通过；不把这些描述成 image build 或真实服务启动。

## 回退

恢复原 `local.ps1`、删除 `local.sh`/合同测试并撤销 README 与计划状态即可；不涉及业务数据或 schema。

## 验证声明

doctor 只验证本机前置条件和配置合同；AIOS-083 才执行隔离 clean-clone build/start/persistence/upgrade 演练。

## 完成证据

- Windows PowerShell 5 与 Git Bash 在当前本机分别执行 `doctor`，Docker CLI、Compose v2、daemon、`.env.local`、MASTER_KEY 格式与 Compose 解析均通过；当前 5173 由本项目 frontend 使用、模型 key 未配置，均按 WARN 呈现，退出码为 0。
- `scripts/tests/local_scripts_contract.ps1` 使用隔离 fixture 验证缺配置、无效端口、doctor 不修改 env、首次 up 安全生成 key、再次 up 不覆盖、密钥不出现在输出以及预检失败不启动，结果 `LOCAL_SCRIPTS_CONTRACT_PASS`。
- PowerShell parser、`bash -n scripts/local.sh`、`docker compose ... config --quiet`、`.env.local` ignore 检查与 scoped `git diff --check` 均通过。
- 未运行 image build、服务重启或真实上游请求；这些检查不构成 clean-clone 安装证据。
