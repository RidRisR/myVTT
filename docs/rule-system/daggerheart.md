# Daggerheart 规则实现设计

## 1. 规则概要

Daggerheart 是 Darrington Press 发行的叙事向奇幻 TRPG，核心机制是 **Duality Dice（二元骰）**：投掷 2d12，一个代表 Hope（希望），一个代表 Fear（恐惧）。哪个骰子更高决定了叙事走向。

### 属性

6 个属性，值域 -1 ~ +2，总和为 +3：

| 属性      | 用途             |
| --------- | ---------------- |
| Agility   | 敏捷、闪避、反应 |
| Strength  | 力量、近战       |
| Precision | 精准、远程       |
| Presence  | 气场、社交       |
| Intuition | 直觉、感知       |
| Knowledge | 知识、学识       |

### 资源

| 资源   | 说明                         |
| ------ | ---------------------------- |
| HP     | 生命值（等级 + 职业决定）    |
| Stress | 压力值（阈值伤害系统）       |
| Armor  | 护甲值（减伤）               |
| Hope   | 希望 token（可消耗获得加成） |

### 检定机制

1. 投 2d12 + 属性修正
2. 与难度值（DC 5-30）比较
3. 观察 Hope/Fear 哪个更高

### 五种结果

| 结果            | 条件                     | 叙事效果                                |
| --------------- | ------------------------ | --------------------------------------- |
| **大成功**      | 双骰相等                 | 自动成功 + 获得 Hope + 清除 Stress      |
| **成功 (Hope)** | 总和 ≥ DC 且 Hope > Fear | 干净利落的成功，获得 Hope token         |
| **成功 (Fear)** | 总和 ≥ DC 且 Fear > Hope | 成功但有代价/并发症，GM 获得 Fear token |
| **失败 (Hope)** | 总和 < DC 且 Hope > Fear | 失败但有银线（补偿），获得 Hope token   |
| **失败 (Fear)** | 总和 < DC 且 Fear > Hope | 纯粹的失败，GM 获得 Fear token          |

### 伤害系统

Daggerheart 的伤害不是直接扣 HP，而是基于阈值：

| 伤害值            | 标记 |
| ----------------- | ---- |
| < Major 阈值      | 1 HP |
| ≥ Major, < Severe | 2 HP |
| ≥ Severe          | 3 HP |
| ≥ 2× Severe       | 4 HP |

Major/Severe 阈值 = 基础值 + Armor + 等级。

## 2. 实现设计

### 角色初始化

```typescript
getDefaultAttributes(): Attribute[] {
  return [
    { key: 'Agility',   value: 0, category: 'attribute' },
    { key: 'Strength',  value: 0, category: 'attribute' },
    { key: 'Precision', value: 0, category: 'attribute' },
    { key: 'Presence',  value: 0, category: 'attribute' },
    { key: 'Intuition', value: 0, category: 'attribute' },
    { key: 'Knowledge', value: 0, category: 'attribute' },
  ]
}

getDefaultResources(): Resource[] {
  return [
    { key: 'HP',     current: 10, max: 10, color: '#22c55e' },
    { key: 'Stress', current: 0,  max: 6,  color: '#8b5cf6' },
    { key: 'Armor',  current: 0,  max: 3,  color: '#3b82f6' },
    { key: 'Hope',   current: 0,  max: 5,  color: '#f59e0b' },
  ]
}
```

### 掷骰动作

每个属性自动生成一个 Check 动作：

```typescript
getRollActions(character: Character): RollAction[] {
  return character.attributes
    .filter(a => a.category === 'attribute')
    .map(attr => ({
      id: `dh_check_${attr.key.toLowerCase()}`,
      name: `${attr.key} Check`,
      formula: `2d12+@${attr.key}`,
      category: 'action',
    }))
}
```

### 判定逻辑

```typescript
// src/rules/daggerheart/judgment.ts

type DaggerheartOutcome =
  | 'critical_success'
  | 'success_hope'
  | 'success_fear'
  | 'failure_hope'
  | 'failure_fear'

interface DaggerheartJudgment {
  type: 'daggerheart'
  hopeDie: number
  fearDie: number
  higherDie: 'hope' | 'fear' | 'critical'
  totalVsDC: 'success' | 'failure' | null // null if no DC
  outcome: DaggerheartOutcome
}

function evaluateDaggerheart(
  termResults: DiceTermResult[],
  total: number,
  dc?: number,
): DaggerheartJudgment {
  // 找到 2d12 term 的两个骰子
  const diceTerm = termResults.find((tr) => tr.term.type === 'dice')
  const hopeDie = diceTerm?.allRolls[0] ?? 0
  const fearDie = diceTerm?.allRolls[1] ?? 0

  // 判断哪个更高
  const higherDie = hopeDie === fearDie ? 'critical' : hopeDie > fearDie ? 'hope' : 'fear'

  // 总和 vs DC
  const totalVsDC = dc != null ? (total >= dc ? 'success' : 'failure') : null

  // 五种结果
  let outcome: DaggerheartOutcome
  if (higherDie === 'critical') {
    outcome = 'critical_success'
  } else if (totalVsDC === 'success') {
    outcome = higherDie === 'hope' ? 'success_hope' : 'success_fear'
  } else if (totalVsDC === 'failure') {
    outcome = higherDie === 'hope' ? 'failure_hope' : 'failure_fear'
  } else {
    // 没有提供 DC，只看 Hope/Fear
    outcome = higherDie === 'hope' ? 'success_hope' : 'success_fear'
  }

  return { type: 'daggerheart', hopeDie, fearDie, higherDie, totalVsDC, outcome }
}
```

