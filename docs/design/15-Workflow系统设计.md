# Workflow 系统设计

> **状态**：待实施
> **前置文档**：`docs/exploration/plugin-system/16~22`（探索与 POC 验证系列）
> **范围**：Workflow 引擎、Step 模型、插件协作机制、生产化改造

---

## 目录

1. [设计演进](#1-设计演进)
2. [核心概念](#2-核心概念)
3. [类型系统](#3-类型系统)
4. [引擎执行模型](#4-引擎执行模型)
5. [Step 操作语义](#5-step-操作语义)
6. [错误处理与数据保护](#6-错误处理与数据保护)
7. [并发安全与递归保护](#7-并发安全与递归保护)
8. [插件系统集成](#8-插件系统集成)
9. [数据层](#9-数据层)
10. [实施分期](#10-实施分期)
11. [验证策略](#11-验证策略)
12. [关键文件清单](#12-关键文件清单)
13. [审查意见](#13-审查意见)

---

## 1 设计演进

Workflow 系统经过 7 篇探索文档的迭代，从理论架构走向可实施的生产设计：

| 阶段       | 文档   | 核心贡献                                                                              |
| ---------- | ------ | ------------------------------------------------------------------------------------- |
| 理论架构   | Doc 16 | 三层架构（基座→规则系统→扩展插件）+ Pipeline/Stage 模型 + Component 数据模型          |
| 对标分析   | Doc 17 | 分析 FVTT 9 大架构缺陷，识别已规避 vs 未解决的问题                                    |
| 模型探索   | Doc 18 | 否定 Command+Flow 模型；发现 store action 是天然 Slot；识别可扩展性与关注点分离的悖论 |
| POC 设计   | Doc 19 | 确立 Workflow + Step 协作模型；定义 add/wrap/remove 三操作；验证规则+美化插件协作     |
| POC 实施   | Doc 20 | TDD 实现 WorkflowEngine；拆分 daggerheart-core / daggerheart-cosmetic 插件            |
| 生产化分析 | Doc 21 | 识别 10 类基础设施问题（类型安全、并发、错误处理、插件生命周期等）                    |
| 最终设计   | Doc 22 | 在 Doc 21 基础上整合审查反馈，形成可直接实施的方案                                    |

**关键转折点**：

- Doc 18 的结论 "停止理论推演，从实践中发现扩展点" 推动了 POC 验证
- POC 验证了协作模型可行，问题不在模型本身而在工程质量
- Doc 22 将 Doc 21 延后的 `attachStep`（生命周期绑定）纳入本次实施，与 owner tracking 同期更自然

---

## 2 核心概念

### 2.1 Workflow

**命名的有序 Step 序列**。基座定义通用 workflow（如 `roll`），规则插件定义领域 workflow（如 `dh:action-roll`），美化插件只添加/包装 step。

```typescript
// 基座定义 roll workflow
const rollWorkflow = engine.defineWorkflow<BaseRollData>('roll', [
  {
    id: 'generate',
    run: async (ctx) => {
      /* 服务端掷骰 */
    },
  },
  {
    id: 'display',
    run: (ctx) => {
      /* 显示结果 */
    },
  },
])
```

经插件注册后，实际执行序列：

```
generate → dh:judge → cos:dice-animation → dh:resolve → display
           (core)     (cosmetic)            (core)
```

### 2.2 Step

**执行单元**，具有唯一 ID 和异步感知的 `run` 函数：

```typescript
interface Step<TData = Record<string, unknown>> {
  id: string
  critical?: boolean // 默认 true；false 表示失败不中断 workflow
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}
```

### 2.3 WorkflowContext

**传递给每个 step 的运行时上下文**，提供共享数据、平台能力和流程控制：

```typescript
interface WorkflowContext<TData extends Record<string, unknown> = Record<string, unknown>> {
  /** Step 间共享数据。getter-only，snapshot/restore 保护。 */
  readonly data: TData

  // ── Input（需要返回值，立即执行）──────────────────────────
  serverRoll(formula: string): Promise<{ rolls: number[][]; total: number }>

  // ── Effects（副作用，fire-and-forget）─────────────────────
  updateEntity(entityId: string, patch: Partial<Entity>): void
  updateTeamTracker(label: string, patch: { current?: number }): void
  announce(message: string): void
  showToast(text: string, options?: ToastOptions): void
  playAnimation(animation: AnimationSpec): Promise<void>
  playSound(sound: string): void

  // ── Flow Control ─────────────────────────────────────────
  abort(reason?: string): void
  runWorkflow<T extends Record<string, unknown>>(
    handle: WorkflowHandle<T>,
    data?: Partial<T>,
  ): Promise<WorkflowResult<T>>
}
```

**语义分组约定**：

- **Input**：需要返回值，必须立即执行
- **Effects**：不需要返回值，产生副作用
- **Flow Control**：控制 workflow 执行流

### 2.4 WorkflowHandle

**带 phantom type 的 handle 对象**，替代字符串实现编译期类型安全（详见 §3.1）。

---

## 3 类型系统

### 3.1 WorkflowHandle phantom type

`defineWorkflow` 返回带 phantom type 的 handle，`addStep` / `attachStep` 接受 handle 而非字符串，编译器自动推断并约束类型：

```typescript
interface WorkflowHandle<TData> {
  readonly name: string
  readonly __brand: TData  // phantom type，运行时不存在（interface 成员天然 ambient）
}

// Engine API
defineWorkflow<TData>(name: string, steps: Step<TData>[]): WorkflowHandle<TData>

// SDK API — TData extends TBase 由编译器自动检查
addStep<TData extends TBase, TBase>(
  handle: WorkflowHandle<TBase>,
  addition: StepAddition<TData>
): void
```

**分层类型声明**：

```typescript
// @myvtt/sdk — 基座导出
export interface BaseRollData {
  formula: string
  actorId: string
  rolls?: number[][]
  total?: number
}

// plugins/daggerheart-core/types.ts — 规则插件扩展
export interface DaggerheartRollData extends BaseRollData {
  judgment?: { type: 'daggerheart'; outcome: string; hopeDie: number; fearDie: number }
}
```

**使用示例**：

```typescript
// 场景 1：只读取基础数据 — 零泛型标注，完全自动推断
sdk.addStep(rollWorkflow, {
  id: 'cos:animate',
  run: (ctx) => {
    ctx.data.rolls   // ✅ 自动推断为 BaseRollData
    ctx.data.foo     // ❌ 编译错误
  },
})

// 场景 2：需要写入新字段 — 声明扩展类型
sdk.addStep<DaggerheartRollData>(rollWorkflow, {
  id: 'dh:judge',
  run: (ctx) => {
    ctx.data.rolls     // ✅ 继承自 BaseRollData
    ctx.data.judgment   // ✅ 扩展字段
  },
})

// 类型不兼容 → 编译错误
sdk.addStep<{ foo: number }>(rollWorkflow, { ... })
//          ^^^^^^^^^^^^^^ ❌ 不满足 extends BaseRollData
```

**实施注意**：验证 TypeScript 推断能力 — `sdk.addStep<DaggerheartRollData>(rollWorkflow, { ... })` 应自动推断 `TBase = BaseRollData`，不需要双泛型标注。

**渐进式迁移**：泛型参数默认为 `Record<string, unknown>`，现有代码无需立即修改。

### 3.2 WorkflowResult

Workflow 执行返回结构化结果：

```typescript
interface WorkflowResult<TData = Record<string, unknown>> {
  status: 'completed' | 'aborted'
  reason?: string // abort 原因
  data: TData // 浅拷贝，切断引用
  errors: StepError[] // non-critical step 的错误集合
}

interface StepError {
  stepId: string
  error: Error
}
```

**注意**：浅拷贝只保护顶层 key，嵌套对象仍是共享引用。实际无害（子 workflow 已结束）。如果 step 将嵌套 workflow 的 result.data 存入父 ctx.data，应视为不可变或先深拷贝。

---

## 4 引擎执行模型

### 4.1 Step 排序

Step 通过 `before`/`after` anchor 和 `priority` 决定位置：

- **无 anchor**：追加到末尾，按 priority 排序
- **`after` anchor**：插入 anchor 之后的 group，按 priority 排序
- **`before` anchor**：插入 anchor 之前的 group，按 priority 排序
- **同 anchor + 同 priority**：按 `insertionOrder`（注册顺序）排序

Priority 数值越小越先执行（默认 100）。

### 4.2 洋葱包装（Wrapper Composition）

`wrapStep` 的 wrapper 按 priority 排序后构成洋葱层：

```
outerWrapper.run(ctx, () => {
  innerWrapper.run(ctx, () => {
    baseStep.run(ctx)
  })
})
```

- 较小 priority → 外层
- 每层通过调用 `original(ctx)` 进入下一层
- 不调用 `original` 则内层被跳过（应使用 `replaceStep` 而非 `wrapStep`）

### 4.3 abort 机制

abort 通过 `InternalState` 的 `abortCtrl` 管理：

```typescript
interface InternalState {
  depth: number
  abortCtrl: { aborted: boolean; reason?: string }
}
```

**abort 在 wrapper 链中的行为**：

1. 当前 step 的剩余 wrapper 链**仍执行完毕**（wrapper 是同步组合的）
2. 下一个 step 前检查 `abortCtrl.aborted` 才会 break

这是有意的设计：abort 是"请求中止"，不是"立即中断"。如果 wrapper 需要立即停止，应 throw 而非 abort。

### 4.4 Step 列表 snapshot

执行前对 step 列表做浅拷贝，确保执行期间的 addStep/removeStep 不影响当前执行：

```typescript
const steps = [...record.steps]  // snapshot
for (const meta of steps) { ... }
```

---

## 5 Step 操作语义

### 5.1 addStep — 仅定位，无生命周期绑定

```typescript
sdk.addStep<TData extends TBase, TBase>(
  handle: WorkflowHandle<TBase>,
  addition: StepAddition<TData>
): void

interface StepAddition<TData> {
  id: string
  before?: string       // anchor step（与 after 互斥）
  after?: string        // anchor step
  priority?: number     // 默认 100
  critical?: boolean    // 默认 true
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}
```

### 5.2 attachStep — 定位 + 生命周期绑定

当 step 在语义上依赖另一个 step 的输出时（如 `cos:dice-animation` 依赖 `dh:judge` 的 judgment 数据），使用 `attachStep` 建立生命周期关联：

```typescript
sdk.attachStep<TData extends TBase, TBase>(
  handle: WorkflowHandle<TBase>,
  addition: AttachStepAddition<TData>
): void

interface AttachStepAddition<TData> {
  id: string
  to: string            // 生命周期依赖目标（同时作为默认 after anchor）
  before?: string       // 可选：覆盖定位（不影响 dependsOn）
  after?: string        // 可选：覆盖定位
  priority?: number
  critical?: boolean
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}
```

**行为**：

- `dependsOn` 设置为 `to` 指定的 step ID
- 默认定位为 `after: to`（可通过 `before`/`after` 覆盖）
- 插件 owner 自动标记

**使用示例**：

```typescript
sdk.attachStep(rollWorkflow, {
  id: 'cos:dice-animation',
  to: 'dh:judge', // 依赖 dh:judge + 默认 after dh:judge
  critical: false,
  run: cosmeticDiceAnimationStep,
})
```

**级联删除**：`removeStep` 内含级联逻辑：

```typescript
removeStep(workflow: string, stepId: string): void {
  const record = this.getRecord(workflow)
  const idx = record.steps.findIndex(m => m.step.id === stepId)
  if (idx === -1) return  // 已被级联移除 — 非错误（幂等语义）
  record.steps.splice(idx, 1)
  record.wrappers.delete(stepId)

  // 级联：移除所有 dependsOn === stepId 的 step（递归）
  const dependants = record.steps
    .filter(m => m.dependsOn === stepId)
    .map(m => m.step.id)
  for (const depId of dependants) {
    this.removeStep(workflow, depId)
  }
}
```

三种触发路径（显式调用、插件 deactivate、上游 dependsOn 级联）都经过 `removeStep`，行为一致。

### 5.3 wrapStep — 增强（保留 original）

```typescript
type WrapStepFn = (ctx: WorkflowContext, original: StepFn) => Promise<void> | void

sdk.wrapStep(handle: WorkflowHandle<unknown>, stepId: string, options: {
  priority?: number   // 默认 100，较小 → 外层
  run: WrapStepFn
}): void
```

### 5.4 replaceStep — 替换（无 original）

```typescript
type ReplaceStepFn = (ctx: WorkflowContext) => Promise<void> | void

sdk.replaceStep(handle: WorkflowHandle<unknown>, stepId: string, options: {
  run: ReplaceStepFn
}): void
```

**冲突检测**：同一 step 只允许一个 replace，第二个直接 throw。

**original 保存**：replace 时保存 `meta.originalRun`，插件 deactivate 时恢复。

### 5.5 三层防护

| 层     | 机制                                   | 检测什么                                            |
| ------ | -------------------------------------- | --------------------------------------------------- |
| 类型层 | `replaceStep` 签名没有 `original`      | 编译期阻止替换场景误拿 original                     |
| 注册层 | `replaceStep` 同一 step 只允许一个     | 两个插件竞争替换同一 step → throw                   |
| 运行时 | `trackedBase` 检测 original 是否被调用 | `wrapStep` 的 wrapper 忘记调 original → DEV warning |

---

## 6 错误处理与数据保护

### 6.1 Step 容错等级

```typescript
interface Step<TData> {
  id: string
  critical?: boolean // 默认 true
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}
```

- **critical step**（默认）：失败则 workflow 中断
- **non-critical step**：失败被 catch，收集到 `result.errors`，后续 step 继续

**约定**：基座 step 和规则插件状态修改 step 默认 critical；美化插件 step 应标记 `critical: false`。

### 6.2 三层错误处理分离

1. **Engine 层**：non-critical step 失败 → `console.error` + 收集到 errors + snapshot/restore
2. **WorkflowResult**：`errors: StepError[]` 返回给调用方
3. **UI 层**：调用方决定是否/如何通知用户。**Engine 不主动 toast**

### 6.3 ctx.data 引用保护

```typescript
function createWorkflowContext(deps, initialData, internal) {
  const data = { ...initialData }
  return {
    get data() {
      return data
    },
    // 无 setter → strict mode 下 ctx.data = {} 抛 TypeError
    // ctx.data.rolls = [...] 正常工作（修改属性，非替换引用）
  }
}
```

### 6.4 Non-critical step snapshot/restore

Non-critical step 失败时回滚 `ctx.data`，防止脏数据残留：

```typescript
for (const meta of steps) {
  if (meta.step.critical !== false) {
    await composedFn(ctx)
  } else {
    const snapshot = structuredClone(data)
    try {
      await composedFn(ctx)
    } catch (err) {
      for (const k of Object.keys(data)) delete data[k]
      Object.assign(data, snapshot)
      errors.push({ stepId: meta.step.id, error: err })
    }
  }
}
```

**约束**：

- 成功路径有 `structuredClone` 开销，无 restore 开销。`ctx.data` 通常很小，开销可忽略
- `ctx.data` 只应包含 structured-cloneable 类型（JSON-safe + Date/RegExp/Map/Set 等）

### 6.5 dependsOn 失败传播

Non-critical step 失败时，其 dependants（包括传递依赖）被跳过。

`dependsOn` 关系在注册完成后是**静态的**，执行期间不会变化。因此在执行循环开始前，一次性预计算每个 step 的完整祖先集合，避免运行时重复遍历链。

#### 6.5.1 Phase 1：预计算祖先集合

```typescript
// 1. 建立 stepId → StepMeta 索引，O(N)
const stepById = new Map<string, StepMeta>()
for (const meta of steps) {
  stepById.set(meta.step.id, meta)
}

// 2. 带 memo 的递归，计算每个 step 的全部祖先 ID 集合
const ancestorsOf = new Map<string, Set<string>>()
const computing = new Set<string>() // 循环依赖防御

function getAncestors(stepId: string): Set<string> {
  if (ancestorsOf.has(stepId)) return ancestorsOf.get(stepId)!
  if (computing.has(stepId)) {
    // 循环依赖（注册时应阻止，此处防御性处理）
    const empty = new Set<string>()
    ancestorsOf.set(stepId, empty)
    return empty
  }

  computing.add(stepId)
  const meta = stepById.get(stepId)

  if (!meta?.dependsOn) {
    const empty = new Set<string>()
    ancestorsOf.set(stepId, empty)
    computing.delete(stepId)
    return empty
  }

  // 祖先集合 = parent 的祖先集合 ∪ {parent}
  const parentAncestors = getAncestors(meta.dependsOn)
  const mine = new Set(parentAncestors)
  mine.add(meta.dependsOn)
  ancestorsOf.set(stepId, mine)
  computing.delete(stepId)
  return mine
}

for (const meta of steps) {
  getAncestors(meta.step.id)
}
```

**复杂度**：O(N)。每个 step 只被实际计算一次（后续调用命中 memo）。

#### 6.5.2 Phase 2：执行循环

```typescript
const failedSteps = new Set<string>()

for (const meta of steps) {
  // 检查依赖链上是否有失败的 step — O(|ancestors|)，通常 1-2 个
  const ancestors = ancestorsOf.get(meta.step.id)
  if (ancestors && ancestors.size > 0) {
    let shouldSkip = false
    for (const ancestorId of ancestors) {
      if (failedSteps.has(ancestorId)) {
        shouldSkip = true
        break
      }
    }
    if (shouldSkip) continue
  }

  if (state.abortCtrl.aborted) break

  if (meta.step.critical !== false) {
    await composedFn(ctx)
  } else {
    const snapshot = structuredClone(data)
    try {
      await composedFn(ctx)
    } catch (err) {
      for (const k of Object.keys(data)) delete data[k]
      Object.assign(data, snapshot)
      failedSteps.add(meta.step.id)
      errors.push({ stepId: meta.step.id, error: err })
    }
  }
}
```

**组合矩阵**：

| owner step   | owner 结果 | dependent step 行为                        |
| ------------ | ---------- | ------------------------------------------ |
| critical     | 失败       | workflow 中断，所有后续 step 跳过          |
| non-critical | 失败       | owner 的 dependants 被跳过，其他 step 继续 |
| 任意         | 成功       | dependants 正常执行                        |

---

## 7 并发安全与递归保护

### 7.1 InternalState 参数注入

将 depth 和 abort 统一为 InternalState 对象，通过 `createWorkflowContext` 参数传入，替代 POC 中的实例级 `currentDepth`：

```typescript
// engine.ts — 内部接口，不 export 给插件
interface InternalState {
  depth: number
  abortCtrl: { aborted: boolean; reason?: string }
}

class WorkflowEngine {
  runWorkflow(name: string, ctx: WorkflowContext, internal: InternalState): Promise<WorkflowResult> {
    if (internal.depth >= MAX_RECURSION_DEPTH) throw new Error(...)
    internal.depth++
    try { /* 执行循环 */ }
    finally { internal.depth-- }
  }
}

// IWorkflowRunner — 公开执行入口
class WorkflowRunner implements IWorkflowRunner {
  runWorkflow<TData>(handle: WorkflowHandle<TData>, data?: Partial<TData>): Promise<WorkflowResult<TData>> {
    const internal: InternalState = { depth: 0, abortCtrl: { aborted: false } }
    const ctx = createWorkflowContext(this.deps, data ?? {}, internal)
    return this.engine.runWorkflow(handle.name, ctx, internal)
  }
}
```

**嵌套 workflow**：`ctx.runWorkflow` 继承父级 depth，创建独立 abortCtrl：

```typescript
// context.ts
runWorkflow: (handle, nestedData) => {
  const nestedInternal: InternalState = {
    depth: internal.depth, // 继承父级深度
    abortCtrl: { aborted: false }, // 子 workflow 独立 abort
  }
  const nestedCtx = createWorkflowContext(deps, nestedData ?? {}, nestedInternal)
  return deps.engine.runWorkflow(handle.name, nestedCtx, nestedInternal)
}
```

### 7.2 IPluginSDK / IWorkflowRunner 分离

防止插件通过闭包捕获 SDK 的 runWorkflow 绕过 depth 追踪：

```typescript
// 注册 API — 插件 onActivate 时使用，无 runWorkflow
export interface IPluginSDK {
  addStep<TData extends TBase, TBase>(
    handle: WorkflowHandle<TBase>,
    addition: StepAddition<TData>,
  ): void
  attachStep<TData extends TBase, TBase>(
    handle: WorkflowHandle<TBase>,
    addition: AttachStepAddition<TData>,
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

| 入口                          | 使用者                            | depth 行为                   |
| ----------------------------- | --------------------------------- | ---------------------------- |
| `IWorkflowRunner.runWorkflow` | UI 层（按钮点击）、Socket handler | depth=0，合法根节点          |
| `ctx.runWorkflow`             | step 内嵌套调用                   | 继承父级 depth，递归保护生效 |
| `IPluginSDK`                  | 插件 `onActivate` 注册阶段        | 无 runWorkflow，编译期阻止   |

---

## 8 插件系统集成

### 8.1 VTTPlugin 接口

```typescript
export interface VTTPlugin {
  id: string
  dependencies?: string[]
  onActivate(sdk: IPluginSDK): void
  onDeactivate?(sdk: IPluginSDK): void
}
```

### 8.2 Owner tracking

StepMeta 和 WrapperEntry 都记录 owner：

```typescript
interface StepMeta {
  step: Step
  anchor?: string
  direction?: 'after' | 'before'
  priority: number
  insertionOrder: number
  pluginOwner?: string // 注册此 step 的 plugin ID
  dependsOn?: string // 步骤生命周期依赖（attachStep）
}

interface WrapperEntry {
  priority: number
  insertionOrder: number
  run: WrapStepFn
  pluginOwner?: string // 注册此 wrapper 的 plugin ID
}
```

### 8.3 插件 deactivation

`deactivatePlugin(pluginId)` 清理逻辑：

```typescript
// 1. 移除该插件注册的所有 step（触发 dependsOn 级联）
const ownedSteps = record.steps.filter((m) => m.pluginOwner === pluginId)
for (const m of ownedSteps) {
  this.removeStep(workflow, m.step.id) // 内含级联逻辑
}

// 2. 移除该插件注册的所有 wrapper
for (const [stepId, entries] of record.wrappers) {
  record.wrappers.set(
    stepId,
    entries.filter((e) => e.pluginOwner !== pluginId),
  )
}

// 3. 恢复该插件 replace 的 step 的 originalRun
```

### 8.4 Engine 生命周期

Engine 绑定到 worldStore init/cleanup，随房间创建/销毁：

```typescript
// worldStore init:
const engine = new WorkflowEngine()
registerBaseWorkflows(engine)
activatePlugins(plugins, engine) // 拓扑排序按 dependencies
set({ workflowEngine: engine })

// worldStore cleanup:
deactivatePlugins(engine)
set({ workflowEngine: null })
```

### 8.5 插件获取执行能力

插件通过两种途径触发 workflow：

1. **自定义 UI**：通过 `RulePlugin.surfaces` 注册 React 组件，组件内使用 `useWorkflowRunner()` hook
2. **标准化操作**：通过 `RulePlugin.diceSystem.getRollActions()` 声明 action，基座统一渲染按钮并调度 workflow

---

## 9 数据层

### 9.1 updateTeamTracker 原子递增

**问题**：read-then-write 竞态 — 两个玩家同时掷骰，都读到 `current=3`，各自发送 `current=4`，最终 4 而非 5。

**方案**：

1. `ctx.updateTeamTracker('Hope', { current: 1 })` — `current` 语义改为 delta（+1）
2. 客户端不再做加法，直接发送 delta
3. 服务端原子递增：`UPDATE team_trackers SET current = current + ? WHERE id = ?`
4. worldStore 新增 `incrementTeamTracker` action

---

## 10 实施分期

```
┌─────────────────────────────────────────────────────┐
│ Phase 0（零风险，立即执行）                            │
│                                                     │
│  Step 列表 snapshot（一行改动）                       │
│  ctx.data getter（运行时引用保护）                     │
│  补充测试基线（T-F1~T-F4, B5）                        │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│ Phase 1（Engine 核心改造）                             │
│                                                     │
│  InternalState 注入（depth + abort 统一）              │
│  Step 容错 + result.errors                           │
│  Non-critical snapshot/restore                       │
│  返回 WorkflowResult                                 │
│  wrapStep/replaceStep 拆分                           │
│  WorkflowContext 语义分组注释                          │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│ Phase 2（插件系统 + 类型安全 + Step 语义）              │
│                                                     │
│  IPluginSDK / IWorkflowRunner 分离    ← 最先！       │
│  WorkflowHandle 类型化                               │
│  插件生命周期 + owner tracking（含 wrappers）          │
│  replaceStep 保存 original                           │
│  attachStep + dependsOn 级联 + 失败传播               │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│ Phase 3（依赖服务端配合）                               │
│                                                     │
│  updateTeamTracker 原子递增 API                       │
└─────────────────────────────────────────────────────┘
```

---

## 11 验证策略

### 11.1 单元测试

| 改造项             | 测试要点                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| WorkflowHandle     | `@ts-expect-error` 测试错误 key/类型扩展                                |
| ctx.data getter    | `ctx.data = {}` 抛 TypeError                                            |
| snapshot/restore   | non-critical step 写脏数据后 throw → data 恢复                          |
| InternalState      | 两个 workflow 并发 async，各自嵌套不互相干扰                            |
| step 列表 snapshot | step 中 addStep → 当前执行不受影响                                      |
| Step 容错          | non-critical throw → 后续 step 仍执行 + errors 收集                     |
| WorkflowResult     | 返回 data 浅拷贝 + abort 返回 reason                                    |
| 插件生命周期       | activate → inspect → deactivate → step + wrapper 已清除                 |
| wrap/replace       | replaceStep 同 step 第二个 throw + wrapStep 不调 original → DEV warning |
| replace 恢复       | replaceStep → deactivate → originalRun 恢复                             |
| attachStep         | removeStep 级联 + non-critical 失败传播跳过 dependants                  |
| tracker            | 两个 +1 最终 +2（需服务端集成测试）                                     |

### 11.2 集成测试

- 真实插件代码全链路（daggerheart-core + daggerheart-cosmetic）
- 两个并发 workflow，depth 独立，TeamTracker 正确累加
- 插件 deactivate → step + wrapper 清除 + dependsOn 级联

### 11.3 端到端验证

Docker preview 中：

1. 角色卡技能按钮 → workflow 完整执行
2. 两个标签同时点击 → Hope/Fear 计数器正确
3. 美化插件注入错误 → workflow 不中断 + 错误收集

---

## 12 关键文件清单

| 文件                             | 涉及改造项                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `src/workflow/types.ts`          | WorkflowHandle、IPluginSDK/IWorkflowRunner、Step critical、WorkflowResult、attachStep  |
| `src/workflow/engine.ts`         | InternalState、snapshot/restore、Step 容错、wrapStep/replaceStep 拆分、attachStep 级联 |
| `src/workflow/context.ts`        | ctx.data getter、InternalState 闭包、abort、语义分组                                   |
| `src/workflow/pluginSDK.ts`      | 类型绑定、owner tracking、SDK/Runner 分离                                              |
| `src/workflow/baseWorkflows.ts`  | 导出 WorkflowHandle                                                                    |
| `src/workflow/useWorkflowSDK.ts` | 插件生命周期、updateTeamTracker                                                        |
| `src/rules/types.ts`             | VTTPlugin 接口 + onDeactivate                                                          |
| `plugins/daggerheart-core/`      | WorkflowHandle 使用、attachStep                                                        |
| `plugins/daggerheart-cosmetic/`  | critical: false、attachStep                                                            |
| `src/stores/worldStore.ts`       | Engine 生命周期绑定、incrementTeamTracker                                              |
| 服务端 team-tracker 路由         | 原子递增 API                                                                           |

---

## 13 审查意见

> 以下是对 Doc 21、Doc 22 及当前代码实现的审查意见。

### 13.1 防止非 cloneable 数据进入 ctx.data

Doc 22 §2.1.3 提到 "ctx.data 只应包含 structured-cloneable 类型"，但缺少强制机制。如果插件在 `ctx.data` 中放入函数、DOM 节点等不可克隆的对象，`structuredClone` 会抛 `DataCloneError`，且此错误发生在 **snapshot 阶段**（step 执行之前），导致整个 workflow 因一个 non-critical step 的 snapshot 而崩溃。

**方案：编译期类型约束为主，运行时 try/catch 为辅**

**编译期**：定义 `Cloneable` 类型约束 TData，阻止大部分误用：

```typescript
type Cloneable =
  | string | number | boolean | null | undefined
  | Date | RegExp
  | Map<Cloneable, Cloneable> | Set<Cloneable>
  | Cloneable[]
  | { [key: string]: Cloneable }

// defineWorkflow 的泛型约束
defineWorkflow<TData extends Record<string, Cloneable>>(...)
```

这样如果插件声明 `interface MyData { callback: () => void }`，编译器直接报错。实际场景中 ctx.data 传递的都是游戏数据（骰子结果、判定、actor ID），天然 JSON-safe，类型约束能覆盖绝大多数场景。

**编译期的边界**：`as any` 可以绕过；递归类型可能有 TS 性能问题（需实际验证深度嵌套的情况）。

**运行时**：无法低成本拦截每次属性写入（需要 Proxy，开销不值得）。保留 `structuredClone` 的 try/catch 作为最后防线——clone 失败时降级为"不保护"模式：

```typescript
let snapshot: TData | null = null
try {
  snapshot = structuredClone(data)
} catch (cloneErr) {
  console.warn(`[Workflow] Cannot snapshot ctx.data for step "${meta.step.id}": ${cloneErr}`)
}
try {
  await composedFn(ctx)
} catch (err) {
  if (snapshot) {
    /* restore */
  }
  errors.push({ stepId: meta.step.id, error: err })
}
```

### 13.2 Engine 生命周期从 React hook 移到 worldStore

**问题**：当前 `_pluginsActivated` 是模块级 boolean，Engine 通过 `getWorkflowEngine()` 返回模块级单例。初始化逻辑（创建 Engine、激活插件）藏在 `useWorkflowSDK()` hook 里，由 React 渲染触发。React StrictMode 双重调用、组件 unmount/remount、房间切换都可能导致时序混乱。

**方案：绑定到 worldStore 的房间生命周期**

worldStore 已有明确的 init/cleanup 生命周期（跟随 Socket.io 连接），与 `_socket` 模式一致：

```typescript
// worldStore.ts
interface WorldState {
  // ... 现有状态
  workflowEngine: WorkflowEngine | null
  workflowRunner: IWorkflowRunner | null
}

// 房间初始化时（已有明确触发点）
async function initRoom(roomId: string) {
  // ... 现有 init 逻辑（socket、数据加载等）
  const engine = new WorkflowEngine()
  registerBaseWorkflows(engine)
  const plugins = resolvePlugins(roomConfig) // 按 dependencies 拓扑排序
  for (const p of plugins) p.onActivate(new PluginSDK(engine, p.id))
  const runner = new WorkflowRunner(engine, deps)
  set({ workflowEngine: engine, workflowRunner: runner })
}

// 房间清理时
function cleanupRoom() {
  const { workflowEngine } = get()
  if (workflowEngine) deactivateAllPlugins(workflowEngine)
  set({ workflowEngine: null, workflowRunner: null })
}
```

Hook 变成纯读取器，零副作用：

```typescript
// useWorkflowRunner.ts — StrictMode 安全
export function useWorkflowRunner(): IWorkflowRunner | null {
  return useWorldStore((state) => state.workflowRunner)
}
```

**解决效果**：

| 问题                 | 解决方式                                           |
| -------------------- | -------------------------------------------------- |
| StrictMode 双重调用  | hook 是纯 selector，调用多少次都无副作用           |
| 组件 unmount/remount | Engine 在 store 里，不受组件生命周期影响           |
| 房间切换             | cleanupRoom 销毁旧 Engine + initRoom 创建新 Engine |
| 模块级变量           | 不再需要 `_pluginsActivated`，状态全在 store 内    |

### 13.3 phantom type 是编译期契约

`WorkflowHandle` 的 phantom type 只在编译期有效。JavaScript 运行时可以构造 `{ name: 'roll', __brand: null as any }` 绕过类型检查。这不是 bug（TypeScript 品牌类型的固有限制），但 SDK 文档中应明确说明这是 **编译期契约** 而非运行时保障，避免开发者产生错误的安全假设。

### 13.4 abort 最佳实践指导缺失

Doc 22 §3 说明 abort 是"请求中止"而非"立即中断"——当前 step 的剩余 wrapper 链仍会执行完毕，下一个 step 前才检查 `abortCtrl.aborted`。这个语义是正确的，因为 abort 存在两种合法场景：

1. **abort 前决定**：在调用 `original` 之前就知道要中止 → 不调 original，直接 return
2. **abort 后决定**：先执行 `original`，根据执行结果决定中止 → original 已执行完毕无法撤回，abort 只影响后续 step

```typescript
// 场景 1：abort 前决定 — abort + return，不调 original
run: async (ctx, original) => {
  if (someCondition) {
    ctx.abort('reason')
    return
  }
  await original(ctx)
}

// 场景 2：abort 后决定 — 先执行 original，根据结果 abort
run: async (ctx, original) => {
  await original(ctx) // 已执行完毕，无法撤回
  if (ctx.data.total < threshold) {
    ctx.abort('roll too low') // 只影响后续 step
  }
}
```

**建议**：在 SDK 文档中明确两种模式，并强调：abort 前决定时，**不要在 abort 之后继续调用 `original(ctx)`**（那会导致 inner wrappers 和 base step 白白执行）。

### 13.5 缺少 Workflow 生命周期观测机制

没有机制让外部（调试工具、日志系统、性能监控）观测 workflow 的开始/结束/step 执行/错误事件。在生产环境中，这对问题排查和性能优化非常重要。

**建议**：Phase 2+ 考虑添加可选的 lifecycle observer（纯观测，不影响执行）：

```typescript
engine.addObserver({
  onWorkflowStart(name: string, data: unknown): void
  onStepStart(workflowName: string, stepId: string): void
  onStepEnd(workflowName: string, stepId: string, error?: Error): void
  onWorkflowEnd(name: string, result: WorkflowResult): void
})
```

### 13.6 Step 幂等性未讨论

如果网络超时后用户重试，或 workflow 在某些场景被重复触发，调用 `updateEntity` 或 `updateTeamTracker` 的 step 可能双重生效。当前设计未讨论 step 的幂等性。

**建议**：至少在 SDK 最佳实践文档中提醒——有副作用的 step 应考虑幂等性。长期可考虑 workflow 级别的 execution ID 去重机制。

### 13.7 hasFailedAncestor 复杂度优化

Doc 22 §2.6.4 的 `hasFailedAncestor` 对每个有 `dependsOn` 的 step 都从当前节点向上遍历整条祖先链，同一链上的多个 step 会重复遍历相同路径，总复杂度 O(N × D)。

`dependsOn` 关系在注册完成后是静态的，执行期间不会变化。**本文档 §6.5 已采用预计算方案替换原算法**：执行前用带 memo 的递归一次性构建每个 step 的完整祖先 Set（O(N)），执行时每个 step 的依赖检查降为遍历其祖先 Set（通常 1-2 个元素，近似 O(1)）。

|        | 预计算         | 每 step 运行时检查         | 空间     |
| ------ | -------------- | -------------------------- | -------- |
| 原算法 | 无             | O(D) 遍历链，无 memo       | O(1)     |
| 优化后 | O(N) memo 递归 | O(\|ancestors\|)，通常 1-2 | O(N × D) |

### 13.8 确认：设计合理的部分

- **InternalState 参数注入** 替代 WeakMap：依赖关系更清晰，更易测试
- **addStep / attachStep 分离**：语义明确，解决了 POC 中 `cos:dice-animation` 依赖 `dh:judge` 的实际问题
- **三层错误处理分离**（Engine → result → UI）：职责清晰，Engine 不越权做 UI 决策
- **wrapStep / replaceStep 拆分 + 三层防护**：防误用设计到位，编译/注册/运行时三层覆盖
- **实施分期** 从零风险到高风险递进：Phase 0 建立安全基线，合理

---

## Assumptions

- Workflow 引擎运行在客户端（浏览器），不在服务端执行。服务端仅提供数据 API（掷骰、实体更新、团队计数器）
- 每个房间同一时刻只有一个 Engine 实例，不存在多 Engine 并发
- 插件数量有限（通常 2-5 个），step 总数 < 20，依赖链深度 ≤ 3 层
- 插件在房间生命周期内只会整体 activate/deactivate，不会部分卸载单个 step
- `ctx.data` 中的数据量很小（数十个 key），structuredClone 开销可忽略
- 插件开发者具备基本 TypeScript 能力，能理解泛型约束和 phantom type

## Edge Cases

- **并发 workflow**：两个用户同时点击掷骰按钮 → 两个独立的 InternalState，depth 互不干扰。TeamTracker 竞态由服务端原子递增解决
- **嵌套 workflow abort**：内层 workflow abort 不影响外层；外层通过检查 `result.status === 'aborted'` 决定是否也 abort
- **dependsOn 目标不存在**：`attachStep({ to: 'nonexistent' })` 应在注册时 throw（与 addStep 的 anchor 验证一致）
- **循环 dependsOn**：A→B→A 的循环依赖在注册时应检测并 throw；预计算祖先集合时有 `computing` Set 做防御性断链
- **插件 deactivate 级联**：移除插件 A 的 step → 级联移除依赖于该 step 的其他插件 step。跨插件级联是预期行为（如 cosmetic 插件依赖 core 插件的 step）
- **non-critical step 中 structuredClone 失败**：ctx.data 含不可克隆数据 → snapshot 降级为 null，step 失败时无法 restore 但 workflow 不崩溃
- **wrapper 链中 abort**：外层 wrapper abort 后，当前 step 的剩余 wrapper 仍执行完毕；下一个 step 前才检查 abortCtrl

---

## 延后项

| 项目                            | 说明                                                   |
| ------------------------------- | ------------------------------------------------------ |
| Workflow 执行超时               | Phase 2+，可选 per-workflow timeout                    |
| async wrapper 不 await original | 开发者问题，SDK 文档 + JSDoc 标注                      |
| 意图缓冲                        | 经分析确认不需要（见 Doc 22 §2.7.1），不再作为演进方向 |
| 骰子系统重构                    | 后续独立重构                                           |
| playAnimation / playSound 实现  | 美化系统范畴                                           |
| 插件动态加载 / 热插拔           | Phase 2/3                                              |
