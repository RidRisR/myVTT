/**
 * E2E full-chain verification:
 *   Spell drop → workflow (with cross-plugin resistance) → store update
 *   → EventBus emit → subscriber receives event → dual-panel sync
 *
 * Uses the singleton eventBus (same as PocApp) to verify events reach
 * subscribers through the same instance.
 */
import { WorkflowEngine } from '../../src/workflow/engine'
import type { WorkflowContext } from '../../src/workflow/types'
import { usePocStore } from '../store'
import { createDataReader } from '../dataReader'
import { eventBus } from '../eventBus'
import { createPocWorkflowContext, createPocInternal } from '../pocWorkflowContext'
import { activateCorePlugin } from '../plugins/core/index'
import { activateStatusFxPlugin } from '../plugins/status-fx/index'
import { loadMockData } from '../mockData'
import { damageDealtEvent } from '../plugins/core/events'
import type { DamageDealtPayload } from '../plugins/core/events'
import type { Health } from '../plugins/core/components'

describe('E2E full-chain verification', () => {
  let engine: WorkflowEngine
  let cleanup: (() => void)[]

  beforeEach(() => {
    engine = new WorkflowEngine()
    activateCorePlugin(engine)
    activateStatusFxPlugin(engine)
    loadMockData()
    cleanup = []
  })

  afterEach(() => {
    cleanup.forEach((fn) => {
      fn()
    })
  })

  /** Run deal-damage workflow using singleton eventBus — mirrors PocApp wiring */
  async function castSpell(targetId: string, damage: number, damageType: string) {
    const reader = createDataReader()
    const internal = createPocInternal()
    const ctx = createPocWorkflowContext(
      { dataReader: reader, eventBus, engine },
      { targetId, rawDamage: damage, damageType, finalDamage: 0 },
      internal,
    )
    return engine.runWorkflow('core:deal-damage', ctx as unknown as WorkflowContext, internal)
  }

  it('spell drop → workflow → store update → event → dual-panel sync', async () => {
    // 1. Subscribe to singleton EventBus (simulates DamageLog + EntityCard flash)
    const receivedEvents: DamageDealtPayload[] = []
    const unsub = eventBus.on(damageDealtEvent, (payload) => {
      receivedEvents.push(payload)
    })
    cleanup.push(unsub)

    // 2. Verify initial state
    const hpBefore = (
      usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    ).hp
    expect(hpBefore).toBe(20)

    // 3. Cast Fire Arrow on goblin-01 (fire resistance 5)
    await castSpell('goblin-01', 10, 'fire')

    // 4. Verify store updated (HP reduced with fire resistance 5)
    const hpAfter = (
      usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health
    ).hp
    expect(hpAfter).toBe(15) // 20 - (10 - 5 resistance) = 15

    // 5. Verify EventBus delivered the event (DamageLog would receive this)
    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0]).toEqual({
      targetId: 'goblin-01',
      damage: 5,
      damageType: 'fire',
    })

    // 6. Verify dual-panel sync — two independent reads return same reference
    const read1 = usePocStore.getState().entities['goblin-01']?.components['core:health']
    const read2 = usePocStore.getState().entities['goblin-01']?.components['core:health']
    expect(read1).toBe(read2)
    expect((read1 as Health).hp).toBe(15)
  })

  it('multiple spells accumulate damage and events', async () => {
    const receivedEvents: DamageDealtPayload[] = []
    const unsub = eventBus.on(damageDealtEvent, (payload) => {
      receivedEvents.push(payload)
    })
    cleanup.push(unsub)

    // Cast Fire Arrow (10 fire → 5 after resistance) on goblin-01
    await castSpell('goblin-01', 10, 'fire')
    // Cast Lightning Bolt (15 lightning → no resistance → 15) on goblin-01
    await castSpell('goblin-01', 15, 'lightning')

    const hp = (usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health)
      .hp
    // 20 - 5 - 15 = 0 (clamped at 0)
    expect(hp).toBe(0)

    // Both events delivered in order
    expect(receivedEvents).toHaveLength(2)
    expect(receivedEvents[0]!.damage).toBe(5)
    expect(receivedEvents[1]!.damage).toBe(15)
  })

  it('dead entity (hp=0) rejects spell drop via canDrop', async () => {
    // Kill goblin-01
    await castSpell('goblin-01', 100, 'lightning')

    const hp = (usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health)
      .hp
    expect(hp).toBe(0)

    // Simulate canDrop check (what makeDropZone does before allowing drop)
    const reader = createDataReader()
    const health = reader.component<Health>('goblin-01', 'core:health')
    const canDrop = health !== undefined && health.hp > 0
    expect(canDrop).toBe(false)
  })

  it('cross-plugin degradation: deactivate status-fx → full damage', async () => {
    const receivedEvents: DamageDealtPayload[] = []
    const unsub = eventBus.on(damageDealtEvent, (payload) => {
      receivedEvents.push(payload)
    })
    cleanup.push(unsub)

    // Deactivate status-fx plugin
    engine.deactivatePlugin('status-fx')

    await castSpell('goblin-01', 10, 'fire')

    // No resistance reduction → full 10 damage
    const hp = (usePocStore.getState().entities['goblin-01']?.components['core:health'] as Health)
      .hp
    expect(hp).toBe(10) // 20 - 10

    expect(receivedEvents[0]!.damage).toBe(10)
  })

  it('hero-01 has no fire resistance → takes full fire damage', async () => {
    await castSpell('hero-01', 10, 'fire')

    const hp = (usePocStore.getState().entities['hero-01']?.components['core:health'] as Health).hp
    expect(hp).toBe(35) // 45 - 10 (fire resistance is 0)
  })

  it('hero-01 ice resistance reduces Ice Shard damage', async () => {
    await castSpell('hero-01', 8, 'ice')

    const hp = (usePocStore.getState().entities['hero-01']?.components['core:health'] as Health).hp
    // hero-01 has ice resistance 10, so max(0, 8 - 10) = 0 damage
    expect(hp).toBe(45)
  })
})
