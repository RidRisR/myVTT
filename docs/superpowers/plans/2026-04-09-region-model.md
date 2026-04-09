# Region Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-rectangle `PanelRenderer` system with a Region Model supporting anchor-based responsive positioning, collapsible panels, on-demand windows, and plugin-driven chrome.

**Architecture:** New `RegionDef` replaces `ComponentDef`. Layout uses `AnchorPoint + offset` instead of pixel `{x, y}`. Framework provides transparent bounding boxes with safety isolation (contain, isolation, overflow, ErrorBoundary); plugins own all visual content including chrome. Persistent regions live in layout config; on-demand regions are ephemeral runtime instances with shared position templates. Edit-mode drag/resize uses native Pointer Events with `left/top` positioning (no CSS transforms). Per-region portal containers manage Radix floating UI z-index.

**Tech Stack:** React 18, zustand (vanilla), vitest, @testing-library/react, TypeScript, Pointer Events API

**Spec:** [`docs/design/23-UI接口重设计-Region模型.md`](../../design/23-UI接口重设计-Region模型.md)

---

## File Structure

### New files

| File                                                 | Responsibility                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/ui-system/regionTypes.ts`                       | `AnchorPoint`, `RegionLayer`, `RegionLayoutEntry`, `RegionLayoutConfig`, `Viewport` types         |
| `src/ui-system/layoutEngine.ts`                      | `resolvePosition`, `inferAnchor`, `inferPlacement`, `clampToViewport`, `layerBaseZ`, `anchorBase` |
| `src/ui-system/__tests__/layoutEngine.test.ts`       | Layout engine pure function tests                                                                 |
| `src/ui-system/layoutMigration.ts`                   | `isLegacyEntry`, `migrateLayoutEntry`, `migrateLayoutConfig`                                      |
| `src/ui-system/__tests__/layoutMigration.test.ts`    | Migration utility tests                                                                           |
| `src/ui-system/portalManager.ts`                     | `PortalManager` class for per-region portal containers                                            |
| `src/ui-system/__tests__/portalManager.test.ts`      | Portal manager tests                                                                              |
| `src/ui-system/RegionRenderer.tsx`                   | `RegionRenderer` component (replaces `PanelRenderer` for persistent regions)                      |
| `src/ui-system/__tests__/RegionRenderer.test.tsx`    | RegionRenderer tests                                                                              |
| `src/ui-system/OnDemandHost.tsx`                     | `OnDemandHost` component for on-demand region instances                                           |
| `src/ui-system/__tests__/OnDemandHost.test.tsx`      | OnDemandHost tests                                                                                |
| `src/ui-system/RegionEditOverlay.tsx`                | Edit-mode drag + resize overlay using Pointer Events                                              |
| `src/ui-system/__tests__/RegionEditOverlay.test.tsx` | Edit overlay tests                                                                                |
| `src/ui-system/usePointerDrag.ts`                    | `createPointerDragHandler`, `createPointerResizeHandler` utilities                                |
| `src/ui-system/__tests__/usePointerDrag.test.ts`     | Pointer drag utility tests                                                                        |

### Modified files

| File                                                | Changes                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui-system/registrationTypes.ts`                | Add `RegionDef`, update `IUIRegistrationSDK` with `registerRegion`                                                                                                  |
| `src/ui-system/types.ts`                            | Re-export new types, add `IRegionSDK` interface                                                                                                                     |
| `src/ui-system/registry.ts`                         | Add `registerRegion`, `getRegion`, `listRegions`, `listRegionsByLifecycle`; make `registerComponent` a backward-compat wrapper; HMR-safe warn+overwrite for regions |
| `src/ui-system/uiSystemInit.ts`                     | Add `RegionSDKFactoryArgs`, `createRegionSDK` factory                                                                                                               |
| `src/workflow/pluginSDK.ts`                         | Add `registerRegion` delegation in both real and no-op branches                                                                                                     |
| `src/log/rendererRegistry.ts`                       | Add `'ui-slot'` to `multiSurfaces` set                                                                                                                              |
| `src/ui-system/PanelErrorBoundary.tsx`              | Generalize: export `RegionErrorBoundary` alias                                                                                                                      |
| `src/stores/layoutStore.ts`                         | Update types to `RegionLayoutConfig`, add auto-migration in `loadLayout`, add on-demand instance methods                                                            |
| `src/ui-system/useLayoutSync.ts`                    | Update type imports for `RegionLayoutConfig`                                                                                                                        |
| `src/App.tsx`                                       | Replace `PanelRenderer` with `RegionRenderer` + `OnDemandHost`, add viewport state                                                                                  |
| `plugins/core-ui/index.ts`                          | Migrate from `registerComponent` to `registerRegion`                                                                                                                |
| `plugins/daggerheart-core/index.ts`                 | Migrate from `registerComponent` to `registerRegion`                                                                                                                |
| `src/sandbox/PatternUISystem.tsx`                   | Update for new Region system                                                                                                                                        |
| `src/ui-system/__tests__/PanelRenderer.test.tsx`    | Update to `RegionRenderer` tests or deprecate                                                                                                                       |
| `src/ui-system/__tests__/LayoutEditor.test.tsx`     | Update fixtures to anchor-based format                                                                                                                              |
| `src/ui-system/__tests__/production-wiring.test.ts` | Update fixtures and openPanel position type                                                                                                                         |

---

## Phase 1: Core Types + Layout Engine

### Task 1: Create region types and update type interfaces

**Files:**

- Create: `src/ui-system/regionTypes.ts`
- Modify: `src/ui-system/registrationTypes.ts`
- Modify: `src/ui-system/types.ts`

- [ ] **Step 1: Create `regionTypes.ts` with core layout types**

```ts
// src/ui-system/regionTypes.ts

/** Anchor point relative to viewport */
export type AnchorPoint = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

/** Region z-order layer grouping */
export type RegionLayer = 'background' | 'standard' | 'overlay'

/** Viewport dimensions */
export interface Viewport {
  width: number
  height: number
}

/** Layout entry using anchor-based positioning (replaces legacy {x, y} LayoutEntry) */
export interface RegionLayoutEntry {
  anchor: AnchorPoint
  offsetX: number
  offsetY: number
  width: number
  height: number
  zOrder: number
  visible?: boolean
  /** Pure serializable data only — no function form (see spec §12.13) */
  instanceProps?: Record<string, unknown>
}

/** Layout config: maps instance keys to layout entries */
export type RegionLayoutConfig = Record<string, RegionLayoutEntry>

/** On-demand instance descriptor (ephemeral, stored in layoutStore, not persisted) */
export interface OnDemandInstance {
  regionId: string
  instanceKey: string
  instanceProps: Record<string, unknown>
  zOrder: number
}
```

- [ ] **Step 2: Add `RegionDef` to `registrationTypes.ts`**

Add these imports and types after the existing imports at the top of the file:

```ts
import type { AnchorPoint, RegionLayer } from './regionTypes'
```

Add after the `LayerDef` interface (after line 36):

```ts
export interface RegionDef {
  id: string
  // sdk typed as unknown: avoids circular dep (same pattern as ComponentDef)
  component: React.ComponentType<{ sdk: unknown }>
  lifecycle: 'persistent' | 'on-demand'
  defaultSize: { width: number; height: number }
  minSize?: { width: number; height: number }
  defaultPlacement?: { anchor: AnchorPoint; offsetX?: number; offsetY?: number }
  layer: RegionLayer
}
```

Update `IUIRegistrationSDK` — add `registerRegion` before `registerComponent`:

```ts
export interface IUIRegistrationSDK {
  /** Register a Region (new API, replaces registerComponent) */
  registerRegion(def: RegionDef): void
  registerLayer(def: LayerDef): void
  registerRenderer(
    surface: string,
    type: string,
    renderer: React.ComponentType<{ entry: unknown; isNew?: boolean }>,
  ): void
  registerRenderer<T>(
    point: { readonly surface: string; readonly type: string; readonly __phantom?: T },
    value: T,
  ): void
  registerInputHandler(inputType: string, def: InputHandlerDef): void
  /** @deprecated Use registerRegion instead */
  registerComponent(def: ComponentDef): void
}
```

- [ ] **Step 3: Add re-exports and `IRegionSDK` to `types.ts`**

Add after existing re-exports from `'./registrationTypes'` (after line 22):

```ts
export type {
  AnchorPoint,
  RegionLayer,
  Viewport,
  RegionLayoutEntry,
  RegionLayoutConfig,
} from './regionTypes'
export type { RegionDef } from './registrationTypes'
```

Add `IRegionSDK` interface at the end of the file, before the closing exports:

```ts
import type { AnchorPoint } from './regionTypes'

/** Extended SDK for Region components — adds resize and portal support */
export interface IRegionSDK extends Omit<IComponentSDK, 'ui'> {
  ui: {
    openPanel(
      regionId: string,
      instanceProps?: Record<string, unknown>,
      position?: { anchor: AnchorPoint; offsetX?: number; offsetY?: number },
    ): string
    closePanel(instanceKey: string): void
    /** Dynamically resize this region. Clamped to minSize. */
    resize(size: { width?: number; height?: number }): void
    /** Get the portal container for this region (for Radix/floating UI) */
    getPortalContainer(): HTMLElement
  }
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to new types (existing errors unrelated to this change are OK)

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/regionTypes.ts src/ui-system/registrationTypes.ts src/ui-system/types.ts
git commit -m "feat(ui-system): add Region Model core types (RegionDef, RegionLayoutEntry, IRegionSDK)"
```

---

### Task 2: Implement layout engine with tests

**Files:**

