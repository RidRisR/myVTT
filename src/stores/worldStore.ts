// src/stores/worldStore.ts
// Central zustand store that bridges Yjs data to React.
// Yjs observers write data into this store; components read via selectors.
// Write operations go directly to Yjs — the observer callback updates the store.

import { create } from 'zustand'
import * as Y from 'yjs'
import type { Entity, EntityPermissions, MapToken, Blueprint } from '../shared/entityTypes'
import { readTextField, writeTextField, updateTextField } from '../shared/yTextHelper'
import type { ShowcaseItem } from '../showcase/showcaseTypes'

// ── Types ──

export interface Scene {
  id: string
  name: string
  atmosphereImageUrl: string
  tacticalMapImageUrl: string
  particlePreset: string
  width: number
  height: number
  gridSize: number
  gridSnap: boolean
  gridVisible: boolean
  gridColor: string
  gridOffsetX: number
  gridOffsetY: number
  sortOrder: number
  ambientPreset: string
  ambientAudioUrl: string
  ambientAudioVolume: number
  combatActive: boolean
  battleMapUrl: string
  initiativeOrder: string[]
  initiativeIndex: number
}

export interface RoomState {
  activeSceneId: string | null
}

export interface HandoutAsset {
  id: string
  imageUrl: string
  title?: string
  description?: string
  createdAt: number
}

export interface TeamTracker {
  id: string
  label: string
  current: number
  max: number
  color: string
  sortOrder: number
}

// ── Read helpers (Yjs → plain objects) ──

function readPermissions(yMap: Y.Map<unknown>): EntityPermissions {
  const permYMap = yMap.get('permissions')
  if (permYMap instanceof Y.Map) {
    const seatsYMap = permYMap.get('seats')
    const seats: Record<string, EntityPermissions['seats'][string]> = {}
    if (seatsYMap instanceof Y.Map) {
      seatsYMap.forEach((val, key) => {
        seats[key] = val as EntityPermissions['seats'][string]
      })
    }
    return {
      default: (permYMap.get('default') as EntityPermissions['default']) ?? 'observer',
      seats,
    }
  }
  return { default: 'observer', seats: {} }
}

function readRuleData(yMap: Y.Map<unknown>): unknown {
  const ruleYMap = yMap.get('ruleData')
  if (ruleYMap instanceof Y.Map) {
    if (ruleYMap.size === 0) return null
    const obj: Record<string, unknown> = {}
    ruleYMap.forEach((val, key) => {
      obj[key] = val
    })
    return obj
  }
  return null
}

function readYMapEntity(yMap: Y.Map<unknown>): Entity {
  return {
    id: yMap.get('id') as string,
    name: readTextField(yMap, 'name'),
    imageUrl: (yMap.get('imageUrl') as string) ?? '',
    color: (yMap.get('color') as string) ?? '',
    size: (yMap.get('size') as number) ?? 1,
    blueprintId: yMap.get('blueprintId') as string | undefined,
    notes: readTextField(yMap, 'notes'),
    ruleData: readRuleData(yMap),
    permissions: readPermissions(yMap),
    persistent: (yMap.get('persistent') as boolean) ?? false,
  }
}

