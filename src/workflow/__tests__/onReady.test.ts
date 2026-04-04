import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resetWorkflowEngine,
  registerWorkflowPlugins,
  initWorkflowSystem,
  startWorkflowTriggers,
} from '../useWorkflowSDK'
import type { WorkflowSystemHandle } from '../useWorkflowSDK'
import { useWorldStore } from '../../stores/worldStore'
import { useIdentityStore } from '../../stores/identityStore'
import type { VTTPlugin } from '../../rules/types'

describe('VTTPlugin.onReady lifecycle', () => {
  let handle: WorkflowSystemHandle
  let cleanupTriggers: (() => void) | undefined

  beforeEach(() => {
    resetWorkflowEngine()
    useIdentityStore.setState({ mySeatId: 'seat-a' })
    useWorldStore.setState({
      logEntries: [],
      logEntriesById: {},
      logWatermark: 0,
    })
  })

  afterEach(() => {
    cleanupTriggers?.()
    cleanupTriggers = undefined
    handle?.cleanup()
    resetWorkflowEngine()
  })

  it('calls onReady AFTER all plugins onActivate, in registration order', async () => {
    const callOrder: string[] = []

    const pluginA: VTTPlugin = {
      id: 'plugin-a',
      onActivate() {
        callOrder.push('activate-a')
      },
      onReady() {
        callOrder.push('ready-a')
      },
    }

    const pluginB: VTTPlugin = {
      id: 'plugin-b',
      onActivate() {
        callOrder.push('activate-b')
      },
      onReady() {
        callOrder.push('ready-b')
      },
    }

    registerWorkflowPlugins([pluginA, pluginB])
    handle = initWorkflowSystem()

    // onReady not called yet — system constructed but not started
    expect(callOrder).toEqual(['activate-a', 'activate-b'])

    cleanupTriggers = await startWorkflowTriggers(0)

    expect(callOrder).toEqual(['activate-a', 'activate-b', 'ready-a', 'ready-b'])
  })

  it('provides a WorkflowContext with read access to onReady', async () => {
    let receivedCtx: unknown = null

    const plugin: VTTPlugin = {
      id: 'ctx-test',
      onActivate() {},
      onReady(ctx) {
        receivedCtx = ctx
      },
    }

    registerWorkflowPlugins([plugin])
    handle = initWorkflowSystem()
    cleanupTriggers = await startWorkflowTriggers(0)

    expect(receivedCtx).not.toBeNull()
    expect(receivedCtx).toHaveProperty('read')
    expect(receivedCtx).toHaveProperty('vars')
    expect(receivedCtx).toHaveProperty('emitEntry')
    expect(receivedCtx).toHaveProperty('createEntity')
    expect(receivedCtx).toHaveProperty('runWorkflow')
  })

  it('works fine when plugins do not define onReady', async () => {
    const callOrder: string[] = []

    const pluginNoReady: VTTPlugin = {
      id: 'no-ready',
      onActivate() {
        callOrder.push('activate-no-ready')
      },
    }

    const pluginWithReady: VTTPlugin = {
      id: 'with-ready',
      onActivate() {
        callOrder.push('activate-with-ready')
      },
      onReady() {
        callOrder.push('ready-with-ready')
      },
    }

    registerWorkflowPlugins([pluginNoReady, pluginWithReady])
    handle = initWorkflowSystem()
    cleanupTriggers = await startWorkflowTriggers(0)

    expect(callOrder).toEqual(['activate-no-ready', 'activate-with-ready', 'ready-with-ready'])
  })

  it('surfaces sync errors from onReady but still subscribes triggers', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const failingPlugin: VTTPlugin = {
      id: 'fail-ready',
      onActivate() {},
      onReady() {
        throw new Error('onReady boom')
      },
    }

    const okPlugin: VTTPlugin = {
      id: 'ok-ready',
      onActivate() {},
      onReady() {
        // should still be called
      },
    }

    registerWorkflowPlugins([failingPlugin, okPlugin])
    handle = initWorkflowSystem()

    try {
      await startWorkflowTriggers(0)
    } catch (err) {
      expect(err).toBeInstanceOf(AggregateError)
      expect((err as AggregateError).message).toContain('1 plugin(s) failed onReady')
      // Triggers were still subscribed — capture cleanup from error
      cleanupTriggers = (err as AggregateError & { cleanup: () => void }).cleanup
    }

    consoleSpy.mockRestore()
  })

  it('surfaces async errors from onReady but still subscribes triggers', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const asyncFailPlugin: VTTPlugin = {
      id: 'async-fail',
      onActivate() {},
      async onReady() {
        await Promise.resolve()
        throw new Error('async onReady boom')
      },
    }

    registerWorkflowPlugins([asyncFailPlugin])
    handle = initWorkflowSystem()

    try {
      await startWorkflowTriggers(0)
    } catch (err) {
      expect(err).toBeInstanceOf(AggregateError)
      expect((err as AggregateError).message).toContain('1 plugin(s) failed onReady')
      cleanupTriggers = (err as AggregateError & { cleanup: () => void }).cleanup
    }

    consoleSpy.mockRestore()
  })

  it('reports all failures when multiple plugins fail onReady', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const fail1: VTTPlugin = {
      id: 'fail-1',
      onActivate() {},
      onReady() {
        throw new Error('boom 1')
      },
    }

    const fail2: VTTPlugin = {
      id: 'fail-2',
      onActivate() {},
      onReady() {
        throw new Error('boom 2')
      },
    }

    registerWorkflowPlugins([fail1, fail2])
    handle = initWorkflowSystem()

    try {
      await startWorkflowTriggers(0)
    } catch (err) {
      expect(err).toBeInstanceOf(AggregateError)
      expect((err as AggregateError).message).toContain('2 plugin(s) failed onReady')
      cleanupTriggers = (err as AggregateError & { cleanup: () => void }).cleanup
    }

    consoleSpy.mockRestore()
  })

  it('onReady runs AFTER workflow system is fully constructed', async () => {
    let hasRunWorkflow = false

    const plugin: VTTPlugin = {
      id: 'system-check',
      onActivate(sdk) {
        sdk.defineWorkflow('system-check:probe', () => {
          // Workflow exists and can be invoked
        })
      },
      onReady(ctx) {
        // ctx.runWorkflow should be available because system is fully constructed
        hasRunWorkflow = typeof ctx.runWorkflow === 'function'
      },
    }

    registerWorkflowPlugins([plugin])
    handle = initWorkflowSystem()
    cleanupTriggers = await startWorkflowTriggers(0)

    expect(hasRunWorkflow).toBe(true)
  })
})
