# 插件系统重构：三层架构 + Pipeline 驱动

## Context

现有 RulePlugin 7 层接口存在三个根本性缺陷：

1. 插件只能"声明"不能"执行"（ActionContext 缺失）
2. 插件无法被动响应基座事件（Hook 缺失）
3. 缺乏规则系统与扩展插件之间的协作机制（Pipeline 缺失）

本文档重新设计插件系统的整体架构，引入三层架构（基座 → 规则系统 → 扩展插件），以 Component + Hook + Pipeline + ActionContext 为核心机制。

> 本文档是 `docs/design/11-规则插件系统架构设计.md` 的演进。
> 基于 `docs/design/15-插件动作系统架构分析.md` 的讨论成果。

---

## 一、三层架构

```
┌─────────────────────────────────────────────┐
│  扩展插件 (Extension Plugins)                │
│  Hook into Pipeline stages with priority     │
│  例：自动标记、伤害日志、条件自动化            │
├─────────────────────────────────────────────┤
│  规则系统 (Rule System) — 二层基座            │
│  定义 Pipeline、Component schema、Actions     │
│  例：Daggerheart、D&D 5e、CoC               │
├─────────────────────────────────────────────┤
│  基座 (Base Platform) — 运行时内核            │
│  数据存储、HookManager、Pipeline 执行器       │
│  UI 骨架、地图渲染、ActionContext 构建        │
└─────────────────────────────────────────────┘
```

### 1.1 基座 = 运行时内核

- 数据存储/同步（REST + Socket.io + SQLite）
- 服务端掷骰
- HookManager（统一管理基座事件 + 插件事件）
- Pipeline 执行器（按 Stage 顺序执行 handler，管理 Context Object）
- ActionContext 构建（注入基座能力）
- Component 查询（`hasComponent`）
- 空间查询（`getTokensInRange`）
- UI 骨架（容器框架，插槽注册）
- 地图渲染（react-konva）

**基座不知道 HP、伤害、Hope、条件等任何规则概念。**

### 1.2 规则系统 = 二层基座

规则系统是一个普通插件，但通过房间配置 `ruleSystemId` 被选中后，承担"二层基座"职责：

- **定义 Pipeline**：声明动作的多阶段流程（如 VALIDATE → PREPARE → ROLL → CHECK → RESOLVE → NOTIFY）
- **定义 Component Schema**：声明实体可用的 Component 类型（health、attributes、conditions...）
- **注册 Actions**：定义规则特有的动作（攻击、施法、检定...）
- **注册 Systems**：响应 Hook 执行规则逻辑（死亡检查、条件过期...）
- **提供 UI**：角色卡、骰子面板、团队面板等规则相关 UI
- **提供 Adapters**：资源条、状态标签等数据适配

**规则系统 = 定义"游戏怎么玩"。**

### 1.3 扩展插件 = 附加功能

扩展插件不定义 Pipeline，而是 Hook into 规则系统定义的 Pipeline Stage：

```typescript
// 扩展插件示例：自动伤害日志
plugin.hookStage('attack', 'RESOLVE', {
  priority: 100, // 在规则系统 handler 之后执行
  handler(ctx) {
    const { actor, target, damage } = ctx
    ctx.announce(`${actor.name} 对 ${target.name} 造成了 ${damage} 点伤害`)
  },
})
```

扩展插件与规则系统共用 VTTPlugin 接口，只是角色不同。

---

## 二、核心概念

### 2.1 Component（组件 = 数据）

Component 是实体 `ruleData` 中的结构化数据片段，只是数据，没有行为。

- `components` 数组是显式能力索引，基座可快速查询 `hasComponent(entity, 'health')`
- Component 由创建时的模板决定，也可运行时动态添加/移除
- 全部由插件定义，基座不定义任何 Component

```typescript
// PC ruleData
{
  components: ['health', 'hopeEconomy', 'conditions', 'attributes'],
  health: { hp: { current: 10, max: 15 }, armorThresholds: { major: 7, severe: 13 } },
  hopeEconomy: { hope: 3, maxHope: 6 },
  conditions: { active: [] },
  attributes: { agility: 3, strength: 1 }
}

// NPC ruleData — 不同的 Component 集合
{
  components: ['health', 'conditions', 'difficulty'],
  health: { hp: { current: 8, max: 8 } },
  conditions: { active: [] },
  difficulty: { value: 12 }
}
```

