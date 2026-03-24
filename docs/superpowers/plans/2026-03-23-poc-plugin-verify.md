# POC Plugin Full-Chain Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the full plugin system data flow (data → workflow → DnD → EventBus → session) in an isolated `poc/` sandbox, ensuring cross-plugin collaboration works end-to-end.

**Architecture:** Independent `poc/` directory at project root with its own zustand store, hooks, EventBus, and mock data. Reuses existing WorkflowEngine, PluginSDK, DnD primitives, UIRegistry, and PanelErrorBoundary from `src/`. Accessible via `/#poc` dev-only route.

**Tech Stack:** React, zustand, vitest, WorkflowEngine (existing), makeDnDSDK (existing), UIRegistry (existing)

**Spec document:** `docs/exploration/plugin-system/全链路验证/07-POC执行方案.md`

---

## File Structure

```
poc/
  types.ts                    -- PocEntity, IDataReader, PocWorkflowContext types
  store.ts                    -- usePocStore (zustand): entities + globals + actions
  hooks.ts                    -- useEntity, useComponent, useGlobal independent hooks
  dataReader.ts               -- createDataReader(): IDataReader (imperative read)
  eventBus.ts                 -- EventBus class + EventHandle + createEventBus + useEvent
  sessionStore.ts             -- usePocSessionStore (selection + write isolation)
  pocWorkflowContext.ts       -- POC WorkflowContext factory (superset of existing)
  PocApp.tsx                  -- /#poc route entry, layout + panel rendering
  PocPanelRenderer.tsx        -- Enhanced PanelRenderer (instanceProps factory)
  mockData.ts                 -- 20+ entity initial data
  plugins/
    core/
      index.ts                -- core plugin: onActivate (register workflow + steps)
      workflows.ts            -- dealDamage + setSelection workflow handles
      events.ts               -- EventHandle definitions (damageDealtEvent etc.)
      components.ts           -- Health, StatusTags type definitions
    status-fx/
      index.ts                -- status-fx plugin: onActivate (intercept step + event subscription)
      components.ts           -- Resistances type definition
  panels/
    EntityCard.tsx             -- Entity card (health, resistances, status tags, drop zone, hit flash)
    StatusTagPalette.tsx       -- Spell/tag drag source panel
    DamageLog.tsx              -- Damage log panel (subscribes damageDealtEvent)
    SelectionDetail.tsx        -- Selection detail panel (dynamic bind session.selection)
  __tests__/
    store.test.ts              -- Phase 1: reactive data layer
    workflow-write.test.ts     -- Phase 2: workflow write
    dnd-dual-panel.test.ts     -- Phase 3: DnD dual panel link
    eventBus.test.ts           -- Phase 4: EventBus
    session.test.ts            -- Phase 5a: session state
    requestInput.test.ts       -- Phase 5b: requestInput (unit test only)
    cross-plugin.test.ts       -- Cross-plugin degradation verification

Modified files:
  src/App.tsx                  -- Add DEV-only #poc route (1 line lazy import + routing block)
  vite.config.ts               -- Add poc/ to test include pattern
  tsconfig.app.json            -- Add poc to include
  tsconfig.test.json           -- Add poc/__tests__ to include
```

---

### Task 1: Phase 0 — Scaffolding

**Files:**

- Modify: `src/App.tsx:47,606-618` — add PocApp lazy import and #poc route
- Modify: `vite.config.ts:34-37` — add `poc/**/*.test.{ts,tsx}` to test include
- Modify: `tsconfig.app.json:32` — add `poc` to include array
- Modify: `tsconfig.test.json:8` — add `poc/**/__tests__` to include array
- Create: `poc/types.ts` — core type definitions
- Create: `poc/PocApp.tsx` — empty shell page

- [ ] **Step 1: Modify build configs to include poc/**

Add `poc` to tsconfig.app.json include, `poc/**/__tests__` to tsconfig.test.json include, and `poc/**/*.test.{ts,tsx}` to vitest test include in vite.config.ts.

- [ ] **Step 2: Create poc/types.ts**

```ts
// poc/types.ts — Core types for the POC plugin verification sandbox

