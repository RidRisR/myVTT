// src/shared/bundleTypes.ts — Wire shape of GET /api/rooms/:roomId/bundle
// Both server (bundle.ts) and client (worldStore.ts) import from here.
// Any field addition on either side will cause a tsc -b error on the modifying side.

import type { Scene, TacticalInfo, TeamTracker } from './storeTypes'
import type { Entity, SceneEntityEntry, Blueprint } from './entityTypes'
import type { ChatMessage } from './chatTypes'
import type { ShowcaseItem } from './showcaseTypes'
import type { TagMeta } from './assetTypes'

export interface BundleRoomInfo {
  id: string
  name: string
  ruleSystemId: string
  activeSceneId: string | null
}

export interface BundleResponse {
  room: BundleRoomInfo
  scenes: Scene[]
  entities: Entity[]
  sceneEntityMap: Record<string, SceneEntityEntry[]>
  seats: unknown[]
  assets: Record<string, unknown>[]
  blueprints: Blueprint[]
  chat: ChatMessage[]
  teamTrackers: TeamTracker[]
  showcase: ShowcaseItem[]
  tactical: (TacticalInfo & { tokens: unknown[] }) | null
  tags: TagMeta[]
}
