# 统一掷骰系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现玩家底部面板（常驻状态栏 + 掷骰入口）、统一 Modifier 面板（骰子配置浮层）、以及重构 action-check workflow 以支持完整的 RollConfig 数据驱动掷骰。

**Architecture:** 纯数据结构 `RollConfig` 驱动所有掷骰流程。底部面板(Region)是常驻入口，任何掷骰触发（底部面板/角色卡/聊天命令）都经过统一的 Modifier Panel(InputHandler) 收集配置，最终走同一个 action-check workflow。workflow 的 roll 步骤根据 RollConfig 执行多组骰子，resolve 步骤处理副作用（资源变动）和判定后果（hope/fear 增减）。

**Tech Stack:** React + TypeScript + zustand + Tailwind CSS + existing workflow engine + diceUtils

**Reference Mockups:**
- `nimbalyst-local/mockups/daggerheart-player-bottom-panel.mockup.html`
- `nimbalyst-local/mockups/daggerheart-modifier-panel.mockup.html` (v3)

**Reference Spec:**
- `docs/superpowers/specs/2026-04-12-player-bottom-panel-design.md`

---

## 当前进度快照（2026-04-12）

### 已完成

- `RollConfig` / `RollExecutionResult` 数据结构已落地：`plugins/daggerheart-core/rollTypes.ts`
- `rollConfigToFormula`、`rollConfigToFormulaTokens`、`buildDiceSpecs`、`assembleRollResult` 已实现并有测试覆盖
- `action-check` workflow 已改为 `modifier -> roll -> judge -> emit -> resolve`
- `DiceJudge` 与 `DHActionCheckCard` 已适配新的 `rollResult` 结构
- `bottom-center` AnchorPoint 已加入 UI 系统，相关 layout 测试已补齐
- 新版 `ModifierPanel.tsx` 已接入 `FormulaBar` / `AttributeGrid` / `ExperienceChips` / `StepperRow` / `DiceRow` / `AdvancedOptions` / `SideEffects`
- `CharacterCard.tsx` / `AttributeCell.tsx` 已切换到 `preselectedAttribute` + `skipModifier` 协议，支持 `Shift+click` 直掷
- `PlayerBottomPanel.tsx` 与 `CollapsedBar` / `AttributeTab` / `DiceTab` / `ResourceSection` 已创建并注册为 `daggerheart-core:player-bottom-panel`
- `DiceTab` 已接入统一 workflow，可通过 `initialRollConfig` 打开 ModifierPanel，`Shift+click` 直接掷骰

### 进行中

- 通用“任意公式” workflow 仍未定义；当前 `CustomTab` 聚焦结构化模板而不是自由公式解析
- 非 action-check 的聊天掷骰展示尚未统一
- 当前工作树仍有未提交改动，主要集中在模板系统接线、文档更新与测试补充

### 未开始或未接线

- 通用“任意公式” workflow
- 非 action-check 的通用聊天掷骰展示统一收口

### 已验证

- 已运行定向测试并通过：
  - `plugins/daggerheart-core/rollConfigUtils.test.ts`
  - `plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`
  - `plugins/daggerheart-core/__tests__/ui/PlayerBottomPanel.test.tsx`
  - `plugins/daggerheart/__tests__/ui/CharacterCard.test.tsx`
  - `src/ui-system/__tests__/layoutEngine.test.ts`
- 已运行 `npx tsc --noEmit`
- 已运行模板相关回归：
  - `plugins/daggerheart-core/__tests__/rollTemplateWorkflows.test.ts`
  - `plugins/daggerheart-core/__tests__/ui/PlayerBottomPanel.test.tsx`
  - `plugins/daggerheart/__tests__/templates.test.ts`
- 当前一次定向验证结果：`6` 个测试文件通过，`46` 个测试用例通过

## 任务状态总览

| Task | 状态 | 说明 |
|------|------|------|
| Task 1 | 已完成 | `rollTypes.ts` 已存在 |
| Task 2 | 已完成 | 公式转换工具与测试已通过 |
| Task 3 | 已完成 | 执行函数与测试已通过 |
| Task 4 | 已完成 | workflow 5 步重构已落地 |
| Task 5 | 已完成 | `DiceJudge` / `DHActionCheckCard` 已适配 |
| Task 6 | 已完成 | `FormulaBar.tsx` 已接入主面板 |
| Task 7 | 已完成 | `AttributeGrid` / `ExperienceChips` 已接入主面板 |
| Task 8 | 已完成 | `StepperRow` / `DiceRow` 已接入主面板 |
| Task 9 | 已完成 | `AdvancedOptions` / `SideEffects` 已完成 |
| Task 10 | 已完成 | `ModifierPanel` 已替换旧版临时实现 |
| Task 11 | 已完成 | `bottom-center` 与 layout 测试已补齐 |
| Task 12 | 已完成 | 底部面板折叠态 / 资源区已创建 |
| Task 13 | 已完成 | `Attribute` / `Dice` / `Custom` 三个 Tab 均已可用 |
| Task 14 | 已完成 | 主组件与 Region 注册已完成 |
| Task 15 | 已完成 | CharacterCard 已切换到新触发协议 |
| Task 16 | 进行中 | 类型检查与关键路径测试已通过，全量验证尚未执行 |
| Task 17 | 已完成 | `daggerheart:roll-templates` 组件、CRUD workflow、配置编辑 workflow |
| Task 18 | 已完成 | Experience 稳定 key 与模板动态引用解析 |

## 重新规划后的执行顺序

### 里程碑 A：统一掷骰入口与底部面板 v1 收尾

状态：已完成

已完成内容：
- 新版 `ModifierPanel`
- 角色卡入口协议切换
- `Shift+click` 直掷
- `PlayerBottomPanel` v1 Region
- `AttributeTab` / `DiceTab` 最小可用版本
- 资源区接线

### 里程碑 B：CustomTab 持久化与模板系统

状态：已完成

目标：把 `CustomTab` 从占位版升级为实体级模板系统。

已完成内容：
- Experience 改为稳定 `key`
- 新增 `daggerheart:roll-templates` entity component
- 增加模板 add / update / remove / reorder / edit-config workflow
- 模板配置解析为运行时 `RollConfig`
- `CustomTab.tsx` 已接入列表 / 新建 / 编辑 / 删除 / 使用

完成标准：
- 模板持久化在 entity 上，不依赖 `localStorage`
- 点击模板可进入统一 workflow
- 模板中的动态修正引用当前实体的 attribute / experience，而不是固化旧数值

### 里程碑 C：通用掷骰与聊天展示收尾

目标：补齐 `Custom` / `Dice` 之外的通用体验缺口。

1. 决定是否需要独立“任意公式” workflow
2. 统一非 action-check 的聊天掷骰展示
3. 视验收结果补 `DiceTab` 的数量/减值等增强交互

### 里程碑 D：全量回归验证

1. `npx tsc --noEmit`
2. `npx vitest run`
3. 手动验证 CharacterCard / ModifierPanel / BottomPanel 三条入口
4. 补齐新增 UI 的测试覆盖

## 当前建议

- `CustomTab` 模板系统已经可用，当前剩余工作主要是通用公式与聊天展示统一
- 模板持久化继续放在 entity component 上，避免引入另一套存储机制
- Experience 的稳定引用采用 entity-local `key`，不要把显示名直接当标识

## CustomTab 持久化设计（已确认）

### 存储位置

- 新增 entity component：`daggerheart:roll-templates`
- 适用于任意 Daggerheart entity，不限定 PC；NPC / 召唤物 / 预设实体未来可复用

### Experience 标识

经验项不再只依赖显示名，改为：

```ts
interface DHExperience {
  key: string
  name: string
  modifier: number
}
```

约束：
- `key` 仅要求在单个 entity 内唯一
- 不要求全局唯一；不同 entity 可以拥有相同的 `experience.key`
- 模板运行时通过 `(entityId, experienceKey)` 解析经验来源

### 模板结构原则

- 模板不只保存公式字符串
- 模板也不只保存最终 modifier 数值快照
- 模板应保存结构化配置，并为动态修正保存引用信息

