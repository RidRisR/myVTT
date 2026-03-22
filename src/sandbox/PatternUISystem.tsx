import { useMemo, useState } from 'react'
import { UIRegistry } from '../ui-system/registry'
import { PanelRenderer } from '../ui-system/PanelRenderer'
import { LayerRenderer } from '../ui-system/LayerRenderer'
// eslint-disable-next-line no-restricted-imports -- sandbox: direct plugin import for demo, no registry needed
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
      sendRoll: () => Promise.resolve({ rolls: [], total: 0 }),
      updateEntity: () => {},
      updateTeamTracker: () => {},
      sendMessage: () => {},
      showToast: () => {},
    })
    return { registry: reg, runner: wfRunner }
  }, [])

  function makeSDK(_instanceKey: string, instanceProps: Record<string, unknown>): IComponentSDK {
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
