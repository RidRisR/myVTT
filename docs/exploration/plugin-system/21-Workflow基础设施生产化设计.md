# 21 — Workflow 基础设施生产化设计

> **状态**：Review 修订版
> **前置文档**：Doc 19（Workflow + Step 模型设计）、Doc 20（POC 实现计划）
> **目标**：解决 POC 验证中发现的基础设施问题，使 Workflow 引擎具备生产就绪的类型安全、并发安全、错误恢复和插件生命周期管理能力

---

## 1 背景与范围

### 1.1 POC 验证了什么

Doc 19 设计的 Workflow + Step 协作模型已通过 POC 验证：

- **WorkflowEngine** 的 6 种操作（define / add / wrap / remove / run / inspect）
- **规则插件**（daggerheart-core）在 `roll` workflow 中插入 `dh:judge` 和 `dh:resolve`
- **美化插件**（daggerheart-cosmetic）在 `dh:judge` 之后插入 `cos:dice-animation`
- 两个插件通过 `ctx.data` 共享数据，无直接引用
- Priority 排序、洋葱层包装、嵌套 workflow（递归深度限制 10 层）

**结论：协作模型可行**。问题不在模型本身，而在基础设施的工程质量。

### 1.2 本文档聚焦什么

POC 遗留的基础设施问题，按主题分组：

| 主题         | 问题                                           | 严重度 |
| ------------ | ---------------------------------------------- | ------ |
| **类型安全** | ctx.data 无类型安全                            | 高     |
|              | ctx.data 可被整体替换（Review 新增）           | 中     |
| **并发安全** | currentDepth 并发竞态                          | 高     |
|              | SDK runWorkflow 绕过 depth 追踪（Review 新增） | 高     |
|              | Step 列表迭代安全                              | 低     |
| **错误处理** | 错误处理不完整 + data 失败污染（Review 新增）  | 中     |
| **执行机制** | 嵌套 workflow 无法返回数据                     | 中     |
|              | abort 机制脆弱（Review 新增）                  | 低     |
| **插件系统** | 插件硬编码 + 无生命周期管理                    | 高     |
|              | wrapStep 语义模糊 + 无链断裂检测               | 中     |
| **数据层**   | updateTeamTracker read-then-write 竞态         | 高     |

### 1.3 不在本次范围内

- 骰子系统重构（sendRoll 桥接、formula 求值）— 后续独立重构
- playAnimation / playSound 实现 — 美化系统范畴
- 多 Workflow 架构拆分（Doc 19 §11.4）— 按需演进
- 插件动态加载 / 热插拔 — Phase 2/3
- Context 关注点分离 / 意图缓冲 — 需专项设计（见 §3.1）

---

## 2 问题分析与设计方案

### 2.1 类型安全与数据保护

#### 2.1.1 ctx.data 无类型安全

**现状**：`ctx.data` 是 `Record<string, unknown>`（[types.ts:41](../../src/workflow/types.ts)），所有插件通过 `as` 断言读写，key 拼写错误在编译期无法发现。

**风险**：上游插件改变数据结构，下游插件静默读到错误类型。随着 step 数量增长，隐式数据契约不可维护。

**方案：WorkflowHandle 携带类型（编译期强制）**

`defineWorkflow` 返回带有 phantom type 的 handle 对象，`addStep` 接受 handle 而非字符串，编译器自动推断并约束类型：

```typescript
// === 类型基础设施 ===

interface WorkflowHandle<TData> {
  readonly name: string
  readonly __brand: TData  // phantom type，运行时不存在
}

// Engine API 签名
defineWorkflow<TData>(name: string, steps: Step<TData>[]): WorkflowHandle<TData>

// addStep 的 TData 必须 extends handle 的基础类型
addStep<TData extends TBase, TBase>(
  handle: WorkflowHandle<TBase>,
  step: StepAddition<TData>
): void

// WorkflowContext 泛型化
interface WorkflowContext<TData extends Record<string, unknown> = Record<string, unknown>> {
  data: TData
  // ... 其他 capabilities 不变
}
```

**分层类型声明**：

```typescript
// @myvtt/sdk — 基座导出的类型
export interface BaseRollData {
  formula: string
  actorId: string
  rolls?: number[][]
  total?: number
}

// plugins/daggerheart-core/types.ts — 规则插件导出的扩展类型
export interface DaggerheartRollData extends BaseRollData {
  judgment?: { type: 'daggerheart'; outcome: string; hopeDie: number; fearDie: number }
}
```

