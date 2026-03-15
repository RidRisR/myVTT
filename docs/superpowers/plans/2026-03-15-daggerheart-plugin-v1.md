# Daggerheart 插件 v1 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Daggerheart 规则插件 v1，验证规则插件数据层（适配器、骰子系统、数据模板）端到端可用，并通过插件注册接入基座。

**Architecture:** 所有新代码写入 `plugins/daggerheart/` 目录，仅通过 `@myvtt/sdk` 别名从基座导入类型和工具。适配器层将 DHRuleData 中的 HP/Stress/Hope 转换为基座 ResourceView；骰子系统通过 `evaluateRoll` 纯函数将双 d12 结果分类为 5 种 DaggerHeart 判定结果；插件注册到 registry 后基座 `useRulePlugin('daggerheart')` 即可感知。任务 7 同步更新 ChatPanel，使 `@agility` 等属性 token 能在投骰公式中解析。

**Tech Stack:** TypeScript 5.9, React 19, Vitest 4, `@myvtt/sdk` (映射至 `src/rules/sdk.ts`)

---

## 文件结构

**新建：**
- `plugins/daggerheart/types.ts` — DHRuleData + DomainCard 接口（v1 只含适配器所需字段）
- `plugins/daggerheart/adapters.ts` — getMainResource / getPortraitResources / getStatuses / getFormulaTokens 实现
- `plugins/daggerheart/templates.ts` — createDefaultEntityData() 工厂函数
- `plugins/daggerheart/diceSystem.ts` — evaluateRoll / getDieStyles / getJudgmentDisplay / getRollActions / getModifierOptions
- `plugins/daggerheart/DaggerHeartCard.tsx` — 最小可用 EntityCard（显示 HP/Stress/Hope + 6 属性）
- `plugins/daggerheart/index.ts` — 组装并导出 `daggerheartPlugin: RulePlugin`
- `plugins/daggerheart/__tests__/adapters.test.ts`
- `plugins/daggerheart/__tests__/templates.test.ts`
- `plugins/daggerheart/__tests__/diceSystem.test.ts`

**修改：**
- `src/rules/registry.ts` — 注册 daggerheartPlugin
- `plugins/generic/index.ts` — 更新 `getFormulaTokens` 以返回 ruleData 属性
- `src/chat/ChatPanel.tsx` — 用 `plugin.adapters.getFormulaTokens` 替换 entityAdapters 调用

---

## Chunk 1: 数据逻辑层（Tasks 1-4）

### Task 1: DHRuleData 类型定义

**Files:**
- Create: `plugins/daggerheart/types.ts`

> 只需定义类型，无需测试。

- [ ] **Step 1: 创建类型文件**

创建 `plugins/daggerheart/types.ts`，内容如下（v1 仅包含适配器和骰子系统所需字段；DomainCard 等复杂结构延后至 surfaces PR）：

```typescript
// plugins/daggerheart/types.ts
// Daggerheart-specific ruleData schema.
// DomainCards, experiences, and other complex fields are deferred to the surfaces PR.

export interface DHRuleData {
  // 六维核心属性（用于 getFormulaTokens + 投骰公式 @key 解析）
  agility: number    // 敏捷
  strength: number   // 力量
  finesse: number    // 精巧
  instinct: number   // 本能
  presence: number   // 风采
  knowledge: number  // 知识

  // 成长
  tier: 1 | 2 | 3 | 4
  proficiency: number

  // 角色身份（v1 展示用）
  className: string
  ancestry: string

  // 资源（用于 getMainResource + getPortraitResources）
  hp: { current: number; max: number }
  stress: { current: number; max: number }
  hope: number
  armor: number
}
```

- [ ] **Step 2: 确认 TypeScript 通过**

在 worktree 根目录运行：

```bash
cd .worktrees/feat/daggerheart-plugin && npx tsc --noEmit 2>&1 | head -20
```

期望：无报错（或只有 plugins/daggerheart/ 以外的已知报错）。

- [ ] **Step 3: 提交**

```bash
cd .worktrees/feat/daggerheart-plugin
git add plugins/daggerheart/types.ts
git commit -m "feat: add DHRuleData type definition"
```

---

### Task 2: DH 适配器层

**Files:**
- Create: `plugins/daggerheart/adapters.ts`
- Create: `plugins/daggerheart/__tests__/adapters.test.ts`

**背景知识：** 适配器层是 RulePlugin 的 Layer 1，基座通用 UI（KonvaToken 血条、PortraitBar 资源条）通过它读取实体数据，不感知具体规则系统。`Entity.ruleData` 存储为 `unknown`，适配器负责类型断言。

- [ ] **Step 1: 编写失败测试**

创建 `plugins/daggerheart/__tests__/adapters.test.ts`：

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { makeEntity } from '../../../src/__test-utils__/fixtures'
import {
  dhGetMainResource,
  dhGetPortraitResources,
  dhGetStatuses,
  dhGetFormulaTokens,
} from '../adapters'
import type { DHRuleData } from '../types'

const makeDHEntity = (overrides?: Partial<DHRuleData>) => {
  const defaults: DHRuleData = {
    agility: 2, strength: 1, finesse: 3, instinct: 0, presence: 1, knowledge: 2,
    tier: 1, proficiency: 1,
    className: 'Ranger', ancestry: 'Elf',
    hp: { current: 15, max: 20 },
    stress: { current: 2, max: 6 },
    hope: 3,
    armor: 2,
  }
  return makeEntity({ ruleData: { ...defaults, ...overrides } })
}

