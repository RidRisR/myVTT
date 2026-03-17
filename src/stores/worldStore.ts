// src/stores/worldStore.ts
// Central zustand store: REST API init + Socket.io event-driven updates.
// All actions send REST requests; store updates come ONLY via WS events.

import { create } from 'zustand'
import type { TypedClientSocket } from '../shared/hooks/useSocket'
import type { Entity, MapToken, Atmosphere, SceneEntityEntry } from '../shared/entityTypes'
import type { ShowcaseItem } from '../showcase/showcaseTypes'
import type { ChatMessage } from '../chat/chatTypes'
import type { DiceSpec } from '../shared/diceUtils'
import { api } from '../shared/api'
import { generateTokenId } from '../shared/idUtils'
import { defaultNPCPermissions } from '../shared/permissions'
import type { AssetMeta } from '../shared/assetTypes'
import { uploadAsset as uploadAssetFile } from '../shared/assetUpload'
import { updateAsset as patchAsset, deleteAsset } from '../shared/assetApi'

// ── Types (re-exported from shared/storeTypes for backward compat) ──

export type {
  Scene,
  RoomState,
  TacticalInfo,
  TeamTracker,
  AssetRecord,
  ArchiveRecord,
} from '../shared/storeTypes'
import type {
  Scene,
  RoomState,
  TacticalInfo,
  TeamTracker,
  AssetRecord,
  ArchiveRecord,
} from '../shared/storeTypes'

export interface HandoutAsset {
  id: string
  imageUrl: string
  title?: string
  description?: string
  createdAt: number
}

// ChatMessage type re-exported from chatTypes for backward compatibility
export type { ChatMessage } from '../chat/chatTypes'

// ── Store interface ──

interface WorldState {
  // Data slices
  room: RoomState
  scenes: Scene[]
  entities: Record<string, Entity>
  sceneEntityMap: Record<string, SceneEntityEntry[]>
  chatMessages: ChatMessage[]
  freshChatIds: Set<string>
  tacticalInfo: TacticalInfo | null
  showcaseItems: ShowcaseItem[]
  showcasePinnedItemId: string | null
  handoutAssets: HandoutAsset[]
  teamTrackers: TeamTracker[]
  assets: AssetMeta[]

  // Internal refs
  _socket: TypedClientSocket | null
  _roomId: string | null

  // Lifecycle
  init: (roomId: string, socket: TypedClientSocket) => Promise<() => void>
  reinit: () => Promise<void>

  // Room actions
  setActiveScene: (sceneId: string) => Promise<void>
  // Scene actions
  addScene: (id: string, name: string, atmosphere: Atmosphere) => Promise<void>
  updateScene: (
    id: string,
    updates: { name?: string; sortOrder?: number; atmosphere?: Partial<Atmosphere> },
  ) => Promise<void>
  deleteScene: (id: string) => Promise<void>
  getScene: (id: string | null) => Scene | null
  addEntityToScene: (sceneId: string, entityId: string, visible?: boolean) => Promise<void>
  removeEntityFromScene: (sceneId: string, entityId: string) => Promise<void>
  getSceneEntityEntries: (sceneId: string) => SceneEntityEntry[]
  toggleEntityVisibility: (sceneId: string, entityId: string, visible: boolean) => Promise<void>
  saveEntityAsBlueprint: (entity: Entity) => Promise<void>
  spawnFromBlueprint: (
    sceneId: string,
    blueprintId: string,
    opts?: { tacticalOnly?: boolean },
  ) => Promise<Entity | null>
  duplicateScene: (sourceId: string, newId: string) => Promise<void>

  // Archive actions
  archives: ArchiveRecord[]
  fetchArchives: (sceneId: string) => Promise<void>
  createArchive: (sceneId: string, name: string) => Promise<ArchiveRecord | null>
  deleteArchive: (id: string) => Promise<void>
  updateArchive: (id: string, updates: Partial<ArchiveRecord>) => Promise<void>
  duplicateArchive: (id: string) => Promise<void>

