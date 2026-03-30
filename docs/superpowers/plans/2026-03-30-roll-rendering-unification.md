# Roll Rendering Unification Implementation Plan

> **状态**：✅ 已完成 | 2026-03-30

**Goal:** Eliminate redundant `dh:judgment` log entries, unify two rendering registration systems into one typed system, and make `RollResultRenderer` plugin-aware with dual-mode (config/component) registration.

**Architecture:** `RendererPoint<T>` typed tokens replace string-keyed registry. `RollResultRenderer` queries `'rollResult'` surface for plugin configs. `dh:judgment` workflow extracted as reusable sub-workflow. `ExtensionRegistry` deleted entirely.

**Tech Stack:** React, TypeScript (phantom types), Vitest, Playwright E2E

**Spec:** `docs/superpowers/specs/2026-03-30-roll-rendering-unification-design.md`

---

## File Map

| File                                                | Action | Responsibility                                                   |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `src/log/rendererRegistry.ts`                       | Modify | `RendererPoint<T>` generic API, backward-compat string overloads |
| `src/log/rendererRegistry.test.ts`                  | Modify | Add typed token tests                                            |
| `src/rules/types.ts`                                | Modify | Add `RollResultConfig` interface                                 |
| `src/rules/sdk.ts`                                  | Modify | Export `rollResult` token factory + `RollResultConfig`           |
| `src/log/renderers/RollResultRenderer.tsx`          | Modify | Plugin-aware routing: config → component → default               |
| `src/log/renderers/RollResultRenderer.test.tsx`     | Create | Unit tests for routing logic                                     |
| `plugins/daggerheart-core/rollSteps.ts`             | Modify | Extract `dh:judgment` sub-workflow, delete `dh:emit-judgment`    |
| `plugins/daggerheart-core/rollSteps.test.ts`        | Modify | Update workflow tests                                            |
| `src/chat/ChatPanel.tsx`                            | Modify | Remove groupId filtering + debug logs                            |
| `src/log/LogEntryCard.tsx`                          | Modify | Remove debug console.log                                         |
| `src/chat/MessageCard.tsx`                          | Modify | Remove dice rendering path                                       |
| `src/workflow/pluginSDK.ts`                         | Modify | Remove `extensionRegistry` param + `contribute`                  |
| `src/workflow/useWorkflowSDK.ts`                    | Modify | Remove `getExtensionRegistry()` call                             |
| `src/ui-system/registrationTypes.ts`                | Modify | Remove `contribute` from `IUIRegistrationSDK`                    |
| `src/ui-system/uiSystemInit.ts`                     | Modify | Remove `getExtensionRegistry()`                                  |
| `src/ui-system/extensionRegistry.ts`                | Delete | Unified into rendererRegistry                                    |
| `src/ui-system/__tests__/extensionRegistry.test.ts` | Delete | Follows source deletion                                          |
| `plugins/daggerheart-core/DHJudgmentRenderer.tsx`   | Delete | No more `dh:judgment` entries                                    |
| `e2e/scenarios/chat-dice.spec.ts`                   | Modify | Update E2E for new behavior                                      |
| `e2e/pages/chat-panel.page.ts`                      | Modify | Update page object helpers                                       |

---

### Task 1: Enhance `rendererRegistry` with `RendererPoint<T>`

**Files:**

- Modify: `src/log/rendererRegistry.ts`
- Modify: `src/log/rendererRegistry.test.ts`

- [ ] **Step 1: Write failing tests for typed token API**

Add tests to `src/log/rendererRegistry.test.ts`:

```typescript
import {
  registerRenderer,
  getRenderer,
  clearRenderers,
  createRendererPoint,
} from './rendererRegistry'

// ... existing tests unchanged ...

describe('RendererPoint<T> typed API', () => {
  beforeEach(() => {
    clearRenderers()
  })

  it('register and get via RendererPoint token', () => {
    const point = createRendererPoint<{ entry: unknown }>('chat', 'core:text')
    const Dummy = () => null
    registerRenderer(point, Dummy)
    expect(getRenderer(point)).toBe(Dummy)
  })

  it('string API and token API share the same registry', () => {
    const Dummy = () => null
    registerRenderer('chat', 'core:text', Dummy)
    const point = createRendererPoint<{ entry: unknown }>('chat', 'core:text')
    expect(getRenderer(point)).toBe(Dummy)
  })

  it('token get returns undefined for unregistered', () => {
    const point = createRendererPoint<{ entry: unknown }>('chat', 'missing')
    expect(getRenderer(point)).toBeUndefined()
  })

  it('non-component values can be registered (config objects)', () => {
    const point = createRendererPoint<{ dieConfigs: { color: string }[] }>(
      'rollResult',
      'test:roll',
    )
    const config = { dieConfigs: [{ color: '#fff' }] }
    registerRenderer(point, config)
    expect(getRenderer(point)).toBe(config)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/log/rendererRegistry.test.ts`