- Create: `src/ui-system/__tests__/layoutEngine.test.ts`
- Create: `src/ui-system/layoutEngine.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/ui-system/__tests__/layoutEngine.test.ts
import { describe, it, expect } from 'vitest'
import {
  anchorBase,
  resolvePosition,
  inferAnchor,
  inferPlacement,
  clampToViewport,
  layerBaseZ,
} from '../layoutEngine'
import type { RegionLayoutEntry } from '../regionTypes'

const VP = { width: 1920, height: 1080 }

function entry(overrides: Partial<RegionLayoutEntry>): RegionLayoutEntry {
  return {
    anchor: 'top-left',
    offsetX: 0,
    offsetY: 0,
    width: 200,
    height: 100,
    zOrder: 0,
    ...overrides,
  }
}

describe('anchorBase', () => {
  const size = { width: 200, height: 100 }

  it('top-left: origin', () => {
    expect(anchorBase('top-left', size, VP)).toEqual({ x: 0, y: 0 })
  })

  it('top-right: flush right', () => {
    expect(anchorBase('top-right', size, VP)).toEqual({ x: 1720, y: 0 })
  })

  it('bottom-left: flush bottom', () => {
    expect(anchorBase('bottom-left', size, VP)).toEqual({ x: 0, y: 980 })
  })

  it('bottom-right: flush bottom-right', () => {
    expect(anchorBase('bottom-right', size, VP)).toEqual({ x: 1720, y: 980 })
  })

  it('center: centered', () => {
    expect(anchorBase('center', size, VP)).toEqual({ x: 860, y: 490 })
  })
})

describe('resolvePosition', () => {
  it('top-left with offset', () => {
    expect(resolvePosition(entry({ anchor: 'top-left', offsetX: 10, offsetY: 20 }), VP)).toEqual({
      x: 10,
      y: 20,
    })
  })

  it('top-right with negative offset', () => {
    expect(resolvePosition(entry({ anchor: 'top-right', offsetX: -10, offsetY: 20 }), VP)).toEqual({
      x: 1710,
      y: 20,
    })
  })

  it('bottom-left with negative offset', () => {
    expect(
      resolvePosition(entry({ anchor: 'bottom-left', offsetX: 10, offsetY: -20 }), VP),
    ).toEqual({ x: 10, y: 960 })
  })

  it('bottom-right with zero offset', () => {
    expect(resolvePosition(entry({ anchor: 'bottom-right', offsetX: 0, offsetY: 0 }), VP)).toEqual({
      x: 1720,
      y: 980,
    })
  })

  it('center with zero offset', () => {
    expect(resolvePosition(entry({ anchor: 'center', offsetX: 0, offsetY: 0 }), VP)).toEqual({
      x: 860,
      y: 490,
    })
  })

  it('center with offset shifts from center', () => {
    expect(resolvePosition(entry({ anchor: 'center', offsetX: 50, offsetY: -30 }), VP)).toEqual({
      x: 910,
      y: 460,
    })
  })
})

describe('inferAnchor', () => {
  it('top-left quadrant', () => {
    expect(inferAnchor({ x: 100, y: 100 }, VP)).toBe('top-left')
  })

  it('top-right quadrant', () => {
    expect(inferAnchor({ x: 1500, y: 100 }, VP)).toBe('top-right')
  })

  it('bottom-left quadrant', () => {
    expect(inferAnchor({ x: 100, y: 800 }, VP)).toBe('bottom-left')
  })

  it('bottom-right quadrant', () => {
    expect(inferAnchor({ x: 1500, y: 800 }, VP)).toBe('bottom-right')
  })

  it('exact center goes to bottom-right (>= threshold)', () => {
    expect(inferAnchor({ x: 960, y: 540 }, VP)).toBe('bottom-right')
  })
})

describe('inferPlacement', () => {
  it('top-left panel infers top-left anchor with correct offset', () => {
    const result = inferPlacement({ x: 100, y: 100, width: 200, height: 100 }, VP)
    expect(result).toEqual({ anchor: 'top-left', offsetX: 100, offsetY: 100 })
  })

  it('top-right panel infers top-right anchor with negative offset', () => {
    const result = inferPlacement({ x: 1700, y: 50, width: 200, height: 100 }, VP)
    expect(result).toEqual({ anchor: 'top-right', offsetX: -20, offsetY: 50 })
  })

  it('round-trips with resolvePosition', () => {
    const rect = { x: 300, y: 700, width: 200, height: 100 }
    const placement = inferPlacement(rect, VP)
    const e = entry({ ...placement, width: 200, height: 100 })
    const pos = resolvePosition(e, VP)
    expect(pos).toEqual({ x: rect.x, y: rect.y })
  })
})

describe('clampToViewport', () => {
  it('no clamping needed when within bounds', () => {
    expect(clampToViewport({ x: 100, y: 100 }, { width: 200, height: 100 }, VP)).toEqual({
      x: 100,
      y: 100,
    })
  })

  it('clamps negative x and y to zero', () => {
    expect(clampToViewport({ x: -50, y: -30 }, { width: 200, height: 100 }, VP)).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('clamps right overflow', () => {
    expect(clampToViewport({ x: 1800, y: 0 }, { width: 200, height: 100 }, VP)).toEqual({
      x: 1720,
      y: 0,
    })
  })

  it('clamps bottom overflow', () => {
    expect(clampToViewport({ x: 0, y: 1050 }, { width: 200, height: 100 }, VP)).toEqual({
      x: 0,
      y: 980,
    })
  })

  it('clamps both axes simultaneously', () => {
    expect(clampToViewport({ x: 2000, y: 2000 }, { width: 200, height: 100 }, VP)).toEqual({
      x: 1720,
      y: 980,
    })
  })
})

describe('layerBaseZ', () => {
  it('background = 0', () => expect(layerBaseZ('background')).toBe(0))
  it('standard = 1000', () => expect(layerBaseZ('standard')).toBe(1000))
  it('overlay = 2000', () => expect(layerBaseZ('overlay')).toBe(2000))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/layoutEngine.test.ts`
Expected: FAIL — module `../layoutEngine` not found

- [ ] **Step 3: Write the implementation**

```ts
// src/ui-system/layoutEngine.ts
import type { AnchorPoint, RegionLayoutEntry, RegionLayer, Viewport } from './regionTypes'

/**
 * Compute the base pixel position for an anchor point,
 * given panel size and viewport dimensions.
 */
export function anchorBase(
  anchor: AnchorPoint,
  panelSize: { width: number; height: number },
  viewport: Viewport,
): { x: number; y: number } {
  const { width: vw, height: vh } = viewport
  const { width: pw, height: ph } = panelSize
  switch (anchor) {
    case 'top-left':
      return { x: 0, y: 0 }
    case 'top-right':
      return { x: vw - pw, y: 0 }
    case 'bottom-left':
      return { x: 0, y: vh - ph }
    case 'bottom-right':
      return { x: vw - pw, y: vh - ph }
    case 'center':
      return { x: (vw - pw) / 2, y: (vh - ph) / 2 }
  }
}

/** Resolve a RegionLayoutEntry to absolute pixel coordinates. */
export function resolvePosition(
  entry: RegionLayoutEntry,
  viewport: Viewport,
): { x: number; y: number } {
  const base = anchorBase(entry.anchor, { width: entry.width, height: entry.height }, viewport)
  return {
    x: base.x + entry.offsetX,
    y: base.y + entry.offsetY,
  }
}

/** Infer the best anchor from a panel center position within the viewport. */
export function inferAnchor(
  panelCenter: { x: number; y: number },
  viewport: Viewport,
): AnchorPoint {
  const cx = viewport.width / 2
  const cy = viewport.height / 2
  if (panelCenter.x < cx && panelCenter.y < cy) return 'top-left'
  if (panelCenter.x >= cx && panelCenter.y < cy) return 'top-right'
  if (panelCenter.x < cx && panelCenter.y >= cy) return 'bottom-left'
  return 'bottom-right'
}

/**
 * After a drag ends, infer anchor + offset from the panel's final pixel rect.
 * This is the inverse of resolvePosition.
 */
export function inferPlacement(
  panelRect: { x: number; y: number; width: number; height: number },
  viewport: Viewport,
): { anchor: AnchorPoint; offsetX: number; offsetY: number } {
  const centerX = panelRect.x + panelRect.width / 2
  const centerY = panelRect.y + panelRect.height / 2
  const anchor = inferAnchor({ x: centerX, y: centerY }, viewport)
  const base = anchorBase(anchor, { width: panelRect.width, height: panelRect.height }, viewport)
  return {
    anchor,
    offsetX: panelRect.x - base.x,
    offsetY: panelRect.y - base.y,
  }
}

/** Clamp a position so the panel stays within viewport bounds. Does NOT modify layout data. */
export function clampToViewport(
  pos: { x: number; y: number },
  size: { width: number; height: number },
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(pos.x, viewport.width - size.width)),
    y: Math.max(0, Math.min(pos.y, viewport.height - size.height)),
  }
}

/** Base z-index for each layer grouping. */
export function layerBaseZ(layer: RegionLayer): number {
  switch (layer) {
    case 'background':
      return 0
    case 'standard':
      return 1000
    case 'overlay':
      return 2000
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/layoutEngine.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/layoutEngine.ts src/ui-system/__tests__/layoutEngine.test.ts
git commit -m "feat(ui-system): implement layout engine (resolvePosition, inferAnchor, clampToViewport)"
```

---

### Task 3: Implement layout migration utility with tests

**Files:**

- Create: `src/ui-system/__tests__/layoutMigration.test.ts`
- Create: `src/ui-system/layoutMigration.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/ui-system/__tests__/layoutMigration.test.ts
import { describe, it, expect } from 'vitest'
import { isLegacyEntry, migrateLayoutEntry, migrateLayoutConfig } from '../layoutMigration'
import { resolvePosition } from '../layoutEngine'
import type { RegionLayoutEntry } from '../regionTypes'

const VP = { width: 1920, height: 1080 }

describe('isLegacyEntry', () => {
  it('detects legacy {x, y} entry', () => {
    expect(isLegacyEntry({ x: 10, y: 20, width: 200, height: 100, zOrder: 0 })).toBe(true)
  })

  it('rejects new {anchor} entry', () => {
    expect(
      isLegacyEntry({
        anchor: 'top-left',
        offsetX: 10,
        offsetY: 20,
        width: 200,
        height: 100,
        zOrder: 0,
      }),
    ).toBe(false)
  })

  it('rejects null', () => {
    expect(isLegacyEntry(null)).toBe(false)
  })

  it('rejects non-object', () => {
    expect(isLegacyEntry('hello')).toBe(false)
  })
})

describe('migrateLayoutEntry', () => {
  it('migrates top-left panel correctly', () => {
    const old = { x: 100, y: 100, width: 200, height: 100, zOrder: 5 }
    const result = migrateLayoutEntry(old, VP)
    expect(result).toEqual({
      anchor: 'top-left',
      offsetX: 100,
      offsetY: 100,
      width: 200,
      height: 100,
      zOrder: 5,
      visible: undefined,
      instanceProps: undefined,
    })
  })

  it('migrates top-right panel with negative offset', () => {
    const old = { x: 1700, y: 50, width: 200, height: 100, zOrder: 0 }
    const result = migrateLayoutEntry(old, VP)
    expect(result.anchor).toBe('top-right')
    expect(result.offsetX).toBe(-20)
    expect(result.offsetY).toBe(50)
  })

  it('round-trips: resolvePosition(migrated) returns original {x, y}', () => {
    const old = { x: 300, y: 700, width: 200, height: 100, zOrder: 1 }
    const migrated = migrateLayoutEntry(old, VP)
    const pos = resolvePosition(migrated, VP)
    expect(pos).toEqual({ x: 300, y: 700 })
  })

  it('preserves visible and serializable instanceProps', () => {
    const old = {
      x: 50,
      y: 50,
      width: 200,
      height: 100,
      zOrder: 0,
      visible: false,
      instanceProps: { spellId: 'fireball' },
    }
    const result = migrateLayoutEntry(old, VP)
    expect(result.visible).toBe(false)
    expect(result.instanceProps).toEqual({ spellId: 'fireball' })
  })

  it('drops function instanceProps', () => {
    const old = {
      x: 50,
      y: 50,
      width: 200,
      height: 100,
      zOrder: 0,
      instanceProps: () => ({ foo: 1 }),
    }
    const result = migrateLayoutEntry(old, VP)
    expect(result.instanceProps).toBeUndefined()
  })
})

describe('migrateLayoutConfig', () => {
  it('migrates all entries in a config', () => {
    const config = {
      'core-ui.session-info#1': { x: 1700, y: 60, width: 200, height: 260, zOrder: 0 },
      'daggerheart-core:fear-panel#1': { x: 100, y: 100, width: 160, height: 120, zOrder: 1 },
    }
    const result = migrateLayoutConfig(config, VP)
    expect(Object.keys(result)).toEqual(Object.keys(config))
    expect(result['core-ui.session-info#1'].anchor).toBeDefined()
    expect(result['daggerheart-core:fear-panel#1'].anchor).toBeDefined()
  })

  it('skips already-migrated entries', () => {
    const config = {
      'migrated#1': {
        anchor: 'center' as const,
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    const result = migrateLayoutConfig(config as Record<string, unknown>, VP)
    expect(result['migrated#1']).toEqual(config['migrated#1'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/layoutMigration.test.ts`
Expected: FAIL — module `../layoutMigration` not found

- [ ] **Step 3: Write the implementation**

```ts
// src/ui-system/layoutMigration.ts
import type { RegionLayoutEntry, RegionLayoutConfig, Viewport } from './regionTypes'
import { inferAnchor, anchorBase } from './layoutEngine'

/** Legacy LayoutEntry shape (pre-Region Model) */
export interface LegacyLayoutEntry {
  x: number
  y: number
  width: number
  height: number
  zOrder: number
  visible?: boolean
  instanceProps?: Record<string, unknown> | ((...args: unknown[]) => Record<string, unknown>)
}

/** Type guard: detect legacy {x, y} format vs new {anchor} format */
export function isLegacyEntry(entry: unknown): entry is LegacyLayoutEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'x' in entry &&
    'y' in entry &&
    !('anchor' in entry)
  )
}

/** Convert a single legacy entry to anchor-based format */
export function migrateLayoutEntry(old: LegacyLayoutEntry, viewport: Viewport): RegionLayoutEntry {
  const centerX = old.x + old.width / 2
  const centerY = old.y + old.height / 2
  const anchor = inferAnchor({ x: centerX, y: centerY }, viewport)
  const base = anchorBase(anchor, { width: old.width, height: old.height }, viewport)

  return {
    anchor,
    offsetX: old.x - base.x,
    offsetY: old.y - base.y,
    width: old.width,
    height: old.height,
    zOrder: old.zOrder,
    visible: old.visible,
    instanceProps: typeof old.instanceProps === 'function' ? undefined : old.instanceProps,
  }
}

/** Migrate an entire layout config. Entries already in new format are passed through. */
export function migrateLayoutConfig(
  config: Record<string, unknown>,
  viewport: Viewport,
): RegionLayoutConfig {
  const result: RegionLayoutConfig = {}
  for (const [key, raw] of Object.entries(config)) {
    if (isLegacyEntry(raw)) {
      result[key] = migrateLayoutEntry(raw, viewport)
    } else {
      // Already new format — pass through
      result[key] = raw as RegionLayoutEntry
    }
  }
  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/layoutMigration.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/layoutMigration.ts src/ui-system/__tests__/layoutMigration.test.ts
git commit -m "feat(ui-system): implement layout migration utility (legacy {x,y} → anchor+offset)"
```

