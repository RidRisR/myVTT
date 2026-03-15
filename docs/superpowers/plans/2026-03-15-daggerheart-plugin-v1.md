# Daggerheart 插件 v1 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将服务端骰子系统重构为纯随机数生成器，实现 DaggerHeart 规则插件 v1（数据层 + `.dd` 命令 + 自定义消息卡），端到端验证插件系统可用性。

**Architecture:** 服务端只生成随机数（不做任何规则计算），客户端通过 `buildCompoundResult` 重建显示数据，插件的 `evaluateRoll` 在客户端渲染时调用。DaggerHeart 插件注册 `rollCommands['daggerheart:dd']`（命令解析）和 `surfaces.rollCardRenderers['daggerheart:dd']`（自定义卡片），两者通过 `rollType` 字段关联。

**Tech Stack:** TypeScript 5.9, React 19, Vitest 4, Express 5, better-sqlite3, `@myvtt/sdk`

---

## 文件结构

**修改（基础层）：**
- `src/shared/diceUtils.ts` — 新增 `DiceSpec`, `toDiceSpecs`, `buildTermResult`, `buildCompoundResult`
- `src/chat/chatTypes.ts` — 更新 `ChatRollMessage`（`dice`+`rolls`+`rollType` 替换 `terms`+`total`）
- `src/rules/types.ts` — 更新 `evaluateRoll` 签名，新增 `rollCommands` + `rollCardRenderers`
- `src/rules/sdk.ts` — 新增导出 `DiceSpec`, `ChatRollMessage`, `tokenizeExpression`, `buildCompoundResult`
- `server/routes/chat.ts` — 移除 `rollCompound`，改为纯随机数生成
- `src/chat/DiceResultCard.tsx` — 从 `rolls` 客户端重建 `termResults`
- `src/chat/MessageCard.tsx` — 新增 `rollCardRenderers` dispatch
- `src/stores/worldStore.ts` — 更新 `sendRoll` 接口
- `src/chat/ChatInput.tsx` — `.r` 提取 dice specs，新增 `.dd` 命令

**新建（DaggerHeart 插件）：**
- `plugins/daggerheart/types.ts`
- `plugins/daggerheart/adapters.ts` + `__tests__/adapters.test.ts`
- `plugins/daggerheart/templates.ts` + `__tests__/templates.test.ts`
- `plugins/daggerheart/diceSystem.ts` + `__tests__/diceSystem.test.ts`
- `plugins/daggerheart/ui/DHRollCard.tsx`
- `plugins/daggerheart/index.ts`

**修改（DaggerHeart 插件）：**
- `src/rules/registry.ts` — 注册 daggerheartPlugin
- `plugins/generic/index.ts` — 更新 `getFormulaTokens`
- `src/chat/ChatPanel.tsx` — 用 `plugin.adapters.getFormulaTokens` 替换

---

## Chunk 1: 骰子架构重构

### Task 1: 更新核心类型

**Files:**
- Modify: `src/shared/diceUtils.ts`
- Modify: `src/chat/chatTypes.ts`
- Modify: `src/rules/types.ts`
- Modify: `src/rules/sdk.ts`

- [ ] **Step 1: 在 diceUtils.ts 新增 DiceSpec 类型和三个函数**

在 `src/shared/diceUtils.ts` 末尾追加：

```typescript
/** Minimal dice specification sent to server (no keep/drop logic — that's handled client-side) */
export interface DiceSpec {
  sides: number
  count: number
}

/** Extract dice specs from parsed terms (dice terms only, constants ignored) */
export function toDiceSpecs(terms: DiceTerm[]): DiceSpec[] {
  return terms
    .filter((t): t is Extract<DiceTerm, { type: 'dice' }> => t.type === 'dice')
    .map((t) => ({ sides: t.sides, count: t.count }))
}

/**
 * Reconstruct a DiceTermResult from a pre-existing array of rolls (server-generated).
 * Applies keep/drop logic identically to rollTerm, but uses provided rolls instead of generating new ones.
 */
export function buildTermResult(term: DiceTerm, allRolls: number[]): DiceTermResult {
  if (term.type === 'constant') {
    return { term, allRolls: [], keptIndices: [], subtotal: term.sign * term.value }
  }

  let keptIndices: number[]
  if (!term.keepDrop) {
    keptIndices = allRolls.map((_, i) => i)
  } else {
    const indexed = allRolls.map((v, i) => ({ i, v }))
    indexed.sort((a, b) => a.v - b.v)
    const { mode, count } = term.keepDrop
    let keptSet: Set<number>
    switch (mode) {
      case 'kh':
        keptSet = new Set(indexed.slice(-count).map((x) => x.i))
        break
      case 'kl':
        keptSet = new Set(indexed.slice(0, count).map((x) => x.i))
        break
      case 'dh':
        keptSet = new Set(indexed.slice(0, -count).map((x) => x.i))
        break
      case 'dl':
        keptSet = new Set(indexed.slice(count).map((x) => x.i))
        break
      default: {
        const _exhaust: never = mode
        throw new Error(`Unknown keep/drop mode: ${_exhaust}`)
      }
    }
    keptIndices = allRolls.map((_, i) => i).filter((i) => keptSet.has(i))
  }

  const subtotal = term.sign * keptIndices.reduce((sum, i) => sum + allRolls[i], 0)
  return { term, allRolls, keptIndices, subtotal }
}

/**
 * Reconstruct full compound result from server-generated rolls.
 * terms = output of tokenizeExpression(formula)
 * rolls = server-generated raw numbers, one array per dice term (in order)
 */
export function buildCompoundResult(
  terms: DiceTerm[],
  rolls: number[][],
): { termResults: DiceTermResult[]; total: number } {
  let rollIndex = 0
  const termResults = terms.map((term) => {
    if (term.type === 'constant') return buildTermResult(term, [])
    return buildTermResult(term, rolls[rollIndex++] ?? [])
  })
  const total = termResults.reduce((sum, tr) => sum + tr.subtotal, 0)
  return { termResults, total }
}
```

- [ ] **Step 2: 更新 chatTypes.ts**

**完整替换 `src/chat/chatTypes.ts` 的全部内容**（保留 `ChatTextMessage` 和 `ChatMessage` union，仅更新 `ChatRollMessage`，移除旧的 `DiceTermResult` / `JudgmentResult` 导入）：

```typescript
import type { DiceSpec } from '../shared/diceUtils'

export interface ChatTextMessage {
  type: 'text'
  id: string
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string
  content: string
  timestamp: number
}

export interface ChatRollMessage {
  type: 'roll'
  id: string
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string
  timestamp: number

  formula: string           // 原始公式（含 @key），用于显示
  resolvedFormula?: string  // @key 解析后的实际公式，用于解析 dice

  dice: DiceSpec[]          // 客户端发送，服务端透传
  rolls: number[][]         // 服务端生成的原始随机数

  rollType?: string         // 'daggerheart:dd' 等，用于查 rollCardRenderers
  actionName?: string
}

export type ChatMessage = ChatTextMessage | ChatRollMessage
```

