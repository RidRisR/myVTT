import { nextNpcName } from '../characterUtils'
import { makeEntity } from '../../__test-utils__/fixtures'

describe('nextNpcName', () => {
  it('returns "Goblin 1" when no existing entities', () => {
    expect(nextNpcName('Goblin', [], 'bp-goblin')).toBe('Goblin 1')
  })

  it('returns "Goblin 2" when "Goblin 1" exists', () => {
    const existing = [makeEntity({ name: 'Goblin 1', blueprintId: 'bp-goblin' })]
    expect(nextNpcName('Goblin', existing, 'bp-goblin')).toBe('Goblin 2')
  })

  it('returns max+1 with gaps: "Goblin 1" + "Goblin 3" → "Goblin 4"', () => {
    const existing = [
      makeEntity({ name: 'Goblin 1', blueprintId: 'bp-goblin' }),
      makeEntity({ name: 'Goblin 3', blueprintId: 'bp-goblin' }),
    ]
    expect(nextNpcName('Goblin', existing, 'bp-goblin')).toBe('Goblin 4')
  })

  it('treats name without number suffix as 0', () => {
    const existing = [makeEntity({ name: 'Goblin', blueprintId: 'bp-goblin' })]
    expect(nextNpcName('Goblin', existing, 'bp-goblin')).toBe('Goblin 1')
  })

  it('ignores entities with different blueprintId', () => {
    const existing = [makeEntity({ name: 'Orc 5', blueprintId: 'bp-orc' })]
    expect(nextNpcName('Goblin', existing, 'bp-goblin')).toBe('Goblin 1')
  })
})