  // Tactical actions
  enterTactical: () => Promise<void>
  loadArchive: (archiveId: string) => Promise<void>
  exitTactical: () => Promise<void>
  saveArchive: (archiveId: string) => Promise<void>
  updateTacticalGrid: (updates: Partial<TacticalInfo['grid']>) => Promise<void>
  setTacticalMapUrl: (mapUrl: string, width: number, height: number) => Promise<void>

  // Entity actions
  addEntity: (entity: Entity) => Promise<void>
  updateEntity: (id: string, updates: Partial<Entity>) => Promise<void>
  deleteEntity: (id: string) => Promise<void>
  // Composed actions — multi-step orchestration
  createEphemeralNpcInScene: () => Promise<Entity | null>

  // Token actions
  createToken: (x: number, y: number, opts?: { name?: string; color?: string }) => Promise<void>
  placeEntityOnMap: (entityId: string, x: number, y: number) => Promise<void>
  duplicateToken: (tokenId: string, offsetX?: number, offsetY?: number) => Promise<void>
  addToken: (token: MapToken) => Promise<void>
  updateToken: (id: string, updates: Partial<MapToken>) => Promise<void>
  deleteToken: (id: string) => Promise<void>

  // Showcase actions
  addShowcaseItem: (item: ShowcaseItem) => Promise<void>
  updateShowcaseItem: (id: string, updates: Partial<ShowcaseItem>) => Promise<void>
  deleteShowcaseItem: (id: string) => Promise<void>
  clearShowcase: () => Promise<void>
  pinShowcaseItem: (id: string) => Promise<void>
  unpinShowcaseItem: () => void

  // Asset mutation actions
  uploadAsset: (
    file: File,
    meta: {
      name?: string
      type?: AssetMeta['type']
      tags?: string[]
      blueprint?: AssetMeta['blueprint']
    },
  ) => Promise<AssetMeta>
  updateAsset: (assetId: string, updates: Partial<AssetMeta>) => Promise<void>
  removeAsset: (assetId: string) => Promise<void>
  /** Remove from UI immediately, delete from server after delay. Returns undo function. */
  softRemoveAsset: (assetId: string, delayMs?: number) => () => void

  // Handout actions
  addHandoutAsset: (asset: HandoutAsset) => void
  updateHandoutAsset: (id: string, updates: Partial<HandoutAsset>) => void
  deleteHandoutAsset: (id: string) => void

  // Team tracker actions
  addTeamTracker: (label: string) => Promise<void>
  updateTeamTracker: (id: string, updates: Partial<TeamTracker>) => Promise<void>
  deleteTeamTracker: (id: string) => Promise<void>

  // Chat actions
  sendMessage: (msg: {
    senderId: string
    senderName: string
    senderColor: string
    portraitUrl?: string
    content: string
  }) => Promise<void>
  sendRoll: (data: {
    dice: DiceSpec[]
    formula: string
    resolvedFormula?: string
    rollType?: string
    senderId: string
    senderName: string
    senderColor: string
    portraitUrl?: string
    actionName?: string
  }) => Promise<void>

  /** @internal Test-only */
  _reset: () => void
}

// ── Constants (stable references to avoid infinite re-renders in selectors) ──

const EMPTY_ENTRIES: SceneEntityEntry[] = []

const DEFAULT_GRID: TacticalInfo['grid'] = {
  size: 50,
  snap: true,
  visible: true,
  color: 'rgba(255,255,255,0.15)',
  offsetX: 0,
  offsetY: 0,
}

function normalizeTacticalInfo(
  raw: Omit<TacticalInfo, 'tokens'> & { tokens?: MapToken[] },
): TacticalInfo {
  return {
    ...raw,
    grid: { ...DEFAULT_GRID, ...raw.grid },
    tokens: raw.tokens ?? [],
  }
}

// ── Helpers ──

/** Normalize raw server asset response (extra.tags/blueprint/handout) into flat AssetMeta.
 * extra may be a JSON string (from Socket.io events) or already-parsed object (from bundle). */
