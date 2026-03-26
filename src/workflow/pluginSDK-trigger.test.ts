// src/workflow/pluginSDK-trigger.test.ts
import { describe, it, expect } from 'vitest'
import { WorkflowEngine } from './engine'
import { PluginSDK } from './pluginSDK'
import { TriggerRegistry } from './triggerRegistry'
import type { GameLogEntry } from '../shared/logTypes'

describe('PluginSDK.registerTrigger', () => {
  it('adds trigger to shared registry', () => {
    const engine = new WorkflowEngine()
    const registry = new TriggerRegistry()
    const sdk = new PluginSDK(engine, 'test-plugin', undefined, registry)

    sdk.registerTrigger({
      id: 'test-trigger',
      on: 'core:roll-result',
      filter: { rollType: 'dh:action-check' },
      workflow: 'dh:interpret',
      mapInput: (e) => ({ rolls: e.payload.rolls }),
      executeAs: 'triggering-executor',
    })

    const entry = {
      type: 'core:roll-result',
      payload: { rollType: 'dh:action-check' },
    } as unknown as GameLogEntry
    expect(registry.getMatchingTriggers(entry)).toHaveLength(1)
  })

  it('throws when triggerRegistry is not provided', () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, 'test-plugin')

    expect(() => {
      sdk.registerTrigger({
        id: 'test',
        on: 'core:roll-result',
        workflow: 'wf',
        mapInput: (e) => e.payload,
        executeAs: 'triggering-executor',
      })
    }).toThrow('TriggerRegistry not available')
  })
})
