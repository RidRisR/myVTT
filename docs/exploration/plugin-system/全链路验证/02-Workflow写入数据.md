# 阶段 2：Workflow 写入数据

> **POC 目标**：验证 Workflow 执行后能真正修改 store 数据，且修改结果立即反映到 UI；同时完善 WorkflowContext 的读写接口设计。
> **范围**：纯前端内存操作，无后端、无网络请求。

---

## 一、当前状态

`WorkflowRunner` 的写入回调目前全是空实现：

```ts
const runner = new WorkflowRunner(engine, {
  updateEntity: () => {}, // ← 什么都不做
  updateTeamTracker: () => {}, // ← 什么都不做
  sendRoll: () => Promise.resolve({ rolls: [], total: 0 }),
  // ...
})
```

Workflow 执行完毕后，数据层没有任何变化，UI 无法响应。

---

## 二、设计方案

### 2.1 将写入回调接入 zustand store

`WorkflowRunner` 的回调注入真实的 store action：

```ts
const runner = new WorkflowRunner(engine, {
  updateComponent: (entityId, key, updater) => {
    usePocStore.getState().updateEntityComponent(entityId, key, updater)
  },
  patchGlobal: (key, patch) => {
    usePocStore.getState().patchGlobal(key, patch)
  },
  // sendRoll 等非写入回调保持 mock
})
```

### 2.2 zustand store 新增两个 action

```ts
interface PocStore {
  entities: Record<string, Entity>
  globals: Record<string, Global>

  // 对某个实体的某个组件做函数式更新（避免读-改-写竞争）
  updateEntityComponent<T>(entityId: string, key: string, updater: (current: T | undefined) => T): void

  // 对某个 global 做 shallow merge
  patchGlobal(key: string, patch: Record<string, unknown>): void
}

// 实现
updateEntityComponent(entityId, key, updater) {
  set(state => ({
    entities: {
      ...state.entities,
      [entityId]: {
        ...state.entities[entityId],
        components: {
          ...state.entities[entityId]?.components,
          [key]: updater(state.entities[entityId]?.components?.[key]),
        },
      },
    },
  }))
},

patchGlobal(key, patch) {
  set(state => ({
    globals: {
      ...state.globals,
      [key]: { ...state.globals[key], ...patch },
    },
  }))
},
```

### 2.3 IDataSDK 从同一 store 读取

`IDataSDK` 的实现订阅同一个 zustand store，保证写入后立即可读：

```ts
// makeSDK 里注入的 data 实现
data: {
  entity: (id) => usePocStore.getState().entities[id],
  entities: () => Object.values(usePocStore.getState().entities),
  component: (entityId, key) => usePocStore.getState().entities[entityId]?.components?.[key],
  globals: () => Object.values(usePocStore.getState().globals),
  global: (key) => usePocStore.getState().globals[key],
  query: (spec) => { /* 客户端过滤，见阶段 1 */ },
}
```

---

## 三、数据流

```
组件调用 sdk.workflow.run(handle, input)
          ↓
WorkflowEngine 执行 workflow 步骤
          ↓
步骤调用 ctx.updateComponent(entityId, key, updater)
          ↓
WorkflowRunner 回调执行 usePocStore.getState().updateEntityComponent(...)
          ↓
zustand store 更新（新对象引用）
          ↓
订阅了该数据的所有组件触发 re-render
          ↓
组件读取 sdk.data.component(entityId, key) 拿到新值
```

---

## 四、验收标准

1. **单面板写入响应**：面板内按钮触发 workflow，workflow 调用 `ctx.updateComponent`，面板立即显示新值。

2. **双面板同步**：两个面板绑定同一 entityId，面板 A 的 workflow 写入数据，面板 B 同步更新，无需任何直接通信。

3. **Globals 写入响应**：workflow 调用 `ctx.patchGlobal`，显示该 global 的组件立即更新。

4. **workflow 主动读取**：workflow 步骤通过 `ctx.read.component(id, key)` 查询 store 数据，组件调用时只传 ID，不预先传入数据字段。

---

## 五、与生产模型的差异

|              | POC（本阶段）            | 生产              |
| ------------ | ------------------------ | ----------------- |
| 写入目标     | 内存 zustand store       | REST API → SQLite |
| 多客户端同步 | ❌ 无                    | Socket.io 广播    |
| 数据持久化   | ❌ 刷新丢失              | SQLite 持久化     |
| 验证价值     | ✅ 接口设计 + 响应式机制 | —                 |

生产阶段只需将写入回调从 `store.patch()` 改为 `fetch()`，组件代码和 workflow 代码**零改动**。

---

## 六、已确认方向：Workflow 的数据读取能力

