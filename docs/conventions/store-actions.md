# Store Action Convention（Store 操作规范）

## 规则

所有涉及 API 调用的用户操作 **必须** 是 Store 方法（`src/stores/*.ts`）。
组件的 onClick handler **必须** 是单行调用。

```
✅ <button onClick={() => worldStore.spawnFromBlueprint(bp, sceneId)} />
❌ <button onClick={() => { addEntity(); addToScene(); addToken(); }} />
```

## 为什么

Store 方法可以在 Node.js 集成测试中直接调用，验证完整链路（Store → HTTP → SQLite → Socket → Store）。
组件闭包中的多步异步逻辑无法在没有浏览器的情况下测试。

## 合规要求

1. **组件文件不可 import `api` 模块** — ESLint `no-restricted-imports` 自动拦截（见 `eslint.config.js`）
2. **每个新增的用户可见流程** 必须有对应的集成测试（`server/__tests__/scenarios/*.test.ts`）

## 验证方式

- **代码级**: ESLint `no-restricted-imports` 在 commit 时自动拦截
- **测试级**: PR review 检查是否有对应的集成测试

## 单一真相源规则

每类业务数据 **必须** 有且仅有一个 Store 作为真相源。如果新 Store 覆盖了旧 Store 的字段，旧字段必须在同一个 PR 内删除。

违反症状：数据存在但刷新后消失、数据出现在错误的 UI 标签页、Store 之间状态不一致。

## 集成测试规范

- 测试文件：`server/__tests__/scenarios/*.test.ts`（Node 环境，真实服务器）
- 入口是 **Store 方法** 或 **原始 HTTP 调用**（模拟按钮点击）
- 使用 `setupTestRoom()` 创建临时房间 + 测试服务器；调用 `cleanup()` 拆除
- **双重验证**：每次操作后，同时断言 Store 状态（`getState()`）和服务器状态（`GET` 请求）
- 纯 Node.js 运行（无浏览器、无 mock）— 使用 `// @vitest-environment node` pragma