export interface PocEntity {
  id: string
  name: string
  imageUrl: string
  color: string
  components: Record<string, unknown>
}

export interface PocGlobal {
  key: string
  [k: string]: unknown
}

/** Imperative one-shot reader (non-hook, usable anywhere) */
export interface IDataReader {
  entity(id: string): PocEntity | undefined
  component<T>(entityId: string, key: string): T | undefined
  global(key: string): PocGlobal | undefined
  query(spec: { has?: string[] }): PocEntity[]
}
```

- [ ] **Step 3: Create poc/PocApp.tsx empty shell**

```tsx
export default function PocApp() {
  return (
    <div className="flex h-screen items-center justify-center bg-deep text-muted">
      POC Plugin Verification Sandbox
    </div>
  )
}
```

- [ ] **Step 4: Add #poc route to App.tsx**

Add lazy import after the SandboxRoot line (line 47):

```ts
const PocApp = import.meta.env.DEV ? lazy(() => import('../poc/PocApp')) : () => null
```

Add route block after the sandbox block (after line 618):

```tsx
if (import.meta.env.DEV && hash === '#poc') {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-deep text-muted">
          Loading POC...
        </div>
      }
    >
      <PocApp />
    </Suspense>
  )
}
```

- [ ] **Step 5: Verify — run TypeScript check and tests**

Run: `pnpm exec tsc --noEmit && pnpm test --run`
Expected: No type errors, all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add poc/types.ts poc/PocApp.tsx src/App.tsx vite.config.ts tsconfig.app.json tsconfig.test.json
git commit -m "feat(poc): phase 0 — scaffolding with #poc route and core types"
```

---

### Task 2: Phase 1 — Reactive Data Layer (Store + Hooks + DataReader)

**Files:**

- Create: `poc/store.ts` — zustand store with entities, globals, and actions
- Create: `poc/hooks.ts` — useEntity, useComponent, useGlobal hooks
- Create: `poc/dataReader.ts` — createDataReader() imperative reader
- Create: `poc/mockData.ts` — 20+ entity initial data
- Create: `poc/plugins/core/components.ts` — Health, StatusTags types
- Create: `poc/plugins/status-fx/components.ts` — Resistances type
- Create: `poc/__tests__/store.test.ts` — store and hooks tests

- [ ] **Step 1: Write store.test.ts**

Tests:

- `updateEntityComponent` atomic update preserves other components
- `patchGlobal` shallow merge
- `useComponent` hook re-render precision: changing entity A does NOT trigger entity B hook
- `query({ has: ['core:health'] })` returns correct subset
- `createDataReader().component()` reads current store snapshot

