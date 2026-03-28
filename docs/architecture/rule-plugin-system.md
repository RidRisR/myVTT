# 插件系统架构

## 概述

myVTT 的骨架（场景、实体、Token、聊天）不绑定任何 TRPG 规则。规则通过两层插件接口注入：

- **RulePlugin**：声明式 UI 适配层 — 角色卡、骰子系统、数据模板、UI 表面
- **VTTPlugin**：命令式逻辑层 — 通过 Workflow SDK 注入业务规则步骤

每个房间在创建时选择一个规则系统（`room_state.rule_system_id`），之后不可切换。当前阶段插件与基座一起编译，通过静态注册表加载。

---

## 核心架构模型

### 三层结构

```
┌─────────────────────────────────────────────────────────────┐
│  Plugin 层（可插拔）                                         │
│                                                              │
│  RulePlugin: UI 适配                  VTTPlugin: 逻辑注入    │
│  ├─ adapters (数据→视图)              ├─ sdk.addStep()       │
│  ├─ characterUI (角色卡)              ├─ sdk.attachStep()    │
│  ├─ diceSystem (骰子)                 ├─ sdk.wrapStep()      │
│  ├─ dataTemplates (模板)              ├─ sdk.replaceStep()   │
│  ├─ surfaces (面板/Tab)               └─ sdk.ui.register()   │
│  └─ hideElements                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│  Engine 层（永远存在，不可卸载）                               │
│                                                              │
│  WorkflowEngine          EventBus           IDataReader       │
│  ├─ defineWorkflow()     ├─ defineEvent()   ├─ entity()       │
│  ├─ runWorkflow()        ├─ emit()          ├─ component()    │
│  └─ base workflows:      └─ on()            ├─ query()        │
│     ├─ roll              (→ RollOutput)     └─ formulaTokens()│
│     ├─ quick-roll        (compose roll + display)             │
│     └─ core:set-selection                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│  Data 层（zustand store + REST + Socket.io）                 │
│                                                              │
│  worldStore: Entity/Scene/Token CRUD + 网络同步              │
│  sessionStore: 本地 UI 状态（selection, pendingInteraction） │
└─────────────────────────────────────────────────────────────┘
```

### 关键设计原则

1. **Plugin 层只管逻辑，不管通信** — 插件通过 `ctx.updateComponent()` 写数据，底层的 REST/Socket 对插件完全透明
2. **Engine 层是公共基础设施** — base workflows 不是插件，永远存在，任何代码可直接 import 使用
3. **Data 层负责网络和状态同步** — Store actions 处理 REST 调用、乐观更新、Socket 广播、错误回退

---

## 四条数据交互通路

```
┌───────────────────────────────────────────────────────┐
│                   Plugin Component                     │
│                                                        │
│  ① read: entity/component/query   ←── 读取当前状态    │
│  ② workflow: runner.runWorkflow()  ──→ 提交用户操作    │
│  ③ dnd: onDrop → workflow.run()   ──→ 拖拽触发操作    │
│  ④ events: useEvent(handle)       ←── 监听副作用      │
└───────────────────────────────────────────────────────┘
```

| 通路     | 方向                 | 机制                                          | 用途            |
| -------- | -------------------- | --------------------------------------------- | --------------- |
| ① 读取   | Data → UI            | `ctx.read` / `useEntity()` / `useComponent()` | 渲染数据        |
| ② 写入   | UI → Workflow → Data | `runner.runWorkflow(handle, data)`            | 业务操作        |
| ③ 拖拽   | UI → DnD → Workflow  | `onDrop` → `runner.runWorkflow()`             | 拖拽触发操作    |
| ④ 副作用 | Workflow → UI        | `ctx.events.emit()` → `useEvent()`            | Toast/动画/音效 |

**禁止的交互**：

- 组件直接修改其他组件
- Workflow 直接调用组件方法
- 插件直接调用 store action（应通过 workflow）

---

## Workflow 系统

### WorkflowEngine

Workflow 是有序步骤管线。Engine 负责步骤注册、排序、执行和插件生命周期管理。

```typescript
// 定义 workflow，返回类型安全的 handle（无 output extractor → output = vars）
const simpleWorkflow = engine.defineWorkflow<MyData>('simple', [{ id: 'step1', run: stepFn }])

// 定义 workflow 带 output extractor（第三参数）→ 结构化返回
const rollWorkflow = engine.defineWorkflow<BaseRollData, RollOutput>(
  'roll',
  [{ id: 'generate', run: generateStep }],
  (vars) => ({ rolls: vars.rolls!, total: vars.total! }),
)

// UI 层通过 runner 执行
const result = await runner.runWorkflow(getQuickRollWorkflow(), {
  formula: '2d12',
  actorId: 'char-01',
})
// result.status === 'completed' → result.output 有值
// result.status === 'aborted'   → result.output === undefined
```

### WorkflowContext

每次 `runWorkflow` 创建独立的 context，提供步骤间共享状态和副作用能力：

