import type { WorkflowEngine } from '../../../src/workflow/engine'
import type { Resistances } from './components'
import type { DealDamageState } from '../core/workflows'
import { getDealDamageHandle } from '../core/workflows'

export function activateStatusFxPlugin(engine: WorkflowEngine): void {
  engine.setCurrentPluginOwner('status-fx')

  const dealDamageHandle = getDealDamageHandle()
  engine.addStep(dealDamageHandle.name, {
    id: 'status-fx:apply-resistance',
    before: 'core:apply-damage',
    run: (ctx) => {
      const state = (ctx as unknown as { state: DealDamageState }).state
      const read = (
        ctx as unknown as {
          read: { component: <T>(eid: string, key: string) => T | undefined }
        }
      ).read

      const resistances = read.component<Resistances>(state.targetId, 'status-fx:resistances')
      const resistance = resistances?.[state.damageType] ?? 0
      state.finalDamage = Math.max(0, state.finalDamage - resistance)
    },
  })

  engine.setCurrentPluginOwner(undefined)
}
