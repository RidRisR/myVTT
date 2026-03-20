import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../../combat/tools/registerBuiltinTools'
import { useUiStore } from '../uiStore'
import type { Entity } from '../../shared/entityTypes'
import type { TargetInfo } from '../../rules/types'

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
  const mockEntity = { id: 'e1', name: 'Fighter' } as Entity

  const makeTarget = (tokenId: string, index: number): TargetInfo => ({
    tokenId,
    entity: { id: `entity-${tokenId}`, name: `Entity ${tokenId}` } as Entity,
    index,
  })

  const mockAction = {
    id: 'attack',
    label: 'Attack',
    icon: () => null,
    targeting: { mode: 'single' as const, count: 2 },
    onExecute: vi.fn(),
  }

  beforeEach(() => {
    mockAction.onExecute.mockClear()
  })

  it('startTargeting sets request and switches to action-targeting tool', () => {
    useUiStore.getState().startTargeting(mockAction, mockEntity)
    const s = useUiStore.getState()
    expect(s.activeTargetingRequest).not.toBeNull()
    expect(s.activeTargetingRequest?.action.id).toBe('attack')
    expect(s.activeTargetingRequest?.actor.id).toBe('e1')
    expect(s.activeTargetingRequest?.collectedTargets).toEqual([])
    expect(s.activeTool).toBe('action-targeting')
  })

  it('addTargetingTarget collects targets until count reached', () => {
    useUiStore.getState().startTargeting(mockAction, mockEntity)

    const target1 = makeTarget('tk1', 0)
    const target2 = makeTarget('tk2', 1)

    // First target — not enough yet
    useUiStore.getState().addTargetingTarget(target1)
    let s = useUiStore.getState()
    expect(s.activeTargetingRequest?.collectedTargets).toHaveLength(1)
    expect(s.activeTool).toBe('action-targeting') // still targeting

    // Second target — count reached, should execute and return to select
    useUiStore.getState().addTargetingTarget(target2)
    s = useUiStore.getState()
    expect(s.activeTargetingRequest).toBeNull()
    expect(s.activeTool).toBe('select')
    expect(mockAction.onExecute).toHaveBeenCalledOnce()
    expect(mockAction.onExecute).toHaveBeenCalledWith(mockEntity, [target1, target2])
  })

  it('cancelTargeting clears request and returns to select', () => {
    useUiStore.getState().startTargeting(mockAction, mockEntity)
    useUiStore.getState().cancelTargeting()
    const s = useUiStore.getState()
    expect(s.activeTargetingRequest).toBeNull()
    expect(s.activeTool).toBe('select')
    expect(mockAction.onExecute).not.toHaveBeenCalled()
  })

  it('addTargetingTarget is no-op when no active request', () => {
    useUiStore.getState().addTargetingTarget(makeTarget('x', 0))
    expect(useUiStore.getState().activeTargetingRequest).toBeNull()
  })
})
