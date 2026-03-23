import { nextNpcName } from '../characterUtils'
import { makeEntity } from '../../__test-utils__/fixtures'

const namedEntity = (name: string, blueprintId: string) =>
  makeEntity({
    blueprintId,
    components: {
      'core:identity': { name, imageUrl: '', color: '#888' },
      'core:token': { width: 1, height: 1 },
    },
  })

describe('nextNpcName', () => {
  it('returns "Goblin 1" when no existing entities', () => {
    expect(nextNpcName('Goblin', [], 'bp-goblin')).toBe('Goblin 1')
  })

  it('returns "Goblin 2" when "Goblin 1" exists', () => {
    const existing = [namedEntity('Goblin 1', 'bp-goblin')]
    expect(nextNpcName('Goblin', existing, 'bp-goblin')).toBe('Goblin 2')
  })

  it('returns max+1 with gaps: "Goblin 1" + "Goblin 3" → "Goblin 4"', () => {
    const existing = [namedEntity('Goblin 1', 'bp-goblin'), namedEntity('Goblin 3', 'bp-goblin')]
    expect(nextNpcName('Goblin', existing, 'bp-goblin')).toBe('Goblin 4')
  })

  it('treats name without number suffix as 0', () => {
    const existing = [namedEntity('Goblin', 'bp-goblin')]
    expect(nextNpcName('Goblin', existing, 'bp-goblin')).toBe('Goblin 1')
  })

  it('ignores entities with different blueprintId', () => {
    const existing = [namedEntity('Orc 5', 'bp-orc')]
    expect(nextNpcName('Goblin', existing, 'bp-goblin')).toBe('Goblin 1')
  })
})
