import type { Entity, MapToken, Blueprint } from '../shared/entityTypes'

export function makeEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: 'entity-1',
    name: 'Test Character',
    imageUrl: '',
    color: '#3b82f6',
    width: 1,
    height: 1,
    notes: '',
    ruleData: null,
    permissions: { default: 'observer', seats: {} },
    lifecycle: 'ephemeral',
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
    name: 'Goblin',
    imageUrl: '',
    defaultSize: 1,
    defaultColor: '#22c55e',
    ...overrides,
  }
}
