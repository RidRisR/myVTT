# UI System Phase 1: Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core infrastructure for the plugin-driven UI system (Phase 1 of the UI refactor spec), enabling plugins to register components, contribute to extension points, persist layouts, and broadcast awareness state — without migrating any existing components.

**Architecture:** Two registries (UIRegistry extended + new ExtensionRegistry) feed into a PanelRenderer with isolation containers. Layout state lives in zustand (client) backed by SQLite (server) with Socket.io sync. Awareness uses a generic channel relay on Socket.io with TTL auto-expiry on the client.

**Tech Stack:** React 18, zustand, Socket.io, better-sqlite3, vitest, TypeScript

**Spec:** [`docs/superpowers/specs/2026-03-28-ui-system-refactor-design.md`](../specs/2026-03-28-ui-system-refactor-design.md)

---

## File Structure

### New files

| File                                                    | Responsibility                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/ui-system/extensionRegistry.ts`                    | `ExtensionRegistry` class, `createExtensionPoint`, `logRenderer` helper              |
| `src/ui-system/__tests__/extensionRegistry.test.ts`     | ExtensionRegistry unit tests                                                         |
| `src/ui-system/awarenessChannel.ts`                     | `createAwarenessChannel`, `AwarenessManager` (client-side TTL + subscribe/broadcast) |
| `src/ui-system/__tests__/awarenessChannel.test.ts`      | AwarenessManager unit tests                                                          |
| `src/stores/layoutStore.ts`                             | zustand store for `RoomLayoutConfig`, layout mode, panel CRUD, sync actions          |
| `src/stores/__tests__/layoutStore.test.ts`              | Layout store unit tests                                                              |
| `server/routes/layout.ts`                               | REST `GET`/`PUT /api/rooms/:roomId/layout`                                           |
| `server/__tests__/scenarios/layout-persistence.test.ts` | Layout REST + Socket.io broadcast test                                               |

### Modified files

| File                                       | Changes                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `src/ui-system/registrationTypes.ts`       | Add `type` field + `DefaultPlacement` to `ComponentDef`                           |
| `src/ui-system/registry.ts`                | Add `listComponents()`, `listComponentsByType()`                                  |
| `src/ui-system/__tests__/registry.test.ts` | Tests for new methods + type field                                                |
| `src/ui-system/types.ts`                   | Add `zOrder` to `LayoutEntry`, extend `IComponentSDK` with `awareness`/`log`/`ui` |
| `src/ui-system/PanelRenderer.tsx`          | Add isolation container (`contain`, `data-plugin`, `data-type`, `zIndex`)         |
| `src/shared/socketEvents.ts`               | Add `layout:updated`, `awareness:ch:broadcast`, `awareness:ch:clear` events       |
| `server/schema.ts`                         | Add `layout` table to `initRoomSchema`                                            |
| `server/awareness.ts`                      | Add generic channel relay handlers                                                |
| `server/index.ts`                          | Wire layout routes                                                                |
| `src/workflow/pluginSDK.ts`                | Add `contribute()` to `PluginSDK.ui`, accept `ExtensionRegistry`                  |

---

## Task 1: ExtensionRegistry

Pure data structure — no React, no I/O. Foundation for all extension point contributions.

**Files:**

- Create: `src/ui-system/extensionRegistry.ts`
- Create: `src/ui-system/__tests__/extensionRegistry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/ui-system/__tests__/extensionRegistry.test.ts
import { describe, it, expect } from 'vitest'
import { ExtensionRegistry, createExtensionPoint, logRenderer } from '../extensionRegistry'

const mockComponent = () => null

describe('ExtensionRegistry', () => {
  it('contribute + get returns the component', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<{ name: string }>('core:test.slot')
    registry.contribute(point, mockComponent as never)
    expect(registry.get(point)).toBe(mockComponent)
  })

  it('get returns undefined when nothing contributed', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<{ name: string }>('core:test.empty')
    expect(registry.get(point)).toBeUndefined()
  })

  it('getAll returns all contributions in priority order (highest first)', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<{ x: number }>('core:test.multi')
    const compA = (() => 'A') as never
    const compB = (() => 'B') as never
    const compC = (() => 'C') as never
    registry.contribute(point, compA, 10)
    registry.contribute(point, compB, 30)
    registry.contribute(point, compC, 20)
    expect(registry.getAll(point)).toEqual([compB, compC, compA])
  })

  it('get returns highest priority contribution', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<{}>('core:test.prio')
    const low = (() => 'low') as never
    const high = (() => 'high') as never
    registry.contribute(point, low, 1)
    registry.contribute(point, high, 99)
    expect(registry.get(point)).toBe(high)
  })

  it('default priority is 0', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<{}>('core:test.default-prio')
    const compA = (() => 'A') as never
    const compB = (() => 'B') as never
    registry.contribute(point, compA) // priority 0
    registry.contribute(point, compB, 1) // priority 1
    expect(registry.get(point)).toBe(compB)
  })

  it('getAll returns empty array when nothing contributed', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<{}>('core:test.none')
    expect(registry.getAll(point)).toEqual([])
  })
})