function normalizeAsset(raw: Record<string, unknown>): AssetMeta {
  const rawExtra = raw.extra
  const extra: Record<string, unknown> =
    typeof rawExtra === 'string'
      ? (JSON.parse(rawExtra) as Record<string, unknown>)
      : ((rawExtra as Record<string, unknown> | undefined) ?? {})
  return {
    id: raw.id as string,
    url: raw.url as string,
    name: raw.name as string,
    type: (raw.type as AssetMeta['type'] | undefined) || 'image',
    tags: (extra.tags as string[] | undefined) || (raw.tags as string[] | undefined) || [],
    createdAt: raw.createdAt as number,
    ...(extra.blueprint ? { blueprint: extra.blueprint as AssetMeta['blueprint'] } : {}),
    ...(extra.handout ? { handout: extra.handout as AssetMeta['handout'] } : {}),
  }
}

interface BundleResponse {
  room: { id: string; name: string; ruleSystemId: string; activeSceneId: string | null }
  scenes: Scene[]
  entities: Entity[]
  sceneEntityMap: Record<string, SceneEntityEntry[]>
  seats: unknown[]
  assets: Record<string, unknown>[]
  chat: ChatMessage[]
  teamTrackers: TeamTracker[]
  showcase: ShowcaseItem[]
  tactical: (TacticalInfo & { tokens: unknown[] }) | null
}

async function loadAll(roomId: string) {
  const bundle = await api.get<BundleResponse>(`/api/rooms/${roomId}/bundle`)

  // Convert entity array to Record
  const entities: Record<string, Entity> = {}
  for (const e of bundle.entities) entities[e.id] = e

  return {
    room: { activeSceneId: bundle.room.activeSceneId, ruleSystemId: bundle.room.ruleSystemId },
    scenes: bundle.scenes,
    entities,
    sceneEntityMap: bundle.sceneEntityMap,
    chatMessages: bundle.chat,
    teamTrackers: bundle.teamTrackers,
    assets: bundle.assets.map(normalizeAsset),
    showcaseItems: bundle.showcase,
    tacticalInfo: bundle.tactical ? normalizeTacticalInfo(bundle.tactical) : null,
  }
}

