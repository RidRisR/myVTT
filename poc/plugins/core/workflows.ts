import type { WorkflowEngine } from '../../../src/workflow/engine'
import type { WorkflowHandle } from '../../../src/workflow/types'
import type { Health } from './components'
import { damageDealtEvent } from './events'
import { _setSelection } from '../../sessionStore'

export interface DealDamageState {
  targetId: string
  rawDamage: number
  damageType: string
  finalDamage: number
}

export interface SetSelectionState {
  entityId: string | null
}

// These will be set during plugin activation
let _dealDamageHandle: WorkflowHandle<DealDamageState>
let _setSelectionHandle: WorkflowHandle<SetSelectionState>

export function getDealDamageHandle(): WorkflowHandle<DealDamageState> {
  return _dealDamageHandle
}

export function getSetSelectionHandle(): WorkflowHandle<SetSelectionState> {
  return _setSelectionHandle
}

export function registerCoreWorkflows(engine: WorkflowEngine): void {
  _dealDamageHandle = engine.defineWorkflow<DealDamageState>('core:deal-damage', [
    {
      id: 'core:calc-damage',
      run: (ctx) => {
        const state = (ctx as unknown as { state: DealDamageState }).state
        state.finalDamage = state.rawDamage
      },
    },
    {
      id: 'core:apply-damage',
      run: (ctx) => {
        const state = (ctx as unknown as { state: DealDamageState }).state
        const updateComponent = (
          ctx as unknown as {
            updateComponent: (
              eid: string,
              key: string,
              updater: (c: unknown) => unknown,
            ) => void
          }
        ).updateComponent
        const events = (
          ctx as unknown as {
            events: { emit: (handle: unknown, payload: unknown) => void }
          }
        ).events

        updateComponent(state.targetId, 'core:health', (current) => {
          const health = current as Health | undefined
          return {
            hp: Math.max(0, (health?.hp ?? 0) - state.finalDamage),
            maxHp: health?.maxHp ?? 0,
          }
        })

        events.emit(damageDealtEvent, {
          targetId: state.targetId,
          damage: state.finalDamage,
          damageType: state.damageType,
        })
      },
    },
  ])

  _setSelectionHandle = engine.defineWorkflow<SetSelectionState>('core:set-selection', (ctx) => {
    const state = (ctx as unknown as { state: SetSelectionState }).state
    _setSelection(state.entityId ? [state.entityId] : [])
  })
}