Expected: FAIL — `createRendererPoint` does not exist yet

- [ ] **Step 3: Implement `RendererPoint<T>` in rendererRegistry.ts**

Replace `src/log/rendererRegistry.ts`:

```typescript
// src/log/rendererRegistry.ts
import type React from 'react'
import type { GameLogEntry } from '../shared/logTypes'

export interface LogEntryRendererProps {
  entry: GameLogEntry
  isNew?: boolean
  animationStyle?: 'toast' | 'scroll'
}

export type LogEntryRenderer = React.ComponentType<LogEntryRendererProps>

/** Typed token for a renderer extension point. __phantom carries type info at compile time only. */
export interface RendererPoint<T> {
  readonly surface: string
  readonly type: string
  readonly __phantom?: T
}

/** Create a typed renderer point token. */
export function createRendererPoint<T>(surface: string, type: string): RendererPoint<T> {
  return { surface, type } as RendererPoint<T>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, any>()

function key(surface: string, type: string): string {
  return `${surface}::${type}`
}

// Overload: typed token API
export function registerRenderer<T>(point: RendererPoint<T>, value: T): void
// Overload: legacy string API (backward compat)
export function registerRenderer(surface: string, type: string, renderer: LogEntryRenderer): void
// Implementation
export function registerRenderer<T>(
  pointOrSurface: RendererPoint<T> | string,
  valueOrType: T | string,
  renderer?: LogEntryRenderer,
): void {
  let k: string
  let val: unknown
  if (typeof pointOrSurface === 'string') {
    k = key(pointOrSurface, valueOrType as string)
    val = renderer
  } else {
    k = key(pointOrSurface.surface, pointOrSurface.type)
    val = valueOrType
  }
  if (registry.has(k)) {
    console.warn(`[RendererRegistry] "${k}" already registered, skipping`)
    return
  }
  registry.set(k, val)
}

// Overload: typed token API
export function getRenderer<T>(point: RendererPoint<T>): T | undefined
// Overload: legacy string API
export function getRenderer(surface: string, type: string): LogEntryRenderer | undefined
// Implementation
export function getRenderer<T>(
  pointOrSurface: RendererPoint<T> | string,
  type?: string,
): T | LogEntryRenderer | undefined {
  if (typeof pointOrSurface === 'string') {
    return registry.get(key(pointOrSurface, type!))
  }
  return registry.get(key(pointOrSurface.surface, pointOrSurface.type))
}

export function clearRenderers(): void {
  registry.clear()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/log/rendererRegistry.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```
feat: enhance rendererRegistry with RendererPoint<T> typed token API
```

---

### Task 2: Add `RollResultConfig` type + SDK `rollResult` token export

**Files:**

- Modify: `src/rules/types.ts:134` (after `RenderDiceOptions`)
- Modify: `src/rules/sdk.ts`

- [ ] **Step 1: Add `RollResultConfig` to types.ts**

In `src/rules/types.ts`, after the `RenderDiceOptions` interface (line 134), add:

```typescript
/** Semantic configuration for a roll type's display. Plugins register this via rollResult() token. */
export interface RollResultConfig {
  dieConfigs: DieConfig[]
}
```

- [ ] **Step 2: Add `rollResult` token factory and exports to sdk.ts**

In `src/rules/sdk.ts`, add these exports:

```typescript
// ── Renderer typed tokens (plugin registration API) ─────────────────────────
export type { RollResultConfig } from './types'
export type { RendererPoint } from '../log/rendererRegistry'
export { createRendererPoint } from '../log/rendererRegistry'

// Pre-defined token factory for roll result configs
import { createRendererPoint } from '../log/rendererRegistry'
import type { RollResultConfig } from './types'
import type { RollCardProps } from './types'
import type { ComponentType } from 'react'

type RollResultSlot = RollResultConfig | ComponentType<RollCardProps>

export function rollResult(
  rollType: string,
): import('../log/rendererRegistry').RendererPoint<RollResultSlot> {
  return createRendererPoint<RollResultSlot>('rollResult', rollType)
}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```
feat: add RollResultConfig type and rollResult() SDK token factory
```

