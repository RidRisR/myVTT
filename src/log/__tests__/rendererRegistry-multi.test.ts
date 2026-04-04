import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerRenderer,
  getRenderer,
  getAllRenderers,
  clearRenderers,
  createRendererPoint,
  type LogEntryRenderer,
} from '../rendererRegistry'

const DummyA = () => null
const DummyB = () => null
const DummyC = () => null

beforeEach(() => {
  clearRenderers()
})

describe('getAllRenderers', () => {
  it('returns empty array when no registrations', () => {
    expect(getAllRenderers('entity', 'hp-bar')).toEqual([])
  })

  it('returns single item after one registration', () => {
    registerRenderer('entity', 'hp-bar', DummyA as unknown as LogEntryRenderer)
    expect(getAllRenderers('entity', 'hp-bar')).toEqual([DummyA])
  })

  it('accumulates multiple registrations under same key for multi-surfaces', () => {
    registerRenderer('entity', 'hp-bar', DummyA as unknown as LogEntryRenderer)
    registerRenderer('entity', 'hp-bar', DummyB as unknown as LogEntryRenderer)
    registerRenderer('entity', 'hp-bar', DummyC as unknown as LogEntryRenderer)
    expect(getAllRenderers('entity', 'hp-bar')).toEqual([DummyA, DummyB, DummyC])
  })

  it('accumulates for combat surface too', () => {
    registerRenderer('combat', 'token-action', DummyA as unknown as LogEntryRenderer)
    registerRenderer('combat', 'token-action', DummyB as unknown as LogEntryRenderer)
    expect(getAllRenderers('combat', 'token-action')).toEqual([DummyA, DummyB])
  })

  it('getRenderer still returns first registered value (backward compat)', () => {
    registerRenderer('entity', 'hp-bar', DummyA as unknown as LogEntryRenderer)
    registerRenderer('entity', 'hp-bar', DummyB as unknown as LogEntryRenderer)
    expect(getRenderer('entity', 'hp-bar')).toBe(DummyA)
  })

  it('works with typed RendererPoint<T> tokens', () => {
    type BarConfig = { color: string; max: number }
    const point = createRendererPoint<BarConfig>('entity', 'hp-bar')
    const cfgA: BarConfig = { color: 'red', max: 10 }
    const cfgB: BarConfig = { color: 'blue', max: 20 }
    registerRenderer(point, cfgA)
    registerRenderer(point, cfgB)

    const all = getAllRenderers(point)
    expect(all).toEqual([cfgA, cfgB])
    // getRenderer returns the first one
    expect(getRenderer(point)).toBe(cfgA)
  })

  it('clearRenderers removes all multi-registrations', () => {
    registerRenderer('entity', 'hp-bar', DummyA as unknown as LogEntryRenderer)
    registerRenderer('entity', 'hp-bar', DummyB as unknown as LogEntryRenderer)
    registerRenderer('combat', 'token-action', DummyC as unknown as LogEntryRenderer)
    clearRenderers()
    expect(getAllRenderers('entity', 'hp-bar')).toEqual([])
    expect(getAllRenderers('combat', 'token-action')).toEqual([])
  })
})

describe('non-multi surfaces still warn on duplicate (backward compat)', () => {
  it('chat surface: second registration is skipped', () => {
    registerRenderer('chat', 'core:text', DummyA)
    registerRenderer('chat', 'core:text', DummyB)
    expect(getRenderer('chat', 'core:text')).toBe(DummyA)
    // Only one item stored
    expect(getAllRenderers('chat', 'core:text')).toEqual([DummyA])
  })

  it('rollResult surface: second registration is skipped', () => {
    const point = createRendererPoint<{ dieConfigs: unknown[] }>('rollResult', 'test:roll')
    const cfgA = { dieConfigs: [{ color: '#fff' }] }
    const cfgB = { dieConfigs: [{ color: '#000' }] }
    registerRenderer(point, cfgA)
    registerRenderer(point, cfgB)
    expect(getRenderer(point)).toBe(cfgA)
    expect(getAllRenderers(point)).toEqual([cfgA])
  })
})