**当前状态**：`WorkflowContext` 目前**没有任何读取能力**。`ctx.state` 是调用方传入的参数 + 步骤间累积状态，完全由发起者决定，不是对 store 的查询接口。

**问题**：当规则逻辑需要查询游戏状态来做决策时，组件必须把所有相关数据都传进去：

```ts
// 组件不得不传入大量 workflow 内部才需要的数据
sdk.workflow.run(castSpellHandle, {
  spellId: 'fire-bolt',
  casterId: props.entityId,
  casterSpellMod: ???,          // 组件需要提前读出来？（会被放入 ctx.state）
  targetId: selectedTargetId,
  targetFireResistance: ???,    // 这些数据组件根本不关心
})
```

这会导致组件和 workflow 之间产生不必要的数据耦合——组件需要了解 workflow 内部的数据依赖。

**正确模型**：组件只传意图（ID + 触发参数），workflow 自己查询所需数据：

```ts
// 组件只传意图
sdk.workflow.run(castSpellHandle, {
  spellId: 'fire-bolt',
  casterId: props.entityId,
  targetId: selectedTargetId,
})

// workflow 步骤里主动读取
const resistance = ctx.read.component(ctx.state.targetId, 'core:resistances')
const isImmune = resistance?.fire === 'immune'
```

**`WorkflowContext` 新增 `ctx.read`**：

```ts
interface WorkflowContext<TState, TConst = undefined> {
  // 调用方参数 + 步骤间传值（可读写，非 store）
  state: TState

  // 可选：冻结参数（Object.freeze），步骤不可修改
  const?: Readonly<TConst>

  // 写入能力
  updateComponent<T>(entityId: string, key: string, updater: (current: T | undefined) => T): void
  patchGlobal(key: string, patch: Record<string, unknown>): void

  // 已确认新增：从 store 只读查询游戏状态
  // 复用 IDataSDK 同一接口，保持组件侧和 workflow 侧的查询能力一致
  read: {
    entity(id: string): Entity | undefined
    component<T>(entityId: string, key: string): T | undefined
    global(key: string): Global | undefined
    query(spec: { has?: string[] }): Entity[]
  }
}
```

> **审核更新**：`ctx.data` 已重命名为 `ctx.state`（Koa 风格，与 `ctx.read` 区分更清晰）。不再做 `input` / `state` 强制分离——调用方参数直接放入 `state`，步骤间传值也在 `state` 上。新增可选 `ctx.const` 用于冻结参数。`ctx.read` 复用 IDataSDK 接口，新增 `query()`。参见 [06-审核意见.md](06-审核意见.md) §1.3、§4.1。

**两个概念的区别**：

|          | `ctx.state`                   | `ctx.read`                  |
| -------- | ----------------------------- | --------------------------- |
| 内容     | 调用方传入的参数 + 步骤间累积 | 当前 store 中的持久游戏数据 |
| 生命周期 | workflow 执行期间             | 游戏状态（持久）            |
| 用途     | 传递意图、步骤间传值          | 查询规则决策所需的实时数据  |

**可测试性**：`ctx.read` 引入对 store 的隐式依赖，单元测试需要 mock store 状态。这是真实规则系统不可避免的成本——规则逻辑不可能只依赖调用方传入的数据。

**结论**：`ctx.read` 是必要能力，**在本 POC 阶段一并实现**。

---

## 七、Input 设计：意图指针，而非数据包

### 7.1 确认方向

`WorkflowHandle` 的 `TInput` 类型参数保持现有设计——只加输入类型，**不加输出类型**。

原因：workflow 输出的类型安全与可扩展步骤机制存在根本矛盾：

- 步骤管道允许插件任意注入，无法在编译期保证某个中间状态一定存在
- 强行声明输出类型只会制造虚假的类型安全感

等想清楚再做，目前 `sdk.workflow.run(handle, input)` 返回 `Promise<void>`。

### 7.2 Input 的正确语义

**Input = 意图指针**，组件只传：

- 操作涉及的实体/对象 ID（来自组件 props）
- 触发参数（来自用户选择，如 `spellId`）
- UI 派生的临时状态（如 `targetId`，来自当前选中，未来由 session SDK 提供）

**不应该传**：从 store 能读到的任何数据字段。

```ts
// ✅ 正确：只传意图指针（这些参数会成为 ctx.state 的初始值）
sdk.workflow.run(castSpellHandle, {
  casterId: props.entityId,
  spellId: 'fire-bolt',
  targetId: selectedTargetId,
})

// ❌ 错误：提前读数据并打包传入
sdk.workflow.run(castSpellHandle, {
  casterId: props.entityId,
  casterSpellMod: entity.components['core:spellcasting'].mod, // workflow 自己读
  targetFireResistance: target.components['core:resistances'].fire, // workflow 自己读
})
```