**使用方式**：

```typescript
// baseWorkflows.ts — 导出 handle
export const rollWorkflow = engine.defineWorkflow<BaseRollData>('roll', [...])

// 场景 1：只读取基础数据 — 完全自动，零泛型标注
sdk.addStep(rollWorkflow, {
  id: 'cos:animate',
  run: (ctx) => {
    ctx.data.rolls   // ✅ 自动推断为 BaseRollData
    ctx.data.foo     // ❌ 编译错误
  },
})

// 场景 2：需要写入新字段 — 声明扩展类型，约束自动检查
sdk.addStep<DaggerheartRollData>(rollWorkflow, {
  id: 'dh:judge',
  run: (ctx) => {
    ctx.data.rolls     // ✅ 继承自 BaseRollData
    ctx.data.judgment   // ✅ 扩展字段
  },
})

// 类型不兼容 → 编译错误
sdk.addStep<{ foo: number }>(rollWorkflow, { ... })
//          ^^^^^^^^^^^^^^ ❌ { foo: number } 不满足 extends BaseRollData
```

**嵌套 workflow**：`runWorkflow` 同样接受 handle：

```typescript
const result = await ctx.runWorkflow(rollWorkflow, initialData)
// result.data 自动推断为 BaseRollData
```

**关键优势**：

- 大多数 cosmetic 插件（场景 1）完全零手动标注，类型自动推断
- 只有写入新字段的核心规则插件需要声明扩展类型，但 `extends` 约束由编译器自动检查
- 插件必须 import handle 而非字符串 → 依赖关系显式化，IDE 跳转可用

**渐进式迁移**：泛型参数默认为 `Record<string, unknown>`，现有代码无需立即修改。

---

#### 2.1.2 ctx.data 可被整体替换（Review 新增）

**现状**：`ctx` 是普通对象字面量（[context.ts:19-52](../../src/workflow/context.ts)），`data` 属性可被赋值替换。

```typescript
ctx.data = {} // 清空所有上游数据，下游 step 全部读到 undefined
```

TypeScript `readonly` 仅编译期约束，运行时无效。

**方案：getter without setter（运行时强制）**

```typescript
// context.ts
function createWorkflowContext(deps, initialData) {
  const data = { ...initialData }
  const ctx = {
    get data() {
      return data
    },
    // 没有 setter → strict mode 下 ctx.data = {} 抛 TypeError
    // ctx.data.rolls = [...] 正常工作（修改属性，非替换引用）
  }
}
```

---

#### 2.1.3 Non-critical step 失败污染 data（Review 新增）

**现状**：如果 non-critical step 写入部分数据后抛异常，脏数据残留在 `ctx.data` 中影响后续 step。

**方案：snapshot + restore（失败时回滚）**

```typescript
// Engine 执行循环
for (const meta of steps) {
  if (meta.step.critical !== false) {
    // critical step：直接执行，失败则 workflow 中断
    // 无需 snapshot——没有后续 step 会读 data
    await composedFn(ctx)
  } else {
    // non-critical step：snapshot → 执行 → 失败则恢复
    const snapshot = structuredClone(data)
    try {
      await composedFn(ctx)
    } catch (err) {
      for (const k of Object.keys(data)) delete data[k]
      Object.assign(data, snapshot)
      errors.push({ stepId: meta.step.id, error: err })
      console.error(`[Workflow] Step "${meta.step.id}" failed:`, err)
    }
  }
}
```

**为什么 critical step 不需要 snapshot**：critical step 失败 → workflow 中断 → 没有后续 step 读 data → 脏数据无影响。

**成功路径零开销**：只有 non-critical step 才做 snapshot，且只在失败时才 restore。与副本+merge 方案相比（成功路径也要 merge），snapshot 在常见路径零开销。

---

### 2.2 并发安全与递归保护

#### 2.2.1 currentDepth 并发竞态

**现状**：

```typescript
// src/workflow/engine.ts
export class WorkflowEngine {
  private currentDepth = 0  // 实例级变量

  async runWorkflow(name: string, ctx: WorkflowContext): Promise<void> {
    if (this.currentDepth >= MAX_RECURSION_DEPTH) { throw ... }
    this.currentDepth++
    // ...
  }
}
```

**风险**：两个独立 workflow 并发 async 执行时共享 `currentDepth`，A 的嵌套层数会污染 B 的计数。

