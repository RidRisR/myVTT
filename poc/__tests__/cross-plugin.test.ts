import { WorkflowEngine } from '../../src/workflow/engine'
import { usePocStore } from '../store'
import { createDataReader } from '../dataReader'
import { createEventBus } from '../eventBus'
import { createPocWorkflowContext } from '../pocWorkflowContext'
import { activateCorePlugin } from '../plugins/core/index'
import { activateStatusFxPlugin } from '../plugins/status-fx/index'
import { damageDealtEvent } from '../plugins/core/events'
import { loadMockData } from '../mockData'
import type { Health } from '../plugins/core/components'

describe('Cross-plugin integration', () => {
  let engine: WorkflowEngine

  beforeEach(() => {
    engine = new WorkflowEngine()
    activateCorePlugin(engine)
    activateStatusFxPlugin(engine)
    loadMockData()
  })

  async function runDealDamage(
    e: WorkflowEngine,
    bus: ReturnType<typeof createEventBus>,
    targetId: string,
    rawDamage: number,
    damageType: string,
  ) {
    const reader = createDataReader()
    const internal = { depth: 0, abortCtrl: { aborted: false } }
    const ctx = createPocWorkflowContext(
      { dataReader: reader, eventBus: bus, engine: e },
      { targetId, rawDamage, damageType, finalDamage: 0 },
      internal,
    )
    return e.runWorkflow(
      'core:deal-damage',
      ctx as unknown as import('../../src/workflow/types').WorkflowContext,
      internal,
    )
  }

  it('two plugins: fire arrow vs goblin applies resistance', async () => {
    const bus = createEventBus()
    await runDealDamage(engine, bus, 'goblin-01', 10, 'fire')

    const health = usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    // goblin has fire resistance 5, so 10 - 5 = 5 actual damage, 20 - 5 = 15 hp
    expect(health.hp).toBe(15)
  })

  it('deactivate status-fx: damage = rawDamage (no resistance)', async () => {
    engine.deactivatePlugin('status-fx')

    const bus = createEventBus()
    await runDealDamage(engine, bus, 'goblin-01', 10, 'fire')

    const health = usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    // No resistance step, so full 10 damage: 20 - 10 = 10 hp
    expect(health.hp).toBe(10)
  })

  it('status-fx handler throws: core handler still executes', async () => {
    const bus = createEventBus()
    const coreResults: string[] = []

    // status-fx handler that throws
    bus.on(damageDealtEvent, () => {
      throw new Error('status-fx handler crash')
    })

    // core handler that records
    bus.on(damageDealtEvent, (payload) => {
      coreResults.push(`${payload.targetId}:-${payload.damage}`)
    })

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await runDealDamage(engine, bus, 'goblin-01', 10, 'fire')
    spy.mockRestore()

    // Core handler still executed despite status-fx handler crash
    expect(coreResults).toEqual(['goblin-01:-5'])
  })
})
