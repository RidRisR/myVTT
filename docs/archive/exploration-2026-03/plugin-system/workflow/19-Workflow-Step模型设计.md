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

---

## 11 POC 验证后的发现与演进方向

> 以下内容来自 POC 实现和运行时验证过程中的观察。

### 11.1 Workflow 嵌套组装

POC 已验证 `ctx.runWorkflow` 支持嵌套调用（递归深度限制 10 层）。这意味着一个 Workflow 的某个 step 可以触发另一个完整的 Workflow：

```typescript
sdk.defineWorkflow('dh:attack', [
  {
    id: 'select-target',
    run: async (ctx) => {
      /* ... */
    },
  },
  {
    id: 'roll',
    run: async (ctx) => {
      // 嵌套调用基座的 roll workflow，自动走完整插件链路
      await ctx.runWorkflow('roll', { formula: '2d12+@strength', actorId: ctx.data.actorId })
    },
  },
  {
    id: 'apply-damage',
    run: async (ctx) => {
      /* ... */
    },
  },
])
```

**当前限制**：`runWorkflow` 返回 `Promise<void>`，嵌套调用创建独立的 `WorkflowContext`，内层的 `ctx.data`（如 rolls、judgment）不会自动回传给外层。

**待设计**：

- **方案 A：返回 data** — `runWorkflow` 改为返回 `Promise<Record<string, unknown>>`，外层可以获取内层结果
- **方案 B：共享 context** — 嵌套调用时复用外层 ctx（内层 step 直接读写外层数据），耦合更强但更简单
- **方案 C：显式映射** — 调用者声明哪些 key 从内层 data 拷贝回外层，如 `ctx.runWorkflow('roll', data, { returns: ['rolls', 'judgment'] })`

倾向方案 A（返回 data），因为它保持了 context 隔离的同时允许数据回传，且改动最小。

### 11.2 基座投骰应统一为 Workflow

现有的投骰路径（`diceSystem.ts` 中的 roll action → `worldStore.sendRoll`）和 Workflow 路径并存。正式实现时应将基座投骰统一为 `roll` workflow，使所有投骰都经过插件链路。否则存在两条投骰路径，插件只能拦截其中一条。

### 11.3 POC 中发现的基础设施问题

- **Tailwind content 扫描**：`plugins/` 目录不在 Tailwind v4 默认扫描范围内，需要在 CSS 中添加 `@source "../../plugins"` 指令
- **Docker volume mount**：`docker-compose.dev.yml` 需要添加 `./plugins:/app/plugins` 才能让 HMR 同步插件目录的改动
- **sendRoll 桥接**：`worldStore.sendRoll` 返回 `void`（丢弃服务端响应），但服务端实际返回完整的 roll 数据（含 rolls 数组）。Workflow 的 `generate` step 需要同步获取 roll 结果，待改造为返回 `Promise<RollResult>`

### 11.4 多 Workflow 架构：避免条件爆炸

**问题**：如果所有规则系统的逻辑都塞进一个 `roll` workflow，每个 Step 内部需要判断"我该不该跑"（是 Daggerheart？Pathfinder？D&D？），条件分支会随规则系统和场景的增加指数膨胀：

```typescript
// 反模式：一个 roll workflow 扛所有
// step 序列: generate → dh:judge → pf:crit-check → dnd:advantage → dh:resolve → pf:resolve → ...
// 每个 step 内部:
run: (ctx) => {
  if (ctx.data.ruleSystem === 'daggerheart') {
    /* ... */
  } else if (ctx.data.ruleSystem === 'pathfinder') {
    /* ... */
  }
  // 越加越多...
}
```

**解法：按场景拆分 Workflow，调用端选择**

```typescript
// 基座：最小化的通用 workflow
engine.defineWorkflow('base:roll', [
  { id: 'generate', run: ... },
  { id: 'display',  run: ... },
])

// Daggerheart 规则插件：注册领域 workflow
sdk.defineWorkflow('dh:action-roll', [
  { id: 'generate',   run: ... },
  { id: 'dh:judge',   run: ... },
  { id: 'dh:resolve', run: ... },
  { id: 'display',    run: ... },
])

sdk.defineWorkflow('dh:damage-roll', [
  { id: 'generate',      run: ... },
  { id: 'dh:apply-damage', run: ... },
  { id: 'display',       run: ... },
])

// Pathfinder 规则插件：注册自己的 workflow
sdk.defineWorkflow('pf:skill-check', [
  { id: 'generate',    run: ... },
  { id: 'pf:dc-compare', run: ... },
  { id: 'pf:degree',   run: ... },
  { id: 'display',     run: ... },
])
```

