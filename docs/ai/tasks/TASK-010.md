# TASK-010: Chat 页面集成策略回测触发

## 目标
在 Chat 页面增加「策略对话 → 回测执行 → 结果展示」流程。

## 设计

### 前端
1. `/chat?prompt=回测 600519 ma_cross` URL 参数触发预填充
2. 消息输入区下方加「运行回测」按钮，读取当前消息内容作为策略描述
3. 回测结果以折叠面板展示在聊天流中：权益曲线（轻量图表）、核心指标（收益率/夏普/回撤）
4. 复用 `frontend/src/services/api.ts` 调用 `/api/backtest` endpoint

### 后端
无改动。已有 `/api/backtest` 端点支持 3 策略。

## 允许修改
- `frontend/src/pages/Chat.tsx`
- 可在 `frontend/src/components/` 下新增 BacktestResultCard.tsx

## 禁止修改
- 后端 `.py` 文件
- `docs/ai/` 下的文件
- `reference/` 目录

## 验收
```bash
cd frontend && bun run build
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
```

## 回滚
```bash
git checkout -- frontend/src/pages/Chat.tsx frontend/src/components/BacktestResultCard.tsx
```
