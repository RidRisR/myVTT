// src/shared/coreComponents.ts
// Core component types and convenience accessors for Entity.components
import type { Entity, Blueprint } from './entityTypes'

export interface CoreIdentity {
  name: string
  imageUrl: string
  color: string
}
export interface CoreToken {
  width: number
  height: number
}
export interface CoreNotes {
  text: string
}

export const DEFAULT_IDENTITY: CoreIdentity = { name: '', imageUrl: '', color: '#888888' }
export const DEFAULT_TOKEN: CoreToken = { width: 1, height: 1 }
export const DEFAULT_NOTES: CoreNotes = { text: '' }

export function getIdentity(entity: Entity): CoreIdentity {
  return (entity.components['core:identity'] as CoreIdentity | undefined) ?? DEFAULT_IDENTITY
}
export function getToken(entity: Entity): CoreToken {
  return (entity.components['core:token'] as CoreToken | undefined) ?? DEFAULT_TOKEN
}
export function getNotes(entity: Entity): CoreNotes {
  return (entity.components['core:notes'] as CoreNotes | undefined) ?? DEFAULT_NOTES
}

export function getName(entity: Entity): string {
  return getIdentity(entity).name
}
export function getColor(entity: Entity): string {
  return getIdentity(entity).color
}
export function getImageUrl(entity: Entity): string {
  return getIdentity(entity).imageUrl
}

// Blueprint accessors — read from defaults.components
export function getBlueprintIdentity(bp: Blueprint): CoreIdentity {
  return (bp.defaults.components['core:identity'] as CoreIdentity | undefined) ?? DEFAULT_IDENTITY
}
export function getBlueprintName(bp: Blueprint): string {
  return getBlueprintIdentity(bp).name
}
export function getBlueprintColor(bp: Blueprint): string {
  return getBlueprintIdentity(bp).color
}
export function getBlueprintImageUrl(bp: Blueprint): string {
  return getBlueprintIdentity(bp).imageUrl
}
