# Team-Tracker 全面移除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完全移除 team-tracker 功能——包括数据库表、REST API、Socket 事件、Store 状态、UI 面板、插件集成、工作流上下文、日志类型和所有相关测试。

**Architecture:** 自底向上删除——先去掉 UI 消费端和插件端，再删 store/socket 层，最后删 server routes + schema。每个 task 完成后运行 TypeScript 编译确认无断引用，最终跑全量测试。

**Tech Stack:** React, zustand, Socket.io, Express, better-sqlite3, Vitest

---

## File Map

### 删除的文件（整个删除）

- `src/team/TeamDashboard.tsx` — 团队面板容器组件
- `src/team/TeamMetricsTab.tsx` — 默认指标 UI 组件
- `plugins/daggerheart/ui/DHTeamPanel.tsx` — Daggerheart 专用团队面板
- `server/routes/trackers.ts` — CRUD REST 路由
- `public/locales/en/team.json` — 英文 i18n
- `public/locales/zh-CN/team.json` — 中文 i18n

### 修改的文件（删除 team-tracker 相关代码）

- `server/schema.ts` — 删除 `team_trackers` 表定义
- `server/index.ts` — 删除 `trackerRoutes` 注册
- `server/routes/bundle.ts` — 删除 `teamTrackers` 查询和响应字段
- `server/effectRegistry.ts` — 删除 `core:tracker-update` handler
- `src/shared/socketEvents.ts` — 删除 `tracker:created/updated/deleted` 事件
- `src/shared/storeTypes.ts` — 删除 `TeamTracker` interface
- `src/shared/bundleTypes.ts` — 删除 `teamTrackers` 字段
- `src/shared/logTypes.ts` — 删除 `core:tracker-update` 日志类型
- `src/stores/worldStore.ts` — 删除 `teamTrackers` 状态、socket 监听器、actions、snapshot sync
- `src/stores/uiStore.ts` — 删除 `teamPanelVisible` 和 `setTeamPanelVisible`
- `src/log/entityBindings.ts` — 删除 `TeamPanelBinding`、`TEAM_PANEL_POINT`、`getTeamPanel()`
- `src/rules/types.ts` — 删除 `TeamPanelProps` interface
- `src/rules/sdk.ts` — 删除 `TeamPanelBinding`、`TEAM_PANEL_POINT` 导出
- `src/workflow/types.ts` — 删除 `updateTeamTracker` 方法
- `src/workflow/context.ts` — 删除 `updateTeamTracker` 实现
- `src/debug/DebugLogPanel.tsx` — 删除 `core:tracker-update` 颜色映射
- `src/App.tsx` — 删除 `<TeamDashboard>` 渲染
- `plugins/daggerheart-core/index.ts` — 删除 `TEAM_PANEL_POINT` 注册和 `DHTeamPanel` 导入
- `plugins/daggerheart/i18n.ts` — 删除 `team.fear`/`team.hope` i18n key

### 修改的测试文件

- `server/__tests__/routes.test.ts` — 删除 tracker CRUD 测试
- `server/__tests__/bundle.test.ts` — 删除 `teamTrackers` 断言
- `server/__tests__/effectRegistry.test.ts` — 删除 `core:tracker-update` 测试
- `server/__tests__/scenarios/game-log.test.ts` — 删除 tracker effect 场景
- `src/stores/__tests__/worldStore.test.ts` — 删除 `teamTrackers` 相关测试和 fixture
- `src/log/__tests__/entityBindings.test.ts` — 删除 `TEAM_PANEL_POINT`/`getTeamPanel` 测试
- `src/workflow/engine.test.ts` — 删除 `updateTeamTracker` mock
- `src/workflow/context.test.ts` — 删除 `updateTeamTracker` 测试
- `src/workflow/__tests__/integration.test.ts` — 删除 `updateTeamTracker` 调用

---

### Task 1: 删除 UI 层（团队面板 + App 引用）

**Files:**

- Delete: `src/team/TeamDashboard.tsx`
- Delete: `src/team/TeamMetricsTab.tsx`
- Modify: `src/App.tsx` — 删除 `TeamDashboard` import 和 JSX
- Delete: `public/locales/en/team.json`
- Delete: `public/locales/zh-CN/team.json`

- [ ] **Step 1: 删除 team 目录**

```bash
rm src/team/TeamDashboard.tsx src/team/TeamMetricsTab.tsx
rmdir src/team
```

- [ ] **Step 2: 删除 i18n 文件**

```bash
rm public/locales/en/team.json public/locales/zh-CN/team.json
```

