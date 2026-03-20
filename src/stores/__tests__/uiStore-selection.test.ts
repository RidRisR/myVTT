import { describe, it, expect, beforeEach } from 'vitest'
import '../../combat/tools/registerBuiltinTools'
import { useUiStore } from '../uiStore'

beforeEach(() => {
  useUiStore.setState({
    selectedTokenIds: [],
    primarySelectedTokenId: null,
    activeTool: 'select',
    toolPersist: false,
    activeTargetingRequest: null,
  })
})

// ── selectToken ──

describe('selectToken', () => {
  it('sets single selection and primary', () => {
    useUiStore.getState().selectToken('t1')
    const s = useUiStore.getState()
    expect(s.selectedTokenIds).toEqual(['t1'])
    expect(s.primarySelectedTokenId).toBe('t1')
  })

  it('replaces previous selection', () => {
    useUiStore.getState().selectToken('t1')
    useUiStore.getState().selectToken('t2')
    const s = useUiStore.getState()
    expect(s.selectedTokenIds).toEqual(['t2'])
    expect(s.primarySelectedTokenId).toBe('t2')
  })
})

// ── addToSelection ──

describe('addToSelection', () => {
  it('adds token to selection', () => {
    useUiStore.getState().selectToken('t1')
    useUiStore.getState().addToSelection('t2')
    expect(useUiStore.getState().selectedTokenIds).toEqual(['t1', 't2'])
  })

  it('does not add duplicate', () => {
    useUiStore.getState().selectToken('t1')
    useUiStore.getState().addToSelection('t1')
    expect(useUiStore.getState().selectedTokenIds).toEqual(['t1'])
  })
})

// ── removeFromSelection ──

describe('removeFromSelection', () => {
  it('removes token from selection', () => {
    useUiStore.getState().selectToken('t1')
    useUiStore.getState().addToSelection('t2')
    useUiStore.getState().removeFromSelection('t1')
    expect(useUiStore.getState().selectedTokenIds).toEqual(['t2'])
  })

  it('clears primarySelectedTokenId when primary is removed', () => {
    useUiStore.getState().selectToken('t1')
    useUiStore.getState().addToSelection('t2')
    useUiStore.getState().removeFromSelection('t1')
    expect(useUiStore.getState().primarySelectedTokenId).toBeNull()
  })

  it('preserves primarySelectedTokenId when non-primary is removed', () => {
    useUiStore.getState().selectToken('t1')
    useUiStore.getState().addToSelection('t2')
    useUiStore.getState().removeFromSelection('t2')
    expect(useUiStore.getState().primarySelectedTokenId).toBe('t1')
  })
})

// ── toggleSelection ──

describe('toggleSelection', () => {
  it('adds token if not in selection', () => {
    useUiStore.getState().selectToken('t1')
    useUiStore.getState().toggleSelection('t2')
    expect(useUiStore.getState().selectedTokenIds).toContain('t2')
  })

  it('removes token if already in selection', () => {
    useUiStore.getState().selectToken('t1')
    useUiStore.getState().addToSelection('t2')
    useUiStore.getState().toggleSelection('t2')
    expect(useUiStore.getState().selectedTokenIds).toEqual(['t1'])
  })
})

// ── clearSelection ──

describe('clearSelection', () => {
  it('clears all selection state', () => {
    useUiStore.getState().selectToken('t1')
    useUiStore.getState().addToSelection('t2')
    useUiStore.getState().clearSelection()
    const s = useUiStore.getState()
    expect(s.selectedTokenIds).toEqual([])
    expect(s.primarySelectedTokenId).toBeNull()
  })
})

// ── toolPersist ──

describe('toolPersist', () => {
  it('defaults to false', () => {
    expect(useUiStore.getState().toolPersist).toBe(false)
  })

  it('toggles on and off', () => {
    useUiStore.getState().toggleToolPersist()
    expect(useUiStore.getState().toolPersist).toBe(true)
    useUiStore.getState().toggleToolPersist()
    expect(useUiStore.getState().toolPersist).toBe(false)
  })
})

// ── Action targeting state machine ──

describe('targeting state machine', () => {
  const mockAction = {
    id: 'attack',
    label: 'Attack',
    icon: () => null,
    targeting: { mode: 'single' as const, count: 2 },
    onExecute: vi.fn(),
  }
  const mockActor = { id: 'e1', name: 'Fighter' } as any

  beforeEach(() => {
    mockAction.onExecute.mockClear()
  })

  it('startTargeting sets request and switches to action-targeting tool', () => {
    useUiStore.getState().startTargeting(mockAction, mockActor)
    const s = useUiStore.getState()
    expect(s.activeTargetingRequest).not.toBeNull()
    expect(s.activeTargetingRequest?.action.id).toBe('attack')
    expect(s.activeTargetingRequest?.actor.id).toBe('e1')
    expect(s.activeTargetingRequest?.collectedTargets).toEqual([])
    expect(s.activeTool).toBe('action-targeting')
  })

  it('addTargetingTarget collects targets until count reached', () => {
    useUiStore.getState().startTargeting(mockAction, mockActor)

    // First target — not enough yet
    useUiStore.getState().addTargetingTarget({ entityId: 'target1', tokenId: 'tk1' })
    let s = useUiStore.getState()
    expect(s.activeTargetingRequest?.collectedTargets).toHaveLength(1)
    expect(s.activeTool).toBe('action-targeting') // still targeting

    // Second target — count reached, should execute and return to select
    useUiStore.getState().addTargetingTarget({ entityId: 'target2', tokenId: 'tk2' })
    s = useUiStore.getState()
    expect(s.activeTargetingRequest).toBeNull()
    expect(s.activeTool).toBe('select')
    expect(mockAction.onExecute).toHaveBeenCalledOnce()
    expect(mockAction.onExecute).toHaveBeenCalledWith(mockActor, [
      { entityId: 'target1', tokenId: 'tk1' },
      { entityId: 'target2', tokenId: 'tk2' },
    ])
  })

  it('cancelTargeting clears request and returns to select', () => {
    useUiStore.getState().startTargeting(mockAction, mockActor)
    useUiStore.getState().cancelTargeting()
    const s = useUiStore.getState()
    expect(s.activeTargetingRequest).toBeNull()
    expect(s.activeTool).toBe('select')
    expect(mockAction.onExecute).not.toHaveBeenCalled()
  })

  it('addTargetingTarget is no-op when no active request', () => {
    useUiStore.getState().addTargetingTarget({ entityId: 'x', tokenId: 'y' })
    expect(useUiStore.getState().activeTargetingRequest).toBeNull()
  })
})

// Import vi for mock
import { vi } from 'vitest'
