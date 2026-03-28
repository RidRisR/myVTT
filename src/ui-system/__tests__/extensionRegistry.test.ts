import { describe, it, expect } from 'vitest'
import { ExtensionRegistry, createExtensionPoint, logRenderer } from '../extensionRegistry'

const mockComponent = () => null

describe('ExtensionRegistry', () => {
  it('contribute + get returns the component', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<{ name: string }>('core:test.slot')
    registry.contribute(point, mockComponent as never)
    expect(registry.get(point)).toBe(mockComponent)
  })

  it('get returns undefined when nothing contributed', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<{ name: string }>('core:test.empty')
    expect(registry.get(point)).toBeUndefined()
  })

  it('getAll returns all contributions in priority order (highest first)', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<{ x: number }>('core:test.multi')
    const compA = (() => 'A') as never
    const compB = (() => 'B') as never
    const compC = (() => 'C') as never
    registry.contribute(point, compA, 10)
    registry.contribute(point, compB, 30)
    registry.contribute(point, compC, 20)
    expect(registry.getAll(point)).toEqual([compB, compC, compA])
  })

  it('get returns highest priority contribution', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<object>('core:test.prio')
    const low = (() => 'low') as never
    const high = (() => 'high') as never
    registry.contribute(point, low, 1)
    registry.contribute(point, high, 99)
    expect(registry.get(point)).toBe(high)
  })

  it('default priority is 0', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<object>('core:test.default-prio')
    const compA = (() => 'A') as never
    const compB = (() => 'B') as never
    registry.contribute(point, compA) // priority 0
    registry.contribute(point, compB, 1) // priority 1
    expect(registry.get(point)).toBe(compB)
  })

  it('getAll returns empty array when nothing contributed', () => {
    const registry = new ExtensionRegistry()
    const point = createExtensionPoint<object>('core:test.none')
    expect(registry.getAll(point)).toEqual([])
  })
})

describe('logRenderer', () => {
  it('creates an extension point keyed by log entry type', () => {
    const point = logRenderer('dh:judgment')
    expect(point.key).toBe('dh:judgment')
  })
})
