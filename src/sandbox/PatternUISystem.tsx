// src/sandbox/PatternUISystem.tsx
import { useMemo, useState, useCallback } from 'react'
import { UIRegistry } from '../ui-system/registry'
import { PanelRenderer } from '../ui-system/PanelRenderer'
import { LayerRenderer } from '../ui-system/LayerRenderer'
import { applyDrag, createDragInitiator } from '../ui-system/LayoutEditor'
import { makeDnDSDK } from '../ui-system/dnd'
// eslint-disable-next-line no-restricted-imports -- sandbox: direct plugin import for demo, no registry needed
import { pocUIPlugin } from '../../plugins/poc-ui'
import {
  FixedEscapePanel,
  ZIndexEscapePanel,
  EventThiefPanel,
  CrashPanel,
} from './AdversarialPanels'
import { PluginSDK, WorkflowRunner } from '../workflow/pluginSDK'
import { getWorkflowEngine } from '../workflow/useWorkflowSDK'
import { EventBus } from '../events/eventBus'
import type { IComponentSDK, LayoutConfig } from '../ui-system/types'
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

const INITIAL_LAYOUT: LayoutConfig = {
  'poc-ui.hello#1': { x: 40, y: 40, width: 240, height: 200, zOrder: 0 },
  'poc-ui.hello#2': {
    x: 320,
    y: 40,
    width: 240,
    height: 200,
    zOrder: 0,
    instanceProps: { entityId: 'e1' },
  },
  // Adversarial panels — each tries to break containment in a specific way
  'test.fixed-escape#1': { x: 40, y: 280, width: 240, height: 120, zOrder: 1 },
  'test.zindex-escape#1': { x: 320, y: 280, width: 240, height: 120, zOrder: 1 },
  'test.event-thief#1': { x: 600, y: 280, width: 240, height: 160, zOrder: 1 },
  'test.crash#1': { x: 600, y: 40, width: 240, height: 80, zOrder: 1 },
}

export default function PatternUISystem() {
  const [layoutMode, setLayoutMode] = useState<'play' | 'edit'>('play')
  const [layout, setLayout] = useState<LayoutConfig>(INITIAL_LAYOUT)
  const [showHandles, setShowHandles] = useState(true)

  const { registry, runner } = useMemo(() => {
    // Intentionally creates a local UIRegistry — does NOT use getUIRegistry() singleton,
    // to avoid polluting the production registry and risking double-registration.
    const reg = new UIRegistry()
    const engine = getWorkflowEngine()
    const sdk = new PluginSDK(engine, pocUIPlugin.id, reg)
    pocUIPlugin.onActivate(sdk)
    // Adversarial panels for isolation testing
    reg.registerComponent({
      id: 'test.fixed-escape',
      component: FixedEscapePanel as React.ComponentType<{ sdk: unknown }>,
      type: 'panel',
      defaultSize: { width: 240, height: 120 },
    })
    reg.registerComponent({
      id: 'test.zindex-escape',
      component: ZIndexEscapePanel as React.ComponentType<{ sdk: unknown }>,
      type: 'panel',
      defaultSize: { width: 240, height: 120 },
    })
    reg.registerComponent({
      id: 'test.event-thief',
      component: EventThiefPanel as React.ComponentType<{ sdk: unknown }>,
      type: 'panel',
      defaultSize: { width: 240, height: 160 },
    })
    reg.registerComponent({
      id: 'test.crash',
      component: CrashPanel as React.ComponentType<{ sdk: unknown }>,
      type: 'panel',
      defaultSize: { width: 240, height: 80 },
    })
    const wfRunner = new WorkflowRunner(engine, {
      emitEntry: () => {},
      serverRoll: () => Promise.reject(new Error('serverRoll not available in sandbox')),
      getEntity: () => undefined,
      getAllEntities: () => ({}),
      eventBus: new EventBus(),
      getActiveOrigin: () => ({ seat: { id: '', name: '', color: '' } }),
      getSeatId: () => '',
      getLogWatermark: () => 0,
      getFormulaTokens: () => ({}),
    })
    return { registry: reg, runner: wfRunner }
  }, [])

  const handleDrag = useCallback((instanceKey: string, delta: { dx: number; dy: number }) => {
    setLayout((prev) => applyDrag(prev, instanceKey, delta))
  }, [])

  // makeSDK receives layoutMode so sdk.context.layoutMode stays current
  const makeSDK = useCallback(
    (
      instanceKey: string,
      instanceProps: Record<string, unknown>,
      mode: 'play' | 'edit',
    ): IComponentSDK => ({
      read: {
        entity: (id) => MOCK_ENTITIES.find((e) => e.id === id),
        component: () => undefined,
        query: () => MOCK_ENTITIES,
        formulaTokens: () => ({}),
      },
      workflow: runner,
      context: { instanceProps, role: 'GM', layoutMode: mode },
      // play 模式注入交互原语；edit 模式系统浮层接管所有交互，不注入
      interaction:
        mode === 'play'
          ? {
              layout: { startDrag: createDragInitiator(instanceKey, handleDrag) },
              dnd: makeDnDSDK(),
            }
          : undefined,
      awareness: {
        subscribe: () => () => {},
        broadcast: () => {},
        clear: () => {},
      },
      log: { subscribe: () => () => {} },
      ui: { openPanel: () => '', closePanel: () => {} },
    }),
    [runner, handleDrag],
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
        {layoutMode === 'edit' && (
          <button
            onClick={() => {
              setShowHandles((v) => !v)
            }}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              cursor: 'pointer',
              background: showHandles ? '#6366f1' : '#374151',
              color: 'white',
              border: 'none',
            }}
          >
            {showHandles ? '◎ Hide Handles' : '◎ Show Handles'}
          </button>
        )}
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
          showHandles={showHandles}
        />
      </div>
    </div>
  )
}