```typescript
interface WorkflowContext<TVars> {
  // ── 步骤间共享数据 ──
  readonly vars: TVars // Proxy，readonly step 时 set/delete 抛 TypeError

  // ── 数据读取（只读） ──
  readonly read: IDataReader // entity(), component<T>(), query({ has }), formulaTokens()

  // ── Input（需要返回值） ──
  serverRoll(formula: string, options?: {
    dice?: DiceSpec[]           // pre-parsed dice specs
    resolvedFormula?: string    // formula with @-tokens resolved
    rollType?: string           // plugin-defined roll type tag
    actionName?: string         // display name for the action
    parentId?: string           // parent log entry (for chaining)
    chainDepth?: number         // cascade depth counter
    triggerable?: boolean       // whether triggers can fire on this roll
    visibility?: Visibility     // public | include | exclude
  }): Promise<GameLogEntry>     // full log entry with rolls in payload
  requestInput(interactionId): Promise<unknown> // 暂停执行等待 UI 输入

  // ── Effects（副作用） ──
  emitEntry(partial: {
    type: string
    payload: Record<string, unknown>
    triggerable: boolean
    parentId?: string
    chainDepth?: number
    visibility?: Visibility
  }): void                                     // fire-and-forget log entry emission
  updateComponent<T>(entityId, key, updater): void // 原子更新 entity 组件
  updateTeamTracker(label, patch): void // @deprecated

  // ── Events（解耦副作用） ──
  events: { emit<T>(handle, payload): void }

  // ── Flow Control ──
  abort(reason?): void
  runWorkflow<T, TOut>(handle, data?): Promise<WorkflowResult<T, TOut>> // 嵌套 workflow
}
```

### WorkflowResult（判别式联合）

```typescript
// status === 'completed' → output: TOutput
// status === 'aborted'   → output: undefined, reason?: string
type WorkflowResult<TData, TOutput = TData> =
  | { status: 'completed'; data: TData; output: TOutput; errors: StepError[] }
  | { status: 'aborted'; data: TData; output: undefined; reason?: string; errors: StepError[] }
```

调用方必须先检查 `status` 才能访问 `output`，TypeScript narrowing 自动保证类型安全。
Output extractor 失败时也归为 `aborted`（`stepId: '__output__'`）。

```

### 步骤排序

步骤通过 `before`/`after` 锚点和 `priority`（数字越小越靠前，默认 100）排序。

**组合模式示例**：`dh:action-check` 是插件自定义 workflow，内部组合 base `roll` workflow：

```

dh:action-check workflow（daggerheart-core 定义）:
roll ← 调用 base roll workflow，获取 RollOutput
↓
dh:judge ← 判定 Hope/Fear
↓
cos:dice-animation (attached to: dh:judge) ← daggerheart-cosmetic 注入
↓
dh:resolve ← 更新 team tracker
↓
display ← 显示结果

base roll workflow（不被 Daggerheart 污染）:
generate ← 纯掷骰，返回 { rolls, total }

```

### Readonly Step 与 Post Phase

步骤有两个独立维度：`readonly`（vars 访问权限）和 `critical`（错误处理）。

| 组合 | 语义 | 用例 |
|------|------|------|
| `readonly: false, critical: true` | 正常步骤（默认） | roll, judge, resolve |
| `readonly: true, critical: true` | 只读但失败中断 | 广播（读 vars 发送到聊天，失败要中断） |
| `readonly: true, critical: false` | 只读且失败不中断 | cosmetic 动画、音效、日志 |
| `readonly: false, critical: false` | **禁止** | 引擎注册时 throw |

**Readonly 步骤**通过 frozen Proxy 在运行时强制 vars 只读（set/delete 抛 TypeError），因此可安全跨 workflow 边界插入。

**Post Phase**：readonly 步骤可声明 `phase: 'post'`，在 output 计算之后执行：

```

Workflow 执行流程:
① 普通步骤 + inline readonly steps 顺序执行
② 计算 output（outputFn）
③ post phase — readonly steps（保证看到最终结果）
④ 返回 result

````

```typescript
sdk.addStep(workflow, {
  id: 'cos:dice-animation',
  readonly: true,
  phase: 'post',  // 在 output 计算后执行
  run: (ctx) => {
    ctx.events.emit(animationEvent, { rolls: ctx.vars.rolls })
  },
})
````

### 错误处理

| Step 类型                         | 失败行为                                                   |
| --------------------------------- | ---------------------------------------------------------- |
| `critical: true`（默认）          | 失败 → workflow 立即中断                                   |
| `readonly: true, critical: false` | 失败 → 收集错误，继续执行后续步骤（无需 snapshot/restore） |

Non-critical step 失败时，通过 `dependsOn` 链标记的依赖步骤也会被跳过。

### Vars 契约

workflow 的 `WorkflowHandle<TData>` 中 `TData` 声明的字段是**公共契约**。步骤如需添加非契约数据，使用 `pluginId:name` 命名空间约定：

```typescript
ctx.vars.formula // string — 公共契约，所有步骤可依赖
ctx.vars.rolls // number[][] — 公共契约
ctx.vars['dh-core:intermediateCalc'] = someData // 命名空间变量，插件内部使用
```

### Base Workflows

Engine 层定义的内置 workflow，永远存在，任何代码可直接 import：

```typescript
// src/workflow/baseWorkflows.ts
import {
  getRollWorkflow,
  getQuickRollWorkflow,
  getSetSelectionWorkflow,
} from '@/workflow/baseWorkflows'