### 2.2 Hook（钩子 = 事件触发点）

统一 HookManager，两类事件：

**基座事件**（基座触发，~10 个，固定）：

- `preCreateEntity(entityData)` — 干预型
- `postCreateEntity(entity)`
- `preUpdateEntity(entityId, patch)` — 干预型，可修改 patch
- `postUpdateEntity(entityId, entity)`
- `postDeleteEntity(entityId)`
- `postRoll(rollResult)`
- `postMessage(chatMessage)`
- `postSceneChange(sceneId)`
- `postCombatStart(combatInfo)` / `postCombatEnd()`
- `preTargetFilter(candidates, action, actor)` — 干预型

**插件事件**（插件触发，带命名空间前缀，按需定义）：

- `daggerheart:conditionAdded` / `daggerheart:conditionRemoved`
- `daggerheart:damageDealt` / `daggerheart:entityDowned`
- `daggerheart:hopeGained`
- ...

### 2.3 Pipeline + Stage（流水线 = 多阶段动作执行）

**这是本设计的核心创新。** Pipeline 解决了"规则系统为什么特殊"的问题。

#### 为什么需要 Pipeline？

简单的 `action.execute(ctx)` 是一个黑盒——扩展插件无法在动作执行的中间环节介入。Pipeline 将动作拆分为多个 Stage，每个 Stage 是一个明确的干预点。

#### Pipeline 定义（由规则系统提供）

```typescript
// Daggerheart 规则系统定义的 "attack" Pipeline
const attackPipeline: PipelineDef = {
  id: 'attack',
  stages: ['VALIDATE', 'PREPARE', 'ROLL', 'CHECK', 'CALC_DAMAGE', 'RESOLVE', 'NOTIFY'],
}
```

#### Context Object（管道上下文）

一个可变数据对象，在 Pipeline 的所有 Stage 之间流动：

```typescript
interface PipelineContext {
  // 基座注入的能力（不可变）
  actor: Entity
  targets: TargetInfo[]
  role: 'GM' | 'PL'
  getEntity(id: string): Entity | null
  hasComponent(entityId: string, component: string): boolean
  roll(formula: string): Promise<RollResult>
  updateEntity(id: string, patch: Partial<Entity>): Promise<void>
  announce(content: string): void

  // 管道流动数据（各 Stage 读写）
  data: Record<string, unknown>

  // 控制流
  abort(reason: string): void
  isAborted: boolean
}
```

#### Stage Handler 注册（规则系统 + 扩展插件）

```typescript
// 规则系统注册核心 Stage handler
plugin.registerStageHandler('attack', 'VALIDATE', {
  priority: 0, // 规则系统 = 默认优先级
  handler(ctx) {
    if (!ctx.hasComponent(ctx.actor.id, 'attributes')) {
      ctx.abort('角色没有属性数据')
    }
  }
})

plugin.registerStageHandler('attack', 'ROLL', {
  priority: 0,
  handler(ctx) {
    const result = await ctx.roll('2d12')
    ctx.data.rollResult = result
  }
})

plugin.registerStageHandler('attack', 'RESOLVE', {
  priority: 0,
  handler(ctx) {
    // 只有 RESOLVE 阶段写入数据库
    await ctx.updateEntity(target.id, { ... })
  }
})

// 扩展插件 Hook into 已有 Stage
extensionPlugin.registerStageHandler('attack', 'CALC_DAMAGE', {
  priority: 50, // 在规则系统之后执行
  handler(ctx) {
    // 例：条件"易伤"使伤害翻倍
    if (targetHasCondition(ctx, 'vulnerable')) {
      ctx.data.damage *= 2
    }
  }
})
```

#### Pipeline 执行流程

```
用户点击"攻击"
  → 基座构建 PipelineContext
  → 按 Stage 顺序执行：
    VALIDATE: [规则系统 handler (p:0)]
    PREPARE:  [规则系统 handler (p:0)]
    ROLL:     [规则系统 handler (p:0)]
    CHECK:    [规则系统 handler (p:0), 扩展插件 handler (p:50)]
    CALC_DAMAGE: [规则系统 handler (p:0), 扩展插件 handler (p:50)]
    RESOLVE:  [规则系统 handler (p:0)]  ← 原子提交，写入数据库
    NOTIFY:   [规则系统 handler (p:0), 日志插件 handler (p:100)]
  → 任何 Stage 调用 ctx.abort() 则中断后续
```

