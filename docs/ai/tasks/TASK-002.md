# TASK-002: SSE 四个端点加 try/finally 错误守卫

## 目标
所有 SSE 流函数在异常时发送错误事件并正确清理，不挂起连接。

## 非目标
不改功能逻辑、不改事件协议格式。

## 允许修改
- `backend/app/routers/chat.py`
- `backend/app/routers/discussion.py`
- `backend/app/routers/analysis.py`
- `backend/app/routers/research.py`

## 禁止修改
- 前端文件
- `docs/ai/` 下的文件

## 验收
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
```
不降级即可。

## 回滚
```bash
git checkout -- backend/app/routers/chat.py backend/app/routers/discussion.py backend/app/routers/analysis.py backend/app/routers/research.py
```
