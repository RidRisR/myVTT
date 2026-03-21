// src/workflow/pluginSDK.test.ts
import { describe, it, expect, vi } from 'vitest'
import { PluginSDK, WorkflowRunner } from './pluginSDK'
import { WorkflowEngine } from './engine'
import type { ContextDeps } from './context'
import type { WorkflowHandle } from './types'

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
  const sdk = new PluginSDK(engine, 'test-plugin')
  return { sdk, engine }
}

function makeRunner() {
  const engine = new WorkflowEngine()
  const deps = makeDeps()
  const runner = new WorkflowRunner(engine, deps)
  return { runner, engine, deps }
}

describe('PluginSDK', () => {
  it('addStep delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const addStepSpy = vi.spyOn(engine, 'addStep')
    sdk.addStep(handle, { id: 'b', after: 'a', run: () => {} })
    expect(addStepSpy).toHaveBeenCalledWith('wf', expect.objectContaining({ id: 'b' }), 'test-plugin')
  })

  it('attachStep delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const attachSpy = vi.spyOn(engine, 'attachStep')
    sdk.attachStep(handle, { id: 'dep', to: 'a', run: () => {} })
    expect(attachSpy).toHaveBeenCalledWith('wf', expect.objectContaining({ id: 'dep' }), 'test-plugin')
  })

  it('wrapStep delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const wrapSpy = vi.spyOn(engine, 'wrapStep')
    const opts = { run: vi.fn() }
    sdk.wrapStep(handle, 'a', opts)
    expect(wrapSpy).toHaveBeenCalledWith('wf', 'a', opts)
  })

  it('replaceStep delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const replaceSpy = vi.spyOn(engine, 'replaceStep')
    const opts = { run: () => {} }
    sdk.replaceStep(handle, 'a', opts)
    expect(replaceSpy).toHaveBeenCalledWith('wf', 'a', opts)
  })

  it('removeStep delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    const removeSpy = vi.spyOn(engine, 'removeStep')
    sdk.removeStep(handle, 'a')
    expect(removeSpy).toHaveBeenCalledWith('wf', 'a')
  })

  it('inspectWorkflow delegates to engine via handle', () => {
    const { sdk, engine } = makeSDK()
    const handle = engine.defineWorkflow('wf', [{ id: 'a', run: () => {} }])
    expect(sdk.inspectWorkflow(handle)).toEqual(['a'])
  })
})

describe('WorkflowRunner', () => {
  it('runWorkflow creates context with initial data and returns result', async () => {
    const { runner, engine } = makeRunner()
    let capturedData: Record<string, unknown> = {}
    const handle = engine.defineWorkflow('run-test', [
      { id: 'capture', run: (ctx) => { capturedData = ctx.data } },
    ])
    const result = await runner.runWorkflow(handle, { value: 99 })
    expect(capturedData).toEqual({ value: 99 })
    expect(result.status).toBe('completed')
  })

  it('runWorkflow with no data creates context with empty data', async () => {
    const { runner, engine } = makeRunner()
    let capturedData: Record<string, unknown> = { placeholder: true }
    const handle = engine.defineWorkflow('empty-data', [
      { id: 'capture', run: (ctx) => { capturedData = ctx.data } },
    ])
    await runner.runWorkflow(handle)
    expect(capturedData).toEqual({})
  })

  it('runWorkflow returns errors from non-critical steps', async () => {
    const { runner, engine } = makeRunner()
    const handle = engine.defineWorkflow('errors', [
      { id: 'fail', critical: false, run: () => { throw new Error('oops') } },
      { id: 'ok', run: () => {} },
    ])
    const result = await runner.runWorkflow(handle)
    expect(result.status).toBe('completed')
    expect(result.errors).toHaveLength(1)
  })

  it('each runWorkflow call gets independent depth tracking', async () => {
    const { runner, engine } = makeRunner()
    const handle = engine.defineWorkflow('concurrent', [
      { id: 'a', run: () => {} },
    ]) as WorkflowHandle
    // Both should succeed independently
    const [r1, r2] = await Promise.all([
      runner.runWorkflow(handle),
      runner.runWorkflow(handle),
    ])
    expect(r1.status).toBe('completed')
    expect(r2.status).toBe('completed')
  })
})
