export const ADJECTIVES = [
  'Brave',
  'Shadow',
  'Ancient',
  'Royal',
  'Mystic',
  'Iron',
  'Storm',
  'Silent',
  'Crimson',
  'Golden',
  'Arcane',
  'Wild',
  'Frozen',
  'Ember',
  'Phantom',
]

export const NOUNS = [
  'Knight',
  'Rogue',
  'Ranger',
  'Druid',
  'Paladin',
  'Sorcerer',
  'Bard',
  'Monk',
  'Warlock',
  'Cleric',
  'Barbarian',
  'Sage',
  'Wanderer',
  'Hunter',
  'Warden',
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

export function randomName(): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`
}