describe('logRenderer', () => {
  it('creates an extension point keyed by log entry type', () => {
    const point = logRenderer('dh:judgment')
    expect(point.key).toBe('dh:judgment')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/extensionRegistry.test.ts`
Expected: FAIL — module `../extensionRegistry` does not exist

- [ ] **Step 3: Implement ExtensionRegistry**

```typescript
// src/ui-system/extensionRegistry.ts
import type { ComponentType } from 'react'

/** Typed token for an extension point. Type info exists only at compile time. */
export interface ExtensionPoint<TProps> {
  readonly key: string
  /** Phantom field — never set at runtime, carries type info for TS only */
  readonly __phantom?: TProps
}

/** Create a typed extension point token (analogous to React createContext<T>()). */
export function createExtensionPoint<TProps>(key: string): ExtensionPoint<TProps> {
  return { key } as ExtensionPoint<TProps>
}

/** Convenience: create an extension point keyed by a log entry type (no dot in key). */
export function logRenderer(
  type: string,
): ExtensionPoint<{ entry: { type: string; payload: unknown } }> {
  return createExtensionPoint(type)
}

interface Contribution {
  component: ComponentType<never>
  priority: number
}

export class ExtensionRegistry {
  private map = new Map<string, Contribution[]>()

  /** Register a component contribution to an extension point. */
  contribute<T>(point: ExtensionPoint<T>, component: ComponentType<T>, priority = 0): void {
    const list = this.map.get(point.key) ?? []
    list.push({ component: component as ComponentType<never>, priority })
    // Keep sorted by priority descending for fast get()
    list.sort((a, b) => b.priority - a.priority)
    this.map.set(point.key, list)
  }

  /** Get the highest-priority contribution, or undefined if none. */
  get<T>(point: ExtensionPoint<T>): ComponentType<T> | undefined {
    const list = this.map.get(point.key)
    return list?.[0]?.component as ComponentType<T> | undefined
  }

  /** Get all contributions sorted by priority (highest first). */
  getAll<T>(point: ExtensionPoint<T>): ComponentType<T>[] {
    const list = this.map.get(point.key)
    if (!list) return []
    return list.map((c) => c.component) as ComponentType<T>[]
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/extensionRegistry.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```
feat: add ExtensionRegistry with typed extension points

Unified registry for UI extension contributions (slots, log
renderers, menu items). Uses typed tokens for compile-time safety.
```

---

## Task 2: UIRegistry + ComponentDef Extensions

Extend existing types and registry to support the spec's `type` field, `defaultPlacement`, and list methods.

**Files:**

- Modify: `src/ui-system/registrationTypes.ts`
- Modify: `src/ui-system/registry.ts`
- Modify: `src/ui-system/__tests__/registry.test.ts`

- [ ] **Step 1: Update ComponentDef types**

In `src/ui-system/registrationTypes.ts`, add `type` and `defaultPlacement`:

```typescript
// src/ui-system/registrationTypes.ts
// No imports from workflow/ — this file is imported by workflow/types.ts
import type React from 'react'

export type ZLayer = 'below-canvas' | 'above-canvas' | 'above-ui'

/** Panel z-order grouping: background < panel < overlay */
export type PanelType = 'background' | 'panel' | 'overlay'

export interface DefaultPlacement {
  anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  offsetX?: number
  offsetY?: number
  modes?: ('narrative' | 'tactical')[]
}

export interface ComponentDef {
  id: string
  // sdk typed as unknown: avoids importing IComponentSDK here (which would create a
  // cycle: types.ts → workflow/types.ts → registrationTypes.ts → types.ts).
  // Plugin registration sites cast their component: `MyPanel as React.ComponentType<{ sdk: unknown }>`.
  component: React.ComponentType<{ sdk: unknown }>
  type: PanelType
  defaultSize: { width: number; height: number }
  minSize?: { width: number; height: number }
  defaultPlacement?: DefaultPlacement
  chromeVisible?: boolean // default true; false = chrome hidden in play mode
}

export interface LayerDef {
  id: string
  zLayer: ZLayer
  component: React.ComponentType<{ layoutMode: 'play' | 'edit' }>
  pointerEvents?: boolean // default false
}

export interface IUIRegistrationSDK {
  registerComponent(def: ComponentDef): void
  registerLayer(def: LayerDef): void
}
```

- [ ] **Step 2: Add listComponents and listComponentsByType to UIRegistry**

In `src/ui-system/registry.ts`:

```typescript
// src/ui-system/registry.ts
import type { ComponentDef, LayerDef, ZLayer, PanelType } from './registrationTypes'

const Z_ORDER: ZLayer[] = ['below-canvas', 'above-canvas', 'above-ui']

export class UIRegistry {
  private components = new Map<string, ComponentDef>()
  private layers: LayerDef[] = []

  registerComponent(def: ComponentDef): void {
    if (this.components.has(def.id)) {
      throw new Error(`UIRegistry: component id "${def.id}" already registered`)
    }
    this.components.set(def.id, def)
  }

  registerLayer(def: LayerDef): void {
    this.layers.push(def)
  }

  getComponent(id: string): ComponentDef | undefined {
    return this.components.get(id)
  }

  getLayers(): LayerDef[] {
    return [...this.layers].sort((a, b) => Z_ORDER.indexOf(a.zLayer) - Z_ORDER.indexOf(b.zLayer))
  }

  listComponents(): ComponentDef[] {
    return [...this.components.values()]
  }

  listComponentsByType(type: PanelType): ComponentDef[] {
    return [...this.components.values()].filter((c) => c.type === type)
  }
}
```

- [ ] **Step 3: Update tests and add new ones**

Append to `src/ui-system/__tests__/registry.test.ts`:

```typescript
// Add to existing imports
import type { PanelType } from '../registrationTypes'

// Update existing componentDef to include `type`
const componentDef: ComponentDef = {
  id: 'test.hello',
  component: mockComponent as never,
  type: 'panel',
  defaultSize: { width: 200, height: 100 },
}

// Add new tests inside the existing describe('UIRegistry', ...)
it('listComponents returns all registered components', () => {
  registry.registerComponent(componentDef)
  registry.registerComponent({
    id: 'test.world',
    component: mockComponent as never,
    type: 'overlay',
    defaultSize: { width: 100, height: 100 },
  })
  expect(registry.listComponents()).toHaveLength(2)
})

it('listComponentsByType filters by panel type', () => {
  registry.registerComponent(componentDef) // type: 'panel'
  registry.registerComponent({
    id: 'test.bg',
    component: mockComponent as never,
    type: 'background',
    defaultSize: { width: 100, height: 100 },
  })
  registry.registerComponent({
    id: 'test.overlay',
    component: mockComponent as never,
    type: 'overlay',
    defaultSize: { width: 100, height: 100 },
  })

  expect(registry.listComponentsByType('panel')).toHaveLength(1)
  expect(registry.listComponentsByType('panel')[0].id).toBe('test.hello')
  expect(registry.listComponentsByType('background')).toHaveLength(1)
  expect(registry.listComponentsByType('overlay')).toHaveLength(1)
})

it('listComponents returns empty array when none registered', () => {
  expect(registry.listComponents()).toEqual([])
})
```

- [ ] **Step 4: Fix any downstream type errors from adding `type` to ComponentDef**

The POC sandbox and plugins reference `ComponentDef` without `type`. Search for all `registerComponent` call sites and add `type: 'panel'` (or appropriate type):

- `plugins/poc-ui/index.ts` — add `type: 'panel'` to `poc-ui.hello`
- `src/sandbox/PatternUISystem.tsx` — check if it creates ComponentDef inline; if so, add `type`

Run: `npx tsc --noEmit` to verify no type errors.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run src/ui-system/__tests__/registry.test.ts`
Expected: All tests PASS (old + new)

- [ ] **Step 6: Commit**

```
feat: extend ComponentDef with panel type and defaultPlacement

Add PanelType ('background' | 'panel' | 'overlay') for z-order
grouping. Add DefaultPlacement for one-click default layout.
Add listComponents() and listComponentsByType() to UIRegistry.
```

---

## Task 3: LayoutEntry zOrder + Socket Event Types

Add `zOrder` to `LayoutEntry` and define all new socket events needed for layout sync and awareness channels.

**Files:**

- Modify: `src/ui-system/types.ts`
- Modify: `src/shared/socketEvents.ts`

- [ ] **Step 1: Add zOrder to LayoutEntry**

In `src/ui-system/types.ts`, update `LayoutEntry`:

```typescript
export interface LayoutEntry {
  x: number
  y: number
  width: number
  height: number
  zOrder: number
  visible?: boolean
  instanceProps?: InstancePropsOrFactory
}
```

- [ ] **Step 2: Add new socket event types**

In `src/shared/socketEvents.ts`, add to the `ServerToClientEvents` interface:

```typescript
  // Layout sync
  'layout:updated': (layout: { narrative: Record<string, unknown>; tactical: Record<string, unknown> }) => void

  // Awareness channel (generic)
  'awareness:ch:broadcast': (data: { channel: string; payload: unknown; seatId: string }) => void
  'awareness:ch:clear': (data: { channel: string; seatId: string }) => void
```

Add to `ClientToServerEvents` interface:

```typescript
  // Layout save (client → server, debounced)
  // (Layout uses REST PUT, no dedicated socket client event needed)

  // Awareness channel (generic)
  'awareness:ch:broadcast': (data: { channel: string; payload: unknown }) => void
  'awareness:ch:clear': (data: { channel: string }) => void
```

- [ ] **Step 3: Fix any type errors from zOrder addition**

`LayoutEntry` now requires `zOrder`. Update any existing layout objects:

- `src/sandbox/PatternUISystem.tsx` — add `zOrder: 0` to demo layout entries
- `src/ui-system/PanelRenderer.tsx` — no changes needed yet (zOrder applied in Task 5)

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```
feat: add zOrder to LayoutEntry and new socket event types

Prepare type foundations for layout sync (layout:updated) and
generic awareness channels (awareness:ch:broadcast/clear).
```

---

## Task 4: Layout Persistence — Server

Add the `layout` table to room.db, REST endpoints, and Socket.io broadcast.

**Files:**

- Modify: `server/schema.ts`
- Create: `server/routes/layout.ts`
- Modify: `server/index.ts`
- Create: `server/__tests__/scenarios/layout-persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/__tests__/scenarios/layout-persistence.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initRoomSchema } from '../../schema'

describe('layout table', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initRoomSchema(db)
  })

  it('layout table is created with room schema', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='layout'")
      .all()
    expect(tables).toHaveLength(1)
  })

  it('stores and retrieves layout JSON', () => {
    const config = JSON.stringify({
      narrative: { 'core.chat#1': { x: 10, y: 20, width: 300, height: 400, zOrder: 0 } },
      tactical: {},
    })
    db.prepare('INSERT INTO layout (id, config) VALUES (1, ?)').run(config)
    const row = db.prepare('SELECT config FROM layout WHERE id = 1').get() as { config: string }
    expect(JSON.parse(row.config)).toEqual(JSON.parse(config))
  })

  it('upserts layout config', () => {
    const v1 = JSON.stringify({ narrative: {}, tactical: {} })
    const v2 = JSON.stringify({
      narrative: { 'a#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 } },
      tactical: {},
    })
    db.prepare('INSERT INTO layout (id, config) VALUES (1, ?)').run(v1)
    db.prepare('UPDATE layout SET config = ? WHERE id = 1').run(v2)
    const row = db.prepare('SELECT config FROM layout WHERE id = 1').get() as { config: string }
    expect(JSON.parse(row.config).narrative).toHaveProperty('a#1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/scenarios/layout-persistence.test.ts`
Expected: FAIL — `layout` table does not exist

- [ ] **Step 3: Add layout table to schema**

In `server/schema.ts`, inside `initRoomSchema`, add before the indexes block:

```sql
    -- Layout config (singleton row, JSON blob)
    CREATE TABLE IF NOT EXISTS layout (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config TEXT NOT NULL DEFAULT '{"narrative":{},"tactical":{}}'
    );
    INSERT OR IGNORE INTO layout (id, config) VALUES (1, '{"narrative":{},"tactical":{}}');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/scenarios/layout-persistence.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Implement layout REST routes**

```typescript
// server/routes/layout.ts
import { Router } from 'express'
import type { TypedServer } from '../socketTypes'
import { withRoom } from './middleware'

export function layoutRoutes(dataDir: string, io: TypedServer) {
  const router = Router()
  const room = withRoom(dataDir)

  // GET /api/rooms/:roomId/layout — fetch current layout config
  router.get('/api/rooms/:roomId/layout', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT config FROM layout WHERE id = 1').get() as
      | { config: string }
      | undefined
    const config = row ? JSON.parse(row.config) : { narrative: {}, tactical: {} }
    res.json(config)
  })

  // PUT /api/rooms/:roomId/layout — save layout config (GM only in future)
  router.put('/api/rooms/:roomId/layout', room, (req, res) => {
    const config = JSON.stringify(req.body)
    req.roomDb!.prepare('UPDATE layout SET config = ? WHERE id = 1').run(config)
    // Broadcast to all clients in the room
    io.to(req.roomId!).emit('layout:updated', req.body)
    res.json(req.body)
  })

  return router
}
```

- [ ] **Step 6: Wire layout routes in server/index.ts**

In `server/index.ts`, add import and route mounting alongside existing routes:

```typescript
import { layoutRoutes } from './routes/layout'
// ...
app.use(layoutRoutes(DATA_DIR, io))
```

Note: Find the route-mounting section (around lines 70-85 where other routes are `app.use(...)`-d) and add the layout route there.

- [ ] **Step 7: Check for middleware import**

The `withRoom` middleware is imported from `./middleware`. Verify it exists by checking the import in other route files like `server/routes/state.ts`. If the import path differs, adjust accordingly.

Run: `npx tsc --noEmit` to verify no errors.

- [ ] **Step 8: Commit**

```
feat: layout persistence — schema, REST endpoints, socket broadcast

Add `layout` table (singleton JSON blob) to room.db schema.
GET/PUT /api/rooms/:roomId/layout for reading/saving.
Broadcasts layout:updated on save to sync all clients.
```

---

## Task 5: Layout Store (Client)

Zustand store managing RoomLayoutConfig, layout mode, and panel CRUD operations.

**Files:**

- Create: `src/stores/layoutStore.ts`
- Create: `src/stores/__tests__/layoutStore.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/stores/__tests__/layoutStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createLayoutStore, type LayoutStoreState } from '../layoutStore'
import type { StoreApi } from 'zustand'

describe('layoutStore', () => {
  let store: StoreApi<LayoutStoreState>

  beforeEach(() => {
    store = createLayoutStore()
  })

  it('initializes with empty layouts and play mode', () => {
    const s = store.getState()
    expect(s.narrative).toEqual({})
    expect(s.tactical).toEqual({})
    expect(s.layoutMode).toBe('play')
  })

  it('loadLayout replaces both configs', () => {
    const narrative = { 'chat#1': { x: 0, y: 0, width: 300, height: 400, zOrder: 0 } }
    const tactical = { 'map#1': { x: 10, y: 10, width: 500, height: 500, zOrder: 1 } }
    store.getState().loadLayout({ narrative, tactical })
    expect(store.getState().narrative).toEqual(narrative)
    expect(store.getState().tactical).toEqual(tactical)
  })

  it('updateEntry updates a single entry in the active mode', () => {
    store.getState().loadLayout({
      narrative: { 'a#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 } },
      tactical: {},
    })
    // Default active mode is narrative (when isTactical = false)
    store.getState().updateEntry('a#1', { x: 50, y: 50 })
    expect(store.getState().narrative['a#1'].x).toBe(50)
    expect(store.getState().narrative['a#1'].y).toBe(50)
    // Width/height unchanged
    expect(store.getState().narrative['a#1'].width).toBe(100)
  })

  it('addEntry adds a new panel to the active layout', () => {
    store.getState().addEntry('new#1', { x: 0, y: 0, width: 200, height: 150, zOrder: 0 })
    expect(store.getState().narrative).toHaveProperty('new#1')
  })

  it('removeEntry removes a panel from the active layout', () => {
    store.getState().loadLayout({
      narrative: { 'a#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 } },
      tactical: {},
    })
    store.getState().removeEntry('a#1')
    expect(store.getState().narrative).not.toHaveProperty('a#1')
  })

  it('setLayoutMode toggles between play and edit', () => {
    store.getState().setLayoutMode('edit')
    expect(store.getState().layoutMode).toBe('edit')
    store.getState().setLayoutMode('play')
    expect(store.getState().layoutMode).toBe('play')
  })

  it('setIsTactical switches active mode', () => {
    store.getState().loadLayout({
      narrative: { 'a#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 } },
      tactical: { 'b#1': { x: 10, y: 10, width: 200, height: 200, zOrder: 0 } },
    })
    expect(store.getState().activeLayout).toEqual(store.getState().narrative)
    store.getState().setIsTactical(true)
    expect(store.getState().activeLayout).toEqual(store.getState().tactical)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/__tests__/layoutStore.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement layoutStore**

```typescript
// src/stores/layoutStore.ts
import { createStore } from 'zustand/vanilla'
import type { LayoutConfig, LayoutEntry } from '../ui-system/types'

export interface RoomLayoutConfig {
  narrative: LayoutConfig
  tactical: LayoutConfig
}

export interface LayoutStoreState {
  narrative: LayoutConfig
  tactical: LayoutConfig
  isTactical: boolean
  layoutMode: 'play' | 'edit'
  /** Derived: points to narrative or tactical based on isTactical */
  activeLayout: LayoutConfig
  isEditing: boolean

  loadLayout(config: RoomLayoutConfig): void
  updateEntry(instanceKey: string, partial: Partial<LayoutEntry>): void
  addEntry(instanceKey: string, entry: LayoutEntry): void
  removeEntry(instanceKey: string): void
  setLayoutMode(mode: 'play' | 'edit'): void
  setIsTactical(tactical: boolean): void
}

export function createLayoutStore() {
  return createStore<LayoutStoreState>((set, get) => ({
    narrative: {},
    tactical: {},
    isTactical: false,
    layoutMode: 'play' as const,
    activeLayout: {},
    isEditing: false,

    loadLayout: (config) => {
      const isTactical = get().isTactical
      set({
        narrative: config.narrative,
        tactical: config.tactical,
        activeLayout: isTactical ? config.tactical : config.narrative,
      })
    },

    updateEntry: (instanceKey, partial) => {
      const { isTactical, narrative, tactical } = get()
      const modeKey = isTactical ? 'tactical' : 'narrative'
      const current = isTactical ? tactical : narrative
      const entry = current[instanceKey]
      if (!entry) return
      const updated = { ...current, [instanceKey]: { ...entry, ...partial } }
      set({
        [modeKey]: updated,
        activeLayout: updated,
      } as Partial<LayoutStoreState>)
    },

    addEntry: (instanceKey, entry) => {
      const { isTactical, narrative, tactical } = get()
      const modeKey = isTactical ? 'tactical' : 'narrative'
      const current = isTactical ? tactical : narrative
      const updated = { ...current, [instanceKey]: entry }
      set({
        [modeKey]: updated,
        activeLayout: updated,
      } as Partial<LayoutStoreState>)
    },

    removeEntry: (instanceKey) => {
      const { isTactical, narrative, tactical } = get()
      const modeKey = isTactical ? 'tactical' : 'narrative'
      const current = isTactical ? tactical : narrative
      const { [instanceKey]: _, ...rest } = current
      set({
        [modeKey]: rest,
        activeLayout: rest,
      } as Partial<LayoutStoreState>)
    },

    setLayoutMode: (mode) => {
      set({ layoutMode: mode, isEditing: mode === 'edit' })
    },

    setIsTactical: (tactical) => {
      const { narrative, tactical: tac } = get()
      set({
        isTactical: tactical,
        activeLayout: tactical ? tac : narrative,
      })
    },
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/__tests__/layoutStore.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```
feat: add layoutStore for client-side layout management

Zustand vanilla store managing RoomLayoutConfig with narrative/
tactical modes. Supports entry CRUD, mode switching, and edit mode.
```

---

## Task 6: PanelRenderer Isolation Container

Upgrade existing PanelRenderer with CSS containment, plugin attribution, and z-ordering.

**Files:**

- Modify: `src/ui-system/PanelRenderer.tsx`

- [ ] **Step 1: Update PanelRenderer with isolation**

Replace the panel wrapper div in `src/ui-system/PanelRenderer.tsx`:

```tsx
import { PanelErrorBoundary } from './PanelErrorBoundary'
import { DragHandle } from './LayoutEditor'
import type { UIRegistry } from './registry'
import type { LayoutConfig, IComponentSDK } from './types'
import { useSessionStore } from '../stores/sessionStore'

interface Props {
  registry: UIRegistry
  layout: LayoutConfig
  makeSDK: (instanceKey: string, instanceProps: Record<string, unknown>) => IComponentSDK
  layoutMode: 'play' | 'edit'
  onDrag?: (instanceKey: string, delta: { dx: number; dy: number }) => void
  showHandles?: boolean
}

export function PanelRenderer({
  registry,
  layout,
  makeSDK,
  layoutMode,
  onDrag,
  showHandles = true,
}: Props) {
  // Select primitive array ref directly — avoid new object to prevent infinite re-render
  const selection = useSessionStore((s) => s.selection)
  const session = { selection }
  const entries = Object.entries(layout)

  return (
    <>
      {entries.map(([instanceKey, entry]) => {
        if (entry.visible === false) return null

        // Parse componentId from "componentId#instance"
        const componentId = instanceKey.replace(/#[^#]*$/, '')
        const def = registry.getComponent(componentId)
        if (!def) return null

        // Extract plugin namespace from componentId (before the colon or dot)
        const pluginId = componentId.split(/[:.]/)[0]

        const resolvedProps =
          typeof entry.instanceProps === 'function'
            ? entry.instanceProps(session)
            : (entry.instanceProps ?? {})
        const sdk = makeSDK(instanceKey, resolvedProps)
        const PanelComponent = def.component

        return (
          <div
            key={instanceKey}
            className="plugin-panel"
            data-plugin={pluginId}
            data-type={def.type}
            style={{
              position: 'absolute',
              left: entry.x,
              top: entry.y,
              width: entry.width,
              height: entry.height,
              contain: 'layout paint',
              zIndex: entry.zOrder,
            }}
          >
            <div style={{ position: 'absolute', inset: 0 }}>
              <PanelErrorBoundary panelId={instanceKey}>
                <PanelComponent sdk={sdk} />
              </PanelErrorBoundary>
            </div>
            {layoutMode === 'edit' && onDrag && showHandles ? (
              <DragHandle instanceKey={instanceKey} label={componentId} onDrag={onDrag} />
            ) : null}
          </div>
        )
      })}
    </>
  )
}
```

Key changes:

- Added `className="plugin-panel"` for CSS `@scope` targeting
- Added `data-plugin={pluginId}` extracted from componentId namespace
- Added `data-type={def.type}` for z-order group debugging
- Added `contain: 'layout paint'` for CSS containment
- Added `zIndex: entry.zOrder` from LayoutEntry

- [ ] **Step 2: Fix sandbox PatternUISystem.tsx zOrder references**

In `src/sandbox/PatternUISystem.tsx`, ensure any inline layout entries include `zOrder: 0`.

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run src/ui-system/`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```
feat: PanelRenderer isolation — containment, plugin attribution, z-order

Add CSS contain: layout paint for stacking context isolation.
Add data-plugin/data-type attributes for @scope CSS targeting.
Apply zOrder from LayoutEntry for panel z-ordering.
```

---

## Task 7: Awareness Channel — Server Generic Relay

Add generic channel relay to the server alongside existing hardcoded awareness events.

**Files:**

- Modify: `server/awareness.ts`
- Create: `server/__tests__/scenarios/awareness-channel-relay.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// server/__tests__/scenarios/awareness-channel-relay.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Minimal mock for Socket.io types
function createMockSocket(roomId: string, seatId: string | null) {
  const handlers = new Map<string, Function>()
  const toEmissions: Array<{ event: string; data: unknown }> = []
  return {
    data: { roomId, seatId, role: seatId ? 'PL' : null },
    id: `socket-${Math.random().toString(36).slice(2)}`,
    on: (event: string, handler: Function) => {
      handlers.set(event, handler)
    },
    to: (room: string) => ({
      emit: (event: string, data: unknown) => {
        toEmissions.push({ event, data })
      },
    }),
    emit: vi.fn(),
    _handlers: handlers,
    _toEmissions: toEmissions,
  }
}

describe('awareness channel relay', () => {
  it('relays awareness:ch:broadcast with injected seatId', () => {
    const socket = createMockSocket('room1', 'seat-A')
    // Simulate the handler
    const handler = (data: { channel: string; payload: unknown }) => {
      if (!socket.data.seatId) return
      socket.to(socket.data.roomId).emit('awareness:ch:broadcast', {
        ...data,
        seatId: socket.data.seatId,
      })
    }
    handler({ channel: 'dh:spell.targeting', payload: { tokenIds: ['t1'] } })
    expect(socket._toEmissions).toHaveLength(1)
    expect(socket._toEmissions[0]).toEqual({
      event: 'awareness:ch:broadcast',
      data: {
        channel: 'dh:spell.targeting',
        payload: { tokenIds: ['t1'] },
        seatId: 'seat-A',
      },
    })
  })

  it('does not relay when seatId is null', () => {
    const socket = createMockSocket('room1', null)
    const handler = (data: { channel: string; payload: unknown }) => {
      if (!socket.data.seatId) return
      socket.to(socket.data.roomId).emit('awareness:ch:broadcast', {
        ...data,
        seatId: socket.data.seatId,
      })
    }
    handler({ channel: 'test:ch', payload: {} })
    expect(socket._toEmissions).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it passes** (this tests the logic pattern, not the actual wiring)

Run: `npx vitest run server/__tests__/scenarios/awareness-channel-relay.test.ts`
Expected: PASS (we're testing the relay logic inline)

- [ ] **Step 3: Add generic channel handlers to server/awareness.ts**

Append inside the `io.on('connection', (socket) => { ... })` block, after the existing handlers and before the disconnect handler:

```typescript
// Generic awareness channel relay (new plugin-extensible channels)
socket.on('awareness:ch:broadcast', (data: { channel: string; payload: unknown }) => {
  if (!socket.data.seatId) return
  socket.to(roomId).emit('awareness:ch:broadcast', {
    ...data,
    seatId: socket.data.seatId,
  })
})

socket.on('awareness:ch:clear', (data: { channel: string }) => {
  if (!socket.data.seatId) return
  socket.to(roomId).emit('awareness:ch:clear', {
    channel: data.channel,
    seatId: socket.data.seatId,
  })
})
```

- [ ] **Step 4: Verify type safety**

Run: `npx tsc --noEmit`
Expected: No errors (the events were defined in Task 3)

- [ ] **Step 5: Commit**

```
feat: awareness generic channel relay on server

Add awareness:ch:broadcast and awareness:ch:clear handlers.
Server injects seatId and relays to room. Plugins can define
custom awareness channels without server-side changes.
```

---

## Task 8: Awareness Channel — Client SDK

Client-side `AwarenessManager` with subscribe/broadcast/clear and TTL auto-expiry.

**Files:**

- Create: `src/ui-system/awarenessChannel.ts`
- Create: `src/ui-system/__tests__/awarenessChannel.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/ui-system/__tests__/awarenessChannel.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAwarenessChannel, AwarenessManager } from '../awarenessChannel'

describe('createAwarenessChannel', () => {
  it('creates a typed channel token with the given key', () => {
    const ch = createAwarenessChannel<{ x: number }>('core:cursor')
    expect(ch.key).toBe('core:cursor')
  })
})

describe('AwarenessManager', () => {
  let manager: AwarenessManager
  const mockEmit = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new AwarenessManager(mockEmit)
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
    mockEmit.mockClear()
  })

  it('broadcast emits via socket', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    manager.broadcast(ch, { x: 42 })
    expect(mockEmit).toHaveBeenCalledWith('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 42 },
    })
  })

  it('clear emits via socket', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    manager.clear(ch)
    expect(mockEmit).toHaveBeenCalledWith('awareness:ch:clear', {
      channel: 'test:pos',
    })
  })

  it('subscribe receives incoming broadcasts', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    manager.subscribe(ch, handler)
    // Simulate incoming broadcast
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 10 },
      seatId: 'seat-B',
    })
    expect(handler).toHaveBeenCalledWith('seat-B', { x: 10 })
  })

  it('subscribe ignores broadcasts for other channels', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    manager.subscribe(ch, handler)
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'other:ch',
      payload: { x: 10 },
      seatId: 'seat-B',
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('subscribe receives null on clear', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    manager.subscribe(ch, handler)
    manager.handleIncoming('awareness:ch:clear', {
      channel: 'test:pos',
      seatId: 'seat-B',
    })
    expect(handler).toHaveBeenCalledWith('seat-B', null)
  })

  it('unsubscribe stops receiving', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    const unsub = manager.subscribe(ch, handler)
    unsub()
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 10 },
      seatId: 'seat-B',
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('TTL auto-expires stale state', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    manager.subscribe(ch, handler)

    // Receive a broadcast
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 10 },
      seatId: 'seat-B',
    })
    expect(handler).toHaveBeenCalledTimes(1)

    // Advance past TTL (default 5s)
    vi.advanceTimersByTime(6000)

    // Should have received a null (expired)
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenLastCalledWith('seat-B', null)
  })

  it('TTL resets on new broadcast from same seat', () => {
    const ch = createAwarenessChannel<{ x: number }>('test:pos')
    const handler = vi.fn()
    manager.subscribe(ch, handler)

    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 1 },
      seatId: 'seat-B',
    })

    // Advance 3s (within TTL)
    vi.advanceTimersByTime(3000)

    // New broadcast resets TTL
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:pos',
      payload: { x: 2 },
      seatId: 'seat-B',
    })

    // Advance 3s again (6s total but only 3s since last broadcast)
    vi.advanceTimersByTime(3000)
    // Should NOT have expired — only 3s since last broadcast
    expect(handler).toHaveBeenCalledTimes(2) // two broadcasts, no expiry

    // Advance 3 more seconds (6s since last broadcast)
    vi.advanceTimersByTime(3000)
    // Now should have expired
    expect(handler).toHaveBeenCalledTimes(3)
    expect(handler).toHaveBeenLastCalledWith('seat-B', null)
  })

  it('handleRemove clears all channels for a seat', () => {
    const ch1 = createAwarenessChannel<{ x: number }>('test:a')
    const ch2 = createAwarenessChannel<{ y: number }>('test:b')
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    manager.subscribe(ch1, handler1)
    manager.subscribe(ch2, handler2)

    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:a',
      payload: { x: 1 },
      seatId: 'seat-B',
    })
    manager.handleIncoming('awareness:ch:broadcast', {
      channel: 'test:b',
      payload: { y: 2 },
      seatId: 'seat-B',
    })

    manager.handleRemove('seat-B')
    expect(handler1).toHaveBeenLastCalledWith('seat-B', null)
    expect(handler2).toHaveBeenLastCalledWith('seat-B', null)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/awarenessChannel.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement AwarenessManager**

