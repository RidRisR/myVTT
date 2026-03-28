import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getUIRegistry,
  getExtensionRegistry,
  createProductionSDK,
  _resetRegistriesForTesting,
} from '../uiSystemInit'

beforeEach(() => {
  _resetRegistriesForTesting()
})

describe('registry singletons', () => {
  it('getUIRegistry returns the same instance', () => {
    expect(getUIRegistry()).toBe(getUIRegistry())
  })

  it('getExtensionRegistry returns the same instance', () => {
    expect(getExtensionRegistry()).toBe(getExtensionRegistry())
  })

  it('reset creates new instances', () => {
    const first = getUIRegistry()
    _resetRegistriesForTesting()
    expect(getUIRegistry()).not.toBe(first)
  })
})

describe('createProductionSDK', () => {
  const baseArgs = {
    instanceKey: 'test.panel#1',
    instanceProps: { entityId: 'e1' },
    role: 'GM' as const,
    layoutMode: 'play' as const,
    read: {
      entity: () => undefined,
      component: () => undefined,
      query: () => [],
      formulaTokens: () => ({}),
    },
    workflow: { runWorkflow: vi.fn() } as never,
    awarenessManager: null,
    layoutActions: null,
    logSubscribe: null,
  }

  it('returns IComponentSDK with required fields', () => {
    const sdk = createProductionSDK(baseArgs)
    expect(sdk.read).toBeDefined()
    expect(sdk.workflow).toBeDefined()
    expect(sdk.context.layoutMode).toBe('play')
    expect(sdk.context.role).toBe('GM')
    expect(sdk.context.instanceProps).toEqual({ entityId: 'e1' })
  })

  it('injects interaction in play mode', () => {
    const sdk = createProductionSDK(baseArgs)
    expect(sdk.interaction).toBeDefined()
    expect(sdk.interaction!.layout).toBeDefined()
    expect(sdk.interaction!.dnd).toBeDefined()
  })

  it('does not inject interaction in edit mode', () => {
    const sdk = createProductionSDK({ ...baseArgs, layoutMode: 'edit' })
    expect(sdk.interaction).toBeUndefined()
  })

  it('wires awareness when manager is provided', () => {
    const mockManager = {
      subscribe: vi.fn().mockReturnValue(() => {}),
      broadcast: vi.fn(),
      clear: vi.fn(),
    }
    const sdk = createProductionSDK({
      ...baseArgs,
      awarenessManager: mockManager as never,
    })
    expect(sdk.awareness).toBeDefined()
    expect(sdk.awareness.subscribe).toBeDefined()
    expect(sdk.awareness.broadcast).toBeDefined()
    expect(sdk.awareness.clear).toBeDefined()
  })

  it('awareness is a no-op object when no manager', () => {
    const sdk = createProductionSDK(baseArgs)
    expect(sdk.awareness).toBeDefined()
    expect(typeof sdk.awareness.subscribe).toBe('function')
    expect(typeof sdk.awareness.broadcast).toBe('function')
    expect(typeof sdk.awareness.clear).toBe('function')
  })

  it('wires log when logSubscribe is provided', () => {
    const mockLogSub = vi.fn().mockReturnValue(() => {})
    const sdk = createProductionSDK({
      ...baseArgs,
      logSubscribe: mockLogSub,
    })
    expect(sdk.log).toBeDefined()
    expect(sdk.log.subscribe).toBe(mockLogSub)
  })

  it('wires ui when layoutActions is provided', () => {
    const mockActions = {
      openPanel: vi.fn().mockReturnValue('new#1'),
      closePanel: vi.fn(),
    }
    const sdk = createProductionSDK({
      ...baseArgs,
      layoutActions: mockActions,
    })
    expect(sdk.ui).toBeDefined()
    expect(sdk.ui.openPanel).toBe(mockActions.openPanel)
    expect(sdk.ui.closePanel).toBe(mockActions.closePanel)
  })

  it('ui is a no-op object when no layoutActions', () => {
    const sdk = createProductionSDK(baseArgs)
    expect(sdk.ui).toBeDefined()
    expect(typeof sdk.ui.openPanel).toBe('function')
    expect(typeof sdk.ui.closePanel).toBe('function')
  })
})
