# 22 — Workflow 基础设施生产化 · 最终设计

> **状态**：待实施
> **前置文档**：Doc 21（Review 修订版 — 问题识别与初步方案）
> **目标**：在 Doc 21 基础上整合严格审查结果和新增设计决策，形成可直接实施的最终设计

---

## 1 与 Doc 21 的差异摘要

| 项目                  | Doc 21 方案                   | 本文最终方案                                     | 变更原因                                     |
| --------------------- | ----------------------------- | ------------------------------------------------ | -------------------------------------------- |
| §2.2.1 递归深度       | WeakMap + getter              | **InternalState 参数注入**                       | 避免跨模块 export helper，与 getter 保护兼容 |
| §2.4.2 abort 机制     | 闭包 + mutable handler        | **InternalState 的 abortCtrl**                   | 与递归深度统一机制                           |
| §2.5.1 owner tracking | StepMeta.owner                | **StepMeta.owner + WrapperEntry.owner**          | deactivate 需同时清理 wrappers               |
| §3.1 Context 分离     | 意图缓冲（延后）              | **保持扁平 ctx + TypeScript 语义注释，不做缓冲** | 缓冲解决的问题不存在或无法完全解决           |
| §3.3 addStep 语义     | attachStep/insertStep（延后） | **attachStep（生命周期绑定）纳入本次实施**       | 与 owner tracking 同期实施更自然             |
| 新增                  | —                             | **执行时失败传播（dependsOn 链）**               | attachStep 的运行时行为                      |
| 新增                  | —                             | **structuredClone 约束文档化**                   | snapshot/restore 的前置条件                  |

---

## 2 设计方案

### 2.1 类型安全与数据保护

#### 2.1.1 WorkflowHandle phantom type（编译期强制）

**方案不变**，沿用 Doc 21 §2.1.1。

`defineWorkflow` 返回带 phantom type 的 handle，`addStep` / `attachStep` 接受 handle 而非字符串：

```typescript
interface WorkflowHandle<TData> {
  readonly name: string
  readonly __brand: TData  // phantom type，运行时不存在（interface 成员天然 ambient）
}

// Engine API
defineWorkflow<TData>(name: string, steps: Step<TData>[]): WorkflowHandle<TData>

// SDK API — TData extends TBase 由编译器自动检查
addStep<TData extends TBase, TBase>(handle: WorkflowHandle<TBase>, addition: StepAddition<TData>): void
```

**实施注意**：验证 TypeScript 推断能力 — `sdk.addStep<DaggerheartRollData>(rollWorkflow, { ... })` 应自动推断 `TBase = BaseRollData`，不需要双泛型标注。

#### 2.1.2 ctx.data getter（运行时引用保护）

**方案不变**，沿用 Doc 21 §2.1.2。

```typescript
function createWorkflowContext(deps, initialData, internal) {
  const data = { ...initialData }
  return {
    get data() {
      return data
    },
    // 无 setter → strict mode 下 ctx.data = {} 抛 TypeError
  }
}
```

#### 2.1.3 Non-critical step snapshot/restore（失败回滚）

**方案不变**，沿用 Doc 21 §2.1.3。补充两点约束。

```typescript
// composedFn = 洋葱包装后的 step 函数（见 engine.ts 执行循环）
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

**补充约束**：

1. **性能表述修正**：成功路径有 snapshot（structuredClone）开销，无 restore 开销。`ctx.data` 通常很小，开销可忽略。
2. **可序列化约束**：`ctx.data` 只应包含 structured-cloneable 类型（JSON-safe + Date/RegExp/Map/Set 等）。在 SDK 文档中明确标注。

---

### 2.2 并发安全与递归保护

#### 2.2.1 InternalState 参数注入（替代 WeakMap）

**变更方案**。将 depth 和 abort 统一为 InternalState 对象，通过 `createWorkflowContext` 参数传入。

```typescript
// engine.ts — 内部接口，不 export 给插件
interface InternalState {
  depth: number
  abortCtrl: { aborted: boolean; reason?: string }
}

// engine.ts — 内部方法，接受 InternalState
class WorkflowEngine {
  /**
   * 内部执行入口。InternalState 和 ctx 必须共享同一个 abortCtrl 引用
   * （由 createWorkflowContext 保证）。
   *
   * 公开入口通过 IWorkflowRunner 暴露（见 §2.2.2），
   * IWorkflowRunner.runWorkflow(handle, data) 内部同时创建 InternalState 和 ctx，
   * 确保两者绑定同一个 abortCtrl。
   */
  runWorkflow(name: string, ctx: WorkflowContext, internal: InternalState): Promise<WorkflowResult> {
    if (internal.depth >= MAX_RECURSION_DEPTH) throw new Error(...)
    internal.depth++
    try {
      // ... 执行循环（见 §2.3、§2.6）
    } finally {
      internal.depth--
    }
  }
}