describe('dhGetMainResource', () => {
  it('returns null for entity with no ruleData', () => {
    expect(dhGetMainResource(makeEntity({ ruleData: null }))).toBeNull()
  })

  it('returns HP as main resource with label "HP" and red color', () => {
    const entity = makeDHEntity({ hp: { current: 15, max: 20 } })
    const r = dhGetMainResource(entity)
    expect(r).not.toBeNull()
    expect(r!.label).toBe('HP')
    expect(r!.current).toBe(15)
    expect(r!.max).toBe(20)
    expect(r!.color).toBe('#ef4444')
  })
})

describe('dhGetPortraitResources', () => {
  it('returns empty array for entity with no ruleData', () => {
    expect(dhGetPortraitResources(makeEntity({ ruleData: null }))).toEqual([])
  })

  it('returns [HP, Stress] in that order', () => {
    const entity = makeDHEntity({ hp: { current: 10, max: 20 }, stress: { current: 3, max: 6 } })
    const resources = dhGetPortraitResources(entity)
    expect(resources).toHaveLength(2)
    expect(resources[0].label).toBe('HP')
    expect(resources[0].current).toBe(10)
    expect(resources[1].label).toBe('Stress')
    expect(resources[1].current).toBe(3)
    expect(resources[1].color).toBe('#f97316')
  })
})

describe('dhGetStatuses', () => {
  it('always returns empty array (no status system in v1)', () => {
    expect(dhGetStatuses(makeDHEntity())).toEqual([])
  })
})