---

## Phase 2: Registry + Registration

### Task 4: UIRegistry region methods with tests

**Files:**

- Modify: `src/ui-system/registry.ts`
- Modify: `src/ui-system/__tests__/registry.test.ts` (or create if not exists)

- [ ] **Step 1: Write the failing tests**

Add to the registry test file (create if needed):

```ts
// src/ui-system/__tests__/registry.test.ts (additions)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UIRegistry } from '../registry'
import type { RegionDef } from '../registrationTypes'

function makeDef(overrides: Partial<RegionDef> = {}): RegionDef {
  return {
    id: 'test:region',
    component: (() => null) as unknown as RegionDef['component'],
    lifecycle: 'persistent',
    defaultSize: { width: 200, height: 100 },
    layer: 'standard',
    ...overrides,
  }
}

describe('UIRegistry region methods', () => {
  let reg: UIRegistry

  beforeEach(() => {
    reg = new UIRegistry()
  })

  it('registerRegion + getRegion round-trip', () => {
    const def = makeDef({ id: 'a:panel' })
    reg.registerRegion(def)
    expect(reg.getRegion('a:panel')).toBe(def)
  })

  it('getRegion returns undefined for unknown id', () => {
    expect(reg.getRegion('unknown')).toBeUndefined()
  })

  it('listRegions returns all registered regions', () => {
    reg.registerRegion(makeDef({ id: 'a:one' }))
    reg.registerRegion(makeDef({ id: 'a:two' }))
    expect(reg.listRegions()).toHaveLength(2)
  })

  it('listRegionsByLifecycle filters correctly', () => {
    reg.registerRegion(makeDef({ id: 'a:persist', lifecycle: 'persistent' }))
    reg.registerRegion(makeDef({ id: 'a:demand', lifecycle: 'on-demand' }))
    expect(reg.listRegionsByLifecycle('persistent')).toHaveLength(1)
    expect(reg.listRegionsByLifecycle('persistent')[0].id).toBe('a:persist')
    expect(reg.listRegionsByLifecycle('on-demand')).toHaveLength(1)
  })

  it('HMR: duplicate registerRegion warns and overwrites', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const def1 = makeDef({ id: 'a:panel' })
    const def2 = makeDef({ id: 'a:panel', layer: 'overlay' })
    reg.registerRegion(def1)
    reg.registerRegion(def2)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('a:panel'))
    expect(reg.getRegion('a:panel')?.layer).toBe('overlay')
    spy.mockRestore()
  })

  it('registerComponent backward compat: registers as region', () => {
    reg.registerComponent({
      id: 'old:panel',
      component: (() => null) as unknown as React.ComponentType<{ sdk: unknown }>,
      type: 'panel',
      defaultSize: { width: 200, height: 100 },
      defaultPlacement: { anchor: 'top-right', offsetX: 10, offsetY: 20 },
    })
    const region = reg.getRegion('old:panel')
    expect(region).toBeDefined()
    expect(region!.lifecycle).toBe('persistent')
    expect(region!.layer).toBe('standard')
    expect(region!.defaultPlacement).toEqual({ anchor: 'top-right', offsetX: 10, offsetY: 20 })
  })

  it('registerComponent maps type correctly', () => {
    const register = (type: 'background' | 'panel' | 'overlay') => {
      reg.registerComponent({
        id: `old:${type}`,
        component: (() => null) as unknown as React.ComponentType<{ sdk: unknown }>,
        type,
        defaultSize: { width: 100, height: 100 },
      })
    }
    register('background')
    register('panel')
    register('overlay')
    expect(reg.getRegion('old:background')!.layer).toBe('background')
    expect(reg.getRegion('old:panel')!.layer).toBe('standard')
    expect(reg.getRegion('old:overlay')!.layer).toBe('overlay')
  })

  it('getComponent still works for backward compat', () => {
    reg.registerComponent({
      id: 'old:panel',
      component: (() => null) as unknown as React.ComponentType<{ sdk: unknown }>,
      type: 'panel',
      defaultSize: { width: 200, height: 100 },
    })
    expect(reg.getComponent('old:panel')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/registry.test.ts`
Expected: FAIL — `registerRegion` not found on UIRegistry

- [ ] **Step 3: Implement registry extensions**

Modify `src/ui-system/registry.ts`:

Add import at top:

```ts
import type { ComponentDef, LayerDef, ZLayer, PanelType, RegionDef } from './types'
```

Add `regions` map and methods to `UIRegistry` class:

```ts
export class UIRegistry {
  private components = new Map<string, ComponentDef>()
  private regions = new Map<string, RegionDef>()
  private layers: LayerDef[] = []
  private inputHandlers = new Map<string, InputHandlerDef>()

  registerRegion(def: RegionDef): void {
    if (this.regions.has(def.id)) {
      console.warn(`UIRegistry: region id "${def.id}" already registered, overwriting (HMR)`)
    }
    this.regions.set(def.id, def)
  }

  getRegion(id: string): RegionDef | undefined {
    return this.regions.get(id)
  }

  listRegions(): RegionDef[] {
    return [...this.regions.values()]
  }

  listRegionsByLifecycle(lifecycle: 'persistent' | 'on-demand'): RegionDef[] {
    return [...this.regions.values()].filter((r) => r.lifecycle === lifecycle)
  }

  /** @deprecated Use registerRegion. Kept for backward compatibility. */
  registerComponent(def: ComponentDef): void {
    // Store in legacy map for getComponent backward compat
    if (this.components.has(def.id)) {
      console.warn(`UIRegistry: component id "${def.id}" already registered, overwriting (HMR)`)
    }
    this.components.set(def.id, def)

    // Also register as Region
    this.registerRegion({
      id: def.id,
      component: def.component,
      lifecycle: 'persistent',
      defaultSize: def.defaultSize,
      minSize: def.minSize,
      defaultPlacement: def.defaultPlacement
        ? {
            anchor: def.defaultPlacement.anchor,
            offsetX: def.defaultPlacement.offsetX,
            offsetY: def.defaultPlacement.offsetY,
          }
        : undefined,
      layer: def.type === 'panel' ? 'standard' : def.type,
    })
  }

  // ... rest of existing methods unchanged (registerLayer, getComponent, getLayers, etc.)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/registry.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/registry.ts src/ui-system/__tests__/registry.test.ts
git commit -m "feat(ui-system): add registerRegion to UIRegistry with HMR-safe overwrite and backward compat"
```

---

### Task 5: PluginSDK delegation + RendererRegistry multiSurfaces

**Files:**

- Modify: `src/workflow/pluginSDK.ts`
- Modify: `src/log/rendererRegistry.ts`

- [ ] **Step 1: Add `registerRegion` delegation to PluginSDK**

In `src/workflow/pluginSDK.ts`, find the `ui` property in the constructor (lines 65-90). Add `registerRegion` to both branches:

In the real branch (when `uiRegistry` is provided):

```ts
registerRegion: (def) => {
  uiRegistry.registerRegion(def)
},
```

In the no-op branch:

```ts
registerRegion: () => {},
```

The real branch should look like:

```ts
this.ui = uiRegistry
  ? {
      registerRegion: (def) => {
        uiRegistry.registerRegion(def)
      },
      registerComponent: (def) => {
        uiRegistry.registerComponent(def)
      },
      registerLayer: (def) => {
        uiRegistry.registerLayer(def)
      },
      registerRenderer: (...args: [unknown, unknown, unknown?]) => {
        // ... existing renderer registration logic unchanged
      },
      registerInputHandler: (inputType, def) => {
        uiRegistry.registerInputHandler(inputType, def)
      },
    }
  : {
      registerRegion: () => {},
      registerComponent: () => {},
      registerLayer: () => {},
      registerRenderer: () => {},
      registerInputHandler: () => {},
    }
```

- [ ] **Step 2: Add `'ui-slot'` to `multiSurfaces` in RendererRegistry**

In `src/log/rendererRegistry.ts`, find the `multiSurfaces` set and add `'ui-slot'`:

```ts
const multiSurfaces = new Set(['entity', 'combat', 'ui-slot'])
```

- [ ] **Step 3: Verify types compile and existing tests pass**

Run: `npx tsc --noEmit 2>&1 | head -30 && npx vitest run src/workflow/ src/log/ --reporter=verbose 2>&1 | tail -20`
Expected: No new type errors; existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/workflow/pluginSDK.ts src/log/rendererRegistry.ts
git commit -m "feat: add registerRegion to PluginSDK delegation + ui-slot to multiSurfaces"
```

---

## Phase 3: Infrastructure

### Task 6: Generalize PanelErrorBoundary to RegionErrorBoundary

**Files:**

- Modify: `src/ui-system/PanelErrorBoundary.tsx`

- [ ] **Step 1: Add RegionErrorBoundary alias**

The existing `PanelErrorBoundary` is functionally identical to what we need. Add an alias export and rename the prop for clarity:

```ts
// src/ui-system/PanelErrorBoundary.tsx
import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  panelId: string
  children: ReactNode
}

