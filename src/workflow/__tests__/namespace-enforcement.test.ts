import { describe, it, expect } from 'vitest'
import { WorkflowEngine } from '../engine'
import { PluginSDK } from '../pluginSDK'
import { TriggerRegistry } from '../triggerRegistry'

describe('Namespace enforcement — PluginSDK', () => {
  it('defineWorkflow rejects name without plugin prefix', () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, 'my-plugin')
    expect(() => sdk.defineWorkflow('bad-name', [])).toThrow('must be prefixed with "my-plugin:"')
  })

  it('defineWorkflow accepts name with plugin prefix', () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, 'my-plugin')
    expect(() => sdk.defineWorkflow('my-plugin:workflow', [])).not.toThrow()
  })

  it('registerTrigger rejects id without plugin prefix', () => {
    const engine = new WorkflowEngine()
    const triggerRegistry = new TriggerRegistry()
    const sdk = new PluginSDK(engine, 'my-plugin', undefined, triggerRegistry)
    const handle = sdk.defineWorkflow('my-plugin:wf', [])
    expect(() => {
      sdk.registerTrigger({
        id: 'bad-trigger',
        on: 'some:type',
        workflow: handle.name,
        mapInput: () => ({}),
        executeAs: 'triggering-executor',
      })
    }).toThrow('must be prefixed with "my-plugin:"')
  })

  it('registerTrigger accepts id with plugin prefix', () => {
    const engine = new WorkflowEngine()
    const triggerRegistry = new TriggerRegistry()
    const sdk = new PluginSDK(engine, 'my-plugin', undefined, triggerRegistry)
    const handle = sdk.defineWorkflow('my-plugin:wf', [])
    expect(() => {
      sdk.registerTrigger({
        id: 'my-plugin:trigger',
        on: 'some:type',
        workflow: handle.name,
        mapInput: () => ({}),
        executeAs: 'triggering-executor',
      })
    }).not.toThrow()
  })

  it('registerCommand requires dot prefix', () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, 'my-plugin')
    const handle = sdk.defineWorkflow('my-plugin:wf', [])
    expect(() => {
      sdk.registerCommand('bad', handle)
    }).toThrow('must start with "."')
  })

  it('registerCommand accepts name starting with dot', () => {
    const engine = new WorkflowEngine()
    const sdk = new PluginSDK(engine, 'my-plugin')
    const handle = sdk.defineWorkflow('my-plugin:wf', [])
    expect(() => {
      sdk.registerCommand('.test', handle)
    }).not.toThrow()
  })
})
