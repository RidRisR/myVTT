# Sprint 2 探索文档

> **状态**：已完成 | 2026-03-29 | PR #174
> **范围**：Sprint 2 任务的设计讨论与决策记录
> **前置**：Sprint 1 探索文档、Doc 17 插件系统演进路线

---

## 目录

1. [任务总览](#1-任务总览)
2. [架构决策：日志作为 Source of Truth](#2-架构决策日志作为-source-of-truth)
3. [R1: 服务端 RNG 纯化](#3-r1-服务端-rng-纯化)
4. [R2: roll workflow 退役](#4-r2-roll-workflow-退役)
5. [G1: groupId 分组机制](#5-g1-groupid-分组机制)
6. [J1: judgment emitEntry](#6-j1-judgment-emitentry)
7. [A3: 日志渲染器 RendererRegistry](#7-a3-日志渲染器-rendererregistry)
8. [开放议题：Workflow 切面 vs 日志切面](#8-开放议题workflow-切面-vs-日志切面)

---

## 1 任务总览

Sprint 2 的范围在讨论中经历了重大调整。Doc 17 原定的 Sprint 2 是"A2 因果链传播 + A3 渲染器 Step1-4"，但经过设计讨论，parentId 因果链被 groupId 分组替代，同时发现了 roll workflow 和服务端 total 的架构问题。

| 任务                   | 工作量 | 状态                             | 依赖 | 来源                      |
| ---------------------- | ------ | -------------------------------- | ---- | ------------------------- |
| R1: 服务端 RNG 纯化    | S      | ✅ 已完成                        | 无   | 新增（讨论中发现）        |
| R2: roll workflow 退役 | M      | ❌ 已推翻（恢复为独立 workflow） | R1   | 新增（讨论中发现）        |
| G1: groupId 分组机制   | S      | ✅ 已完成                        | 无   | 替代 Doc 17 A2 因果链传播 |
| J1: judgment emitEntry | S      | ✅ 已完成                        | G1   | 新增（讨论中发现）        |
| A3: RendererRegistry   | L      | ✅ 已完成（Step 1-4）            | J1   | Doc 17 A3 Step 1-4        |

### 与 Doc 17 Sprint 路线图的偏差

| Doc 17 原计划            | 实际决策                | 原因                                                                   |
| ------------------------ | ----------------------- | ---------------------------------------------------------------------- |
| A2 因果链传播 (parentId) | → G1 groupId 分组       | parentId chain 过于复杂；groupId 解决分组需求，chainDepth 解决级联保护 |
| A3 Step 1-4 (渲染器)     | 保留，但依赖链变了      | 需要先完成 J1（judgment entry）才有非 core 类型可渲染                  |
| —                        | + R1 服务端 RNG 纯化    | 服务端不应包含业务逻辑（求和是业务假设）                               |
| —                        | + R2 roll workflow 退役 | roll 不需要是独立 workflow（观察用 trigger，业务逻辑属于调用方）       |

---

## 2 架构决策：日志作为 Source of Truth

### 2.1 核心原则

讨论中确立的三条原则：

**原则 1：服务端是纯 RNG 服务，不做业务计算**

服务端 `core:roll-result` 只记录事实：用了什么骰子、掷出了什么数字。`total`（求和）是业务假设——Daggerheart 的 2d12 不是相加而是比较 Hope/Fear die，骰池系统数成功数而不是求和。

**原则 2：业务结果由 workflow 产生并写入日志**

Workflow step 计算业务结果（total、judgment、damage 等），通过 `emitEntry` 写入日志。日志 entry 是完整的 source of truth，所有客户端通过渲染器展示。不再通过 EventBus 做本地展示。

**原则 3：日志触发（trigger）是比 workflow 切面更强的横切机制**

| 维度     | Workflow 切面 (addStep/wrapStep) | 日志触发 (trigger)               |
| -------- | -------------------------------- | -------------------------------- |
| 时机     | 执行中拦截，可修改               | 执行后响应                       |
| 覆盖范围 | 单个 workflow                    | **所有**产生该类型 entry 的来源  |
| 跨客户端 | 仅执行者                         | 所有客户端                       |
| 持久性   | 内存，会话级                     | 数据库，永久                     |
| 耦合度   | 依赖 workflow 内部 step 结构     | 只依赖 entry type + payload 格式 |

观察/监控所有骰子的需求由 trigger 订阅 `core:roll-result` 实现，不再需要 hook roll workflow。

### 2.2 数据流对比

```
改造前（三次复制 + entry 信息不完整）:
  服务端 serverRoll
    → entry.payload = { rolls, total:11(错), formula }        ← entry total 不含修正值
    → roll workflow vars.total = 14(重算)                      ← 复制 #1
    → roll workflow output = { rolls, total:14 }               ← 复制 #2
    → dh:action-check vars = { rolls, total:14 }              ← 复制 #3
    → dh:judge 消费 vars
    → EventBus toast (仅本地)                                  ← 其他客户端看不到

改造后（零复制 + entry 是完整 source of truth）:
  服务端 serverRoll
    → entry.payload = { rolls, dice, formula }                 ← 纯 RNG 事实
  dh:action-check step 直接调用 ctx.serverRoll()
    → 拿到 rolls，自己计算 total、判定 judgment
    → ctx.emitEntry({ type: 'dh:judgment', payload: { ... } }) ← 完整业务结果写入日志
    → 所有客户端通过渲染器显示                                  ← 跨客户端
```

---

## 3 R1: 服务端 RNG 纯化

> **状态**：✅ 已确认

### 3.1 问题

`server/logHandler.ts:144` 计算 `total = rolls.flat().reduce((a, b) => a + b, 0)`。这是业务逻辑——不应假设骰子结果需要相加。

### 3.2 变更

**服务端**：从 `core:roll-result` 的 payload 中删除 `total` 字段。

```typescript
// server/logHandler.ts — 改造后
const payload: Record<string, unknown> = {
  dice: request.dice,
  rolls,
  formula: request.formula,
  // total 删除 — 求和是业务逻辑，不属于 RNG
}
if (request.resolvedFormula) payload.resolvedFormula = request.resolvedFormula
if (request.rollType) payload.rollType = request.rollType
if (request.actionName) payload.actionName = request.actionName
```

**客户端类型**：`LogPayloadMap['core:roll-result']` 删除 `total` 字段。

```typescript
// src/shared/logTypes.ts
'core:roll-result': {
  formula: string
  resolvedFormula?: string
  dice: DiceSpec[]
  rolls: number[][]
  // total 删除
  rollType?: string
  actionName?: string
}
```

### 3.3 涉及文件

| 文件                     | 变更                                         |
| ------------------------ | -------------------------------------------- |
| `server/logHandler.ts`   | 删除 total 计算和 payload.total 赋值         |
| `src/shared/logTypes.ts` | `LogPayloadMap['core:roll-result']` 删 total |

### 3.4 风险

- 已有的 `core:roll-result` entries 在数据库中有 `total` 字段，渲染器需要容忍它存在/缺失
- 偏差 #8（roll-result 缺 total）的修复（PR #169）需要重新评估——当时加 total 是对的，但现在 total 应由业务 entry 承载

---

## 4 R2: roll workflow 退役

> **状态**：❌ 已推翻 — 实现后决定恢复 roll workflow，详见 `sprint2-deviations.md` 偏差 8

### 4.1 为什么 roll 不需要是独立 workflow

`roll` 当前作为独立 workflow 有三个理由，全部不再成立：

| 理由                           | 为什么不成立                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------- |
| 业务逻辑共享（公式解析、求和） | 公式解析和求和是业务假设，各调用方应自己处理                                     |
| 观察/监控所有骰子              | trigger 订阅 `core:roll-result` 日志，覆盖范围更广、跨客户端                     |
| 作为可 hook 的切面             | 没有消费者 hook roll workflow；插件应 hook 业务 workflow（如 `dh:action-check`） |

### 4.2 变更

**1. 导出 step function 而非 workflow handle**：

Roll 相关逻辑从"独立 workflow"降级为"可复用的工具函数"。各业务 workflow 直接调用 `ctx.serverRoll()`。

```typescript
// 改造前 — dh:action-check step 'roll'
const result = await ctx.runWorkflow(getRollWorkflow(), {
  formula,
  actorId,
  resolvedFormula,
  rollType,
})
if (result.status === 'aborted') {
  ctx.abort(result.reason)
  return
}
ctx.vars.rolls = result.output.rolls // 复制
ctx.vars.total = result.output.total // 复制

// 改造后 — dh:action-check step 'roll'
const entry = await ctx.serverRoll(formula, { dice, resolvedFormula, rollType })
ctx.vars.rolls = entry.payload.rolls as number[][]
// total 由自己的 step 根据业务规则计算
```

**2. `quick-roll` workflow 内联 roll 逻辑**：

`quick-roll` 不再 `runWorkflow(roll)`，而是直接：

- 解析公式（tokenizeExpression）
- 调用 `ctx.serverRoll()`
- 用 `buildCompoundResult()` 计算含修正值的 total
- `emitEntry` 写入业务结果

**3. 删除 `roll` workflow 定义**：

从 `registerBaseWorkflows()` 中删除 `_rollWorkflow` 定义和 `getRollWorkflow()` 导出。

### 4.3 涉及文件

| 文件                                    | 变更                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `src/workflow/baseWorkflows.ts`         | 删除 `roll` workflow 定义；`quick-roll` 内联 roll 逻辑 |
| `plugins/daggerheart-core/rollSteps.ts` | `dh:action-check` 直接调用 `ctx.serverRoll()`          |
| `@myvtt/sdk` 导出                       | 删除 `getRollWorkflow` 导出                            |

### 4.4 迁移验证

- `.r 2d6+3` 仍然工作（quick-roll 内联了公式解析 + serverRoll + total 计算）
- `.dd @agility` 仍然工作（dh:action-check 直接 serverRoll + 自己的 judgment 逻辑）
- trigger 订阅 `core:roll-result` 的插件不受影响（entry 格式不变，只是不再有 total）

---

## 5 G1: groupId 分组机制

> **状态**：✅ 已确认 — 替代 Doc 17 A2 parentId 因果链

### 5.1 为什么不用 parentId chain

Doc 17 §A2 原计划在 workflow 内部维护 parentId 链（A→B→C）。讨论中发现：

| 问题                 | 说明                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| workflow 作者负担重  | 每个 step 需正确传递 parentId/chainDepth，忘了就断链                  |
| 线性 vs 树形模糊     | 同一 workflow 产生的多个 entry 不一定有线性因果，但自动推进只能做线性 |
| 跨 workflow 回传复杂 | 嵌套 `runWorkflow` 需要子链状态回传父——增加 context 创建的复杂度      |
| 实际需求只是分组     | UI 渲染需要的是"哪些 entry 属于同一次用户操作"，不需要详细的因果边    |

### 5.2 groupId 设计

**核心**：每次用户发起的 workflow 执行生成一个 `groupId`，该执行期间产生的所有 entry（包括嵌套 workflow）自动携带此 groupId。trigger 触发的 workflow 生成**新的 groupId**，通过 `causedBy` 指向触发源 entry，建立跨 group 因果关系。

#### 5.2.1 group 内：同一次操作

```typescript
// createWorkflowContext 内部
const groupId = options?.groupId ?? uuidv7() // 外部传入或自动生成

emitEntry: (partial) => {
  const submission: LogEntrySubmission = {
    // ...
    groupId, // ← 自动注入，step 不需要知道
    chainDepth: options?.chainDepth ?? 0,
  }
}

serverRoll: async (formula, options) => {
  const request: RollRequest = {
    // ...
    groupId, // ← 自动注入
    chainDepth: options?.chainDepth ?? 0,
  }
}
```

**嵌套 workflow 共享 groupId**：

```typescript
// context.ts — runWorkflow
runWorkflow: async (handle, nestedData) => {
  const nestedCtx = createWorkflowContext(deps, nestedData, nestedInternal, {
    groupId, // ← 直接传递，同一组
    chainDepth, // ← 继承当前深度
  })
  // ...
}
```

#### 5.2.2 group 之间：trigger 边界产生新 group + 因果指针

```typescript
// LogStreamDispatcher — trigger 边界
for (const trigger of triggers) {
  const input = trigger.mapInput(entry)
  await this.runner.runWorkflow(handle, input, {
    groupId: uuidv7(), // ← 新 group
    causedBy: entry.id, // ← 指向触发源 entry
    chainDepth: entry.chainDepth + 1, // ← 级联深度 +1
  })
}
```

**示例**：

```
用户操作 .dd @agility
  Group A (groupId: "g1"):
    entry 1: core:roll-result     (groupId:"g1")
    entry 2: dh:judgment          (groupId:"g1")
    entry 3: core:tracker-update  (groupId:"g1")

  ↓ Dispatcher 检测到 entry 2，触发 homebrew 插件

  Group B (groupId: "g2", causedBy: entry 2 的 id):
    entry 4: homebrew:blessing    (groupId:"g2", causedBy:"entry2-id")
    entry 5: component-update     (groupId:"g2")
```

#### 5.2.3 三层机制总结

| 机制         | 作用域       | 解决的问题                                        |
| ------------ | ------------ | ------------------------------------------------- |
| `groupId`    | group 内     | "这些 entry 属于同一次操作"——UI 分组渲染          |
| `causedBy`   | group 之间   | "这个 group 是被哪个 entry 触发的"——跨 group 因果 |
| `chainDepth` | trigger 边界 | 级联保护（`MAX_CHAIN_DEPTH`）                     |

### 5.3 数据层变更

**schema 变更**：`game_log` 表新增 `group_id TEXT` 列。

```sql
ALTER TABLE game_log ADD COLUMN group_id TEXT;
CREATE INDEX idx_game_log_group_id ON game_log(group_id);
```

**类型变更**：

```typescript
// GameLogEntry, LogEntrySubmission, RollRequest 新增:
groupId?: string

// context.ts ContextOptions 新增:
groupId?: string
chainDepth?: number
```

### 5.4 parentId 的重新定位

`parent_id` 列已存在于 schema 中。原设计是 entry 级别的线性因果链，现在重新定位为 **group 级别的因果指针**（即 `causedBy`）。

**决策**：复用 `parent_id` 列存储 `causedBy` 语义——只在 trigger 边界由 Dispatcher 设置，指向触发源 entry 的 id。workflow 内部的 entry 不设 parentId（同 group 内用 groupId 关联即可）。

这样不需要新增列，只是改变了 parentId 的写入时机和语义。

### 5.5 涉及文件

| 文件                                  | 变更                                                                 |
| ------------------------------------- | -------------------------------------------------------------------- |
| `src/shared/logTypes.ts`              | `GameLogEntry`、`LogEntrySubmission`、`RollRequest` 加 groupId       |
| `src/workflow/context.ts`             | `createWorkflowContext` 接受 groupId/causedBy 选项并自动注入         |
| `src/workflow/logStreamDispatcher.ts` | dispatch 时传递新 groupId + causedBy + chainDepth+1                  |
| `server/logHandler.ts`                | 接受并存储 groupId；parentId 只在 causedBy 场景写入                  |
| `server/schema.sql` (或 migration)    | `game_log` 表加 `group_id` 列 + 索引（`parent_id` 列复用，无需新增） |

---

## 6 J1: judgment emitEntry

> **状态**：✅ 已确认

### 6.1 问题

`dh:action-check` 的 `dh:judge` step 只做纯计算，judgment 结果只通过 EventBus 本地展示（`toastEvent` + `announceEvent`）。其他客户端**看不到**判定结果。

### 6.2 变更

在 `dh:judge` 之后（或合并到同一 step）增加 `emitEntry`：

```typescript
// rollSteps.ts — dh:action-check 新增 step 或修改 dh:judge
{
  id: 'dh:emit-judgment',
  run: (ctx) => {
    const { rolls, total, judgment, formula } = ctx.vars
    if (!judgment) return

    ctx.emitEntry({
      type: 'dh:judgment',
      payload: {
        formula,
        rolls,
        total,
        judgment,  // { type: 'daggerheart', outcome: 'success_hope' | ... }
      },
      triggerable: true,  // 允许其他插件通过 trigger 响应
    })
  },
}
```

**display step 变更**：

- 删除 `announceEvent` emit（所有客户端通过日志渲染器看到 judgment）
- 保留 `toastEvent`（纯本地 UI 反馈，Doc 17 §A4 明确保留）

### 6.3 LogPayloadMap 扩展

```typescript
// plugins/daggerheart/types.ts — module augmentation
declare module '../../src/shared/logTypes' {
  interface LogPayloadMap {
    'dh:judgment': {
      formula: string
      rolls: number[][]
      total: number
      judgment: { type: string; outcome: string }
    }
  }
}
```

### 6.4 这是 A3 渲染器的验收用例

`dh:judgment` entry 需要 RendererRegistry 才能正确显示。它同时验证：

- groupId 分组（与同一操作的 roll-result 和 tracker-update 在同一组）
- 跨客户端可见性（所有客户端收到 log:new 并渲染）
- 插件渲染器注册（daggerheart 注册 `dh:judgment` 渲染器）

---

## 7 A3: 日志渲染器 RendererRegistry

> **状态**：✅ 已确认

### 7.1 当前渲染管线

```
ChatPanel
  logEntries (GameLogEntry[])
    → logEntryToChatMessage()  ← 硬编码过滤+转换，只保留 core:text 和 core:roll-result
    → ChatMessage[]
    → MessageScrollArea
        → MessageCard (×N)
            text → 硬编码渲染
            judgment → 硬编码渲染
            roll → plugin.surfaces.rollCardRenderers[rollType] 或 DiceResultCard
  ToastStack
    → 也用 ChatMessage + MessageCard
```

问题：

- `logEntryToChatMessage()` 是硬编码转换器，新 type 需改此函数
- `ChatMessage` 是多余的中间类型
- 插件渲染器按 `rollType` 查找，不是按 `entry.type`
- 过滤和渲染耦合在同一个函数里
- 非 `core:text`/`core:roll-result` 的 entry 被直接丢弃

### 7.2 核心设计原则：过滤与渲染分离

**过滤**和**渲染**是两个独立关注点：

| 关注点   | 职责                                    | 谁决定                         |
| -------- | --------------------------------------- | ------------------------------ |
| **过滤** | "这个面板要显示哪些 entry"              | 面板自己的内部逻辑             |
| **渲染** | "这种 type 的 entry 在某个面板里怎么画" | 插件通过 RendererRegistry 注册 |

面板可能想显示没有渲染器的 entry（用 fallback），也可能不想显示有渲染器的 entry（用户偏好、上下文等）。两个决策完全独立。

RendererRegistry 按 **(surface, type)** 注册——插件声明"我的内容在某个面板里**怎么画**"。但面板是否显示某条 entry，是面板自己的事。

### 7.3 目标渲染管线

```
ChatPanel
  logEntries (GameLogEntry[])
    → chatFilter(entry)          ← 面板自己的过滤逻辑
    → filteredEntries
    → MessageScrollArea
        → LogEntryCard (×N)
            → getRenderer('chat', entry.type)
                ├─ 找到 → Renderer({ entry, isNew })
                └─ 没找到 → FallbackCard 或 null
  ToastStack
    → 也用 GameLogEntry + LogEntryCard
```

### 7.4 RendererRegistry API

```typescript
// src/log/rendererRegistry.ts
export interface LogEntryRendererProps {
  entry: GameLogEntry
  isNew?: boolean
}

export type LogEntryRenderer = React.ComponentType<LogEntryRendererProps>

// 按 (surface, type) 注册
registerRenderer(surface: string, type: string, renderer: LogEntryRenderer): void

// 按 (surface, type) 查询
getRenderer(surface: string, type: string): LogEntryRenderer | undefined
```

PluginSDK 接口：

```typescript
// 插件的 UI 代码注册渲染器 — 声明"怎么画"
sdk.ui.registerRenderer('chat', 'dh:judgment', DHJudgmentRenderer)
sdk.ui.registerRenderer('chat', 'core:text', TextRenderer)
sdk.ui.registerRenderer('gm-audit', 'core:component-update', ComponentUpdateRenderer)
```

### 7.5 面板过滤

面板自己决定过滤逻辑，与 RendererRegistry 无关。

**方向**：entry 的 `type` 命名规范是过滤契约。面板用模式匹配（glob/prefix），插件遵循命名约定。无需显式注册 API。

```typescript
// 社区约定示例：
//   *:text, *:announcement → 聊天可见
//   *:judgment, *:roll-result → 骰子/判定
//   *:component-update, *:tracker-update → 数据同步（一般面板不显示）

// 基座提供工具函数
matchesAny(type: string, patterns: string[]): boolean

// ChatPanel — 用模式匹配过滤
const CHAT_PATTERNS = ['core:text', '*:judgment', '*:roll-result', '*:announcement']

const visibleEntries = useMemo(
  () => logEntries.filter(e => matchesAny(e.type, CHAT_PATTERNS)),
  [logEntries],
)
```

Sprint 2 暂用硬编码 Set（已知类型有限），`matchesAny` 工具函数和命名约定随多面板/第三方插件出现后自然形成。

### 7.6 分步交付

| Step | 内容                                                     | 工作量 |
| ---- | -------------------------------------------------------- | ------ |
| 1    | RendererRegistry 类（支持 surface 维度）+ PluginSDK 扩展 | S      |
| 2    | 基座渲染器：`core:text`、`core:roll-result`              | M      |
| 3    | 插件渲染器：`dh:judgment`（替代 `rollCardRenderers`）    | M      |
| 4    | ChatPanel 迁移：过滤逻辑 + LogEntryCard + 删除旧路径     | L      |

### 7.7 其他设计细节

#### 骰子动画共享

`DiceAnimContent` 从依赖 `ChatRollMessage` 改为接受独立 props（`formula`、`rolls` 等）。渲染器直接 import 使用，不再需要 `renderDice` callback 注入。

#### CardShell 公共组件

提取卡片外壳（Avatar + 名字 + 时间戳 + 边框）为 `<CardShell>` 组件，渲染器可选使用。不强制——不同类型的卡片外观可以不同。

#### ChatMessage 类型

迁移完成后删除 `ChatMessage` 联合类型和 `logEntryToChatMessage()` 函数。`chatTypes.ts` 只保留 `MessageOrigin` 和 `getDisplayIdentity()`。

#### groupId 分组渲染

属于 Sprint 3 的 A3 Step 5。Sprint 2 先做单条 entry 的独立渲染。

#### 渐进式迁移

`LogEntryCard` 内部做 fallback——registry 没找到时走旧 `MessageCard` 路径，逐个类型迁移：

```typescript
function LogEntryCard({ entry, isNew }: { entry: GameLogEntry; isNew?: boolean }) {
  const Renderer = getRenderer('chat', entry.type)
  if (Renderer) return <Renderer entry={entry} isNew={isNew} />

  // 临时 fallback：旧路径（迁移完成后删除）
  const chatMsg = logEntryToChatMessage(entry)
  if (!chatMsg) return null
  return <MessageCard message={chatMsg} isNew={isNew} />
}
```

---

## 8 架构决策：Workflow 切面 vs 日志切面的职责划分

> **状态**：✅ 已确认 — 经业界调研后确立原则

### 8.1 业界调研

**Foundry VTT** dnd5e 系统提供 12 个 preRoll hooks + 6 个 preDamage hooks（[完整列表](https://github.com/foundryvtt/dnd5e/wiki/Hooks)），全部支持在执行前修改数据或取消操作。典型消费者如 [Automated Conditions 5e](https://foundryvtt.com/packages/automated-conditions-5e)，在 `preRoll` 阶段根据状态效果自动添加优势/劣势骰。

**WordPress** 的 Filter/Action 双轨架构（[Hooks 文档](https://developer.wordpress.org/plugins/hooks/)）明确指出：Filter（pre-execution 修改）和 Action（post-execution 响应）解决不同问题，"Actions alone cannot solve these because they lack the return mechanism needed to redirect data flow."

**结论**：pre-execution 修改在插件架构中有不可替代的价值。

### 8.2 职责划分原则

| 需求                                                  | 正确的机制                                    | 为什么                                      |
| ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| **修改行为**（改骰子、阻止操作、调整数值）            | workflow 切面（`addStep` before, `wrapStep`） | 必须在执行前发生，骰子掷出去收不回来        |
| **搭便车发日志**（在 workflow 内添加额外的 entry）    | workflow 切面（`addStep` after）              | 需要访问 `ctx.vars` 中间状态 + 共享 groupId |
| **观察/响应**（监控所有骰子、链式反应、跨客户端效果） | 日志触发（`registerTrigger`）                 | 跨客户端、持久化、解耦、覆盖所有来源        |

Workflow 切面的两种有价值的使用模式：

**模式 1 — 修改（pre-execution）**：

```typescript
sdk.addStep(dhActionCheck, {
  before: 'roll',
  id: 'homebrew:add-advantage',
  run: (ctx) => {
    ctx.vars.dice = [{ sides: 20, count: 2 }] // 改骰子
  },
})
```

**模式 2 — 搭便车发日志（co-located side-effect）**：

```typescript
sdk.addStep(dhActionCheck, {
  after: 'dh:emit-judgment',
  id: 'homebrew:combat-log',
  run: (ctx) => {
    // 能读 ctx.vars 里的中间计算结果
    // 发出的 entry 自动共享同一个 groupId
    ctx.emitEntry({ type: 'homebrew:combat-note', payload: { ... } })
  }
})
```

### 8.3 三种模式的完整职责

Workflow 切面实际上有三种不可替代的使用模式：

| 模式           | 机制                          | 独特能力                     | 日志触发能否替代                            |
| -------------- | ----------------------------- | ---------------------------- | ------------------------------------------- |
| 修改行为       | `addStep` before / `wrapStep` | 在执行前改数据、阻止操作     | ❌ 不能（事后无法修改）                     |
| 搭便车发日志   | `addStep` after               | 访问 ctx.vars + 共享 groupId | ❌ 不能（trigger 读不到 ctx.vars）          |
| 最终状态发日志 | `phase: 'post'`               | **保证看到 vars 最终状态**   | ❌ 不能（trigger 不知道 workflow 何时完成） |

**`phase: 'post'` 保留**。它保证在所有 main-phase step 和 output 计算完成后执行，是唯一能确定"vars 已定型"的时机。普通 `addStep({ after: 'xxx' })` 无法保证后面没有更多 step 修改 vars。

典型使用场景：插件在 workflow 完成后，基于最终结果发出汇总 entry。

日志触发的职责保持不变：**跨客户端的事后观察与链式反应**。

---

## 执行顺序

```
R1 服务端 RNG 纯化 ─────┐
                         ├──→ R2 roll workflow 退役
G1 groupId 分组 ─────────┤
                         ├──→ J1 judgment emitEntry
                         │
                         └──→ A3 Step 1 (RendererRegistry)
                               ├──→ A3 Step 2 (基座渲染器)
                               ├──→ A3 Step 3 (插件渲染器 dh:judgment)
                               └──→ A3 Step 4 (ChatPanel 迁移)
```

R1 和 G1 无依赖，可并行。R2 依赖 R1（需要先去掉 total 才能清理 roll workflow）。J1 依赖 G1（emitEntry 需要自动注入 groupId）。A3 Step 3 依赖 J1（需要 dh:judgment entry 类型才有东西渲染）。