function registerSocketEvents(
  socket: TypedClientSocket,
  set: (fn: (s: WorldState) => Partial<WorldState>) => void,
) {
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
  socket.on(
    'scene:entity:linked',
    ({ sceneId, entityId, visible }: { sceneId: string; entityId: string; visible?: boolean }) => {
      set((s) => {
        const current = s.sceneEntityMap[sceneId] ?? []
        if (current.some((e) => e.entityId === entityId)) return s
        const entry: SceneEntityEntry = { entityId, visible: visible ?? true }
        return { sceneEntityMap: { ...s.sceneEntityMap, [sceneId]: [...current, entry] } }
      })
    },
  )
  socket.on(
    'scene:entity:unlinked',
    ({ sceneId, entityId }: { sceneId: string; entityId: string }) => {
      set((s) => {
        const current = s.sceneEntityMap[sceneId] ?? []
        return {
          sceneEntityMap: {
            ...s.sceneEntityMap,
            [sceneId]: current.filter((e) => e.entityId !== entityId),
          },
        }
      })
    },
  )
  socket.on(
    'scene:entity:updated',
    ({ sceneId, entityId, visible }: { sceneId: string; entityId: string; visible: boolean }) => {
      set((s) => {
        const current = s.sceneEntityMap[sceneId] ?? []
        return {
          sceneEntityMap: {
            ...s.sceneEntityMap,
            [sceneId]: current.map((e) => (e.entityId === entityId ? { ...e, visible } : e)),
          },
        }
      })
    },
  )

  // ── Entity events ──
  socket.on('entity:created', (entity: Entity) => {
    set((s) => ({ entities: { ...s.entities, [entity.id]: entity } }))
  })
  socket.on('entity:updated', (entity: Entity) => {
    set((s) => ({ entities: { ...s.entities, [entity.id]: entity } }))
  })
  socket.on('entity:deleted', ({ id }: { id: string }) => {
    set((s) => {
      const newState: Record<string, unknown> = {
        entities: Object.fromEntries(Object.entries(s.entities).filter(([k]) => k !== id)),
      }
      // DB FK CASCADE deletes tokens for this entity; mirror that on the client
      if (s.tacticalInfo) {
        newState.tacticalInfo = {
          ...s.tacticalInfo,
          tokens: s.tacticalInfo.tokens.filter((t) => t.entityId !== id),
        }
      }
      return newState
    })
  })

  // ── Tactical events ──
  socket.on('tactical:updated', (tacticalState: TacticalInfo) => {
    set(() => ({ tacticalInfo: normalizeTacticalInfo(tacticalState) }))
  })
  socket.on('tactical:token:added', (token: MapToken) => {
    set((s) => {
      if (!s.tacticalInfo) return s
      return {
        tacticalInfo: {
          ...s.tacticalInfo,
          tokens: [...s.tacticalInfo.tokens, token],
        },
      }
    })
  })
  socket.on('tactical:token:updated', (token: MapToken) => {
    set((s) => {
      if (!s.tacticalInfo) return s
      return {
        tacticalInfo: {
          ...s.tacticalInfo,
          tokens: s.tacticalInfo.tokens.map((t) => (t.id === token.id ? token : t)),
        },
      }
    })
  })
  socket.on('tactical:token:removed', ({ id }: { id: string }) => {
    set((s) => {
      if (!s.tacticalInfo) return s
      return {
        tacticalInfo: {
          ...s.tacticalInfo,
          tokens: s.tacticalInfo.tokens.filter((t) => t.id !== id),
        },
      }
    })
  })

  // ── Chat events ──
  socket.on('chat:new', (message: ChatMessage) => {
    set((s) => ({
      chatMessages: [...s.chatMessages, message],
      freshChatIds: new Set([...s.freshChatIds, message.id]),
    }))
    setTimeout(() => {
      set((s) => {
        const next = new Set(s.freshChatIds)
        next.delete(message.id)
        return { freshChatIds: next }
      })
    }, 2500)
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
    set((s) => ({
      assets: [normalizeAsset(asset as unknown as Record<string, unknown>), ...s.assets],
    }))
  })
  socket.on('asset:updated', (asset: AssetRecord) => {
    const normalized = normalizeAsset(asset as unknown as Record<string, unknown>)
    set((s) => ({
      assets: s.assets.map((a) => (a.id === asset.id ? normalized : a)),
    }))
  })
  socket.on('asset:deleted', ({ id }: { id: string }) => {
    set((s) => ({ assets: s.assets.filter((a) => a.id !== id) }))
  })

  // ── Archive events ──
  socket.on('archive:created', (arc: ArchiveRecord) => {
    set((s) => ({ archives: [...s.archives, arc] }))
  })
  socket.on('archive:updated', (arc: ArchiveRecord) => {
    set((s) => ({
      archives: s.archives.map((a) => (a.id === arc.id ? arc : a)),
    }))
  })
  socket.on('archive:deleted', ({ id }: { id: string }) => {
    set((s) => ({ archives: s.archives.filter((a) => a.id !== id) }))
  })
}

const WS_EVENTS = [
  'scene:created',
  'scene:updated',
  'scene:deleted',
  'scene:entity:linked',
  'scene:entity:unlinked',
  'scene:entity:updated',
  'entity:created',
  'entity:updated',
  'entity:deleted',
  'tactical:updated',
  'tactical:token:added',
  'tactical:token:updated',
  'tactical:token:removed',
  'chat:new',
  'chat:retracted',
  'room:state:updated',
  'tracker:created',
  'tracker:updated',
  'tracker:deleted',
  'showcase:created',
  'showcase:updated',
  'showcase:deleted',
  'showcase:cleared',
  'asset:created',
  'asset:updated',
  'asset:deleted',
  'archive:created',
  'archive:updated',
  'archive:deleted',
] as const

// ── Store creation ──