**调用端直接选择对应的 workflow**：

```typescript
// Daggerheart 角色卡 — "行动骰"按钮
onClick={() => sdk.runWorkflow('dh:action-roll', { formula, actorId })

// Pathfinder 角色卡 — "技能检定"按钮
onClick={() => sdk.runWorkflow('pf:skill-check', { formula, dc, actorId })
```

每个 workflow 里的 Step **不需要判断自己该不该执行**，因为 workflow 本身就是上下文。美化插件仍然用 `addStep` 装饰特定 workflow：

```typescript
// 美化插件装饰 Daggerheart 的行动骰
sdk.addStep('dh:action-roll', {
  id: 'cos:dice-animation',
  after: 'dh:judge',
  run: async (ctx) => {
    await play3DDiceAnimation(ctx.data)
  },
})
```

**嵌套组合也保持扁平**：

```typescript
// "回合开始" workflow — 组合多个子 workflow
sdk.defineWorkflow('dh:turn-start', [
  { id: 'regen', run: (ctx) => ctx.runWorkflow('dh:heal-tick', ctx.data) },
  { id: 'action', run: (ctx) => ctx.runWorkflow('dh:action-roll', ctx.data) },
])
```

每一层都是扁平的 Step 列表，没有嵌套条件。

**复杂度对比**：

| 方案                        | 条件复杂度                   | 扩展方式                    |
| --------------------------- | ---------------------------- | --------------------------- |
| 一个 workflow + Step 内判断 | O(规则系统 × 场景)，指数增长 | 越来越扭曲                  |
| 多 workflow + 调用端选择    | O(1)，每个 Step 无条件执行   | 新增 workflow，不碰已有代码 |

**结论**：`base:roll` 保持最小化（只管骰子力学），各规则系统注册自己的领域 workflow，美化插件用 `addStep` 给特定 workflow 加动画。条件分支由"调用哪个 workflow"来承担，而不是由 Step 内部 if/else 来承担。

### 11.5 并行执行：Engine 串行，Step 自决

**问题**：Engine 串行执行所有 Step，但不同插件注册的 Step 可能互相独立，串行等待浪费时间。例如动画插件和音效插件各注册一个 Step：

```
cos:dice-animation   ← 插件 A，1500ms
sfx:dice-sound       ← 插件 B，200ms
// 串行：1700ms，并行：1500ms
```

**结论：不在 Engine 层引入并行概念。** 原因：

1. 200ms 的差异用户感知不到，大多数场景串行足够
2. 引入 parallel group 会打破"Step 是唯一单元"的简洁性
3. 跨插件并行有 `ctx.data` 竞态风险（两个 Step 同时写同一个 key）

**需要并行时的逃生口：Step 内部不 await**

```typescript
// 动画插件 — 启动动画但不等它结束
sdk.addStep('dh:action-roll', {
  id: 'cos:dice-animation',
  after: 'dh:judge',
  run: (ctx) => {
    // 没有 await，动画在后台播放，下一个 step 立即执行
    void ctx.playAnimation({ type: 'dice-roll', durationMs: 1500 })
  },
})

// 音效插件 — 紧接着播放，和动画同时进行
sdk.addStep('dh:action-roll', {
  id: 'sfx:dice-sound',
  after: 'cos:dice-animation',
  run: (ctx) => {
    ctx.playSound('dice-roll')
  },
})
```

**如果后续 Step 需要等待异步效果完成**，可通过 `ctx.data` 传递 Promise：

```typescript
// 动画插件：把 Promise 存到 data
run: (ctx) => {
  ctx.data.animationPromise = ctx.playAnimation({ ... })
},

// display step（基座）：等动画完成再显示
run: async (ctx) => {
  if (ctx.data.animationPromise) await ctx.data.animationPromise
  showInChat(ctx.data)
},
```

**设计原则**：与分支（11.4）一致——**Engine 管编排顺序，Step 管执行策略**（串行/并行/fire-and-forget 都是 Step 自己的决策）。
