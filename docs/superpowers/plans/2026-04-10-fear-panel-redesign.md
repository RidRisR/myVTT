# FearPanel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the FearPanel with combined interaction (click-to-set pips + ±buttons), transparent pill visual, glowing ember gemstone pips, and new fear-set/fear-clear workflows.

**Architecture:** Add `setFear(ctx, value)` method to FearManager. Define two single-step workflows (`fear-set`, `fear-clear`) that delegate to FearManager. Rewrite FearPanel as interactive region component using `sdk.workflow.runWorkflow()` to trigger fear mutations. The action-check resolve step continues to call `FearManager.addFear()` directly (no workflow indirection needed — it's already inside a workflow context). Max hardcoded to 12.

**Tech Stack:** React 19, Tailwind CSS v4 tokens, `IRegionSDK.workflow`, vitest

**Design spec:** `docs/design/24-Daggerheart插件UI布局设计.md` §1
**Mockup:** `nimbalyst-local/mockups/fear-panel-interactions.mockup.html` (Combined variant)

---

## File Structure

### Modified files

| File | Change |
| --- | --- |
| `plugins/daggerheart-core/FearManager.ts` | Add `setFear(ctx, value)` — single method replaces separate add/remove/clear |
| `plugins/daggerheart-core/index.ts` | Define `fear-set` and `fear-clear` workflows, register `.f+` / `.f-` commands |
| `plugins/daggerheart-core/ui/FearPanel.tsx` | Complete rewrite — interactive pill with gemstone pips, ±buttons, click-to-set |
| `plugins/daggerheart/i18n.ts` | Add fear panel i18n keys |
| `plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts` | Update fear default max from 10 → 12 in assertions |

### New files

| File | Responsibility |
| --- | --- |
| `plugins/daggerheart-core/__tests__/fearWorkflows.test.ts` | Tests for fear-set / fear-clear workflows |
| `plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx` | FearPanel component tests (rendering + click interactions) |

---

## Task 1: Extend FearManager with `setFear`

**Files:**
- Modify: `plugins/daggerheart-core/FearManager.ts`
- Modify: `plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`

- [ ] **Step 1: Update FearManager — add `setFear`, change max to 12**

```ts
// plugins/daggerheart-core/FearManager.ts
import type { WorkflowContext } from '@myvtt/sdk'

const FEAR_ENTITY_ID = 'daggerheart-core:fear'
const FEAR_COMPONENT_KEY = 'daggerheart-core:fear-tracker'
const FEAR_MAX = 12

export { FEAR_ENTITY_ID, FEAR_COMPONENT_KEY, FEAR_MAX }

export class FearManager {
  readonly entityId = FEAR_ENTITY_ID

  async ensureEntity(ctx: WorkflowContext): Promise<void> {
    const existing = ctx.read.entity(FEAR_ENTITY_ID)
    if (existing) return

    await ctx.createEntity({
      id: FEAR_ENTITY_ID,
      components: { [FEAR_COMPONENT_KEY]: { current: 0, max: FEAR_MAX } },
      lifecycle: 'persistent',
    })
  }

  /** Set fear to an absolute value, clamped to [0, max]. */
  setFear(ctx: WorkflowContext, value: number): void {
    ctx.updateComponent(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY, (prev: unknown) => {
      const p = (prev ?? { current: 0, max: FEAR_MAX }) as { current: number; max: number }
      const clamped = Math.max(0, Math.min(p.max, value))
      return { ...p, current: clamped }
    })
  }

  /** Increment fear by 1. Used by action-check resolve step. */
  addFear(ctx: WorkflowContext): void {
    ctx.updateComponent(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY, (prev: unknown) => {
      const p = (prev ?? { current: 0, max: FEAR_MAX }) as { current: number; max: number }
      return { ...p, current: Math.min(p.max, p.current + 1) }
    })
  }
}
```

- [ ] **Step 2: Update existing test assertion for max 12**

In `plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`, line 156:

Change:
```ts
    expect(update.payload.data).toEqual({ current: 1, max: 10 })
```
To:
```ts
    expect(update.payload.data).toEqual({ current: 1, max: 12 })
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `npx vitest run plugins/daggerheart-core/__tests__/actionCheckWorkflow.test.ts`
Expected: All 7 tests pass.

- [ ] **Step 4: Commit**

```
feat(daggerheart): add FearManager.setFear with clamped absolute value, change max to 12
```

---

## Task 2: Define fear-set and fear-clear workflows + commands

**Files:**
- Modify: `plugins/daggerheart-core/index.ts`
- Create: `plugins/daggerheart-core/__tests__/fearWorkflows.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// plugins/daggerheart-core/__tests__/fearWorkflows.test.ts
import { describe, it, expect, vi } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK, WorkflowRunner } from '../../../src/workflow/pluginSDK'
import { registerBaseWorkflows } from '../../../src/workflow/baseWorkflows'
import { DaggerHeartCorePlugin } from '../index'
import type { ContextDeps } from '../../../src/workflow/context'