```typescript
// src/ui-system/awarenessChannel.ts

/** Typed token for an awareness channel. Type info exists only at compile time. */
export interface AwarenessChannel<T> {
  readonly key: string
  readonly __phantom?: T
}

/** Create a typed awareness channel token. */
export function createAwarenessChannel<T>(key: string): AwarenessChannel<T> {
  return { key } as AwarenessChannel<T>
}

type AwarenessHandler = (seatId: string, state: unknown | null) => void

interface ChannelBroadcastData {
  channel: string
  payload: unknown
  seatId: string
}

interface ChannelClearData {
  channel: string
  seatId: string
}

// Key: "channel:seatId"
function ttlKey(channel: string, seatId: string): string {
  return `${channel}\0${seatId}`
}

const DEFAULT_TTL_MS = 5000

type SocketEmit = (event: string, data: unknown) => void

/**
 * Client-side awareness channel manager.
 * Manages subscriptions, broadcasts, and TTL-based auto-expiry.
 */
export class AwarenessManager {
  private emit: SocketEmit
  private subscribers = new Map<string, Set<AwarenessHandler>>()
  private ttlTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // Track which channels each seat has active state in (for handleRemove)
  private activeSeatChannels = new Map<string, Set<string>>() // seatId → Set<channel>

  constructor(emit: SocketEmit) {
    this.emit = emit
  }

  /** Subscribe to a channel. Returns unsubscribe function. */
  subscribe<T>(
    channel: AwarenessChannel<T>,
    handler: (seatId: string, state: T | null) => void,
  ): () => void {
    const handlers = this.subscribers.get(channel.key) ?? new Set()
    handlers.add(handler as AwarenessHandler)
    this.subscribers.set(channel.key, handlers)
    return () => {
      handlers.delete(handler as AwarenessHandler)
      if (handlers.size === 0) this.subscribers.delete(channel.key)
    }
  }

  /** Broadcast state to other clients via server relay. */
  broadcast<T>(channel: AwarenessChannel<T>, data: T): void {
    this.emit('awareness:ch:broadcast', {
      channel: channel.key,
      payload: data,
    })
  }

  /** Clear state immediately. */
  clear(channel: AwarenessChannel<unknown>): void {
    this.emit('awareness:ch:clear', {
      channel: channel.key,
    })
  }

  /** Handle incoming broadcast from server. Call from socket listener. */
  handleIncoming(
    event: 'awareness:ch:broadcast' | 'awareness:ch:clear',
    data: ChannelBroadcastData | ChannelClearData,
  ): void {
    if (event === 'awareness:ch:broadcast') {
      const { channel, payload, seatId } = data as ChannelBroadcastData
      this.notifySubscribers(channel, seatId, payload)
      this.resetTTL(channel, seatId)
      // Track active seat-channel
      const channels = this.activeSeatChannels.get(seatId) ?? new Set()
      channels.add(channel)
      this.activeSeatChannels.set(seatId, channels)
    } else {
      const { channel, seatId } = data as ChannelClearData
      this.notifySubscribers(channel, seatId, null)
      this.clearTTL(channel, seatId)
      this.activeSeatChannels.get(seatId)?.delete(channel)
    }
  }

  /** Handle seat disconnect — clear all channels for that seat. */
  handleRemove(seatId: string): void {
    const channels = this.activeSeatChannels.get(seatId)
    if (!channels) return
    for (const channel of channels) {
      this.notifySubscribers(channel, seatId, null)
      this.clearTTL(channel, seatId)
    }
    this.activeSeatChannels.delete(seatId)
  }

  /** Clean up all timers. */
  dispose(): void {
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer)
    }
    this.ttlTimers.clear()
    this.subscribers.clear()
    this.activeSeatChannels.clear()
  }

  private notifySubscribers(channel: string, seatId: string, state: unknown | null): void {
    const handlers = this.subscribers.get(channel)
    if (!handlers) return
    for (const handler of handlers) {
      handler(seatId, state)
    }
  }

  private resetTTL(channel: string, seatId: string): void {
    const key = ttlKey(channel, seatId)
    const existing = this.ttlTimers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.notifySubscribers(channel, seatId, null)
      this.ttlTimers.delete(key)
      this.activeSeatChannels.get(seatId)?.delete(channel)
    }, DEFAULT_TTL_MS)
    this.ttlTimers.set(key, timer)
  }

  private clearTTL(channel: string, seatId: string): void {
    const key = ttlKey(channel, seatId)
    const timer = this.ttlTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.ttlTimers.delete(key)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/awarenessChannel.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```
