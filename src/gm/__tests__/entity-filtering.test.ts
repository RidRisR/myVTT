// src/gm/__tests__/entity-filtering.test.ts
// Unit tests for entity filtering/grouping logic used in EntityPanel
import { describe, it, expect } from 'vitest'
import type { Entity } from '../../shared/entityTypes'

// ── Pure logic extracted from EntityPanel for testing ──

function determinePcIds(entities: Entity[], seatIds: string[]): Set<string> {
  const ids = new Set<string>()
  for (const entity of entities) {
    for (const [seatId, perm] of Object.entries(entity.permissions.seats)) {
      if (perm === 'owner' && seatIds.includes(seatId)) {
        ids.add(entity.id)
        break
      }
    }
  }
  return ids
}

function filterEntities(
  entities: Entity[],
  search: string,
  filter: 'all' | 'pc' | 'npc',
  pcIds: Set<string>,
): Entity[] {
  let list = entities
  if (search.trim()) {
    const q = search.toLowerCase()
    list = list.filter((e) => e.name.toLowerCase().includes(q))
  }
  if (filter === 'pc') list = list.filter((e) => pcIds.has(e.id))
  if (filter === 'npc') list = list.filter((e) => !pcIds.has(e.id))
  return list
}

function groupEntities(
  entities: Entity[],
  sceneEntityIds: string[],
): { party: Entity[]; sceneNpcs: Entity[]; other: Entity[] } {
  return {
    party: entities.filter((e) => e.lifecycle === 'persistent'),
    sceneNpcs: entities.filter(
      (e) => e.lifecycle !== 'persistent' && sceneEntityIds.includes(e.id),
    ),
    other: entities.filter((e) => e.lifecycle !== 'persistent' && !sceneEntityIds.includes(e.id)),
  }
}

function filterByTags(
  items: { id: string; tags: string[] }[],
  selectedTags: string[],
): { id: string; tags: string[] }[] {
  if (selectedTags.length === 0) return items
  return items.filter((a) => selectedTags.every((t) => a.tags.includes(t)))
}

// ── Test data ──

function makeEntity(overrides: Partial<Entity> & { id: string; name: string }): Entity {
  return {
    imageUrl: '',
    color: '#000',
    width: 1,
    height: 1,
    notes: '',
    ruleData: null,
    permissions: { default: 'observer' as const, seats: {} },
    lifecycle: 'ephemeral' as const,
    ...overrides,
  }
}

const SEAT_A = 'seat-a'
const SEAT_B = 'seat-b'

const pc1 = makeEntity({
  id: 'pc1',
  name: 'Fighter',
  lifecycle: 'persistent' as const,
  permissions: { default: 'observer', seats: { [SEAT_A]: 'owner' } },
})
const pc2 = makeEntity({
  id: 'pc2',
  name: 'Wizard',
  lifecycle: 'persistent' as const,
  permissions: { default: 'observer', seats: { [SEAT_B]: 'owner' } },
})
const npc1 = makeEntity({ id: 'npc1', name: 'Goblin', lifecycle: 'ephemeral' as const })
const npc2 = makeEntity({ id: 'npc2', name: 'Dragon', lifecycle: 'ephemeral' as const })
const npc3 = makeEntity({ id: 'npc3', name: 'Goblin Chief', lifecycle: 'ephemeral' as const })

const allEntities = [pc1, pc2, npc1, npc2, npc3]

// ── Tests ──

describe('determinePcIds', () => {
  it('identifies entities with owner seats', () => {
    const pcIds = determinePcIds(allEntities, [SEAT_A, SEAT_B])
    expect(pcIds.has('pc1')).toBe(true)
    expect(pcIds.has('pc2')).toBe(true)
    expect(pcIds.has('npc1')).toBe(false)
  })

  it('ignores owner seats that are not in the seat list', () => {
    const pcIds = determinePcIds(allEntities, [SEAT_A]) // only seat-a exists
    expect(pcIds.has('pc1')).toBe(true)
    expect(pcIds.has('pc2')).toBe(false) // seat-b not in list
  })

  it('returns empty set when no entities', () => {
    expect(determinePcIds([], [SEAT_A])).toEqual(new Set())
  })
})