> **审核更新**：不做 `input` / `state` 强制分离。调用方传入的参数直接成为 `ctx.state` 的初始值，步骤间传值也在 `ctx.state` 上累积。如需冻结部分参数，可使用可选的 `ctx.const`（`Object.freeze`）。参见 [06-审核意见.md](06-审核意见.md) §1.3。

### 7.3 完整的 WorkflowContext 接口

```ts
interface WorkflowContext<TState, TConst = undefined> {
  // 调用方参数 + 步骤间传值（可读写，仅 workflow 执行期间有效）
  state: TState

  // 可选：冻结参数（Object.freeze），步骤不可修改
  const?: Readonly<TConst>

  // 写入游戏状态
  updateComponent<T>(entityId: string, key: string, updater: (current: T | undefined) => T): void
  patchGlobal(key: string, patch: Record<string, unknown>): void

  // 只读查询游戏状态（本 POC 阶段实现，复用 IDataSDK 接口）
  read: {
    entity(id: string): Entity | undefined
    component<T>(entityId: string, key: string): T | undefined
    global(key: string): Global | undefined
    query(spec: { has?: string[] }): Entity[]
  }
}
```

---

## 八、未来改进：单步 workflow 语法糖

> **状态**：待实现，不影响当前 POC。

对于只有一个默认步骤的简单 workflow（如 +1 属性值），当前写法需要两步：先 `defineWorkflow`，再 `sdk.addStep`。可以提供语法糖：

```ts
// 当前写法（两步）
const incrementStatHandle = defineWorkflow<{ entityId: string; key: string; delta: number }>('core:increment-stat')
sdk.addStep(incrementStatHandle, {
  id: 'core:increment-stat:default',
  run: async (ctx) => { ... },
})

// 语法糖（一步）
const incrementStatHandle = defineWorkflow<{ entityId: string; key: string; delta: number }>(
  'core:increment-stat',
  async (ctx) => {
    ctx.updateComponent(ctx.state.entityId, ctx.state.key, (current: Record<string, unknown> | undefined) => ({
      ...current,
      value: ((current?.value as number) ?? 0) + ctx.state.delta,
    }))
  }
)
// 默认步骤的隐式 id = workflow key（'core:increment-stat'）
```

插件仍可在默认步骤前后插入：

```ts
sdk.addStep(incrementStatHandle, {
  id: 'my-plugin:validate-max',
  before: 'core:increment-stat', // anchor 直接用 workflow key
  run: (ctx) => {
    /* 验证不超过最大值 */
  },
})
```

可扩展性不受影响，只是省去了样板代码。

---

## 九、二审补充

> 以下内容来自全链路验证二审讨论，对本阶段设计的修订和补充。

### 9.1 `updateComponent` 生产策略

函数式 updater 无法通过 REST JSON 序列化传递给服务端。生产版 `updateComponent` 内部：客户端执行 updater 得到结果值 → 发送结果值到服务端 → 服务端广播 Socket.io。与现有 REST + Socket.io 架构一致（action → REST → 服务端广播 Socket → store 更新）。

```ts
// 生产版 updateComponent 内部：
async function updateComponent(eid, key, updater) {
  // 1. 本地执行 updater 得到结果值
  const current = store.getState().entities[eid].components[key]
  const newValue = updater(current)

  // 2. 发送结果值到服务端
  await fetch(`/entities/${eid}/components/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ data: newValue }),
  })
  // 3. 服务端写入 + 广播 Socket.io → 所有客户端 store 更新 → UI 刷新
}
```

VTT 场景下 last-write-wins 配合 owner 隔离 + 软锁足够。updater 签名不变，插件代码不改。

### 9.2 "零改动" 措辞修正

§五中 "组件代码和 workflow 代码**零改动**" 修正为：

> 接口语义不变，`updateComponent` 签名可能从 `void` 变为 `Promise<void>`，workflow 步骤的 `run` 函数需要 await。但插件的业务逻辑不需要改动。

### 9.3 `await` 后数据可能过时

§六 `ctx.read` 说明补充：如果 workflow 有 `await` 点（如 `requestInput`、生产环境下的 `updateComponent`），await 之后 `ctx.read` 返回的值可能已被其他并行操作修改。插件开发者应在 await 之后重新读取所需数据，而非依赖 await 之前的旧值。

```ts
// ❌ 潜在问题：await 后用旧值
const hp = ctx.read.component(targetId, 'core:health')?.hp
await ctx.requestInput(...)
// hp 可能已过时

// ✅ 正确：await 后重新读取
await ctx.requestInput(...)
const hp = ctx.read.component(targetId, 'core:health')?.hp
```