describe('dhGetFormulaTokens', () => {
  it('returns empty object for entity with no ruleData', () => {
    expect(dhGetFormulaTokens(makeEntity({ ruleData: null }))).toEqual({})
  })

  it('returns all 6 attributes + proficiency as formula tokens', () => {
    const entity = makeDHEntity({
      agility: 2, strength: 1, finesse: 3, instinct: 0, presence: 1, knowledge: 2,
      proficiency: 1,
    })
    const tokens = dhGetFormulaTokens(entity)
    expect(tokens).toEqual({
      agility: 2, strength: 1, finesse: 3, instinct: 0, presence: 1, knowledge: 2,
      proficiency: 1,
    })
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run plugins/daggerheart/__tests__/adapters.test.ts 2>&1 | tail -20
```

期望：FAIL（模块不存在）。

- [ ] **Step 3: 实现适配器**

创建 `plugins/daggerheart/adapters.ts`：

```typescript
// plugins/daggerheart/adapters.ts
import type { Entity, ResourceView, StatusView } from '@myvtt/sdk'
import type { DHRuleData } from './types'

function getDH(entity: Entity): DHRuleData | null {
  if (!entity.ruleData) return null
  return entity.ruleData as DHRuleData
}

export function dhGetMainResource(entity: Entity): ResourceView | null {
  const d = getDH(entity)
  if (!d) return null
  return { label: 'HP', current: d.hp.current, max: d.hp.max, color: '#ef4444' }
}

export function dhGetPortraitResources(entity: Entity): ResourceView[] {
  const d = getDH(entity)
  if (!d) return []
  return [
    { label: 'HP', current: d.hp.current, max: d.hp.max, color: '#ef4444' },
    { label: 'Stress', current: d.stress.current, max: d.stress.max, color: '#f97316' },
  ]
}

export function dhGetStatuses(_entity: Entity): StatusView[] {
  return []
}

export function dhGetFormulaTokens(entity: Entity): Record<string, number> {
  const d = getDH(entity)
  if (!d) return {}
  return {
    agility: d.agility,
    strength: d.strength,
    finesse: d.finesse,
    instinct: d.instinct,
    presence: d.presence,
    knowledge: d.knowledge,
    proficiency: d.proficiency,
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run plugins/daggerheart/__tests__/adapters.test.ts 2>&1 | tail -10
```

期望：全部 PASS（7 个测试）。

- [ ] **Step 5: 提交**

```bash
cd .worktrees/feat/daggerheart-plugin
git add plugins/daggerheart/adapters.ts plugins/daggerheart/__tests__/adapters.test.ts
git commit -m "feat: add daggerheart adapters layer with tests"
```

---

### Task 3: DH 数据模板层

**Files:**
- Create: `plugins/daggerheart/templates.ts`
- Create: `plugins/daggerheart/__tests__/templates.test.ts`

**背景知识：** `dataTemplates.createDefaultEntityData()` 在 GM 创建新实体时被基座调用，提供规则系统对应的空白初始数据。返回值被存储到 `entity.ruleData`（JSON 序列化后进 SQLite）。

- [ ] **Step 1: 编写失败测试**

创建 `plugins/daggerheart/__tests__/templates.test.ts`：

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createDefaultDHEntityData } from '../templates'
import type { DHRuleData } from '../types'

describe('createDefaultDHEntityData', () => {
  it('returns a valid DHRuleData shape with all required fields', () => {
    const data = createDefaultDHEntityData() as DHRuleData
    // 六维属性全为 0
    expect(data.agility).toBe(0)
    expect(data.strength).toBe(0)
    expect(data.finesse).toBe(0)
    expect(data.instinct).toBe(0)
    expect(data.presence).toBe(0)
    expect(data.knowledge).toBe(0)
    // 成长默认值
    expect(data.tier).toBe(1)
    expect(data.proficiency).toBe(1)
    // 身份字段为空字符串
    expect(data.className).toBe('')
    expect(data.ancestry).toBe('')
    // 资源初始化
    expect(data.hp).toEqual({ current: 0, max: 0 })
    expect(data.stress).toEqual({ current: 0, max: 0 })
    expect(data.hope).toBe(0)
    expect(data.armor).toBe(0)
  })

  it('returns a new object on each call (not shared reference)', () => {
    const a = createDefaultDHEntityData() as DHRuleData
    const b = createDefaultDHEntityData() as DHRuleData
    a.agility = 99
    expect(b.agility).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run plugins/daggerheart/__tests__/templates.test.ts 2>&1 | tail -10
```

期望：FAIL（模块不存在）。

- [ ] **Step 3: 实现模板工厂**

创建 `plugins/daggerheart/templates.ts`：

```typescript
// plugins/daggerheart/templates.ts
import type { DHRuleData } from './types'

export function createDefaultDHEntityData(): DHRuleData {
  return {
    agility: 0,
    strength: 0,
    finesse: 0,
    instinct: 0,
    presence: 0,
    knowledge: 0,
    tier: 1,
    proficiency: 1,
    className: '',
    ancestry: '',
    hp: { current: 0, max: 0 },
    stress: { current: 0, max: 0 },
    hope: 0,
    armor: 0,
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run plugins/daggerheart/__tests__/templates.test.ts 2>&1 | tail -10
```

期望：全部 PASS（2 个测试）。

- [ ] **Step 5: 提交**

```bash
cd .worktrees/feat/daggerheart-plugin
git add plugins/daggerheart/templates.ts plugins/daggerheart/__tests__/templates.test.ts
git commit -m "feat: add daggerheart data templates layer with tests"
```

---

### Task 4: DH 骰子系统

**Files:**
- Create: `plugins/daggerheart/diceSystem.ts`
- Create: `plugins/daggerheart/__tests__/diceSystem.test.ts`

**背景知识：** DaggerHeart 骰子机制是双 d12（希望骰 + 恐惧骰），同时投出。`evaluateRoll` 接收 `DiceTermResult[]` 和 `total`，从中找出 2d12 term，取 `allRolls[0]` 为希望骰、`allRolls[1]` 为恐惧骰，结合 `ctx.dc` 判断成功/失败，综合得出 5 种结果之一。`getDieStyles` 为这两个骰子标注颜色（金色/红色）。`getJudgmentDisplay` 将结果转换为中文文本和颜色。

标准骰子公式格式：`2d12+@agility`（通过 `getRollActions` 生成）。服务端 `rollCompound` 处理表达式，返回 `termResults`；`termResults[0].allRolls` 包含两个 d12 骰子值。

**判定逻辑：**
- `hopeDie === fearDie` 且 `total >= dc` → `critical_success`（临界）
- `hopeDie > fearDie` 且 `total >= dc` → `success_hope`（乘希望而为）
- `fearDie >= hopeDie` 且 `total >= dc` → `success_fear`（带着恐惧成功）
- `hopeDie > fearDie` 且 `total < dc` → `failure_hope`（失败但有希望）
- `fearDie >= hopeDie` 且 `total < dc` → `failure_fear`（带着恐惧失败）
- 无 DC（`ctx.dc === undefined`）：按希望方向视为"成功"（`success_hope` / `success_fear` / `critical_success`）

- [ ] **Step 1: 编写失败测试**

创建 `plugins/daggerheart/__tests__/diceSystem.test.ts`：

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  dhEvaluateRoll,
  dhGetDieStyles,
  dhGetJudgmentDisplay,
  dhGetRollActions,
  dhGetModifierOptions,
} from '../diceSystem'
import { makeEntity } from '../../../src/__test-utils__/fixtures'
import type { DHRuleData } from '../types'
import type { DiceTermResult, RollContext } from '@myvtt/sdk'

// Helper: build DiceTermResult for 2d12 with given allRolls values
function makeTwoD12(hopeDie: number, fearDie: number): DiceTermResult[] {
  return [
    {
      term: { type: 'dice', sign: 1, count: 2, sides: 12 },
      allRolls: [hopeDie, fearDie],
      keptIndices: [0, 1],
      subtotal: hopeDie + fearDie,
    },
  ]
}

// Helper: build DiceTermResult for non-DH roll (1d20)
function makeOneD20(roll: number): DiceTermResult[] {
  return [
    {
      term: { type: 'dice', sign: 1, count: 1, sides: 20 },
      allRolls: [roll],
      keptIndices: [0],
      subtotal: roll,
    },
  ]
}

const emptyCtx: RollContext = { activeModifierIds: [], tempModifier: 0 }
const dc12Ctx: RollContext = { dc: 12, activeModifierIds: [], tempModifier: 0 }

describe('dhEvaluateRoll', () => {
  it('returns null for non-DaggerHeart roll (1d20)', () => {
    const terms = makeOneD20(15)
    expect(dhEvaluateRoll(terms, 15, dc12Ctx)).toBeNull()
  })

  it('critical_success: hopeDie === fearDie with total >= dc', () => {
    const terms = makeTwoD12(7, 7)
    const result = dhEvaluateRoll(terms, 14, dc12Ctx)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('daggerheart')
    if (result?.type === 'daggerheart') {
      expect(result.hopeDie).toBe(7)
      expect(result.fearDie).toBe(7)
      expect(result.outcome).toBe('critical_success')
    }
  })

  it('success_hope: hopeDie > fearDie with total >= dc', () => {
    const terms = makeTwoD12(8, 5)
    const result = dhEvaluateRoll(terms, 13, dc12Ctx)
    expect(result?.type === 'daggerheart' && result.outcome).toBe('success_hope')
  })

  it('success_fear: fearDie > hopeDie with total >= dc', () => {
    const terms = makeTwoD12(4, 9)
    const result = dhEvaluateRoll(terms, 13, dc12Ctx)
    expect(result?.type === 'daggerheart' && result.outcome).toBe('success_fear')
  })

  it('failure_hope: hopeDie > fearDie with total < dc', () => {
    const terms = makeTwoD12(7, 3)
    const result = dhEvaluateRoll(terms, 10, dc12Ctx)
    expect(result?.type === 'daggerheart' && result.outcome).toBe('failure_hope')
  })

  it('failure_fear: fearDie > hopeDie with total < dc', () => {
    const terms = makeTwoD12(3, 6)
    const result = dhEvaluateRoll(terms, 9, dc12Ctx)
    expect(result?.type === 'daggerheart' && result.outcome).toBe('failure_fear')
  })

  it('no DC: returns hope/fear direction as success', () => {
    const terms = makeTwoD12(8, 4)
    const result = dhEvaluateRoll(terms, 12, emptyCtx)
    expect(result?.type === 'daggerheart' && result.outcome).toBe('success_hope')
  })

  it('no DC + tied: returns critical_success', () => {
    const terms = makeTwoD12(6, 6)
    const result = dhEvaluateRoll(terms, 12, emptyCtx)
    expect(result?.type === 'daggerheart' && result.outcome).toBe('critical_success')
  })

  it('failure_fear: tied dice but total < dc (tie is not >, so fear direction)', () => {
    // When hopeDie === fearDie and total < dc, outcome falls to failure_fear
    // (hopeDie > fearDie is false for a tie, so the fear branch is taken)
    const terms = makeTwoD12(5, 5)
    const result = dhEvaluateRoll(terms, 10, dc12Ctx)
    expect(result?.type === 'daggerheart' && result.outcome).toBe('failure_fear')
  })
})

describe('dhGetDieStyles', () => {
  it('returns empty array for non-DH roll', () => {
    expect(dhGetDieStyles(makeOneD20(10))).toEqual([])
  })

  it('marks dieIndex 0 as Hope (gold) and dieIndex 1 as Fear (red)', () => {
    const styles = dhGetDieStyles(makeTwoD12(8, 5))
    expect(styles).toHaveLength(2)
    expect(styles[0].dieIndex).toBe(0)
    expect(styles[0].label).toBe('希望')
    expect(styles[0].color).toBe('#fbbf24')
    expect(styles[1].dieIndex).toBe(1)
    expect(styles[1].label).toBe('恐惧')
    expect(styles[1].color).toBe('#dc2626')
  })
})

describe('dhGetJudgmentDisplay', () => {
  it('returns critical severity for critical_success', () => {
    const display = dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 7, fearDie: 7, outcome: 'critical_success' })
    expect(display.severity).toBe('critical')
    expect(display.text).toBeTruthy()
  })

  it('returns success severity for success_hope', () => {
    const display = dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 8, fearDie: 5, outcome: 'success_hope' })
    expect(display.severity).toBe('success')
  })

  it('returns partial severity for success_fear', () => {
    const display = dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 4, fearDie: 9, outcome: 'success_fear' })
    expect(display.severity).toBe('partial')
  })

  it('returns failure severity for failure_hope', () => {
    const display = dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 7, fearDie: 3, outcome: 'failure_hope' })
    expect(display.severity).toBe('failure')
  })

  it('returns fumble severity for failure_fear', () => {
    const display = dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 3, fearDie: 6, outcome: 'failure_fear' })
    expect(display.severity).toBe('fumble')
  })
})

