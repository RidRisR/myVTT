import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerRenderer,
  clearRenderers,
  getChatVisibleTypes,
  type LogEntryRenderer,
} from '../rendererRegistry'

beforeEach(() => {
  clearRenderers()
})

describe('getChatVisibleTypes', () => {
  it('returns empty set when no chat renderers registered', () => {
    const types = getChatVisibleTypes()
    expect(types.size).toBe(0)
  })

  it('includes types registered on the chat surface', () => {
    registerRenderer('chat', 'core:text', (() => null) as unknown as LogEntryRenderer)
    registerRenderer('chat', 'core:roll-result', (() => null) as unknown as LogEntryRenderer)
    const types = getChatVisibleTypes()
    expect(types.has('core:text')).toBe(true)
    expect(types.has('core:roll-result')).toBe(true)
  })

  it('does not include types registered on other surfaces', () => {
    registerRenderer('rollResult', 'daggerheart:dd', {
      dieConfigs: [],
    } as unknown as LogEntryRenderer)
    const types = getChatVisibleTypes()
    expect(types.has('daggerheart:dd')).toBe(false)
  })

  it('includes plugin-registered chat types', () => {
    registerRenderer(
      'chat',
      'daggerheart-core:action-check',
      (() => null) as unknown as LogEntryRenderer,
    )
    const types = getChatVisibleTypes()
    expect(types.has('daggerheart-core:action-check')).toBe(true)
  })
})
