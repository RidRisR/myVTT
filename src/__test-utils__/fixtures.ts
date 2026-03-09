import type { Entity, MapToken, Blueprint } from '../shared/entityTypes'

export function makeEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: 'entity-1',
    name: 'Test Character',
    imageUrl: '',
    color: '#3b82f6',
    size: 1,
    notes: '',
    ruleData: null,
    permissions: { default: 'observer', seats: {} },
    ...overrides,
  }
}

export function makeToken(overrides?: Partial<MapToken>): MapToken {
  return {
    id: 'token-1',
    x: 100,
    y: 200,
    size: 1,
    gmOnly: false,
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