// IWorkflowRunner — 公开执行入口（UI 层 / Socket handler 使用）
// 内部同时创建 InternalState + WorkflowContext，确保 abortCtrl 共享
class WorkflowRunner implements IWorkflowRunner {
  runWorkflow<TData>(handle: WorkflowHandle<TData>, data?: Partial<TData>): Promise<WorkflowResult<TData>> {
    const internal: InternalState = { depth: 0, abortCtrl: { aborted: false } }
    const ctx = createWorkflowContext(this.deps, data ?? {}, internal)
    return this.engine.runWorkflow(handle.name, ctx, internal)
  }
}

// context.ts — 通过参数接收，闭包访问
function createWorkflowContext(deps, initialData, internal: InternalState): WorkflowContext {
  const data = { ...initialData }
  return {
    get data() { return data },

    abort: (reason?: string) => {
      internal.abortCtrl.aborted = true
      internal.abortCtrl.reason = reason
    },

    runWorkflow: (handle, nestedData) => {
      const nestedInternal: InternalState = {
        depth: internal.depth,          // 继承父级深度
        abortCtrl: { aborted: false },  // 子 workflow 独立 abort
      }
      const nestedCtx = createWorkflowContext(deps, nestedData ?? {}, nestedInternal)
      return deps.engine.runWorkflow(handle.name, nestedCtx, nestedInternal)
    },

    // ... 其他 capability 委托
  }
}
```

**优势**：

- depth 和 abort 在同一对象中，无 WeakMap 开销
- context.ts 无需 import engine.ts 的 helper 函数
- 与 §2.1.2 的 getter 保护完全兼容
- 公开签名通过重载隐藏 internal 参数

**删除** `private currentDepth = 0`。

#### 2.2.2 SDK runWorkflow 绕过 depth 追踪

**方案不变**，沿用 Doc 21 §2.2.2。

IPluginSDK（注册 API）不含 runWorkflow。IWorkflowRunner（执行 API）供 UI 层使用。

| 入口                          | 使用者       | depth 行为                 |
| ----------------------------- | ------------ | -------------------------- |
| `IWorkflowRunner.runWorkflow` | UI 层        | depth=0，合法根节点        |
| `ctx.runWorkflow`             | step 内嵌套  | 继承父级 depth             |
| `IPluginSDK`                  | 插件注册阶段 | 无 runWorkflow，编译期阻止 |

#### 2.2.3 Step 列表 snapshot

**方案不变**，沿用 Doc 21 §2.2.3。

```typescript
const steps = [...record.steps]  // snapshot
for (const meta of steps) { ... }
```

---

### 2.3 错误处理与恢复

#### 2.3.1 Step 容错 + result.errors

**方案不变**，沿用 Doc 21 §2.3.1。

```typescript
interface Step<TData = Record<string, unknown>> {
  id: string
  critical?: boolean // 默认 true
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}

interface WorkflowResult<TData = Record<string, unknown>> {
  status: 'completed' | 'aborted'
  reason?: string
  data: TData
  errors: StepError[]
}
```

三层错误处理：Engine console.error → result.errors 收集 → UI 层决策。Engine 不主动 toast。

---

### 2.4 Workflow 执行与返回

#### 2.4.1 返回 WorkflowResult

**方案不变**，沿用 Doc 21 §2.4.1。

`runWorkflow` 返回 `WorkflowResult<TData>`，包含 data 浅拷贝、status、errors。

**注意**：浅拷贝只保护顶层 key，嵌套对象仍是共享引用。实际无害（子 workflow 已结束），在代码注释中说明。如果 step 将嵌套 workflow 的 result.data 存入父 ctx.data，应视为不可变或先深拷贝。

#### 2.4.2 abort 通过 InternalState

**变更方案**。abort 通过 InternalState 的 `abortCtrl` 管理（见 §2.2.1）。

context.ts 的 `abort()` 闭包直接操作 `internal.abortCtrl`，不需要 engine 替换 ctx 属性。消除了 Doc 21 中"引用捕获绕过"的问题。

关于 abort 在 wrapper 链中的行为，见 §3。

---

### 2.5 插件系统

#### 2.5.1 插件生命周期 + owner tracking（含 wrappers）

**方案扩展**。在 Doc 21 §2.5.1 基础上，WrapperEntry 也增加 owner：

```typescript
interface StepMeta {
  step: Step
  anchor?: string
  direction?: 'after' | 'before'
  priority: number
  insertionOrder: number
  pluginOwner?: string // 注册此 step 的 plugin ID
  dependsOn?: string // 步骤生命周期依赖（§2.6 attachStep）
}

