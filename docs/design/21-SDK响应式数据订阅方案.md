# 21 — SDK 响应式数据订阅方案

> **状态**：✅ 活跃参考 | 2026-03-31
> 前置文档：[20-UI 注册系统扩展方案](20-UI注册系统扩展方案.md)

---

## 背景

### 组件的三种数据变化模式

UI 组件需要对三种数据变化做出响应：

| 变化模式 | 语义 | 当前 SDK 接口 | 响应式？ |
|---------|------|-------------|---------|
| 日志到达 | 事件流（不断追加） | `sdk.log.subscribe(pattern, handler)` | ✅ 回调式 |
| Awareness 变化 | 状态型（各 peer 的瞬态值） | `sdk.awareness.subscribe(channel, handler)` | ✅ 回调式 |
| 数据变化 | 状态型（entity/component 的持久值） | `sdk.read.entity(id)` 等 | ❌ 仅命令式拉取 |

三种模式中，**数据变化缺少响应式接口**。组件无法通过 SDK 订阅 entity 或 component 的变更。

### 问题

`sdk.read`（`IDataReader`）只提供命令式快照读取。React 组件需要在数据变化时重渲染，但 SDK 没有提供这种能力。

当前组件如果需要响应式数据，只能：
- 在 `useEffect` 中轮询 `sdk.read`（错误模式，无法感知变化时机）
- 绕过 SDK 直接 `import { useWorldStore }`（破坏 SDK 作为唯一交互点的架构约束）

### 核心原则

1. **插件只通过 SDK 交互** — SDK 是插件与基座的唯一接触点。纯转发函数存在的理由就是维持这个边界。
2. **在 SDK 边界内最大化表达能力** — 不因边界而牺牲插件的开发体验。
3. **保留所有现有接口** — `sdk.read`（命令式）、`sdk.log.subscribe`、`sdk.awareness.subscribe` 等均保持不变。

---

## 设计方案

### 统一提供 React hooks

三种变化模式统一提供 hook 便利接口，减少插件组件中的样板代码：

```typescript
// ── 数据（状态型）──────────────────────────────────────────
const entity = sdk.data.useEntity(entityId)
const health = sdk.data.useComponent(entityId, 'dh:health')
const trackers = sdk.data.useQuery({ has: ['core:tracker'] })

// ── 日志（事件流型）────────────────────────────────────────
const { entries, newIds } = sdk.log.useEntries('core:roll-result', { limit: 20 })

// ── Awareness（状态型）─────────────────────────────────────
const peerStates = sdk.awareness.usePeers(cursorChannel)
```

### 新增命名空间：`sdk.data`

`sdk.read`（`IDataReader`）保持不变 — 它是命令式读取接口，同时被 workflow context（`ctx.read`）和组件 SDK（`sdk.read`）使用。

新增 `sdk.data` 命名空间，仅在 `IComponentSDK` 上提供（workflow context 不需要响应式）：

```typescript
interface IReactiveDataSDK {
  /** 订阅单个 entity，变化时触发重渲染 */
  useEntity(entityId: string): Entity | undefined

  /** 订阅 entity 上的单个 component，变化时触发重渲染 */
  useComponent<K extends keyof ComponentTypeMap>(
    entityId: string,
    key: K,
  ): ComponentTypeMap[K] | undefined

  /** 订阅满足条件的 entity 集合，结果变化时触发重渲染 */
  useQuery(spec: { has?: string[] }): Entity[]
}
```

### 扩展 `sdk.log`：日志 hook

日志是事件流而非状态，hook 语义与数据不同：

```typescript
interface ILogSDK {
  // 现有：回调式订阅（保留不变）
  subscribe(pattern: string, handler: (entry: unknown) => void): () => void

  // 新增：React hook
  useEntries(pattern: string, options?: { limit?: number }): {
    /** 匹配的条目（按时间排序，最多 limit 条） */
    entries: GameLogEntry[]
    /** 组件挂载后到达的条目 id 集合（用于入场动画等） */
    newIds: ReadonlySet<string>
  }
}
```

**日志 hook 的「记忆」机制**：

hook 内部记录组件挂载时的水位线（当前最大 seq）。之后到达的条目其 id 会被加入 `newIds`。组件用 `newIds.has(entry.id)` 判断是否需要播放入场动画。

挂载时 `entries` 包含历史条目（从客户端已有日志中按 pattern 过滤），无需额外的 `sdk.log.query()` 方法。

### 扩展 `sdk.awareness`：Awareness hook

```typescript
interface IAwarenessSDK {
  // 现有（保留不变）
  subscribe<T>(channel, handler: (seatId: string, state: T | null) => void): () => void
  broadcast<T>(channel, data: T): void
  clear(channel): void

  // 新增：React hook
  usePeers<T>(channel: { readonly key: string; readonly __phantom?: T }): ReadonlyMap<string, T>
}
```

返回 `Map<seatId, T>`，任何 peer 的状态变化触发重渲染。

---

## API 分布

### `IComponentSDK` 更新后的完整接口