**方案：Context 携带 depth + getter + WeakMap（可见不可改）**

将 depth 从 engine 实例级变量改为 context 级别，用 WeakMap 存储真实值，getter 暴露只读访问：

```typescript
// engine.ts — 内部存储
const depthMap = new WeakMap<object, number>()
function getDepth(ctx: WorkflowContext): number { return depthMap.get(ctx) ?? 0 }
function setDepth(ctx: WorkflowContext, d: number): void { depthMap.set(ctx, d) }

// context.ts — 只读 getter
const ctx = {
  get _depth() { return getDepth(this) },
  // 没有 setter → ctx._depth = 5 在 strict mode 下抛 TypeError
}

// engine.ts — runWorkflow
async runWorkflow(name: string, ctx: WorkflowContext): Promise<WorkflowResult> {
  const depth = getDepth(ctx)
  if (depth >= MAX_RECURSION_DEPTH) throw new Error(`Recursion depth exceeded`)
  setDepth(ctx, depth + 1)
  try {
    // ...
  } finally {
    setDepth(ctx, depth)
  }
}

// context.ts — 嵌套调用时传递 depth
runWorkflow: (name: string, data?: Record<string, unknown>) => {
  const nestedCtx = createWorkflowContext(deps, data)
  setDepth(nestedCtx, getDepth(ctx))  // 继承父级 depth
  return deps.engine.runWorkflow(name, nestedCtx)
}
```

每条执行链有独立的 depth 计数。A 和 B 并发执行互不影响。**删除** `private currentDepth = 0`。

---

#### 2.2.2 SDK runWorkflow 绕过 depth 追踪（Review 新增）

**现状**：`IPluginSDK` 接口包含 `runWorkflow`（[types.ts:64](../../src/workflow/types.ts)）。插件在 `onActivate(sdk)` 时可以闭包捕获 `sdk` 引用，然后在 step 的 `run(ctx)` 中调用 `sdk.runWorkflow` 而非 `ctx.runWorkflow`。SDK 每次创建全新 context（depth=0），绕过递归保护。

**方案：注册 API 与执行 API 分离**

将 `runWorkflow` 从 `IPluginSDK` 移除，拆分为三层执行入口：

```typescript
// 注册 API — 插件 onActivate 时使用，无 runWorkflow
export interface IPluginSDK {
  addStep<TData extends TBase, TBase>(
    handle: WorkflowHandle<TBase>,
    addition: StepAddition<TData>,
  ): void
  wrapStep(handle: WorkflowHandle<unknown>, targetStepId: string, options: WrapStepOptions): void
  replaceStep(
    handle: WorkflowHandle<unknown>,
    targetStepId: string,
    options: ReplaceStepOptions,
  ): void
  removeStep(handle: WorkflowHandle<unknown>, targetStepId: string): void
  inspectWorkflow(handle: WorkflowHandle<unknown>): string[]
}

// 执行 API — UI 层使用
export interface IWorkflowRunner {
  runWorkflow<TData>(
    handle: WorkflowHandle<TData>,
    data?: Partial<TData>,
  ): Promise<WorkflowResult<TData>>
}
```

三层执行入口职责：

| 入口                           | 使用者                            | depth 行为                   |
| ------------------------------ | --------------------------------- | ---------------------------- |
| `IWorkflowRunner.runWorkflow`  | UI 层（按钮点击）、Socket handler | depth=0，合法根节点          |
| `ctx.runWorkflow`              | step 内嵌套调用                   | 继承父级 depth，递归保护生效 |
| `IPluginSDK`（无 runWorkflow） | 插件 `onActivate` 注册阶段        | 类型系统阻止调用             |

TypeScript 编译器保证：插件闭包捕获的 `sdk` 类型上没有 `runWorkflow`，误用在编译期直接报错。

**插件如何获取执行能力**：

插件通过 `RulePlugin.surfaces` 注册自定义 React 组件，组件内部通过公共 hook `useWorkflowRunner()` 获取执行能力：

```typescript
function DHRestPanel() {
  const runner = useWorkflowRunner()
  return <button onClick={() => runner.runWorkflow(shortRestWorkflow, {...})}>
    Short Rest
  </button>
}
```

对于标准化操作（掷骰、攻击），插件通过 `RulePlugin.diceSystem.getRollActions()` 声明 action 数据，基座统一渲染按钮并调度 workflow。

---

#### 2.2.3 Step 列表迭代安全

