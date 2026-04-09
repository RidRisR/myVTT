// src/ui-system/__tests__/createRegionSDK.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createRegionSDK } from '../uiSystemInit'
import type { RegionSDKFactoryArgs } from '../uiSystemInit'
import type { IDataReader, IWorkflowRunner } from '../../workflow/types'

function baseArgs(overrides: Partial<RegionSDKFactoryArgs> = {}): RegionSDKFactoryArgs {
  return {
    instanceKey: 'test:region#1',
    instanceProps: {},
    role: 'GM' as const,
    layoutMode: 'play' as const,
    read: {} as IDataReader,
    workflow: { runWorkflow: vi.fn() } as unknown as IWorkflowRunner,
    awarenessManager: null,
    layoutActions: {
      openPanel: vi.fn().mockReturnValue('key#1'),
      closePanel: vi.fn(),
    },
    logSubscribe: null,
    ...overrides,
  }
}

describe('createRegionSDK', () => {
  it('returns an object with ui.resize', () => {
    const sdk = createRegionSDK(baseArgs())
    expect(typeof sdk.ui.resize).toBe('function')
  })

  it('returns an object with ui.getPortalContainer', () => {
    const sdk = createRegionSDK(baseArgs())
    expect(typeof sdk.ui.getPortalContainer).toBe('function')
  })

  it('ui.resize calls onResize callback', () => {
    const onResize = vi.fn()
    const sdk = createRegionSDK(baseArgs({ onResize }))
    sdk.ui.resize({ width: 300 })
    expect(onResize).toHaveBeenCalledWith({ width: 300, height: undefined })
  })

  it('ui.resize clamps to minSize', () => {
    const onResize = vi.fn()
    const sdk = createRegionSDK(
      baseArgs({
        onResize,
        minSize: { width: 100, height: 80 },
      }),
    )
    sdk.ui.resize({ width: 50, height: 40 })
    expect(onResize).toHaveBeenCalledWith({ width: 100, height: 80 })
  })

  it('ui.resize is a no-op when onResize not provided', () => {
    const sdk = createRegionSDK(baseArgs())
    expect(() => sdk.ui.resize({ width: 300 })).not.toThrow()
  })

  it('ui.getPortalContainer returns provided container', () => {
    const container = document.createElement('div')
    const sdk = createRegionSDK(
      baseArgs({
        getPortalContainer: () => container,
      }),
    )
    expect(sdk.ui.getPortalContainer()).toBe(container)
  })

  it('ui.getPortalContainer falls back to document.body', () => {
    const sdk = createRegionSDK(baseArgs())
    expect(sdk.ui.getPortalContainer()).toBe(document.body)
  })

  it('inherits openPanel and closePanel from layoutActions', () => {
    const openPanel = vi.fn().mockReturnValue('key#1')
    const closePanel = vi.fn()
    const sdk = createRegionSDK(
      baseArgs({
        layoutActions: { openPanel, closePanel },
      }),
    )
    sdk.ui.openPanel('test:region')
    expect(openPanel).toHaveBeenCalledWith('test:region', undefined, undefined)
    sdk.ui.closePanel('key#1')
    expect(closePanel).toHaveBeenCalledWith('key#1')
  })

  it('inherits read, workflow, context from base SDK', () => {
    const read = { getEntity: vi.fn() } as unknown as IDataReader
    const sdk = createRegionSDK(baseArgs({ read }))
    expect(sdk.read).toBe(read)
    expect(sdk.context.role).toBe('GM')
    expect(sdk.context.layoutMode).toBe('play')
  })
})
