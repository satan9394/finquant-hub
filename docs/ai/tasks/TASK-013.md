# TASK-013: 移除设置页外观模块

## 目标
移除 Settings.tsx 中的「外观」选项卡，因为 header 右上角已有主题切换按钮。

## 允许修改
- `frontend/src/pages/Settings.tsx`

## 具体操作
1. 删除第 123-134 行的外观 tabs 项（`key: 'appearance'` 的整个对象）
2. 删除 `themeDark` state（第 23-25 行）和 `handleThemeChange` 函数（第 42-46 行）
3. 删除不再使用的 import：`Switch`、`BulbOutlined`
4. 如果 `Switch` 和 `BulbOutlined` 在其他地方仍在使用，保留 import

## 验收
```bash
cd frontend && bun run build
```
零错误。

## 回滚
```bash
git checkout -- frontend/src/pages/Settings.tsx
```
