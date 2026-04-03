import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resetWorkflowEngine,
  registerWorkflowPlugins,
  initWorkflowSystem,
} from '../useWorkflowSDK'
import { useWorldStore } from '../../stores/worldStore'
import { useIdentityStore } from '../../stores/identityStore'
import type { VTTPlugin } from '../../rules/types'

describe('VTTPlugin.onReady lifecycle', () => {
  let cleanup: () => void

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
    cleanup?.()
    resetWorkflowEngine()
  })

  it('calls onReady AFTER all plugins onActivate, in registration order', () => {
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
    cleanup = initWorkflowSystem()

    expect(callOrder).toEqual(['activate-a', 'activate-b', 'ready-a', 'ready-b'])
  })

  it('provides a WorkflowContext with read access to onReady', () => {
    let receivedCtx: unknown = null

    const plugin: VTTPlugin = {
      id: 'ctx-test',
      onActivate() {},
      onReady(ctx) {
        receivedCtx = ctx
      },
    }

    registerWorkflowPlugins([plugin])
    cleanup = initWorkflowSystem()

    expect(receivedCtx).not.toBeNull()
    // WorkflowContext should have read, vars, emitEntry, etc.
    expect(receivedCtx).toHaveProperty('read')
    expect(receivedCtx).toHaveProperty('vars')
    expect(receivedCtx).toHaveProperty('emitEntry')
    expect(receivedCtx).toHaveProperty('createEntity')
    expect(receivedCtx).toHaveProperty('runWorkflow')
  })

  it('works fine when plugins do not define onReady', () => {
    const callOrder: string[] = []

    const pluginNoReady: VTTPlugin = {
      id: 'no-ready',
      onActivate() {
        callOrder.push('activate-no-ready')
      },
      // no onReady
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
    cleanup = initWorkflowSystem()

    expect(callOrder).toEqual([
      'activate-no-ready',
      'activate-with-ready',
      'ready-with-ready',
    ])
  })

  it('catches and logs errors from onReady without crashing', () => {
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
    // Should not throw
    cleanup = initWorkflowSystem()

    consoleSpy.mockRestore()
  })
})
