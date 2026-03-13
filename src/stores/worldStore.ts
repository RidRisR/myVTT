// src/stores/worldStore.ts
// Central zustand store that bridges Yjs data to React.
// Yjs observers write data into this store; components read via selectors.
// Write operations go directly to Yjs — the observer callback updates the store.

import { create } from 'zustand'
import * as Y from 'yjs'
import type {
  Entity,
  EntityPermissions,
  MapToken,
  Atmosphere,
  EncounterData,
} from '../shared/entityTypes'
import { readTextField, writeTextField, updateTextField } from '../shared/yTextHelper'
import type { ShowcaseItem } from '../showcase/showcaseTypes'

// ── Types ──

export interface Scene {
  id: string
  name: string
  sortOrder: number
  atmosphere: Atmosphere
  entityIds: string[]
  encounters: Record<string, EncounterData>
}

export interface RoomState {
  activeSceneId: string | null
  activeEncounterId: string | null
}

/** Combat grid/map/initiative data from top-level combat Y.Map (excludes tokens) */
export interface CombatInfo {
  mapUrl: string
  mapWidth: number
  mapHeight: number
  grid: {
    size: number
    snap: boolean
    visible: boolean
    color: string
    offsetX: number
    offsetY: number
  }
  initiativeOrder: string[]
  initiativeIndex: number
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

function readAtmosphere(sceneMap: Y.Map<unknown>): Atmosphere {
  // New format: atmosphere stored as plain object
  const atm = sceneMap.get('atmosphere')
  if (atm && typeof atm === 'object' && !(atm instanceof Y.Map) && !(atm instanceof Y.Array)) {
    return atm as Atmosphere
  }
  // Backward compatibility: read from flat fields
  return {
    imageUrl:
      (sceneMap.get('atmosphereImageUrl') as string) ?? (sceneMap.get('imageUrl') as string) ?? '',
    width: (sceneMap.get('width') as number) ?? 0,
    height: (sceneMap.get('height') as number) ?? 0,
    particlePreset: ((sceneMap.get('particlePreset') as string) ??
      'none') as Atmosphere['particlePreset'],
    ambientPreset: (sceneMap.get('ambientPreset') as string) ?? '',
    ambientAudioUrl: (sceneMap.get('ambientAudioUrl') as string) ?? '',
    ambientAudioVolume: (sceneMap.get('ambientAudioVolume') as number) ?? 0.5,
  }
}

function readEntityIds(sceneMap: Y.Map<unknown>): string[] {
  const entityIds = sceneMap.get('entityIds')
  if (entityIds instanceof Y.Map) {
    const ids: string[] = []
    entityIds.forEach((_val, key) => ids.push(key))
    return ids
  }
  return []
}

function readEncounters(sceneMap: Y.Map<unknown>): Record<string, EncounterData> {
  const enc = sceneMap.get('encounters')
  if (enc instanceof Y.Map) {
    const result: Record<string, EncounterData> = {}
    enc.forEach((val, key) => {
      if (val && typeof val === 'object') result[key] = val as EncounterData
    })
    return result
  }
  return {}
}

function readScenes(yScenes: Y.Map<Y.Map<unknown>>): Scene[] {
  const scenes: Scene[] = []
  yScenes.forEach((sceneMap, id) => {
    if (!(sceneMap instanceof Y.Map)) return
    scenes.push({
      id,
      name: (sceneMap.get('name') as string) ?? '',
      sortOrder: (sceneMap.get('sortOrder') as number) ?? 0,
      atmosphere: readAtmosphere(sceneMap),
      entityIds: readEntityIds(sceneMap),
      encounters: readEncounters(sceneMap),
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
    activeEncounterId: (yRoom.get('activeEncounterId') as string) ?? null,
  }
}

function readCombatInfo(yCombat: Y.Map<unknown>): CombatInfo | null {
  if (yCombat.size === 0) return null
  const grid = (yCombat.get('grid') as CombatInfo['grid']) ?? {
    size: 50,
    snap: true,
    visible: true,
    color: 'rgba(255,255,255,0.15)',
    offsetX: 0,
    offsetY: 0,
  }
  return {
    mapUrl: (yCombat.get('mapUrl') as string) ?? '',
    mapWidth: (yCombat.get('mapWidth') as number) ?? 0,
    mapHeight: (yCombat.get('mapHeight') as number) ?? 0,
    grid,
    initiativeOrder: (yCombat.get('initiativeOrder') as string[]) ?? [],
    initiativeIndex: (yCombat.get('initiativeIndex') as number) ?? 0,
  }
}

function getCombatTokensMap(yCombat: Y.Map<unknown>): Y.Map<MapToken> | null {
  const tokens = yCombat.get('tokens')
  if (tokens instanceof Y.Map) return tokens as Y.Map<MapToken>
  return null
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

// ── Store interface ──

interface WorldState {
  // Data slices
  room: RoomState
  scenes: Scene[]
  entities: Entity[]
  combatInfo: CombatInfo | null
  tokens: MapToken[]
  showcaseItems: ShowcaseItem[]
  showcasePinnedItemId: string | null
  handoutAssets: HandoutAsset[]
  teamTrackers: TeamTracker[]

  // Yjs refs (not serializable — set once during init, used by actions)
  _yDoc: Y.Doc | null
  _yScenes: Y.Map<Y.Map<unknown>> | null
  _yEntities: Y.Map<Y.Map<unknown>> | null
  _yRoom: Y.Map<unknown> | null
  _yCombat: Y.Map<unknown> | null
  _yShowcase: Y.Map<ShowcaseItem> | null
  _yHandouts: Y.Map<HandoutAsset> | null
  _yMetrics: Y.Map<TeamTracker> | null

  // Initialization — connects Yjs observers to store
  init: (yDoc: Y.Doc) => () => void

  // Room actions
  setActiveScene: (sceneId: string) => void

  // Scene actions
  addScene: (
    id: string,
    name: string,
    atmosphere: Atmosphere,
    persistentEntityIds?: string[],
  ) => void
  updateScene: (
    id: string,
    updates: { name?: string; sortOrder?: number; atmosphere?: Partial<Atmosphere> },
  ) => void
  deleteScene: (id: string) => void
  getScene: (id: string | null) => Scene | null
  addEntityToScene: (sceneId: string, entityId: string) => void
  removeEntityFromScene: (sceneId: string, entityId: string) => void
  getSceneEntityIds: (sceneId: string) => string[]
  duplicateScene: (sourceId: string, newId: string) => void

  // Combat actions
  activateEncounter: (sceneId: string, encounterId?: string) => void
  endCombat: () => void
  saveEncounter: (sceneId: string, encounterId: string, name: string) => void
  updateCombatGrid: (updates: Partial<CombatInfo['grid']>) => void
  setCombatMapUrl: (mapUrl: string, width: number, height: number) => void

  // Entity actions
  addEntity: (entity: Entity) => void
  updateEntity: (id: string, updates: Partial<Entity>) => void
  deleteEntity: (id: string) => void

  // Token actions (write to combat Y.Map)
  addToken: (token: MapToken) => void
  updateToken: (id: string, updates: Partial<MapToken>) => void
  deleteToken: (id: string) => void

  // Initiative actions (write to combat Y.Map)
  setInitiativeOrder: (order: string[]) => void
  advanceInitiative: () => void

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

  // Team metrics actions
  addTeamTracker: (label: string) => void
  updateTeamTracker: (id: string, updates: Partial<TeamTracker>) => void
  deleteTeamTracker: (id: string) => void
}

const DEFAULT_TRACKER_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899']

export const useWorldStore = create<WorldState>((set, get) => ({
  // Initial data
  room: { activeSceneId: null, activeEncounterId: null },
  scenes: [],
  entities: [],
  combatInfo: null,
  tokens: [],
  showcaseItems: [],
  showcasePinnedItemId: null,
  handoutAssets: [],
  teamTrackers: [],

  // Yjs refs
  _yDoc: null,
  _yScenes: null,
  _yEntities: null,
  _yRoom: null,
  _yCombat: null,
  _yShowcase: null,
  _yHandouts: null,
  _yMetrics: null,

  // ── Init: wire Yjs observers to store ──
  init: (yDoc: Y.Doc) => {
    const yScenes = yDoc.getMap('scenes') as Y.Map<Y.Map<unknown>>
    const yEntities = yDoc.getMap('entities') as Y.Map<Y.Map<unknown>>
    const yRoom = yDoc.getMap('room')
    const yCombat = yDoc.getMap('combat')
    const yShowcase = yDoc.getMap<ShowcaseItem>('showcase_items')
    const yHandouts = yDoc.getMap<HandoutAsset>('handout_assets')
    const yMetrics = yDoc.getMap<TeamTracker>('team_metrics')

    // Store refs for actions
    set({
      _yDoc: yDoc,
      _yScenes: yScenes,
      _yEntities: yEntities,
      _yRoom: yRoom,
      _yCombat: yCombat,
      _yShowcase: yShowcase,
      _yHandouts: yHandouts,
      _yMetrics: yMetrics,
    })

    // Initial reads
    set({
      room: readRoom(yRoom),
      scenes: readScenes(yScenes),
      entities: readEntities(yEntities),
      combatInfo: readCombatInfo(yCombat),
      showcaseItems: readShowcaseItems(yShowcase),
      showcasePinnedItemId: (yRoom.get('pinnedShowcaseId') as string) ?? null,
      handoutAssets: readHandoutAssets(yHandouts),
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
    const metricsObserver = () => set({ teamTrackers: readTeamTrackers(yMetrics) })

    // Combat observer: reads combatInfo + tokens from top-level combat Y.Map
    let tokenCleanup: (() => void) | null = null
    const setupTokenObserver = () => {
      tokenCleanup?.()
      tokenCleanup = null
      const tokensMap = getCombatTokensMap(yCombat)
      if (!tokensMap) {
        set({ tokens: [] })
        return
      }
      const tokenObserver = () => set({ tokens: readTokens(tokensMap) })
      set({ tokens: readTokens(tokensMap) })
      tokensMap.observe(tokenObserver)
      tokenCleanup = () => tokensMap.unobserve(tokenObserver)
    }

    const combatObserver = () => {
      set({ combatInfo: readCombatInfo(yCombat) })
      setupTokenObserver()
    }

    yRoom.observe(roomObserver)
    yScenes.observeDeep(scenesObserver)
    yEntities.observeDeep(entitiesObserver)
    yShowcase.observe(showcaseObserver)
    yHandouts.observe(handoutsObserver)
    yMetrics.observe(metricsObserver)
    yCombat.observeDeep(combatObserver)

    // Initial token read from combat
    setupTokenObserver()

    // Cleanup function
    return () => {
      yRoom.unobserve(roomObserver)
      yScenes.unobserveDeep(scenesObserver)
      yEntities.unobserveDeep(entitiesObserver)
      yShowcase.unobserve(showcaseObserver)
      yHandouts.unobserve(handoutsObserver)
      yMetrics.unobserve(metricsObserver)
      yCombat.unobserveDeep(combatObserver)
      tokenCleanup?.()
    }
  },

  // ── Room actions ──
  setActiveScene: (sceneId: string) => {
    get()._yRoom?.set('activeSceneId', sceneId)
  },

  // ── Scene actions ──
  addScene: (id: string, name: string, atmosphere: Atmosphere, persistentEntityIds?: string[]) => {
    const { _yScenes: yScenes, _yDoc: yDoc } = get()
    if (!yScenes || !yDoc) return
    yDoc.transact(() => {
      const sceneMap = new Y.Map<unknown>()
      yScenes.set(id, sceneMap)
      sceneMap.set('name', name)
      sceneMap.set('sortOrder', get().scenes.length)
      sceneMap.set('atmosphere', { ...atmosphere })
      const entityIdsMap = new Y.Map<boolean>()
      sceneMap.set('entityIds', entityIdsMap)
      if (persistentEntityIds) {
        for (const eid of persistentEntityIds) {
          entityIdsMap.set(eid, true)
        }
      }
      sceneMap.set('encounters', new Y.Map())
    })
  },

  updateScene: (
    id: string,
    updates: { name?: string; sortOrder?: number; atmosphere?: Partial<Atmosphere> },
  ) => {
    const { _yScenes: yScenes, _yDoc: yDoc } = get()
    if (!yScenes || !yDoc) return
    const sceneMap = yScenes.get(id)
    if (!(sceneMap instanceof Y.Map)) return
    yDoc.transact(() => {
      if (updates.name !== undefined) sceneMap.set('name', updates.name)
      if (updates.sortOrder !== undefined) sceneMap.set('sortOrder', updates.sortOrder)
      if (updates.atmosphere) {
        const current = readAtmosphere(sceneMap)
        sceneMap.set('atmosphere', { ...current, ...updates.atmosphere })
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

  duplicateScene: (sourceId: string, newId: string) => {
    const { addScene, getScene, getSceneEntityIds } = get()
    const source = getScene(sourceId)
    if (!source) return
    const entityIds = getSceneEntityIds(sourceId)
    addScene(newId, `${source.name} (copy)`, source.atmosphere, entityIds)
  },

  // ── Combat actions ──
  activateEncounter: (sceneId: string, encounterId?: string) => {
    const { _yCombat: yCombat, _yRoom: yRoom, _yDoc: yDoc } = get()
    if (!yCombat || !yRoom || !yDoc) return

    const scene = get().getScene(sceneId)
    if (!scene) return

    // Load encounter data if encounterId provided, otherwise create fresh combat
    let mapUrl = ''
    let mapWidth = scene.atmosphere.width || 1920
    let mapHeight = scene.atmosphere.height || 1080
    let grid: CombatInfo['grid'] = {
      size: 50,
      snap: true,
      visible: true,
      color: 'rgba(255,255,255,0.15)',
      offsetX: 0,
      offsetY: 0,
    }
    let savedTokens: Record<string, EncounterData['tokens'][string]> = {}

    if (encounterId && scene.encounters[encounterId]) {
      const enc = scene.encounters[encounterId]
      mapUrl = enc.mapUrl
      mapWidth = enc.mapWidth
      mapHeight = enc.mapHeight
      grid = { ...enc.grid }
      savedTokens = enc.tokens
    }

    const actualEncounterId =
      encounterId ??
      self.crypto?.randomUUID?.() ??
      Math.random().toString(36).slice(2) + Date.now().toString(36)

    yDoc.transact(() => {
      // Write combat state
      yCombat.set('mapUrl', mapUrl)
      yCombat.set('mapWidth', mapWidth)
      yCombat.set('mapHeight', mapHeight)
      yCombat.set('grid', grid)
      yCombat.set('initiativeOrder', [])
      yCombat.set('initiativeIndex', 0)

      // Create tokens Y.Map for CRDT token management
      const tokensMap = new Y.Map<MapToken>()
      yCombat.set('tokens', tokensMap)

      // Restore saved tokens from encounter snapshot
      for (const [tokenId, tokenData] of Object.entries(savedTokens)) {
        const token: MapToken = {
          id: tokenId,
          x: tokenData.x,
          y: tokenData.y,
          size: tokenData.size,
          color: tokenData.color,
          imageUrl: tokenData.imageUrl,
          label: tokenData.name,
          entityId: tokenData.entityId,
          permissions: { default: 'observer', seats: {} },
        }
        tokensMap.set(tokenId, token)
      }

      // Mark combat active in room
      yRoom.set('activeEncounterId', actualEncounterId)
    })
  },

  endCombat: () => {
    const { _yCombat: yCombat, _yRoom: yRoom, _yDoc: yDoc } = get()
    if (!yCombat || !yRoom || !yDoc) return
    yDoc.transact(() => {
      // Clear combat Y.Map
      const keys: string[] = []
      yCombat.forEach((_v, k) => keys.push(k))
      keys.forEach((k) => yCombat.delete(k))
      // Clear active encounter
      yRoom.delete('activeEncounterId')
    })
  },

  saveEncounter: (sceneId: string, encounterId: string, name: string) => {
    const { _yScenes: yScenes, _yDoc: yDoc, combatInfo, tokens } = get()
    if (!yScenes || !yDoc || !combatInfo) return

    const sceneMap = yScenes.get(sceneId)
    if (!(sceneMap instanceof Y.Map)) return

    // Build encounter data from current combat state
    const encounterTokens: Record<string, EncounterData['tokens'][string]> = {}
    for (const t of tokens) {
      encounterTokens[t.id] = {
        name: t.label ?? '',
        imageUrl: t.imageUrl ?? '',
        color: t.color ?? '',
        size: t.size,
        x: t.x,
        y: t.y,
        entityId: t.entityId,
      }
    }

    const encounterData: EncounterData = {
      name,
      mapUrl: combatInfo.mapUrl,
      mapWidth: combatInfo.mapWidth,
      mapHeight: combatInfo.mapHeight,
      grid: { ...combatInfo.grid },
      tokens: encounterTokens,
    }

    yDoc.transact(() => {
      let encounters = sceneMap.get('encounters')
      if (!(encounters instanceof Y.Map)) {
        encounters = new Y.Map()
        sceneMap.set('encounters', encounters)
      }
      ;(encounters as Y.Map<EncounterData>).set(encounterId, encounterData)
    })
  },

  updateCombatGrid: (updates: Partial<CombatInfo['grid']>) => {
    const { _yCombat: yCombat } = get()
    if (!yCombat) return
    const current = (yCombat.get('grid') as CombatInfo['grid']) ?? {
      size: 50,
      snap: true,
      visible: true,
      color: 'rgba(255,255,255,0.15)',
      offsetX: 0,
      offsetY: 0,
    }
    yCombat.set('grid', { ...current, ...updates })
  },

  setCombatMapUrl: (mapUrl: string, width: number, height: number) => {
    const { _yCombat: yCombat, _yDoc: yDoc } = get()
    if (!yCombat || !yDoc) return
    yDoc.transact(() => {
      yCombat.set('mapUrl', mapUrl)
      yCombat.set('mapWidth', width)
      yCombat.set('mapHeight', height)
    })
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

  // ── Token actions (write to combat Y.Map) ──
  addToken: (token: MapToken) => {
    const yCombat = get()._yCombat
    if (!yCombat) return
    const tokensMap = getCombatTokensMap(yCombat)
    tokensMap?.set(token.id, token)
  },

  updateToken: (id: string, updates: Partial<MapToken>) => {
    const yCombat = get()._yCombat
    if (!yCombat) return
    const tokensMap = getCombatTokensMap(yCombat)
    if (!tokensMap) return
    const existing = tokensMap.get(id)
    if (existing) {
      tokensMap.set(id, { ...existing, ...updates })
    }
  },

  deleteToken: (id: string) => {
    const yCombat = get()._yCombat
    if (!yCombat) return
    const tokensMap = getCombatTokensMap(yCombat)
    tokensMap?.delete(id)
  },

  // ── Initiative actions (write to combat Y.Map) ──
  setInitiativeOrder: (order: string[]) => {
    const yCombat = get()._yCombat
    if (!yCombat) return
    yCombat.set('initiativeOrder', order)
  },

  advanceInitiative: () => {
    const yCombat = get()._yCombat
    if (!yCombat) return
    const order = (yCombat.get('initiativeOrder') as string[]) ?? []
    if (order.length === 0) return
    const current = (yCombat.get('initiativeIndex') as number) ?? 0
    yCombat.set('initiativeIndex', (current + 1) % order.length)
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
