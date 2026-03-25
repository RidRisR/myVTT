# Workflow 系统现状

> **状态**：✅ 活跃参考 | 2026-03-26
> **前置文档**：`docs/exploration/plugin-system/16~22`（探索与 POC 验证系列）
> **范围**：Workflow 引擎、Step 模型、插件协作机制、Trigger 系统、EventBus 集成

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
10. [实施状态](#10-实施状态)
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
| **实施**   | 本文档 | 基于 Doc 22 实施，实施过程中有若干偏差（见 15a）                                      |

**关键转折点**：

- Doc 18 的结论 "停止理论推演，从实践中发现扩展点" 推动了 POC 验证
- POC 验证了协作模型可行，问题不在模型本身而在工程质量
- Doc 22 将 Doc 21 延后的 `attachStep`（生命周期绑定）纳入本次实施，与 owner tracking 同期更自然
- 实施过程中 WorkflowContext 经历了重大重构——从具体方法（`announce`/`showToast`/`playAnimation`/`playSound`）转向基于 EventBus 和 GameLog 的通用机制

---

## 2 核心概念

### 2.1 Workflow

**命名的有序 Step 序列**，可选地附带 output extractor 函数。基座定义通用 workflow（如 `roll`），规则插件定义领域 workflow（如 `dh:action-check`），美化插件只添加/包装 step。

```typescript
// 基座定义 roll workflow（带 structured output）
const rollWorkflow = engine.defineWorkflow<BaseRollData, RollOutput>(
  'roll',
  [
    {
      id: 'generate',
      run: async (ctx) => {
        /* 服务端掷骰，结果写入 ctx.vars */
      },
    },
  ],
  (vars) => ({ rolls: vars.rolls ?? [], total: vars.total ?? 0 }),
)
```

经插件注册后，实际执行序列：

```
generate → dh:judge → cos:dice-animation → dh:resolve → display
           (core)     (cosmetic, readonly)   (core)
```

### 2.2 Step

**执行单元**，具有唯一 ID 和异步感知的 `run` 函数：

```typescript
interface Step<TData = Record<string, unknown>> {
  id: string
  critical?: boolean // 默认 true；false 表示失败不中断 workflow
  readonly?: boolean // 默认 false；true 表示 vars 通过 Proxy 冻结
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}
```

**约束**：`critical: false` 要求 `readonly: true`（非关键步骤必须只读，防止脏数据残留）。

### 2.3 WorkflowContext

**传递给每个 step 的运行时上下文**，提供共享数据、平台能力和流程控制：

```typescript
interface WorkflowContext<TVars = Record<string, unknown>> {
  /** Step 间共享数据。getter-only，引用替换抛 TypeError。 */
  readonly vars: TVars

  // ── Data access（命令式读取 store 数据）────────────────────
  readonly read: IDataReader

  // ── Input（需要返回值，挂起执行）─────────────────────────
  /** 服务端掷骰 — 返回完整 GameLogEntry（含 rolls） */
  serverRoll(
    formula: string,
    options?: {
      dice?: DiceSpec[]
      resolvedFormula?: string
      rollType?: string
      actionName?: string
      parentId?: string
      chainDepth?: number
      triggerable?: boolean
      visibility?: Visibility
    },
  ): Promise<GameLogEntry>
  /** 暂停 workflow，等待 UI 交互完成 */
  requestInput(interactionId: string): Promise<unknown>

  // ── Effects（副作用，fire-and-forget）─────────────────────
  /** 发射 game log 条目 */
  emitEntry(partial: {
    type: string
    payload: Record<string, unknown>
    triggerable: boolean
    parentId?: string
    chainDepth?: number
    visibility?: Visibility
  }): void
  /** 更新实体组件（通过 game log 广播） */
  updateComponent<T>(entityId: string, key: string, updater: (current: T | undefined) => T): void
  /** @deprecated — 将在 teamTracker 重新设计后移除 */
  updateTeamTracker(label: string, patch: { current?: number }): void

  // ── Events（EventBus 解耦副作用）──────────────────────────
  events: {
    emit<T>(handle: EventHandle<T>, payload: T): void
  }

  // ── Flow Control ─────────────────────────────────────────
  abort(reason?: string): void
  runWorkflow<T extends Record<string, unknown>, TOut>(
    handle: WorkflowHandle<T, TOut>,
    data?: Partial<T>,
  ): Promise<WorkflowResult<T, TOut>>
}
```

**语义分组约定**：

- **Data access**：只读查询当前 store 状态
- **Input**：需要返回值，执行期间挂起（异步等待）
- **Effects**：不需要返回值，通过 game log 或 Socket.io 产生副作用
- **Events**：通过 EventBus 发射解耦事件（UI toast、音效、动画等由订阅方处理）
- **Flow Control**：控制 workflow 执行流

**与设计文档（15）的关键偏差**：

| 设计文档 (§2.3)                     | 实际实现                          | 变化原因                               |
| ----------------------------------- | --------------------------------- | -------------------------------------- |
| `ctx.data`                          | `ctx.vars`                        | 避免与 IDataReader 混淆                |
| `serverRoll() → {rolls, total}`     | `serverRoll() → GameLogEntry`     | 需要完整 log entry（parentId, seq 等） |
| `updateEntity(id, patch)`           | `updateComponent<T>(id, key, fn)` | 组件级 updater 更精确，与 ECS 模型一致 |
| `announce()` / `showToast()` / etc. | `events.emit(handle, payload)`    | EventBus 解耦——Context 不知道 UI 实现  |
| `playAnimation()` / `playSound()`   | 同上，通过 systemEvents           | 动画/音效由订阅方处理                  |
| _(不存在)_                          | `read: IDataReader`               | step 内需要读取实体/组件状态           |
| _(不存在)_                          | `emitEntry()`                     | 通用 game log 发射（trigger 系统基础） |
| _(不存在)_                          | `requestInput(interactionId)`     | workflow 暂停等待用户交互              |

### 2.4 IDataReader

**命令式数据读取接口**，通过 `ctx.read` 暴露给 step：

```typescript
interface IDataReader {
  entity(id: string): Entity | undefined
  component<T>(entityId: string, key: string): T | undefined
  query(spec: { has?: string[] }): Entity[]
  formulaTokens(entityId: string): Record<string, number>
}
```

底层从 worldStore + identityStore 实时读取。

### 2.5 WorkflowHandle

**带 phantom type 的 handle 对象**，替代字符串实现编译期类型安全：

```typescript
interface WorkflowHandle<TData = Record<string, unknown>, TOutput = TData> {
  readonly name: string
  readonly __brand: TData // phantom type，运行时不存在
  readonly __outputBrand: TOutput // phantom type，运行时不存在
}
```

TOutput 默认等于 TData（向后兼容无 output extractor 的 workflow）。

---

## 3 类型系统

### 3.1 WorkflowHandle phantom type

`defineWorkflow` 返回带 phantom type 的 handle，`addStep` / `attachStep` 接受 handle 而非字符串：

```typescript
// Engine/SDK API
defineWorkflow<TData>(name, steps?): WorkflowHandle<TData, TData>
defineWorkflow<TData, TOutput>(name, steps, outputFn): WorkflowHandle<TData, TOutput>

// Step 操作 — TData extends TBase 由编译器自动检查
addStep<TData extends TBase, TBase>(
  handle: WorkflowHandle<TBase, any>,
  addition: StepAddition<TData>
): void
```

**分层类型声明**：

```typescript
// 基座导出
export interface BaseRollData {
  [key: string]: unknown // 索引签名允许插件扩展
  formula: string
  actorId: string
  resolvedFormula?: string
  rolls?: number[][]
  total?: number
}

// 基座导出 — structured output
export interface RollOutput {
  rolls: number[][]
  total: number
}

// 规则插件扩展
export interface DaggerheartRollData extends BaseRollData {
  judgment?: { type: 'daggerheart'; outcome: string; hopeDie: number; fearDie: number }
}
```

**实施注意**：`BaseRollData` 添加了 `[key: string]: unknown` 索引签名（设计文档未有），原因是 Daggerheart 插件需要向 `ctx.vars` 写入额外字段，索引签名使得 `BaseRollData` 兼容 `Record<string, unknown>`。

### 3.2 WorkflowResult

Discriminated union，completed 时提供 output，aborted 时 output 为 undefined：

```typescript
type WorkflowResult<TData, TOutput = TData> =
  | { status: 'completed'; data: TData; output: TOutput; errors: StepError[] }
  | { status: 'aborted'; data: TData; output: undefined; reason?: string; errors: StepError[] }

interface StepError {
  stepId: string
  error: Error
}
```

`data` 是 `ctx.vars` 的浅拷贝。`output` 由 output extractor 函数从 `data` 中提取结构化结果。

### 3.3 Structured Output

`defineWorkflow` 的第三个参数是可选的 output extractor：

```typescript
// 无 output extractor — output 等于 data 浅拷贝
const wf1 = engine.defineWorkflow<MyData>('name', steps)
// typeof wf1 = WorkflowHandle<MyData, MyData>

// 有 output extractor — output 类型独立
const wf2 = engine.defineWorkflow<BaseRollData, RollOutput>('roll', steps, (vars) => ({
  rolls: vars.rolls ?? [],
  total: vars.total ?? 0,
}))
// typeof wf2 = WorkflowHandle<BaseRollData, RollOutput>
```

嵌套 workflow 调用方通过 `result.output` 获取结构化结果：

```typescript
const result = await ctx.runWorkflow(getRollWorkflow(), { formula, actorId })
if (result.status === 'completed') {
  ctx.vars.rolls = result.output.rolls // 类型推断为 RollOutput
  ctx.vars.total = result.output.total
}
```

### 3.4 Cloneable（约定，非泛型约束）

设计文档原本计划将 `Cloneable` 作为 `TData` 的泛型约束，但因 TypeScript interface 不具有隐式索引签名（`BaseRollData` interface 无法赋值给 `Record<string, Cloneable>`），降级为约定。

实际状态：`Cloneable` 仅作为导出的文档类型，所有泛型默认值为 `Record<string, unknown>`。运行时通过 `structuredClone` 的 try/catch 降级处理（但实际上当前非关键步骤使用 readonly Proxy 而非 snapshot，structuredClone 已不在主路径上使用）。

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

这是有意的设计：abort 是"请求中止"，不是"立即中断"。

### 4.4 Step 列表与 Wrapper snapshot

执行前对 step 列表和 wrapper map 做拷贝，确保执行期间的 addStep/removeStep/replaceStep 不影响当前执行：

```typescript
// 深拷贝 StepMeta + Step 防止 replaceStep 穿透
const allSteps = record.steps.map((m) => ({ ...m, step: { ...m.step } }))
// 浅拷贝 wrapper 数组防止 push 穿透
const wrappersSnapshot = new Map<string, WrapperEntry[]>()
for (const [k, v] of record.wrappers) {
  wrappersSnapshot.set(k, [...v])
}
```

### 4.5 三阶段执行

执行分三个阶段：

```
┌─────────────────────────────────────────────────┐
│ Main Phase                                       │
│ 执行所有 phase !== 'post' 的 step（按排序顺序） │
│ 非关键步骤失败 → 收集错误 + 跳过 dependants     │
│ 关键步骤失败 → 抛异常，workflow 中断             │
│ abort → break 循环                               │
└─────────────────────────┬───────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────┐
│ Output Computation                               │
│ 如果 abort → 返回 aborted（无 output）           │
│ 否则 → dataCopy = {...ctx.vars}                  │
│       → output = outputFn(dataCopy) 或 dataCopy  │
│ outputFn 抛异常 → 返回 aborted                   │
└─────────────────────────┬───────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────┐
│ Post Phase                                       │
│ 执行所有 phase === 'post' 的 step（纯观测）      │
│ 使用 readonly context（vars 不可写）             │
│ 不影响 output（已计算完毕）                      │
│ 用途：日志记录、事件通知、UI 更新                │
└─────────────────────────────────────────────────┘
```

### 4.6 Readonly Step 与 Proxy 冻结

标记 `readonly: true` 的 step 接收冻结的 `ctx.vars`：

```typescript
const frozenVars = new Proxy(ctx.vars, {
  get: (target, key) => Reflect.get(target, key),
  set: () => {
    throw new TypeError('Cannot modify vars in a readonly step')
  },
  deleteProperty: () => {
    throw new TypeError('Cannot modify vars in a readonly step')
  },
})
```

**与设计文档的偏差**：设计文档 §6.4 描述了 `structuredClone` snapshot/restore 机制用于非关键步骤。实际实现用 `readonly: true` + Proxy 冻结替代——非关键步骤必须标记 `readonly: true`，从根本上阻止脏数据写入，无需 snapshot/restore。

**优势**：

- 零 structuredClone 开销
- 编译期可表达（`readonly: true` 是声明式的）
- 不存在 "ctx.vars 含不可克隆数据导致 structuredClone 失败" 的问题

---

## 5 Step 操作语义

### 5.1 addStep — 仅定位，无生命周期绑定

```typescript
interface StepAddition<TData> {
  id: string
  before?: string // anchor step（与 after 互斥）
  after?: string // anchor step
  priority?: number // 默认 100
  critical?: boolean // 默认 true
  readonly?: boolean // 默认 false
  phase?: 'post' // run after output computation; requires readonly: true
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}
```

### 5.2 attachStep — 定位 + 生命周期绑定

当 step 在语义上依赖另一个 step 的输出时（如 `cos:dice-animation` 依赖 `dh:judge` 的 judgment 数据），使用 `attachStep` 建立生命周期关联：

```typescript
interface AttachStepAddition<TData> {
  id: string
  to: string // 生命周期依赖目标（同时作为默认 after anchor）
  before?: string // 可选：覆盖定位（不影响 dependsOn）
  after?: string // 可选：覆盖定位
  priority?: number
  critical?: boolean
  readonly?: boolean
  phase?: 'post'
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}
```

**行为**：

- `dependsOn` 设置为 `to` 指定的 step ID
- 默认定位为 `after: to`（可通过 `before`/`after` 覆盖）
- 注册时检测循环依赖（A→B→A），检测到则 throw

**使用示例**：

```typescript
sdk.attachStep(rollWorkflow, {
  id: 'cos:dice-animation',
  to: 'dh:judge', // 依赖 dh:judge + 默认 after dh:judge
  readonly: true,
  critical: false,
  run: cosmeticDiceAnimationStep,
})
```

**级联删除**：`removeStep` 内含递归级联逻辑——移除一个 step 时，所有 `dependsOn` 指向该 step 的 step 也被移除。三种触发路径（显式调用、插件 deactivate、上游级联）都经过 `removeStep`，行为一致。

### 5.3 wrapStep — 增强（保留 original）

```typescript
type WrapStepFn = (ctx: WorkflowContext, original: StepFn) => Promise<void> | void

sdk.wrapStep(handle, stepId, {
  priority?: number,   // 默认 100，较小 → 外层
  run: WrapStepFn,
})
```

### 5.4 replaceStep — 替换（无 original）

```typescript
sdk.replaceStep(handle, stepId, {
  run: (ctx: WorkflowContext) => Promise<void> | void,
})
```

**冲突检测**：同一 step 只允许一个 replace，第二个直接 throw。

**original 保存**：replace 时保存 `originalRun`，插件 deactivate 时恢复。

### 5.5 三层防护

| 层     | 机制                                   | 检测什么                                         |
| ------ | -------------------------------------- | ------------------------------------------------ |
| 类型层 | `replaceStep` 签名没有 `original`      | 编译期阻止替换场景误拿 original                  |
| 注册层 | `replaceStep` 同一 step 只允许一个     | 两个插件竞争替换同一 step → throw                |
| 运行时 | wrapper 组合后 `original` 引用不调即丢 | `wrapStep` 的 wrapper 忘记调 original → 静默跳过 |

---

## 6 错误处理与数据保护

### 6.1 Step 容错等级

| 配置                               | 含义                                           |
| ---------------------------------- | ---------------------------------------------- |
| `critical: true`（默认）           | 失败则 workflow 中断                           |
| `critical: false, readonly: true`  | 失败被 catch，收集到 `result.errors`，继续执行 |
| `critical: false, readonly: false` | **禁止** — 注册时 throw                        |

**约定**：基座 step 和规则插件状态修改 step 默认 critical；美化插件 step 应标记 `critical: false, readonly: true`。

### 6.2 三层错误处理分离

1. **Engine 层**：non-critical step 失败 → `console.error` + 收集到 errors
2. **WorkflowResult**：`errors: StepError[]` 返回给调用方
3. **UI 层**：调用方决定是否/如何通知用户。**Engine 不主动 toast**

### 6.3 ctx.vars 引用保护

```typescript
const ctx: WorkflowContext = {
  get vars() {
    return state
  },
  // 无 setter → strict mode 下 ctx.vars = {} 抛 TypeError
  // ctx.vars.rolls = [...] 正常工作（修改属性，非替换引用）
}
```

`state` 是一个 Proxy，拦截 get/set/delete，底层操作内部 `_inner` 对象。

### 6.4 Non-critical step 数据保护

**实际实现（与设计文档 §6.4 不同）**：不使用 structuredClone snapshot/restore，而是要求 `critical: false` 必须 `readonly: true`。Readonly step 的 `ctx.vars` 通过 Proxy 冻结（set/deleteProperty 抛 TypeError），从根本上阻止脏数据写入。

```typescript
// Engine 执行 non-critical step（已简化）
if (meta.step.critical !== false) {
  await composedFn(stepCtx) // critical: 失败直接抛
} else {
  try {
    await composedFn(stepCtx) // readonly context, 无法写脏数据
  } catch (err) {
    failedSteps.add(meta.step.id)
    errors.push({ stepId: meta.step.id, error })
  }
}
```

### 6.5 dependsOn 失败传播

Non-critical step 失败时，其 dependants（包括传递依赖）被跳过。

`dependsOn` 关系在注册完成后是**静态的**，执行期间不会变化。在执行循环开始前，一次性预计算每个 step 的完整祖先集合：

```typescript
// 带 memo 的递归，计算每个 step 的全部祖先 ID 集合
const ancestorsOf = this.computeAncestors(mainSteps) // O(N)

// 执行循环中检查
const ancestors = ancestorsOf.get(meta.step.id)
if (ancestors?.size > 0) {
  for (const ancestorId of ancestors) {
    if (failedSteps.has(ancestorId)) {
      shouldSkip = true
      break
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

将 depth 和 abort 统一为 InternalState 对象，通过 `createWorkflowContext` 参数传入：

```typescript
interface InternalState {
  depth: number
  abortCtrl: { aborted: boolean; reason?: string }
}
```

**嵌套 workflow**：`ctx.runWorkflow` 继承父级 depth，创建独立 abortCtrl：

```typescript
runWorkflow: (handle, nestedData) => {
  const nestedInternal: InternalState = {
    depth: internal.depth, // 继承父级深度
    abortCtrl: { aborted: false }, // 子 workflow 独立 abort
  }
  // ...
}
```

### 7.2 IPluginSDK / IWorkflowRunner 分离

| 入口                          | 使用者                            | depth 行为                   |
| ----------------------------- | --------------------------------- | ---------------------------- |
| `IWorkflowRunner.runWorkflow` | UI 层（按钮点击）、Socket handler | depth=0，合法根节点          |
| `ctx.runWorkflow`             | step 内嵌套调用                   | 继承父级 depth，递归保护生效 |
| `IPluginSDK`                  | 插件 `onActivate` 注册阶段        | 无 runWorkflow，编译期阻止   |

### 7.3 最大递归深度

`MAX_RECURSION_DEPTH = 10`，超过时 `runWorkflow` 直接 throw。

---

## 8 插件系统集成

### 8.1 VTTPlugin 接口

```typescript
export interface VTTPlugin {
  id: string
  dependencies?: string[] // 拓扑依赖（类型已声明，排序未实施）
  onActivate(sdk: IPluginSDK): void
  onDeactivate?(sdk: IPluginSDK): void // 类型已声明，调用点未连接
}
```

### 8.2 Owner tracking

StepMeta 和 WrapperEntry 都记录 `pluginOwner`：

```typescript
interface StepMeta {
  step: Step
  anchor?: string
  direction?: 'after' | 'before'
  priority: number
  insertionOrder: number
  pluginOwner?: string // 注册此 step 的 plugin ID
  dependsOn?: string // 步骤生命周期依赖（attachStep）
  phase?: 'post' // 执行阶段
}

interface WrapperEntry {
  priority: number
  insertionOrder: number
  run: WrapStepFn
  pluginOwner?: string
}
```

### 8.3 插件 deactivation

`deactivatePlugin(pluginId)` 清理逻辑：

1. 移除该插件注册的所有 step（触发 dependsOn 级联）
2. 移除该插件注册的所有 wrapper
3. 恢复该插件 replace 的 step 的 originalRun

### 8.4 Engine 生命周期

**设计文档建议**绑定到 worldStore 的房间生命周期。**实际实现**：模块级单例 + React hook：

```typescript
// useWorkflowSDK.ts
let _engine: WorkflowEngine | null = null
let _pluginsActivated = false
let _registeredPlugins: VTTPlugin[] = []

export function getWorkflowEngine(): WorkflowEngine {
  if (!_engine) {
    _engine = new WorkflowEngine()
    registerBaseWorkflows(_engine)
  }
  return _engine
}

export function useWorkflowRunner(): IWorkflowRunner {
  // Side effect via ref guard — runs once, StrictMode safe (idempotent)
  const activatedRef = useRef(false)
  if (!activatedRef.current) {
    ensurePluginsActivated(getWorkflowEngine())
    activatedRef.current = true
  }
  return useMemo(() => new WorkflowRunner(engine, deps), [])
}
```

**已知问题**：与设计建议的 worldStore 绑定方案相比，模块级单例在房间切换时不会自动清理/重建。当前因为 POC 阶段只有单房间场景所以未暴露问题。

### 8.5 插件获取执行能力

插件通过两种途径触发 workflow：

1. **自定义 UI**：通过 `RulePlugin.surfaces` 注册 React 组件，组件内使用 `useWorkflowRunner()` hook
2. **标准化操作**：通过 `RulePlugin.diceSystem.getRollActions()` 声明 action，基座统一渲染按钮并调度 workflow

### 8.6 Trigger 系统

**设计文档未涉及，实际已实施。**

基于 game log 条目的自动化 workflow 触发：

```typescript
// src/shared/logTypes.ts
interface TriggerDefinition {
  id: string
  on: string // 匹配的 log entry type
  filter?: Record<string, unknown> // payload 浅等值匹配
  workflow: string // 要执行的 workflow 名
  mapInput: (entry: GameLogEntry) => Record<string, unknown>
  executeAs: 'triggering-executor' // 在原始执行者的客户端上运行
}
```

**TriggerRegistry**（`src/workflow/triggerRegistry.ts`）：

- 按 `entry.type` 索引 trigger 列表
- `getMatchingTriggers(entry)` 返回 filter 匹配的 trigger
- filter 为浅等值：`Object.entries(filter).every(([k, v]) => payload[k] === v)`

**LogStreamDispatcher**（`src/workflow/logStreamDispatcher.ts`）：

- 订阅 `log:new` 事件
- 跳过历史条目（`seq <= watermark`）
- 跳过 `triggerable: false` 的条目
- 级联保护（`chainDepth >= MAX_CHAIN_DEPTH`）
- 执行者路由（`executor !== localSeatId` → 跳过）
- 匹配触发器串行执行（避免竞态）

**当前局限**：

- `updateComponent` 硬编码 `triggerable: false`，组件变更无法触发后续 workflow
- `filter` 只做浅等值匹配，无法表达条件谓词
- 无临时触发器（一次性/有限次数）

### 8.7 EventBus 集成

**设计文档未涉及，实际已实施。**

解耦的事件通信机制，替代 WorkflowContext 中的具体副作用方法：

```typescript
// src/events/eventBus.ts
interface EventHandle<T> {
  key: string
  __type?: T
}

function defineEvent<T>(key: string): EventHandle<T>

class EventBus {
  on<T>(handle: EventHandle<T>, handler: (payload: T) => void): () => void
  emit<T>(handle: EventHandle<T>, payload: T): void
}

// React hook
function useEvent<T>(handle: EventHandle<T>, handler: (payload: T) => void): void
```

**系统事件**（`src/events/systemEvents.ts`）：

| Handle           | Payload 类型       | 用途          |
| ---------------- | ------------------ | ------------- |
| `toastEvent`     | `ToastPayload`     | UI toast 通知 |
| `announceEvent`  | `AnnouncePayload`  | 聊天公告      |
| `animationEvent` | `AnimationPayload` | 视觉动画      |
| `soundEvent`     | `SoundPayload`     | 音效播放      |

Workflow step 通过 `ctx.events.emit(toastEvent, { text: '...', variant: 'success' })` 发射事件，UI 组件通过 `useEvent(toastEvent, handler)` 订阅。Context 不知道 UI 实现细节。

---

## 9 数据层（不在当前实施范围）

> **注意**：以下内容仅为 POC 阶段的问题记录，不在当前 workflow 基础设施项目范围内。team tracker 将在后续独立重新设计。

### 9.1 updateTeamTracker 原子递增（已知问题，后续处理）

**问题**：read-then-write 竞态 — 两个玩家同时掷骰，都读到 `current=3`，各自发送 `current=4`，最终 4 而非 5。

**方向**：delta 语义 + 服务端原子递增。具体方案待 team tracker 重新设计时确定。

---

## 10 实施状态

### 10.1 已完成

| 改造项                     | 状态    | 说明                                         |
| -------------------------- | ------- | -------------------------------------------- |
| WorkflowEngine 核心        | ✅ 完成 | step 排序、洋葱包装、三阶段执行              |
| InternalState 注入         | ✅ 完成 | depth + abort 统一                           |
| WorkflowHandle phantom     | ✅ 完成 | 双泛型 `<TData, TOutput>`                    |
| Structured Output          | ✅ 完成 | output extractor + RollOutput                |
| Step readonly + phase      | ✅ 完成 | Proxy 冻结 + post 阶段                       |
| Non-critical 保护          | ✅ 完成 | readonly 约束替代 snapshot/restore           |
| IPluginSDK/IWorkflowRunner | ✅ 完成 | 注册/执行分离                                |
| Owner tracking             | ✅ 完成 | step + wrapper 级别                          |
| attachStep + dependsOn     | ✅ 完成 | 级联删除 + 失败传播                          |
| replaceStep + restore      | ✅ 完成 | 冲突检测 + deactivate 恢复                   |
| WorkflowContext 重构       | ✅ 完成 | vars, read, emitEntry, updateComponent, etc  |
| Trigger 系统               | ✅ 完成 | TriggerRegistry + LogStreamDispatcher        |
| EventBus 集成              | ✅ 完成 | defineEvent + useEvent + systemEvents        |
| Base workflows             | ✅ 完成 | roll (structured), quick-roll, set-selection |

### 10.2 已声明未连接

| 项目                   | 说明                                           |
| ---------------------- | ---------------------------------------------- |
| 插件拓扑排序激活       | `dependencies` 字段已添加，排序逻辑未实施      |
| `onDeactivate` 回调    | 类型已声明，实际调用点未在当前分支中连接       |
| Engine worldStore 绑定 | 设计建议绑定到房间生命周期，实际仍用模块级单例 |

### 10.3 延后项

| 项目                             | 说明                               |
| -------------------------------- | ---------------------------------- |
| Workflow 执行超时                | 可选 per-workflow timeout          |
| wrapStep original 未调用 warning | SDK 文档 + JSDoc 标注              |
| 骰子系统重构                     | 后续独立重构                       |
| 插件动态加载 / 热插拔            | 后续阶段                           |
| Team tracker 原子递增            | 后续独立重新设计                   |
| Trigger 增强                     | 条件谓词、临时触发器、组件变更触发 |

---

## 11 验证策略

### 11.1 单元测试覆盖

| 文件                      | 测试要点                                                 |
| ------------------------- | -------------------------------------------------------- |
| `engine.test.ts`          | step 排序、定位、包装、替换、级联删除、abort、三阶段执行 |
| `context.test.ts`         | vars Proxy、IDataReader、readonly 冻结、嵌套 workflow    |
| `pluginSDK.test.ts`       | SDK 委托、depth 独立、插件 deactivation、owner tracking  |
| `baseWorkflows.test.ts`   | structured output、workflow 组合                         |
| `triggerRegistry.test.ts` | trigger 匹配和过滤                                       |

### 11.2 集成测试

| 文件                   | 测试要点                                       |
| ---------------------- | ---------------------------------------------- |
| `integration.test.ts`  | daggerheart-core + daggerheart-cosmetic 全链路 |
| `cross-plugin.test.ts` | 跨插件协作、错误隔离、deactivation 影响        |

---

## 12 关键文件清单

| 文件                                  | 职责                                              |
| ------------------------------------- | ------------------------------------------------- |
| `src/workflow/types.ts`               | 所有类型定义                                      |
| `src/workflow/engine.ts`              | WorkflowEngine（排序、执行、插件生命周期）        |
| `src/workflow/context.ts`             | createWorkflowContext 工厂 + IDataReader          |
| `src/workflow/pluginSDK.ts`           | PluginSDK + WorkflowRunner                        |
| `src/workflow/baseWorkflows.ts`       | 基座 workflow（roll, quick-roll, set-selection）  |
| `src/workflow/useWorkflowSDK.ts`      | Engine 生命周期 + React hook                      |
| `src/workflow/triggerRegistry.ts`     | TriggerRegistry                                   |
| `src/workflow/logStreamDispatcher.ts` | LogStreamDispatcher（trigger 调度）               |
| `src/events/eventBus.ts`              | EventBus + defineEvent + useEvent                 |
| `src/events/systemEvents.ts`          | 系统事件定义（toast, announce, animation, sound） |
| `src/shared/logTypes.ts`              | TriggerDefinition 接口                            |
| `src/rules/types.ts`                  | VTTPlugin + RulePlugin 接口                       |
| `plugins/daggerheart-core/`           | 规则插件参考实现                                  |
| `plugins/daggerheart-cosmetic/`       | 美化插件参考实现                                  |
| `plugins/poc-ui/`                     | UI 注册插件参考实现                               |

---

## 13 审查意见

> 以下保留 15 中仍然适用的审查意见，标注已解决/已过时的。

### 13.1 ~~防止非 cloneable 数据进入 ctx.data~~ [已过时]

设计文档建议 structuredClone snapshot/restore 需要防 DataCloneError。实际实现用 readonly Proxy 替代了 snapshot/restore，此问题不再存在。

Cloneable 类型约束也因 TypeScript 限制降级为约定（见 §3.4）。

### 13.2 Engine 生命周期从 React hook 移到 worldStore [未实施]

建议仍然有效。当前模块级单例方案在房间切换场景下可能出问题。保留为后续改进项。

### 13.3 phantom type 是编译期契约 [仍然适用]

`WorkflowHandle` 的 phantom type 只在编译期有效。SDK 文档中应明确说明。

### 13.4 abort 最佳实践指导 [仍然适用]

两种合法模式：

```typescript
// abort 前决定 — abort + return，不调 original
run: async (ctx, original) => {
  if (someCondition) {
    ctx.abort('reason')
    return
  }
  await original(ctx)
}

// abort 后决定 — 先执行 original，根据结果 abort
run: async (ctx, original) => {
  await original(ctx)
  if (ctx.vars.total < threshold) ctx.abort('roll too low')
}
```

### 13.5 缺少 Workflow 生命周期观测机制 [仍然适用]

建议保留为后续改进项。

### 13.6 Step 幂等性未讨论 [仍然适用]

建议保留——SDK 文档中提醒有副作用的 step 应考虑幂等性。

### 13.7 ~~hasFailedAncestor 复杂度优化~~ [已解决]

已实施预计算方案（§6.5），O(N) memo 递归。

### 13.8 确认：设计合理的部分

以下设计决策在实施中被验证为正确：

- **InternalState 参数注入** 替代 WeakMap
- **addStep / attachStep 分离**
- **三层错误处理分离**（Engine → result → UI）
- **wrapStep / replaceStep 拆分 + 冲突检测**
- **PluginSDK / WorkflowRunner 分离**
- **Owner tracking + deactivatePlugin 清理**

### 13.9 readonly + non-critical 耦合约束 [实施中新增]

实施过程中引入的约束：`critical: false` 必须 `readonly: true`。这消除了 snapshot/restore 的需求，但也意味着非关键步骤无法修改 `ctx.vars`。对于美化插件（本来就不应该修改游戏状态）这是合理的；如果未来需要 "非关键但可写" 的步骤，需要重新评估此约束。

---

## Assumptions

- Workflow 引擎运行在客户端（浏览器），不在服务端执行。服务端仅提供数据 API（掷骰、实体更新、团队计数器）
- 每个房间同一时刻只有一个 Engine 实例（模块级单例）
- 插件在房间生命周期内只会整体 activate/deactivate，不会部分卸载单个 step
- `ctx.vars` 中的数据量很小（数十个 key）
- 插件开发者具备基本 TypeScript 能力

## Edge Cases

- **并发 workflow**：两个用户同时点击掷骰按钮 → 两个独立的 InternalState，depth 互不干扰
- **嵌套 workflow abort**：内层 abort 不影响外层；外层通过检查 `result.status === 'aborted'` 决定是否也 abort
- **dependsOn 目标不存在**：`attachStep({ to: 'nonexistent' })` 注册时 throw
- **循环 dependsOn**：A→B→A 注册时检测并 throw；预计算祖先集合时有 `computing` Set 做防御性断链
- **插件 deactivate 级联**：移除插件 A 的 step → 级联移除依赖于该 step 的其他插件 step
- **空 workflow**：`defineWorkflow('name', [])` 合法，立即返回 `{ status: 'completed', output: ..., errors: [] }`
- **全部非关键步骤失败**：workflow 仍返回 `completed`，所有错误收集在 `result.errors`
- **重复 deactivatePlugin**：幂等操作（`removeStep` 幂等）

---

## 与原始设计（15-Workflow系统设计.md）的关键偏差

> 完整偏差记录见 `docs/archive/design-history/15a-Workflow实施偏差记录.md`

| 偏差                  | 原始设计                                         | 实际实现                                                     | 状态                                        |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------- |
| Cloneable 泛型约束    | `Cloneable` 作为 `ctx.data` 的泛型约束           | 仅作为文档类型导出，泛型默认值改为 `Record<string, unknown>` | ✅ TypeScript 接口/类型兼容性导致的务实妥协 |
| BaseRollData 索引签名 | 纯 interface（仅 formula/actorId/rolls?/total?） | 添加 `[key: string]: unknown` 索引签名                       | ✅ 插件扩展字段所必需                       |
| useWorkflowSDK 保留   | PluginSDK 与 WorkflowRunner 分离                 | 一致，额外保留 `useWorkflowSDK()` 为 `@deprecated` 别名      | ✅ 渐进迁移兼容                             |
| POC 插件直接导入      | 插件通过 registry 注册，不直接导入               | `useWorkflowSDK.ts` 仍直接 import daggerheart 插件           | ⚠️ 技术债，后续插件注册表实施时替换         |
| 插件拓扑排序激活      | `dependencies` 字段用于拓扑排序                  | 字段已声明，但按数组顺序激活（未实现拓扑排序）               | ⚠️ 待完善                                   |
| `onDeactivate` 回调   | 类型已声明，插件卸载时调用                       | 类型已声明，调用点未连接                                     | ⚠️ 待完善                                   |