describe('dhGetRollActions', () => {
  it('returns empty array for entity with no ruleData', () => {
    expect(dhGetRollActions(makeEntity({ ruleData: null }))).toEqual([])
  })

  it('returns 6 roll actions for entity with DH ruleData', () => {
    const entity = makeEntity({
      ruleData: {
        agility: 2, strength: 1, finesse: 3, instinct: 0, presence: 1, knowledge: 2,
        tier: 1, proficiency: 1, className: '', ancestry: '',
        hp: { current: 0, max: 0 }, stress: { current: 0, max: 0 },
        hope: 0, armor: 0,
      } satisfies DHRuleData,
    })
    const actions = dhGetRollActions(entity)
    expect(actions).toHaveLength(6)
    expect(actions.map((a) => a.id)).toEqual(
      ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'],
    )
    // Each formula uses 2d12+@<attr>
    for (const action of actions) {
      expect(action.formula).toMatch(/^2d12\+@/)
    }
  })
})

describe('dhGetModifierOptions', () => {
  it('returns empty array (no modifiers in v1)', () => {
    expect(dhGetModifierOptions()).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run plugins/daggerheart/__tests__/diceSystem.test.ts 2>&1 | tail -15
```

期望：FAIL（模块不存在）。

- [ ] **Step 3: 实现骰子系统**

创建 `plugins/daggerheart/diceSystem.ts`：

```typescript
// plugins/daggerheart/diceSystem.ts
import type {
  Entity,
  DiceTermResult,
  JudgmentResult,
  JudgmentDisplay,
  DieStyle,
  RollAction,
  ModifierOption,
  RollContext,
  DaggerheartOutcome,
} from '@myvtt/sdk'
import type { DHRuleData } from './types'

// Find the 2d12 term in a roll (the Hope+Fear dice pair)
function findD12Term(
  terms: DiceTermResult[],
): DiceTermResult | null {
  return (
    terms.find(
      (tr) =>
        tr.term.type === 'dice' &&
        (tr.term as { sides: number }).sides === 12 &&
        tr.allRolls.length >= 2,
    ) ?? null
  )
}

export function dhEvaluateRoll(
  terms: DiceTermResult[],
  total: number,
  ctx: RollContext,
): JudgmentResult | null {
  const d12 = findD12Term(terms)
  if (!d12) return null

  const hopeDie = d12.allRolls[0]
  const fearDie = d12.allRolls[1]
  const effectiveTotal = total + ctx.tempModifier
  const succeeded = ctx.dc !== undefined ? effectiveTotal >= ctx.dc : true

  let outcome: DaggerheartOutcome
  if (hopeDie === fearDie && succeeded) {
    outcome = 'critical_success'
  } else if (succeeded) {
    outcome = hopeDie > fearDie ? 'success_hope' : 'success_fear'
  } else {
    outcome = hopeDie > fearDie ? 'failure_hope' : 'failure_fear'
  }

  return { type: 'daggerheart', hopeDie, fearDie, outcome }
}

export function dhGetDieStyles(terms: DiceTermResult[]): DieStyle[] {
  // Mirror findD12Term's guard: require allRolls.length >= 2 so 1d12 rolls are excluded
  const termIndex = terms.findIndex(
    (tr) =>
      tr.term.type === 'dice' &&
      (tr.term as { sides: number }).sides === 12 &&
      tr.allRolls.length >= 2,
  )
  if (termIndex === -1) return []
  return [
    { termIndex, dieIndex: 0, label: '希望', color: '#fbbf24' },
    { termIndex, dieIndex: 1, label: '恐惧', color: '#dc2626' },
  ]
}

export function dhGetJudgmentDisplay(result: JudgmentResult): JudgmentDisplay {
  if (result.type !== 'daggerheart') {
    return { text: '未知判定', color: '#64748b', severity: 'partial' }
  }
  switch (result.outcome) {
    case 'critical_success':
      return { text: '命运临界！', color: '#a78bfa', severity: 'critical' }
    case 'success_hope':
      return { text: '乘希望而为', color: '#fbbf24', severity: 'success' }
    case 'success_fear':
      return { text: '带着恐惧成功', color: '#f97316', severity: 'partial' }
    case 'failure_hope':
      return { text: '失败，但保有希望', color: '#60a5fa', severity: 'failure' }
    case 'failure_fear':
      return { text: '带着恐惧失败', color: '#ef4444', severity: 'fumble' }
  }
}

export function dhGetRollActions(entity: Entity): RollAction[] {
  if (!entity.ruleData) return []
  const attrs: Array<[string, string]> = [
    ['agility', '敏捷'],
    ['strength', '力量'],
    ['finesse', '精巧'],
    ['instinct', '本能'],
    ['presence', '风采'],
    ['knowledge', '知识'],
  ]
  return attrs.map(([key, name]) => ({
    id: key,
    name: `${name}检定`,
    formula: `2d12+@${key}`,
    targetAttributeKey: key,
  }))
}

export function dhGetModifierOptions(): ModifierOption[] {
  return []
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run plugins/daggerheart/__tests__/diceSystem.test.ts 2>&1 | tail -15
```

期望：全部 PASS（19 个测试）。

- [ ] **Step 5: 提交**

```bash
cd .worktrees/feat/daggerheart-plugin
git add plugins/daggerheart/diceSystem.ts plugins/daggerheart/__tests__/diceSystem.test.ts
git commit -m "feat: add daggerheart dice system with evaluateRoll and judgment logic"
```

---

## Chunk 2: UI 接线层（Tasks 5-7）

### Task 5: 最小化 DaggerHeartCard

**Files:**
- Create: `plugins/daggerheart/DaggerHeartCard.tsx`

**目标：** 创建一个可渲染、无崩溃的 EntityCard 实现，显示 HP/Stress/Hope 数值，6 个属性数值，以及编辑能力（点击 +/- 修改 HP/Stress/Hope）。不追求视觉设计——UI 布局将在 surfaces PR 中优化。使用 Tailwind CSS 类（遵循 CLAUDE.md），从 `@myvtt/sdk` 导入类型，不直接导入 `src/`。

注意：`onUpdate` 是 `(patch: Partial<Entity>) => void`，修改 ruleData 时传入完整新 ruleData（浅合并会丢失字段）。

- [ ] **Step 1: 创建组件**

创建 `plugins/daggerheart/DaggerHeartCard.tsx`：

```typescript
// plugins/daggerheart/DaggerHeartCard.tsx
import type { EntityCardProps } from '@myvtt/sdk'
import type { DHRuleData } from './types'

type DHPatch = { ruleData: DHRuleData }

export function DaggerHeartCard({ entity, onUpdate, readonly }: EntityCardProps) {
  const d = entity.ruleData as DHRuleData | null

  if (!d) {
    return (
      <div className="p-3 text-text-muted text-xs">
        未配置 Daggerheart 角色数据
      </div>
    )
  }

  const patch = (updates: Partial<DHRuleData>): DHPatch => ({
    ruleData: { ...d, ...updates },
  })

  const ATTRS: Array<[keyof DHRuleData, string]> = [
    ['agility', '敏捷'],
    ['strength', '力量'],
    ['finesse', '精巧'],
    ['instinct', '本能'],
    ['presence', '风采'],
    ['knowledge', '知识'],
  ]

  return (
    <div className="p-3 flex flex-col gap-3 text-text-primary text-sm">
      {/* 角色名 + 职业 */}
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-base">{entity.name}</span>
        {d.className && (
          <span className="text-text-muted text-xs">{d.className}</span>
        )}
      </div>

      {/* HP */}
      <div className="flex items-center gap-2">
        <span className="w-14 text-xs text-text-muted shrink-0">HP</span>
        <span className="text-xs text-text-muted">{d.hp.current} / {d.hp.max}</span>
        {!readonly && (
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => onUpdate(patch({ hp: { ...d.hp, current: Math.max(0, d.hp.current - 1) } }))}
              className="w-6 h-6 rounded bg-glass border border-border-glass text-text-muted hover:text-text-primary text-xs"
            >-</button>
            <button
              onClick={() => onUpdate(patch({ hp: { ...d.hp, current: Math.min(d.hp.max, d.hp.current + 1) } }))}
              className="w-6 h-6 rounded bg-glass border border-border-glass text-text-muted hover:text-text-primary text-xs"
            >+</button>
          </div>
        )}
      </div>

      {/* Stress */}
      <div className="flex items-center gap-2">
        <span className="w-14 text-xs text-text-muted shrink-0">Stress</span>
        <span className="text-xs text-text-muted">{d.stress.current} / {d.stress.max}</span>
        {!readonly && (
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => onUpdate(patch({ stress: { ...d.stress, current: Math.max(0, d.stress.current - 1) } }))}
              className="w-6 h-6 rounded bg-glass border border-border-glass text-text-muted hover:text-text-primary text-xs"
            >-</button>
            <button
              onClick={() => onUpdate(patch({ stress: { ...d.stress, current: Math.min(d.stress.max, d.stress.current + 1) } }))}
              className="w-6 h-6 rounded bg-glass border border-border-glass text-text-muted hover:text-text-primary text-xs"
            >+</button>
          </div>
        )}
      </div>

      {/* Hope */}
      <div className="flex items-center gap-2">
        <span className="w-14 text-xs text-text-muted shrink-0">Hope</span>
        <span className="text-xs text-text-muted">{d.hope}</span>
        {!readonly && (
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => onUpdate(patch({ hope: Math.max(0, d.hope - 1) }))}
              className="w-6 h-6 rounded bg-glass border border-border-glass text-text-muted hover:text-text-primary text-xs"
            >-</button>
            <button
              onClick={() => onUpdate(patch({ hope: d.hope + 1 }))}
              className="w-6 h-6 rounded bg-glass border border-border-glass text-text-muted hover:text-text-primary text-xs"
            >+</button>
          </div>
        )}
      </div>

      {/* 六维属性（只读展示） */}
      <div className="grid grid-cols-3 gap-1 border-t border-border-glass pt-2">
        {ATTRS.map(([key, label]) => (
          <div key={key} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-text-muted">{label}</span>
            <span className="text-sm font-semibold">{d[key] as number}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 确认 TypeScript 通过**

```bash
cd .worktrees/feat/daggerheart-plugin && npx tsc --noEmit 2>&1 | head -20
```

期望：无新增报错。

- [ ] **Step 3: 提交**

```bash
cd .worktrees/feat/daggerheart-plugin
git add plugins/daggerheart/DaggerHeartCard.tsx
git commit -m "feat: add minimal DaggerHeartCard (data-layer v1)"
```

---

### Task 6: 插件组装 + 注册

**Files:**
- Create: `plugins/daggerheart/index.ts`
- Modify: `src/rules/registry.ts`

**背景知识：** `registry.ts` 是基座中唯一知道 `plugins/` 目录存在的文件（见设计文档）。注册后，`useRulePlugin()` 会在 `room.ruleSystemId === 'daggerheart'` 时自动返回 DaggerHeart 插件，基座 PortraitBar 中的 `EntityCard` slot 以及 KonvaToken 血条均会随之切换。

- [ ] **Step 1: 编写测试（覆盖注册 + 关键 adapter 返回值）**

在 `src/rules/__tests__/registry.test.ts` 末尾**追加**以下 describe 块（不修改已有测试）：

```typescript
describe('daggerheartPlugin registration', () => {
  it('getRulePlugin returns daggerheart plugin after registration', () => {
    // registry.ts 启动时即已注册，直接获取
    const plugin = getRulePlugin('daggerheart')
    expect(plugin.id).toBe('daggerheart')
    expect(plugin.sdkVersion).toBe('1')
  })

  it('daggerheart adapters.getMainResource returns HP resource', () => {
    const plugin = getRulePlugin('daggerheart')
    const entity = makeEntity({
      ruleData: {
        agility: 2, strength: 1, finesse: 3, instinct: 0, presence: 1, knowledge: 2,
        tier: 1, proficiency: 1, className: 'Ranger', ancestry: 'Elf',
        hp: { current: 12, max: 20 }, stress: { current: 0, max: 6 },
        hope: 2, armor: 1,
      },
    })
    const resource = plugin.adapters.getMainResource(entity)
    expect(resource).not.toBeNull()
    expect(resource!.label).toBe('HP')
    expect(resource!.current).toBe(12)
  })

  it('daggerheart dataTemplates.createDefaultEntityData returns valid shape', () => {
    const plugin = getRulePlugin('daggerheart')
    const data = plugin.dataTemplates!.createDefaultEntityData() as any
    expect(data.hp).toEqual({ current: 0, max: 0 })
    expect(data.agility).toBe(0)
  })

  it('daggerheart diceSystem is defined', () => {
    const plugin = getRulePlugin('daggerheart')
    expect(plugin.diceSystem).toBeDefined()
    expect(typeof plugin.diceSystem!.evaluateRoll).toBe('function')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败（daggerheart 未注册）**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run src/rules/__tests__/registry.test.ts 2>&1 | tail -15
```

期望：新增的 `daggerheartPlugin registration` 组内测试 FAIL（返回 generic 或抛错）。

- [ ] **Step 3: 创建 index.ts，组装插件**

创建 `plugins/daggerheart/index.ts`：

```typescript
// plugins/daggerheart/index.ts
import type { RulePlugin } from '@myvtt/sdk'
import {
  dhGetMainResource,
  dhGetPortraitResources,
  dhGetStatuses,
  dhGetFormulaTokens,
} from './adapters'
import {
  dhGetRollActions,
  dhEvaluateRoll,
  dhGetDieStyles,
  dhGetJudgmentDisplay,
  dhGetModifierOptions,
} from './diceSystem'
import { createDefaultDHEntityData } from './templates'
import { DaggerHeartCard } from './DaggerHeartCard'

export const daggerheartPlugin: RulePlugin = {
  id: 'daggerheart',
  name: 'Daggerheart',
  sdkVersion: '1',

  adapters: {
    getMainResource: dhGetMainResource,
    getPortraitResources: dhGetPortraitResources,
    getStatuses: dhGetStatuses,
    getFormulaTokens: dhGetFormulaTokens,
  },

  characterUI: {
    EntityCard: DaggerHeartCard,
  },

  diceSystem: {
    getRollActions: dhGetRollActions,
    evaluateRoll: dhEvaluateRoll,
    getDieStyles: dhGetDieStyles,
    getJudgmentDisplay: dhGetJudgmentDisplay,
    getModifierOptions: dhGetModifierOptions,
  },

  dataTemplates: {
    createDefaultEntityData: createDefaultDHEntityData,
  },
}
```

- [ ] **Step 4: 注册插件到 registry.ts**

修改 `src/rules/registry.ts`，添加 daggerheart 导入并注册：

```typescript
// src/rules/registry.ts
// The ONLY base file that imports from plugins/. All other base files use getRulePlugin().
import type { RulePlugin } from './types'
import { genericPlugin } from '../../plugins/generic/index'
import { daggerheartPlugin } from '../../plugins/daggerheart/index'

const registry = new Map<string, RulePlugin>([
  ['generic', genericPlugin],
  ['daggerheart', daggerheartPlugin],
])

export function registerPlugin(plugin: RulePlugin): void {
  registry.set(plugin.id, plugin)
}

export function getRulePlugin(id: string): RulePlugin {
  return registry.get(id) ?? genericPlugin
}
```

- [ ] **Step 5: 运行测试，确认全部通过**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run src/rules/__tests__/registry.test.ts 2>&1 | tail -15
```

期望：全部 PASS（原有 7 个 + 新增 4 个 = 11 个测试）。

- [ ] **Step 6: 运行全套测试，确认无回归**

```bash
cd .worktrees/feat/daggerheart-plugin
npm test 2>&1 | tail -20
```

期望：所有测试 PASS。

- [ ] **Step 7: 提交**

```bash
cd .worktrees/feat/daggerheart-plugin
git add plugins/daggerheart/index.ts src/rules/registry.ts src/rules/__tests__/registry.test.ts
git commit -m "feat: assemble daggerheart plugin and register in registry"
```

---

### Task 7: 将 getFormulaTokens 接入 ChatPanel

**Files:**
- Modify: `plugins/generic/index.ts` — `getFormulaTokens` 返回 ruleData 属性
- Modify: `src/chat/ChatPanel.tsx` — 用 `plugin.adapters.getFormulaTokens` 替换 entityAdapters 调用

**背景知识：** ChatPanel 目前通过 `entityAdapters.getEntityResources/getEntityAttributes` 构建 `@key` 公式 token 映射，这绕过了插件系统。如果用户在 DaggerHeart 房间中以某个角色身份投骰并输入 `2d12+@agility`，当前代码无法解析 `@agility`（因为 DH 的 ruleData 不使用 `attributes` 字段）。修改后，ChatPanel 直接调用 `plugin.adapters.getFormulaTokens(speakerEntity)` 来获取 token 映射，不再直接访问 entityAdapters。

**同时修改：** generic 插件的 `getFormulaTokens` 目前返回 `{}`，需要更新为从 `entityAdapters.getEntityAttributes` 读取属性，维持向后兼容。

- [ ] **Step 1: 更新 generic 插件的 getFormulaTokens，追加测试**

修改 `plugins/generic/index.ts`，在 `getFormulaTokens` 实现中调用 `getEntityAttributes`：

`plugins/generic/index.ts` 顶部已有：
```typescript
import { getEntityResources, getEntityStatuses } from '../../src/shared/entityAdapters'
```
只需将 `getEntityAttributes` 追加到该现有导入行（不要重复已有名称）：
```typescript
import { getEntityResources, getEntityStatuses, getEntityAttributes } from '../../src/shared/entityAdapters'
```

然后将 adapters 对象中的 `getFormulaTokens` 替换为：
```typescript
getFormulaTokens(entity: Entity): Record<string, number> {
  const attributes = getEntityAttributes(entity)
  const result: Record<string, number> = {}
  for (const attr of attributes) {
    result[attr.key] = attr.value
  }
  return result
},
```

同时在 `src/rules/__tests__/registry.test.ts` 的 `genericPlugin adapters` describe 块末尾追加：

```typescript
it('getFormulaTokens returns attribute key-value map', () => {
  const plugin = getRulePlugin('generic')
  const entity = makeEntity({
    ruleData: {
      attributes: { STR: { value: 10 }, DEX: { value: 14 } },
    },
  })
  const tokens = plugin.adapters.getFormulaTokens(entity)
  expect(tokens['STR']).toBe(10)
  expect(tokens['DEX']).toBe(14)
})
```

- [ ] **Step 2: 运行 registry 测试，确认通过**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run src/rules/__tests__/registry.test.ts 2>&1 | tail -15
```

期望：全部 PASS（包含新增的 getFormulaTokens 测试）。

- [ ] **Step 3: 修改 ChatPanel.tsx**

找到 `src/chat/ChatPanel.tsx` 中 `activeSpeakerProps` useMemo（约第 124-133 行），修改为：

```typescript
// 在文件顶部添加导入（与其他 import 同位置）
import { useRulePlugin } from '../rules/useRulePlugin'

// 删除原有的 getEntityResources + getEntityAttributes 导入（如已无其他引用）
// 原来的导入行: import { getEntityResources, getEntityAttributes } from '../shared/entityAdapters'

// 在 ChatPanel 函数体内，现有 hooks 之后添加
const plugin = useRulePlugin()

// 替换 activeSpeakerProps useMemo：
const activeSpeakerProps = useMemo(() => {
  if (!speakerEntity) return seatProperties
  const tokens = plugin.adapters.getFormulaTokens(speakerEntity)
  return Object.entries(tokens).map(([key, value]) => ({ key, value: String(value) }))
}, [speakerEntity, seatProperties, plugin])
```

**注意：** 如果 `getEntityResources` 或 `getEntityAttributes` 在 ChatPanel 中还有其他引用，则只删除 `activeSpeakerProps` 相关的用法，保留其他引用；否则整行 import 可删除。

- [ ] **Step 4: 确认 TypeScript 通过**

```bash
cd .worktrees/feat/daggerheart-plugin && npx tsc --noEmit 2>&1 | head -20
```

期望：无新增报错。

- [ ] **Step 5: 运行全套测试，确认无回归**

```bash
cd .worktrees/feat/daggerheart-plugin
npm test 2>&1 | tail -20
```

期望：所有测试 PASS。

- [ ] **Step 6: 提交**

```bash
cd .worktrees/feat/daggerheart-plugin
git add plugins/generic/index.ts src/chat/ChatPanel.tsx src/rules/__tests__/registry.test.ts
git commit -m "feat: wire plugin getFormulaTokens into ChatPanel formula resolution"
```

---

## 验证清单

完成全部 7 个 Task 后，执行以下验证：

```bash
cd .worktrees/feat/daggerheart-plugin

# 全套测试通过
npm test

# TypeScript 无报错
npx tsc --noEmit
```

**数据层可用性证明：**

| 层 | 验证方式 |
|---|---|
| adapters（HP/Stress 血条） | `adapters.test.ts` 全部通过；基座 KonvaToken 从 `getMainResource` 读取 |
| diceSystem（双 d12 判定） | `diceSystem.test.ts` 全部通过（19 个测试覆盖所有 outcome） |
| dataTemplates（空白实体） | `templates.test.ts` 全部通过；独立对象引用验证 |
| 插件注册 | `registry.test.ts` 新增 4 个测试：注册、adapter、模板、diceSystem |
| 公式 token 解析 | `@agility` 等 token 通过 `getFormulaTokens` 正确返回；generic 向后兼容 |
