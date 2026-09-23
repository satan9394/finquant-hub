# TASK-001: 前端路由懒加载拆包

## 目标
减少首屏 JS 体积，把 1.6MB 单文件拆成多块。

## 非目标
不改后端、不改功能逻辑、不引入新依赖。

## 允许修改
- `frontend/src/router.tsx` — 路由改为 `React.lazy(() => import(...))`，包 `<Suspense>`
- `frontend/vite.config.ts` — 加 `build.rollupOptions.output.manualChunks` 拆 antd 到 vendor

## 禁止修改
- 任何 `.py` 文件
- `docs/ai/` 下的文件

## 验收
```bash
cd frontend && bun run build
```
产出至少 3 个 JS 文件。

## 回滚
`git checkout -- frontend/src/router.tsx frontend/vite.config.ts`
