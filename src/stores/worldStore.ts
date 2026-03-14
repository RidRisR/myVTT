// src/stores/worldStore.ts
// Central zustand store: REST API init + Socket.io event-driven updates.
// All actions send REST requests; store updates come ONLY via WS events.

import { create } from 'zustand'
import type { Socket } from 'socket.io-client'
import type {
  Entity,
  MapToken,
  Atmosphere,
} from '../shared/entityTypes'
import type { ShowcaseItem } from '../showcase/showcaseTypes'
import type { ChatMessage } from '../chat/chatTypes'
import { api } from '../shared/api'

// ── Types ──

export interface Scene {
  id: string
  name: string
  sortOrder: number
  gmOnly: boolean
  atmosphere: Atmosphere
}

export interface RoomState {
  activeSceneId: string | null
  activeEncounterId: string | null
}

export interface CombatInfo {
  mapUrl: string | null
  mapWidth: number | null
  mapHeight: number | null
  grid: {
    size: number
    snap: boolean
    visible: boolean
    color: string
    offsetX: number
    offsetY: number
  }
  tokens: Record<string, MapToken>
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

// ChatMessage type re-exported from chatTypes for backward compatibility
export type { ChatMessage } from '../chat/chatTypes'

export interface AssetRecord {
  id: string
  url: string
  name: string
  type: string
  createdAt: number
  extra: Record<string, unknown>
}

export interface EncounterRecord {
  id: string
  sceneId: string
  name: string
  mapUrl: string | null
  mapWidth: number | null
  mapHeight: number | null
  grid: CombatInfo['grid']
  tokens: Record<string, MapToken>
  gmOnly: boolean
}

// ── Store interface ──

interface WorldState {
  // Data slices
  room: RoomState
  scenes: Scene[]
  entities: Record<string, Entity>
  sceneEntityMap: Record<string, string[]>
  chatMessages: ChatMessage[]
  combatInfo: CombatInfo | null
  showcaseItems: ShowcaseItem[]
  showcasePinnedItemId: string | null
  handoutAssets: HandoutAsset[]
  teamTrackers: TeamTracker[]
  assets: AssetRecord[]

  // Internal refs
  _socket: Socket | null
  _roomId: string | null

  // Lifecycle
  init: (roomId: string, socket: Socket) => Promise<() => void>
  reinit: () => Promise<void>

  // Room actions
  setActiveScene: (sceneId: string) => Promise<void>

  // Scene actions
  addScene: (
    id: string,
    name: string,
    atmosphere: Atmosphere,
    persistentEntityIds?: string[],
  ) => Promise<void>
  updateScene: (
    id: string,
    updates: { name?: string; sortOrder?: number; atmosphere?: Partial<Atmosphere> },
  ) => Promise<void>
  deleteScene: (id: string) => Promise<void>
  getScene: (id: string | null) => Scene | null
  addEntityToScene: (sceneId: string, entityId: string) => Promise<void>
  removeEntityFromScene: (sceneId: string, entityId: string) => Promise<void>
  getSceneEntityIds: (sceneId: string) => string[]
  duplicateScene: (sourceId: string, newId: string) => Promise<void>

  // Combat actions
  startCombat: () => Promise<void>
  activateEncounter: (sceneId: string, encounterId?: string) => Promise<void>
  endCombat: () => Promise<void>
  saveEncounter: (sceneId: string, encounterId: string) => Promise<void>
  updateCombatGrid: (updates: Partial<CombatInfo['grid']>) => Promise<void>
  setCombatMapUrl: (mapUrl: string, width: number, height: number) => Promise<void>

  // Entity actions
  addEntity: (entity: Entity) => Promise<void>
  updateEntity: (id: string, updates: Partial<Entity>) => Promise<void>
  deleteEntity: (id: string) => Promise<void>

  // Token actions
  addToken: (token: MapToken) => Promise<void>
  updateToken: (id: string, updates: Partial<MapToken>) => Promise<void>
  deleteToken: (id: string) => Promise<void>

  // Initiative actions
  setInitiativeOrder: (order: string[]) => Promise<void>
  advanceInitiative: () => Promise<void>