function readScenes(yScenes: Y.Map<Y.Map<unknown>>): Scene[] {
  const scenes: Scene[] = []
  yScenes.forEach((sceneMap, id) => {
    if (!(sceneMap instanceof Y.Map)) return
    scenes.push({
      id,
      name: (sceneMap.get('name') as string) ?? '',
      atmosphereImageUrl:
        (sceneMap.get('atmosphereImageUrl') as string) ??
        (sceneMap.get('imageUrl') as string) ??
        '',
      tacticalMapImageUrl: (sceneMap.get('tacticalMapImageUrl') as string) ?? '',
      particlePreset: (sceneMap.get('particlePreset') as string) ?? 'none',
      width: (sceneMap.get('width') as number) ?? 0,
      height: (sceneMap.get('height') as number) ?? 0,
      gridSize: (sceneMap.get('gridSize') as number) ?? 50,
      gridSnap: (sceneMap.get('gridSnap') as boolean) ?? true,
      gridVisible: (sceneMap.get('gridVisible') as boolean) ?? true,
      gridColor: (sceneMap.get('gridColor') as string) ?? 'rgba(255,255,255,0.15)',
      gridOffsetX: (sceneMap.get('gridOffsetX') as number) ?? 0,
      gridOffsetY: (sceneMap.get('gridOffsetY') as number) ?? 0,
      sortOrder: (sceneMap.get('sortOrder') as number) ?? 0,
      ambientPreset: (sceneMap.get('ambientPreset') as string) ?? 'none',
      ambientAudioUrl: (sceneMap.get('ambientAudioUrl') as string) ?? '',
      ambientAudioVolume: (sceneMap.get('ambientAudioVolume') as number) ?? 0.5,
      combatActive: (sceneMap.get('combatActive') as boolean) ?? false,
      battleMapUrl: (sceneMap.get('battleMapUrl') as string) ?? '',
      initiativeOrder: (sceneMap.get('initiativeOrder') as string[]) ?? [],
      initiativeIndex: (sceneMap.get('initiativeIndex') as number) ?? 0,
    })
  })
  scenes.sort((a, b) => a.sortOrder - b.sortOrder)
  return scenes
}

function readEntities(yEntities: Y.Map<Y.Map<unknown>>): Entity[] {
  const result: Entity[] = []
  yEntities.forEach((yMap) => {
    if (yMap instanceof Y.Map) {
      result.push(readYMapEntity(yMap))
    }
  })
  return result
}

function readTokens(tokensMap: Y.Map<MapToken> | null): MapToken[] {
  if (!tokensMap) return []
  const result: MapToken[] = []
  tokensMap.forEach((t) => result.push(t))
  return result
}

function readRoom(yRoom: Y.Map<unknown>): RoomState {
  return {
    activeSceneId: (yRoom.get('activeSceneId') as string) ?? null,
  }
}

function readShowcaseItems(yShowcase: Y.Map<ShowcaseItem>): ShowcaseItem[] {
  const items: ShowcaseItem[] = []
  yShowcase.forEach((item) => items.push(item))
  items.sort((a, b) => a.timestamp - b.timestamp)
  return items
}

function readHandoutAssets(yHandouts: Y.Map<HandoutAsset>): HandoutAsset[] {
  const items: HandoutAsset[] = []
  yHandouts.forEach((item) => items.push(item))
  items.sort((a, b) => a.createdAt - b.createdAt)
  return items
}

function readBlueprints(yBlueprints: Y.Map<unknown>): Blueprint[] {
  const items: Blueprint[] = []
  yBlueprints.forEach((item) => {
    if (item && typeof item === 'object') items.push(item as Blueprint)
  })
  return items
}

function readTeamTrackers(yMetrics: Y.Map<TeamTracker>): TeamTracker[] {
  const items: TeamTracker[] = []
  yMetrics.forEach((item) => items.push(item))
  items.sort((a, b) => a.sortOrder - b.sortOrder)
  return items
}

// ── Write helpers (write to Yjs) ──

function writePermissions(entityYMap: Y.Map<unknown>, permissions: EntityPermissions) {
  const permYMap = new Y.Map<unknown>()
  entityYMap.set('permissions', permYMap)
  permYMap.set('default', permissions.default)
  const seatsYMap = new Y.Map<unknown>()
  permYMap.set('seats', seatsYMap)
  for (const [seatId, level] of Object.entries(permissions.seats)) {
    seatsYMap.set(seatId, level)
  }
}

function writeRuleData(entityYMap: Y.Map<unknown>, ruleData: unknown) {
  const ruleYMap = new Y.Map<unknown>()
  entityYMap.set('ruleData', ruleYMap)
  if (ruleData && typeof ruleData === 'object') {
    for (const [key, value] of Object.entries(ruleData as Record<string, unknown>)) {
      ruleYMap.set(key, value)
    }
  }
}

