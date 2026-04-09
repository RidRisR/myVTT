// src/sandbox/PatternUISystem.tsx
import { useMemo, useState, useCallback } from 'react'
import { UIRegistry } from '../ui-system/registry'
import { RegionRenderer } from '../ui-system/RegionRenderer'
import { LayerRenderer } from '../ui-system/LayerRenderer'
import { createDragInitiator } from '../ui-system/LayoutEditor'
import { makeDnDSDK } from '../ui-system/dnd'
// eslint-disable-next-line no-restricted-imports -- sandbox: direct plugin import for demo, no registry needed
import { pocUIPlugin } from '../../plugins/poc-ui'
// eslint-disable-next-line no-restricted-imports -- sandbox: direct component import for second hello panel instance
import { HelloPanel } from '../../plugins/poc-ui/HelloPanel'
import {
  FixedEscapePanel,
  ZIndexEscapePanel,
  EventThiefPanel,
  CrashPanel,
} from './AdversarialPanels'
import { PluginSDK, WorkflowRunner } from '../workflow/pluginSDK'
import { getWorkflowEngine } from '../workflow/useWorkflowSDK'
import type { IRegionSDK, RegionLayoutConfig, AnchorPoint } from '../ui-system/types'
import type { Entity } from '../shared/entityTypes'

const MOCK_ENTITIES: Entity[] = [
  {
    id: 'e1',
    tags: [],
    components: {
      'core:identity': { name: 'Aria', imageUrl: '', color: '#60a5fa' },
      'core:token': { width: 1, height: 1 },
      'core:notes': { text: '' },
    },
    permissions: { default: 'observer', seats: {} },
    lifecycle: 'persistent',
  },
]

const INITIAL_LAYOUT: RegionLayoutConfig = {
  // Region keys match registered region IDs (persistent regions are 1:1 with layout entries)
  'poc-ui.hello': {
    anchor: 'top-left',
    offsetX: 40,
    offsetY: 40,
    width: 240,
    height: 200,
    zOrder: 0,
  },
  'poc-ui.hello-2': {
    anchor: 'top-left',
    offsetX: 320,
    offsetY: 40,
    width: 240,
    height: 200,
    zOrder: 0,
    instanceProps: { entityId: 'e1' },
  },
  // Adversarial panels — each tries to break containment in a specific way
  'test.fixed-escape': {
    anchor: 'top-left',
    offsetX: 40,
    offsetY: 280,
    width: 240,
    height: 120,
    zOrder: 1,
  },
  'test.zindex-escape': {
    anchor: 'top-left',
    offsetX: 320,
    offsetY: 280,
    width: 240,
    height: 120,
    zOrder: 1,
  },
  'test.event-thief': {
    anchor: 'top-left',
    offsetX: 600,
    offsetY: 280,
    width: 240,
    height: 160,
    zOrder: 1,
  },
  'test.crash': {
    anchor: 'top-left',
    offsetX: 600,
    offsetY: 40,
    width: 240,
    height: 80,
    zOrder: 1,
  },
}