feat: AwarenessManager — client-side channel SDK with TTL auto-expiry

createAwarenessChannel<T> for typed tokens. AwarenessManager handles
subscribe/broadcast/clear with 5s TTL auto-expiry. Plugins can
define custom channels without server changes.
```

---

## Task 9: PluginSDK Extensions — contribute() + awareness

Wire ExtensionRegistry and AwarenessManager into the existing PluginSDK so plugins can use `sdk.ui.contribute()` and components can access `sdk.awareness`.

**Files:**

- Modify: `src/ui-system/registrationTypes.ts` (add `IUIRegistrationSDK.contribute`)
- Modify: `src/workflow/pluginSDK.ts` (accept ExtensionRegistry, wire contribute)
- Modify: `src/ui-system/types.ts` (add awareness + log + ui to IComponentSDK)

- [ ] **Step 1: Extend IUIRegistrationSDK with contribute**

In `src/ui-system/registrationTypes.ts`, update the interface:

```typescript
export interface IUIRegistrationSDK {
  registerComponent(def: ComponentDef): void
  registerLayer(def: LayerDef): void
  contribute<T>(
    point: { readonly key: string },
    component: React.ComponentType<T>,
    priority?: number,
  ): void
}
```

Note: We use `{ readonly key: string }` instead of importing `ExtensionPoint` to avoid a circular dependency (this file must not import from `extensionRegistry.ts` which may import from this file).

- [ ] **Step 2: Extend IComponentSDK with awareness, log, ui**

In `src/ui-system/types.ts`, update `IComponentSDK`. **Note:** New fields are optional (`?`) in Phase 1 to avoid breaking existing sandbox code. They become required when Phase 2 wires the real implementations.

```typescript
export interface IComponentSDK {
  read: IDataReader
  workflow: IWorkflowRunner
  context: ComponentContext
  /** play 模式下注入；edit 模式下系统浮层接管所有交互，不注入 */
  interaction?: IInteractionSDK
  /** Phase 1: optional. Phase 2: required once AwarenessManager is wired. */
  awareness?: {
    subscribe<T>(
      channel: { readonly key: string; readonly __phantom?: T },
      handler: (seatId: string, state: T | null) => void,
    ): () => void
    broadcast<T>(channel: { readonly key: string; readonly __phantom?: T }, data: T): void
    clear(channel: { readonly key: string }): void
  }
  /** Phase 1: optional. Phase 2: required once LogStreamDispatcher is wired (Track A dep). */
  log?: {
    subscribe(pattern: string, handler: (entry: unknown) => void): () => void
  }
  /** Phase 1: optional. Phase 2: required once layout store openPanel/closePanel is wired. */
  ui?: {
    openPanel(componentId: string, instanceProps?: Record<string, unknown>): string
    closePanel(instanceKey: string): void
  }
}
```

- [ ] **Step 3: Wire contribute into PluginSDK constructor**

In `src/workflow/pluginSDK.ts`, update the constructor and `ui` property:

```typescript
import type { ExtensionRegistry } from '../ui-system/extensionRegistry'