### 2.4 ActionDef（动作定义）

ActionDef 现在关联到 Pipeline：

```typescript
interface ActionDef {
  id: string
  name: string
  icon?: React.ComponentType
  category?: string
  pipelineId: string // 关联到规则系统定义的 Pipeline
  availability?: { actorRequires?: string[] }
  targeting?: {
    mode: 'single' | 'multiple' | 'none'
    requires?: string[]
    filter?: 'enemy' | 'ally' | 'any'
  }
  // 不再需要 execute —— Pipeline 的 Stage handlers 就是执行逻辑
  prepareContext?: (ctx: PipelineContext) => void // 可选：在 Pipeline 开始前填充初始数据
}
```

### 2.5 System（系统 = 事件响应逻辑）

System = Hook handler + Component 查询。响应基座事件，而非 Pipeline Stage。

```typescript
plugin.registerSystem({
  id: 'dh:death-check',
  on: 'postUpdateEntity',
  requires: ['health'],
  handler(ctx, entityId, entity) {
    if (entity.ruleData.health.hp.current <= 0) {
      // 添加 down 条件 + 触发领域事件
    }
  },
})
```

System 和 Pipeline Stage handler 的区别：

- **System**：响应基座事件（postUpdateEntity 等），被动触发
- **Stage handler**：响应 Pipeline 执行中的阶段，主动流程的一部分

### 2.6 ActionContext vs PipelineContext

- **ActionContext**：为无 Pipeline 的简单动作准备（如 UI 切换、面板打开等不涉及规则的操作）
- **PipelineContext**：继承 ActionContext 的基座能力 + Pipeline 流动数据 + 控制流

---

## 三、Pipeline 类型安全

### 问题

`ctx.data: Record<string, unknown>` 类型太弱。Stage handler 读写 `ctx.data.damage` 时没有编译时检查，容易拼错字段名或类型不匹配。

### 方案：泛型 PipelineDef + 类型化 Context

每个 Pipeline 定义一个专属的 Data 类型，`PipelineContext<T>` 是泛型：

```typescript
// ── 基座提供的泛型基础设施 ──

interface PipelineContext<TData = Record<string, unknown>> {
  // 基座注入（不可变）
  actor: Entity
  targets: TargetInfo[]
  role: 'GM' | 'PL'
  getEntity(id: string): Entity | null
  hasComponent(entityId: string, component: string): boolean
  roll(formula: string): Promise<RollResult>
  updateEntity(id: string, patch: Partial<Entity>): Promise<void>
  announce(content: string): void

  // 类型化的流动数据
  data: TData

  // 控制流
  abort(reason: string): void
  isAborted: boolean
}

interface PipelineDef<TData = Record<string, unknown>> {
  id: string
  stages: string[]
  createInitialData(): TData // 工厂函数，确保初始类型正确
}

interface StageHandlerDef<TData = Record<string, unknown>> {
  pipelineId: string
  stage: string
  priority: number
  handler: (ctx: PipelineContext<TData>) => void | Promise<void>
}
```

### 规则系统定义类型化 Pipeline

```typescript
// ── Daggerheart 插件内部定义 ──

interface AttackPipelineData {
  // PREPARE 阶段填充
  attackAttribute: string
  attackFormula: string
  targetDifficulty: number

  // ROLL 阶段填充
  rollResult?: { hopeDie: number; fearDie: number; total: number }

  // CHECK 阶段填充
  hit?: boolean
  outcome?: DaggerheartOutcome

  // CALC_DAMAGE 阶段填充
  damageFormula?: string
  rawDamage?: number
  thresholdResult?: 'minor' | 'major' | 'severe'
  finalHpLoss?: number

  // RESOLVE 阶段消费
  hopeChange?: number
}

const attackPipeline: PipelineDef<AttackPipelineData> = {
  id: 'dh:attack',
  stages: ['VALIDATE', 'PREPARE', 'ROLL', 'CHECK', 'CALC_DAMAGE', 'RESOLVE', 'NOTIFY'],
  createInitialData: () => ({
    attackAttribute: '',
    attackFormula: '',
    targetDifficulty: 0,
  }),
}
```

