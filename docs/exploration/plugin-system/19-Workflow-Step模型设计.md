# 19 — Workflow + Step 模型设计

> **状态**：设计稿（待验证）
> **前置文档**：Doc 16（三层架构）、Doc 17（FVTT 缺陷分析）、Doc 18（Command+Flow 探索）
> **目标**：定义插件系统的协作模型，使规则插件和美化插件能在同一个流程中协同工作

---

## 1 问题陈述

当前插件系统（Phase 1）的插件是只读的：

- 插件提供配置（骰子公式、判定函数、UI 组件），基座使用这些配置
- 插件不能触发投骰，不能修改游戏状态，不能编排多步流程
- 两个插件之间没有协作机制

我们希望通过一个 POC 验证插件协作模型：

> **POC**：规则插件在角色卡上提供"敏捷检定"按钮 → 按下后进行 `.dd` 投骰 → 美化插件播放 3D 骰子动画 → 规则插件根据结果更新 Hope/Fear 计数器

---

## 2 设计目标

1. **规则插件能编排流程**：定义 Workflow，触发执行，在流程中调用基座能力（投骰、更新实体、发消息）
2. **美化插件能参与流程**：在流程的任意位置插入表现逻辑（动画、音效），且不需要知道规则插件的内部实现
3. **流程可被修改**：任何 step 可以被其他插件前插（before）、后插（after）、包装（wrap，可选调用原实现）或移除（remove）
4. **松耦合**：插件之间不直接引用彼此，只通过 step ID 和 Workflow 名字交互

---

## 3 核心概念

### 3.1 Workflow

一个 **Workflow** 是一组有序执行的 Step。每个 Workflow 有一个唯一名字（如 `roll`、`dh:spend-hope`）。

- **基座**定义通用 Workflow（如 `roll`）
- **规则插件**定义领域 Workflow（如 `dh:spend-hope`、`dh:attack`）
- **美化插件**不定义 Workflow，只往已有 Workflow 里加 Step

Workflow 由三层架构中的任意层定义：

| 层       | 角色                  | 示例                         |
| -------- | --------------------- | ---------------------------- |
| 基座     | 定义基础设施 Workflow | `roll`、`entity:update`      |
| 规则插件 | 定义领域 Workflow     | `dh:spend-hope`、`dh:attack` |
| 美化插件 | 订阅并装饰 Workflow   | 不定义，只 addStep           |

### 3.2 Step

一个 **Step** 是 Workflow 中的一个执行单元：

```typescript
interface Step<TCtx> {
  id: string // 唯一标识，如 'generate', 'dh:judge', 'cos:animate'
  run: (ctx: TCtx) => Promise<void> | void // 执行函数
}
```

Step 按照在 Workflow 中的顺序依次执行（串行、async-aware）。每个 Step 的 `run` 函数接收同一个 Context 对象，可以读写其中的数据。

### 3.3 两种 Context

系统中有两种不同的 Context，不要混淆：

**PluginSDK** — 插件注册时拿到的 SDK 对象，用于声明 Workflow 和 Step：

```typescript
interface PluginSDK {
  defineWorkflow(name: string, steps: Step[]): void
  addStep(workflow: string, addition: StepAddition): void
  wrapStep(workflow: string, targetStepId: string, impl: { run: WrapStepFn }): void
  removeStep(workflow: string, targetStepId: string): void
  runWorkflow(name: string, data?: Record<string, unknown>): Promise<void>
  inspectWorkflow(name: string): string[] // 返回当前 step ID 列表，用于调试
}
```

**WorkflowContext** — 每次 Workflow 执行时创建，传递给每个 Step 的 `run` 函数：

```typescript
interface WorkflowContext {
  // 共享数据（可读写，逐步填充）
  data: Record<string, unknown>

  // 基座能力
  serverRoll(formula: string): Promise<RollResult>
  updateEntity(entityId: string, patch: Partial<Entity>): void
  updateTeamTracker(label: string, patch: { current?: number }): void
  announce(message: string): void
  showToast(text: string, options?: ToastOptions): void
  playAnimation(animation: AnimationSpec): Promise<void>
  playSound(sound: string): void

  // 流程控制
  abort(reason?: string): void
  runWorkflow(name: string, data?: Record<string, unknown>): Promise<void>
}
```

规则插件和美化插件通过 `WorkflowContext.data` 交互——规则插件往 `ctx.data` 写入判定结果，美化插件从 `ctx.data` 读取结果来决定播什么动画。**两者不直接调用对方，而是通过共享数据通信。**

---