**现状**：`for (const meta of record.steps)` 直接迭代原数组引用。

**方案：一行修复**

```typescript
async runWorkflow(name: string, ctx: WorkflowContext): Promise<WorkflowResult> {
  const record = this.getRecord(name)
  const steps = [...record.steps]  // snapshot
  for (const meta of steps) { ... }
}
```

---

### 2.3 错误处理与恢复

#### 2.3.1 Step 容错等级

**现状**：任何 step 抛异常 → 直接冒泡，后续 step 全部跳过。有 bug 的美化插件会阻断游戏逻辑。

**方案：critical 标记 + result.errors（Engine 不主动 toast）**

```typescript
interface Step<TData = Record<string, unknown>> {
  id: string
  /** 默认 true。non-critical step 的异常被 catch 并 log，不中断 workflow */
  critical?: boolean
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}
```

三层错误处理分离：

1. **Engine 层**：non-critical step 失败 → `console.error`（开发者一定看得到）+ 收集到 errors 数组 + snapshot/restore 回滚 data（见 §2.1.3）
2. **WorkflowResult**：`errors: StepError[]` 返回给调用方，调用方决定是否/如何通知用户
3. **Engine 不主动 toast** — 展示决定权交给 UI 层

```typescript
interface WorkflowResult<TData extends Record<string, unknown> = Record<string, unknown>> {
  status: 'completed' | 'aborted'
  reason?: string
  data: TData
  errors: StepError[] // 非关键 step 的错误集合
}
interface StepError {
  stepId: string
  error: Error
}
```

**约定**：

- 基座 step（`generate`、`display`）和规则插件的状态修改 step（`dh:resolve`）默认 critical
- 美化插件的 step 应标记 `critical: false`

```typescript
sdk.addStep(rollWorkflow, {
  id: 'cos:dice-animation',
  after: 'dh:judge',
  critical: false, // 动画失败不应阻断游戏逻辑
  run: cosmeticDiceAnimationStep,
})
```

---

### 2.4 Workflow 执行与返回

#### 2.4.1 嵌套 workflow 返回数据

**现状**：`runWorkflow` 返回 `Promise<void>`，内层 `ctx.data` 不回传给外层。abort 的 reason 被丢弃。

**方案：返回 WorkflowResult**

```typescript
// WorkflowContext 中的签名
runWorkflow<TData>(handle: WorkflowHandle<TData>, data?: Partial<TData>): Promise<WorkflowResult<TData>>
```

**Engine 实现**：

```typescript
async runWorkflow(name: string, ctx: WorkflowContext): Promise<WorkflowResult> {
  const state = { aborted: false, abortReason: undefined as string | undefined }
  const errors: StepError[] = []

  // abort 通过闭包 + mutable handler 实现（见 §2.4.2）
  // ... 执行循环 ...

  return {
    status: state.aborted ? 'aborted' : 'completed',
    reason: state.abortReason,
    data: { ...ctx.data },  // 浅拷贝，切断引用
    errors,
  }
}
```

**注意**：返回 `{ ...ctx.data }` 而非 `ctx.data`，调用者拿到的是独立副本，修改返回值不影响原始 context。

**使用示例**：

```typescript
// 攻击 workflow 调用 roll workflow 并使用结果
{
  id: 'roll',
  run: async (ctx) => {
    const result = await ctx.runWorkflow(rollWorkflow, {
      formula: `2d12+@${ctx.data.stat}`,
      actorId: ctx.data.actorId,
    })
    if (result.status === 'aborted') {
      ctx.abort('Roll was aborted')
      return
    }
    ctx.data.rolls = result.data.rolls
    ctx.data.total = result.data.total
  },
}
```

---

#### 2.4.2 abort 机制（Review 新增）

**现状**：abort 的实现依赖 engine 在 `runWorkflow` 入口处通过 `ctx.abort = newFn` 直接赋值替换。理论上存在引用捕获绕过风险。

**方案：闭包 + mutable handler**

```typescript
// context.ts
const abortState = {
  handler: (_reason?: string) => {
    console.warn('abort() called outside workflow execution')
  },
}

const ctx = {
  abort: (reason?: string) => abortState.handler(reason), // 永远同一个函数引用
}

// engine.ts — 不再替换 ctx.abort，只替换 handler
abortState.handler = (reason) => {
  state.aborted = true
  state.abortReason = reason
}
```

任何时候保存的 `ctx.abort` 引用都会走到最新的 handler。