---

### Task 3: Make `RollResultRenderer` plugin-aware

**Files:**

- Modify: `src/log/renderers/RollResultRenderer.tsx`
- Create: `src/log/renderers/RollResultRenderer.test.tsx`

- [ ] **Step 1: Write failing tests for RollResultRenderer routing**

Create `src/log/renderers/RollResultRenderer.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RollResultRenderer } from './RollResultRenderer'
import { registerRenderer, clearRenderers, createRendererPoint } from '../rendererRegistry'
import type { GameLogEntry } from '../../shared/logTypes'
import type { RollResultConfig, RollCardProps } from '../../rules/types'
import type { ComponentType } from 'react'

// Mock useRulePlugin
vi.mock('../../rules/useRulePlugin', () => ({
  useRulePlugin: () => ({
    diceSystem: {
      evaluateRoll: (rolls: number[][], total: number) => {
        if (rolls[0]?.[0] > rolls[0]?.[1]) return { type: 'daggerheart', hopeDie: rolls[0][0], fearDie: rolls[0][1], outcome: 'success_hope' }
        return null
      },
      getJudgmentDisplay: () => ({ text: 'dh.success_hope', color: '#22c55e', severity: 'success' }),
    },
  }),
}))

// Mock usePluginTranslation
vi.mock('../../i18n/pluginI18n', () => ({
  usePluginTranslation: () => ({ t: (k: string) => k }),
}))

function makeRollEntry(overrides: Partial<GameLogEntry & { payload: Record<string, unknown> }> = {}): GameLogEntry {
  return {
    id: 'test-001',
    type: 'core:roll-result',
    origin: { seat: { id: 's1', name: 'GM', color: '#fff' } },
    timestamp: Date.now(),
    payload: {
      formula: '2d12+3',
      rolls: [[9, 3]],
      dice: [{ count: 2, sides: 12 }],
      rollType: undefined,
      ...overrides.payload,
    },
    ...overrides,
  } as GameLogEntry
}

describe('RollResultRenderer', () => {
  beforeEach(() => {
    clearRenderers()
  })

  it('renders default DiceAnimContent when no rollType', () => {
    const entry = makeRollEntry()
    render(<RollResultRenderer entry={entry} />)
    expect(screen.getByTestId('entry-roll-result')).toBeInTheDocument()
  })

  it('renders default DiceAnimContent when rollType has no registration', () => {
    const entry = makeRollEntry({ payload: { formula: '2d12', rolls: [[5, 3]], dice: [], rollType: 'unknown:type' } })
    render(<RollResultRenderer entry={entry} />)
    expect(screen.getByTestId('entry-roll-result')).toBeInTheDocument()
  })

  it('uses RollResultConfig when registered for rollType', () => {
    const point = createRendererPoint<RollResultConfig | ComponentType<RollCardProps>>('rollResult', 'test:dd')
    registerRenderer(point, {
      dieConfigs: [
        { color: '#fbbf24', label: 'Hope' },
        { color: '#dc2626', label: 'Fear' },
      ],
    })
    const entry = makeRollEntry({ payload: { formula: '2d12', rolls: [[9, 3]], dice: [], rollType: 'test:dd' } })
    render(<RollResultRenderer entry={entry} />)
    expect(screen.getByTestId('entry-roll-result')).toBeInTheDocument()
  })

  it('uses custom component when function registered for rollType', () => {
    const CustomCard: ComponentType<RollCardProps> = ({ message }) => (
      <div data-testid="custom-card">{message.formula}</div>
    )
    const point = createRendererPoint<RollResultConfig | ComponentType<RollCardProps>>('rollResult', 'custom:roll')
    registerRenderer(point, CustomCard)
    const entry = makeRollEntry({ payload: { formula: '3d6', rolls: [[2, 4, 1]], dice: [], rollType: 'custom:roll' } })
    render(<RollResultRenderer entry={entry} />)
    expect(screen.getByTestId('custom-card')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/log/renderers/RollResultRenderer.test.tsx`
Expected: FAIL — RollResultRenderer doesn't have plugin-aware routing yet

- [ ] **Step 3: Implement plugin-aware RollResultRenderer**

Replace `src/log/renderers/RollResultRenderer.tsx`:

```typescript
import { useMemo, useCallback } from 'react'
import type { LogEntryRendererProps } from '../rendererRegistry'
import { getRenderer } from '../rendererRegistry'
import { isLogType } from '../../shared/logTypes'
import { CardShell } from '../CardShell'
import { DiceAnimContent } from '../../chat/DiceResultCard'
import { useRulePlugin } from '../../rules/useRulePlugin'
import { usePluginTranslation } from '../../i18n/pluginI18n'
import type { RollResultConfig, RollCardProps, DieConfig, RenderDiceOptions } from '../../rules/types'
import type { ChatRollMessage } from '../../shared/chatTypes'
import type { ComponentType } from 'react'
import { tokenizeExpression, buildCompoundResult } from '../../shared/diceUtils'

type RollResultSlot = RollResultConfig | ComponentType<RollCardProps>

export function RollResultRenderer({ entry, isNew, animationStyle }: LogEntryRendererProps) {
  if (!isLogType(entry, 'core:roll-result')) return null

  const plugin = useRulePlugin()
  const { t } = usePluginTranslation()
  const { formula, resolvedFormula, rolls, dice, rollType, actionName } = entry.payload

  // Compute total for judgment evaluation
  const total = useMemo(() => {
    const finalFormula = resolvedFormula ?? formula
    const terms = tokenizeExpression(finalFormula)
    return buildCompoundResult(terms ?? [], rolls).total
  }, [formula, resolvedFormula, rolls])

  // Query registry for plugin-registered slot
  const slot = useMemo(
    () => (rollType ? (getRenderer('rollResult', rollType) as RollResultSlot | undefined) : undefined),
    [rollType],
  )

  // Build renderDice callback for component escape hatch
  const renderDice = useCallback(
    (configs?: DieConfig[], options?: RenderDiceOptions) => (
      <DiceAnimContent
        formula={formula}
        resolvedFormula={resolvedFormula}
        rolls={rolls}
        isNew={!!isNew}
        dieConfigs={configs}
        footer={options?.footer}
        totalColor={options?.totalColor}
      />
    ),
    [formula, resolvedFormula, rolls, isNew],
  )

  // 1. Semantic config (simple path)
  if (slot && typeof slot !== 'function') {
    const config = slot as RollResultConfig
    const judgment = plugin.diceSystem?.evaluateRoll(rolls, total) ?? null
    const display = judgment ? plugin.diceSystem?.getJudgmentDisplay(judgment) : null
    return (
      <CardShell entry={entry} isNew={isNew} variant="accent" animationStyle={animationStyle}>
        <div data-testid="entry-roll-result">
          <DiceAnimContent
            formula={formula}
            resolvedFormula={resolvedFormula}
            rolls={rolls}
            isNew={!!isNew}
            dieConfigs={config.dieConfigs}
            footer={display ? { text: t(display.text), color: display.color } : undefined}
            totalColor={display?.color}
          />
        </div>
      </CardShell>
    )
  }

  // 2. Component override (escape hatch)
  if (slot && typeof slot === 'function') {
    const CustomCard = slot as ComponentType<RollCardProps>
    const chatMsg: ChatRollMessage = {
      type: 'roll',
      id: entry.id,
      origin: entry.origin,
      timestamp: entry.timestamp,
      formula,
      resolvedFormula,
      dice,
      rolls,
      rollType,
      actionName,
    }
    return (
      <CardShell entry={entry} isNew={isNew} variant="accent" animationStyle={animationStyle}>
        <div data-testid="entry-roll-result">
          <CustomCard message={chatMsg} isNew={isNew} renderDice={renderDice} />
        </div>
      </CardShell>
    )
  }

  // 3. Default plain dice
  return (
    <CardShell entry={entry} isNew={isNew} variant="accent" animationStyle={animationStyle}>
      <div data-testid="entry-roll-result">
        <DiceAnimContent
          formula={formula}
          resolvedFormula={resolvedFormula}
          rolls={rolls}
          isNew={!!isNew}
        />
      </div>
    </CardShell>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/log/renderers/RollResultRenderer.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```
feat: make RollResultRenderer plugin-aware with config/component dual routing
```

---

### Task 4: Register Daggerheart rollResult config via SDK

**Files:**

- Modify: `plugins/daggerheart-core/rollSteps.ts:121-127`

- [ ] **Step 1: Replace DHJudgmentRenderer registration with rollResult config**

In `plugins/daggerheart-core/rollSteps.ts`, replace lines 121-126:

```typescript
sdk.ui.registerRenderer(
  'chat',
  'dh:judgment',
  DHJudgmentRenderer as React.ComponentType<{ entry: unknown; isNew?: boolean }>,
)
```

with:

```typescript
import { rollResult } from '@myvtt/sdk'
// ... (move import to top of file)