### 扩展插件的类型获取

扩展插件通过导入规则系统的类型来获得类型安全：

```typescript
// 扩展插件
import type { AttackPipelineData } from 'daggerheart/pipelines'

plugin.registerStageHandler<AttackPipelineData>('dh:attack', 'CALC_DAMAGE', {
  priority: 50,
  handler(ctx) {
    // ctx.data.rawDamage 是 number | undefined，编译时安全
    if (ctx.data.rawDamage && targetHasCondition(ctx, 'vulnerable')) {
      ctx.data.rawDamage *= 2 // ✅ 类型正确
    }
  },
})
```

### 类型安全的边界

- 规则系统内部：完全类型安全（定义 Pipeline + Data 类型 + Stage handler）
- 扩展插件：通过 import type 获得类型安全（需要规则系统导出类型）
- 基座 Pipeline 执行器：运行时泛型擦除，内部用 `unknown`，类型安全由调用方保证

---

## 四、Daggerheart Pipeline 实例

### 4.1 攻击 Pipeline（dh:attack）

完整展示从"玩家点击攻击"到"目标扣血"的全流程：

```typescript
// ── Pipeline 定义 ──
const attackPipeline: PipelineDef<AttackPipelineData> = {
  id: 'dh:attack',
  stages: ['VALIDATE', 'PREPARE', 'ROLL', 'CHECK', 'CALC_DAMAGE', 'RESOLVE', 'NOTIFY'],
  createInitialData: () => ({
    attackAttribute: '',
    attackFormula: '',
    targetDifficulty: 0,
  }),
}

// ── ActionDef ──
const meleeAttackAction: ActionDef = {
  id: 'dh:melee-attack',
  name: '近战攻击',
  icon: SwordIcon,
  pipelineId: 'dh:attack',
  availability: { actorRequires: ['attributes'] },
  targeting: { mode: 'single', requires: ['health'], filter: 'enemy' },
  prepareContext(ctx) {
    ctx.data.attackAttribute = 'strength' // 近战默认用力量
    ctx.data.attackFormula = `2d12+@strength`
  },
}

// ── Stage Handlers（规则系统注册）──

// VALIDATE：检查行动者是否有能力攻击
registerStageHandler<AttackPipelineData>('dh:attack', 'VALIDATE', {
  priority: 0,
  handler(ctx) {
    if (!ctx.hasComponent(ctx.actor.id, 'attributes')) {
      ctx.abort('角色没有属性数据')
    }
    if (ctx.targets.length === 0) {
      ctx.abort('没有选择目标')
    }
  },
})

// PREPARE：读取目标难度值
registerStageHandler<AttackPipelineData>('dh:attack', 'PREPARE', {
  priority: 0,
  handler(ctx) {
    const target = ctx.targets[0].entity
    const difficulty = target.ruleData?.difficulty?.value ?? 12
    ctx.data.targetDifficulty = difficulty
  },
})

// ROLL：执行 2d12 + 属性掷骰
registerStageHandler<AttackPipelineData>('dh:attack', 'ROLL', {
  priority: 0,
  async handler(ctx) {
    const result = await ctx.roll(ctx.data.attackFormula)
    // 解析 Hope/Fear 双骰
    const [hopeDie, fearDie] = result.terms[0].results
    ctx.data.rollResult = {
      hopeDie,
      fearDie,
      total: result.total,
    }
  },
})

// CHECK：判定成败 + Hope/Fear 经济
registerStageHandler<AttackPipelineData>('dh:attack', 'CHECK', {
  priority: 0,
  handler(ctx) {
    const { hopeDie, fearDie, total } = ctx.data.rollResult!
    const dc = ctx.data.targetDifficulty

    const hit = total >= dc
    ctx.data.hit = hit

    // Daggerheart 判定：Hope/Fear 经济
    if (hopeDie === fearDie) {
      ctx.data.outcome = 'critical_success'
      ctx.data.hopeChange = 1
    } else if (hit && hopeDie > fearDie) {
      ctx.data.outcome = 'success_hope'
      ctx.data.hopeChange = 1
    } else if (hit) {
      ctx.data.outcome = 'success_fear'
      ctx.data.hopeChange = 0
    } else if (hopeDie > fearDie) {
      ctx.data.outcome = 'failure_hope'
      ctx.data.hopeChange = 0
    } else {
      ctx.data.outcome = 'failure_fear'
      ctx.data.hopeChange = 0
    }

    if (!hit) return // 未命中，跳过后续伤害计算（CALC_DAMAGE 检查 hit）
  },
})

// CALC_DAMAGE：伤害计算 + 护甲阈值判定
registerStageHandler<AttackPipelineData>('dh:attack', 'CALC_DAMAGE', {
  priority: 0,
  async handler(ctx) {
    if (!ctx.data.hit) return // 未命中则跳过

    // 掷伤害骰（示例：1d10+proficiency）
    const damageRoll = await ctx.roll(ctx.data.damageFormula ?? '1d10+@proficiency')
    ctx.data.rawDamage = damageRoll.total

    // 护甲阈值判定
    const target = ctx.targets[0].entity
    const armor = target.ruleData?.armor ?? 0
    const majorThreshold = armor + (target.ruleData?.tier ?? 1)
    const severeThreshold = majorThreshold + 5 // 简化示例

    if (ctx.data.rawDamage >= severeThreshold) {
      ctx.data.thresholdResult = 'severe'
      ctx.data.finalHpLoss = 3
    } else if (ctx.data.rawDamage >= majorThreshold) {
      ctx.data.thresholdResult = 'major'
      ctx.data.finalHpLoss = 2
    } else {
      ctx.data.thresholdResult = 'minor'
      ctx.data.finalHpLoss = 1
    }
  },
})

// RESOLVE：原子写入数据库（唯一的写入点）
registerStageHandler<AttackPipelineData>('dh:attack', 'RESOLVE', {
  priority: 0,
  async handler(ctx) {
    // 1. 扣除目标 HP
    if (ctx.data.hit && ctx.data.finalHpLoss) {
      const target = ctx.targets[0].entity
      const currentHp = target.ruleData?.hp?.current ?? 0
      await ctx.updateEntity(target.id, {
        ruleData: {
          ...target.ruleData,
          hp: { ...target.ruleData?.hp, current: Math.max(0, currentHp - ctx.data.finalHpLoss) },
        },
      })
      // → 触发 postUpdateEntity Hook → death-check System
    }

    // 2. 更新 Hope 池
    if (ctx.data.hopeChange && ctx.data.hopeChange > 0) {
      const currentHope = ctx.actor.ruleData?.hope ?? 0
      const maxHope = 6
      await ctx.updateEntity(ctx.actor.id, {
        ruleData: {
          ...ctx.actor.ruleData,
          hope: Math.min(maxHope, currentHope + ctx.data.hopeChange),
        },
      })
    }
  },
})

// NOTIFY：发送聊天消息
registerStageHandler<AttackPipelineData>('dh:attack', 'NOTIFY', {
  priority: 0,
  handler(ctx) {
    const target = ctx.targets[0].entity
    if (ctx.data.hit) {
      ctx.announce(
        `${ctx.actor.name} 攻击 ${target.name}：` +
          `${ctx.data.outcome}，造成 ${ctx.data.finalHpLoss} HP 伤害（${ctx.data.thresholdResult}）`,
      )
    } else {
      ctx.announce(`${ctx.actor.name} 攻击 ${target.name}：未命中（${ctx.data.outcome}）`)
    }
  },
})
```

