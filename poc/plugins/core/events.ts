import { defineEvent } from '../../eventBus'

export interface DamageDealtPayload {
  targetId: string
  damage: number
  damageType: string
}

export const damageDealtEvent = defineEvent<DamageDealtPayload>('core:damage-dealt')