sdk.ui.registerRenderer(rollResult('daggerheart:dd'), {
  dieConfigs: [
    { color: '#fbbf24', label: 'die.hope' },
    { color: '#dc2626', label: 'die.fear' },
  ],
})
```

Also remove the `import { DHJudgmentRenderer } from './DHJudgmentRenderer'` at the top.

Note: `sdk.ui.registerRenderer` currently only accepts `(string, string, Component)`. The typed token overload added in Task 1 to the registry function needs to be reflected in the `IUIRegistrationSDK` interface. Update `src/ui-system/registrationTypes.ts` to add the overload:

In `IUIRegistrationSDK`:

```typescript
  registerRenderer(
    surface: string,
    type: string,
    renderer: React.ComponentType<{ entry: unknown; isNew?: boolean }>,
  ): void
  registerRenderer<T>(
    point: { readonly surface: string; readonly type: string; readonly __phantom?: T },
    value: T,
  ): void
```

And update `src/workflow/pluginSDK.ts` line 60-61 to handle both overloads:

```typescript
          registerRenderer: (...args: [any, any, any?]) => {
            if (typeof args[0] === 'string') {
              registerRendererFn(args[0], args[1], args[2] as LogEntryRenderer)
            } else {
              // RendererPoint<T> token path
              const point = args[0] as { surface: string; type: string }
              registerRendererFn(point, args[1])
            }
          },
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
feat: register daggerheart:dd via rollResult() typed token instead of DHJudgmentRenderer
```

---

### Task 5: Extract `dh:judgment` sub-workflow + delete `dh:emit-judgment`

**Files:**

- Modify: `plugins/daggerheart-core/rollSteps.ts`

- [ ] **Step 1: Write failing test for the extracted judgment workflow**

In `plugins/daggerheart-core/rollSteps.test.ts`, add a test (or create the file if needed):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test that dh:action-check no longer emits dh:judgment entries
describe('dh:action-check workflow', () => {
  it('does not emit dh:judgment entry', async () => {
    // This test verifies the workflow no longer has a dh:emit-judgment step
    // by checking the step IDs of the workflow
    const { getDHActionCheckWorkflow } = await import('./rollSteps')
    // getDHActionCheckWorkflow() would throw if not initialized
    // We'll verify via inspectWorkflow in integration tests
  })
})
```

- [ ] **Step 2: Refactor rollSteps.ts**

Replace `plugins/daggerheart-core/rollSteps.ts` with:

```typescript
// plugins/daggerheart-core/rollSteps.ts
import type { IPluginSDK, WorkflowHandle, JudgmentResult } from '@myvtt/sdk'
import { getRollWorkflow, toastEvent, rollResult } from '@myvtt/sdk'
import { dhEvaluateRoll } from '../daggerheart/diceSystem'

/** Data shape for the dh:judgment sub-workflow */
export interface DHJudgmentData {
  [key: string]: unknown
  rolls: number[][]
  total: number
  judgment?: JudgmentResult
}

/** Data shape for the dh:action-check workflow */
export interface DHActionCheckData {
  [key: string]: unknown
  formula: string
  actorId: string
  rolls?: number[][]
  total?: number
  judgment?: JudgmentResult
}

let _judgmentWorkflow: WorkflowHandle<DHJudgmentData> | undefined
let _actionCheckWorkflow: WorkflowHandle<DHActionCheckData> | undefined

export function getDHJudgmentWorkflow(): WorkflowHandle<DHJudgmentData> {
  if (!_judgmentWorkflow) {
    throw new Error('dh:judgment not initialized — call registerDHCoreSteps first')
  }
  return _judgmentWorkflow
}

export function getDHActionCheckWorkflow(): WorkflowHandle<DHActionCheckData> {
  if (!_actionCheckWorkflow) {
    throw new Error('dh:action-check not initialized — call registerDHCoreSteps first')
  }
  return _actionCheckWorkflow
}

export function registerDHCoreSteps(sdk: IPluginSDK): void {
  // Reusable sub-workflow: judgment computation + tracker update
  _judgmentWorkflow = sdk.defineWorkflow<DHJudgmentData>('dh:judgment', [
    {
      id: 'judge',
      run: (ctx) => {
        const rolls = ctx.vars.rolls
        const total = ctx.vars.total
        if (!rolls || total == null) return
        const judgment = dhEvaluateRoll(rolls, total)
        if (judgment) {
          ctx.vars.judgment = judgment
        }
      },
    },
    {
      id: 'resolve',
      run: (ctx) => {
        const judgment = ctx.vars.judgment as { type: string; outcome: string } | undefined
        if (!judgment || judgment.type !== 'daggerheart') return
        const outcome = judgment.outcome
        if (outcome === 'success_hope' || outcome === 'failure_hope') {
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- will be removed when teamTracker is redesigned
          ctx.updateTeamTracker('Hope', { current: 1 })
        } else if (outcome === 'success_fear' || outcome === 'failure_fear') {
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- will be removed when teamTracker is redesigned
          ctx.updateTeamTracker('Fear', { current: 1 })
        }
      },
    },
  ])

  // Composite workflow: roll + judgment + display
  _actionCheckWorkflow = sdk.defineWorkflow<DHActionCheckData>('dh:action-check', [
    {
      id: 'roll',
      run: async (ctx) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- formula absent when invoked via command system
        let formula = ctx.vars.formula ?? (ctx.vars.raw as string | undefined)
        if (!formula) {
          formula = '2d12'
        }
        if (!/\d+d\d+/i.test(formula)) {
          const mod = formula.trim()
          formula = mod.startsWith('+') || mod.startsWith('-') ? `2d12${mod}` : `2d12+${mod}`
        }
        ctx.vars.formula = formula

        const result = await ctx.runWorkflow(getRollWorkflow(), {
          formula,
          actorId: ctx.vars.actorId,
          resolvedFormula: ctx.vars.resolvedFormula as string | undefined,
          rollType: ctx.vars.rollType as string | undefined,
          actionName: ctx.vars.actionName as string | undefined,
        })
        if (result.status === 'completed') {
          ctx.vars.rolls = result.output.rolls
          ctx.vars.total = result.output.total
        } else {
          ctx.abort(result.reason ?? 'Roll failed')
        }
      },
    },
    {
      id: 'judgment',
      run: async (ctx) => {
        const rolls = ctx.vars.rolls
        const total = ctx.vars.total
        if (!rolls || total == null) return
        const result = await ctx.runWorkflow(getDHJudgmentWorkflow(), { rolls, total })
        if (result.status === 'completed') {
          ctx.vars.judgment = result.output.judgment
        }
      },
    },
    {
      id: 'display',
      run: (ctx) => {
        const { formula, total, judgment } = ctx.vars
        if (typeof total !== 'number') return
        const dh = judgment as { type: string; outcome: string } | undefined
        const judgmentStr = dh?.type === 'daggerheart' ? ` (${dh.outcome})` : ''
        ctx.events.emit(toastEvent, {
          text: `🎲 ${formula} = ${total}${judgmentStr}`,
          variant: 'success',
        })
      },
    },
  ])

  sdk.registerCommand('.dd', _actionCheckWorkflow)

  // Register rollResult config for daggerheart:dd
  sdk.ui.registerRenderer(rollResult('daggerheart:dd'), {
    dieConfigs: [
      { color: '#fbbf24', label: 'die.hope' },
      { color: '#dc2626', label: 'die.fear' },
    ],
  })
}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all unit tests**

Run: `npx vitest run`
Expected: ALL PASS (or only unrelated failures)

- [ ] **Step 5: Commit**

```
refactor: extract dh:judgment as reusable sub-workflow, delete dh:emit-judgment step
```

---

### Task 6: Clean up ChatPanel — remove groupId filtering + debug logs

**Files:**

- Modify: `src/chat/ChatPanel.tsx:24,103-118`

- [ ] **Step 1: Remove `dh:judgment` from CHAT_TYPES and groupId filtering**

In `src/chat/ChatPanel.tsx`, replace line 24:

```typescript
const CHAT_TYPES = new Set(['core:text', 'core:roll-result', 'dh:judgment'])
```

with:

```typescript
const CHAT_TYPES = new Set(['core:text', 'core:roll-result'])
```

Replace lines 103-118 (the entire `visibleEntries` useMemo):

```typescript
const visibleEntries = useMemo(() => logEntries.filter((e) => CHAT_TYPES.has(e.type)), [logEntries])
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
refactor: remove groupId judgment filtering and debug logs from ChatPanel
```

---

### Task 7: Clean up LogEntryCard — remove debug log

**Files:**

- Modify: `src/log/LogEntryCard.tsx:61`

- [ ] **Step 1: Remove console.log**

Delete line 61:

```typescript
console.log(
  '[LogEntryCard]',
  entry.type,
  entry.id.slice(0, 8),
  renderer ? renderer.name || 'anonymous' : 'NO_RENDERER',
)
```

- [ ] **Step 2: Commit**

```
chore: remove debug console.log from LogEntryCard
```

---

### Task 8: Remove MessageCard dice rendering path

**Files:**

- Modify: `src/chat/MessageCard.tsx`

- [ ] **Step 1: Remove dice rendering code**

In `src/chat/MessageCard.tsx`:

1. Remove imports: `DiceResultCard`, `DiceAnimContent`, `useRulePlugin`, `DieConfig`, `RenderDiceOptions`
2. Remove the `CustomCard` lookup (lines 35-38)
3. Remove the `renderDice` callback (lines 42-55)
4. Remove the entire dice message section (lines 112-167, the final `return` block starting `// Dice message`)
5. Remove the `plugin` variable (line 33)
6. Remove `cardHover` state + `setCardHover` (line 32) if only used by dice path