- [ ] **Step 3: 从 App.tsx 删除 TeamDashboard**

在 `src/App.tsx` 中：

- 删除 `import { TeamDashboard } from './team/TeamDashboard'`
- 删除 `<TeamDashboard roomId={roomId} isGM={isGM} />` JSX

- [ ] **Step 4: 从 uiStore 删除 teamPanelVisible**

在 `src/stores/uiStore.ts` 中：

- 删除 interface 中的 `teamPanelVisible: boolean`
- 删除 interface 中的 `setTeamPanelVisible: (visible: boolean) => void`
- 删除初始状态中的 `teamPanelVisible: false,`
- 删除 action 中的 `setTeamPanelVisible` 实现

- [ ] **Step 5: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: 会有其他 task 需要修的错误（store 引用等），但 team 目录相关的 import 错误应消失。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: remove TeamDashboard UI, team panel visibility, and i18n files"
```

---

### Task 2: 删除插件集成（Daggerheart 团队面板 + entity bindings）

**Files:**

- Delete: `plugins/daggerheart/ui/DHTeamPanel.tsx`
- Modify: `plugins/daggerheart-core/index.ts` — 删除 TEAM_PANEL_POINT 注册
- Modify: `plugins/daggerheart/i18n.ts` — 删除 team.fear/team.hope keys
- Modify: `src/log/entityBindings.ts` — 删除 TeamPanelBinding, TEAM_PANEL_POINT, getTeamPanel
- Modify: `src/rules/types.ts` — 删除 TeamPanelProps
- Modify: `src/rules/sdk.ts` — 删除 TeamPanelBinding, TEAM_PANEL_POINT 导出

- [ ] **Step 1: 删除 DHTeamPanel**

```bash
rm plugins/daggerheart/ui/DHTeamPanel.tsx
```

- [ ] **Step 2: 从 daggerheart-core/index.ts 删除注册**

删除以下内容：

- `import { DHTeamPanel } from '../daggerheart/ui/DHTeamPanel'` 导入
- `TEAM_PANEL_POINT` 从 `@myvtt/sdk` 的导入
- `sdk.ui.registerRenderer(TEAM_PANEL_POINT, { ruleSystemId: 'daggerheart', component: DHTeamPanel })` 注册调用

- [ ] **Step 3: 从 daggerheart/i18n.ts 删除 team keys**

在 en 和 zh-CN 两个翻译对象中删除：

- `'team.fear': 'Fear'` / `'team.fear': 'Fear'`
- `'team.hope': 'Hope'` / `'team.hope': 'Hope'`
- `// DHTeamPanel` 注释

- [ ] **Step 4: 从 entityBindings.ts 删除 TeamPanel 相关**

- 删除 `TeamPanelBinding` interface
- 删除 `TEAM_PANEL_POINT` 常量
- 删除 `getTeamPanel()` 函数

- [ ] **Step 5: 从 rules/types.ts 删除 TeamPanelProps**

- 删除 `import type { TeamTracker } from '../stores/worldStore'`（如果这是唯一 TeamTracker 引用）
- 删除 `TeamPanelProps` interface

- [ ] **Step 6: 从 rules/sdk.ts 删除导出**

- 删除 `TeamPanelBinding` 从 import 列表
- 删除 `TEAM_PANEL_POINT` 从 import 列表和 re-export

