// src/workflow/pluginSDK.test.ts
import { describe, it, expect, vi } from 'vitest'
import { PluginSDK } from './pluginSDK'
import { WorkflowEngine } from './engine'
import type { ContextDeps } from './context'

function makeDeps(): Omit<ContextDeps, 'engine'> {
  return {
    sendRoll: vi.fn().mockResolvedValue({ rolls: [[4]], total: 4 }),
    updateEntity: vi.fn(),
    updateTeamTracker: vi.fn(),
    sendMessage: vi.fn(),
    showToast: vi.fn(),
  }
}

function makeSDK() {
  const engine = new WorkflowEngine()
  const deps = makeDeps()
  const sdk = new PluginSDK(engine, deps)
  return { sdk, engine, deps }
}

describe('PluginSDK', () => {
  it('defineWorkflow delegates to engine', () => {
    const { sdk, engine } = makeSDK()
    const defineWorkflowSpy = vi.spyOn(engine, 'defineWorkflow')
    sdk.defineWorkflow('test', [])
    expect(defineWorkflowSpy).toHaveBeenCalledWith('test', [])
  })

  it('addStep delegates to engine', () => {
    const { sdk, engine } = makeSDK()
    sdk.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const addStepSpy = vi.spyOn(engine, 'addStep')
    const addition = { id: 'b', after: 'a', run: () => {} }
    sdk.addStep('wf', addition)
    expect(addStepSpy).toHaveBeenCalledWith('wf', addition)
  })

  it('wrapStep delegates to engine', () => {
    const { sdk, engine } = makeSDK()
    sdk.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const wrapStepSpy = vi.spyOn(engine, 'wrapStep')
    const options = { run: vi.fn() }
    sdk.wrapStep('wf', 'a', options)
    expect(wrapStepSpy).toHaveBeenCalledWith('wf', 'a', options)
  })

  it('removeStep delegates to engine', () => {
    const { sdk, engine } = makeSDK()
    sdk.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const removeStepSpy = vi.spyOn(engine, 'removeStep')
    sdk.removeStep('wf', 'a')
    expect(removeStepSpy).toHaveBeenCalledWith('wf', 'a')
  })

  it('inspectWorkflow delegates to engine', () => {
    const { sdk, engine } = makeSDK()
    sdk.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const inspectSpy = vi.spyOn(engine, 'inspectWorkflow')
    const result = sdk.inspectWorkflow('wf')
    expect(inspectSpy).toHaveBeenCalledWith('wf')
    expect(result).toEqual(['a'])
  })

  it('runWorkflow creates context with initial data and runs workflow', async () => {
    const { sdk, engine } = makeSDK()
    let capturedData: Record<string, unknown> = {}
    engine.defineWorkflow('run-test', [
      {
        id: 'capture',
        run: (ctx) => {
          capturedData = ctx.data
        },
      },
    ])
    await sdk.runWorkflow('run-test', { value: 99 })
    expect(capturedData).toEqual({ value: 99 })
  })

  it('runWorkflow with no data creates context with empty data', async () => {
    const { sdk, engine } = makeSDK()
    let capturedData: Record<string, unknown> = { placeholder: true }
    engine.defineWorkflow('empty-data', [
      {
        id: 'capture',
        run: (ctx) => {
          capturedData = ctx.data
        },
      },
    ])
    await sdk.runWorkflow('empty-data')
    expect(capturedData).toEqual({})
  })
})
