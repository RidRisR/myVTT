import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from '../uiStore'

beforeEach(() => {
  useUiStore.setState({
    openCardId: null,
    pinnedCards: [],
  })
})

describe('openCard / closeCard', () => {
  it('opens a card', () => {
    useUiStore.getState().openCard('e1')
    expect(useUiStore.getState().openCardId).toBe('e1')
  })

  it('switches to a different card', () => {
    useUiStore.getState().openCard('e1')
    useUiStore.getState().openCard('e2')
    expect(useUiStore.getState().openCardId).toBe('e2')
  })

  it('closes the open card', () => {
    useUiStore.getState().openCard('e1')
    useUiStore.getState().closeCard()
    expect(useUiStore.getState().openCardId).toBeNull()
  })

  it('ignores openCard when entity is already pinned', () => {
    useUiStore.setState({
      pinnedCards: [{ entityId: 'e1', position: { x: 0, y: 0 } }],
    })
    useUiStore.getState().openCard('e1')
    expect(useUiStore.getState().openCardId).toBeNull()
  })
})

describe('pinCard', () => {
  it('pins the open card and clears openCardId', () => {
    useUiStore.getState().openCard('e1')
    useUiStore.getState().pinCard('e1', { x: 100, y: 200 })

    const s = useUiStore.getState()
    expect(s.openCardId).toBeNull()
    expect(s.pinnedCards).toEqual([{ entityId: 'e1', position: { x: 100, y: 200 } }])
  })

  it('does not create duplicate pins', () => {
    useUiStore.getState().pinCard('e1', { x: 0, y: 0 })
    useUiStore.getState().pinCard('e1', { x: 50, y: 50 })

    expect(useUiStore.getState().pinnedCards).toHaveLength(1)
    expect(useUiStore.getState().pinnedCards[0]?.position).toEqual({ x: 50, y: 50 })
  })

  it('allows multiple different pins', () => {
    useUiStore.getState().pinCard('e1', { x: 0, y: 0 })
    useUiStore.getState().pinCard('e2', { x: 100, y: 100 })

    expect(useUiStore.getState().pinnedCards).toHaveLength(2)
  })
})

describe('unpinCard', () => {
  it('moves pinned card back to openCardId', () => {
    useUiStore.getState().pinCard('e1', { x: 0, y: 0 })
    useUiStore.getState().unpinCard('e1')

    const s = useUiStore.getState()
    expect(s.openCardId).toBe('e1')
    expect(s.pinnedCards).toHaveLength(0)
  })
})

describe('updatePinnedCardPosition', () => {
  it('updates position of a pinned card', () => {
    useUiStore.getState().pinCard('e1', { x: 0, y: 0 })
    useUiStore.getState().updatePinnedCardPosition('e1', { x: 300, y: 400 })

    expect(useUiStore.getState().pinnedCards[0]?.position).toEqual({ x: 300, y: 400 })
  })

  it('does not affect other pinned cards', () => {
    useUiStore.getState().pinCard('e1', { x: 0, y: 0 })
    useUiStore.getState().pinCard('e2', { x: 10, y: 10 })
    useUiStore.getState().updatePinnedCardPosition('e1', { x: 99, y: 99 })

    expect(useUiStore.getState().pinnedCards.find((p) => p.entityId === 'e2')?.position).toEqual({
      x: 10,
      y: 10,
    })
  })
})

describe('closePinnedCard', () => {
  it('removes a pinned card', () => {
    useUiStore.getState().pinCard('e1', { x: 0, y: 0 })
    useUiStore.getState().closePinnedCard('e1')

    expect(useUiStore.getState().pinnedCards).toHaveLength(0)
  })

  it('does not affect openCardId', () => {
    useUiStore.getState().pinCard('e1', { x: 0, y: 0 })
    useUiStore.getState().openCard('e2')
    useUiStore.getState().closePinnedCard('e1')

    expect(useUiStore.getState().openCardId).toBe('e2')
  })
})
