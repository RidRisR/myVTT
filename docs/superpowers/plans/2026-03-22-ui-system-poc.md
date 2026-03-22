# UI System POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a POC validating the plugin UI system — component registration, Layer rendering, IComponentSDK injection, and (Phase 2) a draggable layout editor — all rendered in the sandbox page.

**Architecture:** Two phases: Phase 1 validates the mechanism (can plugins register components? does SDK injection work? does ErrorBoundary isolate crashes?). Phase 2 adds a visual drag-to-position layout editor. A `UIRegistry` singleton stores component/layer definitions; `PluginSDK` gains a `ui` namespace backed by the registry; `PanelRenderer` reads the registry + a `LayoutConfig` object to render panels; `LayerRenderer` stacks layers by zLayer. A `poc-ui` plugin in `plugins/poc-ui/` registers test components and a vignette layer. The sandbox page wires everything together with mock SDK data (no live room required).

**Tech Stack:** React, TypeScript, Vitest, existing worldStore/workflow infrastructure, CSS for vignette layer, native DOM mouse events for drag (no DnD library).

---

## File Map

### New files

| File                                   | Responsibility                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui-system/registrationTypes.ts`   | Registration-time types with no workflow imports: ComponentDef, LayerDef, ZLayer, IUIRegistrationSDK — safe to import from workflow/types.ts        |
| `src/ui-system/types.ts`               | Runtime types: LayoutConfig, IComponentSDK, IDataSDK, ComponentContext, ComponentProps, LayerProps — imports IWorkflowRunner from workflow/types.ts |
| `src/ui-system/registry.ts`            | UIRegistry class — stores component and layer definitions, throws on duplicate ID                                                                   |
| `src/ui-system/PanelErrorBoundary.tsx` | React ErrorBoundary wrapping each panel instance                                                                                                    |
| `src/ui-system/PanelRenderer.tsx`      | Reads LayoutConfig + UIRegistry, renders panels with injected IComponentSDK                                                                         |
| `src/ui-system/LayerRenderer.tsx`      | Renders registered layers in ZLayer order                                                                                                           |
| `src/ui-system/LayoutEditor.tsx`       | (Phase 2) Edit mode overlay — drag chrome, play/edit toggle                                                                                         |
| `plugins/poc-ui/HelloPanel.tsx`        | Test panel component — shows entity list from sdk.data                                                                                              |
| `plugins/poc-ui/VignetteLayer.tsx`     | CSS vignette layer (above-canvas)                                                                                                                   |
| `plugins/poc-ui/index.ts`              | VTTPlugin that registers HelloPanel + VignetteLayer                                                                                                 |
| `src/sandbox/PatternUISystem.tsx`      | Sandbox demo page — bootstraps poc-ui plugin + renders panels + layers                                                                              |

### Modified files

| File                             | Change                                                       |
| -------------------------------- | ------------------------------------------------------------ |
| `src/workflow/types.ts`          | Add `ui: IUIRegistrationSDK` to `IPluginSDK` interface       |
| `src/workflow/pluginSDK.ts`      | Extend `PluginSDK` to accept `UIRegistry`, expose as `ui`    |
| `src/workflow/useWorkflowSDK.ts` | Pass `UIRegistry` singleton to `PluginSDK` during activation |
| `src/sandbox/index.tsx`          | Add `PatternUISystem` entry to PATTERNS array                |

---

## Phase 1 — Mechanism Validation

### Task 1: Core UI System Types

Types are split into **two files** to avoid a circular dependency:

- `registrationTypes.ts` — types used at plugin registration time; no imports from `workflow/`. This is imported by `workflow/types.ts` (to add `ui` to `IPluginSDK`) without creating a cycle.
- `types.ts` — runtime types used by components; imports `IWorkflowRunner` from `workflow/types.ts`.

**Files:**

- Create: `src/ui-system/registrationTypes.ts`
- Create: `src/ui-system/types.ts`

- [ ] **Step 1: Write registrationTypes.ts (no workflow imports)**

```ts
// src/ui-system/registrationTypes.ts
// No imports from workflow/ — this file is imported by workflow/types.ts
import type React from 'react'

export type ZLayer = 'below-canvas' | 'above-canvas' | 'above-ui'

