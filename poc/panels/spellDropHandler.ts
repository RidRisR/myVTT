import type { SpellPayload } from './StatusTagPalette'

// Runner function will be injected by PocApp
let _onSpellDrop: ((entityId: string, spell: SpellPayload) => void) | null = null

export function setSpellDropHandler(handler: (entityId: string, spell: SpellPayload) => void) {
  _onSpellDrop = handler
}

export function getSpellDropHandler(): ((entityId: string, spell: SpellPayload) => void) | null {
  return _onSpellDrop
}
