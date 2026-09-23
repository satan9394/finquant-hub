# TASK-004: Alpha 搜索缺省值

## 目标
`search_alpha("")` 或 `search_alpha(None)` 不抛异常，返回全部字段列表。

## 非目标
不改搜索算法、不改性能特征。

## 允许修改
- `backend/app/services/alpha_service.py`（仅加空查询保护）

## 禁止修改
- 前端文件
- `docs/ai/` 下的文件

## 验收
```bash
cd backend && .venv\Scripts\python.exe -m pytest tests/test_alpha_search.py -v
```
全部通过。

## 回滚
```bash
git checkout -- backend/app/services/alpha_service.py
```