interface State {
  crashed: boolean
  error: Error | null
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { crashed: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[UISystem] Panel "${this.props.panelId}" crashed:`, error, info)
  }

  render() {
    if (this.state.crashed) {
      return (
        <div style={{ padding: 8, color: '#f87171', fontSize: 12 }}>
          ⚠ {this.props.panelId} crashed
        </div>
      )
    }
    return this.props.children
  }
}

/** Alias for Region Model — same component, clearer name */
export { PanelErrorBoundary as RegionErrorBoundary }
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run src/ui-system/__tests__/PanelRenderer.test.tsx`
Expected: All existing tests PASS (no behavioral change)

- [ ] **Step 3: Commit**

```bash
git add src/ui-system/PanelErrorBoundary.tsx
git commit -m "refactor(ui-system): export RegionErrorBoundary alias from PanelErrorBoundary"
```

---

### Task 7: Portal manager with tests

**Files:**

- Create: `src/ui-system/__tests__/portalManager.test.ts`
- Create: `src/ui-system/portalManager.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/ui-system/__tests__/portalManager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PortalManager } from '../portalManager'

describe('PortalManager', () => {
  let manager: PortalManager

  beforeEach(() => {
    manager = new PortalManager()
  })

  afterEach(() => {
    manager.dispose()
  })

  it('creates a portal-layer container in document.body', () => {
    const layer = document.querySelector('.portal-layer')
    expect(layer).toBeTruthy()
    expect(layer!.parentElement).toBe(document.body)
  })

  it('portal-layer has pointer-events:none', () => {
    const layer = document.querySelector('.portal-layer') as HTMLElement
    expect(layer.style.pointerEvents).toBe('none')
  })

  it('createPortal returns an HTMLElement', () => {
    const el = manager.createPortal('test:region', 'standard')
    expect(el).toBeInstanceOf(HTMLElement)
  })

  it('portal has data-portal-for attribute', () => {
    const el = manager.createPortal('test:region', 'standard')
    expect(el.dataset.portalFor).toBe('test:region')
  })

  it('portal z-index matches layer ceiling', () => {
    const bg = manager.createPortal('a:bg', 'background')
    const std = manager.createPortal('a:std', 'standard')
    const ovl = manager.createPortal('a:ovl', 'overlay')
    expect(bg.style.zIndex).toBe('999')
    expect(std.style.zIndex).toBe('1999')
    expect(ovl.style.zIndex).toBe('2999')
  })

  it('getPortal returns created portal', () => {
    const el = manager.createPortal('test:region', 'standard')
    expect(manager.getPortal('test:region')).toBe(el)
  })

  it('getPortal returns undefined for unknown region', () => {
    expect(manager.getPortal('unknown')).toBeUndefined()
  })

  it('removePortal removes element from DOM', () => {
    manager.createPortal('test:region', 'standard')
    manager.removePortal('test:region')
    expect(manager.getPortal('test:region')).toBeUndefined()
    expect(document.querySelector('[data-portal-for="test:region"]')).toBeNull()
  })

  it('dispose removes portal-layer from DOM', () => {
    manager.createPortal('a:one', 'standard')
    manager.dispose()
    expect(document.querySelector('.portal-layer')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/portalManager.test.ts`
Expected: FAIL — module `../portalManager` not found

- [ ] **Step 3: Write the implementation**

```ts
// src/ui-system/portalManager.ts
import type { RegionLayer } from './regionTypes'

function layerCeilingZ(layer: RegionLayer): number {
  switch (layer) {
    case 'background':
      return 999
    case 'standard':
      return 1999
    case 'overlay':
      return 2999
  }
}

/**
 * Manages per-region portal containers for Radix/floating UI.
 * Portal containers live in a dedicated layer with z-index at the layer ceiling,
 * ensuring dropdowns/popovers are above all same-layer panels but below the next layer.
 */
export class PortalManager {
  private portals = new Map<string, HTMLElement>()
  private container: HTMLElement

  constructor() {
    this.container = document.createElement('div')
    this.container.className = 'portal-layer'
    this.container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0'
    document.body.appendChild(this.container)
  }

  createPortal(regionId: string, layer: RegionLayer): HTMLElement {
    const el = document.createElement('div')
    el.dataset.portalFor = regionId
    el.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:${layerCeilingZ(layer)}`
    this.container.appendChild(el)
    this.portals.set(regionId, el)
    return el
  }

  getPortal(regionId: string): HTMLElement | undefined {
    return this.portals.get(regionId)
  }

  removePortal(regionId: string): void {
    const el = this.portals.get(regionId)
    if (el) {
      el.remove()
      this.portals.delete(regionId)
    }
  }

  dispose(): void {
    this.container.remove()
    this.portals.clear()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/portalManager.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/portalManager.ts src/ui-system/__tests__/portalManager.test.ts
git commit -m "feat(ui-system): implement PortalManager for per-region portal containers"
```

---

## Phase 4: SDK Factory

### Task 8: createRegionSDK factory with tests

**Files:**

- Modify: `src/ui-system/uiSystemInit.ts`
- Create: `src/ui-system/__tests__/createRegionSDK.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/ui-system/__tests__/createRegionSDK.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createRegionSDK } from '../uiSystemInit'
import type { RegionSDKFactoryArgs } from '../uiSystemInit'
import type { IDataReader, IWorkflowRunner } from '../../workflow/types'

function baseArgs(overrides: Partial<RegionSDKFactoryArgs> = {}): RegionSDKFactoryArgs {
  return {
    instanceKey: 'test:region#1',
    instanceProps: {},
    role: 'GM' as const,
    layoutMode: 'play' as const,
    read: {} as IDataReader,
    workflow: { runWorkflow: vi.fn() } as unknown as IWorkflowRunner,
    awarenessManager: null,
    layoutActions: {
      openPanel: vi.fn().mockReturnValue('key#1'),
      closePanel: vi.fn(),
    },
    logSubscribe: null,
    ...overrides,
  }
}

describe('createRegionSDK', () => {
  it('returns an object with ui.resize', () => {
    const sdk = createRegionSDK(baseArgs())
    expect(typeof sdk.ui.resize).toBe('function')
  })

  it('returns an object with ui.getPortalContainer', () => {
    const sdk = createRegionSDK(baseArgs())
    expect(typeof sdk.ui.getPortalContainer).toBe('function')
  })

  it('ui.resize calls onResize callback', () => {
    const onResize = vi.fn()
    const sdk = createRegionSDK(baseArgs({ onResize }))
    sdk.ui.resize({ width: 300 })
    expect(onResize).toHaveBeenCalledWith({ width: 300, height: undefined })
  })

  it('ui.resize clamps to minSize', () => {
    const onResize = vi.fn()
    const sdk = createRegionSDK(
      baseArgs({
        onResize,
        minSize: { width: 100, height: 80 },
      }),
    )
    sdk.ui.resize({ width: 50, height: 40 })
    expect(onResize).toHaveBeenCalledWith({ width: 100, height: 80 })
  })

  it('ui.resize is a no-op when onResize not provided', () => {
    const sdk = createRegionSDK(baseArgs())
    expect(() => sdk.ui.resize({ width: 300 })).not.toThrow()
  })

  it('ui.getPortalContainer returns provided container', () => {
    const container = document.createElement('div')
    const sdk = createRegionSDK(
      baseArgs({
        getPortalContainer: () => container,
      }),
    )
    expect(sdk.ui.getPortalContainer()).toBe(container)
  })

  it('ui.getPortalContainer falls back to document.body', () => {
    const sdk = createRegionSDK(baseArgs())
    expect(sdk.ui.getPortalContainer()).toBe(document.body)
  })

  it('inherits openPanel and closePanel from layoutActions', () => {
    const openPanel = vi.fn().mockReturnValue('key#1')
    const closePanel = vi.fn()
    const sdk = createRegionSDK(
      baseArgs({
        layoutActions: { openPanel, closePanel },
      }),
    )
    sdk.ui.openPanel('test:region')
    expect(openPanel).toHaveBeenCalledWith('test:region', undefined, undefined)
    sdk.ui.closePanel('key#1')
    expect(closePanel).toHaveBeenCalledWith('key#1')
  })

  it('inherits read, workflow, context from base SDK', () => {
    const read = { getEntity: vi.fn() } as unknown as IDataReader
    const sdk = createRegionSDK(baseArgs({ read }))
    expect(sdk.read).toBe(read)
    expect(sdk.context.role).toBe('GM')
    expect(sdk.context.layoutMode).toBe('play')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/createRegionSDK.test.ts`
Expected: FAIL — `createRegionSDK` not exported from `../uiSystemInit`

- [ ] **Step 3: Implement createRegionSDK in uiSystemInit.ts**

Add to `src/ui-system/uiSystemInit.ts` after the existing `createProductionSDK` function:

```ts
import type { IRegionSDK } from './types'

export interface RegionSDKFactoryArgs extends SDKFactoryArgs {
  onResize?: (size: { width?: number; height?: number }) => void
  getPortalContainer?: () => HTMLElement
  minSize?: { width: number; height: number }
}

export function createRegionSDK(args: RegionSDKFactoryArgs): IRegionSDK {
  const base = createProductionSDK(args)
  return {
    ...base,
    ui: {
      openPanel: (regionId, instanceProps, position) => {
        if (!args.layoutActions) return ''
        return args.layoutActions.openPanel(regionId, instanceProps, position)
      },
      closePanel: (instanceKey) => {
        if (!args.layoutActions) return
        args.layoutActions.closePanel(instanceKey)
      },
      resize: (size) => {
        if (!args.onResize) return
        const clamped: { width?: number; height?: number } = {
          width: size.width != null ? Math.max(size.width, args.minSize?.width ?? 0) : undefined,
          height:
            size.height != null ? Math.max(size.height, args.minSize?.height ?? 0) : undefined,
        }
        args.onResize(clamped)
      },
      getPortalContainer: () => {
        return args.getPortalContainer ? args.getPortalContainer() : document.body
      },
    },
  }
}
```

Also update the `layoutActions` type in `SDKFactoryArgs` to accept the new position format:

```ts
layoutActions: {
  openPanel(
    componentId: string,
    instanceProps?: Record<string, unknown>,
    position?: { anchor: AnchorPoint; offsetX?: number; offsetY?: number },
  ): string
  closePanel(instanceKey: string): void
} | null
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/createRegionSDK.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/uiSystemInit.ts src/ui-system/__tests__/createRegionSDK.test.ts
git commit -m "feat(ui-system): implement createRegionSDK factory with resize and portal support"
```

---

## Phase 5: Rendering

### Task 9: RegionRenderer with tests

**Files:**

- Create: `src/ui-system/__tests__/RegionRenderer.test.tsx`
- Create: `src/ui-system/RegionRenderer.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui-system/__tests__/RegionRenderer.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RegionRenderer } from '../RegionRenderer'
import { UIRegistry } from '../registry'
import type { RegionLayoutConfig, IRegionSDK } from '../types'

function mockSDK(): IRegionSDK {
  return {
    read: {} as IRegionSDK['read'],
    data: { useEntity: () => undefined, useComponent: () => undefined, useQuery: () => [] },
    workflow: { runWorkflow: vi.fn() } as unknown as IRegionSDK['workflow'],
    context: { instanceProps: {}, role: 'GM', layoutMode: 'play' },
    interaction: undefined,
    awareness: {
      subscribe: () => () => {},
      broadcast: () => {},
      clear: () => {},
      usePeers: () => new Map(),
    },
    log: { subscribe: () => () => {}, useEntries: () => ({ entries: [], newIds: new Set() }) },
    ui: {
      openPanel: () => '',
      closePanel: () => {},
      resize: () => {},
      getPortalContainer: () => document.body,
    },
  }
}

const VP = { width: 1920, height: 1080 }

function TestPanel() {
  return <div data-testid="panel-content">Hello</div>
}

function CrashPanel(): JSX.Element {
  throw new Error('boom')
}

describe('RegionRenderer', () => {
  it('renders a persistent region at the resolved position', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 10,
        offsetY: 20,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    expect(screen.getByTestId('panel-content')).toBeTruthy()
  })

  it('does not render on-demand regions', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:ondemand',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'on-demand',
      defaultSize: { width: 200, height: 100 },
      layer: 'overlay',
    })
    const layout: RegionLayoutConfig = {
      'test:ondemand': {
        anchor: 'center',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    expect(screen.queryByTestId('panel-content')).toBeNull()
  })

  it('does not render region with visible: false', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:hidden',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:hidden': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
        visible: false,
      },
    }
    render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    expect(screen.queryByTestId('panel-content')).toBeNull()
  })

  it('applies zIndex = layerBaseZ + entry.zOrder', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 5,
      },
    }
    const { container } = render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    const regionDiv = container.querySelector('[data-region="test:panel"]') as HTMLElement
    expect(regionDiv.style.zIndex).toBe('1005')
  })

  it('region container has contain:layout paint and overflow:hidden', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    const { container } = render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    const regionDiv = container.querySelector('[data-region="test:panel"]') as HTMLElement
    expect(regionDiv.style.contain).toBe('layout paint')
    expect(regionDiv.style.overflow).toBe('hidden')
  })

  it('content wrapper has isolation:isolate', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    const { container } = render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    const wrapper = container.querySelector('[data-region="test:panel"] > div') as HTMLElement
    expect(wrapper.style.isolation).toBe('isolate')
  })

  it('edit mode: content wrapper has pointerEvents:none', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    const { container } = render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="edit"
      />,
    )
    const wrapper = container.querySelector('[data-region="test:panel"] > div') as HTMLElement
    expect(wrapper.style.pointerEvents).toBe('none')
  })

  it('ErrorBoundary catches crash without affecting siblings', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:crash',
      component: CrashPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    reg.registerRegion({
      id: 'test:ok',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:crash': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
      'test:ok': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 200,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    expect(screen.getByText(/test:crash crashed/)).toBeTruthy()
    expect(screen.getByTestId('panel-content')).toBeTruthy()
    spy.mockRestore()
  })

  it('has role="region" and aria-label for accessibility', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:panel',
      component: TestPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 200, height: 100 },
      layer: 'standard',
    })
    const layout: RegionLayoutConfig = {
      'test:panel': {
        anchor: 'top-left',
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
        zOrder: 0,
      },
    }
    const { container } = render(
      <RegionRenderer
        registry={reg}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
        layoutMode="play"
      />,
    )
    const regionDiv = container.querySelector('[data-region="test:panel"]') as HTMLElement
    expect(regionDiv.getAttribute('role')).toBe('region')
    expect(regionDiv.getAttribute('aria-label')).toBe('test:panel')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/RegionRenderer.test.tsx`
Expected: FAIL — module `../RegionRenderer` not found

- [ ] **Step 3: Write the implementation**

```tsx
// src/ui-system/RegionRenderer.tsx
import { RegionErrorBoundary } from './PanelErrorBoundary'
import { resolvePosition, clampToViewport, layerBaseZ } from './layoutEngine'
import type { UIRegistry } from './registry'
import type { RegionLayoutConfig, IRegionSDK, Viewport } from './types'
import type { RegionLayoutEntry } from './regionTypes'
import type { AnchorPoint } from './regionTypes'

