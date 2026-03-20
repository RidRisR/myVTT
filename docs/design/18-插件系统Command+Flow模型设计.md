# 插件系统重构：Command + Flow 模型

## Context

现有 RulePlugin 7 层接口存在三个根本性缺陷：插件只能声明不能执行、插件无法响应基座事件、缺乏规则系统与扩展插件之间的协作机制。

Doc 16 提出了 Pipeline + Stage + Priority 方案。经过深入讨论（详见本文末尾的讨论记录），发现 Pipeline 方案有 9 个核心概念、共享可变状态等结构性问题。

本文档提出 **Command + Flow** 模型作为替代方案——更少的概念、更清晰的职责、更自然的扩展机制。

> 本文档是 `docs/design/16-插件系统重构三层架构与Pipeline设计.md` 的演进。
> 基于 `docs/design/17-FVTT架构缺陷分析与规避策略.md` 的分析成果。

---

## 一、核心设计哲学

### 1.1 来自 FVTT 的教训

FVTT 有上百个 Hook，开发者依然 monkey-patch。根因不是 Hook 数量不够，而是 **Hook 在错误的层**——Core 提供 CRUD Hook，但模块想修改的是 Game System 的规则逻辑。Game System 不提供扩展点 → monkey-patch。

### 1.2 不追求 FVTT 级自由度

想要完全可控 + FVTT 级扩展自由度 = 不可能。我们选择：**规则系统自己决定暴露多少扩展性。** 这不是缺陷，是设计。类似 VS Code 不让插件修改核心编辑器行为——平台控制什么可以被扩展。

### 1.3 TTRPG 链式反应有限

桌游的级联效果一定会在有限步内停止（回合制、资源有限、规则设计者会避免无限循环）。因此可以在内存中执行完整条链，最后一次性提交。不需要事件队列、排队机制、循环检测。

### 1.4 提议而非直接修改

扩展插件是"提议者"而非"修改者"。它们不直接修改共享状态（Pipeline 的 ctx.data 问题），只能提议参数值。最终决定权在命令拥有者手中。

---

## 二、四个核心概念

### 2.1 Command（命令）

最小计算单元。类型化的输入 → 输出。

```typescript
interface CommandDef {
  id: string
  // 开放参数：其他插件可以为这些参数提议值
  openParams?: Record<string, OpenParamDef>
  // 执行函数：ctx 为事务上下文，flowCtx 为 Flow 共享上下文
  execute(ctx: ActionContext, flowCtx: FlowContext, openParams: ResolvedParams): Promise<void>
}

interface OpenParamDef {
  type: string // 类型标识
  default: unknown // 默认值（无提议时使用）
  description?: string // 说明
}
```

**特性：**

- 命令有明确的输入输出类型，没有隐式共享状态
- 可以声明 `openParams`，允许其他插件提议参数值，但最终用不用由命令自己决定
- 可被整体替换（`commands.replace()`）
- 所有命令执行自动被基座记录和广播

**命令替换（`commands.replace()`）：**

```typescript
// 完全替换一个已注册的命令
commands.replace<DamageInput, DamageOutput>('dh:damage', {
  // 替换命令可以声明自己的 openParams（不继承原命令的）
  openParams: {
    damageMultiplier: { type: 'number', default: 1 },
    armorPenetration: { type: 'number', default: 0 },
  },
  async execute(ctx, input, openParams) {
    // 全新的实现
  },
})
```

**替换语义：**

- 同一命令 ID 只能有一个替换者，多个替换 → 冲突，GM 选择
- 替换命令的 `openParams` 独立于原命令（替换者自己声明开放什么）
- 已有的 Proposal 如果目标 paramName 在新命令中不存在 → 基座警告并忽略该提议
- 引用该命令的 Flow 步骤自动使用替换后的实现（通过 commandId 查找）

**示例：**

```typescript
// Daggerheart 规则系统注册伤害命令
commands.register<DamageInput, DamageOutput>('dh:damage', {
  openParams: {
    damageMultiplier: { type: 'number', default: 1, description: '伤害倍率' },
  },

  async execute(ctx, input, openParams) {
    const finalDamage = input.baseDamage * openParams.damageMultiplier
    ctx.mutate(input.targetId, {
      ruleData: { health: { hp: { current: input.currentHp - finalDamage } } },
    })
    return { finalDamage }
  },
})
```

### 2.2 Proposal（提议）

对命令的 openParam 提供值的机制。

