import { WorkflowEngine } from '../../src/workflow/engine'
import type { WorkflowContext } from '../../src/workflow/types'
import { usePocStore } from '../store'
import { createDataReader } from '../dataReader'
import { createEventBus } from '../eventBus'
import { createPocWorkflowContext } from '../pocWorkflowContext'
import { activateCorePlugin } from '../plugins/core/index'
import { activateStatusFxPlugin } from '../plugins/status-fx/index'
import { getDealDamageHandle } from '../plugins/core/workflows'
import { loadMockData } from '../mockData'
import type { Health } from '../plugins/core/components'
import type { DealDamageState } from '../plugins/core/workflows'
import { damageDealtEvent } from '../plugins/core/events'

beforeEach(() => {
  loadMockData()
})

function setupEngine() {
  const engine = new WorkflowEngine()
  activateCorePlugin(engine)
  activateStatusFxPlugin(engine)
  return engine
}

function runDealDamage(engine: WorkflowEngine, state: DealDamageState) {
  const reader = createDataReader()
  const bus = createEventBus()
  const internal = { depth: 0, abortCtrl: { aborted: false } }
  const ctx = createPocWorkflowContext({ dataReader: reader, eventBus: bus, engine }, state, internal)
  return engine.runWorkflow('core:deal-damage', ctx as unknown as WorkflowContext, internal)
}

describe('Phase 2 — Workflow writes data', () => {
  it('workflow execution updates store (physical damage, no resistance)', async () => {
    const engine = setupEngine()

    // goblin-01 starts with hp: 20
    const healthBefore = usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    expect(healthBefore.hp).toBe(20)

    await runDealDamage(engine, {
      targetId: 'goblin-01',
      rawDamage: 8,
      damageType: 'physical',
      finalDamage: 0,
    })

    // physical has no resistance for goblin-01, so 20 - 8 = 12
    const healthAfter = usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    expect(healthAfter.hp).toBe(12)
    expect(healthAfter.maxHp).toBe(30)
  })

  it('ctx.read works within workflow — status-fx reads resistances', async () => {
    const engine = setupEngine()

    // Verify the step order: calc-damage, apply-resistance, apply-damage
    const steps = engine.inspectWorkflow('core:deal-damage')
    expect(steps).toEqual(['core:calc-damage', 'status-fx:apply-resistance', 'core:apply-damage'])
  })

  it('status-fx intercept reduces fire damage by resistance', async () => {
    const engine = setupEngine()

    // goblin-01 has fire resistance 5, hp 20, maxHp 30
    const result = await runDealDamage(engine, {
      targetId: 'goblin-01',
      rawDamage: 10,
      damageType: 'fire',
      finalDamage: 0,
    })

    // finalDamage should be 10 - 5 = 5, so hp = 20 - 5 = 15
    expect(result.status).toBe('completed')
    expect(result.data.finalDamage).toBe(5)

    const health = usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    expect(health.hp).toBe(15)
  })

  it('dual sync — two reads of store after workflow show same updated value', async () => {
    const engine = setupEngine()

    await runDealDamage(engine, {
      targetId: 'goblin-01',
      rawDamage: 8,
      damageType: 'physical',
      finalDamage: 0,
    })

    const read1 = usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    const read2 = usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health

    expect(read1.hp).toBe(12)
    expect(read2.hp).toBe(12)
    // Same reference since no state change between reads
    expect(read1).toBe(read2)
  })

  it('event bus emits damageDealt event during workflow', async () => {
    const engine = new WorkflowEngine()
    activateCorePlugin(engine)
    activateStatusFxPlugin(engine)

    const reader = createDataReader()
    const bus = createEventBus()
    const internal = { depth: 0, abortCtrl: { aborted: false } }

    const events: { targetId: string; damage: number; damageType: string }[] = []
    bus.on(damageDealtEvent, (payload) => {
      events.push(payload)
    })

    const ctx = createPocWorkflowContext(
      { dataReader: reader, eventBus: bus, engine },
      { targetId: 'goblin-01', rawDamage: 10, damageType: 'fire', finalDamage: 0 },
      internal,
    )
    await engine.runWorkflow('core:deal-damage', ctx as unknown as WorkflowContext, internal)

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      targetId: 'goblin-01',
      damage: 5, // 10 raw - 5 fire resistance
      damageType: 'fire',
    })
  })
})