Run: `pnpm test poc/__tests__/store.test.ts`
Expected: FAIL (modules don't exist yet)

- [ ] **Step 2: Implement poc/plugins/core/components.ts and poc/plugins/status-fx/components.ts**

```ts
// poc/plugins/core/components.ts
export interface Health {
  hp: number
  maxHp: number
}
export interface StatusTags {
  tags: string[]
}
```

```ts
// poc/plugins/status-fx/components.ts
export interface Resistances {
  [damageType: string]: number
}
```

- [ ] **Step 3: Implement poc/store.ts**

Zustand store with:

- State: `entities: Record<string, PocEntity>`, `globals: Record<string, PocGlobal>`
- Actions: `updateEntityComponent(entityId, key, updater)`, `patchGlobal(key, patch)`
- `initMockData()` to populate from mockData.ts

Key: `updateEntityComponent` must use functional `set()` for atomic read+write.

- [ ] **Step 4: Implement poc/hooks.ts**

Independent hooks with precise zustand selectors:

- `useEntity(id)` — returns full PocEntity
- `useComponent<T>(entityId, key)` — returns single component
- `useGlobal(key)` — returns single global

- [ ] **Step 5: Implement poc/dataReader.ts**

```ts
import { usePocStore } from './store'
export function createDataReader(): IDataReader {
  return {
    entity: (id) => usePocStore.getState().entities[id],
    component: <T>(eid: string, key: string) =>
      usePocStore.getState().entities[eid]?.components[key] as T | undefined,
    global: (key) => usePocStore.getState().globals[key],
    query: ({ has }) => {
      const all = Object.values(usePocStore.getState().entities)
      if (!has || has.length === 0) return all
      return all.filter((e) => has.every((k) => k in e.components))
    },
  }
}
```

- [ ] **Step 6: Implement poc/mockData.ts**

- `goblin-01`: `core:health { hp:20, maxHp:30 }` + `status-fx:resistances { fire:5, ice:0 }`
- `hero-01`: `core:health { hp:45, maxHp:50 }` + `status-fx:resistances { fire:0, ice:10 }`
- 18 additional entities (loop-generated, satisfying §3.2 performance representativeness)
- Globals: `Fear { current:0 }`, `Hope { current:3 }`

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test poc/__tests__/store.test.ts`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add poc/store.ts poc/hooks.ts poc/dataReader.ts poc/mockData.ts poc/plugins/ poc/__tests__/store.test.ts
git commit -m "feat(poc): phase 1 — reactive data layer with store, hooks, and dataReader"
```

---

### Task 3: Phase 2 — Workflow Writes Data

**Files:**

- Create: `poc/pocWorkflowContext.ts` — POC WorkflowContext factory
- Create: `poc/plugins/core/workflows.ts` — dealDamage workflow
- Create: `poc/plugins/core/events.ts` — EventHandle definitions (placeholder, used in phase 4)
- Create: `poc/plugins/core/index.ts` — core plugin onActivate
- Create: `poc/plugins/status-fx/index.ts` — status-fx plugin onActivate
- Create: `poc/eventBus.ts` — minimal EventBus (emit is needed by context, full tests in phase 4)
- Create: `poc/__tests__/workflow-write.test.ts`

- [ ] **Step 1: Write workflow-write.test.ts**

Tests:

- Workflow execution updates store data (dealDamage reduces HP)
- `ctx.read.component()` reads data within workflow
- status-fx intercept correctly reduces damage (fire arrow vs goblin with fire resistance 5)
- Dual panel sync: two components observing same entity both update

Run: `pnpm test poc/__tests__/workflow-write.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement poc/eventBus.ts (minimal)**

```ts
export interface EventHandle<T = unknown> {
  key: string
  __type?: T // phantom
}

export function defineEvent<T>(key: string): EventHandle<T> {
  return { key }
}

type Handler = (payload: unknown) => void

export class EventBus {
  private handlers = new Map<string, Set<Handler>>()

  on<T>(handle: EventHandle<T>, handler: (payload: T) => void): () => void {
    const key = handle.key
    if (!this.handlers.has(key)) this.handlers.set(key, new Set())
    const h = handler as Handler
    this.handlers.get(key)!.add(h)
    return () => {
      this.handlers.get(key)?.delete(h)
    }
  }

  emit<T>(handle: EventHandle<T>, payload: T): void {
    this.handlers.get(handle.key)?.forEach((h) => {
      try {
        h(payload as unknown)
      } catch (e) {
        console.error(`[EventBus] handler error for "${handle.key}":`, e)
      }
    })
  }
}

export function createEventBus(): EventBus {
  return new EventBus()
}

// Runtime singleton (tests use createEventBus() for isolation)
export const eventBus = new EventBus()
```

- [ ] **Step 3: Implement poc/plugins/core/events.ts**

```ts
import { defineEvent } from '../../eventBus'

export interface DamageDealtPayload {
  targetId: string
  damage: number
  damageType: string
}

export const damageDealtEvent = defineEvent<DamageDealtPayload>('core:damage-dealt')
```

- [ ] **Step 4: Implement poc/pocWorkflowContext.ts**

Create a POC context factory that is a **superset** of the existing `WorkflowContext`:

- `ctx.data` → getter returning `stateObj` (old interface compat)
- `ctx.state` → same stateObj (new interface)
- `ctx.read` → IDataReader
- `ctx.updateComponent()` → delegates to store action
- `ctx.patchGlobal()` → delegates to store action
- `ctx.events.emit()` → delegates to eventBus
- Stubs for old interface: `updateEntity`, `updateTeamTracker`, `serverRoll`, `showToast`, `announce`, `playAnimation`, `playSound`
- `ctx.abort()` → sets `internal.abortCtrl.aborted`
- `ctx.runWorkflow()` → nested workflow support

- [ ] **Step 5: Implement poc/plugins/core/workflows.ts**

`dealDamage` workflow with two steps:

1. `core:calc-damage`: `ctx.state.finalDamage = ctx.state.rawDamage`
2. `core:apply-damage`: `ctx.updateComponent(targetId, 'core:health', ...)` + `ctx.events.emit(damageDealtEvent, ...)`

Export `DealDamageState` type and `dealDamageHandle`.

- [ ] **Step 6: Implement poc/plugins/core/index.ts and poc/plugins/status-fx/index.ts**

Core plugin: defines `dealDamage` workflow via `engine.defineWorkflow`.

Status-fx plugin: `sdk.addStep(dealDamageHandle, { id: 'status-fx:apply-resistance', before: 'core:apply-damage', ... })` — reads resistances and reduces finalDamage.

- [ ] **Step 7: Run tests**

Run: `pnpm test poc/__tests__/workflow-write.test.ts`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add poc/pocWorkflowContext.ts poc/eventBus.ts poc/plugins/ poc/__tests__/workflow-write.test.ts
git commit -m "feat(poc): phase 2 — workflow writes data with cross-plugin intercept"
```

---

### Task 4: Phase 3 — DnD → Workflow → Dual Panel Link

**Files:**

- Create: `poc/panels/EntityCard.tsx` — entity card with drop zone
- Create: `poc/panels/StatusTagPalette.tsx` — spell drag source
- Create: `poc/__tests__/dnd-dual-panel.test.ts`
- Modify: `poc/PocApp.tsx` — add layout with panels

- [ ] **Step 1: Write dnd-dual-panel.test.ts**

Tests:

- `onDrop` triggers workflow → store data changes
- `canDrop` rejects dead entities (hp=0)
- Cross-panel data sync after drop

Run: `pnpm test poc/__tests__/dnd-dual-panel.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement poc/panels/EntityCard.tsx**

Component props: `{ entityId: string }`. Uses:

- `useComponent<Health>(entityId, 'core:health')` for HP display
- `useComponent<Resistances>(entityId, 'status-fx:resistances')` for resistance display
- `dnd.makeDropZone({ accept: ['spell'], canDrop, onDrop })` for drag target
- `canDrop` uses `dataReader.component()` (imperative, not hook)
- `onDrop` calls `runner.runWorkflow(dealDamageHandle, ...)`

- [ ] **Step 3: Implement poc/panels/StatusTagPalette.tsx**

Spell cards with `dnd.makeDraggable({ type: 'spell', data: { name, damage, damageType } })`.
Spells: Fire Arrow (10 fire), Ice Shard (8 ice), Lightning Bolt (15 lightning).

- [ ] **Step 4: Update poc/PocApp.tsx with layout**

Layout with:

- StatusTagPalette on left
- Two EntityCard panels (both bound to `goblin-01`) in center
- "Direct store edit" button to verify reactivity

- [ ] **Step 5: Run tests**

Run: `pnpm test poc/__tests__/dnd-dual-panel.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add poc/panels/ poc/__tests__/dnd-dual-panel.test.ts poc/PocApp.tsx
git commit -m "feat(poc): phase 3 — DnD to workflow to dual panel link"
```

---

### Task 5: Phase 4 — EventBus Side Effects

**Files:**

- Create: `poc/panels/DamageLog.tsx` — damage log panel
- Modify: `poc/eventBus.ts` — add `useEvent` hook
- Modify: `poc/panels/EntityCard.tsx` — add hit flash animation
- Create: `poc/__tests__/eventBus.test.ts`

- [ ] **Step 1: Write eventBus.test.ts**

Tests:

- emit/on basic flow
- Exception isolation: handler A throws → handler B still executes
- `useEvent` unmount auto-cleanup (renderHook + unmount + verify no callback)
- `createEventBus()` test isolation (separate instances don't cross-talk)

Run: `pnpm test poc/__tests__/eventBus.test.ts`
Expected: FAIL

- [ ] **Step 2: Add useEvent hook to poc/eventBus.ts**

```ts
import { useRef, useEffect } from 'react'

export function useEvent<T>(
  handle: EventHandle<T>,
  handler: (payload: T) => void,
  bus: EventBus = eventBus,
): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  useEffect(() => bus.on(handle, (p) => handlerRef.current(p)), [handle.key, bus])
}
```

- [ ] **Step 3: Implement poc/panels/DamageLog.tsx**

Subscribes to `damageDealtEvent` via `useEvent`. Accumulates damage entries in local state. Renders scrollable log.

- [ ] **Step 4: Add hit flash to EntityCard.tsx**

`useEvent(damageDealtEvent, ...)` — when `payload.targetId === entityId`, trigger CSS transition (red flash, 300ms).

- [ ] **Step 5: Update PocApp.tsx to include DamageLog panel**

- [ ] **Step 6: Run tests**

Run: `pnpm test poc/__tests__/eventBus.test.ts`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add poc/eventBus.ts poc/panels/DamageLog.tsx poc/panels/EntityCard.tsx poc/PocApp.tsx poc/__tests__/eventBus.test.ts
git commit -m "feat(poc): phase 4 — EventBus side effects with hit flash and damage log"
```

