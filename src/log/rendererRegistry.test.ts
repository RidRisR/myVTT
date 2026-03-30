import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerRenderer,
  getRenderer,
  clearRenderers,
  createRendererPoint,
} from './rendererRegistry'

// Minimal React component mocks — only testing Map logic, not rendering
const DummyA = () => null
const DummyB = () => null

describe('rendererRegistry', () => {
  beforeEach(() => {
    clearRenderers()
  })

  it('register and get renderer by (surface, type)', () => {
    registerRenderer('chat', 'core:text', DummyA)
    expect(getRenderer('chat', 'core:text')).toBe(DummyA)
  })

  it('get returns undefined for unregistered', () => {
    expect(getRenderer('chat', 'core:text')).toBeUndefined()
  })

  it('first registration wins (no overwrite)', () => {
    registerRenderer('chat', 'core:text', DummyA)
    registerRenderer('chat', 'core:text', DummyB)
    expect(getRenderer('chat', 'core:text')).toBe(DummyA)
  })

  it('different surfaces have different renderers for same type', () => {
    registerRenderer('chat', 'core:text', DummyA)
    registerRenderer('toast', 'core:text', DummyB)
    expect(getRenderer('chat', 'core:text')).toBe(DummyA)
    expect(getRenderer('toast', 'core:text')).toBe(DummyB)
  })

  it('clear removes all registrations', () => {
    registerRenderer('chat', 'core:text', DummyA)
    registerRenderer('toast', 'core:roll-result', DummyB)
    clearRenderers()
    expect(getRenderer('chat', 'core:text')).toBeUndefined()
    expect(getRenderer('toast', 'core:roll-result')).toBeUndefined()
  })
})

describe('RendererPoint<T> typed API', () => {
  beforeEach(() => {
    clearRenderers()
  })

  it('register and get via RendererPoint token', () => {
    const point = createRendererPoint<() => null>('chat', 'core:text')
    const Dummy = () => null
    registerRenderer(point, Dummy)
    expect(getRenderer(point)).toBe(Dummy)
  })

  it('string API and token API share the same registry', () => {
    const Dummy = () => null
    registerRenderer('chat', 'core:text', Dummy)
    const point = createRendererPoint<{ entry: unknown }>('chat', 'core:text')
    expect(getRenderer(point)).toBe(Dummy)
  })

  it('token get returns undefined for unregistered', () => {
    const point = createRendererPoint<{ entry: unknown }>('chat', 'missing')
    expect(getRenderer(point)).toBeUndefined()
  })

  it('non-component values can be registered (config objects)', () => {
    const point = createRendererPoint<{ dieConfigs: { color: string }[] }>(
      'rollResult',
      'test:roll',
    )
    const config = { dieConfigs: [{ color: '#fff' }] }
    registerRenderer(point, config)
    expect(getRenderer(point)).toBe(config)
  })
})
