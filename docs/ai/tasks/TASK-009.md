# TASK-009: report_audit 单元测试

## 目标
为新建的 `backend/app/tools/report_audit.py` 添加单元测试。

## 非目标
不改 `report_audit.py`、不改 `financial_rigor.py`、不改任何已有测试。

## 允许修改
- `backend/tests/test_report_audit.py`（新建）

## 测试内容
1. `extract_data_points()` 从简单 Markdown 表格中提取数据点
2. `extract_data_points()` 提取百分比值
3. `extract_data_points()` 提取亿元值
4. `render_verdict()` 全部通过 → 返回`"pass"`
5. `render_verdict()` 部分失败 → 返回包含失败项
6. 空输入 → 不抛异常

## 验收
```bash
cd backend && .venv\Scripts\python.exe -m pytest tests/test_report_audit.py -v
cd backend && .venv\Scripts\python.exe -m ruff check .
```

## 回滚
```bash
git checkout -- backend/tests/test_report_audit.py
```