---

### Task 6: Phase 5a — Session State (Selection + Dynamic Binding)

**Files:**

- Create: `poc/sessionStore.ts` — usePocSessionStore
- Create: `poc/PocPanelRenderer.tsx` — enhanced PanelRenderer with instanceProps factory
- Create: `poc/panels/SelectionDetail.tsx` — selection detail panel
- Modify: `poc/plugins/core/workflows.ts` — add setSelection workflow
- Create: `poc/__tests__/session.test.ts`
- Modify: `poc/PocApp.tsx` — add entity list + selection detail panel

- [ ] **Step 1: Write session.test.ts**

Tests:

- setSelection workflow updates session store
- instanceProps factory re-evaluates on session change
- Dynamic panel follows selection (goblin → hero)
- Static panel unaffected by selection

Run: `pnpm test poc/__tests__/session.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement poc/sessionStore.ts**

```ts
import { create } from 'zustand'

interface SessionState {
  selection: string[]
}

export const usePocSessionStore = create<SessionState>(() => ({
  selection: [],
}))

// Write function — only for core:set-selection workflow step
export function _setSelection(entityIds: string[]) {
  usePocSessionStore.setState({ selection: entityIds })
}
```

- [ ] **Step 3: Add setSelection workflow to core/workflows.ts**

```ts
export const setSelectionHandle = engine.defineWorkflow<{ entityId: string | null }>(
  'core:set-selection',
  (ctx) => {
    _setSelection(ctx.state.entityId ? [ctx.state.entityId] : [])
  },
)
```

Note: The `engine` reference needs to be the same instance. The core plugin `onActivate` will define this workflow using the engine it receives.

- [ ] **Step 4: Implement poc/PocPanelRenderer.tsx**

Enhanced renderer that supports `instanceProps` as either object or function:

```tsx
const session = usePocSessionStore()
const resolvedProps =
  typeof entry.instanceProps === 'function'
    ? entry.instanceProps(session)
    : (entry.instanceProps ?? {})