interface WrapperEntry {
  priority: number
  insertionOrder: number
  run: WrapStepFn
  pluginOwner?: string // 注册此 wrapper 的 plugin ID（新增）
}
```

`deactivatePlugin(pluginId)` 清理逻辑：

```typescript
// 1. 移除该插件注册的所有 step（触发 dependsOn 级联，见 §2.6）
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
```

其余（VTTPlugin 接口、依赖拓扑排序、Engine 绑定 worldStore）沿用 Doc 21。

#### 2.5.2 wrapStep/replaceStep 拆分

**方案不变**，沿用 Doc 21 §2.5.2。三层防护（类型层/注册层/运行时 DEV warning）。

#### 2.5.3 replaceStep 保存 original

**方案不变**，沿用 Doc 21 §2.5.3。

---

### 2.6 Step 语义：attachStep（新增，原 Doc 21 §3.3 延后项）

#### 2.6.1 问题

`addStep` 的 `after`/`before` 仅在注册时用于定位，之后 step 与 anchor 无关联。但实际使用中 `cos:dice-animation` after `dh:judge` 表达的是**生命周期依赖**。`removeStep('dh:judge')` 后 `cos:dice-animation` 留在原位读到 undefined。

#### 2.6.2 方案：addStep / attachStep 分离

**两种注册 API**：

```typescript
interface IPluginSDK {
  // 仅定位，无生命周期绑定（现有行为）
  addStep<TData extends TBase, TBase>(
    handle: WorkflowHandle<TBase>,
    addition: StepAddition<TData>,
  ): void

  // 定位 + 生命周期绑定
  attachStep<TData extends TBase, TBase>(
    handle: WorkflowHandle<TBase>,
    addition: AttachStepAddition<TData>,
  ): void
}

interface AttachStepAddition<TData> {
  id: string
  to: string // 生命周期依赖目标（同时作为默认 after anchor）
  before?: string // 可选：覆盖定位（不影响 dependsOn）
  after?: string // 可选：覆盖定位（不影响 dependsOn）
  priority?: number
  critical?: boolean
  run: (ctx: WorkflowContext<TData>) => Promise<void> | void
}
```

`attachStep` 行为：

- `dependsOn` 设置为 `to` 指定的 step ID
- 默认定位为 `after: to`（可通过 `before`/`after` 覆盖）
- `before` 和 `after` 互斥（与 `addStep` 相同的验证规则）
- 插件 owner 自动标记

**使用示例**：

```typescript
// cosmetic 插件：dice-animation 依赖 dh:judge 的输出
sdk.attachStep(rollWorkflow, {
  id: 'cos:dice-animation',
  to: 'dh:judge', // 依赖 dh:judge + 默认 after dh:judge
  critical: false,
  run: cosmeticDiceAnimationStep,
})
```

#### 2.6.3 注册时行为：级联删除

`removeStep` 内含级联逻辑，无论触发方式：

```typescript
removeStep(workflow: string, stepId: string): void {
  const record = this.getRecord(workflow)
  const idx = record.steps.findIndex(m => m.step.id === stepId)
  if (idx === -1) return  // 已被级联移除 — 非错误
  record.steps.splice(idx, 1)
  record.wrappers.delete(stepId)

  // 级联：移除所有 dependsOn === stepId 的 step（递归）
  const dependants = record.steps
    .filter(m => m.dependsOn === stepId)
    .map(m => m.step.id)
  for (const depId of dependants) {
    this.removeStep(workflow, depId)  // 递归；若已被更深层级联移除则静默返回
  }
}
```

**注意**：`idx === -1` 时静默返回而非 throw。递归级联中，step 可能已被更深层的递归调用移除。显式调用 `removeStep` 对不存在的 step 同样静默返回（幂等语义）。

三种触发路径（显式调用、插件 deactivate、上游 dependsOn 级联）都经过 `removeStep`，级联行为一致。

#### 2.6.4 执行时行为：失败传播

non-critical step 失败时，其 dependants 被跳过：

```typescript
// engine.ts runWorkflow 执行循环
const failedSteps = new Set<string>()