  // Showcase actions
  addShowcaseItem: (item: ShowcaseItem) => Promise<void>
  updateShowcaseItem: (id: string, updates: Partial<ShowcaseItem>) => void
  deleteShowcaseItem: (id: string) => Promise<void>
  clearShowcase: () => Promise<void>
  pinShowcaseItem: (id: string) => Promise<void>
  unpinShowcaseItem: () => void

  // Handout actions
  addHandoutAsset: (asset: HandoutAsset) => void
  updateHandoutAsset: (id: string, updates: Partial<HandoutAsset>) => void
  deleteHandoutAsset: (id: string) => void

  // Team tracker actions
  addTeamTracker: (label: string) => Promise<void>
  updateTeamTracker: (id: string, updates: Partial<TeamTracker>) => Promise<void>
  deleteTeamTracker: (id: string) => Promise<void>

  // Chat actions
  sendMessage: (msg: { senderId: string; senderName: string; senderColor: string; portraitUrl?: string; content: string }) => Promise<void>
  sendRoll: (data: { formula: string; resolvedExpression?: string; senderId: string; senderName: string; senderColor: string; portraitUrl?: string }) => Promise<void>

  /** @internal Test-only */
  _reset: () => void
}

// ── Constants (stable references to avoid infinite re-renders in selectors) ──

const EMPTY_IDS: string[] = []

const DEFAULT_GRID: CombatInfo['grid'] = {
  size: 50,
  snap: true,
  visible: true,
  color: 'rgba(255,255,255,0.15)',
  offsetX: 0,
  offsetY: 0,
}

function normalizeCombatInfo(raw: CombatInfo): CombatInfo {
  return {
    ...raw,
    grid: { ...DEFAULT_GRID, ...raw.grid },
    tokens: raw.tokens ?? {},
  }
}

// ── Helpers ──

async function loadAll(roomId: string) {
  const [scenes, entitiesArr, chat, combatRaw, trackers, state, assets, showcase] =
    await Promise.all([
      api.get<Scene[]>(`/api/rooms/${roomId}/scenes`),
      api.get<Entity[]>(`/api/rooms/${roomId}/entities`),
      api.get<ChatMessage[]>(`/api/rooms/${roomId}/chat?limit=200`),
      api.get<CombatInfo>(`/api/rooms/${roomId}/combat`),
      api.get<TeamTracker[]>(`/api/rooms/${roomId}/team-trackers`),
      api.get<RoomState>(`/api/rooms/${roomId}/state`),
      api.get<AssetRecord[]>(`/api/rooms/${roomId}/assets`),
      api.get<ShowcaseItem[]>(`/api/rooms/${roomId}/showcase`),
    ])

  // Convert entity array to Record
  const entities: Record<string, Entity> = {}
  for (const e of entitiesArr) entities[e.id] = e

  // Only populate combatInfo when combat is actually active (encounter running).
  // Combat state persists in DB across sessions but UI only shows it during active combat.
  const combatInfo: CombatInfo | null =
    state.activeEncounterId && combatRaw ? normalizeCombatInfo(combatRaw) : null

  // Build sceneEntityMap: for each scene, fetch its entity IDs
  const sceneEntityMap: Record<string, string[]> = {}
  await Promise.all(
    scenes.map(async (scene) => {
      const ids = await api.get<string[]>(`/api/rooms/${roomId}/scenes/${scene.id}/entities`)
      sceneEntityMap[scene.id] = ids
    }),
  )

  return { scenes, entities, chatMessages: chat, combatInfo, teamTrackers: trackers, room: state, assets, showcaseItems: showcase, sceneEntityMap }
}

function registerSocketEvents(socket: Socket, set: (fn: (s: WorldState) => Partial<WorldState>) => void) {
  // ── Scene events ──
  socket.on('scene:created', (scene: Scene) => {
    set((s) => ({ scenes: [...s.scenes, scene] }))
  })
  socket.on('scene:updated', (scene: Scene) => {
    set((s) => ({
      scenes: s.scenes.map((sc) => (sc.id === scene.id ? scene : sc)),
    }))
  })
  socket.on('scene:deleted', ({ id }: { id: string }) => {
    set((s) => ({ scenes: s.scenes.filter((sc) => sc.id !== id) }))
  })
  socket.on('scene:entity:linked', ({ sceneId, entityId }: { sceneId: string; entityId: string }) => {
    set((s) => {
      const current = s.sceneEntityMap[sceneId] ?? []
      if (current.includes(entityId)) return s
      return { sceneEntityMap: { ...s.sceneEntityMap, [sceneId]: [...current, entityId] } }
    })
  })
  socket.on('scene:entity:unlinked', ({ sceneId, entityId }: { sceneId: string; entityId: string }) => {
    set((s) => {
      const current = s.sceneEntityMap[sceneId] ?? []
      return { sceneEntityMap: { ...s.sceneEntityMap, [sceneId]: current.filter((id) => id !== entityId) } }
    })
  })

  // ── Entity events ──
  socket.on('entity:created', (entity: Entity) => {
    set((s) => ({ entities: { ...s.entities, [entity.id]: entity } }))
  })
  socket.on('entity:updated', (entity: Entity) => {
    set((s) => ({ entities: { ...s.entities, [entity.id]: entity } }))
  })
  socket.on('entity:deleted', ({ id }: { id: string }) => {
    set((s) => {
      const { [id]: _, ...rest } = s.entities
      return { entities: rest }
    })
  })

  // ── Combat events ──
  socket.on('combat:activated', (combatState: CombatInfo) => {
    set(() => ({ combatInfo: normalizeCombatInfo(combatState) }))
  })
  socket.on('combat:updated', (combatState: CombatInfo) => {
    set(() => ({ combatInfo: normalizeCombatInfo(combatState) }))
  })
  socket.on('combat:ended', () => {
    set(() => ({ combatInfo: null }))
  })
  socket.on('combat:token:added', (token: MapToken) => {
    set((s) => {
      if (!s.combatInfo) return s
      return {
        combatInfo: {
          ...s.combatInfo,
          tokens: { ...s.combatInfo.tokens, [token.id]: token },
        },
      }
    })
  })
  socket.on('combat:token:updated', ({ tokenId, changes }: { tokenId: string; changes: Partial<MapToken> }) => {
    set((s) => {
      if (!s.combatInfo || !s.combatInfo.tokens[tokenId]) return s
      return {
        combatInfo: {
          ...s.combatInfo,
          tokens: {
            ...s.combatInfo.tokens,
            [tokenId]: { ...s.combatInfo.tokens[tokenId], ...changes },
          },
        },
      }
    })
  })
  socket.on('combat:token:removed', ({ tokenId }: { tokenId: string }) => {
    set((s) => {
      if (!s.combatInfo) return s
      const { [tokenId]: _, ...rest } = s.combatInfo.tokens
      return { combatInfo: { ...s.combatInfo, tokens: rest } }
    })
  })

  // ── Chat events ──
  socket.on('chat:new', (message: ChatMessage) => {
    set((s) => ({ chatMessages: [...s.chatMessages, message] }))
  })
  socket.on('chat:retracted', ({ id }: { id: string }) => {
    set((s) => ({
      chatMessages: s.chatMessages.filter((m) => m.id !== id),
    }))
  })

  // ── Room state events ──
  socket.on('room:state:updated', (state: Partial<RoomState>) => {
    set((s) => ({ room: { ...s.room, ...state } }))
  })

  // ── Tracker events ──
  socket.on('tracker:created', (tracker: TeamTracker) => {
    set((s) => ({ teamTrackers: [...s.teamTrackers, tracker] }))
  })
  socket.on('tracker:updated', (tracker: TeamTracker) => {
    set((s) => ({
      teamTrackers: s.teamTrackers.map((t) => (t.id === tracker.id ? tracker : t)),
    }))
  })
  socket.on('tracker:deleted', ({ id }: { id: string }) => {
    set((s) => ({ teamTrackers: s.teamTrackers.filter((t) => t.id !== id) }))
  })

  // ── Showcase events ──
  socket.on('showcase:created', (item: ShowcaseItem) => {
    set((s) => ({ showcaseItems: [...s.showcaseItems, item] }))
  })
  socket.on('showcase:updated', (item: ShowcaseItem) => {
    set((s) => ({
      showcaseItems: s.showcaseItems.map((i) => (i.id === item.id ? item : i)),
    }))
  })
  socket.on('showcase:deleted', ({ id }: { id: string }) => {
    set((s) => ({ showcaseItems: s.showcaseItems.filter((i) => i.id !== id) }))
  })
  socket.on('showcase:cleared', () => {
    set(() => ({ showcaseItems: [] }))
  })

  // ── Asset events ──
  socket.on('asset:created', (asset: AssetRecord) => {
    set((s) => ({ assets: [asset, ...s.assets] }))
  })
  socket.on('asset:updated', (asset: AssetRecord) => {
    set((s) => ({
      assets: s.assets.map((a) => (a.id === asset.id ? asset : a)),
    }))
  })
  socket.on('asset:deleted', ({ id }: { id: string }) => {
    set((s) => ({ assets: s.assets.filter((a) => a.id !== id) }))
  })

  // ── Encounter events ──
  socket.on('encounter:created', () => {
    // Encounters are stored per-scene; for now, refetch on demand
  })
  socket.on('encounter:updated', () => {})
  socket.on('encounter:deleted', () => {})
}

const WS_EVENTS = [
  'scene:created', 'scene:updated', 'scene:deleted',
  'scene:entity:linked', 'scene:entity:unlinked',
  'entity:created', 'entity:updated', 'entity:deleted',
  'combat:activated', 'combat:updated', 'combat:ended',
  'combat:token:added', 'combat:token:updated', 'combat:token:removed',
  'chat:new', 'chat:retracted',
  'room:state:updated',
  'tracker:created', 'tracker:updated', 'tracker:deleted',
  'showcase:created', 'showcase:updated', 'showcase:deleted', 'showcase:cleared',
  'asset:created', 'asset:updated', 'asset:deleted',
  'encounter:created', 'encounter:updated', 'encounter:deleted',
]

// ── Store creation ──

export const useWorldStore = create<WorldState>((set, get) => ({
  // Initial data
  room: { activeSceneId: null, activeEncounterId: null },
  scenes: [],
  entities: {},
  sceneEntityMap: {},
  chatMessages: [],
  combatInfo: null,
  showcaseItems: [],
  showcasePinnedItemId: null,
  handoutAssets: [],
  teamTrackers: [],
  assets: [],

  // Internal refs
  _socket: null,
  _roomId: null,

  // ── Lifecycle ──

  init: async (roomId, socket) => {
    set({ _socket: socket, _roomId: roomId })

    // Parallel load all initial data
    const data = await loadAll(roomId)
    set(data)

    // Register WS event listeners
    registerSocketEvents(socket, set as (fn: (s: WorldState) => Partial<WorldState>) => void)

    // Return cleanup
    return () => {
      WS_EVENTS.forEach((e) => socket.off(e))
    }
  },

  reinit: async () => {
    const { _roomId: roomId } = get()
    if (!roomId) return
    const data = await loadAll(roomId)
    set(data)
  },

  // ── Room actions ──

  setActiveScene: async (sceneId) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/state`, { activeSceneId: sceneId })
  },

  // ── Scene actions ──

  addScene: async (id, name, atmosphere) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/scenes`, { id, name, atmosphere })
  },

  updateScene: async (id, updates) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/scenes/${id}`, updates)
  },

  deleteScene: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/scenes/${id}`)
  },

  getScene: (id) => {
    if (!id) return null
    return get().scenes.find((s) => s.id === id) ?? null
  },

  addEntityToScene: async (sceneId, entityId) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/scenes/${sceneId}/entities/${entityId}`)
  },

  removeEntityFromScene: async (sceneId, entityId) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/scenes/${sceneId}/entities/${entityId}`)
  },

  getSceneEntityIds: (sceneId) => {
    return get().sceneEntityMap[sceneId] ?? EMPTY_IDS
  },

  duplicateScene: async (sourceId, newId) => {
    // Create a copy via API
    const source = get().getScene(sourceId)
    if (!source) return
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/scenes`, {
      id: newId,
      name: `${source.name} (copy)`,
      atmosphere: source.atmosphere,
      sortOrder: source.sortOrder + 1,
    })
  },

  // ── Combat actions ──

  startCombat: async () => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/combat/start`)
  },

  activateEncounter: async (_sceneId, encounterId) => {
    const roomId = get()._roomId
    if (!roomId || !encounterId) return
    await api.post(`/api/rooms/${roomId}/encounters/${encounterId}/activate`)
  },

  endCombat: async () => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/combat/end`)
  },

  saveEncounter: async (_sceneId, encounterId) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/encounters/${encounterId}/save-snapshot`)
  },

  updateCombatGrid: async (updates) => {
    const roomId = get()._roomId
    if (!roomId) return
    const current = get().combatInfo?.grid
    if (!current) return
    await api.patch(`/api/rooms/${roomId}/combat`, {
      grid: { ...current, ...updates },
    })
  },

  setCombatMapUrl: async (mapUrl, width, height) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/combat`, {
      mapUrl,
      mapWidth: width,
      mapHeight: height,
    })
  },

  // ── Entity actions ──

  addEntity: async (entity) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/entities`, entity)
  },

  updateEntity: async (id, updates) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/entities/${id}`, updates)
  },

  deleteEntity: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/entities/${id}`)
  },

  // ── Token actions ──

  addToken: async (token) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/combat/tokens`, token)
  },

  updateToken: async (id, updates) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/combat/tokens/${id}`, updates)
  },

  deleteToken: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/combat/tokens/${id}`)
  },

  // ── Initiative actions ──

  setInitiativeOrder: async (order) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/combat`, { initiativeOrder: order })
  },

  advanceInitiative: async () => {
    const roomId = get()._roomId
    const combat = get().combatInfo
    if (!roomId || !combat) return
    const next = (combat.initiativeIndex + 1) % Math.max(combat.initiativeOrder.length, 1)
    await api.patch(`/api/rooms/${roomId}/combat`, { initiativeIndex: next })
  },

  // ── Showcase actions ──

  addShowcaseItem: async (item) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/showcase`, item)
  },

  updateShowcaseItem: async (id, updates) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/showcase/${id}`, updates)
  },

  deleteShowcaseItem: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/showcase/${id}`)
  },

  clearShowcase: async () => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/showcase`)
  },

  pinShowcaseItem: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/showcase/${id}`, { pinned: true })
    set({ showcasePinnedItemId: id })
  },

  unpinShowcaseItem: () => {
    set({ showcasePinnedItemId: null })
  },

  // ── Handout actions (TODO: integrate with assets API) ──

  addHandoutAsset: (asset) => {
    set((s) => ({ handoutAssets: [...s.handoutAssets, asset] }))
  },

  updateHandoutAsset: (id, updates) => {
    set((s) => ({
      handoutAssets: s.handoutAssets.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }))
  },

  deleteHandoutAsset: (id) => {
    set((s) => ({ handoutAssets: s.handoutAssets.filter((a) => a.id !== id) }))
  },

  // ── Team tracker actions ──

  addTeamTracker: async (label) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/team-trackers`, { label })
  },

  updateTeamTracker: async (id, updates) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/team-trackers/${id}`, updates)
  },

  deleteTeamTracker: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/team-trackers/${id}`)
  },

  // ── Chat actions ──

  sendMessage: async (msg) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/chat`, msg)
  },

  sendRoll: async (data) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/roll`, data)
  },

  /** @internal Test-only: reset store to initial state (preserves socket/roomId) */
  _reset: () =>
    set({
      room: { activeSceneId: null, activeEncounterId: null },
      scenes: [],
      entities: {},
      sceneEntityMap: {},
      chatMessages: [],
      combatInfo: null,
      showcaseItems: [],
      showcasePinnedItemId: null,
      handoutAssets: [],
      teamTrackers: [],
      assets: [],
    }),
}))