export interface ComponentDef {
  id: string
  component: React.ComponentType<{ sdk: unknown }>
  defaultSize: { width: number; height: number }
  minSize?: { width: number; height: number }
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

- [ ] **Step 2: Write types.ts (runtime types, imports IWorkflowRunner)**

```ts
// src/ui-system/types.ts
import type React from 'react'
import type { Entity } from '../shared/entityTypes'
import type { IWorkflowRunner } from '../workflow/types'
export type { ZLayer, ComponentDef, LayerDef, IUIRegistrationSDK } from './registrationTypes'

export interface LayoutEntry {
  x: number
  y: number
  width: number
  height: number
  visible?: boolean
  instanceProps?: Record<string, unknown>
}

// key format: "<componentId>#<instance>" e.g. "poc-ui.hello#1"
export type LayoutConfig = Record<string, LayoutEntry>

export interface ComponentContext {
  instanceProps: Record<string, unknown>
  role: 'GM' | 'Player'
  layoutMode: 'play' | 'edit'
}

export interface IDataSDK {
  entity(id: string): Entity | undefined
  entities(): Entity[]
}

export interface IComponentSDK {
  data: IDataSDK
  workflow: IWorkflowRunner
  context: ComponentContext
}

export interface ComponentProps {
  sdk: IComponentSDK
}

export interface LayerProps {
  layoutMode: 'play' | 'edit'
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors in `src/ui-system/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/ui-system/registrationTypes.ts src/ui-system/types.ts
git commit -m "feat(ui-system): add core type definitions"
```

---

### Task 2: UIRegistry + IPluginSDK Extension

**Files:**

- Create: `src/ui-system/registry.ts`
- Create: `src/ui-system/__tests__/registry.test.ts`
- Modify: `src/workflow/types.ts` (add `ui` to `IPluginSDK`)
- Modify: `src/workflow/pluginSDK.ts` (implement `ui` on `PluginSDK`)

- [ ] **Step 1: Write the failing tests**

```ts
// src/ui-system/__tests__/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { UIRegistry } from '../registry'
import type { ComponentDef, LayerDef } from '../types'

const mockComponent = () => null
const mockLayer = () => null

const componentDef: ComponentDef = {
  id: 'test.hello',
  component: mockComponent as never,
  defaultSize: { width: 200, height: 100 },
}

const layerDef: LayerDef = {
  id: 'test.vignette',
  zLayer: 'above-canvas',
  component: mockLayer as never,
}

describe('UIRegistry', () => {
  let registry: UIRegistry

  beforeEach(() => {
    registry = new UIRegistry()
  })

  it('stores and retrieves a registered component', () => {
    registry.registerComponent(componentDef)
    expect(registry.getComponent('test.hello')).toBe(componentDef)
  })

  it('returns undefined for unknown component id', () => {
    expect(registry.getComponent('unknown')).toBeUndefined()
  })

  it('throws on duplicate component id', () => {
    registry.registerComponent(componentDef)
    expect(() => registry.registerComponent(componentDef)).toThrow('test.hello')
  })

  it('stores and retrieves a registered layer', () => {
    registry.registerLayer(layerDef)
    expect(registry.getLayers()).toContain(layerDef)
  })

  it('returns layers sorted by zLayer order: below-canvas < above-canvas < above-ui', () => {
    registry.registerLayer({ id: 'a', zLayer: 'above-ui', component: mockLayer as never })
    registry.registerLayer({ id: 'b', zLayer: 'below-canvas', component: mockLayer as never })
    registry.registerLayer({ id: 'c', zLayer: 'above-canvas', component: mockLayer as never })

    const ids = registry.getLayers().map((l) => l.id)
    expect(ids).toEqual(['b', 'c', 'a'])
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm test src/ui-system/__tests__/registry.test.ts
```

Expected: FAIL — `UIRegistry` not found.

- [ ] **Step 3: Implement UIRegistry**

```ts
// src/ui-system/registry.ts
import type { ComponentDef, LayerDef, ZLayer } from './types'

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
}
```

- [ ] **Step 4: Run tests to confirm passing**

```bash
pnpm test src/ui-system/__tests__/registry.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Add `ui` to `IPluginSDK` interface**

In `src/workflow/types.ts`, import from `registrationTypes` (NOT from `ui-system/types`) to avoid a circular dependency. `ui-system/types.ts` imports `IWorkflowRunner` from this file; if this file imported from `ui-system/types.ts` we'd have a cycle. `registrationTypes.ts` has no workflow imports, so it is safe.

```ts
// Add import at top (use registrationTypes, not types, to avoid cycle):
import type { IUIRegistrationSDK } from '../ui-system/registrationTypes'

// Add field to IPluginSDK:
export interface IPluginSDK {
  // ... existing fields ...
  ui: IUIRegistrationSDK
}
```

- [ ] **Step 6: Extend PluginSDK class**

In `src/workflow/pluginSDK.ts`, accept an optional `UIRegistry` and expose it. Making it optional preserves backward compatibility with existing tests that call `new PluginSDK(engine, pluginId)` with only 2 arguments.

```ts
// Add import:
import type { UIRegistry } from '../ui-system/registry'

// Modify constructor:
export class PluginSDK implements IPluginSDK {
  private engine: WorkflowEngine
  private pluginId: string
  readonly ui: IUIRegistrationSDK

  constructor(engine: WorkflowEngine, pluginId: string, uiRegistry?: UIRegistry) {
    this.engine = engine
    this.pluginId = pluginId
    this.ui = uiRegistry
      ? {
          registerComponent: (def) => uiRegistry.registerComponent(def),
          registerLayer: (def) => uiRegistry.registerLayer(def),
        }
      : {
          // no-op: existing tests do not pass a registry
          registerComponent: () => {},
          registerLayer: () => {},
        }
  }
  // ... rest unchanged ...
}
```

- [ ] **Step 7: Pass UIRegistry singleton in useWorkflowSDK.ts**

In `src/workflow/useWorkflowSDK.ts`:

```ts
// Add import:
import { UIRegistry } from '../ui-system/registry'

// Add singleton alongside engine:
let _uiRegistry: UIRegistry | null = null

// Exported for production use — do NOT use in sandbox/tests.
// The sandbox creates its own isolated UIRegistry to avoid polluting this singleton
// (and to avoid double-registration if poc-ui is ever added to POC_PLUGINS).
export function getUIRegistry(): UIRegistry {
  if (!_uiRegistry) _uiRegistry = new UIRegistry()
  return _uiRegistry
}

// Update resetWorkflowEngine (for tests):
export function resetWorkflowEngine(): void {
  _engine = null
  _uiRegistry = null
  _pluginsActivated = false
}

// Update PluginSDK instantiation in ensurePluginsActivated:
const sdk = new PluginSDK(engine, plugin.id, getUIRegistry())
```

- [ ] **Step 8: Verify TypeScript compiles and existing tests still pass**

```bash
pnpm tsc --noEmit && pnpm test src/workflow/
```

Expected: no TS errors, all workflow tests passing.

- [ ] **Step 9: Commit**

```bash
git add src/ui-system/registry.ts src/ui-system/__tests__/registry.test.ts \
        src/workflow/types.ts src/workflow/pluginSDK.ts src/workflow/useWorkflowSDK.ts
git commit -m "feat(ui-system): UIRegistry + extend IPluginSDK with ui namespace"
```

---

### Task 3: PanelRenderer with ErrorBoundary

**Files:**

- Create: `src/ui-system/PanelErrorBoundary.tsx`
- Create: `src/ui-system/PanelRenderer.tsx`
- Create: `src/ui-system/__tests__/PanelRenderer.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/ui-system/__tests__/PanelRenderer.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelRenderer } from '../PanelRenderer'
import { UIRegistry } from '../registry'
import type { LayoutConfig, IComponentSDK } from '../types'

const mockSDK = {} as IComponentSDK

describe('PanelRenderer', () => {
  it('renders a registered component at the specified position', () => {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'test.panel',
      component: () => <div>hello panel</div>,
      defaultSize: { width: 200, height: 100 },
    })

    const layout: LayoutConfig = {
      'test.panel#1': { x: 50, y: 80, width: 200, height: 100 },
    }

    render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="play"
      />,
    )
    expect(screen.getByText('hello panel')).toBeInTheDocument()
  })

  it('renders nothing for an unknown component id', () => {
    const registry = new UIRegistry()
    const layout: LayoutConfig = {
      'unknown.panel#1': { x: 0, y: 0, width: 100, height: 100 },
    }

    const { container } = render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="play"
      />,
    )
    // container.firstChild is the Fragment wrapper — assert on container itself
    expect(container).toBeEmptyDOMElement()
  })

  it('catches a crashing panel in ErrorBoundary without unmounting others', () => {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'test.crash',
      component: () => {
        throw new Error('boom')
      },
      defaultSize: { width: 100, height: 100 },
    })
    registry.registerComponent({
      id: 'test.ok',
      component: () => <div>survivor</div>,
      defaultSize: { width: 100, height: 100 },
    })

    const layout: LayoutConfig = {
      'test.crash#1': { x: 0, y: 0, width: 100, height: 100 },
      'test.ok#1': { x: 110, y: 0, width: 100, height: 100 },
    }

    // Suppress React's error boundary console.error in test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="play"
      />,
    )
    spy.mockRestore()

    expect(screen.getByText('survivor')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm test src/ui-system/__tests__/PanelRenderer.test.tsx
```

Expected: FAIL — `PanelRenderer` not found.

- [ ] **Step 3: Implement PanelErrorBoundary**

```tsx
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
```

- [ ] **Step 4: Implement PanelRenderer**

```tsx
// src/ui-system/PanelRenderer.tsx
import { PanelErrorBoundary } from './PanelErrorBoundary'
import type { UIRegistry } from './registry'
import type { LayoutConfig, IComponentSDK } from './types'

interface Props {
  registry: UIRegistry
  layout: LayoutConfig
  makeSDK: (instanceKey: string, instanceProps: Record<string, unknown>) => IComponentSDK
  layoutMode: 'play' | 'edit'
}

export function PanelRenderer({ registry, layout, makeSDK, layoutMode }: Props) {
  const entries = Object.entries(layout)

  return (
    <>
      {entries.map(([instanceKey, entry]) => {
        if (entry.visible === false) return null

        // Parse componentId from "componentId#instance"
        const componentId = instanceKey.replace(/#[^#]*$/, '')
        const def = registry.getComponent(componentId)
        if (!def) return null

        const sdk = makeSDK(instanceKey, entry.instanceProps ?? {})
        const PanelComponent = def.component
        const showChrome = layoutMode === 'edit' || (def.chromeVisible ?? true)

        return (
          <div
            key={instanceKey}
            style={{
              position: 'absolute',
              left: entry.x,
              top: entry.y,
              width: entry.width,
              height: entry.height,
            }}
          >
            {showChrome && (
              <div
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  borderBottom: '1px solid rgba(255,255,255,0.15)',
                  padding: '2px 8px',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.5)',
                  userSelect: 'none',
                }}
              >
                {componentId}
              </div>
            )}
            <PanelErrorBoundary panelId={instanceKey}>
              <PanelComponent sdk={sdk} />
            </PanelErrorBoundary>
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 5: Run tests to confirm passing**

```bash
pnpm test src/ui-system/__tests__/PanelRenderer.test.tsx
```

Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add src/ui-system/PanelErrorBoundary.tsx src/ui-system/PanelRenderer.tsx \
        src/ui-system/__tests__/PanelRenderer.test.tsx
git commit -m "feat(ui-system): PanelRenderer with ErrorBoundary isolation"
```

---

### Task 4: LayerRenderer

**Files:**

- Create: `src/ui-system/LayerRenderer.tsx`
- Create: `src/ui-system/__tests__/LayerRenderer.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/ui-system/__tests__/LayerRenderer.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LayerRenderer } from '../LayerRenderer'
import { UIRegistry } from '../registry'

describe('LayerRenderer', () => {
  it('renders all registered layers', () => {
    const registry = new UIRegistry()
    registry.registerLayer({ id: 'a', zLayer: 'above-canvas', component: () => <div>layer-a</div> })
    registry.registerLayer({ id: 'b', zLayer: 'above-ui', component: () => <div>layer-b</div> })

    render(<LayerRenderer registry={registry} layoutMode="play" />)
    expect(screen.getByText('layer-a')).toBeInTheDocument()
    expect(screen.getByText('layer-b')).toBeInTheDocument()
  })

  it('renders layers in zLayer order (below-canvas first, above-ui last)', () => {
    const registry = new UIRegistry()
    registry.registerLayer({ id: 'top', zLayer: 'above-ui', component: () => <div>top</div> })
    registry.registerLayer({
      id: 'bottom',
      zLayer: 'below-canvas',
      component: () => <div>bottom</div>,
    })

    const { container } = render(<LayerRenderer registry={registry} layoutMode="play" />)
    const divs = container.querySelectorAll('[data-layer-id]')
    expect(divs[0].getAttribute('data-layer-id')).toBe('bottom')
    expect(divs[1].getAttribute('data-layer-id')).toBe('top')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm test src/ui-system/__tests__/LayerRenderer.test.tsx
```

Expected: FAIL — `LayerRenderer` not found.

- [ ] **Step 3: Implement LayerRenderer**

```tsx
// src/ui-system/LayerRenderer.tsx
import type React from 'react'
import type { UIRegistry } from './registry'
import type { LayerProps } from './types'

interface Props {
  registry: UIRegistry
  layoutMode: 'play' | 'edit'
}

export function LayerRenderer({ registry, layoutMode }: Props) {
  const layers = registry.getLayers()

  return (
    <>
      {layers.map((def) => {
        const LayerComponent: React.ComponentType<LayerProps> = def.component
        return (
          <div
            key={def.id}
            data-layer-id={def.id}
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: def.pointerEvents ? 'auto' : 'none',
            }}
          >
            <LayerComponent layoutMode={layoutMode} />
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 4: Run tests to confirm passing**

```bash
pnpm test src/ui-system/__tests__/LayerRenderer.test.tsx
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/LayerRenderer.tsx src/ui-system/__tests__/LayerRenderer.test.tsx
git commit -m "feat(ui-system): LayerRenderer with zLayer ordering"
```

---

### Task 5: POC Plugin + Sandbox Demo Page

**Files:**

- Create: `plugins/poc-ui/HelloPanel.tsx`
- Create: `plugins/poc-ui/VignetteLayer.tsx`
- Create: `plugins/poc-ui/index.ts`
- Create: `src/sandbox/PatternUISystem.tsx`
- Modify: `src/sandbox/index.tsx`

- [ ] **Step 1: Create poc-ui plugin components**

```tsx
// plugins/poc-ui/HelloPanel.tsx
import type { ComponentProps } from '../../src/ui-system/types'

export function HelloPanel({ sdk }: ComponentProps) {
  const entities = sdk.data.entities()
  return (
    <div style={{ padding: 12, color: '#e2e8f0', fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Hello from poc-ui</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
        Entities:{' '}
        {entities.length === 0 ? '(none — mock data)' : entities.map((e) => e.name).join(', ')}
      </div>
      <button
        style={{ marginTop: 8, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
        onClick={() => alert('sdk.workflow is wired')}
      >
        Ping workflow
      </button>
    </div>
  )
}
```

```tsx
// plugins/poc-ui/VignetteLayer.tsx
import type { LayerProps } from '../../src/ui-system/types'

export function VignetteLayer({ layoutMode }: LayerProps) {
  if (layoutMode === 'edit') return null
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
        pointerEvents: 'none',
      }}
    />
  )
}
```

```ts
// plugins/poc-ui/index.ts
import type { VTTPlugin } from '../../src/rules/types'
import { HelloPanel } from './HelloPanel'
import { VignetteLayer } from './VignetteLayer'

export const pocUIPlugin: VTTPlugin = {
  id: 'poc-ui',
  onActivate(sdk) {
    sdk.ui.registerComponent({
      id: 'poc-ui.hello',
      component: HelloPanel,
      defaultSize: { width: 240, height: 140 },
    })
    sdk.ui.registerLayer({
      id: 'poc-ui.vignette',
      zLayer: 'above-canvas',
      component: VignetteLayer,
    })
  },
}
```

- [ ] **Step 2: Create sandbox demo page**

The sandbox page bootstraps the UIRegistry manually (no live room needed — uses mock IDataSDK).

```tsx
// src/sandbox/PatternUISystem.tsx
import { useMemo, useState } from 'react'
import { UIRegistry } from '../ui-system/registry'
import { PanelRenderer } from '../ui-system/PanelRenderer'
import { LayerRenderer } from '../ui-system/LayerRenderer'
import { pocUIPlugin } from '../../plugins/poc-ui'
import { PluginSDK } from '../workflow/pluginSDK'
import { getWorkflowEngine } from '../workflow/useWorkflowSDK'
import { WorkflowRunner } from '../workflow/pluginSDK'
import type { IComponentSDK, LayoutConfig } from '../ui-system/types'
import type { Entity } from '../shared/entityTypes'

// Mock entities for sandbox (no live room)
const MOCK_ENTITIES: Entity[] = [
  {
    id: 'e1',
    name: 'Aria',
    imageUrl: '',
    color: '#60a5fa',
    width: 1,
    height: 1,
    notes: '',
    ruleData: null,
    permissions: { default: 'observer', seats: {} },
    lifecycle: 'persistent',
  },
]

const INITIAL_LAYOUT: LayoutConfig = {
  'poc-ui.hello#1': { x: 40, y: 40, width: 240, height: 140 },
  'poc-ui.hello#2': { x: 320, y: 40, width: 240, height: 140, instanceProps: { entityId: 'e1' } },
}

export default function PatternUISystem() {
  const [layout] = useState<LayoutConfig>(INITIAL_LAYOUT)

  const { registry, runner } = useMemo(() => {
    const reg = new UIRegistry()
    const engine = getWorkflowEngine()
    const sdk = new PluginSDK(engine, pocUIPlugin.id, reg)
    pocUIPlugin.onActivate(sdk)
    const wfRunner = new WorkflowRunner(engine, {
      sendRoll: async () => ({ rolls: [], total: 0 }),
      updateEntity: () => {},
      updateTeamTracker: () => {},
      sendMessage: () => {},
      showToast: () => {},
    })
    return { registry: reg, runner: wfRunner }
  }, [])

  function makeSDK(instanceKey: string, instanceProps: Record<string, unknown>): IComponentSDK {
    return {
      data: {
        entity: (id) => MOCK_ENTITIES.find((e) => e.id === id),
        entities: () => MOCK_ENTITIES,
      },
      workflow: runner,
      context: {
        instanceProps,
        role: 'GM',
        layoutMode: 'play',
      },
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 600,
        background: '#1a1a2e',
        overflow: 'hidden',
      }}
    >
      <LayerRenderer registry={registry} layoutMode="play" />
      <PanelRenderer registry={registry} layout={layout} makeSDK={makeSDK} layoutMode="play" />
    </div>
  )
}
```

- [ ] **Step 3: Register pattern in sandbox index**

In `src/sandbox/index.tsx`, add to the `PATTERNS` array:

```ts
{
  key: 'ui-system-poc',
  title: 'UI System POC',
  description: 'Plugin registerComponent + registerLayer + IComponentSDK injection',
  component: lazy(() => import('./PatternUISystem')),
},
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: all existing tests pass, new tests pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/poc-ui/ src/sandbox/PatternUISystem.tsx src/sandbox/index.tsx
git commit -m "feat(ui-system): poc-ui plugin + sandbox demo page (Phase 1 complete)"
```

---

## Phase 2 — Layout Editor

> Prerequisite: Phase 1 complete and sandbox demo page working in browser.

### Task 6: Draggable Layout Editor

**Files:**

- Create: `src/ui-system/LayoutEditor.tsx`
- Create: `src/ui-system/__tests__/LayoutEditor.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/ui-system/__tests__/LayoutEditor.test.tsx
import { describe, it, expect } from 'vitest'
import { applyDrag } from '../LayoutEditor'
import type { LayoutConfig } from '../types'

describe('applyDrag', () => {
  const layout: LayoutConfig = {
    'test.panel#1': { x: 100, y: 100, width: 200, height: 100 },
  }

  it('moves a panel by the drag delta', () => {
    const updated = applyDrag(layout, 'test.panel#1', { dx: 30, dy: -10 })
    expect(updated['test.panel#1'].x).toBe(130)
    expect(updated['test.panel#1'].y).toBe(90)
  })

  it('does not mutate the original layout', () => {
    applyDrag(layout, 'test.panel#1', { dx: 10, dy: 10 })
    expect(layout['test.panel#1'].x).toBe(100)
  })

  it('ignores drag for unknown instance key', () => {
    const updated = applyDrag(layout, 'unknown#1', { dx: 10, dy: 10 })
    expect(updated).toEqual(layout)
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm test src/ui-system/__tests__/LayoutEditor.test.tsx
```

Expected: FAIL — `applyDrag` not found.

- [ ] **Step 3: Implement applyDrag + LayoutEditor component**

```tsx
// src/ui-system/LayoutEditor.tsx
import { useRef, useCallback } from 'react'
import type { MouseEvent } from 'react'
import type { LayoutConfig } from './types'

export function applyDrag(
  layout: LayoutConfig,
  instanceKey: string,
  delta: { dx: number; dy: number },
): LayoutConfig {
  if (!(instanceKey in layout)) return layout
  return {
    ...layout,
    [instanceKey]: {
      ...layout[instanceKey],
      x: layout[instanceKey].x + delta.dx,
      y: layout[instanceKey].y + delta.dy,
    },
  }
}

interface DragHandleProps {
  instanceKey: string
  label: string
  onDrag: (instanceKey: string, delta: { dx: number; dy: number }) => void
}

export function DragHandle({ instanceKey, label, onDrag }: DragHandleProps) {
  const startPos = useRef<{ x: number; y: number } | null>(null)

  const onMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      startPos.current = { x: e.clientX, y: e.clientY }

      // Type annotation omitted — TypeScript infers globalThis.MouseEvent from window.addEventListener
      const onMouseMove = (ev: globalThis.MouseEvent) => {
        if (!startPos.current) return
        const dx = ev.clientX - startPos.current.x
        const dy = ev.clientY - startPos.current.y
        startPos.current = { x: ev.clientX, y: ev.clientY }
        onDrag(instanceKey, { dx, dy })
      }

      const onMouseUp = () => {
        startPos.current = null
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [instanceKey, onDrag],
  )

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        background: 'rgba(99,102,241,0.8)',
        padding: '2px 8px',
        fontSize: 11,
        color: 'white',
        cursor: 'grab',
        userSelect: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.2)',
      }}
    >
      ⠿ {label}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm passing**

```bash
pnpm test src/ui-system/__tests__/LayoutEditor.test.tsx
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/ui-system/LayoutEditor.tsx src/ui-system/__tests__/LayoutEditor.test.tsx
git commit -m "feat(ui-system): applyDrag logic + DragHandle component"
```

---

### Task 7: Wire Layout Editor into Sandbox Demo

**Files:**

- Modify: `src/sandbox/PatternUISystem.tsx`
- Modify: `src/ui-system/PanelRenderer.tsx`

- [ ] **Step 1: Add DragHandle to PanelRenderer in edit mode**

In `src/ui-system/PanelRenderer.tsx`, update the chrome rendering to use `DragHandle` when `onDrag` is provided:

```tsx
// Add to Props interface:
onDrag?: (instanceKey: string, delta: { dx: number; dy: number }) => void

// Replace chrome div with:
{layoutMode === 'edit' && onDrag ? (
  <DragHandle instanceKey={instanceKey} label={componentId} onDrag={onDrag} />
) : showChrome ? (
  <div style={{ /* existing chrome style */ }}>{componentId}</div>
) : null}
```

Import `DragHandle` from `./LayoutEditor`.

- [ ] **Step 2: Add edit mode toggle to PatternUISystem**

Replace the entire `PatternUISystem.tsx` content (it evolves significantly from Phase 1):

```tsx
// src/sandbox/PatternUISystem.tsx
import { useMemo, useState, useCallback } from 'react'
import { UIRegistry } from '../ui-system/registry'
import { PanelRenderer } from '../ui-system/PanelRenderer'
import { LayerRenderer } from '../ui-system/LayerRenderer'
import { applyDrag } from '../ui-system/LayoutEditor'
import { pocUIPlugin } from '../../plugins/poc-ui'
import { PluginSDK, WorkflowRunner } from '../workflow/pluginSDK'
import { getWorkflowEngine } from '../workflow/useWorkflowSDK'
import type { IComponentSDK, LayoutConfig } from '../ui-system/types'
import type { Entity } from '../shared/entityTypes'

const MOCK_ENTITIES: Entity[] = [
  {
    id: 'e1',
    name: 'Aria',
    imageUrl: '',
    color: '#60a5fa',
    width: 1,
    height: 1,
    notes: '',
    ruleData: null,
    permissions: { default: 'observer', seats: {} },
    lifecycle: 'persistent',
  },
]

const INITIAL_LAYOUT: LayoutConfig = {
  'poc-ui.hello#1': { x: 40, y: 40, width: 240, height: 140 },
  'poc-ui.hello#2': { x: 320, y: 40, width: 240, height: 140, instanceProps: { entityId: 'e1' } },
}

export default function PatternUISystem() {
  const [layoutMode, setLayoutMode] = useState<'play' | 'edit'>('play')
  const [layout, setLayout] = useState<LayoutConfig>(INITIAL_LAYOUT)

  const { registry, runner } = useMemo(() => {
    // Intentionally creates a local UIRegistry — does NOT use getUIRegistry() singleton,
    // to avoid polluting the production registry and risking double-registration.
    const reg = new UIRegistry()
    const engine = getWorkflowEngine()
    const sdk = new PluginSDK(engine, pocUIPlugin.id, reg)
    pocUIPlugin.onActivate(sdk)
    const wfRunner = new WorkflowRunner(engine, {
      sendRoll: async () => ({ rolls: [], total: 0 }),
      updateEntity: () => {},
      updateTeamTracker: () => {},
      sendMessage: () => {},
      showToast: () => {},
    })
    return { registry: reg, runner: wfRunner }
  }, [])

  // makeSDK receives layoutMode so sdk.context.layoutMode stays current
  function makeSDK(
    _instanceKey: string,
    instanceProps: Record<string, unknown>,
    mode: 'play' | 'edit',
  ): IComponentSDK {
    return {
      data: {
        entity: (id) => MOCK_ENTITIES.find((e) => e.id === id),
        entities: () => MOCK_ENTITIES,
      },
      workflow: runner,
      context: { instanceProps, role: 'GM', layoutMode: mode },
    }
  }

  const handleDrag = useCallback((instanceKey: string, delta: { dx: number; dy: number }) => {
    setLayout((prev) => applyDrag(prev, instanceKey, delta))
  }, [])

  return (
    <div>
      <div
        style={{
          padding: '8px 12px',
          background: '#0f0f23',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <button
          onClick={() => setLayoutMode((m) => (m === 'play' ? 'edit' : 'play'))}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            cursor: 'pointer',
            background: layoutMode === 'edit' ? '#6366f1' : '#374151',
            color: 'white',
            border: 'none',
          }}
        >
          {layoutMode === 'edit' ? '✓ Lock Layout' : '✎ Edit Layout'}
        </button>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
          {layoutMode === 'edit' ? 'Drag panels to reposition' : 'Layout locked'}
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 600,
          background: '#1a1a2e',
          overflow: 'hidden',
        }}
      >
        <LayerRenderer registry={registry} layoutMode={layoutMode} />
        <PanelRenderer
          registry={registry}
          layout={layout}
          makeSDK={(key, props) => makeSDK(key, props, layoutMode)}
          layoutMode={layoutMode}
          onDrag={layoutMode === 'edit' ? handleDrag : undefined}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: all tests passing.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Final commit**

Only stage files modified in this task (`LayoutEditor.tsx` and its test were already committed in Task 6):

```bash
git add src/ui-system/PanelRenderer.tsx src/sandbox/PatternUISystem.tsx
git commit -m "feat(ui-system): wire draggable layout editor into sandbox demo (Phase 2 complete)"
```

---

## Success Criteria

**Phase 1:**

- [ ] All `src/ui-system/__tests__/` tests pass
- [ ] Sandbox page `ui-system-poc` renders two HelloPanel instances and vignette layer
- [ ] Crashing a panel (e.g., temporarily break `HelloPanel`) shows error placeholder, other panel unaffected
- [ ] `sdk.data.entities()` returns mock entities in both panels
- [ ] TypeScript compiles with no errors

**Phase 2:**

- [ ] Edit mode toggle shows drag handles on all panels
- [ ] Dragging a panel updates its position in real time
- [ ] Locking layout hides chrome (where `chromeVisible` defaults to true, chrome shows; for vignette layer, no chrome)
- [ ] Layout resets on page refresh (no persistence — expected for POC)