export default function PatternUISystem() {
  const [layoutMode, setLayoutMode] = useState<'play' | 'edit'>('play')
  const [layout, setLayout] = useState<RegionLayoutConfig>(INITIAL_LAYOUT)

  const { registry, runner } = useMemo(() => {
    // Intentionally creates a local UIRegistry — does NOT use getUIRegistry() singleton,
    // to avoid polluting the production registry and risking double-registration.
    const reg = new UIRegistry()
    const engine = getWorkflowEngine()
    const sdk = new PluginSDK(engine, pocUIPlugin.id, reg)
    pocUIPlugin.onActivate(sdk)
    // Second hello panel instance (Region Model requires unique IDs for persistent regions)
    reg.registerRegion({
      id: 'poc-ui.hello-2',
      component: HelloPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 240, height: 200 },
      layer: 'standard',
    })
    // Adversarial panels for isolation testing
    reg.registerRegion({
      id: 'test.fixed-escape',
      component: FixedEscapePanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 240, height: 120 },
      layer: 'standard',
    })
    reg.registerRegion({
      id: 'test.zindex-escape',
      component: ZIndexEscapePanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 240, height: 120 },
      layer: 'standard',
    })
    reg.registerRegion({
      id: 'test.event-thief',
      component: EventThiefPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 240, height: 160 },
      layer: 'standard',
    })
    reg.registerRegion({
      id: 'test.crash',
      component: CrashPanel as React.ComponentType<{ sdk: unknown }>,
      lifecycle: 'persistent',
      defaultSize: { width: 240, height: 80 },
      layer: 'standard',
    })
    const wfRunner = new WorkflowRunner(engine, {
      emitEntry: () => {},
      serverRoll: () => Promise.reject(new Error('serverRoll not available in sandbox')),
      createEntity: () => Promise.reject(new Error('createEntity not available in sandbox')),
      deleteEntity: () => Promise.reject(new Error('deleteEntity not available in sandbox')),
      getEntity: () => undefined,
      getAllEntities: () => ({}),
      getActiveOrigin: () => ({ seat: { id: '', name: '', color: '' } }),
      getSeatId: () => '',
      getLogWatermark: () => 0,
      getFormulaTokens: () => ({}),
    })
    return { registry: reg, runner: wfRunner }
  }, [])

  const handleDragEnd = useCallback(
    (instanceKey: string, placement: { anchor: AnchorPoint; offsetX: number; offsetY: number }) => {
      setLayout((prev) => ({
        ...prev,
        [instanceKey]: prev[instanceKey]
          ? { ...prev[instanceKey], ...placement }
          : prev[instanceKey],
      }))
    },
    [],
  )

  const handleResize = useCallback(
    (instanceKey: string, size: { width: number; height: number }) => {
      setLayout((prev) => ({
        ...prev,
        [instanceKey]: prev[instanceKey] ? { ...prev[instanceKey], ...size } : prev[instanceKey],
      }))
    },
    [],
  )

  // makeSDK receives layoutMode so sdk.context.layoutMode stays current
  const makeSDK = useCallback(
    (instanceKey: string, instanceProps: Record<string, unknown>): IRegionSDK => ({
      read: {
        entity: (id) => MOCK_ENTITIES.find((e) => e.id === id),
        component: () => undefined,
        query: () => MOCK_ENTITIES,
        formulaTokens: () => ({}),
      },
      workflow: runner,
      context: { instanceProps, role: 'GM', layoutMode },
      // play mode: inject interaction primitives; edit mode: system overlay handles all interaction
      interaction:
        layoutMode === 'play'
          ? {
              layout: { startDrag: createDragInitiator(instanceKey, () => {}) },
              dnd: makeDnDSDK(),
            }
          : undefined,
      data: {
        useEntity: () => undefined,
        useComponent: () => undefined,
        useQuery: () => [],
      },
      awareness: {
        subscribe: () => () => {},
        broadcast: () => {},
        clear: () => {},
        usePeers: () => new Map(),
      },
      log: {
        subscribe: () => () => {},
        useEntries: () => ({ entries: [], newIds: new Set<string>() }),
      },
      ui: {
        openPanel: () => '',
        closePanel: () => {},
        resize: () => {},
        getPortalContainer: () => document.body,
      },
    }),
    [runner, layoutMode],
  )

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
          onClick={() => {
            setLayoutMode((m) => (m === 'play' ? 'edit' : 'play'))
          }}
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
        <RegionRenderer
          registry={registry}
          layout={layout}
          makeSDK={(key, props) => makeSDK(key, props)}
          viewport={{ width: 900, height: 600 }}
          layoutMode={layoutMode}
          onDragEnd={layoutMode === 'edit' ? handleDragEnd : undefined}
          onResize={layoutMode === 'edit' ? handleResize : undefined}
        />
      </div>
    </div>
  )
}