### 4.2 属性检定 Pipeline（dh:check）— 更简单的流程

```typescript
interface CheckPipelineData {
  attribute: string
  formula: string
  rollResult?: { hopeDie: number; fearDie: number; total: number }
  outcome?: DaggerheartOutcome
  hopeChange?: number
}

const checkPipeline: PipelineDef<CheckPipelineData> = {
  id: 'dh:check',
  stages: ['VALIDATE', 'ROLL', 'CHECK', 'RESOLVE', 'NOTIFY'],
  createInitialData: () => ({ attribute: '', formula: '' }),
}

// 6 个 ActionDef，每个属性一个
const agilityCheckAction: ActionDef = {
  id: 'dh:check-agility',
  name: '敏捷检定',
  pipelineId: 'dh:check',
  availability: { actorRequires: ['attributes'] },
  targeting: { mode: 'none' },
  prepareContext(ctx) {
    ctx.data.attribute = 'agility'
    ctx.data.formula = '2d12+@agility'
  },
}

// Stage handlers 比 attack 少——没有 PREPARE、CALC_DAMAGE
// ROLL 和 CHECK 逻辑相同，RESOLVE 只更新 Hope
```

### 4.3 扩展插件 Hook 示例

```typescript
// 扩展插件："自动条件追踪器"
// Hook into attack Pipeline 的 CALC_DAMAGE 阶段

import type { AttackPipelineData } from 'daggerheart/pipelines'

const conditionTrackerPlugin: VTTPlugin = {
  id: 'dh-ext:condition-tracker',
  name: 'Condition Tracker',
  sdkVersion: '2',

  stageHandlers: [
    {
      pipelineId: 'dh:attack',
      stage: 'CALC_DAMAGE',
      priority: 50, // 在规则系统 (p:0) 之后
      handler(ctx: PipelineContext<AttackPipelineData>) {
        // 如果目标有"易伤"条件，伤害翻倍
        const target = ctx.targets[0].entity
        const conditions = target.ruleData?.conditions?.active ?? []
        if (conditions.includes('vulnerable') && ctx.data.rawDamage) {
          ctx.data.rawDamage *= 2
        }
      },
    },
    {
      pipelineId: 'dh:attack',
      stage: 'RESOLVE',
      priority: 50, // 在规则系统写入 HP 之后
      async handler(ctx: PipelineContext<AttackPipelineData>) {
        // 暴击时自动给目标添加"震慑"条件
        if (ctx.data.outcome === 'critical_success') {
          const target = ctx.targets[0].entity
          const conditions = target.ruleData?.conditions?.active ?? []
          if (!conditions.includes('stunned')) {
            await ctx.updateEntity(target.id, {
              ruleData: {
                ...target.ruleData,
                conditions: { active: [...conditions, 'stunned'] },
              },
            })
          }
        }
      },
    },
  ],

  // 扩展插件也可以注册 System 响应事件
  systems: [
    {
      id: 'dh-ext:condition-expiry',
      on: 'postCombatEnd',
      handler() {
        // 战斗结束时清除所有临时条件
      },
    },
  ],
}
```