// roll:              formula → serverRoll → output: { rolls, total }（纯掷骰，可复用构建块）
// quick-roll:        组合 roll + display（聊天框等通用场景）
// core:set-selection: entityId → update session selection
```

Base workflow 是可复用构建块。插件通过 `sdk.defineWorkflow()` 定义自己的 workflow，
内部通过 `ctx.runWorkflow(getRollWorkflow(), ...)` 组合 base workflow 并消费其 typed output，
而非全局注入步骤。这避免了跨场景的步骤污染。

---

## 插件 SDK

### 注册时 API（IPluginSDK）

插件在 `onActivate(sdk)` 中通过 SDK 注册步骤。注册时 **不能** 执行 workflow。

```typescript
interface IPluginSDK {
  // 定义插件自有 workflow（deactivate 时自动清理）
  defineWorkflow<TData>(name, steps?): WorkflowHandle<TData, TData>
  defineWorkflow<TData, TOutput>(name, steps, outputFn): WorkflowHandle<TData, TOutput>

  // Look up an existing workflow by name (returns untyped handle)
  getWorkflow(name: string): WorkflowHandle

  // 插入步骤（仅定位，无生命周期绑定）
  addStep(handle, { id, before?, after?, priority?, critical?, readonly?, phase?, run })

  // 插入步骤 + 生命周期绑定（目标被移除时级联移除）
  attachStep(handle, { id, to, before?, after?, priority?, critical?, readonly?, phase?, run })

  // 包装已有步骤（洋葱模型，可叠加多个）
  wrapStep(handle, targetStepId, { priority?, run: (ctx, original) => ... })

  // 替换已有步骤（每个步骤最多一个替换）
  replaceStep(handle, targetStepId, { run })

  // 移除步骤（含级联移除依赖步骤）
  removeStep(handle, stepId)

  // 调试：查看 workflow 当前步骤顺序
  inspectWorkflow(handle): string[]

  // Declarative trigger registration (fires workflow on matching log entries)
  registerTrigger(trigger: TriggerDefinition): void

  // UI 注册
  ui: IUIRegistrationSDK
}
```

### 执行时 API（IWorkflowRunner）

UI 层通过 `useWorkflowRunner()` hook 获取 runner：

```typescript
interface IWorkflowRunner {
  runWorkflow<TData, TOut>(
    handle: WorkflowHandle<TData, TOut>,
    data?: Partial<TData>,
  ): Promise<WorkflowResult<TData, TOut>>
}
```

### 插件生命周期

```typescript
interface VTTPlugin {
  id: string
  dependencies?: string[] // 依赖的其他 VTTPlugin ID
  onActivate(sdk: IPluginSDK): void // 注册步骤、UI
  onDeactivate?(sdk: IPluginSDK): void // 可选清理
}
```

`deactivatePlugin(pluginId)` 自动清理该插件注册的所有 step、wrapper、replacement，并级联移除依赖步骤。

---

## Event Bus

解耦 workflow 副作用与 UI 表现。Workflow 只管发信号，UI 自行决定如何响应。

```typescript
// 定义事件（类型安全）
const toastEvent = defineEvent<ToastPayload>('system:toast')
const announceEvent = defineEvent<AnnouncePayload>('system:announce')
const animationEvent = defineEvent<AnimationPayload>('system:animation')
const soundEvent = defineEvent<SoundPayload>('system:sound')

// Workflow 中 emit
ctx.events.emit(toastEvent, { text: 'Hit!', variant: 'success' })

// React 组件中订阅
useEvent(toastEvent, (payload) => showToastUI(payload))
```

事件是瞬时的、fire-and-forget 的。错过就算了，不影响持久状态。

---

## Trigger System

Triggers enable declarative reactive workflows: when a matching game log entry arrives, the engine automatically runs a registered workflow with mapped input data. This powers chain reactions (e.g., "when damage is dealt, check for status effects").

### Architecture

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  TriggerRegistry │ ←──  │ IPluginSDK       │      │ WorkflowEngine   │
│  ├─ register()   │      │ .registerTrigger()│      │ .runWorkflow()   │
│  └─ getMatching  │      └──────────────────┘      └────────▲─────────┘
│     Triggers()   │                                          │
└────────┬─────────┘                                          │
         │                                                    │
         ▼                                                    │
┌──────────────────────────────────────────────────────────────┘
│  LogStreamDispatcher
│  ├─ dispatch(entry: GameLogEntry)
│  │   1. Skip historical entries (seq <= watermark)
│  │   2. Skip non-triggerable entries
│  │   3. Cascade protection (chainDepth >= MAX_CHAIN_DEPTH)
│  │   4. Executor routing (only on matching client)
│  │   5. Get matching triggers from registry
│  │   6. Serial execution: trigger.mapInput(entry) → runWorkflow()
│  └─ updateWatermark(seq)
└──────────────────────────────────────────────────────────────
```

