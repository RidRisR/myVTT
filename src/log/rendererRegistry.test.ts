import { describe, it, expect, beforeEach } from 'vitest'
import { registerRenderer, getRenderer, clearRenderers } from './rendererRegistry'

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
