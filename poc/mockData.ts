import { usePocStore } from './store'
import type { PocEntity, PocGlobal } from './types'

const COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#34495e',
  '#e91e63',
  '#00bcd4',
  '#8bc34a',
  '#ff9800',
  '#795548',
  '#607d8b',
  '#ff5722',
  '#4caf50',
  '#2196f3',
  '#673ab7',
]

function makeMinion(index: number): PocEntity {
  const id = `minion-${String(index).padStart(2, '0')}`
  return {
    id,
    name: `Minion ${index}`,
    imageUrl: `/tokens/${id}.png`,
    color: COLORS[(index - 1) % COLORS.length]!,
    components: {
      'core:health': { hp: 5 + index, maxHp: 10 + index },
      'status-fx:resistances': { fire: index % 3, ice: index % 5 },
    },
  }
}

const namedEntities: Record<string, PocEntity> = {
  'goblin-01': {
    id: 'goblin-01',
    name: 'Goblin Scout',
    imageUrl: '/tokens/goblin-01.png',
    color: '#2ecc71',
    components: {
      'core:health': { hp: 20, maxHp: 30 },
      'status-fx:resistances': { fire: 5, ice: 0 },
    },
  },
  'hero-01': {
    id: 'hero-01',
    name: 'Paladin',
    imageUrl: '/tokens/hero-01.png',
    color: '#f1c40f',
    components: {
      'core:health': { hp: 45, maxHp: 50 },
      'status-fx:resistances': { fire: 0, ice: 10 },
    },
  },
}

const minionEntities: Record<string, PocEntity> = {}
for (let i = 1; i <= 18; i++) {
  const m = makeMinion(i)
  minionEntities[m.id] = m
}

const allEntities: Record<string, PocEntity> = {
  ...namedEntities,
  ...minionEntities,
}

const allGlobals: Record<string, PocGlobal> = {
  Fear: { key: 'Fear', current: 0 },
  Hope: { key: 'Hope', current: 3 },
}

export function loadMockData(): void {
  usePocStore.setState({ entities: allEntities, globals: allGlobals })
}