注意：判定结果（`JudgmentResult`）不再存储在消息中，改为渲染时由插件 `evaluateRoll` 计算。`terms` / `total` / `judgment` / `modifiersApplied` 字段全部移除。

- [ ] **Step 3: 更新 types.ts 中的 RulePlugin 接口**

在 `src/rules/types.ts` 中：

1. 更新 `diceSystem.evaluateRoll` 签名（移除 `DiceTermResult[]` 和 `ctx`）：
```typescript
diceSystem?: {
  getRollActions(entity: Entity): RollAction[]
  evaluateRoll(rolls: number[][], total: number): JudgmentResult | null  // 改：纯 rolls 输入
  getDieStyles(terms: DiceTermResult[]): DieStyle[]
  getJudgmentDisplay(result: JudgmentResult): JudgmentDisplay
  getModifierOptions(): ModifierOption[]
  // NEW: 插件注册的自定义投骰命令
  rollCommands?: Record<string, { resolveFormula(modifierExpr?: string): string }>
}
```

2. 在 `surfaces` 中新增 `rollCardRenderers`，先新增 `RollCardProps` 接口：
```typescript
export interface RollCardProps {
  message: ChatRollMessage
  isNew?: boolean
}
```

然后在 `surfaces` 里添加：
```typescript
surfaces?: {
  panels?: PluginPanelDef[]
  dockTabs?: DockTabDef[]
  gmTabs?: GMTabDef[]
  teamPanel?: React.ComponentType<TeamPanelProps>
  rollCardRenderers?: Record<string, React.ComponentType<RollCardProps>>  // NEW
}
```

注意：`ChatRollMessage` 定义在 `'../chat/chatTypes'`，需在 `types.ts` 顶部添加 `import type { ChatRollMessage } from '../chat/chatTypes'`。`RollCardProps` 直接定义在 `types.ts` 同文件中，不需额外 import。

- [ ] **Step 4: 更新 sdk.ts，导出新类型和函数**

在 `src/rules/sdk.ts` 末尾追加（已有导出保持不变）：

```typescript
export type { DiceSpec } from '../shared/diceUtils'
export { tokenizeExpression, buildCompoundResult } from '../shared/diceUtils'
export type { ChatRollMessage } from '../chat/chatTypes'
export type { RollCardProps } from './types'
```

- [ ] **Step 5: 确认 TypeScript 通过**

```bash
cd .worktrees/feat/daggerheart-plugin && npx tsc --noEmit 2>&1 | head -30
```

期望：只有下游代码报错（因为 ChatRollMessage 字段变了），不是类型定义本身报错。

- [ ] **Step 6: 提交类型变更**

```bash
cd .worktrees/feat/daggerheart-plugin
git add src/shared/diceUtils.ts src/chat/chatTypes.ts src/rules/types.ts src/rules/sdk.ts
git commit -m "refactor: update dice types — DiceSpec, pure rolls ChatRollMessage, plugin rollCommands"
```

---

### Task 2: 服务端纯随机数重构

**Files:**
- Modify: `server/routes/chat.ts`
- Modify: `server/__tests__/scenarios/` (已有集成测试，验证新格式)

**背景知识：** 服务端唯一职责是生成不可篡改的随机数。`rollCompound` 的公式解析逻辑全部移走，服务端只做 `Math.floor(Math.random() * sides) + 1`。防伪保证不变：客户端无法写入数据库，只能 POST 投骰请求。

- [ ] **Step 1: 重构 POST /api/rooms/:roomId/roll**

将 `server/routes/chat.ts` 中的 `/roll` handler 完整替换：

```typescript
// Server-side dice roll — pure RNG only, no formula evaluation
router.post('/api/rooms/:roomId/roll', room, (req, res) => {
  const {
    dice,
    formula,
    resolvedFormula,
    rollType,
    senderId,
    senderName,
    senderColor,
    portraitUrl,
    actionName,
  } = req.body

  if (!Array.isArray(dice) || dice.length === 0) {
    res.status(400).json({ error: 'dice is required' })
    return
  }

  // Validate bounds
  for (const spec of dice as { sides: number; count: number }[]) {
    if (!spec.sides || spec.sides < 1 || spec.sides > 1000) {
      res.status(400).json({ error: `Invalid sides: ${spec.sides}` })
      return
    }
    if (!spec.count || spec.count < 1 || spec.count > 100) {
      res.status(400).json({ error: `Invalid count: ${spec.count}` })
      return
    }
  }

  // Generate raw random numbers — the ONLY thing the server does
  const rolls: number[][] = (dice as { sides: number; count: number }[]).map(({ sides, count }) =>
    Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1),
  )

  const id = crypto.randomUUID()
  const timestamp = Date.now()
  const rollData = { formula, resolvedFormula, dice, rolls, rollType, actionName }

  req.roomDb!
    .prepare(
      `INSERT INTO chat_messages (id, type, sender_id, sender_name, sender_color, portrait_url, roll_data, timestamp)
       VALUES (?, 'roll', ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, senderId, senderName, senderColor, portraitUrl || null, JSON.stringify(rollData), timestamp)

  const message = toMessage(
    req.roomDb!.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as Record<
      string,
      unknown
    >,
  )
  io.to(req.roomId!).emit('chat:new', message)
  res.status(201).json(message)
})
```

同时移除 `chat.ts` 顶部的动态 import 行：
```typescript
// 删除这行:
const { rollCompound } = await import('../../src/shared/diceUtils')
```

注意：新 handler 是**同步**的（没有 `async` 关键字），移除原来包裹整个 `/roll` handler 的 `try/catch` 块（新代码无异步操作，不需要）。

- [ ] **Step 2: 编写集成测试**

在 `server/__tests__/scenarios/` 中创建 `dice-pure-rng.test.ts`：

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom } from '../helpers/test-server'

let cleanup: () => void
let baseUrl: string

beforeAll(async () => {
  const result = await setupTestRoom()
  cleanup = result.cleanup
  baseUrl = result.baseUrl
})

afterAll(() => cleanup())

describe('POST /api/rooms/:roomId/roll — pure RNG', () => {
  it('returns raw rolls matching dice spec', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/test/roll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dice: [{ sides: 12, count: 2 }],
        formula: '2d12',
        rollType: 'daggerheart:dd',
        senderId: 's1',
        senderName: 'Tester',
        senderColor: '#fff',
      }),
    })
    expect(res.status).toBe(201)
    const msg = await res.json()
    expect(msg.type).toBe('roll')
    expect(msg.rolls).toHaveLength(1)
    expect(msg.rolls[0]).toHaveLength(2)
    expect(msg.rolls[0][0]).toBeGreaterThanOrEqual(1)
    expect(msg.rolls[0][0]).toBeLessThanOrEqual(12)
    expect(msg.rollType).toBe('daggerheart:dd')
    expect(msg.formula).toBe('2d12')
    // 服务端不再提供 terms 或 total
    expect(msg.terms).toBeUndefined()
    expect(msg.total).toBeUndefined()
  })

  it('rejects missing dice', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/test/roll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formula: '2d12', senderId: 's1', senderName: 'T', senderColor: '#fff' }),
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: 运行集成测试，确认通过**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run server/__tests__/scenarios/dice-pure-rng.test.ts 2>&1 | tail -15
```

