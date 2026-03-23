import type { Entity, MapToken, Blueprint } from '../shared/entityTypes'

export function makeEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: 'entity-1',
    permissions: { default: 'observer', seats: {} },
    lifecycle: 'ephemeral',
    tags: [],
    components: {
      'core:identity': { name: 'Test Character', imageUrl: '', color: '#3b82f6' },
      'core:token': { width: 1, height: 1 },
      'core:notes': { text: '' },
    },
    ...overrides,
  }
}

export function makeToken(overrides?: Partial<MapToken>): MapToken {
  return {
    id: 'token-1',
    entityId: 'entity-1',
    x: 100,
    y: 200,
    width: 1,
    height: 1,
    imageScaleX: 1,
    imageScaleY: 1,
    ...overrides,
  }
}

export function makeBlueprint(overrides?: Partial<Blueprint>): Blueprint {
  return {
    id: 'bp-1',
    tags: [],
    defaults: {
      components: {
        'core:identity': { name: 'Goblin', imageUrl: '', color: '#22c55e' },
        'core:token': { width: 1, height: 1 },
      },
    },
    createdAt: 0,
    ...overrides,
  }
}
