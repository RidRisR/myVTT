# Character Card Region — MVP Implementation Plan

> **状态**：📋 规划中 | 2026-04-10

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the character card as a Region component with dual-zone attributes (click label = roll, click number = edit), displayed only for Players.

**Architecture:** Create a new `CharacterCard` region component in `plugins/daggerheart/ui/`. It reads the active character via `useIdentityStore` (seat → `activeCharacterId`) and renders attribute cells with two interaction zones. Rolling reuses the existing `action-check` workflow. Editing defines a new `charcard:update-attr` workflow with a `CharCardManager` class. GM sees nothing (`display: none`).

**Tech Stack:** React 19, Tailwind CSS v4 tokens, `IRegionSDK`, vitest

**Design spec:** `docs/design/24-Daggerheart插件UI布局设计.md` §2
**Mockup:** `nimbalyst-local/mockups/daggerheart-charcard-interactions.mockup.html`

---

## File Structure

### Modified files

| File                                | Change                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `plugins/daggerheart-core/index.ts` | Define `charcard:update-attr` workflow, register character card region |
| `plugins/daggerheart/i18n.ts`       | Add character card i18n keys (section labels, roll tooltip)            |

### New files

| File                                                           | Responsibility                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `plugins/daggerheart-core/CharCardManager.ts`                  | Manager class: `updateAttribute(ctx, entityId, attr, value)` — validates and writes attribute component |
| `plugins/daggerheart/ui/CharacterCard.tsx`                     | Region component: reads active entity, renders dual-zone attribute grid, hidden for GM                  |
| `plugins/daggerheart/ui/AttributeCell.tsx`                     | Sub-component: label zone (roll) + number zone (inline edit)                                            |
| `plugins/daggerheart-core/__tests__/charCardWorkflows.test.ts` | Workflow unit tests for `charcard:update-attr`                                                          |
| `plugins/daggerheart/__tests__/ui/CharacterCard.test.tsx`      | Component tests: renders attributes, roll clicks, edit clicks, GM hidden                                |

---

## Tasks

### Task 1: CharCardManager + update-attr workflow

**Files:**

- Create: `plugins/daggerheart-core/CharCardManager.ts`
- Modify: `plugins/daggerheart-core/index.ts`
- Create: `plugins/daggerheart-core/__tests__/charCardWorkflows.test.ts`

- [ ] **Step 1: Write CharCardManager**

```typescript
// plugins/daggerheart-core/CharCardManager.ts
import type { WorkflowContext } from '@myvtt/sdk'
import { DH_KEYS } from '../../plugins/daggerheart/types'
import type { DHAttributes } from '../../plugins/daggerheart/types'

const VALID_ATTRS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const

export class CharCardManager {
  updateAttribute(ctx: WorkflowContext, entityId: string, attribute: string, value: number): void {
    if (!VALID_ATTRS.includes(attribute as (typeof VALID_ATTRS)[number])) return
    ctx.updateComponent(entityId, DH_KEYS.attributes, (prev: unknown) => {
      const p = (prev ?? {
        agility: 0,
        strength: 0,
        finesse: 0,
        instinct: 0,
        presence: 0,
        knowledge: 0,
      }) as DHAttributes
      return { ...p, [attribute]: value }
    })
  }
}
```

- [ ] **Step 2: Write failing tests for update-attr workflow**

```typescript
// plugins/daggerheart-core/__tests__/charCardWorkflows.test.ts
import { describe, it, expect } from 'vitest'
import { WorkflowEngine } from '../../../src/workflow/engine'
import { PluginSDK } from '../../../src/workflow/pluginSDK'
import { DaggerHeartCorePlugin } from '../index'
import { getUIRegistry, _resetRegistriesForTesting } from '../../../src/ui-system/uiSystemInit'
import { TriggerRegistry } from '../../../src/workflow/triggerRegistry'
import { createTestContext } from '../../../src/workflow/__tests__/helpers'

describe('charcard:update-attr workflow', () => {
  function setup() {
    _resetRegistriesForTesting()
    const engine = new WorkflowEngine()
    const plugin = new DaggerHeartCorePlugin()
    const registry = getUIRegistry()
    const sdk = new PluginSDK(engine, plugin.id, registry, new TriggerRegistry())
    plugin.onActivate(sdk)
    return { engine }
  }

  it('is registered on the engine', () => {
    const { engine } = setup()
    expect(engine.getWorkflow('charcard:update-attr')).toBeDefined()
  })

  it('updates a single attribute on the entity', async () => {
    const { engine } = setup()
    const { ctx, getComponent } = createTestContext(engine, {
      entityId: 'char1',
      initialComponents: {
        'daggerheart:attributes': {
          agility: 0,
          strength: 0,
          finesse: 0,
          instinct: 0,
          presence: 0,
          knowledge: 0,
        },
      },
    })
    await engine.runWorkflow('charcard:update-attr', ctx, ctx.internal)
    // vars set by caller: entityId, attribute, value
    // We need to test by calling with vars set
  })
})
```