- [ ] **Step 7: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: PASS（无 TeamPanelBinding/TEAM_PANEL_POINT 引用残留）

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "refactor: remove TeamPanelBinding, DHTeamPanel, and plugin team panel registration"
```

---

### Task 3: 删除 Store 层（worldStore + shared types）

**Files:**

- Modify: `src/stores/worldStore.ts` — 删除 teamTrackers 状态、socket 监听器、actions、snapshot sync
- Modify: `src/shared/storeTypes.ts` — 删除 TeamTracker interface
- Modify: `src/shared/bundleTypes.ts` — 删除 teamTrackers 字段
- Modify: `src/shared/socketEvents.ts` — 删除 tracker 事件
- Modify: `src/shared/logTypes.ts` — 删除 core:tracker-update 类型
- Modify: `src/debug/DebugLogPanel.tsx` — 删除 tracker-update 颜色映射

- [ ] **Step 1: 从 worldStore.ts 删除 teamTrackers**

删除以下内容：

- 状态字段：`teamTrackers: TeamTracker[]`
- 初始状态：`teamTrackers: [],`（两处：初始值和 disconnect 重置）
- Bundle 加载：`teamTrackers: bundle.teamTrackers,`
- Socket 监听器：`socket.on('tracker:created', ...)`, `socket.on('tracker:updated', ...)`, `socket.on('tracker:deleted', ...)`
- Snapshot sync：`if (isLogType(entry, 'core:tracker-update') && entry.payload.snapshot) { ... }`
- Actions：`addTeamTracker`, `updateTeamTracker`, `deleteTeamTracker`
- `TeamTracker` 的 import（如果来自 storeTypes）

- [ ] **Step 2: 从 storeTypes.ts 删除 TeamTracker interface**

```typescript
// 删除整个 interface
export interface TeamTracker {
  id: string
  label: string
  current: number
  max: number
  color: string
  sortOrder: number
}
```

- [ ] **Step 3: 从 bundleTypes.ts 删除 teamTrackers 字段**

```typescript
// 删除
teamTrackers: TeamTracker[]
```

以及 `TeamTracker` 的 import（如果有）。

- [ ] **Step 4: 从 socketEvents.ts 删除 tracker 事件**

```typescript
// 删除
'tracker:created': (tracker: TeamTracker) => void
'tracker:updated': (tracker: TeamTracker) => void
'tracker:deleted': (data: { id: string }) => void
```

- [ ] **Step 5: 从 logTypes.ts 删除 core:tracker-update**

```typescript
// 删除
'core:tracker-update': {
  label: string
  current?: number
  snapshot?: import('./storeTypes').TeamTracker
}
```

- [ ] **Step 6: 从 DebugLogPanel.tsx 删除颜色映射**

```typescript
// 删除这一行
'core:tracker-update': '#34d399',
```

- [ ] **Step 7: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: 可能有 workflow 引用 `updateTeamTracker` 的报错（Task 4 修）

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "refactor: remove teamTrackers from worldStore, shared types, socket events, and log types"
```

---

### Task 4: 删除 Workflow 层（updateTeamTracker）

**Files:**

- Modify: `src/workflow/types.ts` — 删除 updateTeamTracker 方法
- Modify: `src/workflow/context.ts` — 删除 updateTeamTracker 实现

- [ ] **Step 1: 从 workflow/types.ts 删除 updateTeamTracker**

```typescript
// 删除这两行
/** @deprecated — will be removed when teamTracker is redesigned */
updateTeamTracker(label: string, patch: { current?: number }): void
```

- [ ] **Step 2: 从 workflow/context.ts 删除 updateTeamTracker 实现**

删除 `updateTeamTracker: (label: string, patch: { current?: number }) => { ... }` 整个函数实现。

- [ ] **Step 3: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: remove updateTeamTracker from workflow context and types"
```

---

### Task 5: 删除 Server 层（routes, schema, effectRegistry, bundle）

**Files:**

- Delete: `server/routes/trackers.ts`
- Modify: `server/index.ts` — 删除 trackerRoutes 导入和挂载
- Modify: `server/routes/bundle.ts` — 删除 teamTrackers 查询和响应字段
- Modify: `server/schema.ts` — 删除 team_trackers 表
- Modify: `server/effectRegistry.ts` — 删除 core:tracker-update handler

- [ ] **Step 1: 删除 trackers.ts 路由文件**

```bash
rm server/routes/trackers.ts
```

- [ ] **Step 2: 从 server/index.ts 删除路由注册**

- 删除 `import { trackerRoutes } from './routes/trackers'`
- 删除 `app.use(trackerRoutes(DATA_DIR, io))`

- [ ] **Step 3: 从 bundle.ts 删除 teamTrackers**

删除：

- `const teamTrackers = toCamelAll(...)` 查询
- 响应对象中的 `teamTrackers,` 字段（两处：初始构建和返回）

- [ ] **Step 4: 从 schema.ts 删除 team_trackers 表定义**

```sql
-- 删除整个 CREATE TABLE
CREATE TABLE IF NOT EXISTS team_trackers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  current INTEGER DEFAULT 0,
  max INTEGER DEFAULT 0,
  color TEXT DEFAULT '#3b82f6',
  sort_order INTEGER DEFAULT 0
);
```

- [ ] **Step 5: 从 effectRegistry.ts 删除 handler**

删除 `handlers.set('core:tracker-update', ...)` 整个注册块。

- [ ] **Step 6: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: remove team_trackers table, REST routes, bundle query, and effect handler"
```

---

### Task 6: 修复所有测试

**Files:**