## 4 插件入口与 Workflow 操作 API

### 4.1 插件入口

插件通过 `onActivate` 生命周期钩子获取 `PluginSDK`，在其中注册 Workflow 和 Step：

```typescript
const daggerheartCore: VTTPlugin = {
  id: 'daggerheart-core',
  onActivate(sdk: PluginSDK) {
    // 扩展基座的 roll workflow
    sdk.addStep('roll', { id: 'dh:judge', after: 'generate', run: ... })
    // 定义领域 workflow
    sdk.defineWorkflow('dh:spend-hope', [ ... ])
  },
}

const daggerheartCosmetic: VTTPlugin = {
  id: 'daggerheart-cosmetic',
  onActivate(sdk: PluginSDK) {
    // 装饰 roll workflow
    sdk.addStep('roll', { id: 'cos:animate', after: 'dh:judge', run: ... })
  },
}
```

插件激活顺序：基座先定义通用 Workflow → 规则插件扩展并定义领域 Workflow → 美化插件装饰。

### 4.2 定义 Workflow

```typescript
sdk.defineWorkflow(name: string, steps: Step[])
```

定义一个新的 Workflow 及其初始 step 序列。只有基座和规则插件应该调用此方法。

### 4.3 修改 Workflow

三种操作：

```typescript
// 插入：在指定 step 之前或之后添加新 step
sdk.addStep(workflow: string, {
  id: string,
  before?: string,    // step ID，不可与 after 同时指定
  after?: string,     // step ID，不可与 before 同时指定
  priority?: number,  // 同一锚点上多个 step 的排序，数字越小越先执行，默认 100
  run: (ctx: WorkflowContext) => Promise<void> | void,
})

// 包装：用新实现替换已有 step（保持位置不变），可选择调用原实现
sdk.wrapStep(workflow: string, targetStepId: string, {
  priority?: number,  // 多个 wrap 的洋葱层序，数字越小越在外层（越先执行），默认 100
  run: (ctx: WorkflowContext, original: StepFn) => Promise<void> | void,
})

// 移除：从 Workflow 中移除一个 step
sdk.removeStep(workflow: string, targetStepId: string)
```

**定位规则**：

- `before` 和 `after` 引用的是 step ID，不是插件名
- `before` 和 `after` 不可同时指定（避免歧义）；如果都不提供，新 step 追加到末尾
- 如果引用的 step ID 不存在，抛出错误（开发时尽早发现问题）
- 多个 step 指定同一个锚点时，按 `priority` 排序（小的先执行），相同 priority 按注册顺序
- `wrapStep` 的 `priority` 控制洋葱层序：多个 wrap 时，priority 小的在外层先拿到控制权

### 4.4 执行 Workflow

```typescript
// 从 UI 事件等外部触发
sdk.runWorkflow(name: string, initialData?: Record<string, unknown>): Promise<void>

// 从 step 内部触发嵌套 Workflow
ctx.runWorkflow(name: string, data?: Record<string, unknown>): Promise<void>
```

按顺序执行所有 step。如果任何 step 调用了 `ctx.abort()`，后续 step 不再执行。如果 step 抛出异常，视同 abort——后续 step 不执行，异常传播给 `runWorkflow` 的调用者。

嵌套 Workflow 的最大递归深度为 10，超过时抛出错误。

---

## 5 POC 完整走查

### 5.1 基座定义 roll Workflow

```typescript
// 基座内部（启动时）
engine.defineWorkflow('roll', [
  {
    id: 'generate',
    run: async (ctx) => {
      ctx.data.rolls = await ctx.serverRoll(ctx.data.formula)
    },
  },
  {
    id: 'display',
    run: (ctx) => {
      showInChat(ctx.data)
    },
  },
])
```

基座只提供最基础的骨架：生成随机数 → 显示结果。中间留给插件填充。

### 5.2 规则插件扩展 roll Workflow + 定义领域 Workflow