建议方向：
- `dualityDice` / `diceGroups` / `constantModifier` / `sideEffects` 可直接持久化
- 属性修正保存 `attributeKey`
- 经验修正保存 `experienceKey`
- 可选附带 `labelSnapshot` / `modifierSnapshot` 作为 UI 容错显示

### 模板 ID

- 模板项本身使用不透明 `id`
- Experience 使用语义化 `key`
- 两者都只要求 entity-local 唯一即可

---

## File Structure

### New Files
| Path | Responsibility |
|------|---------------|
| `plugins/daggerheart-core/rollTypes.ts` | RollConfig, DiceGroup, ModifierSource, SideEffect 类型定义 |
| `plugins/daggerheart-core/rollConfigUtils.ts` | RollConfig ↔ 公式字符串互转的纯函数 |
| `plugins/daggerheart-core/rollConfigUtils.test.ts` | rollConfigUtils 单测 |
| `plugins/daggerheart-core/ui/ModifierPanel.tsx` | 重写现有临时 modifier 面板 UI（InputHandler 组件） |
| `plugins/daggerheart-core/ui/modifier/FormulaBar.tsx` | 公式栏子组件（已创建，待接入主面板） |
| `plugins/daggerheart-core/ui/modifier/AttributeGrid.tsx` | 6属性选择网格（已创建，待接入主面板） |
| `plugins/daggerheart-core/ui/modifier/ExperienceChips.tsx` | 经验药丸选择行（已创建，待接入主面板） |
| `plugins/daggerheart-core/ui/modifier/StepperRow.tsx` | 优势/劣势/常量修正步进器行（已创建，待接入主面板） |
| `plugins/daggerheart-core/ui/modifier/DiceRow.tsx` | 骰子选择行（二元骰 + 标准骰）（已创建，待接入主面板） |
| `plugins/daggerheart-core/ui/modifier/AdvancedOptions.tsx` | 高级选项折叠面板（骰面替换 + 取高取低）（已创建） |
| `plugins/daggerheart-core/ui/modifier/SideEffects.tsx` | 副作用折叠面板（资源变动配置） |
| `plugins/daggerheart-core/ui/PlayerBottomPanel.tsx` | 底部面板 Region 组件（折叠/展开 + 3 tab） |
| `plugins/daggerheart-core/ui/bottom/CollapsedBar.tsx` | 底部面板折叠态（资源速览 + 掷骰入口） |
| `plugins/daggerheart-core/ui/bottom/AttributeTab.tsx` | 属性快速掷骰 tab |
| `plugins/daggerheart-core/ui/bottom/CustomTab.tsx` | 自定义模板 tab |
| `plugins/daggerheart-core/ui/bottom/DiceTab.tsx` | 原始骰子 tab |
| `plugins/daggerheart-core/ui/bottom/ResourceSection.tsx` | 资源面板（HP/Stress/Hope/Armor） |

### Modified Files
| Path | Changes |
|------|---------|
| `plugins/daggerheart-core/index.ts` | 重构 action-check workflow 5 步、注册底部面板 Region、更新 inputHandler |
| `plugins/daggerheart-core/DiceJudge.ts` | 适配新 roll 数据结构（从 rolls 提取 hope/fear die） |
| `plugins/daggerheart-core/ui/DHActionCheckCard.tsx` | 适配新 payload 结构（显示完整公式 + 多组骰子） |
| `plugins/daggerheart/ui/CharacterCard.tsx` | 更新 handleRoll 传入属性预选信息 |
| `plugins/daggerheart/ui/AttributeCell.tsx` | 支持 Shift+click 跳过 modifier 面板 |
| `src/ui-system/regionTypes.ts` | 添加 `'bottom-center'` 到 AnchorPoint 联合类型 |
| `src/ui-system/layoutEngine.ts` | 添加 `'bottom-center'` anchor 计算逻辑 |

---

## Phase 1: 数据层（类型 + 纯函数）

### Task 1: RollConfig 类型定义

**Files:**
- Create: `plugins/daggerheart-core/rollTypes.ts`

- [ ] **Step 1: 创建 RollConfig 及相关类型**

```typescript
// plugins/daggerheart-core/rollTypes.ts
import type { DiceTerm } from '../../src/shared/diceUtils'

/** 单组骰子配置 */
export interface DiceGroup {
  /** 骰面数 */
  sides: number
  /** 骰子数量 */
  count: number
  /** 加/减 */
  operator: '+' | '-'
  /** 取高/取低 */
  keep?: { mode: 'high' | 'low'; count: number }
  /** UI 标签（如 "优势"） */
  label?: string
}

/** 修正值来源 */
export interface ModifierSource {
  /** 来源标识（如 'attribute:agility', 'experience:stealth'） */
  source: string
  /** 显示名（如 '敏捷', '潜行'） */
  label: string
  /** 数值（如 +3, -1） */
  value: number
}

/** 副作用（资源变动） */
export interface SideEffectEntry {
  /** 资源类型 */
  resource: 'hope' | 'hp' | 'stress' | 'armor'
  /** 变动量（正=增加, 负=减少） */
  delta: number
}

/** 二元骰配置 */
export interface DualityDiceConfig {
  /** 希望骰面数（默认 12） */
  hopeFace: number
  /** 恐惧骰面数（默认 12） */
  fearFace: number
}

/** Modifier 面板返回的完整掷骰配置 */
export interface RollConfig {
  /** 二元骰（null = 不投二元骰） */
  dualityDice: DualityDiceConfig | null
  /** 额外骰子组 */
  diceGroups: DiceGroup[]
  /** 修正值列表（属性、经验等） */
  modifiers: ModifierSource[]
  /** 常量修正 */
  constantModifier: number
  /** 副作用列表 */
  sideEffects: SideEffectEntry[]
  /** DC（可选，由 GM 设定或省略） */
  dc?: number
}

/** 掷骰结果中单组骰子的结果 */
export interface DiceGroupResult {
  group: DiceGroup
  /** 所有骰子的原始值 */
  allRolls: number[]
  /** 保留的骰子索引（keep 后） */
  keptIndices: number[]
  /** 该组的小计（含 operator） */
  subtotal: number
}

/** 完整的掷骰执行结果 */
export interface RollExecutionResult {
  /** 二元骰结果 [hopeDie, fearDie]（null if no duality dice） */
  dualityRolls: [number, number] | null
  /** 每组骰子的详细结果 */
  groupResults: DiceGroupResult[]
  /** 修正值总和 */
  modifierTotal: number
  /** 所有骰子 + 修正值的最终总计 */
  total: number
}

/** action-check workflow 的 vars 类型 */
export interface ActionCheckVars {
  actorId: string
  formula?: string
  rollType?: string
  /** 预选属性 key（从角色卡/底部面板传入） */
  preselectedAttribute?: string
  /** 是否跳过 modifier 面板（Shift+click） */
  skipModifier?: boolean
  /** modifier 面板返回的配置 */
  rollConfig?: RollConfig
  /** 掷骰执行结果 */
  rollResult?: RollExecutionResult
  /** 判定结果 */
  judgment?: import('../../src/rules/types').JudgmentResult | null
  dc?: number
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/daggerheart-core/rollTypes.ts
git commit -m "feat(daggerheart): define RollConfig types for unified roll system"
```

---

### Task 2: RollConfig 工具函数 — 公式生成

**Files:**
- Create: `plugins/daggerheart-core/rollConfigUtils.ts`
- Create: `plugins/daggerheart-core/rollConfigUtils.test.ts`

- [ ] **Step 1: 写 rollConfigToFormula 的测试**