export const useWorldStore = create<WorldState>((set, get) => ({
  // Initial data
  room: { activeSceneId: null, ruleSystemId: 'generic' },
  scenes: [],
  entities: {},
  sceneEntityMap: {},
  chatMessages: [],
  freshChatIds: new Set<string>(),
  tacticalInfo: null,
  showcaseItems: [],
  showcasePinnedItemId: null,
  handoutAssets: [],
  teamTrackers: [],
  assets: [],
  archives: [],

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

  addEntityToScene: async (sceneId, entityId, visible) => {
    const roomId = get()._roomId
    if (!roomId) return
    const body = visible !== undefined ? { visible: visible ? 1 : 0 } : undefined
    await api.post(`/api/rooms/${roomId}/scenes/${sceneId}/entities/${entityId}`, body)
  },

  removeEntityFromScene: async (sceneId, entityId) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/scenes/${sceneId}/entities/${entityId}`)
  },

  getSceneEntityEntries: (sceneId) => {
    return get().sceneEntityMap[sceneId] ?? EMPTY_ENTRIES
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

  // ── Archive actions ──

  fetchArchives: async (sceneId) => {
    const roomId = get()._roomId
    if (!roomId) return
    const data = await api.get(`/api/rooms/${roomId}/scenes/${sceneId}/archives`)
    set({ archives: data as ArchiveRecord[] })
  },

  createArchive: async (sceneId, name) => {
    const roomId = get()._roomId
    if (!roomId) return null
    return api.post<ArchiveRecord>(`/api/rooms/${roomId}/scenes/${sceneId}/archives`, { name })
  },

  deleteArchive: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/archives/${id}`)
  },

  updateArchive: async (id, updates) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/archives/${id}`, updates)
  },

  duplicateArchive: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    const archives = get().archives
    const source = archives.find((a) => a.id === id)
    if (!source) return
    const activeSceneId = get().room.activeSceneId
    if (!activeSceneId) return
    await api.post(`/api/rooms/${roomId}/scenes/${activeSceneId}/archives`, {
      name: `${source.name} (copy)`,
      mapUrl: source.mapUrl,
      mapWidth: source.mapWidth,
      mapHeight: source.mapHeight,
      grid: source.grid,
    })
  },

  // ── Tactical actions ──

  enterTactical: async () => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/tactical/enter`)
  },

  loadArchive: async (archiveId) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/archives/${archiveId}/load`)
  },

  exitTactical: async () => {
    const roomId = get()._roomId
    if (!roomId) return
    // Optimistically hide the tactical canvas before the round-trip
    const prev = get().tacticalInfo
    if (prev) set(() => ({ tacticalInfo: { ...prev, tacticalMode: 0 } }))
    try {
      await api.post(`/api/rooms/${roomId}/tactical/exit`)
    } catch {
      // Revert on failure — server Socket.io will correct on next success
      if (prev) set(() => ({ tacticalInfo: prev }))
    }
  },

  saveArchive: async (archiveId) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/archives/${archiveId}/save`)
  },

  updateTacticalGrid: async (updates) => {
    const roomId = get()._roomId
    if (!roomId) return
    const current = get().tacticalInfo?.grid
    if (!current) return
    await api.patch(`/api/rooms/${roomId}/tactical`, {
      grid: { ...current, ...updates },
    })
  },

  setTacticalMapUrl: async (mapUrl, width, height) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/tactical`, {
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

  createEphemeralNpcInScene: async () => {
    const roomId = get()._roomId
    if (!roomId) return null
    const sceneId = get().room.activeSceneId
    const entity: Entity = {
      id: generateTokenId(),
      name: 'New NPC',
      imageUrl: '',
      color: '#3b82f6',
      width: 1,
      height: 1,
      notes: '',
      ruleData: null,
      permissions: defaultNPCPermissions(),
      lifecycle: 'ephemeral',
    }
    // Optimistic update so character card can open immediately
    set((s) => ({
      entities: { ...s.entities, [entity.id]: entity },
      ...(sceneId
        ? {
            sceneEntityMap: {
              ...s.sceneEntityMap,
              [sceneId]: [
                ...(s.sceneEntityMap[sceneId] ?? []),
                { entityId: entity.id, visible: true },
              ],
            },
          }
        : {}),
    }))
    await api.post(`/api/rooms/${roomId}/entities`, entity)
    if (sceneId) await api.post(`/api/rooms/${roomId}/scenes/${sceneId}/entities/${entity.id}`)
    return entity
  },

  saveEntityAsBlueprint: async (entity) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/assets`, {
      url: entity.imageUrl,
      name: entity.name,
      type: 'blueprint',
      extra: {
        blueprint: {
          defaultSize: entity.width,
          defaultColor: entity.color,
          defaultRuleData: entity.ruleData,
        },
      },
    })
  },

  toggleEntityVisibility: async (sceneId, entityId, visible) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/scenes/${sceneId}/entities/${entityId}`, { visible })
  },

  spawnFromBlueprint: async (sceneId, blueprintId, opts = {}) => {
    const roomId = get()._roomId
    if (!roomId) return null
    const result = await api.post<{ entity: Entity }>(
      `/api/rooms/${roomId}/scenes/${sceneId}/spawn`,
      { blueprintId, tacticalOnly: opts.tacticalOnly },
    )
    return result.entity
  },

  // ── Token actions ──

  createToken: async (x, y, opts = {}) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/tactical/tokens/quick`, {
      x,
      y,
      name: opts.name,
      color: opts.color,
    })
    // Socket event 'tactical:token:added' updates state
  },

  placeEntityOnMap: async (entityId, x, y) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/tactical/tokens/from-entity`, { entityId, x, y })
    // Socket event 'tactical:token:added' updates state
  },

  duplicateToken: async (tokenId, offsetX = 1, offsetY = 1) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/tactical/tokens/${tokenId}/duplicate`, {
      offsetX,
      offsetY,
    })
    // Socket event 'tactical:token:added' updates state
  },

  addToken: async (token) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.post(`/api/rooms/${roomId}/tactical/tokens`, token)
    // Socket event 'tactical:token:added' updates state
  },

  updateToken: async (id, updates) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/tactical/tokens/${id}`, updates)
  },

  deleteToken: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.delete(`/api/rooms/${roomId}/tactical/tokens/${id}`)
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

  // ── Asset mutation actions ──

  uploadAsset: async (file, meta) => {
    const extra: Record<string, unknown> = { tags: meta.tags || [] }
    if (meta.blueprint) extra.blueprint = meta.blueprint
    const result = await uploadAssetFile(file, {
      name: meta.name || file.name,
      type: meta.type || 'image',
      extra,
    })
    // Do NOT manually update store here — the server emits asset:created via Socket.io
    // which the listener below handles. Adding here AND in the listener causes duplicates.
    return normalizeAsset(result as unknown as Record<string, unknown>)
  },

  updateAsset: async (assetId, updates) => {
    const roomId = get()._roomId
    if (!roomId) throw new Error('No room')
    const updated = await patchAsset(roomId, assetId, updates)
    const normalized = normalizeAsset(updated as unknown as Record<string, unknown>)
    set((s) => ({ assets: s.assets.map((a) => (a.id === assetId ? normalized : a)) }))
  },

  removeAsset: async (assetId) => {
    const roomId = get()._roomId
    if (!roomId) throw new Error('No room')
    await deleteAsset(roomId, assetId)
    set((s) => ({ assets: s.assets.filter((a) => a.id !== assetId) }))
  },

  softRemoveAsset: (assetId, delayMs = 5000) => {
    const cached = get().assets.find((a) => a.id === assetId)
    if (!cached) return () => {}
    set((s) => ({ assets: s.assets.filter((a) => a.id !== assetId) }))
    const timer = setTimeout(() => {
      const { _roomId: roomId } = get()
      if (roomId) deleteAsset(roomId, assetId).catch(() => {})
    }, delayMs)
    return () => {
      clearTimeout(timer)
      set((s) => ({ assets: [...s.assets, cached] }))
    }
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
  _reset: () => {
    set({
      room: {
        activeSceneId: null,
        ruleSystemId: 'generic',
      },
      scenes: [],
      entities: {},
      sceneEntityMap: {},
      chatMessages: [],
      tacticalInfo: null,
      showcaseItems: [],
      showcasePinnedItemId: null,
      handoutAssets: [],
      teamTrackers: [],
      assets: [],
      archives: [],
    })
  },
}))
