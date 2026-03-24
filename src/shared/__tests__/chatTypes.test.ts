import type { MessageOrigin, ChatTextMessage } from '../chatTypes'
import { getDisplayIdentity } from '../chatTypes'
import { describe, it, expect, expectTypeOf } from 'vitest'

describe('MessageOrigin', () => {
  it('requires seat with id and name', () => {
    const origin: MessageOrigin = {
      seat: { id: 'seat-1', name: 'Player 1', color: '#3b82f6' },
    }
    expectTypeOf(origin.seat.id).toBeString()
    expectTypeOf(origin.seat.name).toBeString()
    expectTypeOf(origin.entity).toEqualTypeOf<MessageOrigin['entity']>()
  })

  it('ChatTextMessage uses origin instead of flat sender', () => {
    const msg: ChatTextMessage = {
      type: 'text',
      id: '1',
      origin: { seat: { id: 's1', name: 'P1', color: '#3b82f6' } },
      content: 'hello',
      timestamp: 1,
    }
    expectTypeOf(msg.origin).toEqualTypeOf<MessageOrigin>()
    // @ts-expect-error — senderId no longer exists
    void msg.senderId
  })
})

describe('getDisplayIdentity', () => {
  it('returns entity identity when entity present', () => {
    const origin: MessageOrigin = {
      seat: { id: 's1', name: 'P1', color: '#f00' },
      entity: { id: 'e1', name: 'Warrior', color: '#0f0', portraitUrl: '/img.png' },
    }
    const display = getDisplayIdentity(origin)
    expect(display.name).toBe('Warrior')
    expect(display.color).toBe('#0f0')
    expect(display.portraitUrl).toBe('/img.png')
  })

  it('returns seat identity with seat color when no entity', () => {
    const origin: MessageOrigin = {
      seat: { id: 's1', name: 'Player 1', color: '#ff0000' },
    }
    const display = getDisplayIdentity(origin)
    expect(display.name).toBe('Player 1')
    expect(display.color).toBe('#ff0000')
  })
})