function makeDeps(overrides: Partial<ContextDeps> = {}): Omit<ContextDeps, 'engine'> {
  return {
    emitEntry: vi.fn(),
    serverRoll: vi.fn().mockResolvedValue([[6, 6]]),
    createEntity: vi.fn().mockResolvedValue('test:entity-1'),
    deleteEntity: vi.fn().mockResolvedValue(undefined),
    getEntity: vi.fn(),
    getAllEntities: vi.fn().mockReturnValue({}),
    getActiveOrigin: vi.fn().mockReturnValue({ seat: { id: 's1', name: 'GM', color: '#fff' } }),
    getSeatId: vi.fn().mockReturnValue('s1'),
    getLogWatermark: vi.fn().mockReturnValue(0),
    getFormulaTokens: vi.fn().mockReturnValue({}),
    ...overrides,
  }
}

function makeSetup(depsOverrides: Partial<ContextDeps> = {}) {
  const engine = new WorkflowEngine()
  registerBaseWorkflows(engine)
  const sdk = new PluginSDK(engine, 'daggerheart-core')
  const deps = makeDeps(depsOverrides)
  const runner = new WorkflowRunner(engine, deps)

  const plugin = new DaggerHeartCorePlugin()
  plugin.onActivate(sdk)

  return { engine, deps, sdk, runner, plugin }
}

describe('fear-set workflow', () => {
  it('registers daggerheart-core:fear-set with a single step', () => {
    const { sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-set')
    const steps = sdk.inspectWorkflow(handle)
    expect(steps).toEqual(['set'])
  })

  it('sets fear to the specified value via updateComponent', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-set')

    await runner.runWorkflow(handle, { value: 7 })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.entityId).toBe('daggerheart-core:fear')
    expect(update.payload.key).toBe('daggerheart-core:fear-tracker')
    expect(update.payload.data).toEqual({ current: 7, max: 12 })
  })

  it('clamps value to max', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-set')

    await runner.runWorkflow(handle, { value: 99 })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.data).toEqual({ current: 12, max: 12 })
  })

  it('clamps value to 0', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-set')

    await runner.runWorkflow(handle, { value: -5 })

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.data).toEqual({ current: 0, max: 12 })
  })
})