```typescript
// ---- 规则插件入口 ----
const daggerheartCore: VTTPlugin = {
  id: 'daggerheart-core',
  onActivate(sdk) {
    // ---- 扩展 roll Workflow ----

    // 在 generate 之前：让用户调整修正值
    sdk.addStep('roll', {
      id: 'dh:modifier',
      before: 'generate',
      run: async (ctx) => {
        ctx.data.modifiers = await showModifierPanel(ctx.data.actor)
        ctx.data.formula = applyModifiers(ctx.data.formula, ctx.data.modifiers)
      },
    })

    // 在 generate 之后：Hope/Fear 判定
    sdk.addStep('roll', {
      id: 'dh:judge',
      after: 'generate',
      run: (ctx) => {
        ctx.data.judgment = dhEvaluateRoll(ctx.data.rolls, ctx.data.total)
      },
    })

    // 在 display 之前：根据判定结果更新 Hope/Fear
    sdk.addStep('roll', {
      id: 'dh:resolve',
      before: 'display',
      run: (ctx) => {
        const { judgment, actor } = ctx.data
        if (judgment.outcome === 'success_hope' || judgment.outcome === 'failure_hope') {
          ctx.updateEntity(actor.id, { ruleData: { hope: (actor.ruleData.hope ?? 0) + 1 } })
        } else if (judgment.outcome === 'success_fear' || judgment.outcome === 'failure_fear') {
          ctx.updateTeamTracker('Fear', { current: fearCurrent + 1 })
        }
      },
    })

    // ---- 定义领域 Workflow ----

    sdk.defineWorkflow('dh:spend-hope', [
      {
        id: 'validate',
        run: (ctx) => {
          if ((ctx.data.actor.ruleData.hope ?? 0) <= 0) ctx.abort('没有 Hope 可花费')
        },
      },
      {
        id: 'deduct',
        run: (ctx) => {
          ctx.updateEntity(ctx.data.actor.id, {
            ruleData: { hope: ctx.data.actor.ruleData.hope - 1 },
          })
        },
      },
      {
        id: 'apply-effect',
        run: (ctx) => {
          // 应用能力效果...
        },
      },
    ])
  },

  // ---- UI 中触发（从角色卡按钮） ----
  // 组件中通过 sdk.runWorkflow 触发：
  // onAgilityCheckClick = () => sdk.runWorkflow('roll', {
  //   formula: '2d12+@agility', actor, rollType: 'daggerheart:dd',
  // })
}
```

### 5.3 美化插件装饰 Workflow

```typescript
const daggerheartCosmetic: VTTPlugin = {
  id: 'daggerheart-cosmetic',
  onActivate(sdk) {
    // 在 dh:judge 之后插入 3D 骰子动画
    sdk.addStep('roll', {
      id: 'cos:dice-animation',
      after: 'dh:judge',
      run: async (ctx) => {
        if (ctx.data.rolls) {
          await play3DDiceAnimation({
            rolls: ctx.data.rolls,
            judgment: ctx.data.judgment,
          })
        }
      },
    })

    // 装饰 dh:spend-hope — 播金色粒子
    sdk.addStep('dh:spend-hope', {
      id: 'cos:hope-particles',
      after: 'deduct',
      run: async (ctx) => {
        await playGoldParticles(ctx.data.actor)
      },
    })
  },
}
```

### 5.4 "全自动化"插件包装修正值面板

```typescript
const autoModPlugin: VTTPlugin = {
  id: 'auto-modifier',
  onActivate(sdk) {
    // 包装 dh:modifier step：简单情况跳过面板，复杂情况保留原实现
    sdk.wrapStep('roll', 'dh:modifier', {
      run: async (ctx, original) => {
        if (isSimpleRoll(ctx.data)) {
          // 简单情况：自动计算，跳过面板
          ctx.data.modifiers = autoCalculateModifiers(ctx.data.actor)
          ctx.data.formula = applyModifiers(ctx.data.formula, ctx.data.modifiers)
        } else {
          // 复杂情况：调用原实现（弹出修正值面板）
          await original(ctx)
        }
      },
    })
  },
}
```

### 5.5 最终执行时序

装载所有插件后，roll Workflow 的 step 序列为：

```
dh:modifier        规则插件（或被自动化插件替换）
generate           基座
dh:judge           规则插件
cos:dice-animation 美化插件     ← await 3D 动画
dh:resolve         规则插件     ← 更新 Hope/Fear
display            基座         ← 聊天消息
```

---

## 6 事件定义的归属

| 定义者   | Workflow 示例                        | Step 示例                                  |
| -------- | ------------------------------------ | ------------------------------------------ |
| 基座     | `roll`, `entity:update`, `chat:send` | `generate`, `display`                      |
| 规则插件 | `dh:spend-hope`, `dh:attack`         | `dh:modifier`, `dh:judge`, `dh:resolve`    |
| 美化插件 | （不定义 Workflow）                  | `cos:dice-animation`, `cos:hope-particles` |

**命名约定**：

- 基座 step：无前缀（`generate`, `display`）
- 规则插件 step：规则系统前缀（`dh:judge`, `dh:resolve`）
- 美化插件 step：自己的前缀（`cos:dice-animation`）