### TriggerDefinition

```typescript
interface TriggerDefinition {
  id: string                                       // unique trigger ID
  on: string                                       // log entry type to match
  filter?: Record<string, unknown>                 // shallow payload filter (all keys must match)
  workflow: string                                 // workflow name to execute
  mapInput: (entry: GameLogEntry) => Record<string, unknown>  // transform entry to workflow input
  executeAs: 'triggering-executor'                 // runs on the same client that originated the entry
}
```

### Safety guarantees

- **Cascade depth limit**: `MAX_CHAIN_DEPTH` (10) prevents infinite trigger chains
- **Watermark**: historical entries replayed on reconnect are skipped
- **Serial execution**: matching triggers run sequentially (no parallel races)
- **Executor routing**: trigger workflows only execute on the client whose seat matches the entry's executor

---

## Entity 数据模型

### 组件化存储

```typescript
interface Entity {
  id: string
  blueprintId?: string
  permissions: EntityPermissions
  lifecycle: EntityLifecycle // 'ephemeral' | 'reusable' | 'persistent'
  tags: string[]
  components: Record<string, unknown> // 所有数据存储在此
}
```

组件通过 `namespace:type` 命名空间键访问：

| 键                       | 类型                                         | 所属        |
| ------------------------ | -------------------------------------------- | ----------- |
| `core:identity`          | `{ name, imageUrl, color }`                  | 基座        |
| `core:token`             | `{ width, height }`                          | 基座        |
| `core:notes`             | `{ text }`                                   | 基座        |
| `daggerheart:health`     | `{ current, max }`                           | daggerheart |
| `daggerheart:stress`     | `{ current, max }`                           | daggerheart |
| `daggerheart:attributes` | `{ agility, strength, ... }`                 | daggerheart |
| `daggerheart:meta`       | `{ tier, proficiency, className, ancestry }` | daggerheart |
| `daggerheart:extras`     | `{ hope, armor }`                            | daggerheart |

### 数据读取

两层 API，共享 `IDataReader` 接口：

```typescript
interface IDataReader {
  entity(id: string): Entity | undefined
  component<T>(entityId: string, key: string): T | undefined
  query(spec: { has?: string[] }): Entity[]
  formulaTokens(entityId: string): Record<string, number> // resolve @-tokens for dice formulas
}
```

| 场景                     | API                                                      | 响应式                             |
| ------------------------ | -------------------------------------------------------- | ---------------------------------- |
| React 组件渲染           | `useEntity(id)` / `useComponent<T>(id, key)`             | ✅ zustand selector 自动 re-render |
| Workflow 步骤 / 事件回调 | `ctx.read.entity(id)` / `ctx.read.component<T>(id, key)` | ❌ 命令式快照读取                  |

### Core 组件访问器

`src/shared/coreComponents.ts` 提供带默认值的便捷访问函数：

```typescript
getIdentity(entity): CoreIdentity   // 永远返回值，不返回 undefined
getToken(entity): CoreToken
getNotes(entity): CoreNotes
getName(entity): string              // 快捷方式
getColor(entity): string
```

---

## RulePlugin 接口（声明式 UI 适配）

```typescript
interface RulePlugin {
  id: string
  name: string
  sdkVersion: '1'
  i18n?: PluginI18n

  // Layer 1: 数据适配（必需）— Entity → UI 视图
  adapters: {
    getMainResource(entity): ResourceView | null
    getPortraitResources(entity): ResourceView[]
    getStatuses(entity): StatusView[]
    getFormulaTokens(entity): Record<string, number>
  }

  // Layer 2: 角色 UI（必需）
  characterUI: { EntityCard: React.ComponentType<EntityCardProps> }

  // Layer 3: 骰子系统（可选）
  diceSystem?: {
    getRollActions(entity): RollAction[]
    evaluateRoll(rolls, total): JudgmentResult | null
    getDieStyles(terms): DieStyle[]
    getJudgmentDisplay(result): JudgmentDisplay
    getModifierOptions(): ModifierOption[]
    rollCommands?: Record<string, { resolveFormula(expr?): string }>
    rollWorkflows?: Record<string, () => WorkflowHandle> // per-rollType workflow getter
  }

  // Layer 4: 数据模板（可选）
  dataTemplates?: {
    createDefaultEntityData(): Record<string, unknown>
    getPresetTemplates?(): PresetTemplate[]
  }

  // Layer 5: UI 表面（可选）
  surfaces?: {
    panels?: PluginPanelDef[]
    dockTabs?: DockTabDef[]
    gmTabs?: GMTabDef[]
    teamPanel?: React.ComponentType<TeamPanelProps>
    rollCardRenderers?: Record<string, React.ComponentType<RollCardProps>>
    tools?: ToolDefinition[]
    getTokenActions?: (ctx: TokenActionContext) => TokenAction[]
    getContextMenuItems?: (ctx: ContextMenuContext) => ContextMenuItem[]
    keyBindings?: KeyBinding[]
  }

  // Layer 6: 隐藏基座 UI 元素（可选）
  hideElements?: HideableElement[]
}
```

