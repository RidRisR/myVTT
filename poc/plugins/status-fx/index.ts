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
      const state = (ctx as unknown as { vars: DealDamageState }).vars
      const read = (
        ctx as unknown as {
          read: { component: (eid: string, key: string) => unknown }
        }
      ).read

      const resistances = read.component(state.targetId, 'status-fx:resistances') as
        | Resistances
        | undefined
      const resistance = resistances?.[state.damageType] ?? 0
      state.finalDamage = Math.max(0, state.finalDamage - resistance)
    },
  })

  engine.setCurrentPluginOwner(undefined)
}