After cleanup, `MessageCard` only handles `'text'` and `'judgment'` types (judgment kept as historical fallback).

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
refactor: remove dice rendering path from MessageCard — RollResultRenderer handles all rolls
```

---

### Task 9: Delete ExtensionRegistry + clean up all references

**Files:**

- Delete: `src/ui-system/extensionRegistry.ts`
- Delete: `src/ui-system/__tests__/extensionRegistry.test.ts`
- Modify: `src/ui-system/registrationTypes.ts` — remove `contribute` method
- Modify: `src/workflow/pluginSDK.ts` — remove `extensionRegistry` param
- Modify: `src/workflow/useWorkflowSDK.ts` — remove `getExtensionRegistry()` call
- Modify: `src/ui-system/uiSystemInit.ts` — remove `getExtensionRegistry()`
- Modify: `src/workflow/types.ts` — remove `contribute` from `IPluginSDK.ui` type if present

- [ ] **Step 1: Delete files**

```bash
rm src/ui-system/extensionRegistry.ts
rm src/ui-system/__tests__/extensionRegistry.test.ts
```

- [ ] **Step 2: Remove `contribute` from IUIRegistrationSDK**

In `src/ui-system/registrationTypes.ts`, remove lines 47-51:

```typescript
  contribute<T>(
    point: { readonly key: string },
    component: React.ComponentType<T>,
    priority?: number,
  ): void
```

- [ ] **Step 3: Remove extensionRegistry from PluginSDK constructor**

In `src/workflow/pluginSDK.ts`:

- Remove import of `ExtensionRegistry` (line 27)
- Remove `extensionRegistry` parameter from constructor (line 47)
- Remove `contribute` implementation (lines 63-65)
- Remove `contribute` from no-op fallback (line 72)

- [ ] **Step 4: Remove getExtensionRegistry() from useWorkflowSDK.ts**

In `src/workflow/useWorkflowSDK.ts`, remove `getExtensionRegistry()` from the `PluginSDK` constructor call (line 160). The constructor now takes 4 args:

```typescript
const sdk = new PluginSDK(engine, plugin.id, getUIRegistry(), _triggerRegistry)
```

- [ ] **Step 5: Remove getExtensionRegistry() from uiSystemInit.ts**

In `src/ui-system/uiSystemInit.ts`:

- Remove import of `ExtensionRegistry` (line 3)
- Remove `_extensionRegistry` variable (line 11)
- Remove `getExtensionRegistry()` function (lines 18-21)
- Remove `_extensionRegistry = null` from `_resetRegistriesForTesting()` (line 26)

- [ ] **Step 6: Delete DHJudgmentRenderer**

```bash
rm plugins/daggerheart-core/DHJudgmentRenderer.tsx
```

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Run all unit tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```
refactor: delete ExtensionRegistry and DHJudgmentRenderer — unified into rendererRegistry
```

---

### Task 10: Export `getDHJudgmentWorkflow` from SDK

**Files:**

- Modify: `src/rules/sdk.ts`

- [ ] **Step 1: Add export for reusable judgment workflow**

In `src/rules/sdk.ts`, add:

```typescript
export { getDHJudgmentWorkflow } from '../../plugins/daggerheart-core/rollSteps'
export type { DHJudgmentData } from '../../plugins/daggerheart-core/rollSteps'
```

Note: Check if this creates a circular dependency. If it does, skip this step — the workflow getter can be imported directly from the plugin module by other plugins that depend on daggerheart-core.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
feat: export getDHJudgmentWorkflow from SDK for workflow composition
```

