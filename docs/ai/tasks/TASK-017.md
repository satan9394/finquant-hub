# TASK-017: 智能导入自选股

## 目标
支持从 CSV / Excel / 剪贴板 / 图片批量导入自选股，自动识别股票代码/名称（含拼音补全）。

## 允许修改
- `backend/app/routers/dashboard.py` 或新建 `backend/app/routers/import.py`
- `backend/app/services/import_service.py`（新建）
- `backend/app/agent/tools_definitions.py`（若需新增工具）
- `frontend/src/pages/Dashboard.tsx`（自选股区域加导入按钮）
- 对应测试

## 实现思路
1. 后端 `POST /api/import/watchlist` 接受：
   - CSV/Excel 文件（multipart upload）
   - 纯文本剪贴板内容（逗号/换行分隔的代码或名称）
   - 图片（可选，P3：OCR 识别，若无法稳定实现则先支持文本 + 文件）
2. 识别逻辑：
   - 已存在的代码（6位A股/4-5位港股/AAPL式美股）→ 直接入库
   - 中文名称 → 走东方财富搜索 → 解析为代码
   - 拼音（maotai → 600519）→ 拼音首字母/全拼搜索
3. 批量去重：已有自选不重复添加；返回导入统计（成功/失败/重复）
4. 前端 Dashboard 自选股区加「导入」按钮 + 结果反馈

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
cd frontend && bun run build
```

## 回滚
```bash
git checkout -- backend/app/routers/dashboard.py frontend/src/pages/Dashboard.tsx
```

## 关键判断
- OCR 图片识别若实现不稳，先做文本/文件导入，图片标 P3
- 拼音库可用轻量方案（如 pypinyin 若已装，否则用简化的拼音首字母表）