```typescript
// plugins/daggerheart-core/rollConfigUtils.test.ts
import { describe, it, expect } from 'vitest'
import { rollConfigToFormula, rollConfigToFormulaTokens } from './rollConfigUtils'
import type { RollConfig } from './rollTypes'

const BASE_CONFIG: RollConfig = {
  dualityDice: { hopeFace: 12, fearFace: 12 },
  diceGroups: [],
  modifiers: [
    { source: 'attribute:agility', label: '敏捷', value: 3 },
    { source: 'experience:stealth', label: '潜行', value: 2 },
  ],
  constantModifier: 2,
  sideEffects: [],
}

describe('rollConfigToFormula', () => {
  it('generates formula string from basic config', () => {
    expect(rollConfigToFormula(BASE_CONFIG)).toBe('2d12+3+2+2')
  })

  it('handles swapped duality dice faces', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      dualityDice: { hopeFace: 20, fearFace: 12 },
      modifiers: [],
      constantModifier: 0,
    }
    expect(rollConfigToFormula(config)).toBe('1d20+1d12')
  })

  it('handles extra dice groups with operators', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      diceGroups: [
        { sides: 6, count: 1, operator: '+', label: '优势' },
        { sides: 4, count: 1, operator: '-' },
      ],
    }
    expect(rollConfigToFormula(config)).toBe('2d12+1d6-1d4+3+2+2')
  })

  it('handles keep modifiers', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      diceGroups: [
        { sides: 6, count: 3, operator: '+', keep: { mode: 'high', count: 2 } },
      ],
      modifiers: [],
      constantModifier: 0,
    }
    expect(rollConfigToFormula(config)).toBe('2d12+3d6kh2')
  })

  it('handles no duality dice', () => {
    const config: RollConfig = {
      dualityDice: null,
      diceGroups: [{ sides: 20, count: 1, operator: '+' }],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    expect(rollConfigToFormula(config)).toBe('1d20')
  })

  it('handles negative constant modifier', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      modifiers: [],
      constantModifier: -3,
    }
    expect(rollConfigToFormula(config)).toBe('2d12-3')
  })

  it('omits zero constant modifier', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      modifiers: [],
      constantModifier: 0,
    }
    expect(rollConfigToFormula(config)).toBe('2d12')
  })

  it('returns empty string for empty config', () => {
    const config: RollConfig = {
      dualityDice: null,
      diceGroups: [],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    expect(rollConfigToFormula(config)).toBe('')
  })

  it('handles negative modifier values', () => {
    const config: RollConfig = {
      ...BASE_CONFIG,
      modifiers: [
        { source: 'attr:a', label: 'A', value: 3 },
        { source: 'attr:b', label: 'B', value: -5 },
      ],
      constantModifier: 0,
    }
    // modTotal = 3 + (-5) = -2
    expect(rollConfigToFormula(config)).toBe('2d12-2')
  })
})

describe('rollConfigToFormulaTokens', () => {
  it('produces annotated tokens for formula bar display', () => {
    const tokens = rollConfigToFormulaTokens(BASE_CONFIG)
    expect(tokens).toEqual([
      { type: 'dice', text: '2d12', source: 'duality' },
      { type: 'op', text: '+' },
      { type: 'modifier', text: '3', source: '敏捷' },
      { type: 'op', text: '+' },
      { type: 'modifier', text: '2', source: '潜行' },
      { type: 'op', text: '+' },
      { type: 'constant', text: '2' },
    ])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run plugins/daggerheart-core/rollConfigUtils.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: 实现 rollConfigToFormula 和 rollConfigToFormulaTokens**

```typescript
// plugins/daggerheart-core/rollConfigUtils.ts
import type { RollConfig, DiceGroup, DualityDiceConfig } from './rollTypes'

/** 公式栏用的带注释 token */
export interface FormulaToken {
  type: 'dice' | 'modifier' | 'constant' | 'op'
  text: string
  source?: string
}

function dualityToTerms(d: DualityDiceConfig): string {
  if (d.hopeFace === d.fearFace) return `2d${d.hopeFace}`
  return `1d${d.hopeFace}+1d${d.fearFace}`
}

function diceGroupToTerm(g: DiceGroup): string {
  let s = `${g.count}d${g.sides}`
  if (g.keep) s += `k${g.keep.mode === 'high' ? 'h' : 'l'}${g.keep.count}`
  return s
}

export function rollConfigToFormula(config: RollConfig): string {
  const parts: string[] = []

  if (config.dualityDice) {
    parts.push(dualityToTerms(config.dualityDice))
  }

  for (const g of config.diceGroups) {
    const term = diceGroupToTerm(g)
    parts.push(g.operator === '-' ? `-${term}` : `+${term}`)
  }

  const modTotal = config.modifiers.reduce((sum, m) => sum + m.value, 0)
    + config.constantModifier

  if (modTotal > 0) parts.push(`+${modTotal}`)
  else if (modTotal < 0) parts.push(`${modTotal}`)

  // Join and clean up leading '+'
  return parts.join('').replace(/^\+/, '')
}