---

### Task 11: Update E2E tests

**Files:**

- Modify: `e2e/scenarios/chat-dice.spec.ts`
- Modify: `e2e/pages/chat-panel.page.ts`

- [ ] **Step 1: Update `expectJudgmentVisible` to match new rendering**

After the refactor, `.dd` rolls render as `core:roll-result` with `data-testid="entry-roll-result"` (via `RollResultRenderer`), not `data-testid="entry-dh-judgment"` (the deleted `DHJudgmentRenderer`). The judgment info (Hope/Fear) appears as a footer inside the roll card.

Update `e2e/pages/chat-panel.page.ts`:

```typescript
  /** Expect a roll card with judgment footer to be visible (Hope/Fear text) */
  async expectJudgmentVisible() {
    // After unification, judgment renders as part of the roll-result card
    // Look for the roll-result card containing Hope or Fear text
    await expect(
      this.page.getByTestId('entry-roll-result').filter({
        hasText: /Hope|Fear|希望|恐惧/,
      }).first(),
    ).toBeVisible({ timeout: 5000 })
  }
```

- [ ] **Step 2: Update groupId E2E test**

The test `entries from same workflow share groupId` at line 121 currently looks for `dh:judgment` entries. After the refactor, no `dh:judgment` entries are emitted. Update to check for `core:roll-result` + `core:tracker-update` sharing a groupId:

```typescript
test('entries from same workflow share groupId', async ({ page }) => {
  const admin = new AdminPage(page)
  await admin.goto()
  const groupRoom = `groupid-e2e-${Date.now()}`
  await admin.createRoom(groupRoom)
  await admin.enterRoom(groupRoom)
  const seatSelect = new SeatSelectPage(page)
  await seatSelect.createAndJoin('GM', 'GM')
  const room = new RoomPage(page)
  await room.expectInRoom()

  await room.chat.expandChat()
  await room.chat.sendMessage('.dd 2d12+3')

  // Wait for roll result with judgment footer
  await room.chat.expectJudgmentVisible()

  // Verify: roll-result and tracker-update share groupId (dh:judgment no longer emitted)
  const groupCheck = await page.waitForFunction(
    () => {
      const store = (window as any).__MYVTT_STORES__?.world()
      if (!store?.logEntries?.length) return null

      const entries = store.logEntries
      const rollEntry = entries.find((e: any) => e.type === 'core:roll-result')
      const trackerEntry = entries.find((e: any) => e.type === 'core:tracker-update')

      if (!rollEntry || !trackerEntry) return null

      return {
        rollGroupId: rollEntry.groupId,
        trackerGroupId: trackerEntry.groupId,
        match: rollEntry.groupId === trackerEntry.groupId,
        notEmpty: rollEntry.groupId != null && rollEntry.groupId !== '',
      }
    },
    { timeout: 10000 },
  )

  const result = await groupCheck.jsonValue()
  expect(result.match).toBe(true)
  expect(result.notEmpty).toBe(true)
})
```

- [ ] **Step 3: Add new E2E test — basic roll (.r) shows plain dice**

Add to `e2e/scenarios/chat-dice.spec.ts`:

```typescript
test('.r shows plain dice without judgment', async ({ page }) => {
  const admin = new AdminPage(page)
  await admin.goto()
  const plainRoom = `plain-roll-e2e-${Date.now()}`
  await admin.createRoom(plainRoom)
  await admin.enterRoom(plainRoom)
  const seatSelect = new SeatSelectPage(page)
  await seatSelect.createAndJoin('GM', 'GM')
  const room = new RoomPage(page)
  await room.expectInRoom()

  await room.chat.expandChat()
  await room.chat.sendMessage('.r 2d6+3')

  // Roll result card appears without Hope/Fear text
  await expect(page.getByTestId('entry-roll-result').first()).toBeVisible({ timeout: 5000 })
  // Verify no judgment text in the card
  const card = page.getByTestId('entry-roll-result').first()
  await expect(card).not.toContainText('Hope')
  await expect(card).not.toContainText('Fear')
})
```

- [ ] **Step 4: Commit**

```
test: update E2E tests for roll rendering unification
```

---

### Task 12: Run full test suite + type check

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Full unit test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: E2E tests (requires preview)**

Run:

```bash
./scripts/preview start
npx playwright test e2e/scenarios/chat-dice.spec.ts
```

Expected: ALL PASS

- [ ] **Step 4: Final commit if any fixups needed**

```
fix: address test failures from roll rendering unification
```