期望：全部 PASS。

- [ ] **Step 4: 提交**

```bash
cd .worktrees/feat/daggerheart-plugin
git add server/routes/chat.ts server/__tests__/scenarios/dice-pure-rng.test.ts
git commit -m "refactor: server POST /roll becomes pure RNG — removes rollCompound dependency"
```

---

### Task 3: 客户端显示层更新

**Files:**
- Modify: `src/chat/DiceResultCard.tsx`
- Modify: `src/chat/MessageCard.tsx`
- Modify: `src/stores/worldStore.ts`
- Modify: `src/chat/ChatInput.tsx`

**背景知识：** `DiceResultCard` 之前直接读 `message.terms` 和 `message.total`。现在这两个字段不存在，改为调用 `buildCompoundResult(tokenizeExpression(formula), message.rolls)` 在渲染时计算。`MessageCard` 新增插件渲染器分发逻辑。`worldStore.sendRoll` 的接口更新以传递 `dice` 和 `rollType`。`ChatInput` 的 `.r` 命令在发送前提取 dice specs。

- [ ] **Step 1: 更新 DiceResultCard.tsx**

**完整替换 `src/chat/DiceResultCard.tsx` 的全部内容**（新增 `useMemo` + `buildCompoundResult`，所有 `message.terms` → `termResults`，`message.total` → `total`，`useEffect` 也更新）：

