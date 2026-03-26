import { describe, it, expect, beforeEach } from 'vitest'
import { TriggerRegistry } from './triggerRegistry'
import type { TriggerDefinition, GameLogEntry } from '../shared/logTypes'

function makeEntry(type: string, payload: Record<string, unknown> = {}): GameLogEntry {
  return { type, payload } as unknown as GameLogEntry
}

function makeTrigger(
  id: string,
  on: string,
  workflow = 'wf1',
  filter?: Record<string, unknown>,
): TriggerDefinition {
  return {
    id,
    on,
    filter,
    workflow,
    mapInput: (entry) => entry.payload,
    executeAs: 'triggering-executor',
  }
}

describe('TriggerRegistry', () => {
  let registry: TriggerRegistry

  beforeEach(() => {
    registry = new TriggerRegistry()
  })

  it('returns matching trigger for matching entry type', () => {
    const trigger = makeTrigger('t1', 'roll:completed')
    registry.register(trigger)

    const matches = registry.getMatchingTriggers(makeEntry('roll:completed'))
    expect(matches).toHaveLength(1)
    expect(matches[0]).toBe(trigger)
  })

  it('returns all triggers when multiple are registered on the same type', () => {
    const t1 = makeTrigger('t1', 'roll:completed', 'wf1')
    const t2 = makeTrigger('t2', 'roll:completed', 'wf2')
    registry.register(t1)
    registry.register(t2)

    const matches = registry.getMatchingTriggers(makeEntry('roll:completed'))
    expect(matches).toHaveLength(2)
    expect(matches).toContain(t1)
    expect(matches).toContain(t2)
  })

  it('returns trigger when payload matches filter', () => {
    const trigger = makeTrigger('t1', 'roll:completed', 'wf1', { rollType: 'dh:action-check' })
    registry.register(trigger)

    const matches = registry.getMatchingTriggers(
      makeEntry('roll:completed', { rollType: 'dh:action-check', result: 42 }),
    )
    expect(matches).toHaveLength(1)
    expect(matches[0]).toBe(trigger)
  })

  it('returns no triggers when filter value does not match payload', () => {
    const trigger = makeTrigger('t1', 'roll:completed', 'wf1', { rollType: 'dh:action-check' })
    registry.register(trigger)

    const matches = registry.getMatchingTriggers(
      makeEntry('roll:completed', { rollType: 'dh:other-roll' }),
    )
    expect(matches).toHaveLength(0)
  })

  it('returns empty array when no triggers are registered', () => {
    const matches = registry.getMatchingTriggers(makeEntry('roll:completed'))
    expect(matches).toHaveLength(0)
  })

  it('clear() removes all triggers', () => {
    registry.register(makeTrigger('t1', 'roll:completed'))
    registry.register(makeTrigger('t2', 'some:event'))
    registry.clear()

    expect(registry.getMatchingTriggers(makeEntry('roll:completed'))).toHaveLength(0)
    expect(registry.getMatchingTriggers(makeEntry('some:event'))).toHaveLength(0)
  })
})
