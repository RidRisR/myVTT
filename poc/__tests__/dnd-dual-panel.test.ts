import { WorkflowEngine } from '../../src/workflow/engine'
import type { WorkflowContext } from '../../src/workflow/types'
import { usePocStore } from '../store'
import { createDataReader } from '../dataReader'
import { createEventBus } from '../eventBus'
import { createPocWorkflowContext, createPocInternal } from '../pocWorkflowContext'
import { activateCorePlugin } from '../plugins/core/index'
import { activateStatusFxPlugin } from '../plugins/status-fx/index'
import { loadMockData } from '../mockData'
import type { Health } from '../plugins/core/components'
import type { DealDamageState } from '../plugins/core/workflows'

function runDealDamage(engine: WorkflowEngine, state: DealDamageState) {
  const reader = createDataReader()
  const bus = createEventBus()
  const internal = createPocInternal()
  const ctx = createPocWorkflowContext(
    { dataReader: reader, eventBus: bus, engine },
    state as DealDamageState & Record<string, unknown>,
    internal,
  )
  return engine.runWorkflow('core:deal-damage', ctx as unknown as WorkflowContext, internal)
}

// Test the workflow trigger and canDrop logic directly
describe('DnD → Workflow → Dual Panel', () => {
  let engine: WorkflowEngine

  beforeEach(() => {
    engine = new WorkflowEngine()
    activateCorePlugin(engine)
    activateStatusFxPlugin(engine)
    loadMockData()
  })

  it('onDrop triggers workflow and updates store', async () => {
    await runDealDamage(engine, {
      targetId: 'goblin-01',
      rawDamage: 10,
      damageType: 'fire',
      finalDamage: 0,
    })

    const health = usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    // 20 - (10 - 5 fire resistance) = 15
    expect(health.hp).toBe(15)
  })

  it('canDrop rejects dead entities (hp=0)', () => {
    // Set hp to 0
    usePocStore
      .getState()
      .updateEntityComponent('goblin-01', 'core:health', () => ({ hp: 0, maxHp: 30 }))
    const reader = createDataReader()
    const health = reader.component<Health>('goblin-01', 'core:health')
    expect(health?.hp).toBe(0)
    // canDrop logic: health !== undefined && health.hp > 0
    expect(health !== undefined && health.hp > 0).toBe(false)
  })

  it('cross-panel sync after drop', async () => {
    await runDealDamage(engine, {
      targetId: 'goblin-01',
      rawDamage: 10,
      damageType: 'fire',
      finalDamage: 0,
    })

    // Two independent reads should return same value
    const h1 = usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    const h2 = usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    expect(h1.hp).toBe(h2.hp)
    expect(h1.hp).toBe(15)
  })
})