---

## 注册与发现

```typescript
// src/rules/registry.ts — 唯一导入 plugins/ 目录的文件

// RulePlugin 注册
const registry = new Map<string, RulePlugin>([
  ['generic', genericPlugin],
  ['daggerheart', daggerheartPlugin],
])

// VTTPlugin 注册（workflow 步骤）
registerWorkflowPlugins([daggerheartCorePlugin, daggerheartCosmeticPlugin])

// 公开 API
export function getRulePlugin(id: string): RulePlugin // 不存在时回退 generic
export function registerPlugin(plugin: RulePlugin): void
export function getAvailablePlugins(): Array<{ id: string; name: string }>
```

**关键约束**：基座代码只通过 `getRulePlugin()` 访问插件，不直接导入 `plugins/` 目录。

---

## 已有插件

### generic（通用基线）

最简 RulePlugin，从 `generic:resources` / `generic:attributes` / `generic:statuses` 组件直接读取数据。无 VTTPlugin。

### daggerheart（Daggerheart TRPG 规则）

由三个模块组成：

| 模块                   | 类型       | 职责                                                                          |
| ---------------------- | ---------- | ----------------------------------------------------------------------------- |
| `daggerheart`          | RulePlugin | UI 适配：角色卡、2d12 Hope/Fear 骰子系统、预设模板、团队面板                  |
| `daggerheart-core`     | VTTPlugin  | 定义 `dh:action-check` workflow（组合 base roll + judge + resolve + display） |
| `daggerheart-cosmetic` | VTTPlugin  | 装饰注入：`cos:dice-animation` 步骤（attached to `dh:judge`，生命周期绑定）   |

```typescript
// daggerheart-core: 定义自有 workflow，组合 base roll
const dhWorkflow = sdk.defineWorkflow<DHActionCheckData>('dh:action-check', [
  {
    id: 'roll',
    run: async (ctx) => {
      const result = await ctx.runWorkflow(getRollWorkflow(), {
        formula: ctx.vars.formula,
        actorId: ctx.vars.actorId,
      })
      if (result.status === 'aborted') {
        ctx.abort(result.reason)
        return
      }
      ctx.vars.rolls = result.output.rolls // 类型安全的结构化 output
      ctx.vars.total = result.output.total
    },
  },
  {
    id: 'dh:judge',
    run: (ctx) => {
      /* Hope/Fear 判定 */
    },
  },
  {
    id: 'dh:resolve',
    run: (ctx) => {
      /* 更新 team tracker */
    },
  },
  {
    id: 'display',
    run: (ctx) => {
      /* emit toast + announce */
    },
  },
])

// daggerheart-cosmetic: 附加装饰效果到 dh:action-check（不再污染 base roll）
sdk.attachStep(getDHActionCheckWorkflow(), {
  id: 'cos:dice-animation',
  to: 'dh:judge', // 生命周期绑定：dh:judge 被移除时自动移除
  readonly: true, // Proxy 强制不可写 → 跨边界安全
  critical: false, // 失败不中断 workflow
  run: cosmeticDiceAnimationStep,
})
```

### poc-ui（POC 验证）

VTTPlugin，验证 UI 注册能力：

```typescript
sdk.ui.registerComponent({ id: 'poc-ui.hello', component: HelloPanel, ... })
sdk.ui.registerLayer({ id: 'poc-ui.vignette', zLayer: 'above-canvas', component: VignetteLayer })
```

---

## 目录结构

```
src/workflow/
├── types.ts             # WorkflowHandle, Step, WorkflowContext, IPluginSDK, IWorkflowRunner
├── engine.ts            # WorkflowEngine 核心实现
├── context.ts           # createWorkflowContext（ContextDeps 注入）
├── pluginSDK.ts         # PluginSDK + WorkflowRunner 实现
├── baseWorkflows.ts     # roll, quick-roll, core:set-selection（内置 workflow）
├── helpers.ts           # output() 语法糖
└── useWorkflowSDK.ts    # React hook: useWorkflowRunner()

src/events/
├── eventBus.ts          # EventBus 类 + defineEvent + useEvent hook
└── systemEvents.ts      # toastEvent, announceEvent, animationEvent, soundEvent

src/data/
├── dataReader.ts        # createDataReader()（命令式读取）
└── hooks.ts             # useEntity(), useComponent()（响应式读取）

src/shared/
├── entityTypes.ts       # Entity, Blueprint, MapToken 类型定义
└── coreComponents.ts    # getIdentity(), getToken(), getNotes() 访问器

src/rules/
├── types.ts             # RulePlugin, VTTPlugin 接口
├── registry.ts          # 插件注册表（唯一导入 plugins/ 的文件）
└── sdk.ts               # 插件开发者公开导出

plugins/
├── generic/             # 通用基线 RulePlugin
├── daggerheart/         # Daggerheart RulePlugin（UI 适配）
├── daggerheart-core/    # Daggerheart VTTPlugin（逻辑注入）
├── daggerheart-cosmetic/# Daggerheart VTTPlugin（装饰效果）
└── poc-ui/              # POC UI 注册验证
```