describe('fear-clear workflow', () => {
  it('registers daggerheart-core:fear-clear with a single step', () => {
    const { sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-clear')
    const steps = sdk.inspectWorkflow(handle)
    expect(steps).toEqual(['clear'])
  })

  it('sets fear to 0', async () => {
    const { runner, deps, sdk } = makeSetup()
    const handle = sdk.getWorkflow('daggerheart-core:fear-clear')

    await runner.runWorkflow(handle, {})

    const emitCalls = (deps.emitEntry as ReturnType<typeof vi.fn>).mock.calls
    const componentUpdates = emitCalls.filter(
      (c) => (c[0] as { type: string }).type === 'core:component-update',
    )
    expect(componentUpdates).toHaveLength(1)
    const update = componentUpdates[0]![0] as {
      type: string
      payload: { entityId: string; key: string; data: unknown }
    }
    expect(update.payload.data).toEqual({ current: 0, max: 12 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run plugins/daggerheart-core/__tests__/fearWorkflows.test.ts`
Expected: FAIL — workflow `daggerheart-core:fear-set` not found.

- [ ] **Step 3: Implement fear workflows in plugin index**

Add to `plugins/daggerheart-core/index.ts`:

At top, add import and interface:
```ts
import type { WorkflowHandle } from '@myvtt/sdk'
```

Add interfaces (after `ActionCheckData`):
```ts
interface FearSetData {
  [key: string]: unknown
  value: number
}

interface FearClearData {
  [key: string]: unknown
}
```

Add private fields to `DaggerHeartCorePlugin`:
```ts
  private fearSetHandle!: WorkflowHandle<FearSetData>
  private fearClearHandle!: WorkflowHandle<FearClearData>
```

Add to `onActivate`, after the FearPanel region registration:
```ts
    // Define fear mutation workflows
    this.fearSetHandle = sdk.defineWorkflow<FearSetData>('daggerheart-core:fear-set', [
      {
        id: 'set',
        run: (ctx) => {
          this.fear.setFear(ctx, ctx.vars.value)
        },
      },
    ])

    this.fearClearHandle = sdk.defineWorkflow<FearClearData>('daggerheart-core:fear-clear', [
      {
        id: 'clear',
        run: (ctx) => {
          this.fear.setFear(ctx, 0)
        },
      },
    ])

    // Register chat commands for fear adjustment
    sdk.registerCommand('.f+', this.fearSetHandle)
    sdk.registerCommand('.f-', this.fearSetHandle)
```

Also export the workflow name constants for FearPanel to reference:
```ts
export const FEAR_SET_WORKFLOW = 'daggerheart-core:fear-set'
export const FEAR_CLEAR_WORKFLOW = 'daggerheart-core:fear-clear'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run plugins/daggerheart-core/__tests__/fearWorkflows.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 5: Run all daggerheart-core tests to verify no regressions**

Run: `npx vitest run plugins/daggerheart-core/__tests__/`
Expected: All tests pass (actionCheckWorkflow + fearWorkflows).

- [ ] **Step 6: Commit**

```
feat(daggerheart): add fear-set and fear-clear workflows with .f+/.f- commands
```

---

## Task 3: Add fear panel i18n keys

**Files:**
- Modify: `plugins/daggerheart/i18n.ts`

- [ ] **Step 1: Add i18n keys for FearPanel**

Add to the `'zh-CN'` section of `daggerheartI18n.resources`:
```ts
      // Fear Panel
      'fear.label': '恐惧',
      'fear.count': '{{current}} / {{max}}',
```

Add to the `en` section:
```ts
      // Fear Panel
      'fear.label': 'Fear',
      'fear.count': '{{current}} / {{max}}',
```

- [ ] **Step 2: Commit**

```
feat(daggerheart): add fear panel i18n keys
```

---

## Task 4: Rewrite FearPanel component

**Files:**
- Rewrite: `plugins/daggerheart-core/ui/FearPanel.tsx`
- Create: `plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FearPanel } from '../../ui/FearPanel'

// Mock @myvtt/sdk
const mockRunWorkflow = vi.fn().mockResolvedValue({ status: 'completed' })

vi.mock('@myvtt/sdk', () => ({
  useComponent: vi.fn().mockReturnValue({ current: 4, max: 12 }),
  usePluginTranslation: vi.fn().mockReturnValue({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'fear.label') return 'FEAR'
      if (key === 'fear.count') return `${opts?.current} / ${opts?.max}`
      return key
    },
  }),
}))

// Import after mock so we can control return value
const sdkModule = await import('@myvtt/sdk')

function makeMockSdk() {
  return {
    data: { useComponent: sdkModule.useComponent },
    workflow: { runWorkflow: mockRunWorkflow },
  } as unknown
}

describe('FearPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders 12 pips with 4 filled', () => {
    render(<FearPanel sdk={makeMockSdk()} />)
    const pips = screen.getAllByTestId('fear-pip')
    expect(pips).toHaveLength(12)
    const filled = pips.filter((p) => p.dataset.filled === 'true')
    expect(filled).toHaveLength(4)
  })

  it('shows count text', () => {
    render(<FearPanel sdk={makeMockSdk()} />)
    expect(screen.getByText('4 / 12')).toBeInTheDocument()
  })

  it('clicking empty pip 7 calls fear-set with value 8', async () => {
    const user = userEvent.setup()
    render(<FearPanel sdk={makeMockSdk()} />)
    const pips = screen.getAllByTestId('fear-pip')
    // pip index 7 is the 8th pip (0-based), currently empty (current=4)
    await user.click(pips[7]!)
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:fear-set' }),
      { value: 8 },
    )
  })

  it('clicking last filled pip (index 3) calls fear-clear', async () => {
    const user = userEvent.setup()
    render(<FearPanel sdk={makeMockSdk()} />)
    const pips = screen.getAllByTestId('fear-pip')
    // pip index 3 is the last filled pip (current=4, 0-based index 3)
    await user.click(pips[3]!)
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:fear-clear' }),
      {},
    )
  })

  it('clicking a non-last filled pip calls fear-set to truncate', async () => {
    const user = userEvent.setup()
    render(<FearPanel sdk={makeMockSdk()} />)
    const pips = screen.getAllByTestId('fear-pip')
    // pip index 1 → set fear to 2
    await user.click(pips[1]!)
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:fear-set' }),
      { value: 2 },
    )
  })

  it('clicking + button calls fear-set with current+1', async () => {
    const user = userEvent.setup()
    render(<FearPanel sdk={makeMockSdk()} />)
    await user.click(screen.getByTestId('fear-inc'))
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:fear-set' }),
      { value: 5 },
    )
  })

  it('clicking - button calls fear-set with current-1', async () => {
    const user = userEvent.setup()
    render(<FearPanel sdk={makeMockSdk()} />)
    await user.click(screen.getByTestId('fear-dec'))
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:fear-set' }),
      { value: 3 },
    )
  })

  it('renders 0 filled pips when current is 0', () => {
    vi.mocked(sdkModule.useComponent).mockReturnValue({ current: 0, max: 12 })
    render(<FearPanel sdk={makeMockSdk()} />)
    const pips = screen.getAllByTestId('fear-pip')
    const filled = pips.filter((p) => p.dataset.filled === 'true')
    expect(filled).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx`
Expected: FAIL — FearPanel doesn't accept sdk prop yet.

- [ ] **Step 3: Implement the FearPanel component**

```tsx
// plugins/daggerheart-core/ui/FearPanel.tsx
import { useState, useCallback } from 'react'
import { usePluginTranslation } from '@myvtt/sdk'
import type { IRegionSDK } from '../../../src/ui-system/types'
import { FEAR_ENTITY_ID, FEAR_COMPONENT_KEY, FEAR_MAX } from '../FearManager'
import { FEAR_SET_WORKFLOW, FEAR_CLEAR_WORKFLOW } from '../index'

interface FearTracker {
  current: number
  max: number
}

export function FearPanel({ sdk }: { sdk: IRegionSDK }) {
  const tracker = sdk.data.useComponent<FearTracker>(FEAR_ENTITY_ID, FEAR_COMPONENT_KEY)
  const { t } = usePluginTranslation('daggerheart')
  const current = tracker?.current ?? 0
  const max = tracker?.max ?? FEAR_MAX

  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const fearSetHandle = { name: FEAR_SET_WORKFLOW } as import('@myvtt/sdk').WorkflowHandle
  const fearClearHandle = { name: FEAR_CLEAR_WORKFLOW } as import('@myvtt/sdk').WorkflowHandle

  const handlePipClick = useCallback(
    (index: number) => {
      if (index >= current) {
        // Click empty pip → fill up to here
        void sdk.workflow.runWorkflow(fearSetHandle, { value: index + 1 })
      } else if (index === current - 1) {
        // Click last filled pip → clear all
        void sdk.workflow.runWorkflow(fearClearHandle, {})
      } else {
        // Click non-last filled pip → truncate to this position
        void sdk.workflow.runWorkflow(fearSetHandle, { value: index + 1 })
      }
    },
    [current, sdk.workflow, fearSetHandle, fearClearHandle],
  )

  const handleInc = useCallback(() => {
    if (current < max) {
      void sdk.workflow.runWorkflow(fearSetHandle, { value: current + 1 })
    }
  }, [current, max, sdk.workflow, fearSetHandle])

  const handleDec = useCallback(() => {
    if (current > 0) {
      void sdk.workflow.runWorkflow(fearSetHandle, { value: current - 1 })
    }
  }, [current, sdk.workflow, fearSetHandle])

  return (
    <div className="flex items-center gap-2.5 rounded-3xl bg-white/[0.04] px-5 py-2.5 select-none backdrop-blur-md border border-white/[0.06]">
      {/* - button */}
      <button
        data-testid="fear-dec"
        onClick={handleDec}
        className="flex size-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-white/50 transition-fast hover:bg-white/[0.12] hover:text-white/80 hover:border-white/20 active:scale-90"
      >
        -
      </button>

      {/* Label */}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-accent/60 mr-1">
        {t('fear.label')}
      </span>

      {/* Pips */}
      <div className="flex items-center gap-2">
        {Array.from({ length: max }, (_, i) => {
          const filled = i < current
          const isLastFilled = filled && i === current - 1

          // Hover preview state
          let previewFill = false
          let previewClear = false
          if (hoverIndex !== null) {
            if (hoverIndex >= current && i >= current && i <= hoverIndex) {
              previewFill = true
            }
            if (hoverIndex < current) {
              if (hoverIndex === current - 1) {
                // Last filled → clear all preview
                if (filled) previewClear = true
              } else if (i > hoverIndex && filled) {
                // Non-last filled → truncate preview
                previewClear = true
              }
            }
          }

          return (
            <div
              key={i}
              data-testid="fear-pip"
              data-filled={filled}
              onClick={() => handlePipClick(i)}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              className="relative size-[22px] shrink-0 cursor-pointer rounded-full transition-all duration-normal"
              style={
                filled && !previewClear
                  ? {
                      background:
                        'radial-gradient(circle at 38% 32%, #ffad7a 0%, #ff6b4a 15%, #dc2626 40%, #991b1b 70%, #6b1010 100%)',
                      border: '1.5px solid rgba(255, 120, 70, 0.5)',
                      boxShadow:
                        '0 0 10px rgba(220,38,38,0.6), 0 0 24px rgba(220,38,38,0.25), 0 0 40px rgba(180,30,30,0.1), inset 0 -3px 5px rgba(0,0,0,0.35), inset 0 1px 3px rgba(255,220,180,0.35)',
                      animation: `ember-pulse 3s ease-in-out infinite ${i * 0.2}s`,
                      opacity: 1,
                    }
                  : previewFill
                    ? {
                        background:
                          'radial-gradient(circle at 50% 50%, rgba(220,38,38,0.15) 0%, rgba(220,38,38,0.05) 70%, transparent 100%)',
                        border: '1.5px solid rgba(220, 38, 38, 0.25)',
                      }
                    : previewClear && filled
                      ? {
                          background:
                            'radial-gradient(circle at 38% 32%, #ffad7a 0%, #ff6b4a 15%, #dc2626 40%, #991b1b 70%, #6b1010 100%)',
                          border: '1.5px solid rgba(255, 120, 70, 0.5)',
                          boxShadow:
                            '0 0 10px rgba(220,38,38,0.6), 0 0 24px rgba(220,38,38,0.25)',
                          opacity: 0.35,
                        }
                      : {
                          background:
                            'radial-gradient(circle at 50% 55%, rgba(20,15,25,0.4) 0%, rgba(10,8,16,0.3) 70%, transparent 100%)',
                          border: '1.5px solid rgba(255,255,255,0.07)',
                          boxShadow:
                            'inset 0 2px 4px rgba(0,0,0,0.35), inset 0 -1px 2px rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.2)',
                        }
              }
            >
              {/* Specular highlight for filled pips */}
              {filled && !previewClear && (
                <div
                  className="absolute left-1 top-[3px] size-2 rounded-full"
                  style={{
                    background:
                      'radial-gradient(ellipse at center, rgba(255,230,200,0.5) 0%, rgba(255,200,150,0.2) 50%, transparent 100%)',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Count */}
      <span className="min-w-8 text-center text-[13px] font-semibold tabular-nums text-white/50">
        {t('fear.count', { current, max })}
      </span>

      {/* + button */}
      <button
        data-testid="fear-inc"
        onClick={handleInc}
        className="flex size-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-white/50 transition-fast hover:bg-white/[0.12] hover:text-white/80 hover:border-white/20 active:scale-90"
      >
        +
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Add ember-pulse keyframe to global CSS**

Add to `src/styles/global.css` (inside `@layer base` or at top level):

```css
@keyframes ember-pulse {
  0%, 100% {
    box-shadow:
      0 0 10px rgba(220, 38, 38, 0.6),
      0 0 24px rgba(220, 38, 38, 0.25),
      0 0 40px rgba(180, 30, 30, 0.1),
      inset 0 -3px 5px rgba(0,0,0,0.35),
      inset 0 1px 3px rgba(255, 220, 180, 0.35);
  }
  50% {
    box-shadow:
      0 0 14px rgba(220, 38, 38, 0.75),
      0 0 32px rgba(220, 38, 38, 0.35),
      0 0 50px rgba(180, 30, 30, 0.15),
      inset 0 -3px 5px rgba(0,0,0,0.35),
      inset 0 1px 3px rgba(255, 220, 180, 0.4);
  }
}
```

- [ ] **Step 5: Run FearPanel tests**

Run: `npx vitest run plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx`
Expected: All 8 tests pass.

- [ ] **Step 6: Commit**

```
feat(daggerheart): rewrite FearPanel with interactive gemstone pips and combined interactions
```

---

## Task 5: Update region registration

**Files:**
- Modify: `plugins/daggerheart-core/index.ts`

- [ ] **Step 1: Update FearPanel region registration size and placement**

The panel is now a horizontal pill. Change the registration from:
```ts
    sdk.ui.registerRegion({
      id: 'daggerheart-core:fear-panel',
      component: FearPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 160, height: 120 },
      minSize: { width: 120, height: 80 },
      defaultPlacement: { anchor: 'top-right', offsetX: -16, offsetY: 60 },
      layer: 'standard',
    })
```

To:
```ts
    sdk.ui.registerRegion({
      id: 'daggerheart-core:fear-panel',
      component: FearPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 520, height: 50 },
      minSize: { width: 400, height: 42 },
      defaultPlacement: { anchor: 'top-left', offsetX: 200, offsetY: 12 },
      layer: 'standard',
    })
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run plugins/daggerheart-core/__tests__/`
Expected: All tests pass.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 4: Commit**

```
feat(daggerheart): update FearPanel region size to horizontal pill layout
```

---

## Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass across the entire project.

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 3: Visual verification in preview**

Start preview and verify:
1. FearPanel appears as horizontal pill at top of screen
2. 12 gemstone pips render (4 filled red, 8 empty sockets)
3. Clicking empty pips fills to that position
4. Clicking last filled pip clears all
5. +/- buttons increment/decrement by 1
6. Hover preview shows which pips will change

- [ ] **Step 4: Final commit if any adjustments needed**
