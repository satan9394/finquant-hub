# TASK-012: 主题一键切换图标

## 目标
在页面右上角（当前模型选择器右侧）加一个 Sun/Moon 图标按钮，点击直接切换白天/黑夜模式。

## 允许修改
- `frontend/src/App.tsx` — 仅添加图标按钮和切换逻辑

## 设计
1. 读取 `localStorage.getItem('finquant_theme')`，当前 `isDark` 用 `useState` 管理（而非普通变量）
2. 在 header 最右侧加一个 `Button type="text"`，暗色时显示 `SunOutlined` 图标，亮色时显示 `MoonOutlined` 图标
3. 点击切换：`setIsDark(!isDark)` + `localStorage.setItem('finquant_theme', ...)` + 刷新页面（或通过 ConfigProvider 动态切换）
4. `@ant-design/icons` 已安装，可直接用 `SunOutlined` 和 `MoonOutlined`

## 验收
```bash
cd frontend && bun run build
```
零错误。点图标切换主题。

## 回滚
```bash
git checkout -- frontend/src/App.tsx
```
