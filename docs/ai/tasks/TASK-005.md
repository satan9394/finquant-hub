# TASK-005: ticker 解析器合并收尾

## 目标
确认 `resolve_ticker()` 已完全委托 `normalize_code()` 且无残留独立解析逻辑。

## 非目标
不改 ticker 解析行为、不改 normalize_code()。

## 允许修改
- `backend/app/services/analysis/ticker.py`（仅删重复分支）

## 禁止修改
- 前端文件
- `docs/ai/` 下的文件

## 验收
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
```
不降级。

## 回滚
```bash
git checkout -- backend/app/services/analysis/ticker.py
```