---

## 迁移状态

插件系统从 POC 迁移到生产的 6 个阶段：

| Phase | 状态    | 目标                                                 |
| ----- | ------- | ---------------------------------------------------- |
| 1     | ✅ 完成 | EventBus — 解耦系统事件                              |
| 2     | ✅ 完成 | WorkflowContext 重写 — ctx.vars/read/updateComponent |
| 3     | ✅ 完成 | IDataReader + 响应式 Hooks                           |
| 4     | ✅ 完成 | Entity.components 全量迁移                           |
| 5     | ✅ 完成 | Session State（selection + pendingInteraction）      |
| 6     | ✅ 完成 | requestInput + 异步步骤                              |

详见 [migration-master-plan.md](../plans/migration-master-plan.md)。

---

## 演进方向

### 终态愿景：模组管理器 + 全插件化

终态不存在"规则系统"这个架构概念。引擎只认 `VTTPlugin`，所有插件平等。GM 通过**模组管理器**自由安装、启用、禁用任意插件组合。

**现状 vs 终态：**

```
现状（技术债）：                        终态：
├─ 房间创建时选择"规则系统"             ├─ 房间有一个模组管理器
│  └─ Daggerheart | Generic            │  ├─ GM 自由安装/启用任意插件
├─ RulePlugin 是特殊类型                │  ├─ "Daggerheart 包"只是预装模组集合
│  └─ adapters, surfaces, diceSystem   │  ├─ 第三方插件与官方插件完全平等
├─ 基座硬编码 UI 读插件数据             │  └─ 插件之间通过 namespace 隔离
│  └─ getHP(), getIdentity() adapter   ├─ 只有 VTTPlugin { onActivate(sdk) }
└─ 基座 UI 组件不可替换                 ├─ 所有业务 UI 由插件注册
                                        └─ 基座只保留最小 Shell
```

**为什么不需要引擎层面的排他性？**

1. **Namespace 隔离**：每个插件写自己的 namespace（`daggerheart:health`、`dnd5e:hit-points`），数据层天然不冲突
2. **UI 归属决定 workflow 归属**：按钮在谁的面板里，就调谁的 workflow。两个插件都有"受伤"workflow 不冲突——各自的 UI 调各自的
3. **多插件共存无害**：GM 同时装了 DH 角色卡和 D&D 角色卡，两个面板各显各的，互不干扰——只是没意义而已。这是 UX 问题（预设包帮你选好合理搭配），不是架构问题（引擎禁止你同时启用）

**基座保留 vs 插件注册：**

```
基座保留（不可插件化）：              插件注册（可替换、可组合）：
├─ react-konva Canvas                ├─ portrait-bar
│  ├─ Token 渲染（读 core:*)        ├─ chat-panel
│  ├─ 地图背景                       ├─ gm-sidebar
│  └─ 网格                           ├─ entity-card
├─ 布局引擎（面板容器、停靠）         ├─ token-tooltip（基座提供容器+定位,
├─ 场景切换                           │   插件通过 Slot 贡献内容）
├─ 房间连接 + 权限                    ├─ dock-tabs
├─ 模组管理器                         ├─ team-panel
└─ 插件加载                           ├─ dice-tray
                                      └─ ...任何插件自定义面板
```

在此模型下：

- **RulePlugin 将被 VTTPlugin 完全替代** — 没有"基座 UI 需要读插件数据"的场景，adapter 层不需要存在
- **每个插件的 UI 组件直接读自己的组件数据** — DH 的 portrait-bar 读 `daggerheart:health`，不需要通过 adapter 转译
- **diceSystem 拆解** — `evaluateRoll` 已是 workflow step；`getRollActions`/`getDieStyles` 变成 chat 面板插件内的配置
- **dataTemplates 拆解** — 变成 entity creation workflow 的 step（见下文）

### 命令系统

插件可以注册聊天命令，用户在聊天窗口输入命令触发 workflow：

```typescript
// Daggerheart 插件注册
sdk.commands.register({
  name: '.dh', // 全局唯一，先到先得
  description: '掷 2d12 + Hope/Fear 判定',
  workflow: daggerheartRollHandle,
})

// D&D 插件注册
sdk.commands.register({
  name: '.dnd',
  description: '掷 d20',
  workflow: dndRollHandle,
})
```

- 命令名全局唯一，先注册先得，冲突时后来者注册失败并提示用户
- 命令本质是 workflow 的文本触发入口，与面板内按钮触发 workflow 走同一条通路
- 面板内的掷骰按钮不需要命令系统——谁的 UI 调谁的 workflow，归属天然明确

**命令 vs 面板按钮的区别：**

```
面板按钮：UI 归属 → workflow 归属（隐式，不需要全局名称）
聊天命令：文本输入 → workflow 触发（显式，需要全局唯一名称）
```

### Entity 创建

Entity 创建是 workflow，由插件注册。右键菜单聚合所有活跃插件的 creation workflow：