---

### 2.5 插件系统

#### 2.5.1 插件硬编码 + 无生命周期管理

**现状**：

```typescript
// src/workflow/useWorkflowSDK.ts
const POC_PLUGINS: VTTPlugin[] = [daggerheartCorePlugin, daggerheartCosmeticPlugin]
let _pluginsActivated = false
```

插件列表写死，无 `onDeactivate`，Engine 是模块级单例无法按房间隔离。

**方案**：

**a. VTTPlugin 接口增加生命周期和依赖声明：**

```typescript
export interface VTTPlugin {
  id: string
  dependencies?: string[]
  onActivate(sdk: IPluginSDK): void
  onDeactivate?(sdk: IPluginSDK): void
}
```

**b. Engine 追踪 step owner：**

```typescript
interface StepMeta {
  step: Step
  owner?: string // 注册此 step 的 plugin ID
}

// PluginSDK 在 addStep 时自动标记 owner
// Engine 支持 removeStepsByOwner(pluginId) 批量清理
```

**c. 插件激活时拓扑排序**（按 `dependencies` 排序，检测循环依赖）。

**d. Engine 生命周期绑定到 worldStore init**：

```typescript
// worldStore init:
const engine = new WorkflowEngine()
registerBaseWorkflows(engine)
activatePlugins(plugins, engine)
set({ workflowEngine: engine })

// worldStore cleanup:
deactivatePlugins(engine)
set({ workflowEngine: null })
```

与 `_socket` 模式一致（[worldStore.ts:79](../../src/stores/worldStore.ts)），随房间创建/销毁。

---

#### 2.5.2 wrapStep 语义模糊 + 无链断裂检测

**现状**：`wrapStep` 是唯一的包装 API，wrapper 可以调 `original` 也可以不调，引擎不关心。

**风险**：意图不可见；多 wrapper 链断裂时静默丢失。

**方案：拆分 API + original 追踪**

**1. 拆分为 `wrapStep`（增强）和 `replaceStep`（替换）：**

```typescript
// 增强：签名包含 original，意图是调用它
type WrapStepFn = (ctx: WorkflowContext, original: StepFn) => Promise<void> | void

// 替换：签名不包含 original，类型系统保证无法调用
type ReplaceStepFn = (ctx: WorkflowContext) => Promise<void> | void

interface IPluginSDK {
  wrapStep(handle: WorkflowHandle<unknown>, stepId: string, options: WrapStepOptions): void
  replaceStep(handle: WorkflowHandle<unknown>, stepId: string, options: ReplaceStepOptions): void
}
```

**2. `replaceStep` 内建冲突检测**：同一 step 只允许一个 replace，第二个直接 throw。

**3. `wrapStep` 的 original 追踪（DEV warning）**：

```typescript
// engine.ts — 用 tracked 版本检测 original 是否被调用
let originalCalled = false
const trackedBase: StepFn = (c) => {
  originalCalled = true
  return meta.step.run(c)
}

// ... 构建洋葱 ...

await composed(ctx)

if (!originalCalled && import.meta.env.DEV) {
  console.warn(
    `[Workflow] Step "${meta.step.id}" has ${wrappers.length} wrapper(s), ` +
      `but original was never called. Use replaceStep() instead of wrapStep().`,
  )
}
```

**DEV warning 局限**：多层 wrapper 场景下（A → B → base），如果 A 调了 next 但 B 没调 next，warning 会触发但无法归因到具体是 B 断裂的。实际场景中 wrapper 数量极少（1-3 个），手动排查成本低，精确归因可作为后续优化。

**三层防护总结**：

| 层     | 机制                                   | 检测什么                                            |
| ------ | -------------------------------------- | --------------------------------------------------- |
| 类型层 | `replaceStep` 签名没有 `original`      | 编译期阻止替换场景误拿 original                     |
| 注册层 | `replaceStep` 同一 step 只允许一个     | 两个插件竞争替换同一 step → throw                   |
| 运行时 | `trackedBase` 检测 original 是否被调用 | `wrapStep` 的 wrapper 忘记调 original → dev warning |

---

#### 2.5.3 replaceStep 后 deactivate 无法恢复 original（Review 新增）

**现状**：`replaceStep` 直接修改 `meta.step.run`。如果替换插件被 deactivate，original function 已丢失。