Note: The exact test helper usage depends on the existing `createTestContext` pattern. Look at `plugins/daggerheart-core/__tests__/fearWorkflows.test.ts` for the exact pattern and adapt.

- [ ] **Step 3: Register workflow in daggerheart-core plugin**

In `plugins/daggerheart-core/index.ts`, add:

```typescript
import { CharCardManager } from './CharCardManager'

// In the class:
private charCard = new CharCardManager()

// In onActivate(), after fear workflows:
interface CharCardUpdateAttrData { [key: string]: unknown; entityId: string; attribute: string; value: number }

sdk.defineWorkflow<CharCardUpdateAttrData>('charcard:update-attr', [
  {
    id: 'update',
    run: (ctx) => {
      this.charCard.updateAttribute(ctx, ctx.vars.entityId, ctx.vars.attribute, ctx.vars.value)
    },
  },
])
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run plugins/daggerheart-core/__tests__/charCardWorkflows.test.ts`

- [ ] **Step 5: Run tsc -b, verify clean**

Run: `npx tsc -b`

- [ ] **Step 6: Commit**

```bash
git add plugins/daggerheart-core/CharCardManager.ts plugins/daggerheart-core/index.ts plugins/daggerheart-core/__tests__/charCardWorkflows.test.ts
git commit -m "feat(daggerheart): add CharCardManager and charcard:update-attr workflow"
```

---

### Task 2: i18n keys for character card

**Files:**

- Modify: `plugins/daggerheart/i18n.ts`

- [ ] **Step 1: Add character card i18n keys**

In both `zh-CN` and `en` sections of `plugins/daggerheart/i18n.ts`, add after the Fear Panel entries:

```typescript
// Character Card (region)
'charcard.title': '角色卡',        // en: 'Character Card'
'charcard.collapse': '收回',       // en: 'Collapse'
'charcard.noCharacter': '未选择角色', // en: 'No character selected'
'charcard.rollTooltip': '点击掷骰 2d12{{mod}}', // en: 'Click to roll 2d12{{mod}}'
'charcard.section.attributes': '属性', // en: 'Attributes'
```

- [ ] **Step 2: Run tsc -b, verify clean**

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart/i18n.ts
git commit -m "feat(daggerheart): add character card region i18n keys"
```

---

### Task 3: AttributeCell sub-component

**Files:**

- Create: `plugins/daggerheart/ui/AttributeCell.tsx`

- [ ] **Step 1: Implement AttributeCell with dual zones**

```typescript
// plugins/daggerheart/ui/AttributeCell.tsx
import { useState, useCallback, useRef } from 'react'

interface AttributeCellProps {
  labelCn: string
  labelEn: string
  value: number
  onRoll: () => void
  onEdit: (value: number) => void
}