```typescript
interface ProposalDef<TInput> {
  commandId: string
  paramName: string
  // 根据命令的输入和当前事务上下文计算提议值
  resolve(ctx: ReadonlyActionContext, input: TInput): unknown
}

// Proposal 的 resolve 只能读取实体状态，不能写入
interface ReadonlyActionContext {
  getEntity(id: string): Entity // 可读取事务中的脏数据
}
```

**规则：**

- 每个 openParam 同时只能有一个提议者
- 两个插件提议同一个参数 → 冲突，基座检测并报错，GM 选择使用哪个
- 提议是可选的——无人提议时使用 openParam 的默认值

**为什么不支持多提议者链式组合？**

FVTT 需要 libWrapper 来协调多个模块 patch 同一个方法，根因是 Game System 不提供扩展 API，模块只能绕过去。在我们的设计中，规则作者主动设计 openParams——如果预见到某个数值会被多方影响（如伤害倍率同时受"易伤"和"护甲"影响），应该拆成多个独立 openParam（`vulnerabilityMultiplier`、`armorMultiplier`），而非让多个提议者竞争同一个参数。组合问题是规则作者的 API 设计责任，不是基座的机制问题。

**示例：**

```typescript
// 扩展插件：条件追踪器
proposals.register<DamageInput>('dh:damage', 'damageMultiplier', (ctx, input) => {
  const target = ctx.getEntity(input.targetId)
  if (hasCondition(target, 'vulnerable')) return 2
  return 1 // 无修改，使用默认值
})
```

### 2.3 Flow（工作流）

命令的有序队列。任何插件都可以注册自己的 Flow——规则系统注册游戏动作流程（如攻击），扩展插件也可以注册独立工作流（如战斗日志归档）。命名空间天然区分来源（`dh:attack` vs `ext:combat-log`）。

```typescript
interface FlowDef {
  id: string
  steps: FlowStep[]
}

interface FlowStep {
  id: string // 步骤标识（用于 insert/remove/replace）
  commandId: string // 关联的命令
}
```

**设计哲学：**

- **暴露 Flow = "我认为这些步骤可以被修改"**
- **不暴露 Flow，直接用单命令 = "这是黑盒，想改就整个换掉"**
- 插件自愿决定暴露什么——这是 API 设计，不是强制的
- 扩展插件可以 `insertAfter`、`insertBefore`、`remove`、`replace` Flow 中的步骤
- 干预 Flow 的前提是知道目标步骤的 ID——**step ID 和 command ID 就是 API 契约**
- 修改后果由修改者（扩展插件）负责

**步骤间数据传递——共享 Flow Context：**

Flow 启动时打包一个共享 context 对象，所有步骤串行操作同一个 context：

```typescript
interface FlowContext {
  [key: string]: unknown // 步骤可读取和添加数据
}
```

执行流程：

1. Flow 启动，创建初始 `flowCtx`（由调用者提供启动参数）
2. 每个步骤接收 `flowCtx`，可以读取和添加新字段
3. 步骤串行执行，不存在并发竞争
4. 基座在每个步骤执行后记录 context diff + 步骤提供者（命名空间），用于审计
5. Flow 执行完毕，Transaction 一次性 commit

与 Pipeline `ctx.data` 的区别：Pipeline 中多个 handler 并发竞争修改同一个对象（靠 priority 排序）；Flow context 是串行队列，一步一步走，没有竞争。审计日志提供了 Pipeline 方案没有的可观测性。

**示例：**

```typescript
// Daggerheart 定义攻击流程
flows.register('dh:attack', [
  { id: 'roll', commandId: 'dh:roll' },
  { id: 'check', commandId: 'dh:check' },
  { id: 'calc-damage', commandId: 'dh:calc-damage' },
  { id: 'apply-damage', commandId: 'dh:apply-damage' },
  { id: 'death-check', commandId: 'dh:death-check' },
])

// 扩展插件也可以注册自己的独立工作流
flows.register('ext:combat-log-archive', [
  { id: 'collect', commandId: 'ext:collect-round-data' },
  { id: 'format', commandId: 'ext:format-log' },
  { id: 'save', commandId: 'ext:save-to-journal' },
])

// 扩展插件修改规则系统的 Flow
flows.insertAfter('dh:attack', 'apply-damage', {
  id: 'ext:log-damage',
  commandId: 'ext:log-damage',
})
flows.remove('dh:attack', 'death-check')
flows.replace('dh:attack', 'calc-damage', {
  id: 'ext:alt-calc-damage',
  commandId: 'ext:alt-calc-damage',
})
```

### 2.4 Transaction（事务）

一次用户操作 = 一个事务。利用 TTRPG 链式反应有限的假设，在内存中执行完整流程，最后一次性提交。