### 骰子样式

```typescript
getDieStyles(termResults: DiceTermResult[]): DieStyle[] {
  const diceTerm = termResults.findIndex(tr => tr.term.type === 'dice')
  if (diceTerm < 0) return []
  return [
    { termIndex: diceTerm, dieIndex: 0, label: 'Hope', color: '#f59e0b' },  // 金色
    { termIndex: diceTerm, dieIndex: 1, label: 'Fear', color: '#8b5cf6' },  // 紫色
  ]
}
```

### 判定显示

```typescript
getJudgmentDisplay(result: JudgmentResult): JudgmentDisplay {
  const dh = result as DaggerheartJudgment
  switch (dh.outcome) {
    case 'critical_success':
      return { text: '大成功！',           color: '#fbbf24', severity: 'critical' }
    case 'success_hope':
      return { text: '成功 (Hope)',        color: '#22c55e', severity: 'success' }
    case 'success_fear':
      return { text: '成功 (Fear，有代价)', color: '#f97316', severity: 'partial' }
    case 'failure_hope':
      return { text: '失败 (Hope，有补偿)', color: '#60a5fa', severity: 'partial' }
    case 'failure_fear':
      return { text: '失败 (Fear)',        color: '#ef4444', severity: 'failure' }
  }
}
```

### 修正选项

Daggerheart 的核心机制没有类似 D&D 优势/劣势的常规修正。当前返回空数组，后续如果需要可以加 Hope token 消耗等。

```typescript
getModifierOptions(): ModifierOption[] {
  return []
}
```

## 3. 角色卡设计 (DaggerheartCard.tsx)

### 布局

```
┌─ DaggerheartCard ──────────────────┐
│ [头像] 角色名                        │
│        PC · 在线                     │
│ ────────────────────────────        │
│ ❤ HP    ████████████░░  8/10       │
│ ⚡ Stress ██████░░░░░░░  3/6        │
│ 🛡 Armor  ██░░░░░░░░░░  1/3        │
│ ✦ Hope   ██████░░░░░░  2/5         │
│ ────────────────────────────        │
│  Agility    [+2] [🎲]              │
│  Strength   [+1] [🎲]              │
│  Precision  [+1] [🎲]              │
│  Presence   [ 0] [🎲]              │
│  Intuition  [ 0] [🎲]              │
│  Knowledge  [-1] [🎲]              │
│ ────────────────────────────        │
│  状态: 中毒 × 燃烧 ×                 │
│  [+ 添加状态]                        │
│ ────────────────────────────        │
│  笔记: ___________________________  │
└─────────────────────────────────────┘
```

### 交互

- **属性值编辑**：点击数值直接编辑，或使用 MiniHoldButton ±
- **掷骰按钮 [🎲]**：点击 → 触发 `onRollAction(action)` → 基座弹出 RollConfirmPanel
- **资源条**：复用 ResourceBar，draggable + showButtons
- **状态标签**：复用现有的标签组件

### 技术要点

- 组件位于 `src/rules/daggerheart/DaggerheartCard.tsx`
- 接收 `EntityCardProps`，通过 `onUpdate` 回调更新 Entity
- 引用基座组件：`import { ResourceBar } from '../../shared/ui/ResourceBar'`
- 不包含任何掷骰/判定逻辑，只触发 `onRollAction` 回调

## 4. Phase 2 预留：目标攻击

Daggerheart 的攻击流程：

1. 选择攻击属性（近战用 Strength，远程用 Precision 等）
2. 投 2d12 + 属性修正，判定 Hope/Fear
3. 如果成功（总和 ≥ 目标的 AC/Armor），投伤害
4. 伤害值与目标的 Major/Severe 阈值比较，决定扣几点 HP

Phase 2 需要扩展的接口：

```typescript
// 目标攻击动作
getTargetActions(attacker: Character, target: Character): RollAction[]

// 伤害应用（半自动：计算后让用户确认）
calculateDamage(
  damageRoll: CompoundDiceResult,
  target: Character
): { hpLoss: number; description: string }
```

## 5. 不做的事情

- **不自动管理 Hope/Fear token 经济**：投掷结果提示 "获得 Hope token"，但不自动加减 Hope 资源值。玩家自己调。
- **不做先攻系统**：Daggerheart 没有传统先攻，用 GM 主导的行动顺序。
- **不做法术/能力卡**：现有 handouts 系统可以手动记录，不做自动化。
- **不验证属性分配合法性**：不检查属性总和是否为 +3，信任玩家。