### 4.4 Pipeline 与 System 的协作

```
攻击 Pipeline 执行:
  RESOLVE → ctx.updateEntity(target, { hp: 0 })
           ↓
  基座触发 postUpdateEntity Hook
           ↓
  death-check System（requires: ['health']）
    → 发现 hp <= 0
    → ctx.updateEntity(target, { conditions: [..., 'downed'] })
    → 触发插件事件 daggerheart:entityDowned
           ↓
  其他 System 可响应 daggerheart:entityDowned
    → 例：自动通知 GM、播放音效、更新 Token 外观
```

事件队列确保：RESOLVE 阶段的所有 updateEntity 完成后，再批量触发 postUpdateEntity Hook，避免中间状态不一致。

---

## 五、VTTPlugin 统一接口

所有插件（规则系统、扩展插件、UI 插件）共用同一接口：

```typescript
interface VTTPlugin {
  id: string
  name: string
  sdkVersion: '2'

  // ── 数据层 ──
  components?: ComponentDef[] // Component Schema 定义
  entityTemplates?: EntityTemplateDef[] // 实体预设模板

  // ── 逻辑层 ──
  pipelines?: PipelineDef[] // Pipeline 定义（通常只有规则系统提供）
  stageHandlers?: StageHandlerDef[] // Stage handler 注册
  systems?: SystemDef[] // Hook handler（事件响应）
  actions?: ActionDef[] // 动作注册

  // ── UI 层 ──
  ui?: {
    panels?: PluginPanelDef[]
    dockTabs?: DockTabDef[]
    gmTabs?: GMTabDef[]
    menuItems?: ContextMenuItem[]
  }

  // ── 适配器（基座 UI 数据桥接）──
  adapters?: {
    getMainResource?(entity: Entity): ResourceView | null
    getPortraitResources?(entity: Entity): ResourceView[]
    getStatuses?(entity: Entity): StatusView[]
    getFormulaTokens?(entity: Entity): Record<string, number>
  }

  // ── 骰子系统（独占，由规则系统提供）──
  diceSystem?: {
    evaluateRoll?(rolls: number[][], total: number): JudgmentResult | null
    getDieStyles?(terms: DiceTermResult[]): DieStyle[]
    getJudgmentDisplay?(result: JudgmentResult): JudgmentDisplay
    getModifierOptions?(): ModifierOption[]
    rollCommands?: Record<string, { resolveFormula(expr?: string): string }>
    rollCardRenderers?: Record<string, React.ComponentType<RollCardProps>>
  }

  // ── 生命周期 ──
  onActivate?(ctx: PluginContext): void
  onDeactivate?(): void
}
```