function setYMapFields(yMap: Y.Map<unknown>, entity: Entity) {
  yMap.set('id', entity.id)
  writeTextField(yMap, 'name', entity.name)
  yMap.set('imageUrl', entity.imageUrl)
  yMap.set('color', entity.color)
  yMap.set('size', entity.size)
  if (entity.blueprintId) yMap.set('blueprintId', entity.blueprintId)
  writeTextField(yMap, 'notes', entity.notes)
  yMap.set('persistent', entity.persistent)
  writeRuleData(yMap, entity.ruleData)
  writePermissions(yMap, entity.permissions)
}

function updatePermissionsInPlace(entityYMap: Y.Map<unknown>, permissions: EntityPermissions) {
  const permYMap = entityYMap.get('permissions')
  if (permYMap instanceof Y.Map) {
    permYMap.set('default', permissions.default)
    const seatsYMap = permYMap.get('seats')
    if (seatsYMap instanceof Y.Map) {
      const newSeatIds = new Set(Object.keys(permissions.seats))
      seatsYMap.forEach((_v, k) => {
        if (!newSeatIds.has(k)) seatsYMap.delete(k)
      })
      for (const [seatId, level] of Object.entries(permissions.seats)) {
        seatsYMap.set(seatId, level)
      }
    }
  } else {
    writePermissions(entityYMap, permissions)
  }
}

function updateRuleDataInPlace(entityYMap: Y.Map<unknown>, ruleData: unknown) {
  const ruleYMap = entityYMap.get('ruleData')
  if (ruleYMap instanceof Y.Map) {
    if (ruleData && typeof ruleData === 'object') {
      for (const [key, value] of Object.entries(ruleData as Record<string, unknown>)) {
        ruleYMap.set(key, value)
      }
    }
  } else {
    writeRuleData(entityYMap, ruleData)
  }
}

function getTokensMap(
  yScenes: Y.Map<Y.Map<unknown>>,
  sceneId: string | null,
): Y.Map<MapToken> | null {
  if (!sceneId) return null
  const sceneMap = yScenes.get(sceneId)
  if (!(sceneMap instanceof Y.Map)) return null
  const tokens = sceneMap.get('tokens')
  if (tokens instanceof Y.Map) return tokens as Y.Map<MapToken>
  return null
}

// ── Store interface ──

interface WorldState {
  // Data slices
  room: RoomState
  scenes: Scene[]
  entities: Entity[]
  tokens: MapToken[]
  showcaseItems: ShowcaseItem[]
  showcasePinnedItemId: string | null
  handoutAssets: HandoutAsset[]
  blueprints: Blueprint[]
  teamTrackers: TeamTracker[]

  // Yjs refs (not serializable — set once during init, used by actions)
  _yDoc: Y.Doc | null
  _yScenes: Y.Map<Y.Map<unknown>> | null
  _yEntities: Y.Map<Y.Map<unknown>> | null
  _yRoom: Y.Map<unknown> | null
  _yBlueprints: Y.Map<unknown> | null
  _yShowcase: Y.Map<ShowcaseItem> | null
  _yHandouts: Y.Map<HandoutAsset> | null
  _yMetrics: Y.Map<TeamTracker> | null
  _activeTokenSceneId: string | null

  // Initialization — connects Yjs observers to store
  init: (yDoc: Y.Doc) => () => void

  // Room actions
  setActiveScene: (sceneId: string) => void

  // Scene actions
  addScene: (scene: Scene, persistentEntityIds?: string[]) => void
  updateScene: (id: string, updates: Partial<Scene>) => void
  deleteScene: (id: string) => void
  getScene: (id: string | null) => Scene | null
  addEntityToScene: (sceneId: string, entityId: string) => void
  removeEntityFromScene: (sceneId: string, entityId: string) => void
  getSceneEntityIds: (sceneId: string) => string[]
  setCombatActive: (sceneId: string, active: boolean) => void
  duplicateScene: (sourceId: string, newId: string) => void
  setInitiativeOrder: (sceneId: string, order: string[]) => void
  advanceInitiative: (sceneId: string) => void