describe('filterEntities', () => {
  const pcIds = new Set(['pc1', 'pc2'])

  it('returns all when filter=all and no search', () => {
    expect(filterEntities(allEntities, '', 'all', pcIds)).toHaveLength(5)
  })

  it('filters by name search (case-insensitive)', () => {
    const result = filterEntities(allEntities, 'goblin', 'all', pcIds)
    expect(result).toHaveLength(2) // Goblin + Goblin Chief
    expect(result.map((e) => e.id)).toContain('npc1')
    expect(result.map((e) => e.id)).toContain('npc3')
  })

  it('filters PC only', () => {
    const result = filterEntities(allEntities, '', 'pc', pcIds)
    expect(result).toHaveLength(2)
    expect(result.every((e) => pcIds.has(e.id))).toBe(true)
  })

  it('filters NPC only', () => {
    const result = filterEntities(allEntities, '', 'npc', pcIds)
    expect(result).toHaveLength(3)
    expect(result.every((e) => !pcIds.has(e.id))).toBe(true)
  })

  it('combines search + type filter', () => {
    const result = filterEntities(allEntities, 'goblin', 'npc', pcIds)
    expect(result).toHaveLength(2) // both goblins are NPCs
  })

  it('whitespace-only search treated as no search', () => {
    expect(filterEntities(allEntities, '   ', 'all', pcIds)).toHaveLength(5)
  })
})

describe('groupEntities', () => {
  const sceneEntityIds = ['npc1', 'npc2'] // these NPCs are in the current scene

  it('groups persistent lifecycle entities as party', () => {
    const { party } = groupEntities(allEntities, sceneEntityIds)
    expect(party).toHaveLength(2)
    expect(party.map((e) => e.id)).toEqual(['pc1', 'pc2'])
  })

  it('groups non-persistent lifecycle scene entities as sceneNpcs', () => {
    const { sceneNpcs } = groupEntities(allEntities, sceneEntityIds)
    expect(sceneNpcs).toHaveLength(2)
    expect(sceneNpcs.map((e) => e.id)).toContain('npc1')
    expect(sceneNpcs.map((e) => e.id)).toContain('npc2')
  })

  it('groups non-persistent lifecycle non-scene entities as other', () => {
    const { other } = groupEntities(allEntities, sceneEntityIds)
    expect(other).toHaveLength(1)
    expect(other[0]?.id).toBe('npc3')
  })

  it('handles empty scene entity list', () => {
    const { sceneNpcs, other } = groupEntities(allEntities, [])
    expect(sceneNpcs).toHaveLength(0)
    expect(other).toHaveLength(3) // all NPCs go to "other"
  })
})

describe('filterByTags (AND logic)', () => {
  const items = [
    { id: 'a', tags: ['Humanoid', 'Undead'] },
    { id: 'b', tags: ['Beast'] },
    { id: 'c', tags: ['Humanoid', 'Magical'] },
    { id: 'd', tags: [] },
  ]

  it('returns all when no tags selected', () => {
    expect(filterByTags(items, [])).toHaveLength(4)
  })

  it('filters by single tag', () => {
    const result = filterByTags(items, ['Humanoid'])
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('AND logic — all selected tags must match', () => {
    const result = filterByTags(items, ['Humanoid', 'Undead'])
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('a')
  })

  it('returns empty when no items match all tags', () => {
    const result = filterByTags(items, ['Humanoid', 'Beast'])
    expect(result).toHaveLength(0)
  })

  it('excludes items with no tags when filtering', () => {
    const result = filterByTags(items, ['Beast'])
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('b')
  })
})