```typescript
interface IComponentSDK {
  // 命令式数据读取（已有，不变）
  read: IDataReader

  // 响应式数据订阅（新增）
  data: IReactiveDataSDK

  // 工作流执行（已有，不变）
  workflow: IWorkflowRunner

  // 组件上下文（已有，不变）
  context: ComponentContext

  // 交互能力（已有，不变，仅 play 模式）
  interaction?: IInteractionSDK

  // 日志（扩展：新增 useEntries hook）
  log: ILogSDK

  // Awareness（扩展：新增 usePeers hook）
  awareness: IAwarenessSDK

  // 面板管理（已有，不变）
  ui: { openPanel(...): string; closePanel(...): void }
}
```

### 什么在 workflow context 上，什么只在组件 SDK 上

| 接口 | `WorkflowContext` | `IComponentSDK` | 理由 |
|------|:---:|:---:|------|
| `read`（命令式） | ✅ | ✅ | 两者都需要读取数据 |
| `data`（响应式 hooks） | ❌ | ✅ | Hooks 是 React 概念，workflow 是命令式 |
| `log.subscribe` | ❌ | ✅ | 组件订阅日志流 |
| `log.useEntries` | ❌ | ✅ | React hook |
| `awareness.*` | ❌ | ✅ | 组件间瞬态状态 |
| `workflow.runWorkflow` | ✅（`ctx.runWorkflow`） | ✅ | 两者都可触发工作流 |

---

## 设计决策

| 决策 | 理由 |
|------|------|
| 新增 `sdk.data` 而非扩展 `sdk.read` | `read` 是 `IDataReader`，同时被 workflow context 使用；hooks 只对 React 组件有意义，放在 `data` 上避免污染命令式接口 |
| hooks 放在 SDK 对象上而非独立 import | 维持「SDK 是唯一交互点」原则；`sdk.data.useEntity(id)` 符合 React hook 调用规则 |
| 日志 hook 返回 `{ entries, newIds }` | 日志是事件流，组件需要区分「历史条目」和「新到达条目」以决定动画行为 |
| 日志 hook 包含历史查询 | 组件挂载时需要显示已有条目，不应额外调用 query API |
| 保留所有现有 subscribe 回调 | hooks 是便利层，底层 subscribe 仍可用于非 React 场景或需要细粒度控制的情况 |

---

## 实现方向

### hook 底层机制

所有 hooks 内部通过 zustand `subscribe` + `useSyncExternalStore` 实现，但插件不接触 zustand：

```typescript
// sdk.data.useEntity 的内部实现示意
function createUseEntity(getStore: () => WorldStore) {
  return function useEntity(entityId: string): Entity | undefined {
    return useSyncExternalStore(
      getStore().subscribe,
      () => getStore().getState().entities[entityId],
    )
  }
}
```

### `createProductionSDK` 扩展

`uiSystemInit.ts` 的 `createProductionSDK` 新增 `data` 属性构建：

```typescript
function createProductionSDK(args: SDKFactoryArgs): IComponentSDK {
  return {
    read: args.read,
    data: {
      useEntity: createUseEntity(getWorldStore),
      useComponent: createUseComponent(getWorldStore),
      useQuery: createUseQuery(getWorldStore),
    },
    log: {
      subscribe: args.logSubscribe ?? noopSubscribe,
      useEntries: createUseEntries(getWorldStore),
    },
    awareness: {
      ...existingAwarenessSDK,
      usePeers: createUsePeers(args.awarenessManager),
    },
    // ... 其余不变
  }
}
```

### 测试策略

- **单元测试**：每个 hook 独立测试（mock store，验证订阅/退订/重渲染）
- **集成测试**：组件通过 SDK hooks 读取数据，修改 store，验证组件更新
- **对比测试**：`sdk.read.entity(id)` 和 `sdk.data.useEntity(id)` 对同一 entity 返回一致的数据

---

## 改动文件清单

### 新增

| 文件 | 内容 |
|------|------|
| `src/ui-system/reactiveHooks.ts` | 所有 hook 的实现（useEntity, useComponent, useQuery, useEntries, usePeers） |
| `src/ui-system/__tests__/reactiveHooks.test.ts` | hook 单元测试 |

### 修改

| 文件 | 改动 |
|------|------|
| `src/ui-system/types.ts` | `IComponentSDK` 新增 `data: IReactiveDataSDK`；`log` 和 `awareness` 接口扩展 |
| `src/ui-system/uiSystemInit.ts` | `createProductionSDK` 构建 `data`、扩展 `log`/`awareness` |
| `src/workflow/types.ts` | 新增 `IReactiveDataSDK`、`ILogSDK`、`IAwarenessSDK` 接口定义 |

### 不变

| 文件 | 理由 |
|------|------|
| `src/workflow/context.ts` | workflow context 不需要 hooks |
| `src/workflow/pluginSDK.ts` | 注册时 SDK 不涉及响应式 |
| `src/log/rendererRegistry.ts` | 渲染器注册不受影响 |
| `src/stores/*` | store 内部结构不变，hooks 通过现有 subscribe 机制桥接 |