```typescript
// Daggerheart 插件
sdk.workflow.register(
  defineWorkflow({
    name: 'daggerheart:create-character',
    label: '创建 Daggerheart 角色',
    steps: [
      // 初始化 daggerheart:health, daggerheart:stress, ...
    ],
  }),
)

// D&D 插件
sdk.workflow.register(
  defineWorkflow({
    name: 'dnd5e:create-character',
    label: '创建 D&D 5e 角色',
    steps: [
      // 初始化 dnd5e:hit-points, dnd5e:armor-class, ...
    ],
  }),
)
```

- 多个插件各自注册 creation workflow，右键菜单显示所有可用选项
- GM 可在房间设置中指定默认 creation workflow（用于"快速创建"场景）
- 每个 creation workflow 只初始化自己 namespace 的 components，加上 `core:identity`、`core:token` 等基础组件

### Panel/Layer UI 基础设施

全插件化 UI 基于两个原语模型（详见 [UI 系统设计探索](../exploration/plugin-system/ui/01-UI系统设计探索.md)）：

**原语 1: Panel — 功能面板**

插件注册组件，GM 在布局配置中决定放置位置，玩家消费布局：

```typescript
// 插件注册（声明"我有什么"，不声明"我在哪里"）
sdk.ui.registerComponent({
  id: 'daggerheart.character-card',
  component: CharacterCard,
  defaultSize: { width: 320, height: 480 },
})

// 布局配置（由 GM 或预设定义"放在哪里"）
{
  "daggerheart.character-card#1": {
    x: 14, y: 14, width: 200, height: 280,
    instanceProps: { entityId: "aria-id" }
  },
  "daggerheart.character-card#2": {
    x: 220, y: 14, width: 200, height: 280,
    instanceProps: { entityId: "kael-id" }
  }
}
```

- 组件只接收 `IComponentSDK`，不接触内部 store
- 同一组件可多实例，每个实例独立 `instanceProps`
- 窗口外壳（标题栏、拖拽、关闭）由宿主统一提供，插件只管内容
- ErrorBoundary 隔离：一个面板崩溃不影响其他

**原语 2: Layer — 视觉层**

全屏装饰性内容，不参与布局系统：

```typescript
sdk.ui.registerLayer({
  id: 'rain-effect',
  zLayer: 'above-canvas', // below-canvas | above-canvas | above-ui
  component: RainLayer,
})
```

**插件间协作：自愿 Slot**

插件默认封闭。想让其他插件扩展自己时，**主动**暴露具名扩展点：

```tsx
// PortraitBar 插件内部，主动暴露扩展点
function PortraitBar({ sdk }) {
  return (
    <div>
      <Slot name="portrait-bar:before" sdk={sdk} />
      <CharacterList sdk={sdk} />
      <Slot name="portrait-bar:after" sdk={sdk} />
    </div>
  )
}

// 另一个插件注册到该扩展点
sdk.ui.slot('portrait-bar:after', MyExtraButton)
```

- Slot 的存在完全由宿主插件决定，外部无法强制注入
- 多个注册按顺序渲染，每个被 ErrorBoundary 包裹
- **这不是传统 slot 注册系统** — 没有"基座定义 slot 位置"这个概念，扩展点完全是自愿的

**需要建设的基础设施：**

1. **布局引擎** — Panel 容器渲染、拖拽、缩放、停靠
2. **布局编辑器** — GM 进入编辑模式，拖拽排列面板，保存布局
3. **布局持久化** — 布局配置存储到服务端，下次加载恢复
4. **布局预设** — 插件随附默认布局，新房间开箱即用
5. **IComponentSDK 完整实现** — `sdk.data` + `sdk.workflow` + `sdk.context` + `sdk.layout` + `sdk.dnd` + `sdk.events`

**基座 UI 组件插件化迁移：**

```
迁移顺序（按依赖深度从浅到深）：
1. TeamPanel → daggerheart 插件注册
2. DockTabs → 各插件注册自己的 tab
3. PortraitBar → 插件注册（DH 版带 HP 条，generic 版不带）
4. GmSidebar → 拆分为独立面板组件
5. ChatPanel → 独立面板组件
6. EntityCard → 插件注册
```

迁移难度低：组件本身不需要改动，只是注册方式从硬编码变为 `sdk.ui.registerComponent()`。

### 操作工作流化

与 UI 插件化并行，将操作 workflow 化使插件能在操作前后注入逻辑：

- **Batch 1**：Daggerheart 游戏操作（受伤、治疗、Hope 消耗、Stress 变化、Token 放置）
- **Batch 2**：通用操作（Entity CRUD、Blueprint spawn、Scene 切换）
- **Batch 3**：按需（Showcase、Asset、Archive 等低频操作）

架构决策：**workflow 编排 store action（方案 B）**— workflow step 内部调用 store action，store 保持现有 REST/Socket 逻辑不变。插件只管业务逻辑，网络通信对插件透明。

### 模组管理器

模组管理器是替代当前"规则系统选择器"的终态方案：

**当前状态（过渡期）：**