**规则系统和扩展插件的区别不在接口，而在角色**：

- 规则系统：提供 `pipelines`，定义 Component schema，注册核心 Stage handler
- 扩展插件：不提供 `pipelines`，Hook into 已有 Pipeline 的 Stage

---

## 六、设计理念

1. **三层架构**：基座（内核）→ 规则系统（二层基座，定义规则框架）→ 扩展插件（附加功能）
2. **Pipeline 驱动**：复杂动作拆分为多阶段流水线，每个阶段是明确的干预点
3. **基座不提供语义化 API**：基座不理解规则概念，领域操作由插件内部封装
4. **所有插件平等**：共用 VTTPlugin 接口，"规则系统"是角色而非类型
5. **事件驱动**：VTT 是回合制低频交互，不需要帧驱动
6. **UI 全部可插件化**：基座只提供 UI 骨架容器，所有内容由插件注册
7. **原子提交**：Pipeline 的 RESOLVE 阶段是唯一的数据库写入点，确保一致性
8. **Context Object 模式**：可变数据对象在 Stage 间流动，取代函数参数传递

---

## 七、动作生命周期

```
① 动作注册    插件声明 ActionDef（关联 pipelineId）
② 可用性检查  基座：actorRequires Component 过滤 → Hook: preActionAvailable
③ 目标选择    基座：targeting.requires Component 过滤 → Hook: preTargetFilter → UI
④ Pipeline    基座：构建 PipelineContext → 按 Stage 顺序执行所有注册 handler
              VALIDATE → PREPARE → ROLL → CHECK → ... → RESOLVE → NOTIFY
⑤ 事件传播    RESOLVE 写入触发 postUpdateEntity → System handler → 事件队列
```

### 事件队列

Hook handler / System handler 内部调用 `ctx.updateEntity()` 时产生新事件，入队而非立即触发，确保执行时世界状态稳定。防止循环触发。

---

## 八、与现有架构的映射

| 现有 RulePlugin                     | 新 VTTPlugin                                  |
| ----------------------------------- | --------------------------------------------- |
| Layer 1: Adapters                   | adapters（可叠加）                            |
| Layer 2: Character UI               | ui.panels                                     |
| Layer 3: Dice System                | diceSystem（独占）                            |
| Layer 4: Data Templates             | entityTemplates                               |
| Layer 5: UI Surfaces                | ui.\*                                         |
| Layer 6: Element Hiding             | 移除                                          |
| Layer 7: Rule Resolution (reserved) | pipelines + stageHandlers + systems + actions |

新增：Pipeline/Stage、ActionContext/PipelineContext、Hook System、Component、空间查询、事件队列。

---

## Assumptions

- 房间同时只有一个规则系统激活（`ruleSystemId` 单选）
- Pipeline 是线性的（Stage 按固定顺序执行，无条件跳转或分支）
- 同一 Stage 内多个 handler 按 priority 串行执行（非并行）
- 扩展插件信任规则系统的 Pipeline 结构不会在运行时改变
- 基座事件（~10 个）足以覆盖所有需要被动响应的场景
- Component 命名空间由规则系统约定，无全局注册表冲突检测
- 所有数据库写入集中在 RESOLVE 阶段，其他阶段只读

## Edge Cases