```typescript
interface ActionContext {
  // 读：从内存快照读（包含之前步骤的修改）
  getEntity(id: string): Entity

  // 写：收集到 changeset（不立即写入数据库）
  mutate(entityId: string, patch: DeepPartial<Entity>): void

  // 基座能力
  roll(formula: string): Promise<RollResult>
  announce(content: string): void

  // 执行其他命令（在同一事务内，最大嵌套深度 16）
  exec<TInput, TOutput>(commandId: string, input: TInput): Promise<TOutput>
}
```

**执行流程：**

```
用户点击"攻击"
  → 基座创建 Transaction
  → 基座查找 Flow 'dh:attack'
  → 按步骤顺序执行每个 Command（共享同一个 Transaction）
    → 每个 Command 的 ctx.mutate() 收集变更（不写数据库）
    → ctx.getEntity() 能读到之前步骤的修改（内存中的脏数据）
  → Flow 执行完毕
  → Transaction.commit()
    → 一次性 REST batch 写入
    → 一次性 Socket.io 广播
    → 广播命令执行记录
```

---

## 三、广播系统

系统级能力：命令执行记录在 Transaction commit 成功后批量广播。

```typescript
interface CommandLog {
  commandId: string
  input: unknown
  output: unknown
  openParams: Record<string, unknown>
  timestamp: number
}

// 插件可订阅广播（只读）
broadcasts.on('commandExecuted', (log: CommandLog) => {
  // 观察，不能修改
})

// 可选：将命令日志发到聊天框
broadcasts.on('commandExecuted', (log) => {
  if (log.commandId === 'dh:damage') {
    ctx.announce(`造成 ${log.output.finalDamage} 点伤害`)
  }
})
```

---

## 四、扩展性层次

| 想做的事           | 方式                                           | 粒度 |
| ------------------ | ---------------------------------------------- | ---- |
| 替换整个动作       | `commands.replace()`                           | 粗   |
| 修改动作的某一步   | `flows.replace()`                              | 中   |
| 在动作中插入新步骤 | `flows.insertAfter()` / `flows.insertBefore()` | 中   |
| 移除动作的某一步   | `flows.remove()`                               | 中   |
| 影响某步的参数     | `proposals.register()`                         | 细   |
| 观察发生了什么     | `broadcasts.on()`                              | 只读 |
| 想做的事没有入口   | 接受限制，或要求规则作者开放更多 Flow          | —    |

---

## 五、三层架构（沿用 Doc 16）

```
┌─────────────────────────────────────────────────────┐
│  扩展插件 (Extension Plugins)                        │
│  proposals / flows.insert / broadcasts.on            │
│  可注册独立 commands + flows（ext: 命名空间）        │
├─────────────────────────────────────────────────────┤
│  规则系统 (Rule System) — 二层基座                    │
│  commands.register / flows.register                  │
│  定义游戏命令和工作流（dh: 等规则命名空间）          │
├─────────────────────────────────────────────────────┤
│  基座 (Base Platform) — 运行时内核                    │
│  Command 注册表、Flow 执行器、Transaction            │
│  Proposal 解析、广播系统、UI 骨架                    │
└─────────────────────────────────────────────────────┘
```

**基座职责：**

- Command 注册表（注册、替换、查找）
- Flow 执行器（按步骤顺序执行、步骤间数据传递）
- Transaction 管理（changeset 收集、commit、batch REST + Socket broadcast）
- Proposal 解析（收集提议值、冲突检测）
- 广播系统（命令执行记录 + 订阅）
- 基本类型检查（Flow 步骤间输入输出兼容性）
- UI 骨架（插槽注册，见 Doc 17 §9 的 PluginSlot 方案）
- 数据存储/同步（REST + Socket.io + SQLite）
- 服务端掷骰

**基座不知道 HP、伤害、条件等任何规则概念。**

**插件加载生命周期：**

```
1. 基座初始化（Command 注册表、Flow 执行器、Transaction 管理就绪）
2. 规则系统加载 → commands.register() / flows.register()
3. 扩展插件加载 → proposals.register() / flows.insertAfter() / broadcasts.on()
```

三层按顺序加载，确保扩展插件注册 Proposal 时目标命令已存在。若扩展插件引用不存在的 commandId → 基座报错。

---

## 六、与 Doc 16 Pipeline 方案的对比