for (const meta of steps) {
  // 检查 dependsOn 链上是否有失败的 step
  if (meta.dependsOn && hasFailedAncestor(meta, failedSteps, steps)) {
    // 跳过：依赖的 step 已失败
    continue
  }

  if (state.abortCtrl.aborted) break

  if (meta.step.critical !== false) {
    await composedFn(ctx) // critical：失败则 throw，workflow 中断
  } else {
    const snapshot = structuredClone(data)
    try {
      await composedFn(ctx)
    } catch (err) {
      // 恢复 data + 记录失败
      for (const k of Object.keys(data)) delete data[k]
      Object.assign(data, snapshot)
      failedSteps.add(meta.step.id) // 标记失败，dependants 将被跳过
      errors.push({ stepId: meta.step.id, error: err })
    }
  }
}

function hasFailedAncestor(meta: StepMeta, failed: Set<string>, allSteps: StepMeta[]): boolean {
  const visited = new Set<string>() // 防御循环依赖
  let current: StepMeta | undefined = meta
  while (current?.dependsOn) {
    if (visited.has(current.dependsOn)) return false // 循环检测，bail out
    visited.add(current.dependsOn)
    if (failed.has(current.dependsOn)) return true
    current = allSteps.find((m) => m.step.id === current!.dependsOn)
  }
  return false
}
```

**与 critical/non-critical 的组合**：

| owner step   | owner 结果 | dependent step 行为                        |
| ------------ | ---------- | ------------------------------------------ |
| critical     | 失败       | workflow 中断，所有后续 step 跳过          |
| non-critical | 失败       | owner 的 dependants 被跳过，其他 step 继续 |
| 任意         | 成功       | dependants 正常执行                        |

---

### 2.7 Context 语义清晰化（原 Doc 21 §3.1 延后项）

#### 2.7.1 决策：保持扁平 ctx，不引入意图缓冲

**不做缓冲的理由**：

1. **业务场景**：在设计正确的 workflow 中，验证步骤应在副作用步骤之前。"晚期 abort 需要回滚副作用"的场景实质上是 workflow 排序问题，不是基础设施问题。
2. **网络故障**：中途网络断开导致的不一致是分布式系统问题。per-workflow 缓冲也无法保护输入型调用（serverRoll 已经执行）。概率低、影响可修正。
3. **实现代价**：缓冲后 `playAnimation` 的 Promise 语义变化，step 间无法读取已缓冲的状态变更，调试困难。

**数据完整性由 snapshot/restore 保障**：non-critical step 失败时 `ctx.data` 回滚。

#### 2.7.2 方案：TypeScript 接口语义分组

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

**SDK 最佳实践文档**应明确：

- 验证/检查步骤应在副作用步骤之前
- `ctx.data` 只放 structured-cloneable 数据
- `critical: false` 适用于不影响游戏逻辑的步骤（动画、音效、通知）

---

### 2.8 数据层

#### 2.8.1 updateTeamTracker 原子递增

**方案不变**，沿用 Doc 21 §2.6.1。delta 语义 + 服务端 `current = current + ?`。

---

## 3 abort 在 wrapper 链中的行为（补充说明）

如果 wrapper 链中某一层调用 `ctx.abort()`：

1. 当前 step 的剩余 wrapper 链**仍执行完毕**（wrapper 是同步组合的，中途跳出需要 throw）
2. 下一个 step 前检查 `abortCtrl.aborted` 才会 break

这是有意的设计：abort 是"请求中止"，不是"立即中断"。如果 wrapper 需要立即停止执行，应该 throw 而非 abort。

---

## 4 延后项

- **Workflow 执行超时** — Phase 2+，可选 per-workflow timeout
- **async wrapper 不 await original** — 开发者问题，SDK 文档 + JSDoc 标注
- **wrappers 排序时机** — wrapper 数量极少，无需优化
- **意图缓冲** — 经分析确认不需要，不再作为演进方向

---

## 5 实施优先级

```
┌─────────────────────────────────────────────────────┐
│ Phase 0（零风险，立即执行）                            │
│                                                     │
│  §2.2.3 Step 列表 snapshot                           │
│  §2.1.2 ctx.data getter                              │
│  补充测试基线（T-F1~T-F4, B5）                        │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│ Phase 1（Engine 核心改造）                             │
│                                                     │
│  §2.2.1 InternalState（depth + abort 统一）           │
│  §2.3.1 Step 容错 + result.errors                    │
│  §2.1.3 Non-critical snapshot/restore                │
│  §2.4.1 返回 WorkflowResult                          │
│  §2.5.2 wrapStep/replaceStep 拆分                    │
│  §2.7.2 WorkflowContext 语义分组注释                   │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│ Phase 2（插件系统 + 类型安全 + Step 语义）              │
│                                                     │
│  §2.2.2 IPluginSDK / IWorkflowRunner 分离            │
│  §2.1.1 WorkflowHandle 类型化                        │
│  §2.5.1 插件生命周期 + owner tracking（含 wrappers）   │
│  §2.5.3 replaceStep 保存 original                    │
│  §2.6   attachStep + dependsOn 级联 + 失败传播        │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│ Phase 3（依赖服务端配合）                               │
│                                                     │
│  §2.8.1 updateTeamTracker 原子递增 API                │
└─────────────────────────────────────────────────────┘
```

---

## 6 验证策略

### 6.1 单元测试

| 改造项                    | 测试要点                                                                |
| ------------------------- | ----------------------------------------------------------------------- |
| §2.1.1 WorkflowHandle     | `@ts-expect-error` 测试错误 key/类型扩展                                |
| §2.1.2 ctx.data getter    | `ctx.data = {}` 抛 TypeError                                            |
| §2.1.3 snapshot/restore   | non-critical step 写脏数据后 throw → data 恢复                          |
| §2.2.1 InternalState      | 两个 workflow 并发 async，各自嵌套不互相干扰                            |
| §2.2.3 step 列表 snapshot | step 中 addStep → 当前执行不受影响                                      |
| §2.3.1 容错               | non-critical throw → 后续 step 仍执行 + errors 收集                     |
| §2.4.1 WorkflowResult     | 返回 data 浅拷贝 + abort 返回 reason                                    |
| §2.5.1 生命周期           | activate → inspect → deactivate → step + wrapper 已清除                 |
| §2.5.2 wrap/replace       | replaceStep 同 step 第二个 throw + wrapStep 不调 original → DEV warning |
| §2.5.3 replace 恢复       | replaceStep → deactivate → originalRun 恢复                             |
| §2.6 attachStep           | removeStep 级联 + non-critical 失败传播跳过 dependants                  |
| §2.8.1 tracker            | 两个 +1 最终 +2（需服务端集成测试）                                     |

### 6.2 集成测试

- 真实插件代码全链路（daggerheart-core + daggerheart-cosmetic）
- 两个并发 workflow，depth 独立，TeamTracker 正确累加
- 插件 deactivate → step + wrapper 清除 + dependsOn 级联

### 6.3 端到端验证

Docker preview 中：

1. 角色卡技能按钮 → workflow 完整执行
2. 两个标签同时点击 → Hope/Fear 计数器正确
3. 美化插件注入错误 → workflow 不中断 + 错误收集

---

## 7 关键文件清单

| 文件                             | 涉及改造项                                            |
| -------------------------------- | ----------------------------------------------------- |
| `src/workflow/types.ts`          | §2.1.1 §2.2.2 §2.3.1 §2.4.1 §2.5.2 §2.6 §2.7.2        |
| `src/workflow/engine.ts`         | §2.1.3 §2.2.1 §2.2.3 §2.3.1 §2.4.1 §2.5.2 §2.5.3 §2.6 |
| `src/workflow/context.ts`        | §2.1.1 §2.1.2 §2.2.1 §2.4.1 §2.7.2                    |
| `src/workflow/pluginSDK.ts`      | §2.1.1 §2.2.2 §2.5.1 §2.5.2 §2.6                      |
| `src/workflow/baseWorkflows.ts`  | §2.1.1（导出 WorkflowHandle）                         |
| `src/workflow/useWorkflowSDK.ts` | §2.5.1 §2.8.1                                         |
| `src/rules/types.ts`             | §2.5.1（VTTPlugin 接口 + onDeactivate）               |
| `plugins/daggerheart-core/`      | §2.1.1 §2.6（attachStep 使用）                        |
| `plugins/daggerheart-cosmetic/`  | §2.1.1 §2.3.1 §2.6（critical: false + attachStep）    |
| `src/stores/worldStore.ts`       | §2.5.1 §2.8.1                                         |
| 服务端 team-tracker 路由         | §2.8.1                                                |