- **Pipeline abort 后的清理**：如果 VALIDATE 通过但 ROLL 阶段 abort，已经执行的 Stage handler 副作用（如 UI 反馈）需要回滚吗？当前设计假设 RESOLVE 前无副作用
- **同 priority handler 的执行顺序**：当规则系统和扩展插件注册了相同 priority 的 handler，执行顺序是否确定？需要定义稳定排序规则（如注册顺序）
- **事件队列循环**：System A 更新实体触发 System B，System B 又更新实体触发 System A — 需要最大递归深度限制或循环检测
- **扩展插件修改关键数据**：扩展插件在 CALC_DAMAGE 阶段将伤害设为负数（回血）— Pipeline 是否需要 Stage 后置校验？
- **多目标 Pipeline**：当前示例都是单目标，多目标时 Pipeline 是为每个目标执行一次，还是一次处理所有目标？
- **规则系统热切换**：房间运行中更换 `ruleSystemId` 时，已注册的 Pipeline/System/Component 如何清理？
- **离线/断连时的 Pipeline 执行**：RESOLVE 阶段的 `updateEntity` 网络失败时如何处理？

---

## 九、待细化问题

1. 事件队列实现：同步/微任务？最大递归深度？循环检测？
2. Pipeline 中 Stage handler 的异步处理（串行 vs 并行同 priority handler）
3. Adapter 叠加合并策略（多插件提供同一 Adapter 时）
4. UI 注册的布局约束和优先级
5. Component 命名冲突处理（命名空间？如 `daggerheart:health` vs `dnd5e:health`）
6. 干预型 Hook 的多 handler 优先级
7. 空间查询 API 细节（距离单位、遮挡、范围形状）
8. RulePlugin → VTTPlugin 渐进迁移路径
9. Pipeline 的动态注册（扩展插件能否定义新 Pipeline？还是只有规则系统可以？）
10. ~~Context Object 的类型安全~~ → 已解决（见第三节：泛型 PipelineDef + 类型化 Context）

---

## 十、实施计划

### Phase 1：核心基础设施

1. 实现 HookManager（基座事件注册 + 分发 + 优先级）
2. 实现 Component 查询工具（`hasComponent`）
3. 修改 `ruleData` 结构：添加 `components` 数组
4. 实现事件队列（防止 Hook 递归立即触发）

### Phase 2：Pipeline 引擎

5. 定义 PipelineDef / StageHandlerDef 接口
6. 实现 Pipeline 执行器（按 Stage 顺序，按 priority 排序 handler）
7. 实现 PipelineContext 构建（注入基座能力 + 流动数据 + abort 控制）
8. Pipeline 注册机制（规则系统声明 Pipeline，扩展插件 Hook Stage）

### Phase 3：动作系统

9. 定义 ActionDef 接口（关联 pipelineId，取代 TokenAction）
10. 实现 ActionContext 构建（无 Pipeline 的简单动作）
11. 修改 SelectionActionBar / TokenContextMenu 使用新 ActionDef + Pipeline
12. 实现目标选择流程中的 Component 过滤

### Phase 4：System 注册

13. 实现 System 注册机制（on + requires + handler）
14. 在 worldStore.updateEntity 中触发 pre/postUpdateEntity Hook
15. 在 worldStore.sendRoll 中触发 postRoll Hook

### Phase 5：Daggerheart 迁移

16. 将 DHRuleData 重构为 Component 结构
17. 定义 Daggerheart Pipeline（attack、check、damage...）
18. 将现有硬编码逻辑迁移为 Stage handler + System
19. 将掷骰流程迁移为 ActionDef + Pipeline execute
20. 迁移实体模板到新格式

### Phase 6：VTTPlugin 接口统一

21. 定义 VTTPlugin 接口
22. 渐进式将 RulePlugin 迁移到 VTTPlugin
23. 适配器叠加支持

### 关键文件

- `src/rules/types.ts` — RulePlugin 接口定义 (269 行)
- `src/rules/sdk.ts` — SDK 导出边界
- `src/rules/registry.ts` — 插件注册表
- `src/stores/worldStore.ts` — 核心数据 store，需添加 Hook 触发点
- `src/stores/uiStore.ts` — UI 状态，targeting 系统
- `src/combat/SelectionActionBar.tsx` — Token 动作栏
- `src/combat/TokenContextMenu.tsx` — Token 右键菜单
- `plugins/daggerheart/` — Daggerheart 插件，需迁移

### 验证

- 现有 Daggerheart 功能不回退（角色卡、掷骰、Token 操作）
- 新增 ActionDef + Pipeline 可执行掷骰 + 修改实体
- postUpdateEntity Hook 可触发死亡检查
- Component 查询可正确过滤目标
- 扩展插件可 Hook into Pipeline Stage
- 运行 `pnpm typecheck && pnpm lint && pnpm test`