  // Entity actions
  addEntity: (entity: Entity) => void
  updateEntity: (id: string, updates: Partial<Entity>) => void
  deleteEntity: (id: string) => void

  // Token actions
  setActiveTokenScene: (sceneId: string | null) => void
  addToken: (token: MapToken) => void
  updateToken: (id: string, updates: Partial<MapToken>) => void
  deleteToken: (id: string) => void

  // Showcase actions
  addShowcaseItem: (item: ShowcaseItem) => void
  updateShowcaseItem: (id: string, updates: Partial<ShowcaseItem>) => void
  deleteShowcaseItem: (id: string) => void
  clearShowcase: () => void
  pinShowcaseItem: (id: string) => void
  unpinShowcaseItem: () => void

  // Handout actions
  addHandoutAsset: (asset: HandoutAsset) => void
  updateHandoutAsset: (id: string, updates: Partial<HandoutAsset>) => void
  deleteHandoutAsset: (id: string) => void

  // Blueprint actions (read-only via observer, write via Yjs directly)

  // Team metrics actions
  addTeamTracker: (label: string) => void
  updateTeamTracker: (id: string, updates: Partial<TeamTracker>) => void
  deleteTeamTracker: (id: string) => void
}

const DEFAULT_TRACKER_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899']

export const useWorldStore = create<WorldState>((set, get) => ({
  // Initial data
  room: { activeSceneId: null },
  scenes: [],
  entities: [],
  tokens: [],
  showcaseItems: [],
  showcasePinnedItemId: null,
  handoutAssets: [],
  blueprints: [],
  teamTrackers: [],

  // Yjs refs
  _yDoc: null,
  _yScenes: null,
  _yEntities: null,
  _yRoom: null,
  _yBlueprints: null,
  _yShowcase: null,
  _yHandouts: null,
  _yMetrics: null,
  _activeTokenSceneId: null,

  // ── Init: wire Yjs observers to store ──
  init: (yDoc: Y.Doc) => {
    const yScenes = yDoc.getMap('scenes') as Y.Map<Y.Map<unknown>>
    const yEntities = yDoc.getMap('entities') as Y.Map<Y.Map<unknown>>
    const yRoom = yDoc.getMap('room')
    const yBlueprints = yDoc.getMap('blueprints')
    const yShowcase = yDoc.getMap<ShowcaseItem>('showcase_items')
    const yHandouts = yDoc.getMap<HandoutAsset>('handout_assets')
    const yMetrics = yDoc.getMap<TeamTracker>('team_metrics')

    // Store refs for actions
    set({
      _yDoc: yDoc,
      _yScenes: yScenes,
      _yEntities: yEntities,
      _yRoom: yRoom,
      _yBlueprints: yBlueprints,
      _yShowcase: yShowcase,
      _yHandouts: yHandouts,
      _yMetrics: yMetrics,
    })

    // Initial reads
    set({
      room: readRoom(yRoom),
      scenes: readScenes(yScenes),
      entities: readEntities(yEntities),
      showcaseItems: readShowcaseItems(yShowcase),
      showcasePinnedItemId: (yRoom.get('pinnedShowcaseId') as string) ?? null,
      handoutAssets: readHandoutAssets(yHandouts),
      blueprints: readBlueprints(yBlueprints),
      teamTrackers: readTeamTrackers(yMetrics),
    })

    // Observers
    const roomObserver = () => {
      set({
        room: readRoom(yRoom),
        showcasePinnedItemId: (yRoom.get('pinnedShowcaseId') as string) ?? null,
      })
    }
    const scenesObserver = () => set({ scenes: readScenes(yScenes) })
    const entitiesObserver = () => set({ entities: readEntities(yEntities) })
    const showcaseObserver = () => set({ showcaseItems: readShowcaseItems(yShowcase) })
    const handoutsObserver = () => set({ handoutAssets: readHandoutAssets(yHandouts) })
    const blueprintsObserver = () => set({ blueprints: readBlueprints(yBlueprints) })
    const metricsObserver = () => set({ teamTrackers: readTeamTrackers(yMetrics) })

    yRoom.observe(roomObserver)
    yScenes.observeDeep(scenesObserver)
    yEntities.observeDeep(entitiesObserver)
    yShowcase.observe(showcaseObserver)
    yHandouts.observe(handoutsObserver)
    yBlueprints.observe(blueprintsObserver)
    yMetrics.observe(metricsObserver)

    // Token observer management
    let tokenCleanup: (() => void) | null = null
    const setupTokenObserver = (sceneId: string | null) => {
      tokenCleanup?.()
      tokenCleanup = null
      const tokensMap = getTokensMap(yScenes, sceneId)
      if (!tokensMap) {
        set({ tokens: [] })
        return
      }
      const tokenObserver = () => set({ tokens: readTokens(tokensMap) })
      set({ tokens: readTokens(tokensMap) })
      tokensMap.observe(tokenObserver)
      tokenCleanup = () => tokensMap.unobserve(tokenObserver)
    }

    // Store the setup function for dynamic scene changes
    const origSetActiveTokenScene = get().setActiveTokenScene
    set({
      setActiveTokenScene: (sceneId: string | null) => {
        set({ _activeTokenSceneId: sceneId })
        setupTokenObserver(sceneId)
      },
    })
    // If there's already an active token scene, set it up
    const currentTokenScene = get()._activeTokenSceneId
    if (currentTokenScene) setupTokenObserver(currentTokenScene)

    // Cleanup function
    return () => {
      yRoom.unobserve(roomObserver)
      yScenes.unobserveDeep(scenesObserver)
      yEntities.unobserveDeep(entitiesObserver)
      yShowcase.unobserve(showcaseObserver)
      yHandouts.unobserve(handoutsObserver)
      yBlueprints.unobserve(blueprintsObserver)
      yMetrics.unobserve(metricsObserver)
      tokenCleanup?.()
      // Restore no-op token scene setter
      set({ setActiveTokenScene: origSetActiveTokenScene })
    }
  },

  // ── Room actions ──
  setActiveScene: (sceneId: string) => {
    get()._yRoom?.set('activeSceneId', sceneId)
  },

  // ── Scene actions ──
  addScene: (scene: Scene, persistentEntityIds?: string[]) => {
    const { _yScenes: yScenes, _yDoc: yDoc } = get()
    if (!yScenes || !yDoc) return
    yDoc.transact(() => {
      const sceneMap = new Y.Map<unknown>()
      yScenes.set(scene.id, sceneMap)
      sceneMap.set('name', scene.name)
      sceneMap.set('atmosphereImageUrl', scene.atmosphereImageUrl)
      sceneMap.set('tacticalMapImageUrl', scene.tacticalMapImageUrl)
      sceneMap.set('particlePreset', scene.particlePreset)
      sceneMap.set('width', scene.width)
      sceneMap.set('height', scene.height)
      sceneMap.set('gridSize', scene.gridSize)
      sceneMap.set('gridSnap', scene.gridSnap)
      sceneMap.set('gridVisible', scene.gridVisible)
      sceneMap.set('gridColor', scene.gridColor)
      sceneMap.set('gridOffsetX', scene.gridOffsetX)
      sceneMap.set('gridOffsetY', scene.gridOffsetY)
      sceneMap.set('sortOrder', scene.sortOrder)
      sceneMap.set('ambientPreset', scene.ambientPreset ?? 'none')
      sceneMap.set('ambientAudioUrl', scene.ambientAudioUrl ?? '')
      sceneMap.set('ambientAudioVolume', scene.ambientAudioVolume ?? 0.5)
      sceneMap.set('combatActive', false)
      sceneMap.set('battleMapUrl', '')
      const entityIdsMap = new Y.Map<boolean>()
      sceneMap.set('entityIds', entityIdsMap)
      if (persistentEntityIds) {
        for (const eid of persistentEntityIds) {
          entityIdsMap.set(eid, true)
        }
      }
      sceneMap.set('tokens', new Y.Map())
    })
  },

  updateScene: (id: string, updates: Partial<Scene>) => {
    const { _yScenes: yScenes, _yDoc: yDoc } = get()
    if (!yScenes || !yDoc) return
    const sceneMap = yScenes.get(id)
    if (!(sceneMap instanceof Y.Map)) return
    yDoc.transact(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id') continue
        sceneMap.set(key, value)
      }
    })
  },

  deleteScene: (id: string) => {
    get()._yScenes?.delete(id)
  },

  getScene: (id: string | null): Scene | null => {
    if (!id) return null
    return get().scenes.find((s) => s.id === id) ?? null
  },

  addEntityToScene: (sceneId: string, entityId: string) => {
    const yScenes = get()._yScenes
    if (!yScenes) return
    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return
    const entityIds = sceneMap.get('entityIds')
    if (entityIds instanceof Y.Map) {
      entityIds.set(entityId, true)
    }
  },

  removeEntityFromScene: (sceneId: string, entityId: string) => {
    const yScenes = get()._yScenes
    if (!yScenes) return
    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return
    const entityIds = sceneMap.get('entityIds')
    if (entityIds instanceof Y.Map) {
      entityIds.delete(entityId)
    }
  },

  getSceneEntityIds: (sceneId: string): string[] => {
    const yScenes = get()._yScenes
    if (!yScenes) return []
    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return []
    const entityIds = sceneMap.get('entityIds')
    if (!(entityIds instanceof Y.Map)) return []
    const ids: string[] = []
    entityIds.forEach((_val, key) => ids.push(key))
    return ids
  },

  setCombatActive: (sceneId: string, active: boolean) => {
    const yScenes = get()._yScenes
    if (!yScenes) return
    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return
    sceneMap.set('combatActive', active)
  },

  duplicateScene: (sourceId: string, newId: string) => {
    const { addScene, getScene, getSceneEntityIds } = get()
    const source = getScene(sourceId)
    if (!source) return
    const entityIds = getSceneEntityIds(sourceId)
    addScene(
      {
        ...source,
        id: newId,
        name: `${source.name} (copy)`,
        sortOrder: source.sortOrder + 1,
        combatActive: false,
        initiativeOrder: [],
        initiativeIndex: 0,
      },
      entityIds,
    )
  },

  setInitiativeOrder: (sceneId: string, order: string[]) => {
    const yScenes = get()._yScenes
    if (!yScenes) return
    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return
    sceneMap.set('initiativeOrder', order)
  },

  advanceInitiative: (sceneId: string) => {
    const yScenes = get()._yScenes
    if (!yScenes) return
    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return
    const order = (sceneMap.get('initiativeOrder') as string[]) ?? []
    if (order.length === 0) return
    const current = (sceneMap.get('initiativeIndex') as number) ?? 0
    sceneMap.set('initiativeIndex', (current + 1) % order.length)
  },

  // ── Entity actions ──
  addEntity: (entity: Entity) => {
    const { _yEntities: yEntities, _yDoc: yDoc } = get()
    if (!yEntities || !yDoc) return
    yDoc.transact(() => {
      const yMap = new Y.Map<unknown>()
      yEntities.set(entity.id, yMap)
      setYMapFields(yMap, entity)
    })
  },

  updateEntity: (id: string, updates: Partial<Entity>) => {
    const { _yEntities: yEntities, _yDoc: yDoc } = get()
    if (!yEntities || !yDoc) return
    const entityYMap = yEntities.get(id)
    if (!(entityYMap instanceof Y.Map)) return
    yDoc.transact(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'permissions') {
          updatePermissionsInPlace(entityYMap, value as EntityPermissions)
        } else if (key === 'ruleData') {
          updateRuleDataInPlace(entityYMap, value)
        } else if (key === 'name' || key === 'notes') {
          updateTextField(entityYMap, key, value as string)
        } else {
          entityYMap.set(key, value)
        }
      }
    })
  },

  deleteEntity: (id: string) => {
    get()._yEntities?.delete(id)
  },

  // ── Token actions ──
  setActiveTokenScene: (sceneId: string | null) => {
    // No-op before init; init() replaces this with the real implementation
    set({ _activeTokenSceneId: sceneId, tokens: [] })
  },

  addToken: (token: MapToken) => {
    const yScenes = get()._yScenes
    if (!yScenes) return
    const tokensMap = getTokensMap(yScenes, get()._activeTokenSceneId)
    tokensMap?.set(token.id, token)
  },

  updateToken: (id: string, updates: Partial<MapToken>) => {
    const yScenes = get()._yScenes
    if (!yScenes) return
    const tokensMap = getTokensMap(yScenes, get()._activeTokenSceneId)
    if (!tokensMap) return
    const existing = tokensMap.get(id)
    if (existing) {
      tokensMap.set(id, { ...existing, ...updates })
    }
  },

  deleteToken: (id: string) => {
    const yScenes = get()._yScenes
    if (!yScenes) return
    const tokensMap = getTokensMap(yScenes, get()._activeTokenSceneId)
    tokensMap?.delete(id)
  },

  // ── Showcase actions ──
  addShowcaseItem: (item: ShowcaseItem) => {
    get()._yShowcase?.set(item.id, item)
  },

  updateShowcaseItem: (id: string, updates: Partial<ShowcaseItem>) => {
    const yShowcase = get()._yShowcase
    if (!yShowcase) return
    const existing = yShowcase.get(id)
    if (existing) {
      yShowcase.set(id, { ...existing, ...updates })
    }
  },

  deleteShowcaseItem: (id: string) => {
    const yShowcase = get()._yShowcase
    const yRoom = get()._yRoom
    yShowcase?.delete(id)
    if ((yRoom?.get('pinnedShowcaseId') as string) === id) {
      yRoom?.delete('pinnedShowcaseId')
    }
  },

  clearShowcase: () => {
    const { _yShowcase: yShowcase, _yRoom: yRoom, _yDoc: yDoc } = get()
    if (!yShowcase || !yRoom || !yDoc) return
    yDoc.transact(() => {
      yShowcase.forEach((_val, key) => yShowcase.delete(key))
      yRoom.delete('pinnedShowcaseId')
    })
  },

  pinShowcaseItem: (id: string) => {
    get()._yRoom?.set('pinnedShowcaseId', id)
  },

  unpinShowcaseItem: () => {
    get()._yRoom?.delete('pinnedShowcaseId')
  },

  // ── Handout actions ──
  addHandoutAsset: (asset: HandoutAsset) => {
    get()._yHandouts?.set(asset.id, asset)
  },

  updateHandoutAsset: (id: string, updates: Partial<HandoutAsset>) => {
    const yHandouts = get()._yHandouts
    if (!yHandouts) return
    const existing = yHandouts.get(id)
    if (existing) {
      yHandouts.set(id, { ...existing, ...updates })
    }
  },

  deleteHandoutAsset: (id: string) => {
    get()._yHandouts?.delete(id)
  },

  // ── Team metrics actions ──
  addTeamTracker: (label: string) => {
    const yMetrics = get()._yMetrics
    if (!yMetrics) return
    const id =
      self.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
    const count = yMetrics.size
    const tracker: TeamTracker = {
      id,
      label,
      current: 0,
      max: 10,
      color: DEFAULT_TRACKER_COLORS[count % DEFAULT_TRACKER_COLORS.length],
      sortOrder: count,
    }
    yMetrics.set(id, tracker)
  },

  updateTeamTracker: (id: string, updates: Partial<TeamTracker>) => {
    const yMetrics = get()._yMetrics
    if (!yMetrics) return
    const existing = yMetrics.get(id)
    if (existing) {
      yMetrics.set(id, { ...existing, ...updates })
    }
  },

  deleteTeamTracker: (id: string) => {
    get()._yMetrics?.delete(id)
  },
}))