```

- [ ] **Step 5: Implement poc/panels/SelectionDetail.tsx**

Props: `{ entityId: string | null }`. Shows entity details when entityId is set, empty state when null.

- [ ] **Step 6: Update PocApp.tsx**

Add entity list sidebar (clickable items → `runner.runWorkflow(setSelectionHandle, { entityId })`).
Add SelectionDetail panel with dynamic binding via instanceProps factory.

- [ ] **Step 7: Run tests**

Run: `pnpm test poc/__tests__/session.test.ts`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add poc/sessionStore.ts poc/PocPanelRenderer.tsx poc/panels/SelectionDetail.tsx poc/plugins/core/workflows.ts poc/__tests__/session.test.ts poc/PocApp.tsx
git commit -m "feat(poc): phase 5a — session state with selection and dynamic binding"
```

---

### Task 7: Phase 5b — requestInput (Unit Test Only)

**Files:**

- Create: `poc/__tests__/requestInput.test.ts`
- Modify: `poc/sessionStore.ts` — add pendingInteractions Map + resolveInput/cancelInput

- [ ] **Step 1: Write requestInput.test.ts**

Tests:

- `requestInput` pauses workflow (Promise hangs, step doesn't continue)
- `resolveInput(interactionId, value)` resumes workflow (Promise resolves, workflow continues)
- `cancelInput(interactionId)` cancels workflow (status = 'cancelled')
- `pendingInteractions: Map<string, PendingInteraction>` supports multiple parallel workflows

Run: `pnpm test poc/__tests__/requestInput.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement requestInput/resolveInput/cancelInput in sessionStore**

```ts
export interface PendingInteraction {
  interactionId: string
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

// Add to session store state:
// pendingInteractions: Map<string, PendingInteraction>

export function requestInput(interactionId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    usePocSessionStore.setState((s) => {
      const next = new Map(s.pendingInteractions)
      next.set(interactionId, { interactionId, resolve, reject })
      return { pendingInteractions: next }
    })
  })
}