export function AttributeCell({ labelCn, labelEn, value, onRoll, onEdit }: AttributeCellProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayValue = `${value >= 0 ? '+' : ''}${value}`
  const valueColor = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text-muted/30'

  const handleEditStart = useCallback(() => {
    setEditing(true)
    // Focus input on next tick after render
    requestAnimationFrame(() => inputRef.current?.select())
  }, [])

  const handleEditCommit = useCallback(
    (raw: string) => {
      setEditing(false)
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed) && parsed !== value) {
        onEdit(parsed)
      }
    },
    [value, onEdit],
  )

  return (
    <div className="text-center bg-white/[0.05] border border-white/[0.04] rounded-lg overflow-hidden">
      {/* Roll zone: click label area triggers dice roll */}
      <div
        className="px-1 pt-1.5 pb-0.5 cursor-pointer transition-colors hover:bg-accent/10"
        onClick={onRoll}
        data-testid="attr-roll-zone"
      >
        <div className="text-[8px] text-white/45 tracking-wide">{labelCn}</div>
        <div className="text-[6px] text-white/20 uppercase tracking-widest">{labelEn}</div>
      </div>
      {/* Edit zone: click number area triggers inline edit */}
      <div
        className="px-1 pt-0.5 pb-1.5 cursor-text transition-colors border-t border-transparent hover:bg-white/[0.06] hover:border-white/[0.06]"
        onClick={editing ? undefined : handleEditStart}
        data-testid="attr-edit-zone"
      >
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={value}
            onBlur={(e) => handleEditCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="w-9 bg-black/30 border border-accent/30 rounded text-center text-base font-bold text-white outline-none"
            data-testid="attr-input"
          />
        ) : (
          <div className={`text-lg font-bold tabular-nums leading-tight ${valueColor}`} data-testid="attr-value">
            {displayValue}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tsc -b, verify clean**

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart/ui/AttributeCell.tsx
git commit -m "feat(daggerheart): add AttributeCell with dual-zone interaction"
```

---

### Task 4: CharacterCard region component

**Files:**

- Create: `plugins/daggerheart/ui/CharacterCard.tsx`

This is the main region component. It:

- Reads the active character from `useIdentityStore` (seat → `activeCharacterId`)
- Uses `sdk.data.useEntity()` and `sdk.data.useComponent()` for reactive data
- Renders 6 AttributeCells in a 3×2 grid
- Calls `sdk.workflow.runWorkflow()` for both rolling and editing
- Returns `display: none` wrapper for GM

- [ ] **Step 1: Implement CharacterCard region**

```typescript
// plugins/daggerheart/ui/CharacterCard.tsx
import { useCallback, useMemo } from 'react'
import type { IRegionSDK } from '../../../src/ui-system/types'
import type { WorkflowHandle } from '@myvtt/sdk'
import { usePluginTranslation } from '@myvtt/sdk'
import { useIdentityStore } from '../../../src/stores/identityStore'
import { getName } from '../../../src/shared/coreComponents'
import type { DHAttributes, DHMeta } from '../types'
import { DH_KEYS } from '../types'
import { AttributeCell } from './AttributeCell'

const ATTRS = [
  { key: 'agility', en: 'Agility' },
  { key: 'strength', en: 'Strength' },
  { key: 'instinct', en: 'Instinct' },
  { key: 'knowledge', en: 'Knowledge' },
  { key: 'presence', en: 'Presence' },
  { key: 'finesse', en: 'Finesse' },
] as const

const ACTION_CHECK_WORKFLOW = 'daggerheart-core:action-check'
const UPDATE_ATTR_WORKFLOW = 'charcard:update-attr'

export function CharacterCard({ sdk }: { sdk: IRegionSDK }) {
  const { t } = usePluginTranslation()
  const isGM = sdk.context.role === 'GM'

  // Get active character ID from identity store
  const activeCharacterId = useIdentityStore((s) => {
    const seat = s.seats[s.mySeatId ?? '']
    return seat?.activeCharacterId ?? null
  })

  const entity = sdk.data.useEntity(activeCharacterId ?? '')
  const attrs = sdk.data.useComponent<DHAttributes>(activeCharacterId ?? '', DH_KEYS.attributes)
  const meta = sdk.data.useComponent<DHMeta>(activeCharacterId ?? '', DH_KEYS.meta)

  const actionCheckHandle = useMemo(
    () => ({ name: ACTION_CHECK_WORKFLOW }) as WorkflowHandle,
    [],
  )
  const updateAttrHandle = useMemo(
    () => ({ name: UPDATE_ATTR_WORKFLOW }) as WorkflowHandle,
    [],
  )

  const handleRoll = useCallback(
    (attrKey: string) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(actionCheckHandle, {
        formula: `2d12+@${attrKey}`,
        actorId: activeCharacterId,
        rollType: 'daggerheart:dd',
      })
    },
    [activeCharacterId, sdk.workflow, actionCheckHandle],
  )

  const handleEdit = useCallback(
    (attrKey: string, value: number) => {
      if (!activeCharacterId) return
      void sdk.workflow.runWorkflow(updateAttrHandle, {
        entityId: activeCharacterId,
        attribute: attrKey,
        value,
      })
    },
    [activeCharacterId, sdk.workflow, updateAttrHandle],
  )

  // GM: hidden but mounted (future: preview player view toggle)
  if (isGM) {
    return <div style={{ display: 'none' }} />
  }

  if (!entity || !activeCharacterId) {
    return (
      <div className="h-full flex items-center justify-center text-white/30 text-xs">
        {t('charcard.noCharacter')}
      </div>
    )
  }

  const charName = getName(entity)

  return (
    <div className="h-full flex flex-col gap-2 p-3 text-white">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-white/[0.06]">
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-700 to-blue-600 border-2 border-amber-400/25 flex items-center justify-center text-sm font-bold shrink-0"
        >
          {charName.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-semibold truncate">{charName}</div>
          {meta?.className && (
            <div className="text-[9px] text-white/38">
              {meta.className} · Tier {meta.tier ?? 1}
            </div>
          )}
        </div>
      </div>

      {/* Attributes 3×2 grid */}
      <div className="text-[7px] text-white/28 uppercase tracking-widest">
        {t('charcard.section.attributes')}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {ATTRS.map(({ key, en }) => (
          <AttributeCell
            key={key}
            labelCn={t(`attr.${key}`)}
            labelEn={en}
            value={attrs?.[key as keyof DHAttributes] ?? 0}
            onRoll={() => handleRoll(key)}
            onEdit={(v) => handleEdit(key, v)}
          />
        ))}
      </div>
    </div>
  )
}
```

**Important notes for implementer:**

- `useIdentityStore` is imported directly from `src/stores/identityStore` — this is acceptable for region components reading session state. The `@myvtt/sdk` doesn't export it.
- `sdk.data.useComponent()` uses the string overload (fallback for plugin-defined keys not in ComponentTypeMap).
- The `WorkflowHandle` is created as `{ name: '...' } as WorkflowHandle` — same pattern as FearPanel.

- [ ] **Step 2: Run tsc -b, verify clean**

- [ ] **Step 3: Commit**

```bash
git add plugins/daggerheart/ui/CharacterCard.tsx
git commit -m "feat(daggerheart): add CharacterCard region component with dual-zone attributes"
```

---

### Task 5: Register region + delete FullCharacterSheet

**Files:**

- Modify: `plugins/daggerheart-core/index.ts` — register region
- Delete: `plugins/daggerheart/ui/FullCharacterSheet.tsx`

- [ ] **Step 1: Register character card region in onActivate**

In `plugins/daggerheart-core/index.ts`, add after FearPanel registration:

```typescript
import { CharacterCard } from '../../plugins/daggerheart/ui/CharacterCard'

// In onActivate():
sdk.ui.registerRegion({
  id: 'daggerheart:character-card',
  component: CharacterCard as React.ComponentType<{ sdk: unknown }>,
  lifecycle: 'persistent',
  defaultSize: { width: 420, height: 500 },
  minSize: { width: 360, height: 300 },
  defaultPlacement: { anchor: 'center-left', offsetX: 0, offsetY: 0 },
  layer: 'standard',
})
```

Note: Check the available `AnchorPoint` values in `src/ui-system/regionTypes.ts`. If `'center-left'` is not available, use `'top-left'` with appropriate offsetY to approximate vertical center.

- [ ] **Step 2: Remove FullCharacterSheet references**

Delete `plugins/daggerheart/ui/FullCharacterSheet.tsx`. Then search for all references to `FullCharacterSheet` and `dh-full-sheet` and remove them (panel registration in plugin, panel def in types, etc.).

Also remove the "Full Sheet" button from `DaggerHeartCard.tsx` (lines 84-93) since the character card region replaces this functionality.

- [ ] **Step 3: Run tsc -b, verify clean**

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat(daggerheart): register CharacterCard region, remove FullCharacterSheet"
```

---

### Task 6: Component tests

**Files:**

- Create: `plugins/daggerheart/__tests__/ui/CharacterCard.test.tsx`

- [ ] **Step 1: Write CharacterCard component tests**

Follow the same mocking pattern as `plugins/daggerheart-core/__tests__/ui/FearPanel.test.tsx`:

- Mock `@myvtt/sdk` for `usePluginTranslation`
- Mock `useIdentityStore` to return a seat with `activeCharacterId`
- Create a mock SDK with `data.useEntity()`, `data.useComponent()`, `workflow.runWorkflow()`, `context.role`

Test cases:

1. **Renders 6 attribute cells with correct values** — given attrs `{ agility: 2, strength: 1, ... }`, verify 6 `[data-testid=attr-value]` elements
2. **Clicking roll zone triggers action-check** — click `[data-testid=attr-roll-zone]` on agility cell, verify `runWorkflow` called with action-check handle and `formula: '2d12+@agility'`
3. **Clicking edit zone opens input** — click `[data-testid=attr-edit-zone]`, verify `[data-testid=attr-input]` appears
4. **Submitting edit triggers update-attr** — fill input, blur, verify `runWorkflow` called with update-attr handle and `{ entityId, attribute, value }`
5. **GM role renders hidden div** — set `context.role = 'GM'`, verify no attribute cells rendered
6. **No active character shows empty state** — set `activeCharacterId = null`, verify "no character" text

- [ ] **Step 2: Run tests, verify pass**

Run: `npx vitest run plugins/daggerheart/__tests__/ui/CharacterCard.test.tsx`

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Run: `npx tsc -b`

- [ ] **Step 4: Commit**

```bash
git add plugins/daggerheart/__tests__/ui/CharacterCard.test.tsx
git commit -m "test(daggerheart): add CharacterCard region component tests"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (including new ones)

- [ ] **Step 2: Run type check**

Run: `npx tsc -b`
Expected: Clean (no errors)

- [ ] **Step 3: Verify in preview**

If preview is running (http://localhost:5151), refresh and verify:

- As Player: character card appears on the left with 6 attributes
- Clicking an attribute label triggers a roll (check chat for dice result)
- Clicking an attribute number opens inline edit
- As GM: character card is not visible

- [ ] **Step 4: Final commit if needed**

Any fixes from visual testing.