// Update constructor signature
constructor(
  engine: WorkflowEngine,
  pluginId: string,
  uiRegistry?: UIRegistry,
  triggerRegistry?: TriggerRegistry,
  extensionRegistry?: ExtensionRegistry,
) {
  this.engine = engine
  this.pluginId = pluginId
  this.triggerRegistry = triggerRegistry
  this.ui = uiRegistry
    ? {
        registerComponent: (def) => {
          uiRegistry.registerComponent(def)
        },
        registerLayer: (def) => {
          uiRegistry.registerLayer(def)
        },
        contribute: (point, component, priority) => {
          extensionRegistry?.contribute(point as never, component as never, priority)
        },
      }
    : {
        // no-op: existing tests do not pass a registry
        registerComponent: () => {},
        registerLayer: () => {},
        contribute: () => {},
      }
}
```

- [ ] **Step 4: Verify type safety**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run all existing tests**

Run: `npx vitest run src/workflow/ src/ui-system/`
Expected: All tests PASS (existing PluginSDK tests still work since `extensionRegistry` is optional)

- [ ] **Step 6: Commit**

```
feat: wire ExtensionRegistry into PluginSDK + extend IComponentSDK

PluginSDK.ui now has contribute() for extension point contributions.
IComponentSDK extended with awareness (subscribe/broadcast/clear),
log (subscribe), and ui (openPanel/closePanel) namespaces.
```

---

## Task 10: Full Type-Check + Integration Smoke Test

Verify everything compiles together and existing functionality is preserved.

**Files:**

- No new files — verification only

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 3: Verify the sandbox still works**

Open `src/sandbox/PatternUISystem.tsx` in the editor. Confirm:

- No type errors in the file
- The POC plugin (`plugins/poc-ui/index.ts`) has `type: 'panel'` on its ComponentDef
- Layout entries have `zOrder: 0`

Run: `npx tsc --noEmit` one more time after any fixes.

- [ ] **Step 4: Commit any final fixes**

```
chore: fix type errors from UI system Phase 1 integration
```

(Only if there were fixes needed. Skip if Step 1-2 passed clean.)

---

## Summary

| Task | What                               | Lines (est.)          | Independent?    |
| ---- | ---------------------------------- | --------------------- | --------------- |
| 1    | ExtensionRegistry                  | ~60 code + ~80 test   | Yes             |
| 2    | UIRegistry + ComponentDef          | ~40 code + ~40 test   | Yes             |
| 3    | LayoutEntry zOrder + Socket events | ~20 code              | Yes             |
| 4    | Layout persistence (server)        | ~60 code + ~40 test   | Depends on 3    |
| 5    | Layout store (client)              | ~80 code + ~60 test   | Depends on 3    |
| 6    | PanelRenderer isolation            | ~30 code changes      | Depends on 2, 3 |
| 7    | Awareness channel (server)         | ~20 code + ~30 test   | Depends on 3    |
| 8    | Awareness channel (client)         | ~120 code + ~100 test | Yes             |
| 9    | PluginSDK extensions               | ~30 code changes      | Depends on 1, 8 |
| 10   | Integration smoke test             | 0                     | Depends on all  |

**Parallelizable groups:**

- Group A (independent): Tasks 1, 2, 3, 8
- Group B (after 3): Tasks 4, 5, 6, 7
- Group C (after all): Tasks 9, 10

---

## Deferred to Phase 2

The following are **not** in this plan but are needed to make the system fully functional:

1. **App.tsx wiring** — Mount PanelRenderer + LayerRenderer alongside existing UI (spec §10 Phase 1 item). Minimal code but touches the main app tree.
2. **Layout fetch/sync** — On room init: `GET /api/layout` → `layoutStore.loadLayout()`. Socket listener for `layout:updated`. Debounced `PUT /api/layout` on edit mode changes.
3. **IComponentSDK field promotion** — Remove `?` from `awareness`, `log`, `ui` once real implementations are wired.
4. **Edit mode toolbar** — UI toggle for layoutMode (spec §9, deferred UX).