export function resolveInput(interactionId: string, value: unknown): void {
  const pending = usePocSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.resolve(value)
  usePocSessionStore.setState((s) => {
    const next = new Map(s.pendingInteractions)
    next.delete(interactionId)
    return { pendingInteractions: next }
  })
}

export function cancelInput(interactionId: string): void {
  const pending = usePocSessionStore.getState().pendingInteractions.get(interactionId)
  if (!pending) return
  pending.reject(new Error('cancelled'))
  usePocSessionStore.setState((s) => {
    const next = new Map(s.pendingInteractions)
    next.delete(interactionId)
    return { pendingInteractions: next }
  })
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test poc/__tests__/requestInput.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add poc/sessionStore.ts poc/__tests__/requestInput.test.ts
git commit -m "feat(poc): phase 5b — requestInput pause/resume/cancel (unit test only)"
```

---

### Task 8: Cross-Plugin Integration Tests

**Files:**

- Create: `poc/__tests__/cross-plugin.test.ts`

- [ ] **Step 1: Write cross-plugin.test.ts**

Tests:

1. Two plugins activated → dealDamage: goblin hit by fire arrow → damage = rawDamage - fire resistance
2. Deactivate status-fx (`engine.deactivatePlugin('status-fx')`) → dealDamage still works, damage = rawDamage (no resistance calc)
3. status-fx EventBus handler throws exception → core's damage handler still executes normally

Run: `pnpm test poc/__tests__/cross-plugin.test.ts`
Expected: All PASS

- [ ] **Step 2: Commit**

```bash
git add poc/__tests__/cross-plugin.test.ts
git commit -m "feat(poc): cross-plugin integration tests with degradation verification"
```

---

### Task 9: Final Verification + PR

- [ ] **Step 1: Run full test suite**

Run: `pnpm test --run`
Expected: All tests pass (both existing and new poc/ tests)

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm exec tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run linter**

Run: `pnpm lint`
Expected: No lint errors

- [ ] **Step 4: Create deviations document (if any)**

If any implementation deviated from the design docs, create `poc/DEVIATIONS.md` documenting:

- What deviated
- Why
- The alternative approach taken

- [ ] **Step 5: Create PR**

PR title: `feat(poc): full-chain plugin verification sandbox`
PR body: Summary of all phases verified, test count, deviations if any.