**与 `wrapStep` 的区别**：`wrapStep` 不存在此问题——wrapper 是额外的层，即使 wrapper 选择不调用 `original(ctx)`，原始函数仍保存在 `meta.step.run` 上，删除 wrapper 即可恢复。而 `replaceStep` 直接覆写了 `meta.step.run`，原始引用丢失。

**方案**：`replaceStep` 时保存 original：

```typescript
meta.originalRun = meta.step.run // 保存
meta.step.run = options.run // 替换
// deactivate 时：
meta.step.run = meta.originalRun // 恢复
```

---

### 2.6 数据层

#### 2.6.1 updateTeamTracker read-then-write 竞态

**现状**：

```typescript
// src/workflow/useWorkflowSDK.ts
updateTeamTracker: (label, patch) => {
  const state = useWorldStore.getState()
  const tracker = state.teamTrackers.find((t) => t.label === label)
  if (!tracker) return
  const updates = {
    ...patch,
    ...(patch.current != null ? { current: tracker.current + patch.current } : {}),
  }
  void state.updateTeamTracker(tracker.id, updates)
}
```

**风险**：两个玩家同时掷骰，都读到 `current=3`，各自发送 `current=4`。最终结果是 4 而非 5。

**定位**：`updateTeamTracker` 本质上是**游戏数据变更**，不是副作用（UI 通知、动画等）。在未来 context 关注点分离中，它应归入数据层而非输出意图层。

**方案：语义改为 delta，服务端原子递增**

1. `ctx.updateTeamTracker('Hope', { current: 1 })` — `current` 的语义明确为 delta（+1），与现有插件代码一致
2. useWorkflowSDK 中不再做客户端加法，直接发送 delta
3. 服务端新增原子递增 API：`UPDATE team_trackers SET current = current + ? WHERE id = ?`
4. worldStore 新增 `incrementTeamTracker` action

---

## 3 延后项

### 3.1 Context 关注点分离 / 意图缓冲（待专项设计）

当前 `WorkflowContext` 混合了四类关注点：

```typescript
interface WorkflowContext {
  // 1. 共享数据 — step 之间传递状态
  data: Record<string, unknown>

  // 2. 输入型调用 — 需要返回值，必须立即执行
  serverRoll(formula: string): Promise<{ rolls: number[][]; total: number }>

  // 3. 输出意图 — 不需要返回值，修改游戏状态或产生 UI 效果
  updateEntity(id: string, patch: ...): void
  updateTeamTracker(label: string, patch: ...): void
  announce(message: string): void
  showToast(text: string, options?: ...): void
  playAnimation(animation: AnimationSpec): Promise<void>
  playSound(sound: string): void

  // 4. 流程控制
  abort(reason?: string): void
  runWorkflow(name: string, data?: ...): Promise<WorkflowResult>
}
```

**核心问题**：输出操作在当前实现中是**立即执行的 API 调用**。如果 step 调用了 `updateTeamTracker` 后又抛异常，API 已发出，无法回滚。snapshot + restore 只能回滚 `data`，不能回滚已发出的副作用。

**潜在架构演进方向：意图缓冲**

将输出操作从"立即执行"改为"缓冲意图 + workflow 结束后统一执行"：

```typescript
step.run(data: TData, fx: StepEffects): void

interface StepEffects {
  // 输入 — 立即执行（需要返回值）
  serverRoll(formula: string): Promise<{ rolls: number[][]; total: number }>

  // 输出意图 — 内部缓冲，workflow 成功后统一执行
  updateTeamTracker(label: string, patch: { current?: number }): void
  updateEntity(id: string, patch: Partial<Entity>): void
  announce(message: string): void
  showToast(text: string, options?: ToastOptions): void
  playAnimation(animation: AnimationSpec): Promise<void>
  playSound(sound: string): void

  // 流程控制
  abort(reason?: string): void
  runWorkflow<TData>(handle: WorkflowHandle<TData>, data?: Partial<TData>): Promise<WorkflowResult<TData>>
}
```

Engine 内部缓冲：non-critical step 失败时 `effectBuffer.filter(e => e.stepId !== failedStepId)` 丢弃该 step 的意图 + data snapshot restore → 完全干净的回滚。

**意图缓冲的代价**：

- 架构改动较大（step 签名变化、Engine 内部缓冲逻辑）
- 需要区分"输入型调用"和"输出意图"
- `playAnimation` 返回 `Promise<void>` — 缓冲后 `await` 会立刻 resolve，可能影响依赖动画完成时机的逻辑