|                | Doc 16 Pipeline                        | Command + Flow                         |
| -------------- | -------------------------------------- | -------------------------------------- |
| 核心概念数量   | 9 个                                   | 4 个                                   |
| 扩展方式       | 往 Stage 添加 handler                  | 替换命令 / 操作 Flow / 提议参数        |
| 共享状态       | ctx.data 共享可变对象，多 handler 竞争 | Flow Context 串行操作，无竞争，有审计  |
| 冲突处理       | priority 排序（多 handler 共存）       | 同一目标只允许一个实现，冲突时 GM 选择 |
| 扩展点由谁决定 | 规则系统声明 Stage 列表                | 规则系统自愿暴露 Flow                  |
| 批量写入       | 需要特殊 RESOLVE 阶段语义              | Transaction 自然收集所有 mutation      |
| 事件排队       | 需要事件队列 + 递归检测                | 不需要，链在内存中同步执行             |
| 链式反应       | Hook → System → 事件队列               | 命令调用命令，同一事务内               |

---

## 七、Daggerheart 攻击完整示例

```typescript
// ── 命令注册 ──
// 每个命令接收 (ctx: ActionContext, flowCtx: FlowContext)
// flowCtx 是共享上下文，步骤串行操作，可读取和添加字段

commands.register('dh:roll', {
  async execute(ctx, flowCtx) {
    flowCtx.rollResult = await ctx.roll(flowCtx.formula)
  },
})

commands.register('dh:check', {
  async execute(ctx, flowCtx) {
    const { rollResult, dc } = flowCtx
    const hit = rollResult.total >= dc
    const [hopeDie, fearDie] = rollResult.terms[0].results
    let outcome: DaggerheartOutcome
    if (hopeDie === fearDie) outcome = 'critical_success'
    else if (hit && hopeDie > fearDie) outcome = 'success_hope'
    else if (hit) outcome = 'success_fear'
    else outcome = hopeDie > fearDie ? 'failure_hope' : 'failure_fear'
    flowCtx.hit = hit
    flowCtx.outcome = outcome
  },
})

commands.register('dh:calc-damage', {
  openParams: {
    damageMultiplier: { type: 'number', default: 1 },
  },
  async execute(ctx, flowCtx, openParams) {
    const baseDamage = flowCtx.rollResult.total
    flowCtx.finalDamage = baseDamage * openParams.damageMultiplier
  },
})

commands.register('dh:apply-damage', {
  async execute(ctx, flowCtx) {
    const target = ctx.getEntity(flowCtx.targetId)
    const currentHp = target.ruleData.health.hp.current
    const newHp = Math.max(0, currentHp - flowCtx.finalDamage)
    ctx.mutate(flowCtx.targetId, {
      ruleData: { health: { hp: { current: newHp } } },
    })
  },
})

commands.register('dh:death-check', {
  async execute(ctx, flowCtx) {
    const target = ctx.getEntity(flowCtx.targetId)
    if (target.ruleData.health.hp.current <= 0) {
      const conditions = target.ruleData.conditions?.active ?? []
      if (!conditions.includes('downed')) {
        ctx.mutate(flowCtx.targetId, {
          ruleData: { conditions: { active: [...conditions, 'downed'] } },
        })
      }
    }
  },
})

// ── Flow 注册 ──

// flowCtx 初始值由调用者提供: { targetId, dc, formula, attackAttribute }
flows.register('dh:attack', [
  { id: 'roll', commandId: 'dh:roll' },
  { id: 'check', commandId: 'dh:check' },
  { id: 'calc-damage', commandId: 'dh:calc-damage' },
  { id: 'apply-damage', commandId: 'dh:apply-damage' },
  { id: 'death-check', commandId: 'dh:death-check' },
])

// ── 扩展插件 ──

// 条件插件：易伤翻倍
proposals.register('dh:calc-damage', 'damageMultiplier', (ctx, flowCtx) => {
  const target = ctx.getEntity(flowCtx.targetId)
  if (hasCondition(target, 'vulnerable')) return 2
  return 1
})

// 日志插件：插入日志步骤
commands.register('ext:log-damage', {
  async execute(ctx, flowCtx) {
    const target = ctx.getEntity(flowCtx.targetId)
    ctx.announce(`${target.name} 受到 ${flowCtx.finalDamage} 点伤害`)
  },
})
flows.insertAfter('dh:attack', 'apply-damage', {
  id: 'ext:log',
  commandId: 'ext:log-damage',
})
```

---

## 八、FVTT 缺陷覆盖度