- 房间创建时选择"规则系统"（Daggerheart / Generic）
- 选择结果决定加载哪些插件
- RulePlugin 接口承担 adapter、surfaces、diceSystem 等职责

**终态：**

- 房间设置中有模组管理器面板
- GM 浏览可用插件列表，自由启用/禁用
- "Daggerheart 包"是一个预装模组集合（包含 dh-character-card、dh-dice、dh-portrait-bar、dh-combat 等），新房间可一键启用
- GM 可以在预装包基础上自由增减插件（加一个第三方天气特效插件、禁用不需要的 dh-team-panel）
- 所有活跃插件拥有完全平等的能力——相同的 SDK 接口、相同的注册 API、相同的 Slot 访问权

**名称冲突策略：**

插件注册的不同类型名称，冲突语义不同，需要分别处理：

| 名称类型        | 冲突策略                                | 理由                                  |
| --------------- | --------------------------------------- | ------------------------------------- |
| Component key   | 无注册冲突，运行时 last-write-wins      | 是数据不是注册；GM 负责不装冲突的插件 |
| Workflow handle | 默认冲突报错，`override: true` 允许替换 | 有意替换是合理的 homebrew 场景        |
| Chat command    | 先到先得，冲突失败                      | 用户直接输入，不能有歧义              |
| UI component ID | 先到先得，冲突失败                      | 替代品用新 ID 即可，不需要 override   |
| Slot 贡献       | 无冲突，多方共存                        | Slot 设计就是多贡献者                 |

引擎只负责**检测并报告**冲突，**解决**冲突是 GM 在模组管理器里做的事（调整加载顺序、禁用其中一个、或确认 override 是有意的）。

**依赖模型：基于导出名称，不绑定具体包**

插件的依赖不指向具体的包名，而是指向导出名称（component key、workflow handle）。类似 Debian/RPM 的 `Provides` 机制或 OSGi 的 `Import-Package`：

```typescript
// dh-homebrew-spells 的依赖声明
{
  requires: {
    components: ['daggerheart:stress'],        // 需要有人提供这个 component key
    workflows: ['daggerheart:take-damage'],    // 需要有人注册这个 workflow
  }
}
```

- 依赖检查在插件加载时执行：所有活跃插件的导出是否满足依赖方的 requires
- 同一导出名称允许多个提供者（可替换性）——官方 `daggerheart-core` 和 homebrew 替代品都可以满足 `daggerheart:stress` 的依赖
- 缺少依赖时插件加载失败并报告缺少哪些导出，不静默降级

这个模型的优势是**可替换性**：homebrew 插件注册同样的 `daggerheart:health` component key 但用不同的血量规则，依赖 `daggerheart:health` 的第三方插件无需修改就能兼容。

已知风险（开放第三方生态时需解决）：

- **Schema 不兼容** — 两个提供者用同一个 key 但结构不同（`{ current, max }` vs `{ hp, maxHp }`），需要 component schema 声明
- **Namespace 抢注** — 恶意/无意占用他人 namespace，需要 namespace 治理机制
- **责任模糊** — key 出 bug 时不知该找谁，需要提供者溯源

**其他待设计问题：**

1. **插件发现** — 插件市场/仓库的形态，插件打包和分发方式
2. **版本兼容** — SDK 版本升级时插件的兼容性保证
3. **沙箱安全** — 第三方插件的权限边界，是否限制可访问的 API 子集

### RulePlugin 退役路线

RulePlugin 不会一次性删除，而是随着 Panel/Layer 基础设施就绪逐步废弃：

```
Phase A: Panel/Layer 基础设施就绪
  → 插件通过 sdk.ui.registerComponent() / registerLayer() 注册 UI
  → 基座 UI 组件开始迁移为插件注册

Phase B: 基座 UI 组件迁移完成 + 模组管理器上线
  → PortraitBar/ChatPanel 等不再硬编码，全部由插件注册
  → RulePlugin.adapters 不再有调用方（插件直接读自己的组件数据）
  → RulePlugin.characterUI / surfaces 被 Panel 注册替代
  → "规则系统选择器"被模组管理器替代

Phase C: RulePlugin 接口删除
  → 所有能力统一为 VTTPlugin
  → 插件只有一种类型：VTTPlugin { onActivate(sdk) }
  → "Daggerheart" 从一个 RulePlugin 变为一组独立 VTTPlugin 的预装集合
```

---

## 探索文档索引

设计探索过程的完整记录：

| 文档                                                                                                   | 内容                  |
| ------------------------------------------------------------------------------------------------------ | --------------------- |
| [全链路验证议程](../exploration/plugin-system/全链路验证/00-议程.md)                                   | 5 阶段验证计划        |
| [数据层与UI层交互模型](../exploration/plugin-system/ui/05-数据层与UI层的交互模型.md)                   | 四条通路设计          |
| [Workflow 生产化最终设计](../exploration/plugin-system/workflow/22-Workflow基础设施生产化-最终设计.md) | Engine 详细设计       |
| [审核意见](../exploration/plugin-system/全链路验证/06-审核意见.md)                                     | 跨插件验证 + 并发安全 |