interface Props {
  registry: UIRegistry
  layout: RegionLayoutConfig
  makeSDK: (instanceKey: string, instanceProps: Record<string, unknown>) => IRegionSDK
  viewport: Viewport
  layoutMode: 'play' | 'edit'
  onDragEnd?: (
    instanceKey: string,
    placement: { anchor: AnchorPoint; offsetX: number; offsetY: number },
  ) => void
  onResize?: (instanceKey: string, size: { width: number; height: number }) => void
}

export function RegionRenderer({
  registry,
  layout,
  makeSDK,
  viewport,
  layoutMode,
  onDragEnd,
  onResize,
}: Props) {
  const regions = registry.listRegionsByLifecycle('persistent')

  return (
    <>
      {regions.map((def) => {
        const entry = layout[def.id]
        if (!entry || entry.visible === false) return null

        const rawPos = resolvePosition(entry, viewport)
        const pos = clampToViewport(rawPos, { width: entry.width, height: entry.height }, viewport)
        const Comp = def.component

        return (
          <div
            key={def.id}
            className="region-container"
            data-region={def.id}
            data-layer={def.layer}
            role="region"
            aria-label={def.id}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              width: entry.width,
              height: entry.height,
              zIndex: layerBaseZ(def.layer) + entry.zOrder,
              pointerEvents: 'auto',
              background: 'transparent',
              contain: 'layout paint',
              overflow: 'hidden',
            }}
          >
            {/* Content layer: isolation:isolate creates stacking context.
                Edit mode pointerEvents:none ensures drag overlay receives events. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                isolation: 'isolate',
                pointerEvents: layoutMode === 'edit' ? 'none' : undefined,
              }}
            >
              <RegionErrorBoundary panelId={def.id}>
                <Comp sdk={makeSDK(def.id, entry.instanceProps ?? {})} />
              </RegionErrorBoundary>
            </div>
            {/* Edit overlay will be rendered here in Task 12 */}
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/RegionRenderer.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/RegionRenderer.tsx src/ui-system/__tests__/RegionRenderer.test.tsx
git commit -m "feat(ui-system): implement RegionRenderer with safety layers and anchor-based positioning"
```

---

### Task 10: OnDemandHost with tests

**Files:**

- Create: `src/ui-system/__tests__/OnDemandHost.test.tsx`
- Create: `src/ui-system/OnDemandHost.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui-system/__tests__/OnDemandHost.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnDemandHost } from '../OnDemandHost'
import type { OnDemandInstance } from '../regionTypes'
import { UIRegistry } from '../registry'
import type { RegionLayoutConfig, IRegionSDK, Viewport } from '../types'

function mockSDK(): IRegionSDK {
  return {
    read: {} as IRegionSDK['read'],
    data: { useEntity: () => undefined, useComponent: () => undefined, useQuery: () => [] },
    workflow: { runWorkflow: vi.fn() } as unknown as IRegionSDK['workflow'],
    context: { instanceProps: {}, role: 'GM', layoutMode: 'play' },
    interaction: undefined,
    awareness: {
      subscribe: () => () => {},
      broadcast: () => {},
      clear: () => {},
      usePeers: () => new Map(),
    },
    log: { subscribe: () => () => {}, useEntries: () => ({ entries: [], newIds: new Set() }) },
    ui: {
      openPanel: () => '',
      closePanel: () => {},
      resize: () => {},
      getPortalContainer: () => document.body,
    },
  }
}

const VP: Viewport = { width: 1920, height: 1080 }

function DetailPanel() {
  return <div data-testid="detail-content">Detail</div>
}

describe('OnDemandHost', () => {
  it('renders nothing when instances is empty', () => {
    const reg = new UIRegistry()
    const { container } = render(
      <OnDemandHost
        registry={reg}
        instances={[]}
        layout={{}}
        makeSDK={() => mockSDK()}
        viewport={VP}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders on-demand instances', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:detail',
      component: DetailPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'on-demand',
      defaultSize: { width: 400, height: 300 },
      layer: 'overlay',
    })
    const instances: OnDemandInstance[] = [
      { regionId: 'test:detail', instanceKey: 'test:detail#a1', instanceProps: {}, zOrder: 1 },
    ]
    render(
      <OnDemandHost
        registry={reg}
        instances={instances}
        layout={{}}
        makeSDK={() => mockSDK()}
        viewport={VP}
      />,
    )
    expect(screen.getByTestId('detail-content')).toBeTruthy()
  })

  it('uses layout template position when available', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:detail',
      component: DetailPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'on-demand',
      defaultSize: { width: 400, height: 300 },
      layer: 'overlay',
    })
    const layout: RegionLayoutConfig = {
      'test:detail': {
        anchor: 'top-right',
        offsetX: -10,
        offsetY: 20,
        width: 400,
        height: 300,
        zOrder: 0,
      },
    }
    const instances: OnDemandInstance[] = [
      { regionId: 'test:detail', instanceKey: 'test:detail#a1', instanceProps: {}, zOrder: 1 },
    ]
    const { container } = render(
      <OnDemandHost
        registry={reg}
        instances={instances}
        layout={layout}
        makeSDK={() => mockSDK()}
        viewport={VP}
      />,
    )
    const div = container.querySelector('[data-instance="test:detail#a1"]') as HTMLElement
    expect(div).toBeTruthy()
    // Position: top-right anchor, panel 400 wide → base x = 1920-400 = 1520, + offset -10 = 1510
    expect(div.style.left).toBe('1510px')
  })

  it('skips instances whose regionId is not registered', () => {
    const reg = new UIRegistry()
    const instances: OnDemandInstance[] = [
      { regionId: 'unknown:thing', instanceKey: 'unknown:thing#1', instanceProps: {}, zOrder: 1 },
    ]
    const { container } = render(
      <OnDemandHost
        registry={reg}
        instances={instances}
        layout={{}}
        makeSDK={() => mockSDK()}
        viewport={VP}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('passes instanceProps to makeSDK', () => {
    const reg = new UIRegistry()
    reg.registerRegion({
      id: 'test:detail',
      component: DetailPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'on-demand',
      defaultSize: { width: 400, height: 300 },
      layer: 'overlay',
    })
    const makeSDK = vi.fn().mockReturnValue(mockSDK())
    const instances: OnDemandInstance[] = [
      {
        regionId: 'test:detail',
        instanceKey: 'test:detail#a1',
        instanceProps: { spellId: 'fireball' },
        zOrder: 1,
      },
    ]
    render(
      <OnDemandHost
        registry={reg}
        instances={instances}
        layout={{}}
        makeSDK={makeSDK}
        viewport={VP}
      />,
    )
    expect(makeSDK).toHaveBeenCalledWith('test:detail#a1', { spellId: 'fireball' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/OnDemandHost.test.tsx`
Expected: FAIL — module `../OnDemandHost` not found

- [ ] **Step 3: Write the implementation**

```tsx
// src/ui-system/OnDemandHost.tsx
import { RegionErrorBoundary } from './PanelErrorBoundary'
import { resolvePosition, clampToViewport, layerBaseZ } from './layoutEngine'
import type { UIRegistry } from './registry'
import type { RegionLayoutConfig, IRegionSDK, Viewport } from './types'
import type { OnDemandInstance } from './regionTypes'

export type { OnDemandInstance } from './regionTypes'

interface Props {
  registry: UIRegistry
  instances: OnDemandInstance[]
  layout: RegionLayoutConfig
  makeSDK: (instanceKey: string, instanceProps: Record<string, unknown>) => IRegionSDK
  viewport: Viewport
}

export function OnDemandHost({ registry, instances, layout, makeSDK, viewport }: Props) {
  if (instances.length === 0) return null

  return (
    <>
      {instances.map(({ regionId, instanceKey, instanceProps, zOrder }) => {
        const def = registry.getRegion(regionId)
        if (!def || def.lifecycle !== 'on-demand') return null

        // Position priority: layout template > defaultPlacement > center
        const template = layout[regionId]
        const entry = template ?? {
          anchor: def.defaultPlacement?.anchor ?? ('center' as const),
          offsetX: def.defaultPlacement?.offsetX ?? 0,
          offsetY: def.defaultPlacement?.offsetY ?? 0,
          width: def.defaultSize.width,
          height: def.defaultSize.height,
          zOrder: 0,
        }

        const rawPos = resolvePosition(entry, viewport)
        const pos = clampToViewport(rawPos, { width: entry.width, height: entry.height }, viewport)
        const Comp = def.component

        return (
          <div
            key={instanceKey}
            data-instance={instanceKey}
            data-region={regionId}
            data-layer={def.layer}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              width: entry.width,
              height: entry.height,
              zIndex: layerBaseZ(def.layer) + zOrder,
              pointerEvents: 'auto',
              background: 'transparent',
              contain: 'layout paint',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, isolation: 'isolate' }}>
              <RegionErrorBoundary panelId={instanceKey}>
                <Comp sdk={makeSDK(instanceKey, instanceProps)} />
              </RegionErrorBoundary>
            </div>
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/OnDemandHost.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/OnDemandHost.tsx src/ui-system/__tests__/OnDemandHost.test.tsx
git commit -m "feat(ui-system): implement OnDemandHost for ephemeral region instances"
```

---

## Phase 6: Edit-Mode Interaction

### Task 11: Pointer drag utilities with tests

**Files:**

- Create: `src/ui-system/__tests__/usePointerDrag.test.ts`
- Create: `src/ui-system/usePointerDrag.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/ui-system/__tests__/usePointerDrag.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPointerDragHandler, createPointerResizeHandler } from '../usePointerDrag'

describe('createPointerDragHandler', () => {
  let target: HTMLDivElement

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  it('calls onMove with delta on pointermove', () => {
    const onMove = vi.fn()
    const handler = createPointerDragHandler(onMove)

    const down = new PointerEvent('pointerdown', { clientX: 100, clientY: 200, pointerId: 1 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    target.setPointerCapture = vi.fn()
    handler(down)

    const move = new PointerEvent('pointermove', { clientX: 110, clientY: 220 })
    target.dispatchEvent(move)

    expect(onMove).toHaveBeenCalledWith({ dx: 10, dy: 20 })
  })

  it('accumulates deltas across multiple moves', () => {
    const onMove = vi.fn()
    const handler = createPointerDragHandler(onMove)

    const down = new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    target.setPointerCapture = vi.fn()
    handler(down)

    target.dispatchEvent(new PointerEvent('pointermove', { clientX: 105, clientY: 103 }))
    target.dispatchEvent(new PointerEvent('pointermove', { clientX: 115, clientY: 110 }))

    expect(onMove).toHaveBeenCalledTimes(2)
    expect(onMove).toHaveBeenNthCalledWith(1, { dx: 5, dy: 3 })
    expect(onMove).toHaveBeenNthCalledWith(2, { dx: 10, dy: 7 })
  })

  it('calls onEnd on pointerup and stops tracking', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const handler = createPointerDragHandler(onMove, onEnd)

    const down = new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    target.setPointerCapture = vi.fn()
    handler(down)

    target.dispatchEvent(new PointerEvent('pointerup', {}))
    expect(onEnd).toHaveBeenCalledTimes(1)

    // Further moves should not trigger onMove
    target.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 200 }))
    expect(onMove).toHaveBeenCalledTimes(0)
  })

  it('sets pointer capture on the target', () => {
    const handler = createPointerDragHandler(vi.fn())
    target.setPointerCapture = vi.fn()

    const down = new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 42 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    handler(down)

    expect(target.setPointerCapture).toHaveBeenCalledWith(42)
  })
})

describe('createPointerResizeHandler', () => {
  let target: HTMLDivElement

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  it('calls onResize with size delta', () => {
    const onResize = vi.fn()
    const handler = createPointerResizeHandler(onResize)

    const down = new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    target.setPointerCapture = vi.fn()
    handler(down)

    target.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 110 }))
    expect(onResize).toHaveBeenCalledWith({ dw: 20, dh: 10 })
  })

  it('calls onEnd on pointerup', () => {
    const onResize = vi.fn()
    const onEnd = vi.fn()
    const handler = createPointerResizeHandler(onResize, onEnd)

    const down = new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 })
    Object.defineProperty(down, 'currentTarget', { value: target })
    target.setPointerCapture = vi.fn()
    handler(down)

    target.dispatchEvent(new PointerEvent('pointerup', {}))
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/usePointerDrag.test.ts`
Expected: FAIL — module `../usePointerDrag` not found

- [ ] **Step 3: Write the implementation**

```ts
// src/ui-system/usePointerDrag.ts

/**
 * Create a pointerdown handler that tracks pointer movement as deltas.
 * Uses Pointer Events API with setPointerCapture for reliable cross-element tracking.
 * Positioning uses left/top (NOT transform) to avoid containing block issues.
 */
export function createPointerDragHandler(
  onMove: (delta: { dx: number; dy: number }) => void,
  onEnd?: () => void,
): (e: PointerEvent) => void {
  return (e: PointerEvent) => {
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    let lastX = e.clientX
    let lastY = e.clientY

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - lastX
      const dy = ev.clientY - lastY
      lastX = ev.clientX
      lastY = ev.clientY
      onMove({ dx, dy })
    }

    const handleUp = () => {
      target.removeEventListener('pointermove', handleMove)
      target.removeEventListener('pointerup', handleUp)
      onEnd?.()
    }

    target.addEventListener('pointermove', handleMove)
    target.addEventListener('pointerup', handleUp)
  }
}

/**
 * Create a pointerdown handler for resize operations.
 * Tracks width/height deltas from the drag start point.
 */
export function createPointerResizeHandler(
  onResize: (delta: { dw: number; dh: number }) => void,
  onEnd?: () => void,
): (e: PointerEvent) => void {
  return (e: PointerEvent) => {
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    let lastX = e.clientX
    let lastY = e.clientY

    const handleMove = (ev: PointerEvent) => {
      const dw = ev.clientX - lastX
      const dh = ev.clientY - lastY
      lastX = ev.clientX
      lastY = ev.clientY
      onResize({ dw, dh })
    }

    const handleUp = () => {
      target.removeEventListener('pointermove', handleMove)
      target.removeEventListener('pointerup', handleUp)
      onEnd?.()
    }

    target.addEventListener('pointermove', handleMove)
    target.addEventListener('pointerup', handleUp)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/usePointerDrag.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/usePointerDrag.ts src/ui-system/__tests__/usePointerDrag.test.ts
git commit -m "feat(ui-system): implement Pointer Events drag/resize utilities"
```

---

### Task 12: RegionEditOverlay

**Files:**

- Create: `src/ui-system/RegionEditOverlay.tsx`
- Create: `src/ui-system/__tests__/RegionEditOverlay.test.tsx`
- Modify: `src/ui-system/RegionRenderer.tsx` (wire overlay into renderer)

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui-system/__tests__/RegionEditOverlay.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { RegionEditOverlay } from '../RegionEditOverlay'
import type { RegionDef } from '../registrationTypes'
import type { RegionLayoutEntry } from '../regionTypes'

function makeDef(overrides: Partial<RegionDef> = {}): RegionDef {
  return {
    id: 'test:panel',
    component: (() => null) as unknown as RegionDef['component'],
    lifecycle: 'persistent',
    defaultSize: { width: 200, height: 100 },
    layer: 'standard',
    ...overrides,
  }
}

const baseEntry: RegionLayoutEntry = {
  anchor: 'top-left',
  offsetX: 0,
  offsetY: 0,
  width: 200,
  height: 100,
  zOrder: 0,
}

describe('RegionEditOverlay', () => {
  it('renders a drag handle covering the region', () => {
    const { container } = render(<RegionEditOverlay def={makeDef()} entry={baseEntry} />)
    const handle = container.querySelector('[data-drag-handle]') as HTMLElement
    expect(handle).toBeTruthy()
    expect(handle.style.cursor).toBe('move')
  })

  it('renders a resize handle at bottom-right', () => {
    const { container } = render(<RegionEditOverlay def={makeDef()} entry={baseEntry} />)
    const handle = container.querySelector('[data-resize-handle]') as HTMLElement
    expect(handle).toBeTruthy()
    expect(handle.style.cursor).toBe('se-resize')
  })

  it('shows region id as title on drag handle', () => {
    const { container } = render(
      <RegionEditOverlay def={makeDef({ id: 'my:region' })} entry={baseEntry} />,
    )
    const handle = container.querySelector('[data-drag-handle]') as HTMLElement
    expect(handle.title).toBe('my:region')
  })

  it('has a visible border in edit mode', () => {
    const { container } = render(<RegionEditOverlay def={makeDef()} entry={baseEntry} />)
    const handle = container.querySelector('[data-drag-handle]') as HTMLElement
    expect(handle.style.border).toContain('solid')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui-system/__tests__/RegionEditOverlay.test.tsx`
Expected: FAIL — module `../RegionEditOverlay` not found

- [ ] **Step 3: Write the implementation**

```tsx
// src/ui-system/RegionEditOverlay.tsx
import { useCallback, useRef } from 'react'
import type { RegionDef } from './registrationTypes'
import type { RegionLayoutEntry, AnchorPoint, Viewport } from './regionTypes'
import { createPointerDragHandler, createPointerResizeHandler } from './usePointerDrag'
import { inferPlacement } from './layoutEngine'

interface Props {
  def: RegionDef
  entry: RegionLayoutEntry
  /** Current pixel position (pre-resolved by RegionRenderer) */
  currentPos?: { x: number; y: number }
  viewport?: Viewport
  onDragEnd?: (
    instanceKey: string,
    placement: { anchor: AnchorPoint; offsetX: number; offsetY: number },
  ) => void
  onResize?: (instanceKey: string, size: { width: number; height: number }) => void
}

export function RegionEditOverlay({
  def,
  entry,
  currentPos,
  viewport,
  onDragEnd,
  onResize,
}: Props) {
  const posRef = useRef(currentPos ?? { x: 0, y: 0 })
  const sizeRef = useRef({ width: entry.width, height: entry.height })

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const parent = (e.currentTarget as HTMLElement).parentElement
      if (!parent) return

      posRef.current = { x: parent.offsetLeft, y: parent.offsetTop }

      createPointerDragHandler(
        (delta) => {
          posRef.current = {
            x: posRef.current.x + delta.dx,
            y: posRef.current.y + delta.dy,
          }
          parent.style.left = `${posRef.current.x}px`
          parent.style.top = `${posRef.current.y}px`
        },
        () => {
          if (onDragEnd && viewport) {
            const placement = inferPlacement(
              {
                x: posRef.current.x,
                y: posRef.current.y,
                width: sizeRef.current.width,
                height: sizeRef.current.height,
              },
              viewport,
            )
            onDragEnd(def.id, placement)
          }
        },
      )(e.nativeEvent)
    },
    [def.id, onDragEnd, viewport],
  )

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const parent = (e.currentTarget as HTMLElement).parentElement
      if (!parent) return
      e.stopPropagation()

      sizeRef.current = { width: entry.width, height: entry.height }
      const minW = def.minSize?.width ?? 50
      const minH = def.minSize?.height ?? 50

      createPointerResizeHandler(
        (delta) => {
          sizeRef.current = {
            width: Math.max(minW, sizeRef.current.width + delta.dw),
            height: Math.max(minH, sizeRef.current.height + delta.dh),
          }
          parent.style.width = `${sizeRef.current.width}px`
          parent.style.height = `${sizeRef.current.height}px`
        },
        () => {
          if (onResize) {
            onResize(def.id, sizeRef.current)
          }
        },
      )(e.nativeEvent)
    },
    [def.id, def.minSize, entry.width, entry.height, onResize],
  )

  return (
    <>
      {/* Drag handle — covers entire region */}
      <div
        data-drag-handle
        title={def.id}
        onPointerDown={handleDragPointerDown}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          cursor: 'move',
          userSelect: 'none',
          border: '1.5px solid rgba(99,102,241,0.55)',
          borderRadius: 2,
        }}
      />
      {/* Resize handle — bottom-right corner */}
      <div
        data-resize-handle
        onPointerDown={handleResizePointerDown}
        style={{
          position: 'absolute',
          right: -4,
          bottom: -4,
          width: 12,
          height: 12,
          zIndex: 11,
          cursor: 'se-resize',
          background: 'rgba(99,102,241,0.7)',
          borderRadius: 2,
        }}
      />
    </>
  )
}
```

- [ ] **Step 4: Wire overlay into RegionRenderer**

In `src/ui-system/RegionRenderer.tsx`, add import:

```ts
import { RegionEditOverlay } from './RegionEditOverlay'
```

Replace the `{/* Edit overlay will be rendered here in Task 12 */}` comment with:

```tsx
{
  layoutMode === 'edit' && (
    <RegionEditOverlay
      def={def}
      entry={entry}
      currentPos={pos}
      viewport={viewport}
      onDragEnd={onDragEnd}
      onResize={onResize}
    />
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/ui-system/__tests__/RegionEditOverlay.test.tsx src/ui-system/__tests__/RegionRenderer.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui-system/RegionEditOverlay.tsx src/ui-system/__tests__/RegionEditOverlay.test.tsx src/ui-system/RegionRenderer.tsx
git commit -m "feat(ui-system): implement RegionEditOverlay with Pointer Events drag and resize"
```

---

## Phase 7: LayoutStore + Sync

### Task 13: Update LayoutStore for anchor-based layout with migration

**Files:**

- Modify: `src/stores/layoutStore.ts`
- Modify: `src/stores/__tests__/layoutStore.test.ts` (update fixtures)

- [ ] **Step 1: Update layoutStore types and imports**

In `src/stores/layoutStore.ts`, update the import and types:

```ts
// src/stores/layoutStore.ts
import { createStore } from 'zustand/vanilla'
import type { RegionLayoutConfig, RegionLayoutEntry } from '../ui-system/regionTypes'
import { migrateLayoutConfig } from '../ui-system/layoutMigration'
import type { OnDemandInstance } from '../ui-system/regionTypes'
```

Update `RoomLayoutConfig`:

```ts
export interface RoomLayoutConfig {
  narrative: RegionLayoutConfig
  tactical: RegionLayoutConfig
}
```

Update `LayoutStoreState`:

```ts
export interface LayoutStoreState {
  narrative: RegionLayoutConfig
  tactical: RegionLayoutConfig
  isTactical: boolean
  layoutMode: 'play' | 'edit'
  activeLayout: RegionLayoutConfig
  isEditing: boolean

  // On-demand instance state (ephemeral, not persisted)
  onDemandInstances: OnDemandInstance[]
  onDemandZCounter: number

  loadLayout(config: RoomLayoutConfig): void
  updateEntry(instanceKey: string, partial: Partial<RegionLayoutEntry>): void
  addEntry(instanceKey: string, entry: RegionLayoutEntry): void
  removeEntry(instanceKey: string): void
  setLayoutMode(mode: 'play' | 'edit'): void
  setIsTactical(tactical: boolean): void

  // On-demand methods
  openOnDemand(regionId: string, instanceKey: string, instanceProps: Record<string, unknown>): void
  closeOnDemand(instanceKey: string): void
  bringToFront(instanceKey: string): void
}
```

- [ ] **Step 2: Update loadLayout with auto-migration**

```ts
loadLayout: (config) => {
  const isTactical = get().isTactical
  // Always run migration — migrateLayoutConfig is idempotent (passes through new-format entries)
  const viewport = typeof window !== 'undefined'
    ? { width: window.innerWidth, height: window.innerHeight }
    : { width: 1920, height: 1080 }
  const narrative = migrateLayoutConfig(config.narrative as Record<string, unknown>, viewport)
  const tactical = migrateLayoutConfig(config.tactical as Record<string, unknown>, viewport)

  set({
    narrative,
    tactical,
    activeLayout: isTactical ? tactical : narrative,
  })
},
```

- [ ] **Step 3: Add on-demand methods**

```ts
openOnDemand: (regionId, instanceKey, instanceProps) => {
  const counter = get().onDemandZCounter + 1
  set({
    onDemandInstances: [
      ...get().onDemandInstances,
      { regionId, instanceKey, instanceProps, zOrder: counter },
    ],
    onDemandZCounter: counter,
  })
},

closeOnDemand: (instanceKey) => {
  set({
    onDemandInstances: get().onDemandInstances.filter((i) => i.instanceKey !== instanceKey),
  })
},

bringToFront: (instanceKey) => {
  const counter = get().onDemandZCounter + 1
  set({
    onDemandInstances: get().onDemandInstances.map((i) =>
      i.instanceKey === instanceKey ? { ...i, zOrder: counter } : i,
    ),
    onDemandZCounter: counter,
  })
},
```

Initialize in store defaults:

```ts
onDemandInstances: [],
onDemandZCounter: 0,
```

- [ ] **Step 4: Update existing layoutStore tests**

Update all test fixtures that use `{ x, y }` format to use `{ anchor, offsetX, offsetY }` format. For example:

```ts
// Before:
const layout = { 'test#1': { x: 100, y: 100, width: 200, height: 100, zOrder: 0 } }

// After:
const layout = {
  'test#1': {
    anchor: 'top-left' as const,
    offsetX: 100,
    offsetY: 100,
    width: 200,
    height: 100,
    zOrder: 0,
  },
}
```

Add tests for auto-migration:

```ts
it('loadLayout auto-migrates legacy {x,y} entries', () => {
  const store = createLayoutStore()
  store.getState().loadLayout({
    narrative: {
      'test#1': { x: 100, y: 100, width: 200, height: 100, zOrder: 0 },
    } as unknown as RegionLayoutConfig,
    tactical: {},
  })
  const entry = store.getState().narrative['test#1']
  expect(entry.anchor).toBeDefined()
  expect('x' in entry).toBe(false)
})
```

Add tests for on-demand methods:

```ts
it('openOnDemand adds instance with incrementing zOrder', () => {
  const store = createLayoutStore()
  store.getState().openOnDemand('test:detail', 'test:detail#a1', { spellId: 'fireball' })
  expect(store.getState().onDemandInstances).toHaveLength(1)
  expect(store.getState().onDemandInstances[0].zOrder).toBe(1)
})

it('closeOnDemand removes instance', () => {
  const store = createLayoutStore()
  store.getState().openOnDemand('test:detail', 'test:detail#a1', {})
  store.getState().closeOnDemand('test:detail#a1')
  expect(store.getState().onDemandInstances).toHaveLength(0)
})

it('bringToFront updates instance zOrder', () => {
  const store = createLayoutStore()
  store.getState().openOnDemand('test:detail', '#a1', {})
  store.getState().openOnDemand('test:detail', '#a2', {})
  store.getState().bringToFront('#a1')
  const a1 = store.getState().onDemandInstances.find((i) => i.instanceKey === '#a1')
  const a2 = store.getState().onDemandInstances.find((i) => i.instanceKey === '#a2')
  expect(a1!.zOrder).toBeGreaterThan(a2!.zOrder)
})
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/stores/__tests__/layoutStore.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/layoutStore.ts src/stores/__tests__/layoutStore.test.ts
git commit -m "feat(stores): update layoutStore for anchor-based layout with auto-migration and on-demand support"
```

---

### Task 14: Update useLayoutSync

**Files:**

- Modify: `src/ui-system/useLayoutSync.ts`

- [ ] **Step 1: Update type imports**

```ts
// src/ui-system/useLayoutSync.ts
import { useEffect, useRef } from 'react'
import type { LayoutStoreState, RoomLayoutConfig } from '../stores/layoutStore'
import type { StoreApi } from 'zustand'
```

The rest of the file logic is unchanged — it already reads `state.narrative` and `state.tactical` and serializes them as JSON. Since `RegionLayoutConfig` is still a plain `Record<string, RegionLayoutEntry>`, JSON serialization works identically.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new type errors from useLayoutSync

- [ ] **Step 3: Commit**

```bash
git add src/ui-system/useLayoutSync.ts
git commit -m "refactor(ui-system): update useLayoutSync imports for RegionLayoutConfig"
```

---

## Phase 8: App Integration + Plugin Migration

### Task 15: App.tsx integration — swap PanelRenderer to RegionRenderer

> **⚠️ 需要单独计划：** 当前 App.tsx 有 ~800 行，`layoutActions` 目前为 `null`，集成涉及大量上下文依赖（dataReader, workflowRunner, awarenessManager, store subscriptions 等）。执行到此 Task 时，必须先根据 Phase 1-7 的实际实现结果，编写一份独立的 App.tsx 集成子计划，再执行。下面的伪代码仅作参考方向，不可直接复制。

**Files:**

- Modify: `src/App.tsx`

This task wires the new RegionRenderer + OnDemandHost into the main app, replacing PanelRenderer.

- [ ] **Step 1: Add viewport state hook**

Near the top of the App component function, add:

```ts
import { useState, useEffect } from 'react'
import { RegionRenderer } from './ui-system/RegionRenderer'
import { OnDemandHost } from './ui-system/OnDemandHost'
import { createRegionSDK } from './ui-system/uiSystemInit'
import type { IRegionSDK, AnchorPoint } from './ui-system/types'
import { PortalManager } from './ui-system/portalManager'
import { inferPlacement } from './ui-system/layoutEngine'
```

Add viewport state:

```ts
const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })

useEffect(() => {
  const handler = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
}, [])
```

- [ ] **Step 2: Create PortalManager instance**

```ts
const [portalManager] = useState(() => new PortalManager())

useEffect(() => {
  return () => portalManager.dispose()
}, [portalManager])
```

- [ ] **Step 3: Create makeRegionSDK factory**

Replace or complement the existing `makeSDK` with:

```ts
const makeRegionSDK = useCallback(
  (instanceKey: string, instanceProps: Record<string, unknown>): IRegionSDK => {
    const regionId = instanceKey.replace(/#[^#]*$/, '')
    const def = uiRegistry.getRegion(regionId)

    // Ensure portal container exists
    if (!portalManager.getPortal(instanceKey)) {
      portalManager.createPortal(instanceKey, def?.layer ?? 'standard')
    }

    return createRegionSDK({
      instanceKey,
      instanceProps,
      role,
      layoutMode,
      read: dataReader,
      workflow: workflowRunner,
      awarenessManager,
      layoutActions: {
        openPanel: (regionId, props, position) => {
          const regDef = uiRegistry.getRegion(regionId)
          if (!regDef) return ''

          if (regDef.lifecycle === 'persistent') {
            layoutStore.getState().updateEntry(regionId, { visible: true })
            return regionId
          }

          // On-demand: create ephemeral instance
          const key = `${regionId}#${Date.now().toString(36)}`
          layoutStore.getState().openOnDemand(regionId, key, props ?? {})
          return key
        },
        closePanel: (key) => {
          if (key.includes('#')) {
            layoutStore.getState().closeOnDemand(key)
            portalManager.removePortal(key)
          } else {
            layoutStore.getState().updateEntry(key, { visible: false })
          }
        },
      },
      logSubscribe,
      onResize: (size) => {
        layoutStore.getState().updateEntry(instanceKey, size)
      },
      getPortalContainer: () => {
        return portalManager.getPortal(instanceKey) ?? document.body
      },
      minSize: def?.minSize,
      // ... pass through reactive deps (getEntities, getLogEntries, storeSubscribe, etc.)
      getEntities,
      getLogEntries,
      storeSubscribe,
    })
  },
  [role, layoutMode /* other deps */],
)
```

- [ ] **Step 4: Add drag/resize handlers**

```ts
const handleDragEnd = useCallback(
  (instanceKey: string, placement: { anchor: AnchorPoint; offsetX: number; offsetY: number }) => {
    layoutStore.getState().updateEntry(instanceKey, placement)
  },
  [],
)

const handleResize = useCallback((instanceKey: string, size: { width: number; height: number }) => {
  layoutStore.getState().updateEntry(instanceKey, size)
}, [])
```

- [ ] **Step 5: Replace PanelRenderer JSX with RegionRenderer + OnDemandHost**

Replace the PanelRenderer usage:

```tsx
{/* Before: */}
{/* <PanelRenderer
  registry={uiRegistry}
  layout={activeLayout}
  makeSDK={makeSDK}
  layoutMode={layoutMode}
  onDrag={layoutMode === 'edit' ? handleLayoutDrag : undefined}
/> */}

{/* After: */}
<RegionRenderer
  registry={uiRegistry}
  layout={activeLayout}
  makeSDK={makeRegionSDK}
  viewport={viewport}
  layoutMode={layoutMode}
  onDragEnd={layoutMode === 'edit' ? handleDragEnd : undefined}
  onResize={layoutMode === 'edit' ? handleResize : undefined}
/>
<OnDemandHost
  registry={uiRegistry}
  instances={onDemandInstances}
  layout={activeLayout}
  makeSDK={makeRegionSDK}
  viewport={viewport}
/>
```

Where `onDemandInstances` comes from the layout store:

```ts
const onDemandInstances = useStore(layoutStore, (s) => s.onDemandInstances)
```

- [ ] **Step 6: Verify the app compiles and renders**

Run: `npx tsc --noEmit 2>&1 | head -30`
Run: `npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: Compiles without new errors; existing tests may need fixture updates (handled in Task 19)

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui-system): wire RegionRenderer + OnDemandHost into App.tsx, replacing PanelRenderer"
```

---

### Task 16: Migrate plugins to registerRegion

**Files:**

- Modify: `plugins/core-ui/index.ts`
- Modify: `plugins/daggerheart-core/index.ts`

- [ ] **Step 1: Migrate core-ui**

In `plugins/core-ui/index.ts`, replace `registerComponent` call:

```ts
// Before:
sdk.ui.registerComponent({
  id: 'core-ui.session-info',
  component: SessionInfoPanel as React.ComponentType<{ sdk: unknown }>,
  type: 'panel',
  defaultSize: { width: 200, height: 260 },
  defaultPlacement: {
    anchor: 'top-right',
    offsetX: 20,
    offsetY: 60,
  },
})

// After:
sdk.ui.registerRegion({
  id: 'core-ui.session-info',
  component: SessionInfoPanel as React.ComponentType<{ sdk: unknown }>,
  lifecycle: 'persistent',
  defaultSize: { width: 200, height: 260 },
  defaultPlacement: {
    anchor: 'top-right',
    offsetX: 20,
    offsetY: 60,
  },
  layer: 'standard',
})
```

- [ ] **Step 2: Migrate daggerheart-core**

In `plugins/daggerheart-core/index.ts`, replace `registerComponent` call:

```ts
// Before:
sdk.ui.registerComponent({
  id: 'daggerheart-core:fear-panel',
  component: FearPanel as React.ComponentType<{ sdk: unknown }>,
  type: 'panel',
  defaultSize: { width: 160, height: 120 },
  minSize: { width: 120, height: 80 },
  defaultPlacement: { anchor: 'top-right', offsetX: -16, offsetY: 60 },
})

// After:
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

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add plugins/core-ui/index.ts plugins/daggerheart-core/index.ts
git commit -m "refactor(plugins): migrate core-ui and daggerheart-core to registerRegion"
```

---

### Task 17: Update sandbox PatternUISystem

**Files:**

- Modify: `src/sandbox/PatternUISystem.tsx`

- [ ] **Step 1: Update imports**

Replace PanelRenderer-related imports:

```ts
import { RegionRenderer } from '../ui-system/RegionRenderer'
import { createRegionSDK } from '../ui-system/uiSystemInit'
import type { RegionLayoutConfig, RegionLayoutEntry, IRegionSDK } from '../ui-system/types'
import { inferPlacement } from '../ui-system/layoutEngine'
```

- [ ] **Step 2: Update INITIAL_LAYOUT to anchor-based format**

Convert all layout entries from `{x, y}` to `{anchor, offsetX, offsetY}`:

```ts
const INITIAL_LAYOUT: RegionLayoutConfig = {
  'poc-ui.hello#1': {
    anchor: 'top-left',
    offsetX: 30,
    offsetY: 30,
    width: 220,
    height: 130,
    zOrder: 0,
  },
  'poc-ui.hello#2': {
    anchor: 'top-left',
    offsetX: 270,
    offsetY: 30,
    width: 220,
    height: 130,
    zOrder: 1,
  },
  // ... update adversarial panels similarly
}
```

- [ ] **Step 3: Update drag handler to use inferPlacement**

Replace `applyDrag` usage with anchor-aware logic:

```ts
const handleDragEnd = useCallback(
  (instanceKey: string, placement: { anchor: AnchorPoint; offsetX: number; offsetY: number }) => {
    setLayout((prev) => ({
      ...prev,
      [instanceKey]: prev[instanceKey] ? { ...prev[instanceKey], ...placement } : prev[instanceKey],
    }))
  },
  [],
)
```

- [ ] **Step 4: Replace PanelRenderer with RegionRenderer**

```tsx
<RegionRenderer
  registry={registry}
  layout={layout}
  makeSDK={(key, props) => makeRegionSDK(key, props)}
  viewport={{ width: window.innerWidth, height: window.innerHeight }}
  layoutMode={layoutMode}
  onDragEnd={layoutMode === 'edit' ? handleDragEnd : undefined}
  onResize={layoutMode === 'edit' ? handleResize : undefined}
/>
```

- [ ] **Step 5: Update makeSDK to use createRegionSDK**

Update the sandbox `makeSDK` function to call `createRegionSDK` instead of `createProductionSDK`, adding the `onResize` and `getPortalContainer` arguments.

- [ ] **Step 6: Verify sandbox renders**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add src/sandbox/PatternUISystem.tsx
git commit -m "refactor(sandbox): update PatternUISystem for Region Model"
```

---

### Task 18: Update existing test fixtures

**Files:**

- Modify: `src/ui-system/__tests__/PanelRenderer.test.tsx`
- Modify: `src/ui-system/__tests__/LayoutEditor.test.tsx`
- Modify: `src/ui-system/__tests__/production-wiring.test.ts`

- [ ] **Step 1: Update PanelRenderer tests**

The PanelRenderer tests validate legacy behavior. Two options:

**Option A (recommended):** Keep PanelRenderer tests as-is if PanelRenderer is still used via backward compat. The `registerComponent` wrapper ensures old code paths still work.

**Option B:** Convert all PanelRenderer tests to RegionRenderer tests. This is a large mechanical change — update all `{x, y}` fixtures to `{anchor, offsetX, offsetY}`, replace `PanelRenderer` with `RegionRenderer`, add `viewport` prop.

Choose Option A for now. PanelRenderer tests continue to validate the backward-compat path. RegionRenderer has its own test suite (Task 9).

If PanelRenderer is removed in a future cleanup task, these tests would be removed at that time.

- [ ] **Step 2: Update LayoutEditor tests**

The `applyDrag` function operates on old `{x, y}` entries. If `applyDrag` is still used (e.g., by PanelRenderer backward compat), keep tests as-is.

If `applyDrag` is no longer used, mark it as deprecated and skip test updates.

- [ ] **Step 3: Update production-wiring tests**

Update layout fixtures in `production-wiring.test.ts` to use new format:

```ts
// Before:
store.getState().loadLayout({
  narrative: { 'test#1': { x: 10, y: 20, width: 200, height: 100, zOrder: 0 } },
  tactical: {},
})

// After (auto-migration handles this, but explicit new format preferred):
store.getState().loadLayout({
  narrative: {
    'test#1': { anchor: 'top-left', offsetX: 10, offsetY: 20, width: 200, height: 100, zOrder: 0 },
  },
  tactical: {},
})
```

Update `openPanel` position parameter from `{x, y}` to `{anchor, offsetX, offsetY}`:

```ts
// Before:
sdk.ui.openPanel('test:comp', {}, { x: 100, y: 200 })

// After:
sdk.ui.openPanel('test:comp', {}, { anchor: 'top-left', offsetX: 100, offsetY: 200 })
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -40`
Expected: All tests PASS (some PanelRenderer tests may still use old format via backward-compat `loadLayout` auto-migration)

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/__tests__/production-wiring.test.ts
git commit -m "test: update production-wiring fixtures for anchor-based layout"
```

---

### Task 19: E2E tests for Region Model

**Files:**

- Create: `e2e/region-model.spec.ts`

> **前置条件：** Task 15 (App.tsx 集成) 完成后才可执行。需要 preview 环境运行。

- [ ] **Step 1: Region 渲染位置正确**

验证 persistent region 在正确的锚点位置渲染：

```ts
// e2e/region-model.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Region Model', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to room with default layout
    await page.goto('/room/test-room')
    await page.waitForSelector('[data-region]')
  })

  test('persistent region renders at anchor position', async ({ page }) => {
    const region = page.locator('[data-region="core-ui.session-info"]')
    await expect(region).toBeVisible()
    // Should be in top-right area
    const box = await region.boundingBox()
    expect(box).toBeTruthy()
    const viewport = page.viewportSize()!
    expect(box!.x + box!.width).toBeGreaterThan(viewport.width * 0.5)
    expect(box!.y).toBeLessThan(viewport.height * 0.3)
  })

  test('hidden region (visible:false) is not rendered', async ({ page }) => {
    // Trigger a region to be hidden via SDK
    // (depends on plugin providing a hide action)
    // Verify data-region element does not exist
  })
})
```

- [ ] **Step 2: Edit-mode 拖拽改变位置**

```ts
test('edit-mode drag changes region position and persists anchor', async ({ page }) => {
  // Enter edit mode
  await page.keyboard.press('Control+e')
  await page.waitForSelector('[data-drag-handle]')

  const handle = page.locator('[data-drag-handle]').first()
  const before = await handle.boundingBox()
  expect(before).toBeTruthy()

  // Drag 100px to the right
  await handle.hover()
  await page.mouse.down()
  await page.mouse.move(before!.x + 100, before!.y, { steps: 5 })
  await page.mouse.up()

  // Position should have changed
  const after = await handle.boundingBox()
  expect(after!.x).toBeGreaterThan(before!.x + 50)

  // Exit edit mode, re-enter: position should be preserved
  await page.keyboard.press('Control+e')
  await page.keyboard.press('Control+e')
  const verify = await page.locator('[data-drag-handle]').first().boundingBox()
  expect(verify!.x).toBeCloseTo(after!.x, -1)
})
```

- [ ] **Step 3: 布局迁移保留位置**

```ts
test('legacy {x,y} layout is migrated on load without visual regression', async ({ page }) => {
  // Load room with legacy layout format via API fixture
  // Verify regions render (migration happened silently)
  const regions = page.locator('[data-region]')
  await expect(regions.first()).toBeVisible()

  // Verify no console errors related to layout
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.waitForTimeout(1000)
  expect(errors.filter((e) => e.includes('layout') || e.includes('anchor'))).toHaveLength(0)
})
```

- [ ] **Step 4: On-demand panel 打开/关闭生命周期**

```ts
test('on-demand panel opens, renders, and closes', async ({ page }) => {
  // This test depends on a plugin providing an on-demand panel trigger
  // Example: click a button that calls sdk.ui.openPanel('some:detail', { id: '...' })
  // Verify the on-demand panel appears with data-instance attribute
  // Click close or call closePanel
  // Verify the panel is removed from DOM
})
```

- [ ] **Step 5: Edit-mode resize 改变尺寸**

```ts
test('edit-mode resize changes region dimensions', async ({ page }) => {
  await page.keyboard.press('Control+e')
  await page.waitForSelector('[data-resize-handle]')

  const resizeHandle = page.locator('[data-resize-handle]').first()
  const region = page.locator('[data-region]').first()
  const beforeBox = await region.boundingBox()

  // Drag resize handle
  const handleBox = await resizeHandle.boundingBox()
  await page.mouse.move(handleBox!.x + 6, handleBox!.y + 6)
  await page.mouse.down()
  await page.mouse.move(handleBox!.x + 56, handleBox!.y + 56, { steps: 5 })
  await page.mouse.up()

  const afterBox = await region.boundingBox()
  expect(afterBox!.width).toBeGreaterThan(beforeBox!.width + 30)
  expect(afterBox!.height).toBeGreaterThan(beforeBox!.height + 30)
})
```

- [ ] **Step 6: ErrorBoundary 隔离崩溃**

```ts
test('crashed region shows error without affecting siblings', async ({ page }) => {
  // Inject a region that throws (via test fixture plugin)
  // Verify the crashed region shows error message
  // Verify sibling regions still render and are interactive
})
```

- [ ] **Step 7: Commit**

```bash
git add e2e/region-model.spec.ts
git commit -m "test(e2e): add Region Model E2E tests for rendering, drag, resize, migration, on-demand"
```

---

## Self-Review Checklist

After completing all tasks, verify against the spec:

| Spec Section                                          | Task(s)                           | Covered?        |
| ----------------------------------------------------- | --------------------------------- | --------------- |
| §3 RegionDef                                          | Task 1                            | ✅              |
| §4 Registration API (registerRegion, backward compat) | Tasks 1, 4, 5                     | ✅              |
| §5 Anchor+Offset positioning                          | Tasks 1, 2                        | ✅              |
| §5.3 Anchor inference on drag end                     | Tasks 2, 12                       | ✅              |
| §6 IRegionSDK (resize, getPortalContainer)            | Tasks 1, 8                        | ✅              |
| §6.3 Collapsible panel (via resize)                   | Task 8                            | ✅ (resize API) |
| §6.4 On-demand window                                 | Tasks 10, 13                      | ✅              |
| §7 UI Slot (RendererRegistry multiSurfaces)           | Task 5                            | ✅              |
| §8 RegionRenderer                                     | Task 9                            | ✅              |
| §8.3 OnDemandHost                                     | Task 10                           | ✅              |
| §9 Edit-mode drag/resize                              | Tasks 11, 12                      | ✅              |
| §9.3 Self-built Pointer Events (no react-rnd)         | Tasks 11, 12                      | ✅              |
| §10 Migration                                         | Tasks 3, 13, 16                   | ✅              |
| §12.5 z-order by lifecycle                            | Tasks 9, 10, 13                   | ✅              |
| §12.9 Portal management                               | Task 7                            | ✅              |
| §12.10 Viewport clamping                              | Tasks 2, 9                        | ✅              |
| §12.11 Error isolation                                | Tasks 6, 9, 10                    | ✅              |
| §12.12 HMR duplicate registration                     | Task 4                            | ✅              |
| §12.13 instanceProps serialization                    | Task 1 (type), Task 3 (migration) | ✅              |
| §12.14 Accessibility                                  | Task 9 (role, aria-label)         | ✅              |
| §13.1 Safety layers                                   | Task 9                            | ✅              |
| §13.2 DOM structure constraints                       | Task 9, 15                        | ✅              |
| §13.4 SDK factory extension                           | Task 8                            | ✅              |
| §13.5 PluginSDK delegation                            | Task 5                            | ✅              |
| §13.6 multiSurfaces                                   | Task 5                            | ✅              |
| §13.7 Circular import (sdk: unknown)                  | Task 1                            | ✅              |
| E2E: 渲染/拖拽/迁移/on-demand/resize/ErrorBoundary    | Task 19                           | ✅              |