| #   | FVTT 缺陷             | Command + Flow 的状态                                 |
| --- | --------------------- | ----------------------------------------------------- |
| 1   | Monkey-patching       | ✅ 命令替换 + Flow 操作取代 patch                     |
| 2   | Hook 无优先级/async   | ✅ 不需要 Hook（命令替换模型）                        |
| 3   | 派生数据              | ⚠️ 搁置，暂用同步计算                                 |
| 4   | ActiveEffect 浅层覆写 | ✅ 效果在命令代码中实现                               |
| 5   | 客户端执行            | ✅ 确认客户端执行，安全边界在服务端 REST              |
| 6   | Roll 结构缺失         | ✅ 已有结构化 RollResult                              |
| 7   | 模块冲突              | ✅ 同一目标只允许一个实现，冲突检测                   |
| 8   | 批量操作              | ✅ Transaction 自然批量 commit                        |
| 9   | UI 扩展               | ⚠️ 与 Command/Flow 正交，沿用 Doc 17 §9 的 PluginSlot |

---

## Assumptions

- TTRPG 链式反应一定在有限步内停止（回合制、资源有限）
- 房间同时只有一个规则系统激活
- 同一个 openParam 只能有一个提议者
- 基座不理解任何规则概念
- 插件自愿决定哪些动作暴露为 Flow（不限于规则系统）

## Edge Cases

- 命令执行中抛出异常 → Transaction 中断，已收集的 mutation 全部丢弃（回滚）。`ctx.roll()` 的结果不可回滚（服务端已执行），但不会持久化。`ctx.announce()` 的消息缓冲在事务中，仅在 commit 成功后发送
- 扩展插件删除 Flow 中的关键步骤导致后续步骤输入缺失 → 基座类型检查报错 or 运行时报错，扩展插件负责
- 同一事务中 ctx.getEntity() 读到脏数据（之前步骤的 mutate 结果）→ 这是设计意图，允许链式计算
- `ctx.exec()` 嵌套深度超过 16 → 基座抛出 MaxDepthExceeded 异常，事务回滚。这是防御性限制，正常 TTRPG 链不会触及此上限

## 九、模式层——规则系统 SDK 与最佳实践

原语层（Command + Flow + Proposal + Transaction）提供了机制，但如果规则作者不知道怎么用好它们，最终会退化成一个巨大命令 + 没有 Flow + 没有 openParams——和没有扩展系统一样。

**类比：HTTP 是原语，REST 是模式。** 没有 REST 规范，大家也会用 HTTP，但用法千奇百怪。

需要提供的模式层内容：

- **规则系统 SDK**：脚手架、类型定义、示例模板
- **Flow 设计指南**："如果你的动作有多步且每步可能被修改 → 暴露为 Flow"
- **openParam 设计指南**："如果某个数值可能被外部影响 → 拆成独立 openParam，不要合并"
- **命名约定**：`{system}:{verb}` 如 `dh:attack`，扩展插件用 `ext:{name}` 或 `{plugin}:{verb}`
- **参考实现**：完整的 Daggerheart 规则系统作为范例

> 这些内容在实现第一个规则系统时落地，空想不如实战。

---

## 待细化

1. Transaction commit 失败时的处理策略
2. UI 层扩展的具体设计（PluginSlot 的 props 协议）
3. VTTPlugin 接口如何改造以适配 Command + Flow 模型
4. 现有 RulePlugin → 新模型的渐进迁移路径
5. 基座的命令注册表是全局的还是 per-room 的？（规则系统按 ruleSystemId 切换）

---

## 附录：讨论记录

### 关键讨论路径

1. **Doc 16 Pipeline 方案的问题** → 9 个概念、共享可变状态、线性限制
2. **Hook-Only 方案** → 概念简单，但扩展点由规则系统控制
3. **"内核态"讨论** → Pipeline 放基座的优势（事务/事件队列/权限/可观测性）都可以通过显式 API 代替
4. **FVTT 的根本问题** → Hook 在错误的层，不是数量不够
5. **ctx 隔离模型** → 每个 Hook 只允许一次写入，排队执行 → 排队导致复杂度爆炸
6. **无中间 Hook 模型** → 工具函数替代响应式 Hook → 简单但缺乏扩展性
7. **TTRPG 链有限** → 内存事务 + 一次性 commit 可行
8. **命令模型** → 所有计算包装为命令，可替换不可修改
9. **Flow = 自愿暴露的命令队列** → 规则系统控制暴露什么
10. **提议机制** → 扩展插件提议参数，命令拥有者决定是否采纳
11. **Flow 不限于规则系统** → 任何插件可注册独立 Flow，命名空间区分来源
12. **共享 Flow Context** → 替代 accumulator + mapInput，串行队列无竞争，审计每步 diff
13. **一个提议者的合理性** → FVTT 需要 libWrapper 是因为缺乏 API，我们的规则作者就是 API 设计者，组合问题通过拆分 openParams 解决
14. **模式层的必要性** → 原语不够，需要 SDK + 最佳实践引导规则作者设计好 API，否则退化成巨大命令。在实现第一个规则系统时落地
