# Bug Fix Workflow（Bug 修复流程）

## 规则

每个 bug fix **必须** 包含以下四步：

1. **修复 bug** — 最小正确修复
2. **添加回归测试** — 没有修复时测试应失败，有修复时应通过
3. **系统化防治** — 这类 bug 能否通过规则/约束/类型防止？如果能，落实它
4. **更新文档** — 如果涉及框架非直觉行为，记录到 CLAUDE.md

## 合规要求

Bug fix PR 描述中 **必须** 包含以下段落（缺一不可）：

- `## Root Cause` — 根因分析
- `## Regression Test` — 回归测试文件路径
- `## Systemic Prevention` — 系统化防治措施（或说明为什么不需要）

## 系统化防治示例

| 问题                                 | 防治手段                                                |
| ------------------------------------ | ------------------------------------------------------- |
| Express `send` 模块拒绝 dotfile 路径 | 文档记录 + 文件服务 round-trip 测试                     |
| `app.param()` 中间件                 | 结构性守卫，自动验证所有路由参数                        |
| Store 中数据源重复                   | 单一真相源规则（见 `store-actions.md`）                 |
| 组件闭包中的多步异步逻辑             | ESLint `no-restricted-imports`（见 `store-actions.md`） |
| Konva 事件冒泡到 DOM                 | CLAUDE.md 中记录框架特殊行为                            |