- Modify: `server/__tests__/routes.test.ts` — 删除 tracker CRUD 测试
- Modify: `server/__tests__/bundle.test.ts` — 删除 teamTrackers 断言
- Modify: `server/__tests__/effectRegistry.test.ts` — 删除 core:tracker-update 测试
- Modify: `server/__tests__/scenarios/game-log.test.ts` — 删除 tracker effect 场景
- Modify: `src/stores/__tests__/worldStore.test.ts` — 删除 teamTrackers fixture 和测试
- Modify: `src/log/__tests__/entityBindings.test.ts` — 删除 TEAM_PANEL_POINT 测试
- Modify: `src/workflow/engine.test.ts` — 删除 updateTeamTracker mock
- Modify: `src/workflow/context.test.ts` — 删除 updateTeamTracker 测试
- Modify: `src/workflow/__tests__/integration.test.ts` — 删除 updateTeamTracker 调用

- [ ] **Step 1: 修复 server/**tests**/routes.test.ts**

删除 tracker CRUD 相关的 `describe` 块和 `trackerId` 变量。

- [ ] **Step 2: 修复 server/**tests**/bundle.test.ts**

删除 `expect(body).toHaveProperty('teamTrackers')` 断言。

- [ ] **Step 3: 修复 server/**tests**/effectRegistry.test.ts**

删除两个 `core:tracker-update` 测试（`applies delta and writes snapshot` 和 `supports label-based format`）。

- [ ] **Step 4: 修复 server/**tests**/scenarios/game-log.test.ts**

删除 tracker-update 场景测试。

- [ ] **Step 5: 修复 src/stores/**tests**/worldStore.test.ts**

- 删除 `makeTracker` fixture 的使用
- 删除 `teamTrackers` 初始状态中的引用
- 删除 `tracker:created adds to teamTrackers` 测试
- 删除 `tracker:deleted removes from teamTrackers` 测试
- 删除 bundle 测试中的 `teamTrackers` 断言
- 保留 `makeTracker` 如果有其他引用，否则也删除

- [ ] **Step 6: 修复 src/log/**tests**/entityBindings.test.ts**

- 删除 `TEAM_PANEL_POINT` import
- 删除 `describe('getTeamPanel')` 测试块

- [ ] **Step 7: 修复 workflow 测试**

`src/workflow/engine.test.ts`:

- 删除 mock 中的 `updateTeamTracker: vi.fn(),`

`src/workflow/context.test.ts`:

- 删除 `updateTeamTracker emits core:tracker-update log entry` 测试
- 删除 `updateTeamTracker auto-injects groupId from context options` 测试
- 删除 `expect(typeof ctx.updateTeamTracker).toBe('function')` 断言

`src/workflow/__tests__/integration.test.ts`:

- 删除 `ctx.updateTeamTracker('Fear', { current: 1 })` 调用（替换为空操作或删除整个 if 分支）

- [ ] **Step 8: 运行全量测试**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "test: remove all team-tracker related tests and fixtures"
```

---

### Task 7: 更新文档

**Files:**

- Modify: `docs/architecture/state-management.md` — 删除 teamTrackers 和 teamPanelVisible 引用
- Modify: `docs/architecture/rule-plugin-system.md` — 删除 TEAM_PANEL_POINT 行

- [ ] **Step 1: 更新 state-management.md**

- 删除 `teamTrackers: TeamTracker[]` 状态描述
- 删除 `tracker:created/updated/deleted` 事件行
- 从 uiStore 状态列表中删除 `teamPanelVisible`

- [ ] **Step 2: 更新 rule-plugin-system.md**

- 删除 `| TEAM_PANEL_POINT | TeamPanelBinding | Rule-specific team dashboard component |` 行

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: remove team-tracker references from architecture docs"
```

---

### Task 8: 最终验证

- [ ] **Step 1: TypeScript 全量编译**

```bash
npx tsc --noEmit
```

Expected: PASS — 无 TeamTracker 相关错误

- [ ] **Step 2: 全量测试**

```bash
npx vitest run
```

Expected: ALL PASS

- [ ] **Step 3: 全局搜索残留引用**

```bash
rg -l "TeamTracker|teamTracker|team_tracker|TEAM_PANEL_POINT|TeamPanelBinding|TeamPanelProps|DHTeamPanel|teamPanelVisible" --type ts --type tsx
```

Expected: 仅 `docs/archive/` 和 `docs/design/` 下的历史文档命中（可忽略）

- [ ] **Step 4: 确认 src/ 和 server/ 和 plugins/ 无残留**

```bash
rg "TeamTracker|teamTracker|team_tracker|TEAM_PANEL_POINT|DHTeamPanel|teamPanelVisible" src/ server/ plugins/
```

Expected: 0 matches