export function rollConfigToFormulaTokens(config: RollConfig): FormulaToken[] {
  const tokens: FormulaToken[] = []

  if (config.dualityDice) {
    tokens.push({
      type: 'dice',
      text: dualityToTerms(config.dualityDice),
      source: 'duality',
    })
  }

  for (const g of config.diceGroups) {
    tokens.push({ type: 'op', text: g.operator === '-' ? '-' : '+' } as FormulaToken)
    tokens.push({
      type: 'dice',
      text: diceGroupToTerm(g),
      source: g.label,
    })
  }

  for (const m of config.modifiers) {
    tokens.push({ type: 'op', text: m.value >= 0 ? '+' : '-' })
    tokens.push({
      type: 'modifier',
      text: `${Math.abs(m.value)}`,
      source: m.label,
    })
  }

  if (config.constantModifier !== 0) {
    tokens.push({ type: 'op', text: config.constantModifier > 0 ? '+' : '-' })
    tokens.push({
      type: 'constant',
      text: `${Math.abs(config.constantModifier)}`,
    })
  }

  // Remove leading '+' op
  if (tokens.length > 0 && tokens[0].type === 'op' && tokens[0].text === '+') {
    tokens.shift()
  }

  return tokens
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run plugins/daggerheart-core/rollConfigUtils.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/daggerheart-core/rollConfigUtils.ts plugins/daggerheart-core/rollConfigUtils.test.ts
git commit -m "feat(daggerheart): add rollConfig formula conversion utilities with tests"
```

---

### Task 3: RollConfig 执行函数 — 将 RollConfig 转为 serverRoll 调用参数

**Files:**
- Modify: `plugins/daggerheart-core/rollConfigUtils.ts`
- Modify: `plugins/daggerheart-core/rollConfigUtils.test.ts`

- [ ] **Step 1: 写 buildDiceSpecs 和 assembleResult 的测试**

```typescript
// 追加到 rollConfigUtils.test.ts
import { buildDiceSpecs, assembleRollResult } from './rollConfigUtils'
import type { DiceGroup } from './rollTypes'

describe('buildDiceSpecs', () => {
  it('converts RollConfig to DiceSpec array for serverRoll', () => {
    const config: RollConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [
        { sides: 6, count: 2, operator: '+' },
        { sides: 4, count: 1, operator: '-' },
      ],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    const specs = buildDiceSpecs(config)
    // 二元骰拆为两个独立 DiceSpec（因为面数可能不同）
    expect(specs).toEqual([
      { sides: 12, count: 1 },  // hope die
      { sides: 12, count: 1 },  // fear die
      { sides: 6, count: 2 },   // extra group 1
      { sides: 4, count: 1 },   // extra group 2
    ])
  })

  it('handles swapped faces', () => {
    const config: RollConfig = {
      dualityDice: { hopeFace: 20, fearFace: 12 },
      diceGroups: [],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    expect(buildDiceSpecs(config)).toEqual([
      { sides: 20, count: 1 },
      { sides: 12, count: 1 },
    ])
  })

  it('handles no duality dice', () => {
    const config: RollConfig = {
      dualityDice: null,
      diceGroups: [{ sides: 20, count: 1, operator: '+' }],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    expect(buildDiceSpecs(config)).toEqual([
      { sides: 20, count: 1 },
    ])
  })
})

describe('assembleRollResult', () => {
  it('assembles server rolls into RollExecutionResult', () => {
    const config: RollConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [
        { sides: 6, count: 2, operator: '+', keep: { mode: 'high', count: 1 } },
      ],
      modifiers: [
        { source: 'attr:agility', label: '敏捷', value: 3 },
      ],
      constantModifier: 1,
      sideEffects: [],
    }
    // serverRoll returns number[][] — one sub-array per DiceSpec
    const serverRolls: number[][] = [
      [8],   // hope die
      [5],   // fear die
      [4, 6], // 2d6
    ]
    const result = assembleRollResult(config, serverRolls)

    expect(result.dualityRolls).toEqual([8, 5])
    expect(result.groupResults).toHaveLength(1)
    expect(result.groupResults[0].allRolls).toEqual([4, 6])
    expect(result.groupResults[0].keptIndices).toEqual([1]) // keep high → index 1 (value 6)
    expect(result.groupResults[0].subtotal).toBe(6) // kept 6, operator '+'
    expect(result.modifierTotal).toBe(4) // 3 + 1
    // total = 8 + 5 + 6 + 4 = 23
    expect(result.total).toBe(23)
  })

  it('handles subtraction dice groups', () => {
    const config: RollConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [
        { sides: 4, count: 1, operator: '-' },
      ],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
    }
    const serverRolls: number[][] = [[10], [3], [2]]
    const result = assembleRollResult(config, serverRolls)
    // total = 10 + 3 - 2 = 11
    expect(result.total).toBe(11)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run plugins/daggerheart-core/rollConfigUtils.test.ts`
Expected: FAIL (functions not exported)

- [ ] **Step 3: 实现 buildDiceSpecs 和 assembleRollResult**

```typescript
// 追加到 rollConfigUtils.ts
import type { DiceSpec } from '../../src/shared/diceUtils'
import type { RollConfig, RollExecutionResult, DiceGroupResult } from './rollTypes'

/** 将 RollConfig 转为 serverRoll 需要的 DiceSpec[] */
export function buildDiceSpecs(config: RollConfig): DiceSpec[] {
  const specs: DiceSpec[] = []

  if (config.dualityDice) {
    specs.push({ sides: config.dualityDice.hopeFace, count: 1 })
    specs.push({ sides: config.dualityDice.fearFace, count: 1 })
  }

  for (const g of config.diceGroups) {
    specs.push({ sides: g.sides, count: g.count })
  }

  return specs
}

/** 将 serverRoll 返回的原始结果 + RollConfig 组装为 RollExecutionResult */
export function assembleRollResult(
  config: RollConfig,
  serverRolls: number[][],
): RollExecutionResult {
  const expectedCount = (config.dualityDice ? 2 : 0) + config.diceGroups.length
  if (serverRolls.length !== expectedCount) {
    throw new Error(
      `assembleRollResult: expected ${expectedCount} roll arrays, got ${serverRolls.length}`,
    )
  }

  let idx = 0

  // 二元骰
  let dualityRolls: [number, number] | null = null
  let dualitySum = 0
  if (config.dualityDice) {
    const hopeDie = serverRolls[idx++][0]
    const fearDie = serverRolls[idx++][0]
    dualityRolls = [hopeDie, fearDie]
    dualitySum = hopeDie + fearDie
  }

  // 额外骰子组
  const groupResults: DiceGroupResult[] = []
  for (const g of config.diceGroups) {
    const allRolls = serverRolls[idx++]
    const { keptIndices, subtotal } = applyKeepAndSum(allRolls, g)
    groupResults.push({ group: g, allRolls, keptIndices, subtotal })
  }

  // 修正值总和
  const modifierTotal =
    config.modifiers.reduce((sum, m) => sum + m.value, 0) +
    config.constantModifier

  // 最终总计
  const diceTotal = groupResults.reduce((sum, r) => sum + r.subtotal, 0)
  const total = dualitySum + diceTotal + modifierTotal

  return { dualityRolls, groupResults, modifierTotal, total }
}

function applyKeepAndSum(
  allRolls: number[],
  group: DiceGroup,
): { keptIndices: number[]; subtotal: number } {
  let keptIndices: number[]

  if (group.keep) {
    // 排序获取索引
    const indexed = allRolls.map((v, i) => ({ v, i }))
    if (group.keep.mode === 'high') {
      indexed.sort((a, b) => b.v - a.v)
    } else {
      indexed.sort((a, b) => a.v - b.v)
    }
    keptIndices = indexed.slice(0, group.keep.count).map((x) => x.i).sort((a, b) => a - b)
  } else {
    keptIndices = allRolls.map((_, i) => i)
  }

  const keptSum = keptIndices.reduce((sum, i) => sum + allRolls[i], 0)
  const subtotal = group.operator === '-' ? -keptSum : keptSum

  return { keptIndices, subtotal }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run plugins/daggerheart-core/rollConfigUtils.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/daggerheart-core/rollConfigUtils.ts plugins/daggerheart-core/rollConfigUtils.test.ts
git commit -m "feat(daggerheart): add buildDiceSpecs and assembleRollResult for workflow integration"
```

---

## Phase 2: Workflow 重构

### Task 4: 重构 action-check workflow 的 modifier + roll 步骤

**Files:**
- Modify: `plugins/daggerheart-core/index.ts:172-245`

- [ ] **Step 1: 更新 modifier step 返回 RollConfig**

将 modifier step 从只返回 `{ dc }` 改为返回完整 `RollConfig`。InputHandler 类型标识改为 `'daggerheart-core:roll-modifier'`。

```typescript
// 在 index.ts 中，替换 modifier step（约 line 172-186）
{
  id: 'modifier',
  async run(ctx) {
    const actorId = ctx.vars.actorId as string

    // 构建默认 RollConfig
    const defaultConfig: RollConfig = {
      dualityDice: { hopeFace: 12, fearFace: 12 },
      diceGroups: [],
      modifiers: [],
      constantModifier: 0,
      sideEffects: [],
      dc: ctx.vars.dc as number | undefined,
    }

    if (ctx.vars.skipModifier) {
      // Shift+click：使用预选属性直接跳过
      const preAttr = ctx.vars.preselectedAttribute as string | undefined
      if (preAttr) {
        const attrs = ctx.read.component<DHAttributes>(actorId, DH_KEYS.attributes)
        if (attrs) {
          const val = attrs[preAttr as keyof DHAttributes] ?? 0
          defaultConfig.modifiers.push({
            source: `attribute:${preAttr}`,
            label: preAttr,
            value: val,
          })
        }
      }
      ctx.vars.rollConfig = defaultConfig
      return
    }

    const result = await ctx.requestInput<RollConfig>(
      'daggerheart-core:roll-modifier',
      {
        context: {
          actorId,
          preselectedAttribute: ctx.vars.preselectedAttribute,
          defaultConfig,
        },
      },
    )

    if (!result.ok) {
      ctx.abort('Roll cancelled')
      return
    }

    ctx.vars.rollConfig = result.value
    if (result.value.dc !== undefined) {
      ctx.vars.dc = result.value.dc
    }
  },
},
```

- [ ] **Step 2: 更新 roll step 使用 RollConfig**

```typescript
// 替换 roll step（约 line 188-198）
{
  id: 'roll',
  async run(ctx) {
    const config = ctx.vars.rollConfig as RollConfig
    if (!config) {
      ctx.abort('No roll config')
      return
    }

    const specs = buildDiceSpecs(config)
    const serverRolls = await ctx.serverRoll(specs)
    const result = assembleRollResult(config, serverRolls)

    ctx.vars.rollResult = result
    ctx.vars.total = result.total
  },
},
```

- [ ] **Step 3: 更新 judge step 从 rollResult 读取二元骰**

```typescript
// 替换 judge step
{
  id: 'judge',
  async run(ctx) {
    const result = ctx.vars.rollResult as RollExecutionResult
    const dc = ctx.vars.dc as number | undefined

    if (!result.dualityRolls || dc === undefined) {
      ctx.vars.judgment = null
      return
    }

    // DiceJudge 需要 [hopeDie, fearDie] 和 total
    const rolls = [result.dualityRolls]
    ctx.vars.judgment = DiceJudge.evaluate(rolls, result.total, dc)
  },
},
```

- [ ] **Step 4: 更新 emit step 传递完整信息**

```typescript
// 替换 emit step
{
  id: 'emit',
  async run(ctx) {
    const config = ctx.vars.rollConfig as RollConfig
    const result = ctx.vars.rollResult as RollExecutionResult
    const judgment = ctx.vars.judgment as JudgmentResult | null

    ctx.emitEntry({
      type: 'daggerheart-core:action-check',
      payload: {
        formula: rollConfigToFormula(config),
        formulaTokens: rollConfigToFormulaTokens(config),
        rollConfig: config,
        rollResult: result,
        total: result.total,
        dc: ctx.vars.dc as number | undefined,
        judgment,
        display: judgment ? DiceJudge.getDisplay(judgment) : null,
        dieConfigs: result.dualityRolls
          ? [
              { color: '#fbbf24', label: t('die.hope') },
              { color: '#dc2626', label: t('die.fear') },
            ]
          : [],
      },
    })
  },
},
```

- [ ] **Step 5: 更新 resolve step 处理副作用 + hope/fear**

```typescript
// 替换 resolve step
{
  id: 'resolve',
  async run(ctx) {
    const config = ctx.vars.rollConfig as RollConfig
    const judgment = ctx.vars.judgment as JudgmentResult | null
    const actorId = ctx.vars.actorId as string

    // 1. 判定后果：hope 增加 / fear 增加
    if (judgment) {
      const outcome = judgment.outcome
      if (outcome.includes('hope') && outcome !== 'critical_success') {
        HopeResolver.addHope(ctx, actorId) // synchronous — no await
      }
      if (outcome.includes('fear') && outcome !== 'critical_success') {
        FearManager.addFear(ctx) // synchronous — no await
      }
    }

    // 2. 副作用：资源变动
    for (const fx of config.sideEffects) {
      if (fx.delta === 0) continue
      applySideEffect(ctx, actorId, fx)
    }
  },
},
```

- [ ] **Step 6: 添加 applySideEffect 辅助函数**

```typescript
// 在 index.ts 顶部或单独文件
function applySideEffect(
  ctx: WorkflowContext,
  actorId: string,
  fx: SideEffectEntry,
) {
  switch (fx.resource) {
    case 'hope': {
      ctx.updateComponent<DHExtras>(actorId, DH_KEYS.extras, (prev) => {
        const p = prev ?? { hope: 0, hopeMax: 6, armor: 0, armorMax: 6 }
        return { ...p, hope: Math.max(0, Math.min(p.hopeMax, p.hope + fx.delta)) }
      })
      break
    }
    case 'hp': {
      ctx.updateComponent<DHHealth>(actorId, DH_KEYS.health, (prev) => {
        const p = prev ?? { current: 0, max: 0 }
        return { ...p, current: Math.max(0, Math.min(p.max, p.current + fx.delta)) }
      })
      break
    }
    case 'stress': {
      ctx.updateComponent<DHStress>(actorId, DH_KEYS.stress, (prev) => {
        const p = prev ?? { current: 0, max: 0 }
        return { ...p, current: Math.max(0, Math.min(p.max, p.current + fx.delta)) }
      })
      break
    }
    case 'armor': {
      ctx.updateComponent<DHExtras>(actorId, DH_KEYS.extras, (prev) => {
        const p = prev ?? { hope: 0, hopeMax: 6, armor: 0, armorMax: 6 }
        return { ...p, armor: Math.max(0, Math.min(p.armorMax, p.armor + fx.delta)) }
      })
      break
    }
  }
}
```

- [ ] **Step 7: 添加必要的 import 语句**

在 `index.ts` 顶部添加：
```typescript
import type { RollConfig, RollExecutionResult, ActionCheckVars, SideEffectEntry } from './rollTypes'
import { buildDiceSpecs, assembleRollResult, rollConfigToFormula, rollConfigToFormulaTokens } from './rollConfigUtils'
```

- [ ] **Step 8: 运行 tsc 确认类型正确**

Run: `npx tsc --noEmit`
Expected: PASS（可能有其他无关错误，重点是 index.ts 无新增类型错误）

- [ ] **Step 9: Commit**

```bash
git add plugins/daggerheart-core/index.ts
git commit -m "refactor(daggerheart): upgrade action-check workflow to use RollConfig"
```

---

### Task 5: 更新 DiceJudge 和 DHActionCheckCard 适配新数据结构

**Files:**
- Modify: `plugins/daggerheart-core/DiceJudge.ts`
- Modify: `plugins/daggerheart-core/ui/DHActionCheckCard.tsx`

- [ ] **Step 1: DiceJudge.evaluate 签名不变**

DiceJudge.evaluate 接受 `(rolls: number[][], total: number, dc: number)` — workflow 已经把 `dualityRolls` 包装为 `[dualityRolls]` 传入，所以 DiceJudge 不需要改动。验证现有测试仍通过：

Run: `npx vitest run plugins/daggerheart-core/ --reporter=verbose`
Expected: 现有测试通过

- [ ] **Step 2: 更新 DHActionCheckCard payload 类型**

```typescript
// DHActionCheckCard.tsx — 更新 payload 解构
// 从 entry.payload 中读取新字段
const {
  formula,
  formulaTokens,
  rollResult,
  total,
  dc,
  judgment,
  display,
  dieConfigs,
} = entry.payload as {
  formula: string
  formulaTokens?: FormulaToken[]
  rollResult?: RollExecutionResult
  total: number
  dc?: number
  judgment: JudgmentResult | null
  display: JudgmentDisplay | null
  dieConfigs: Array<{ color: string; label: string }>
}
```

注意：保持向后兼容 — 旧的 payload 没有 `rollResult`/`formulaTokens`，用 `?.` 安全访问。dice 动画渲染暂时不变（后续 Phase 4 可增强）。

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart-core/DiceJudge.ts plugins/daggerheart-core/ui/DHActionCheckCard.tsx
git commit -m "fix(daggerheart): adapt DiceJudge and action check card to new payload shape"
```

---

## Phase 3: Modifier Panel UI

### Task 6: Modifier Panel 子组件 — FormulaBar

**Files:**
- Modify: `plugins/daggerheart-core/ui/modifier/FormulaBar.tsx`（已创建，按主面板接入需要继续调整）

- [ ] **Step 1: 实现 FormulaBar 组件**

```typescript
// plugins/daggerheart-core/ui/modifier/FormulaBar.tsx
import type { FormulaToken } from '../../rollConfigUtils'

interface FormulaBarProps {
  tokens: FormulaToken[]
}

const tokenColors: Record<FormulaToken['type'], string> = {
  dice: 'text-[#9070c0]',       // fear purple (dice)
  modifier: 'text-success',     // green (attribute/experience)
  constant: 'text-accent-bold', // gold
  op: 'text-text-muted/50',     // muted
}

export function FormulaBar({ tokens }: FormulaBarProps) {
  return (
    <div className="flex items-center gap-0.5 px-2.5 py-1.5 rounded-md bg-black/30 border border-border-glass min-h-[34px] flex-wrap font-mono text-sm cursor-text">
      {tokens.map((tok, i) => (
        <span key={i} className="inline-flex items-center gap-0.5 whitespace-nowrap">
          <span className={`font-bold ${tokenColors[tok.type]}`}>{tok.text}</span>
          {tok.source && (
            <span className="text-[9px] text-text-muted/40 font-sans font-normal">
              {tok.source}
            </span>
          )}
        </span>
      ))}
      {tokens.length === 0 && (
        <span className="text-text-muted/30 text-xs font-sans">点击下方控件构建公式</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/daggerheart-core/ui/modifier/FormulaBar.tsx
git commit -m "feat(daggerheart): add FormulaBar component for modifier panel"
```

---

### Task 7: Modifier Panel 子组件 — AttributeGrid + ExperienceChips

**Files:**
- Modify: `plugins/daggerheart-core/ui/modifier/AttributeGrid.tsx`（已创建）
- Modify: `plugins/daggerheart-core/ui/modifier/ExperienceChips.tsx`（已创建）

- [ ] **Step 1: 实现 AttributeGrid**

```typescript
// plugins/daggerheart-core/ui/modifier/AttributeGrid.tsx
import type { DHAttributes } from '../../../daggerheart/types'

interface AttributeGridProps {
  attributes: DHAttributes
  selected: string | null
  onSelect: (key: string | null) => void
}

const ATTR_KEYS: Array<{ key: keyof DHAttributes; label: string }> = [
  { key: 'agility', label: '敏捷' },
  { key: 'strength', label: '力量' },
  { key: 'finesse', label: '灵巧' },
  { key: 'instinct', label: '直觉' },
  { key: 'presence', label: '风度' },
  { key: 'knowledge', label: '学识' },
]

export function AttributeGrid({ attributes, selected, onSelect }: AttributeGridProps) {
  return (
    <div className="flex gap-1">
      {ATTR_KEYS.map(({ key, label }) => {
        const val = attributes[key] ?? 0
        const isSel = selected === key
        return (
          <button
            key={key}
            onClick={() => onSelect(isSel ? null : key)}
            className={`flex-1 flex flex-col items-center justify-center h-11 rounded-md border transition-colors cursor-pointer ${
              isSel
                ? 'bg-success/[0.08] border-success/30 text-success'
                : 'bg-transparent border-border-glass text-text-muted hover:bg-white/[0.04]'
            }`}
          >
            <span className="text-[9px] leading-none opacity-60">{label}</span>
            <span className="text-[15px] font-bold tabular-nums leading-tight">
              {val >= 0 ? `+${val}` : `${val}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: 实现 ExperienceChips**

```typescript
// plugins/daggerheart-core/ui/modifier/ExperienceChips.tsx
import type { DHExperiences } from '../../../daggerheart/types'

interface ExperienceChipsProps {
  experiences: DHExperiences
  selected: number | null // index into experiences.items
  onSelect: (index: number | null) => void
}

export function ExperienceChips({ experiences, selected, onSelect }: ExperienceChipsProps) {
  if (!experiences.items || experiences.items.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {experiences.items.map((exp, i) => {
        const isSel = selected === i
        return (
          <button
            key={i}
            onClick={() => onSelect(isSel ? null : i)}
            className={`flex items-center gap-1 h-[30px] px-2.5 rounded-full border text-[10px] transition-colors cursor-pointer ${
              isSel
                ? 'bg-accent/[0.08] border-accent/30 text-accent-bold'
                : 'bg-transparent border-border-glass text-text-muted hover:bg-white/[0.04]'
            }`}
          >
            <span
              className={`w-[5px] h-[5px] rounded-full ${
                isSel
                  ? 'bg-accent-bold border-accent-bold'
                  : 'border border-text-muted/30'
              }`}
            />
            <span>{exp.name}</span>
            <span className="font-semibold">
              {exp.modifier >= 0 ? `+${exp.modifier}` : exp.modifier}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart-core/ui/modifier/AttributeGrid.tsx plugins/daggerheart-core/ui/modifier/ExperienceChips.tsx
git commit -m "feat(daggerheart): add AttributeGrid and ExperienceChips for modifier panel"
```

---

### Task 8: Modifier Panel 子组件 — StepperRow + DiceRow

**Files:**
- Modify: `plugins/daggerheart-core/ui/modifier/StepperRow.tsx`（已创建）
- Modify: `plugins/daggerheart-core/ui/modifier/DiceRow.tsx`（已创建）

- [ ] **Step 1: 实现 StepperRow（优势/劣势/常量）**

```typescript
// plugins/daggerheart-core/ui/modifier/StepperRow.tsx

interface StepperProps {
  label: string
  subLabel?: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  variant?: 'default' | 'advantage' | 'disadvantage'
  /** 使用 input 替代纯文本显示 */
  inputMode?: boolean
}

function Stepper({ label, subLabel, value, min = 0, max = 10, onChange, variant = 'default', inputMode }: StepperProps) {
  const isActive = value !== 0
  const variantClasses = {
    default: '',
    advantage: isActive ? 'border-info/25 bg-info/[0.06]' : '',
    disadvantage: isActive ? 'border-danger/25 bg-danger/[0.06]' : '',
  }
  const labelColor = {
    default: 'text-text-muted',
    advantage: isActive ? 'text-info' : 'text-text-muted',
    disadvantage: isActive ? 'text-danger' : 'text-text-muted',
  }
  const valColor = {
    default: isActive ? 'text-accent-bold' : 'text-text-muted/50',
    advantage: isActive ? 'text-info' : 'text-text-muted/50',
    disadvantage: isActive ? 'text-danger' : 'text-text-muted/50',
  }

  return (
    <div
      className={`flex-1 flex items-center gap-1 h-9 px-2.5 rounded-md border border-border-glass bg-transparent ${variantClasses[variant]}`}
    >
      <span className={`text-[10px] whitespace-nowrap ${labelColor[variant]}`}>{label}</span>
      {subLabel && (
        <span className={`text-[9px] ${labelColor[variant]} opacity-40`}>{subLabel}</span>
      )}
      <div className="flex items-center gap-0.5 ml-auto">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-6 h-6 rounded border border-border-glass bg-transparent text-text-muted text-[11px] flex items-center justify-center cursor-pointer hover:bg-white/10 hover:text-text-primary transition-colors"
        >
          -
        </button>
        {inputMode ? (
          <input
            value={value >= 0 ? `+${value}` : `${value}`}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/[^-\d]/g, ''), 10)
              if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
            }}
            className="w-11 h-6 rounded border border-accent/25 bg-black/20 text-accent-bold text-[13px] font-semibold font-mono text-center outline-none focus:border-accent/50"
          />
        ) : (
          <span className={`text-sm font-bold tabular-nums min-w-[18px] text-center ${valColor[variant]}`}>
            {value}
          </span>
        )}
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-6 h-6 rounded border border-border-glass bg-transparent text-text-muted text-[11px] flex items-center justify-center cursor-pointer hover:bg-white/10 hover:text-text-primary transition-colors"
        >
          +
        </button>
      </div>
    </div>
  )
}

interface StepperRowProps {
  advantage: number
  disadvantage: number
  constant: number
  onAdvantageChange: (v: number) => void
  onDisadvantageChange: (v: number) => void
  onConstantChange: (v: number) => void
}

export function StepperRow(props: StepperRowProps) {
  return (
    <div className="flex gap-1">
      <Stepper
        label="优势" subLabel="d6"
        value={props.advantage} onChange={props.onAdvantageChange}
        variant="advantage"
      />
      <Stepper
        label="劣势" subLabel="d6"
        value={props.disadvantage} onChange={props.onDisadvantageChange}
        variant="disadvantage"
      />
      <Stepper
        label="修正"
        value={props.constant} onChange={props.onConstantChange}
        min={-20} max={20} inputMode
      />
    </div>
  )
}
```

- [ ] **Step 2: 实现 DiceRow（二元骰 + 标准骰）**

```typescript
// plugins/daggerheart-core/ui/modifier/DiceRow.tsx
import type { DiceGroup } from '../../rollTypes'

interface DiceRowProps {
  dualityEnabled: boolean
  dualityLabel: string // e.g. "2d12" or "d20+d12"
  onDualityToggle: () => void
  extraDice: Map<number, { count: number; operator: '+' | '-' }>
  onDiceClick: (sides: number) => void
  onDiceRightClick: (sides: number) => void
}

const STANDARD_DICE = [4, 6, 8, 10, 12, 20] as const

export function DiceRow({
  dualityEnabled,
  dualityLabel,
  onDualityToggle,
  extraDice,
  onDiceClick,
  onDiceRightClick,
}: DiceRowProps) {
  return (
    <div className="flex gap-1">
      {/* 二元骰 toggle */}
      <button
        onClick={onDualityToggle}
        className={`flex-1 h-[34px] rounded-md border text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
          dualityEnabled
            ? 'border-[#9070c0]/35 bg-[#9070c0]/[0.08] text-[#9070c0]'
            : 'border-border-glass bg-transparent text-text-muted hover:bg-white/[0.04]'
        }`}
      >
        <span className="flex gap-0.5">
          <span className="w-[6px] h-[6px] rounded-full bg-accent-bold" />
          <span className="w-[6px] h-[6px] rounded-full bg-[#9070c0]" />
        </span>
        {dualityLabel}
      </button>

      {/* 标准骰 */}
      {STANDARD_DICE.map((sides) => {
        const extra = extraDice.get(sides)
        return (
          <button
            key={sides}
            onClick={() => onDiceClick(sides)}
            onContextMenu={(e) => {
              e.preventDefault()
              onDiceRightClick(sides)
            }}
            className="flex-1 h-[34px] rounded-md border border-border-glass bg-transparent text-text-muted text-[11px] font-semibold flex items-center justify-center cursor-pointer transition-colors hover:bg-accent/[0.08] hover:border-accent/25 hover:text-accent relative"
          >
            d{sides}
            {extra && extra.count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 rounded-full bg-accent text-deep text-[9px] font-extrabold flex items-center justify-center px-1">
                {extra.count}
              </span>
            )}
            {extra && extra.operator === '-' && (
              <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] font-extrabold flex items-center justify-center">
                -
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart-core/ui/modifier/StepperRow.tsx plugins/daggerheart-core/ui/modifier/DiceRow.tsx
git commit -m "feat(daggerheart): add StepperRow and DiceRow components for modifier panel"
```

---

### Task 9: Modifier Panel 子组件 — AdvancedOptions + SideEffects

**Files:**
- Modify: `plugins/daggerheart-core/ui/modifier/AdvancedOptions.tsx`（已创建）
- Create: `plugins/daggerheart-core/ui/modifier/SideEffects.tsx`

- [ ] **Step 1: 实现 AdvancedOptions（骰面替换 + 取高取低）**

参考 mockup v3 的高级选项区域。折叠面板，展开后显示：
1. 骰面替换（希望骰/恐惧骰的面数下拉）
2. 每组骰子的取高/取低按钮 + 保留数量

具体代码略长（约 120 行），实现要点：
- props: `hopeFace`, `fearFace`, `diceGroups`, `onFaceChange`, `onKeepChange`
- CollapsibleSection 组件复用于 AdvancedOptions 和 SideEffects
- 骰面下拉：`[4, 6, 8, 10, 12, 20]`
- 取高/取低按钮组：`高 | 低 | 无`

- [ ] **Step 2: 实现 SideEffects（副作用资源变动）**

参考 mockup v3 的副作用区域。折叠面板，2×2 网格。
- 4 项资源：希望(Diamond)、生命(Heart)、压力(Zap)、护甲(Shield)
- 有符号值，颜色编码：负=红，正=绿
- **压力反转**：压力增长=红（恶化），压力减少=绿（恢复）
- SVG 图标 inline（不用 emoji，匹配 Lucide strokeWidth 1.5）

实现要点：
```typescript
// 压力的颜色反转逻辑
function getEffectColor(resource: string, delta: number): string {
  if (delta === 0) return 'text-text-muted/50'
  // 压力是反转的：增加=坏事(红), 减少=好事(绿)
  const isNegativeEffect = resource === 'stress' ? delta > 0 : delta < 0
  return isNegativeEffect ? 'text-danger' : 'text-success'
}
```

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart-core/ui/modifier/AdvancedOptions.tsx plugins/daggerheart-core/ui/modifier/SideEffects.tsx
git commit -m "feat(daggerheart): add AdvancedOptions and SideEffects components"
```

---

### Task 10: 重写 ModifierPanel 主组件

**Files:**
- Modify: `plugins/daggerheart-core/ui/ModifierPanel.tsx` (complete rewrite)

- [ ] **Step 1: 实现 ModifierPanel 主组件**

ModifierPanel 是 InputHandler 组件，通过 `requestInput` 挂载。它管理 `RollConfig` 状态，将子组件组合在一起。

核心状态：
```typescript
// 从 context 读取角色数据
const attributes = sdk.data.useComponent<DHAttributes>(actorId, DH_KEYS.attributes)
const experiences = sdk.data.useComponent<DHExperiences>(actorId, DH_KEYS.experiences)

// UI 状态
const [selectedAttr, setSelectedAttr] = useState<string | null>(preselectedAttribute ?? null)
const [selectedExp, setSelectedExp] = useState<number | null>(null)
const [advantage, setAdvantage] = useState(0)
const [disadvantage, setDisadvantage] = useState(0)
const [constant, setConstant] = useState(0)
const [dualityEnabled, setDualityEnabled] = useState(true)
const [hopeFace, setHopeFace] = useState(12)
const [fearFace, setFearFace] = useState(12)
const [extraDice, setExtraDice] = useState<Map<number, { count: number; operator: '+' | '-' }>>(new Map())
const [keepSettings, setKeepSettings] = useState<Map<string, { mode: 'high' | 'low'; count: number }>>( new Map())
const [sideEffects, setSideEffects] = useState<SideEffectEntry[]>([
  { resource: 'hope', delta: 0 },
  { resource: 'hp', delta: 0 },
  { resource: 'stress', delta: 0 },
  { resource: 'armor', delta: 0 },
])
```

构建 RollConfig 的 `useMemo`：
```typescript
const rollConfig = useMemo((): RollConfig => {
  const modifiers: ModifierSource[] = []

  if (selectedAttr && attributes) {
    const val = attributes[selectedAttr as keyof DHAttributes] ?? 0
    modifiers.push({ source: `attribute:${selectedAttr}`, label: ATTR_LABELS[selectedAttr], value: val })
  }

  if (selectedExp !== null && experiences?.items[selectedExp]) {
    const exp = experiences.items[selectedExp]
    modifiers.push({ source: `experience:${exp.name}`, label: exp.name, value: exp.modifier })
  }

  const diceGroups: DiceGroup[] = []

  // 优势骰
  if (advantage > 0) {
    diceGroups.push({ sides: 6, count: advantage, operator: '+', label: '优势' })
  }
  // 劣势骰
  if (disadvantage > 0) {
    diceGroups.push({ sides: 6, count: disadvantage, operator: '-', label: '劣势' })
  }
  // 额外骰子
  for (const [sides, { count, operator }] of extraDice) {
    if (count > 0) {
      const keep = keepSettings.get(`${count}d${sides}`)
      diceGroups.push({ sides, count, operator, keep: keep ?? undefined })
    }
  }

  return {
    dualityDice: dualityEnabled ? { hopeFace, fearFace } : null,
    diceGroups,
    modifiers,
    constantModifier: constant,
    sideEffects: sideEffects.filter((fx) => fx.delta !== 0),
  }
}, [selectedAttr, selectedExp, advantage, disadvantage, constant, dualityEnabled, hopeFace, fearFace, extraDice, keepSettings, sideEffects, attributes, experiences])
```

提交/取消：
```typescript
const handleRoll = () => resolve(rollConfig)
const handleCancel = () => cancel()
```

键盘快捷键：
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleRoll()
    if (e.key === 'Escape') handleCancel()
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [handleRoll, handleCancel])
```

布局参考 mockup v3：glass morphism 面板，420px 宽，section 分区。

- [ ] **Step 2: 更新 inputHandler 注册**

在 `index.ts` 中将 `'daggerheart-core:modifier'` 改为 `'daggerheart-core:roll-modifier'`：
```typescript
sdk.ui.registerInputHandler('daggerheart-core:roll-modifier', {
  component: ModifierPanel,
})
```

- [ ] **Step 3: 运行 tsc 确认无类型错误**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add plugins/daggerheart-core/ui/ModifierPanel.tsx plugins/daggerheart-core/index.ts
git commit -m "feat(daggerheart): rewrite ModifierPanel as full roll configuration UI"
```

---

## Phase 4: 底部面板 Region

### Task 11: 添加 bottom-center AnchorPoint

**Files:**
- Modify: `src/ui-system/regionTypes.ts`
- Modify: `src/ui-system/layoutEngine.ts`

- [ ] **Step 1: 扩展 AnchorPoint 类型**

```typescript
// src/ui-system/regionTypes.ts
export type AnchorPoint =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
```

- [ ] **Step 2: 在 layoutEngine 中添加 anchor 计算**

在以下三个函数中添加 `'top-center'` 和 `'bottom-center'` case：

**`anchorFactor()`:**
```typescript
case 'top-center': return { x: 0.5, y: 0 }
case 'bottom-center': return { x: 0.5, y: 1 }
```

**`anchorBase()`:**
```typescript
case 'top-center': return { x: (vw - pw) / 2, y: 0 }
case 'bottom-center': return { x: (vw - pw) / 2, y: vh - ph }
```

**`inferAnchor()`:** 添加 center-x 象限逻辑（当 x 在中间 1/3 区域时返回 top-center 或 bottom-center）

- [ ] **Step 3: 运行现有 layout 测试确认不破坏**

Run: `npx vitest run src/ui-system/__tests__/layoutEngine.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/ui-system/regionTypes.ts src/ui-system/layoutEngine.ts
git commit -m "feat(layout): extend AnchorPoint with top-center and bottom-center"
```

---

### Task 12: PlayerBottomPanel 子组件 — CollapsedBar + ResourceSection

**Files:**
- Create: `plugins/daggerheart-core/ui/bottom/CollapsedBar.tsx`
- Create: `plugins/daggerheart-core/ui/bottom/ResourceSection.tsx`

- [ ] **Step 1: 实现 CollapsedBar（28px 折叠态）**

参考底部面板 mockup Scene 1：
- 掷骰按钮（骰子图标）
- 资源速览：HP current/max、S current/max、H value、A value
- 展开按钮（chevron）

```typescript
// plugins/daggerheart-core/ui/bottom/CollapsedBar.tsx
interface CollapsedBarProps {
  hp: { current: number; max: number }
  stress: { current: number; max: number }
  hope: number
  armor: number
  onExpand: () => void
  onRollClick: () => void
}
```

- [ ] **Step 2: 实现 ResourceSection（展开态底部资源面板）**

参考 mockup：HP/Stress 带进度条 + ±按钮，Hope/Armor 带 pip 或步进器。
复用现有 `ResourceBar` 和 `PipRow` 组件模式。

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart-core/ui/bottom/CollapsedBar.tsx plugins/daggerheart-core/ui/bottom/ResourceSection.tsx
git commit -m "feat(daggerheart): add CollapsedBar and ResourceSection for bottom panel"
```

---

### Task 13: PlayerBottomPanel 子组件 — AttributeTab + DiceTab + CustomTab

**Files:**
- Create: `plugins/daggerheart-core/ui/bottom/AttributeTab.tsx`
- Create: `plugins/daggerheart-core/ui/bottom/DiceTab.tsx`
- Create: `plugins/daggerheart-core/ui/bottom/CustomTab.tsx`

- [ ] **Step 1: 实现 AttributeTab**

6 个属性卡片网格，点击触发掷骰（打开 modifier 面板，预选该属性）。Shift+click 直接掷骰跳过面板。

- [ ] **Step 2: 实现 DiceTab**

d4-d20 卡片，点击直接加入公式。

- [ ] **Step 3: 实现 CustomTab**

自定义模板列表（未来功能），当前显示空状态 + "从历史记录创建模板"占位。

- [ ] **Step 4: Commit**

```bash
git add plugins/daggerheart-core/ui/bottom/AttributeTab.tsx plugins/daggerheart-core/ui/bottom/DiceTab.tsx plugins/daggerheart-core/ui/bottom/CustomTab.tsx
git commit -m "feat(daggerheart): add tab content components for bottom panel"
```

---

### Task 14: PlayerBottomPanel 主组件 + Region 注册

**Files:**
- Create: `plugins/daggerheart-core/ui/PlayerBottomPanel.tsx`
- Modify: `plugins/daggerheart-core/index.ts` (region registration)

- [ ] **Step 1: 实现 PlayerBottomPanel 主组件**

管理折叠/展开状态、当前 tab、掷骰触发。

```typescript
// plugins/daggerheart-core/ui/PlayerBottomPanel.tsx
export function PlayerBottomPanel({ sdk }: { sdk: IRegionSDK }) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'attributes' | 'custom' | 'dice'>('attributes')

  // 读取角色数据
  const activeCharacterId = useActiveEntityId(sdk)
  const health = sdk.data.useComponent<DHHealth>(activeCharacterId ?? '', DH_KEYS.health)
  // ... 其他资源

  const handleAttributeRoll = useCallback((attrKey: string, shiftKey: boolean) => {
    if (!activeCharacterId) return
    void sdk.workflow.runWorkflow(ACTION_CHECK_HANDLE, {
      actorId: activeCharacterId,
      preselectedAttribute: attrKey,
      skipModifier: shiftKey,
    })
  }, [activeCharacterId, sdk.workflow])

  if (!expanded) {
    return <CollapsedBar ... onExpand={() => setExpanded(true)} />
  }

  return (
    <div className="...">
      {/* Tab bar */}
      {/* Tab content */}
      {/* Resource section */}
    </div>
  )
}
```

- [ ] **Step 2: 注册 Region**

在 `index.ts` 的 `onActivate` 中添加：

```typescript
sdk.ui.registerRegion({
  id: 'daggerheart-core:player-bottom-panel',
  component: PlayerBottomPanel,
  lifecycle: 'persistent',
  defaultSize: { width: 480, height: 28 },
  minSize: { width: 400, height: 28 },
  defaultPlacement: {
    anchor: 'bottom-center',
    offsetX: 0,
    offsetY: -8,
  },
  layer: 'standard',
})
```

- [ ] **Step 3: 运行 tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add plugins/daggerheart-core/ui/PlayerBottomPanel.tsx plugins/daggerheart-core/index.ts
git commit -m "feat(daggerheart): add PlayerBottomPanel region with collapsed/expanded states"
```

---

## Phase 5: 集成

### Task 15: 更新 CharacterCard 使用统一工作流

**Files:**
- Modify: `plugins/daggerheart/ui/CharacterCard.tsx`
- Modify: `plugins/daggerheart/ui/AttributeCell.tsx`

- [ ] **Step 1: 更新 CharacterCard.handleRoll 传入 preselectedAttribute**

```typescript
const handleRoll = useCallback(
  (attrKey: string) => {
    if (!activeCharacterId) return
    void sdk.workflow.runWorkflow(ACTION_CHECK_HANDLE, {
      actorId: activeCharacterId,
      preselectedAttribute: attrKey,
    })
  },
  [activeCharacterId, sdk.workflow],
)
```

- [ ] **Step 2: 更新 AttributeCell 支持 Shift+click**

```typescript
// 在 roll zone 的 onClick handler 中
onClick={(e) => {
  onRoll(e.shiftKey)
}}
```

然后 CharacterCard 的 handleRoll 签名更新：
```typescript
const handleRoll = useCallback(
  (attrKey: string, shiftKey?: boolean) => {
    if (!activeCharacterId) return
    void sdk.workflow.runWorkflow(ACTION_CHECK_HANDLE, {
      actorId: activeCharacterId,
      preselectedAttribute: attrKey,
      skipModifier: shiftKey ?? false,
    })
  },
  [activeCharacterId, sdk.workflow],
)
```

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart/ui/CharacterCard.tsx plugins/daggerheart/ui/AttributeCell.tsx
git commit -m "feat(daggerheart): character card uses unified roll workflow with Shift+click bypass"
```

---

### Task 16: E2E 验证 + 最终类型检查

**Files:**
- No new files

- [ ] **Step 1: 运行全量类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: 运行全部测试**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: 手动 E2E 验证清单**

使用 preview 启动应用，依次验证：

1. **底部面板显示** — 屏幕底部居中，28px 折叠态，显示资源速览
2. **底部面板展开** — 点击 chevron 展开，显示属性 tab
3. **属性 tab 掷骰** — 点击属性卡片 → 打开 modifier 面板 → 选择修正 → 投骰 → 聊天显示结果
4. **Shift+click 快速掷骰** — Shift+点击属性 → 跳过 modifier 面板 → 直接投骰
5. **角色卡掷骰** — 角色卡属性区点击 → 打开 modifier 面板（预选属性已勾选）
6. **副作用生效** — modifier 面板设置 Hope −1 → 投骰后角色 Hope 减少
7. **判定后果** — 投出 hope 结果 → 角色 hope +1；投出 fear 结果 → 全局 fear +1
8. **高级选项** — 骰面替换、取高取低正确影响公式和结果

- [ ] **Step 4: Commit（如有修复）**

```bash
git add -A
git commit -m "fix(daggerheart): E2E verification fixes for unified roll system"
```

---

## 执行顺序依赖图

```
Task 1 (types)
  ↓
Task 2 (formula utils) ← Task 3 (execution utils)
  ↓                        ↓
Task 4 (workflow refactor) ←┘
  ↓
Task 5 (DiceJudge + card adapt)
  ↓
Task 6-9 (modifier sub-components, parallel)
  ↓
Task 10 (ModifierPanel assembly)
  ↓
Task 11 (anchor extension)
  ↓
Task 12-13 (bottom panel sub-components, parallel)
  ↓
Task 14 (bottom panel assembly)
  ↓
Task 15 (CharacterCard integration)
  ↓
Task 16 (E2E verification)
```