**此问题需专项设计文档，不在本次生产化范围内实施。当前阶段采用 snapshot + restore 作为 data 层面的保护。**

---

### 3.2 Workflow 执行超时

如果某个 step 中的 `await` 永不 resolve，整个 workflow 挂起。建议 Phase 2+ 增加可选的 per-workflow timeout：

```typescript
defineWorkflow(name, steps, { timeoutMs?: number })
```

---

### 3.3 addStep 语义：钩子 vs 顺序

`addStep` 的 `after`/`before` 仅在注册时用于确定插入位置，之后 step 与 anchor 无关联。但实际使用中 `cos:dice-animation` after `dh:judge` 表达的是**依赖关系**。`removeStep('roll', 'dh:judge')` 后 `cos:dice-animation` 留在原位读到 undefined。

潜在方案是拆分为 `attachStep`（依附于 anchor）和 `insertStep`（仅借 anchor 定位）。由于当前插件生命周期是全量 activate/deactivate，不存在局部卸载，此问题不在本次范围内。

---

### 3.4 async wrapper 不 await original

如果 wrapper 写了 `original(ctx)` 但忘了 `await`，original 的 Promise 被丢弃。属于开发者使用问题。在 SDK 文档和 JSDoc 中明确标注 `original` 可能是 async，**必须 await**。DEV 模式下可考虑 unhandledRejection 检测。

---

### 3.5 其他低优先级问题

- **wrappers 排序时机**：每次 `wrapStep` 调用时 sort 整个数组，效率较低。实际场景 wrapper 数量极少（1-3 个），无需改动。
- **removeStep 不清理陈旧 anchor**：删除 step A 后，以 A 为 anchor 的 step B 的 `StepMeta.anchor` 仍指向 A。不影响运行（anchor 仅在注册时使用），在 §2.5.1 owner tracking 实施时顺带清理。

---

## 4 关键设计决策总结

| 决策            | 最终方案                                  | 原 Doc 21 差异                                           |
| --------------- | ----------------------------------------- | -------------------------------------------------------- |
| 类型安全        | WorkflowHandle phantom type（编译期强制） | 原方案仅泛型参数；改为 handle 替代字符串，编译器自动约束 |
| 递归深度        | getter + WeakMap（可见不可改）            | 原方案用 `_depth` 字段；改为运行时强制只读               |
| SDK/Runner 分离 | IPluginSDK + IWorkflowRunner 两个接口     | 一致                                                     |
| Engine 生命周期 | worldStore init 绑定                      | 一致                                                     |
| 错误容忍        | critical + console.error + result.errors  | 原方案 Engine 主动 toast；改为返回 errors 给调用方       |
| data 保护       | getter without setter + snapshot/restore  | 原方案无此设计；新增引用保护 + 失败回滚                  |
| context 关注点  | 意图缓冲（待专项设计）                    | 原方案无此设计；标记为未来演进方向                       |

---

## 5 改造优先级

```
┌─────────────────────────────────────────────────────┐
│ Phase 0（零风险，立即执行，建立基线）                    │
│                                                     │
│  §2.2.3 Step 列表 snapshot     ← 一行改动           │
│  §2.1.2 ctx.data getter        ← 运行时引用保护      │
│  补充测试 T-F1~T-F4（§6.1.1）   ← 建立测试基线       │
│  集成测试 wrapStep 补充断言      ← B5 修复           │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│ Phase 1（Engine 核心改造，同一 PR）                     │
│                                                     │
│  §2.2.1 depth → context 级 + getter + WeakMap       │
│  §2.3.1 Step 容错 + result.errors                    │
│  §2.1.3 Non-critical step snapshot/restore           │
│  §2.4.1 返回 WorkflowResult（浅拷贝）                 │
│  §2.5.2 wrapStep/replaceStep 拆分                    │
│  §2.4.2 abort 闭包 + mutable handler                │
│                                                     │
│  注：都改 engine.ts + types.ts，建议同一 PR           │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│ Phase 2（插件系统 + 类型安全）                          │
│                                                     │
│  §2.2.2 IPluginSDK/IWorkflowRunner 分离   ← 最先！   │
│  §2.1.1 WorkflowHandle 类型化                        │
│  §2.5.1 插件生命周期 + owner tracking                 │
│  §2.5.3 replaceStep 保存 original                    │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│ Phase 3（依赖服务端配合）                               │
│                                                     │
│  §2.6.1 updateTeamTracker 原子递增 API                │
└─────────────────────────────────────────────────────┘
```