---

## 7 与之前方案的关系

本设计是多轮讨论的结论，融合了以下探索中的洞察：

| 探索过的方案                           | 吸收的部分                                  | 放弃的部分                             |
| -------------------------------------- | ------------------------------------------- | -------------------------------------- |
| Hook 系统（FVTT/Obsidian）             | 插件监听并响应流程                          | 固定 hook 点、无法在 hook 之间插入     |
| Action/Filter 双轨（WordPress）        | before（修改输入）/ after（响应结果）的语义 | 独立的 Filter/Action 概念——统一为 Step |
| Pipeline + Phase（Doc 16）             | 有序的多阶段流程                            | 固定的 Phase 列表——改为动态 Step 序列  |
| 三阶段事件（propose/execute/complete） | 事件可以被包装                              | 三阶段过于复杂——简化为 add/wrap/remove |
| Action Queue + 数据驱动（游戏引擎）    | Context 共享数据、插件不直接调用彼此        | 纯数据驱动无法拦截流程                 |
| 值变化订阅（响应式）                   | 适合 UI 层（React 已处理）                  | 无法处理瞬时事件、因果丢失、时序反转   |

**最终模型的核心简洁性**：只有一个概念（Step），只有三种操作（add / wrap / remove），所有插件协作都通过操作同一个 Workflow 的 Step 序列来实现。`wrapStep` 借鉴 Magento Interceptor 的 `around` 模式，允许包装者选择是否调用原实现。`inspectWorkflow` 借鉴 Webpack Tapable 的可观测性，确保多插件协作时可调试。

---

## 8 耦合分析

### 8.1 美化插件引用了规则插件的 step ID

在 POC 中，美化插件写了 `after: 'dh:judge'`。这意味着美化插件知道规则插件有一个叫 `dh:judge` 的 step。

**这是有意的耦合**：这个美化插件就是为 Daggerheart 规则系统做的。如果想做通用美化插件（适配任何规则系统），应该引用基座的 step ID：

```typescript
// 通用美化插件：只引用基座的 step
ctx.addStep('roll', {
  id: 'cos:dice-animation',
  after: 'generate', // ← 基座的 step，任何规则系统都有
  run: async (ctx) => {
    if (ctx.data.rolls) await play3DDiceAnimation(ctx.data.rolls)
  },
})
```

耦合的程度由插件作者自己选择：引用基座 step = 通用，引用规则 step = 专用。

### 8.2 replace 的冲突

如果两个插件都 `wrapStep('roll', 'dh:modifier', ...)`，后注册的包装先注册的（洋葱模型：后注册的在外层，先调用）。

Phase 1（编译时绑定）不存在此问题——一个房间只有一个规则插件 + 若干美化插件，冲突概率极低。Phase 2/3（动态加载）需要加冲突检测和警告。

---

## 9 POC 范围与实现边界

### 9.1 POC 需要实现的

1. **WorkflowEngine**：defineWorkflow / addStep / wrapStep / removeStep / runWorkflow / inspectWorkflow
2. **WorkflowContext**：封装基座能力，传递给每个 step
3. **SDK 扩展**：导出 Workflow 相关类型和 API
4. **规则插件拆分**：`plugins/daggerheart-core/`（逻辑）+ `plugins/daggerheart-cosmetic/`（表现）
5. **角色卡按钮**：触发 `roll` Workflow 的"敏捷检定"按钮
6. **3D 骰子动画**：美化插件在 roll Workflow 中插入的动画 step（可以是简单的 CSS 动画作为 POC）

### 9.2 POC 不需要的

- 动态加载 / 热插拔（Phase 2/3）
- 冲突检测
- 权限控制（谁能 replace 谁）
- 完整的 Daggerheart 规则实现
- 生产级 3D 骰子动画

---

## 10 待确认问题

1. **Step 间的依赖验证**：`after: 'dh:judge'` 如果 `dh:judge` 不存在要怎么处理？开发时报错 vs 静默跳过？
2. **Context.data 类型安全**：POC 阶段用 `Record<string, unknown>`，后续是否需要泛型 `WorkflowContext<TData>`？
3. **现有 RulePlugin 接口的过渡**：Workflow 模型和现有 7 层接口如何共存？POC 阶段并行存在，Workflow 作为正交扩展，不改动现有接口。
4. **重复 Step ID**：两个插件注册同名 step 时，报错还是后者覆盖？POC 阶段报错。
5. **空 Workflow 执行**：所有 step 被移除后 `runWorkflow` 静默完成（不报错）。