```typescript
import { useState, useEffect, useRef, useMemo } from 'react'
import type { ChatRollMessage } from './chatTypes'
import { DiceReel } from './DiceReel'
import { calcTotalAnimDuration, SPIN_DURATION, STOP_INTERVAL } from './diceAnimUtils'
import { tokenizeExpression, buildCompoundResult } from '../shared/diceUtils'

interface DiceResultCardProps {
  message: ChatRollMessage
  isNew?: boolean
}

export function DiceResultCard({ message, isNew }: DiceResultCardProps) {
  // Lock animation state at mount — immune to isNew prop changes
  const shouldAnimate = useRef(!!isNew)

  // Reconstruct termResults + total from server-generated rolls (client-side computation)
  const { termResults, total } = useMemo(() => {
    const formula = message.resolvedFormula ?? message.formula
    const terms = tokenizeExpression(formula) ?? []
    return buildCompoundResult(terms, message.rolls ?? [])
  }, [message.formula, message.resolvedFormula, message.rolls])

  const [totalRevealed, setTotalRevealed] = useState(!shouldAnimate.current)

  useEffect(() => {
    if (!shouldAnimate.current) return
    const duration = calcTotalAnimDuration(termResults) * 1000
    const timer = setTimeout(() => setTotalRevealed(true), duration)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalDice = termResults.reduce(
    (sum, tr) => sum + (tr.term.type === 'dice' ? tr.allRolls.length : 0),
    0,
  )
  const stopOrder = useRef(
    Array.from({ length: totalDice }, (_, i) => i).sort(() => Math.random() - 0.5),
  )
  const allLandedTime = totalDice > 0 ? SPIN_DURATION + (totalDice - 1) * STOP_INTERVAL + 0.3 : 0

  let diceIndex = 0
  const reelGroups = termResults.map((tr, ti) => {
    if (tr.term.type === 'constant') {
      const value = (tr.term as { type: 'constant'; sign: 1 | -1; value: number }).value
      const sign = tr.term.sign === -1 ? '-' : '+'
      return (
        <span key={ti} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {ti > 0 && (
            <span style={{ color: '#64748b', margin: '0 2px', fontSize: 13 }}>{sign}</span>
          )}
          <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 15 }}>{value}</span>
        </span>
      )
    }

    const sign = tr.term.sign === -1 ? '-' : '+'
    const showSign = ti > 0 || tr.term.sign === -1
    const reels = tr.allRolls.map((roll, ri) => {
      const order = stopOrder.current[diceIndex] ?? diceIndex
      const stopDelay = SPIN_DURATION + order * STOP_INTERVAL
      diceIndex++
      const isDropped = !tr.keptIndices.includes(ri)
      return (
        <DiceReel
          key={`${ti}-${ri}`}
          sides={(tr.term as { type: 'dice'; sides: number }).sides}
          result={roll}
          stopDelay={shouldAnimate.current ? stopDelay : 0}
          dropped={isDropped}
          dropRevealDelay={shouldAnimate.current ? allLandedTime : undefined}
        />
      )
    })

    return (
      <span
        key={ti}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}
      >
        {showSign && (
          <span style={{ color: '#64748b', margin: '0 2px', fontSize: 13 }}>{sign}</span>
        )}
        {reels}
      </span>
    )
  })

  return (
    <>
      <style>{`
        @keyframes diceLand {
          0% { transform: scale(1) rotateZ(0deg); filter: blur(1.5px); }
          50% { transform: scale(1.3) rotateZ(8deg); filter: blur(0); }
          70% { transform: scale(0.95) rotateZ(-4deg); }
          100% { transform: scale(1) rotateZ(0deg); filter: blur(0); }
        }
        @keyframes totalReveal {
          0% { opacity: 0; transform: scale(0.5) translateY(8px); }
          50% { transform: scale(1.2) translateY(-2px); }
          70% { transform: scale(0.95) translateY(1px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {reelGroups}
        <span style={{ color: '#475569', margin: '0 4px', fontSize: 14 }}>=</span>
        <span
          style={{
            fontWeight: 800,
            fontSize: 22,
            fontFamily: 'monospace',
            minWidth: 30,
            textAlign: 'center',
            display: 'inline-block',
            ...(totalRevealed
              ? {
                  color: '#fbbf24',
                  textShadow: '0 0 10px rgba(251, 191, 36, 0.8), 0 0 20px rgba(251, 191, 36, 0.4)',
                  animation: shouldAnimate.current
                    ? 'totalReveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    : 'none',
                  opacity: 1,
                }
              : { color: '#334155', opacity: 0.5 }),
          }}
        >
          {totalRevealed ? total : '?'}
        </span>
      </div>
    </>
  )
}
```

- [ ] **Step 2: 更新 MessageCard.tsx**

以下是对 `src/chat/MessageCard.tsx` 的**完整变更清单**（字段全部从旧 API 迁移到新 API）：

1. 顶部添加导入：
```typescript
import { useRulePlugin } from '../rules/useRulePlugin'
```

2. 在组件函数体内（所有现有 `useState` 之后，early return 之前）添加 hook：
```typescript
const plugin = useRulePlugin()
```

3. 将 roll message 分支中所有字段引用迁移：

| 旧代码 | 新代码 |
|---|---|
| `message.expression` | `message.formula` |
| `message.resolvedExpression` | `message.resolvedFormula` |
| `.r {message.expression}` | 见下方 |

4. 替换公式显示行（原来的 `.r {message.expression}` 固定前缀）：
```typescript
<span className="text-xs text-text-muted/50 font-mono">
  {message.rollType
    ? `.${message.rollType.split(':')[1] ?? 'r'} ${message.formula}`
    : `.r ${message.formula}`}
  {message.resolvedFormula && (
    <span className="text-text-muted/30"> ({message.resolvedFormula})</span>
  )}
</span>
```

5. 在 `useRulePlugin()` 下方添加：
```typescript
const CustomCard =
  message.type === 'roll' && message.rollType
    ? plugin.surfaces?.rollCardRenderers?.[message.rollType]
    : undefined
```

6. 替换 roll 分支的内容渲染行（原来的单行 `<DiceResultCard />`）：
```typescript
{CustomCard
  ? <CustomCard message={message} isNew={isNew} />
  : <DiceResultCard message={message} isNew={isNew} />}
```

注意：`onToggleFavorite` 的 prop 类型签名 `(expression: string) => void` 以及内部调用处（`onToggleFavorite(message.expression)`）同步改为 `(formula: string) => void` + `onToggleFavorite(message.formula)`。

- [ ] **Step 3: 更新 worldStore.sendRoll**

更新 `src/stores/worldStore.ts` 中的类型定义和实现：

```typescript
// 类型定义（State 接口中）：
sendRoll: (data: {
  dice: DiceSpec[]
  formula: string
  resolvedFormula?: string
  rollType?: string
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string
  actionName?: string
}) => Promise<void>

// 实现不变（仍是 POST，新字段自动传递）
sendRoll: async (data) => {
  const roomId = get()._roomId
  if (!roomId) return
  await api.post(`/api/rooms/${roomId}/roll`, data)
},
```

需要在文件顶部添加 `import type { DiceSpec } from '../shared/diceUtils'`。

- [ ] **Step 4: 更新 ChatInput.tsx**

更新 `.r` 命令（提取 dice specs）和新增 `.dd` 命令：

```typescript
// 顶部添加导入
import { tokenizeExpression, toDiceSpecs, resolveFormula } from '../shared/diceUtils'
import type { DiceSpec } from '../shared/diceUtils'

// 更新 onRoll callback 签名
interface ChatInputProps {
  // ...
  onRoll?: (formula: string, resolvedFormula?: string, dice?: DiceSpec[], rollType?: string) => void
}

// 更新 handleRoll（.r 命令用）
const handleRoll = (formula: string) => {
  let resolvedFormula: string | undefined
  if (/@[\p{L}\p{N}_]+/u.test(formula)) {
    const resolved = resolveFormula(formula, selectedTokenProps, seatProperties)
    if ('error' in resolved) {
      const hint = selectedTokenProps.length === 0 ? ' (try selecting a token)' : ''
      setError(resolved.error + hint)
      return
    }
    resolvedFormula = resolved.resolved
  }
  const terms = tokenizeExpression(resolvedFormula ?? formula)
  if (!terms) { setError('Invalid dice formula'); return }
  const dice = toDiceSpecs(terms)
  if (onRoll) onRoll(formula, resolvedFormula, dice, undefined)
  setInput('')
  setError('')
}

// 新增 handleDaggerheartRoll（.dd 命令用）
const handleDaggerheartRoll = (modifierExpr: string) => {
  const mod = modifierExpr.trim()
  const formula = `2d12${mod ? (mod.startsWith('+') || mod.startsWith('-') ? mod : '+' + mod) : ''}`
  let resolvedFormula: string | undefined
  if (/@[\p{L}\p{N}_]+/u.test(formula)) {
    const resolved = resolveFormula(formula, selectedTokenProps, seatProperties)
    if ('error' in resolved) { setError(resolved.error); return }
    resolvedFormula = resolved.resolved
  }
  const terms = tokenizeExpression(resolvedFormula ?? formula)
  if (!terms) { setError('Invalid formula'); return }
  const dice = toDiceSpecs(terms)
  if (onRoll) onRoll(formula, resolvedFormula, dice, 'daggerheart:dd')
  setInput('')
  setError('')
}

// 更新 handleSend，在 .r 之前新增 .dd 分支
const handleSend = () => {
  const trimmed = input.trim()
  if (!trimmed) return
  const ddMatch = trimmed.match(/^\.dd\s*(.*)$/i)
  if (ddMatch) { handleDaggerheartRoll(ddMatch[1]); return }
  const rollMatch = trimmed.match(/^\.r\s*(.+)$/i)
  if (rollMatch) { handleRoll(rollMatch[1].trim()); return }
  // text message...
}
```

更新 `ChatPanel.tsx` 中的 `handleRoll` 回调以接收新参数：

在 `ChatPanel.tsx` 顶部补充导入：
```typescript
import { tokenizeExpression, toDiceSpecs } from '../shared/diceUtils'
import type { DiceSpec } from '../shared/diceUtils'
```

```typescript
const handleRoll = useCallback(
  (formula: string, resolvedFormula?: string, dice?: DiceSpec[], rollType?: string) => {
    const terms = dice ? null : (tokenizeExpression(resolvedFormula ?? formula) ?? [])
    const resolvedDice = dice ?? toDiceSpecs(terms ?? [])
    sendRoll({
      formula,
      resolvedFormula,
      dice: resolvedDice,
      rollType,
      senderId: activeSpeaker.id,
      senderName: activeSpeaker.name,
      senderColor: activeSpeaker.color,
      portraitUrl: activeSpeaker.portraitUrl,
    })
  },
  [sendRoll, activeSpeaker],
)
```

- [ ] **Step 5: 确认 TypeScript 通过**

```bash
cd .worktrees/feat/daggerheart-plugin && npx tsc --noEmit 2>&1 | head -30
```

期望：无报错。

- [ ] **Step 6: 运行全套测试，确认无回归**

```bash
cd .worktrees/feat/daggerheart-plugin && npm test 2>&1 | tail -20
```

期望：所有测试 PASS。

- [ ] **Step 7: 提交**

```bash
cd .worktrees/feat/daggerheart-plugin
git add src/chat/DiceResultCard.tsx src/chat/MessageCard.tsx src/stores/worldStore.ts src/chat/ChatInput.tsx src/chat/ChatPanel.tsx
git commit -m "refactor: client-side dice computation — buildCompoundResult in render, .dd command, rollCardRenderers dispatch"
```

---

## Chunk 2: DaggerHeart 插件

> **前提：Chunk 1 必须已完成。** 执行本 Chunk 前，先验证：
> ```bash
> cd .worktrees/feat/daggerheart-plugin && npx tsc --noEmit 2>&1 | head -10
> ```
> 期望：无报错。还需确认 `@myvtt/sdk`（即 `src/rules/sdk.ts`）已导出 `DiceSpec`、`ChatRollMessage`、`RollCardProps`、`tokenizeExpression`、`buildCompoundResult`（Chunk 1 Task 1 Step 4 的成果）。
>
> **`@myvtt/sdk` 路径别名**：已在 `tsconfig.app.json` 的 `paths` 和 `vite.config.ts` 的 `resolve.alias` 中配置，且 `plugins/` 目录已包含在 `tsconfig.app.json` 的 `include` 中。插件直接 `import from '@myvtt/sdk'` 即可正常使用，无需手动配置。

### Task 4: DHRuleData 类型定义

**Files:**
- Create: `plugins/daggerheart/types.ts`

- [ ] **Step 1: 创建类型文件**

```typescript
// plugins/daggerheart/types.ts
export interface DHRuleData {
  agility: number
  strength: number
  finesse: number
  instinct: number
  presence: number
  knowledge: number
  tier: 1 | 2 | 3 | 4
  proficiency: number
  className: string
  ancestry: string
  hp: { current: number; max: number }
  stress: { current: number; max: number }
  hope: number
  armor: number
}
```

- [ ] **Step 2: 确认 TypeScript 通过**

```bash
cd .worktrees/feat/daggerheart-plugin && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: 提交**

```bash
git add plugins/daggerheart/types.ts && git commit -m "feat: add DHRuleData type definition"
```

---

### Task 5: DH 适配器层

**Files:**
- Create: `plugins/daggerheart/adapters.ts`
- Create: `plugins/daggerheart/__tests__/adapters.test.ts`

- [ ] **Step 1: 编写失败测试**

创建 `plugins/daggerheart/__tests__/adapters.test.ts`：

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { makeEntity } from '../../../src/__test-utils__/fixtures'
import { dhGetMainResource, dhGetPortraitResources, dhGetStatuses, dhGetFormulaTokens } from '../adapters'
import type { DHRuleData } from '../types'

const makeDHEntity = (overrides?: Partial<DHRuleData>) => {
  const defaults: DHRuleData = {
    agility: 2, strength: 1, finesse: 3, instinct: 0, presence: 1, knowledge: 2,
    tier: 1, proficiency: 1, className: 'Ranger', ancestry: 'Elf',
    hp: { current: 15, max: 20 }, stress: { current: 2, max: 6 }, hope: 3, armor: 2,
  }
  return makeEntity({ ruleData: { ...defaults, ...overrides } })
}

describe('dhGetMainResource', () => {
  it('returns null for entity with no ruleData', () => {
    expect(dhGetMainResource(makeEntity({ ruleData: null }))).toBeNull()
  })
  it('returns HP with label and red color', () => {
    const r = dhGetMainResource(makeDHEntity({ hp: { current: 15, max: 20 } }))
    expect(r!.label).toBe('HP')
    expect(r!.current).toBe(15)
    expect(r!.max).toBe(20)
    expect(r!.color).toBe('#ef4444')
  })
})

describe('dhGetPortraitResources', () => {
  it('returns empty array for no ruleData', () => {
    expect(dhGetPortraitResources(makeEntity({ ruleData: null }))).toEqual([])
  })
  it('returns [HP, Stress] in order', () => {
    const r = dhGetPortraitResources(makeDHEntity())
    expect(r).toHaveLength(2)
    expect(r[0].label).toBe('HP')
    expect(r[1].label).toBe('Stress')
    expect(r[1].color).toBe('#f97316')
  })
})

describe('dhGetStatuses', () => {
  it('returns empty array (no status system in v1)', () => {
    expect(dhGetStatuses(makeDHEntity())).toEqual([])
  })
})

describe('dhGetFormulaTokens', () => {
  it('returns empty for no ruleData', () => {
    expect(dhGetFormulaTokens(makeEntity({ ruleData: null }))).toEqual({})
  })
  it('returns 6 attributes + proficiency', () => {
    const tokens = dhGetFormulaTokens(makeDHEntity())
    expect(tokens).toEqual({ agility: 2, strength: 1, finesse: 3, instinct: 0, presence: 1, knowledge: 2, proficiency: 1 })
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run plugins/daggerheart/__tests__/adapters.test.ts 2>&1 | tail -10
```

期望：FAIL（模块不存在）。

- [ ] **Step 3: 实现适配器**

创建 `plugins/daggerheart/adapters.ts`：

```typescript
import type { Entity, ResourceView, StatusView } from '@myvtt/sdk'
import type { DHRuleData } from './types'

function getDH(entity: Entity): DHRuleData | null {
  return entity.ruleData ? (entity.ruleData as DHRuleData) : null
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

export function dhGetStatuses(_entity: Entity): StatusView[] { return [] }

export function dhGetFormulaTokens(entity: Entity): Record<string, number> {
  const d = getDH(entity)
  if (!d) return {}
  return { agility: d.agility, strength: d.strength, finesse: d.finesse, instinct: d.instinct, presence: d.presence, knowledge: d.knowledge, proficiency: d.proficiency }
}
```

- [ ] **Step 4: 运行测试，确认通过（7 个测试）**

```bash
npx vitest run plugins/daggerheart/__tests__/adapters.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: 提交**

```bash
git add plugins/daggerheart/adapters.ts plugins/daggerheart/__tests__/adapters.test.ts
git commit -m "feat: add daggerheart adapters layer"
```

---

### Task 6: DH 数据模板层

**Files:**
- Create: `plugins/daggerheart/templates.ts`
- Create: `plugins/daggerheart/__tests__/templates.test.ts`

- [ ] **Step 1: 编写失败测试**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createDefaultDHEntityData } from '../templates'
import type { DHRuleData } from '../types'

describe('createDefaultDHEntityData', () => {
  it('returns valid DHRuleData with all fields zeroed', () => {
    const d = createDefaultDHEntityData() as DHRuleData
    expect(d.agility).toBe(0)
    expect(d.tier).toBe(1)
    expect(d.proficiency).toBe(1)
    expect(d.className).toBe('')
    expect(d.hp).toEqual({ current: 0, max: 0 })
    expect(d.hope).toBe(0)
  })
  it('returns new object on each call', () => {
    const a = createDefaultDHEntityData() as DHRuleData
    const b = createDefaultDHEntityData() as DHRuleData
    a.agility = 99
    expect(b.agility).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run plugins/daggerheart/__tests__/templates.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: 实现**

```typescript
// plugins/daggerheart/templates.ts
import type { DHRuleData } from './types'

export function createDefaultDHEntityData(): DHRuleData {
  return {
    agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0,
    tier: 1, proficiency: 1, className: '', ancestry: '',
    hp: { current: 0, max: 0 }, stress: { current: 0, max: 0 }, hope: 0, armor: 0,
  }
}
```

- [ ] **Step 4: 运行测试，确认通过（2 个测试）**

- [ ] **Step 5: 提交**

```bash
git add plugins/daggerheart/templates.ts plugins/daggerheart/__tests__/templates.test.ts
git commit -m "feat: add daggerheart data templates"
```

---

### Task 7: DH 骰子系统

**Files:**
- Create: `plugins/daggerheart/diceSystem.ts`
- Create: `plugins/daggerheart/__tests__/diceSystem.test.ts`

**背景知识：** `evaluateRoll` 现在接收 `rolls: number[][]`（来自消息的原始随机数），而非 `DiceTermResult[]`。`rolls[0]` 是两个 d12 的值，`rolls[0][0]` = 希望骰，`rolls[0][1]` = 恐惧骰。DC 在 v1 硬编码为 12（DaggerHeart 标准行动检定难度）。`rollCommands` 导出供 ChatInput 的 `.dd` 命令使用。

- [ ] **Step 1: 编写失败测试**

创建 `plugins/daggerheart/__tests__/diceSystem.test.ts`：

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { dhEvaluateRoll, dhGetDieStyles, dhGetJudgmentDisplay, dhGetRollActions, rollCommands } from '../diceSystem'
import { makeEntity } from '../../../src/__test-utils__/fixtures'
import type { DHRuleData } from '../types'

describe('dhEvaluateRoll', () => {
  it('returns null if rolls is empty', () => {
    expect(dhEvaluateRoll([], 0)).toBeNull()
  })
  it('returns null if first group has fewer than 2 values', () => {
    expect(dhEvaluateRoll([[7]], 7)).toBeNull()
  })
  it('critical_success: tied dice regardless of total (ties override DC)', () => {
    expect(dhEvaluateRoll([[7, 7]], 14)?.outcome).toBe('critical_success')
    expect(dhEvaluateRoll([[5, 5]], 8)?.outcome).toBe('critical_success') // below DC 12
  })
  it('success_hope: hope > fear, total >= 12', () => {
    const r = dhEvaluateRoll([[8, 5]], 13)
    expect(r?.outcome).toBe('success_hope')
    expect(r?.hopeDie).toBe(8)
    expect(r?.fearDie).toBe(5)
  })
  it('success_fear: fear > hope, total >= 12', () => {
    expect(dhEvaluateRoll([[4, 9]], 13)?.outcome).toBe('success_fear')
  })
  it('failure_hope: hope > fear, total < 12', () => {
    expect(dhEvaluateRoll([[7, 3]], 8)?.outcome).toBe('failure_hope')
  })
  it('failure_fear: fear > hope, total < 12', () => {
    expect(dhEvaluateRoll([[3, 6]], 7)?.outcome).toBe('failure_fear')
  })
})

describe('dhGetDieStyles', () => {
  it('returns empty for non-DH rolls', () => {
    // 只有 1 个值（不是 2d12）
    expect(dhGetDieStyles([[7]])).toEqual([])
  })
  it('marks index 0 as Hope (gold) and index 1 as Fear (red)', () => {
    const styles = dhGetDieStyles([[8, 5]])
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
  it('critical severity for critical_success', () => {
    expect(dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 7, fearDie: 7, outcome: 'critical_success' }).severity).toBe('critical')
  })
  it('success for success_hope', () => {
    expect(dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 8, fearDie: 5, outcome: 'success_hope' }).severity).toBe('success')
  })
  it('partial for success_fear', () => {
    expect(dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 4, fearDie: 9, outcome: 'success_fear' }).severity).toBe('partial')
  })
  it('failure for failure_hope', () => {
    expect(dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 7, fearDie: 3, outcome: 'failure_hope' }).severity).toBe('failure')
  })
  it('fumble for failure_fear', () => {
    expect(dhGetJudgmentDisplay({ type: 'daggerheart', hopeDie: 3, fearDie: 6, outcome: 'failure_fear' }).severity).toBe('fumble')
  })
})

describe('dhGetRollActions', () => {
  it('returns empty for entity with no ruleData', () => {
    expect(dhGetRollActions(makeEntity({ ruleData: null }))).toEqual([])
  })
  it('returns 6 actions with 2d12+@attr formulas', () => {
    const entity = makeEntity({ ruleData: { agility:2, strength:1, finesse:3, instinct:0, presence:1, knowledge:2, tier:1, proficiency:1, className:'', ancestry:'', hp:{current:0,max:0}, stress:{current:0,max:0}, hope:0, armor:0 } satisfies DHRuleData })
    const actions = dhGetRollActions(entity)
    expect(actions).toHaveLength(6)
    expect(actions.every(a => a.formula.startsWith('2d12+@'))).toBe(true)
  })
})

describe('rollCommands', () => {
  it('daggerheart:dd resolveFormula with no modifier gives 2d12', () => {
    expect(rollCommands['daggerheart:dd'].resolveFormula()).toBe('2d12')
    expect(rollCommands['daggerheart:dd'].resolveFormula('')).toBe('2d12')
  })
  it('daggerheart:dd resolveFormula with +2 gives 2d12+2', () => {
    expect(rollCommands['daggerheart:dd'].resolveFormula('+2')).toBe('2d12+2')
  })
  it('daggerheart:dd resolveFormula with @agility stays as-is', () => {
    expect(rollCommands['daggerheart:dd'].resolveFormula('+@agility')).toBe('2d12+@agility')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run plugins/daggerheart/__tests__/diceSystem.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: 实现骰子系统**

创建 `plugins/daggerheart/diceSystem.ts`：

```typescript
// plugins/daggerheart/diceSystem.ts
import type { Entity, DiceTermResult, JudgmentResult, JudgmentDisplay, DieStyle, RollAction, DaggerheartOutcome } from '@myvtt/sdk'
import type { DHRuleData } from './types'

const DH_DC = 12 // DaggerHeart standard action roll difficulty

export function dhEvaluateRoll(rolls: number[][], total: number): JudgmentResult | null {
  if (rolls.length === 0 || (rolls[0]?.length ?? 0) < 2) return null
  const [hopeDie, fearDie] = rolls[0]
  const succeeded = total >= DH_DC

  let outcome: DaggerheartOutcome
  if (hopeDie === fearDie) {
    outcome = 'critical_success'
  } else if (succeeded) {
    outcome = hopeDie > fearDie ? 'success_hope' : 'success_fear'
  } else {
    outcome = hopeDie > fearDie ? 'failure_hope' : 'failure_fear'
  }
  return { type: 'daggerheart', hopeDie, fearDie, outcome }
}

export function dhGetDieStyles(rolls: number[][]): DieStyle[] {
  if (rolls.length === 0 || (rolls[0]?.length ?? 0) < 2) return []
  return [
    { termIndex: 0, dieIndex: 0, label: '希望', color: '#fbbf24' },
    { termIndex: 0, dieIndex: 1, label: '恐惧', color: '#dc2626' },
  ]
}

export function dhGetJudgmentDisplay(result: JudgmentResult): JudgmentDisplay {
  if (result.type !== 'daggerheart') return { text: '未知判定', color: '#64748b', severity: 'partial' }
  switch (result.outcome) {
    case 'critical_success': return { text: '命运临界！', color: '#a78bfa', severity: 'critical' }
    case 'success_hope':     return { text: '乘希望而为', color: '#fbbf24', severity: 'success' }
    case 'success_fear':     return { text: '带着恐惧成功', color: '#f97316', severity: 'partial' }
    case 'failure_hope':     return { text: '失败，但保有希望', color: '#60a5fa', severity: 'failure' }
    case 'failure_fear':     return { text: '带着恐惧失败', color: '#ef4444', severity: 'fumble' }
  }
}

export function dhGetRollActions(entity: Entity): RollAction[] {
  if (!entity.ruleData) return []
  const attrs: [string, string][] = [
    ['agility', '敏捷'], ['strength', '力量'], ['finesse', '精巧'],
    ['instinct', '本能'], ['presence', '风采'], ['knowledge', '知识'],
  ]
  return attrs.map(([key, name]) => ({
    id: key, name: `${name}检定`, formula: `2d12+@${key}`, targetAttributeKey: key,
  }))
}

/** Roll commands registered by this plugin — used by ChatInput to handle .dd command */
export const rollCommands: Record<string, { resolveFormula(modifierExpr?: string): string }> = {
  'daggerheart:dd': {
    resolveFormula(modifierExpr?: string): string {
      const mod = (modifierExpr ?? '').trim()
      if (!mod) return '2d12'
      return `2d12${mod.startsWith('+') || mod.startsWith('-') ? mod : '+' + mod}`
    },
  },
}

// getDieStyles wrapper for RulePlugin interface (takes termResults for API consistency)
// v1 stub — DH die styling is handled by DHRollCard directly (calls dhGetDieStyles(message.rolls));
// generic consumers that call plugin.diceSystem.getDieStyles() get no styles for DH rolls.
export function dhGetDieStylesFromTerms(_terms: DiceTermResult[]): DieStyle[] {
  return []
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run plugins/daggerheart/__tests__/diceSystem.test.ts 2>&1 | tail -15
```

期望：全部 PASS（16 个测试）。

- [ ] **Step 5: 提交**

```bash
git add plugins/daggerheart/diceSystem.ts plugins/daggerheart/__tests__/diceSystem.test.ts
git commit -m "feat: add daggerheart dice system — evaluateRoll, rollCommands, judgment display"
```

---

### Task 8: DHRollCard + 插件组装 + 注册 + 接线

**Files:**
- Create: `plugins/daggerheart/ui/DHRollCard.tsx`
- Create: `plugins/daggerheart/DaggerHeartCard.tsx`
- Create: `plugins/daggerheart/index.ts`
- Modify: `src/rules/registry.ts`
- Modify: `plugins/generic/index.ts`
- Modify: `src/chat/ChatPanel.tsx`
- Modify: `src/rules/__tests__/registry.test.ts`

**背景知识：** DHRollCard 是 v1 的最小可用自定义消息卡片，直接从 `message.rolls[0]` 读取希望/恐惧骰值，调用 `dhEvaluateRoll` 得到判定，调用 `dhGetJudgmentDisplay` 得到展示文本。不追求视觉精细度，重点是验证 `rollCardRenderers` 机制能正确分发。

- [ ] **Step 1: 创建 DHRollCard.tsx**

创建 `plugins/daggerheart/ui/DHRollCard.tsx`：

```typescript
// plugins/daggerheart/ui/DHRollCard.tsx
import { useMemo } from 'react'
import type { RollCardProps } from '@myvtt/sdk'
import { tokenizeExpression, buildCompoundResult } from '@myvtt/sdk'
import { dhEvaluateRoll, dhGetDieStyles, dhGetJudgmentDisplay } from '../diceSystem'

export function DHRollCard({ message }: RollCardProps) {
  const rolls = message.rolls ?? []

  const total = useMemo(() => {
    const formula = message.resolvedFormula ?? message.formula
    const terms = tokenizeExpression(formula) ?? []
    return buildCompoundResult(terms, rolls).total
  }, [message.formula, message.resolvedFormula, rolls])

  const [hopeDie, fearDie] = rolls[0] ?? []
  const judgment = useMemo(() => dhEvaluateRoll(rolls, total), [rolls, total])
  const dieStyles = dhGetDieStyles(rolls)
  const display = judgment ? dhGetJudgmentDisplay(judgment) : null

  return (
    <div className="flex flex-col gap-2 pt-1">
      {/* Dice values */}
      <div className="flex items-center gap-3">
        {hopeDie !== undefined && (
          <span
            className="flex flex-col items-center gap-0.5"
            style={{ color: dieStyles[0]?.color ?? '#fbbf24' }}
          >
            <span className="text-[10px] text-text-muted">{dieStyles[0]?.label ?? '希望'}</span>
            <span className="text-xl font-bold font-mono">{hopeDie}</span>
          </span>
        )}
        {fearDie !== undefined && (
          <span
            className="flex flex-col items-center gap-0.5"
            style={{ color: dieStyles[1]?.color ?? '#dc2626' }}
          >
            <span className="text-[10px] text-text-muted">{dieStyles[1]?.label ?? '恐惧'}</span>
            <span className="text-xl font-bold font-mono">{fearDie}</span>
          </span>
        )}
        <span className="text-text-muted/50 text-sm">=</span>
        <span className="text-xl font-bold font-mono text-accent">{total}</span>
      </div>

      {/* Judgment badge */}
      {display && (
        <div
          className="text-xs font-semibold px-2 py-1 rounded self-start"
          style={{ color: display.color, background: `${display.color}22` }}
        >
          {display.text}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 plugins/daggerheart/DaggerHeartCard.tsx**

最小化 EntityCard，显示 HP/Stress/Hope 资源条 + 六维属性：

```typescript
// plugins/daggerheart/DaggerHeartCard.tsx
import type { EntityCardProps } from '@myvtt/sdk'
import type { DHRuleData } from './types'

const ATTRS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const

export function DaggerHeartCard({ entity }: EntityCardProps) {
  const d = entity.ruleData as DHRuleData | null

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="text-text-primary font-semibold">{entity.name}</span>
        {d?.className && <span className="text-xs text-text-muted">{d.className}</span>}
      </div>
      {d && (
        <>
          <div className="flex gap-4 text-sm">
            <span style={{ color: '#ef4444' }}>HP {d.hp.current}/{d.hp.max}</span>
            <span style={{ color: '#f97316' }}>压力 {d.stress.current}/{d.stress.max}</span>
            <span style={{ color: '#fbbf24' }}>希望 {d.hope}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-xs">
            {ATTRS.map((k) => (
              <div key={k} className="flex flex-col items-center bg-black/20 rounded p-1">
                <span className="text-text-muted capitalize">{k}</span>
                <span className="text-text-primary font-bold">
                  {d[k] >= 0 ? '+' : ''}{d[k]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 创建 plugins/daggerheart/index.ts**

```typescript
// plugins/daggerheart/index.ts
import type { RulePlugin } from '@myvtt/sdk'
import { dhGetMainResource, dhGetPortraitResources, dhGetStatuses, dhGetFormulaTokens } from './adapters'
import { dhGetRollActions, dhEvaluateRoll, dhGetDieStylesFromTerms, dhGetJudgmentDisplay, rollCommands } from './diceSystem'
import { createDefaultDHEntityData } from './templates'
import { DaggerHeartCard } from './DaggerHeartCard'
import { DHRollCard } from './ui/DHRollCard'

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

  characterUI: { EntityCard: DaggerHeartCard },

  diceSystem: {
    getRollActions: dhGetRollActions,
    evaluateRoll: dhEvaluateRoll,
    getDieStyles: dhGetDieStylesFromTerms,
    getJudgmentDisplay: dhGetJudgmentDisplay,
    getModifierOptions: () => [],
    rollCommands,
  },

  dataTemplates: { createDefaultEntityData: createDefaultDHEntityData },

  surfaces: {
    rollCardRenderers: {
      'daggerheart:dd': DHRollCard,
    },
  },
}
```

- [ ] **Step 4: 注册到 registry.ts**

```typescript
// src/rules/registry.ts
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

- [ ] **Step 5: 编写并运行注册测试**

在 `src/rules/__tests__/registry.test.ts` 末尾追加：

```typescript
describe('daggerheartPlugin registration', () => {
  it('getRulePlugin returns daggerheart after registration', () => {
    const plugin = getRulePlugin('daggerheart')
    expect(plugin.id).toBe('daggerheart')
  })
  it('daggerheart adapters.getMainResource returns HP', () => {
    const plugin = getRulePlugin('daggerheart')
    const entity = makeEntity({ ruleData: { agility:2, strength:1, finesse:3, instinct:0, presence:1, knowledge:2, tier:1, proficiency:1, className:'R', ancestry:'E', hp:{current:12,max:20}, stress:{current:0,max:6}, hope:2, armor:1 } })
    expect(plugin.adapters.getMainResource(entity)!.current).toBe(12)
  })
  it('daggerheart diceSystem.evaluateRoll works', () => {
    const plugin = getRulePlugin('daggerheart')
    const r = plugin.diceSystem!.evaluateRoll([[8, 5]], 15)
    expect(r?.type).toBe('daggerheart')
  })
  it('daggerheart surfaces.rollCardRenderers has daggerheart:dd', () => {
    const plugin = getRulePlugin('daggerheart')
    expect(plugin.surfaces?.rollCardRenderers?.['daggerheart:dd']).toBeDefined()
  })
})
```

```bash
cd .worktrees/feat/daggerheart-plugin
npx vitest run src/rules/__tests__/registry.test.ts 2>&1 | tail -15
```

期望：全部 PASS。

- [ ] **Step 6: 更新 generic plugin + 接线 ChatPanel**

修改 `plugins/generic/index.ts`，将 `getEntityAttributes` 加入导入行并更新 `getFormulaTokens`：

```typescript
// 在现有 import 行末尾追加 getEntityAttributes
import { getEntityResources, getEntityStatuses, getEntityAttributes } from '../../src/shared/entityAdapters'

// 替换 adapters 中的 getFormulaTokens：
getFormulaTokens(entity: Entity): Record<string, number> {
  const result: Record<string, number> = {}
  for (const attr of getEntityAttributes(entity)) {
    result[attr.key] = attr.value
  }
  return result
},
```

修改 `src/chat/ChatPanel.tsx`，用插件的 `getFormulaTokens` 替换直接调用 entityAdapters：

```typescript
// 顶部添加
import { useRulePlugin } from '../rules/useRulePlugin'

// ChatPanel 函数体内，现有 hooks 之后：
const plugin = useRulePlugin()

// 替换 activeSpeakerProps useMemo：
const activeSpeakerProps = useMemo(() => {
  if (!speakerEntity) return seatProperties
  const tokens = plugin.adapters.getFormulaTokens(speakerEntity)
  return Object.entries(tokens).map(([key, value]) => ({ key, value: String(value) }))
}, [speakerEntity, seatProperties, plugin])
```

- [ ] **Step 7: 运行全套测试，确认通过**

```bash
cd .worktrees/feat/daggerheart-plugin && npm test 2>&1 | tail -20
```

期望：所有测试 PASS。

- [ ] **Step 8: 确认 TypeScript 无报错**

```bash
cd .worktrees/feat/daggerheart-plugin && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 9: 提交**

```bash
cd .worktrees/feat/daggerheart-plugin
git add plugins/daggerheart/ui/DHRollCard.tsx plugins/daggerheart/DaggerHeartCard.tsx plugins/daggerheart/index.ts
git add src/rules/registry.ts src/rules/__tests__/registry.test.ts
git add plugins/generic/index.ts src/chat/ChatPanel.tsx
git commit -m "feat: assemble daggerheart plugin — DHRollCard, rollCardRenderers, registry, ChatPanel wiring"
```

---

## 验证清单

完成全部任务后执行：

```bash
cd .worktrees/feat/daggerheart-plugin
npm test          # 全套测试通过
npx tsc --noEmit  # TypeScript 无报错
```

**端到端验证路径：**

| 步骤 | 操作 | 期望结果 |
|---|---|---|
| 1 | 在 DaggerHeart 房间输入 `.dd +2` 发送 | 服务端生成 2 个 d12 随机数，广播 `{rolls: [[x,y]], rollType: 'daggerheart:dd'}` |
| 2 | 消息出现在聊天 | 渲染 `DHRollCard`（不是 `DiceResultCard`） |
| 3 | DHRollCard 显示 | 希望骰（金色）、恐惧骰（红色）、总数、判定徽章 |
| 4 | 在 generic 房间输入 `.r 2d6+3` | 渲染标准 `DiceResultCard`，显示骰子动画 |
| 5 | 以 DH 角色身份投骰 `.dd +@agility` | `@agility` 正确解析为数字（通过 `getFormulaTokens`） |

**数据层验证：**

| 层 | 验证方式 |
|---|---|
| 服务端纯随机数 | `dice-pure-rng.test.ts`：响应含 `rolls`，无 `terms`/`total` |
| 客户端重建 | `DiceResultCard` 正常渲染（`buildCompoundResult` 从 `rolls` 重建） |
| 插件注册 | `registry.test.ts` 新增 4 个测试通过 |
| 骰子判定 | `diceSystem.test.ts` 16 个测试全通过 |
| 自定义卡片分发 | `rollCardRenderers['daggerheart:dd']` 已注册且可调用 |