---

## 6 验证策略

### 6.1 单元测试

| 改造项                      | 测试要点                                                                |
| --------------------------- | ----------------------------------------------------------------------- |
| §2.1.1 ctx.data 类型化      | 编译期验证：`// @ts-expect-error` 测试错误 key/类型                     |
| §2.1.2 ctx.data 引用保护    | `ctx.data = {}` 抛 TypeError                                            |
| §2.2.1 depth context 级     | 两个 workflow 并发 async，各自嵌套 9 层不触发 MAX_RECURSION_DEPTH       |
| §2.2.3 snapshot 迭代        | step 中调用 addStep → 当前执行不受影响                                  |
| §2.3.1 Step 容错            | non-critical step throw → 后续 step 仍执行 + errors 收集                |
| §2.1.3 失败回滚             | non-critical step 写入脏数据后 throw → data 恢复到 snapshot             |
| §2.4.1 WorkflowResult       | runWorkflow 返回 data（浅拷贝）+ abort 返回 reason                      |
| §2.5.1 插件生命周期         | activate → inspect → deactivate → step 已清除                           |
| §2.5.2 wrapStep/replaceStep | replaceStep 同 step 第二个 throw + wrapStep 不调 original → DEV warning |
| §2.5.3 replaceStep 恢复     | replaceStep → deactivate → 恢复 originalRun                             |
| §2.6.1 updateTeamTracker    | 两个 +1 操作最终 +2（需服务端集成测试）                                 |

### 6.1.1 Phase 0 可立即补充的测试

| 测试 | 文件                          | 场景                                                                                                      |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| T-F1 | integration.test.ts（新增）   | 使用真实 `daggerheartCorePlugin.onActivate(sdk)` + `daggerheartCosmeticPlugin.onActivate(sdk)` 全链路测试 |
| T-F2 | diceSystem.test.ts（新建）    | `dhEvaluateRoll` 边界输入：空数组、单元素 rolls                                                           |
| T-F3 | rollSteps.test.ts（新增）     | `dh:resolve` 对 judgment 缺失/type 非 daggerheart 的防御                                                  |
| T-F4 | baseWorkflows.test.ts（新增） | generate 对 formula 缺失 abort 后，display 不执行                                                         |
| B5   | integration.test.ts（修改）   | wrapStep 测试补充 `ctx.data.modifierApplied === 'auto'` 断言                                              |

### 6.2 集成测试

- 全链路：两个并发 roll workflow 执行，各自 depth 独立、TeamTracker 正确累加
- 插件卸载：deactivate 后 workflow 恢复到基座 step 列表
- 真实插件代码集成测试（T-F1）

### 6.3 端到端验证

Docker preview 中：

1. 打开角色卡 → 点击技能按钮 → 观察 workflow 完整执行
2. 两个浏览器标签同时点击 → 验证 Hope/Fear 计数器正确累加
3. 美化插件注入错误（console 手动 throw）→ 验证 workflow 不中断 + result.errors 含错误

---

## 7 关键文件清单

| 文件                             | 涉及的改造项                                            |
| -------------------------------- | ------------------------------------------------------- |
| `src/workflow/types.ts`          | §2.1.1 §2.2.2 §2.3.1 §2.4.1 §2.5.2                      |
| `src/workflow/engine.ts`         | §2.1.3 §2.2.1 §2.2.3 §2.3.1 §2.4.1 §2.4.2 §2.5.2 §2.5.3 |
| `src/workflow/context.ts`        | §2.1.1 §2.1.2 §2.2.1 §2.4.1 §2.4.2                      |
| `src/workflow/pluginSDK.ts`      | §2.1.1 §2.2.2 §2.5.1 §2.5.2                             |
| `src/workflow/baseWorkflows.ts`  | §2.1.1（导出 WorkflowHandle）                           |
| `src/workflow/useWorkflowSDK.ts` | §2.5.1 §2.6.1                                           |
| `src/rules/types.ts`             | §2.5.1（VTTPlugin 接口）                                |
| `plugins/daggerheart-core/`      | §2.1.1（使用 WorkflowHandle + 扩展类型）                |
| `plugins/daggerheart-cosmetic/`  | §2.1.1 §2.3.1（critical: false）                        |
| `src/stores/worldStore.ts`       | §2.5.1 §2.6.1                                           |
| 服务端 team-tracker 路由         | §2.6.1                                                  |
