# 插件系统迁移总计划

## 概述

将 POC 验证的插件系统架构迁移到生产代码。6 个 Phase，解决 DEVIATIONS.md #1-#6 所有偏差。

## 进度

| Phase   | 状态        | 描述                                                                  |
| ------- | ----------- | --------------------------------------------------------------------- |
| Phase 1 | ✅ 完成     | EventBus — 解耦系统事件                                               |
| Phase 2 | ✅ 完成     | WorkflowContext 重写 — ctx.state/read/updateComponent                 |
| Phase 3 | ✅ 完成     | IDataReader + 响应式 Hooks                                            |
| Phase 4 | 📋 计划已写 | Entity.components 全量迁移（[详细计划](phase4-entity-components.md)） |
| Phase 5 | ⏳ 待执行   | Session State                                                         |
| Phase 6 | ⏳ 待执行   | requestInput + 异步步骤                                               |

## 审查发现

### 1. Phase 1-3 并非真正可并行（文件冲突）

Phase 1 和 Phase 2 修改同一批文件（`workflow/types.ts`、`context.ts`、`pluginSDK.ts`），Phase 2 和 Phase 3 共享 `ui-system/types.ts`。

**决策**：Phase 1-3 在同一分支按顺序执行，每个 Phase 完成后提交。

### 2. `ctx.const` 条件类型

保持计划方案（`TConst extends undefined ? never : Readonly<TConst>`），Phase 2 实现时如果体验不好再调整。

### 3. `updateTeamTracker` 过渡期处理

在新 `WorkflowContext` 中保留 `updateTeamTracker` 方法签名，标记 `@deprecated`。未来 teamTracker 重设计时统一移除。

### 4. Component Registry API 归属

Phase 4 实现时在 `IPluginSDK` 添加 `entity: IEntityRegistrationSDK`（`registerComponent()`）。

### 5. `IDataSDK.entities()` → `query({})` 迁移

所有 `sdk.data.entities()` 调用改为 `sdk.read.query({})`。

---

## Phase 1: EventBus（✅ 完成）

**目标**：将 toast/announce/sound/animation 等副作用从 WorkflowContext 解耦到类型安全的事件总线。

**新建文件：**

- `src/events/eventBus.ts` — EventBus 类 + defineEvent + useEvent hook
- `src/events/systemEvents.ts` — toastEvent / announceEvent / soundEvent / animationEvent
- `src/events/index.ts` — 导出 singleton + createEventBus

**修改文件：**

- `src/workflow/types.ts` — WorkflowContext 删除 showToast/announce/playSound/playAnimation，添加 `events: { emit }`
- `src/workflow/context.ts` — ContextDeps 添加 eventBus
- `src/workflow/pluginSDK.ts` — PluginSDKDeps 同步更新
- `src/workflow/useWorkflowSDK.ts` — deps 注入改为 eventBus
- `plugins/daggerheart-core/rollSteps.ts` — ctx.showToast → ctx.events.emit(toastEvent, ...)

---

## Phase 2: WorkflowContext 重写（✅ 完成）

**目标**：`ctx.data` → `ctx.state`，添加 `ctx.read: IDataReader`、`ctx.updateComponent()`。

**修改文件：**

- `src/workflow/types.ts` — WorkflowContext<TState>，添加 read/updateComponent，保留 updateTeamTracker（@deprecated）
- `src/workflow/context.ts` — createWorkflowContext 实现 state/read/updateComponent（Phase 4 前用 ruleData 临时实现）
- `src/workflow/engine.ts` — ctx.data → ctx.state
- `src/workflow/baseWorkflows.ts` — 全部迁移到新接口
- `plugins/daggerheart-core/rollSteps.ts` — ctx.data → ctx.state
- `plugins/daggerheart-cosmetic/diceAnimation.ts` — 同上

---

## Phase 3: IDataReader + 响应式 Hooks（✅ 完成）

**目标**：两层读取 API — Hook 层（React render）+ 命令式层（workflow/event callback）。

**新建文件：**

- `src/data/dataReader.ts` — IDataReader 接口 + createDataReader（从 worldStore 读取）
- `src/data/hooks.ts` — useEntity、useComponent（zustand selector hooks）
- `src/data/index.ts` — 导出

**修改文件：**

- `src/ui-system/types.ts` — IComponentSDK：`data: IDataSDK` → `read: IDataReader`
- `src/rules/sdk.ts` — 导出 useEntity、useComponent、createDataReader

---

## Phase 4: Entity.components 全量迁移（📋 计划已写）

**目标**：`Entity.ruleData + 预定义字段` → `Entity.components: Record<string, unknown>`

详见 [phase4-entity-components.md](phase4-entity-components.md)

子阶段：4a(类型) → 4h(data layer) → 4f(插件) → 4g(UI) → 4b(DB) → 4c+4e(服务端) → 4d(store)

---

## Phase 5: Session State（⏳ 待执行）

**目标**：UI 选中态、交互状态管理。

**新建文件：**

- `src/stores/sessionStore.ts` — selection + pendingInteractions

**修改文件：**

- `src/workflow/baseWorkflows.ts` — 注册 core:set-selection、core:open-card
- `src/ui-system/PanelRenderer.tsx` — instanceProps factory 支持
- `src/ui-system/types.ts` — instanceProps 类型

---

## Phase 6: requestInput + 异步步骤（⏳ 待执行）

**目标**：Workflow 步骤支持异步（`Promise<void>`），添加 `ctx.requestInput()` 交互模型。

**修改文件：**

- `src/workflow/types.ts` — StepFn 返回 `void | Promise<void>`，ctx 添加 requestInput；InputRequestHandle 增加 accepts
- `src/workflow/engine.ts` — 步骤执行 await
- `src/workflow/context.ts` — 实现 requestInput
- `src/stores/sessionStore.ts` — requestInput/resolveInput/cancelInput + usePendingByAccepts

---

## 执行策略

| 项        | 策略                                                               |
| --------- | ------------------------------------------------------------------ |
| 分支      | `feat/plugin-system-migration`（从 `feat/poc-plugin-verify` 创建） |
| Phase 1-3 | 同分支顺序执行，每 Phase 一个 commit                               |
| Phase 4   | 子阶段各自 commit                                                  |
| Phase 5-6 | 顺序执行                                                           |
| 验证      | 每步完成后 `pnpm check && pnpm test`                               |
| POC 代码  | 迁移完成后删除 `poc/` 目录                                         |
