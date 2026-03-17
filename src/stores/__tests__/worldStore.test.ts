import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'events'
import { useWorldStore } from '../worldStore'
import type { Scene, TacticalInfo, TeamTracker, AssetRecord, ArchiveRecord } from '../worldStore'
import type { Entity, MapToken } from '../../shared/entityTypes'
import type { ShowcaseItem } from '../../showcase/showcaseTypes'
import type { ChatTextMessage } from '../../chat/chatTypes'

// ── Mock fetch globally (api.ts uses fetch internally) ──

let mockResponses: Record<string, unknown> = {}

vi.stubGlobal(
  'fetch',
  vi.fn((url: string, opts?: RequestInit) => {
    const path = new URL(url).pathname
    const method = opts?.method ?? 'GET'
    const response = mockResponses[path]
    // During init, GET /tactical returns 404 if not mocked (no active scene)
    if (response === undefined && method === 'GET' && path.endsWith('/tactical')) {
      return Promise.resolve({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-length': '1' }),
        json: () => Promise.resolve({ error: 'Not found' }),
      })
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '1' }),
      json: () => Promise.resolve(response ?? []),
    })
  }),
)

// ── Mock socket (EventEmitter-based) ──

function createMockSocket() {
  const emitter = new EventEmitter()
  const onSpy = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    emitter.on(event, handler)
  })
  const offSpy = vi.fn((event: string) => {
    emitter.removeAllListeners(event)
  })
  return {
    on: onSpy,
    off: offSpy,
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
    _trigger: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
    _onSpy: onSpy,
    _offSpy: offSpy,
  }
}

// ── Test fixtures ──

const ROOM_ID = 'test-room'

const makeScene = (overrides: Partial<Scene> = {}): Scene => ({
  id: 'scene-1',
  name: 'Test Scene',
  sortOrder: 0,
  gmOnly: false,
  atmosphere: {
    imageUrl: '',
    width: 1920,
    height: 1080,
    particlePreset: 'none',
    ambientPreset: '',
    ambientAudioUrl: '',
    ambientAudioVolume: 0.5,
  },
  ...overrides,
})

const makeEntity = (overrides: Partial<Entity> = {}): Entity => ({
  id: 'entity-1',
  name: 'Hero',
  imageUrl: '',
  color: '#ff0000',
  width: 1,
  height: 1,
  notes: '',
  ruleData: {},
  permissions: { default: 'none', seats: {} },
  lifecycle: 'persistent' as const,
  ...overrides,
})

const makeToken = (overrides: Partial<MapToken> = {}): MapToken => ({
  id: 'token-1',
  entityId: 'entity-1',
  x: 100,
  y: 200,
  width: 1,
  height: 1,
  imageScaleX: 1,
  imageScaleY: 1,
  ...overrides,
})

const makeTacticalInfo = (overrides: Partial<TacticalInfo> = {}): TacticalInfo => ({
  sceneId: 'scene-1',
  mapUrl: '/map.png',
  mapWidth: 1920,
  mapHeight: 1080,
  grid: {
    size: 50,
    snap: true,
    visible: true,
    color: '#ffffff',
    offsetX: 0,
    offsetY: 0,
  },
  tokens: [],
  roundNumber: 0,
  currentTurnTokenId: null,
  tacticalMode: 1,
  ...overrides,
})

const makeChatMessage = (overrides: Partial<ChatTextMessage> = {}): ChatTextMessage => ({
  type: 'text',
  id: 'msg-1',
  senderId: 'user-1',
  senderName: 'Player',
  senderColor: '#00ff00',
  content: 'Hello',
  timestamp: Date.now(),
  ...overrides,
})

const makeTracker = (overrides: Partial<TeamTracker> = {}): TeamTracker => ({
  id: 'tracker-1',
  label: 'HP',
  current: 10,
  max: 20,
  color: '#ff0000',
  sortOrder: 0,
  ...overrides,
})

const makeAsset = (overrides: Partial<AssetRecord> = {}): AssetRecord => ({
  id: 'asset-1',
  url: '/uploads/img.png',
  name: 'image.png',
  type: 'image',
  createdAt: Date.now(),
  extra: {},
  ...overrides,
})

const makeShowcaseItem = (overrides: Partial<ShowcaseItem> = {}): ShowcaseItem => ({
  id: 'showcase-1',
  type: 'image',
  imageUrl: '/img.png',
  senderId: 'user-1',
  senderName: 'GM',
  senderColor: '#fff',
  ephemeral: false,
  timestamp: Date.now(),
  ...overrides,
})

const makeArchive = (overrides: Partial<ArchiveRecord> = {}): ArchiveRecord => ({
  id: 'archive-1',
  sceneId: 'scene-1',
  name: 'Archive 1',
  mapUrl: '/map.png',
  mapWidth: 1920,
  mapHeight: 1080,
  grid: { size: 50, snap: true, visible: true, color: '#ffffff', offsetX: 0, offsetY: 0 },
  gmOnly: false,
  roundNumber: 0,
  currentTurnTokenId: null,
  ...overrides,
})

// ── Reset store between tests ──

beforeEach(() => {
  useWorldStore.setState({
    room: { activeSceneId: null, ruleSystemId: 'generic' },
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
    _socket: null,
    _roomId: null,
  })
  vi.mocked(fetch).mockClear()
  // Clear mock responses
  mockResponses = {}
})

// ── Helper: set up mock responses for init() ──

function setupInitMockResponses(overrides: Record<string, unknown> = {}) {
  const scene = makeScene()
  const defaults: Record<string, unknown> = {
    [`/api/rooms/${ROOM_ID}/scenes`]: [scene],
    [`/api/rooms/${ROOM_ID}/entities`]: [makeEntity()],
    [`/api/rooms/${ROOM_ID}/chat`]: [makeChatMessage()],
    [`/api/rooms/${ROOM_ID}/team-trackers`]: [makeTracker()],
    [`/api/rooms/${ROOM_ID}/state`]: {
      activeSceneId: scene.id,
    },
    [`/api/rooms/${ROOM_ID}`]: {
      ruleSystemId: 'generic',
    },
    [`/api/rooms/${ROOM_ID}/assets`]: [makeAsset()],
    [`/api/rooms/${ROOM_ID}/showcase`]: [makeShowcaseItem()],
    [`/api/rooms/${ROOM_ID}/scenes/${scene.id}/entities`]: [
      { entityId: 'entity-1', visible: true },
    ],
  }
  Object.assign(mockResponses, defaults, overrides)
}

// ── 1. init() tests ──

describe('init()', () => {
  it('loads all data slices from REST API', async () => {
    setupInitMockResponses()
    const socket = createMockSocket()

    await useWorldStore.getState().init(ROOM_ID, socket as never)

    const state = useWorldStore.getState()
    expect(state.scenes).toHaveLength(1)
    expect(state.scenes[0]?.name).toBe('Test Scene')
    expect(state.entities['entity-1']).toBeDefined()
    expect(state.chatMessages).toHaveLength(1)
    expect(state.teamTrackers).toHaveLength(1)
    expect(state.assets).toHaveLength(1)
    expect(state.showcaseItems).toHaveLength(1)
  })

  it('loads room state (activeSceneId)', async () => {
    setupInitMockResponses()
    const socket = createMockSocket()

    await useWorldStore.getState().init(ROOM_ID, socket as never)

    expect(useWorldStore.getState().room.activeSceneId).toBe('scene-1')
  })

  it('populates sceneEntityMap with per-scene entity entries', async () => {
    setupInitMockResponses()
    const socket = createMockSocket()

    await useWorldStore.getState().init(ROOM_ID, socket as never)

    const map = useWorldStore.getState().sceneEntityMap
    expect(map['scene-1']).toEqual([{ entityId: 'entity-1', visible: true }])
  })

  it('registers socket event listeners for all WS_EVENTS', async () => {
    setupInitMockResponses()
    const socket = createMockSocket()

    await useWorldStore.getState().init(ROOM_ID, socket as never)

    // All expected events should have been registered
    const registeredEvents = socket._onSpy.mock.calls.map((c) => c[0])
    expect(registeredEvents).toContain('scene:created')
    expect(registeredEvents).toContain('entity:created')
    expect(registeredEvents).toContain('tactical:updated')
    expect(registeredEvents).toContain('chat:new')
    expect(registeredEvents).toContain('room:state:updated')
    expect(registeredEvents).toContain('tracker:created')
    expect(registeredEvents).toContain('asset:created')
    expect(registeredEvents).toContain('showcase:created')
    expect(registeredEvents).toContain('archive:created')
  })

  it('cleanup function removes all listeners', async () => {
    setupInitMockResponses()
    const socket = createMockSocket()

    const cleanup = await useWorldStore.getState().init(ROOM_ID, socket as never)
    cleanup()

    const removedEvents = socket._offSpy.mock.calls.map((c) => c[0])
    expect(removedEvents).toContain('scene:created')
    expect(removedEvents).toContain('scene:updated')
    expect(removedEvents).toContain('scene:deleted')
    expect(removedEvents).toContain('entity:created')
    expect(removedEvents).toContain('tactical:updated')
    expect(removedEvents).toContain('chat:new')
    expect(removedEvents).toContain('room:state:updated')
    expect(removedEvents).toContain('tracker:created')
    expect(removedEvents).toContain('asset:created')
    expect(removedEvents).toContain('showcase:cleared')
    expect(removedEvents).toContain('archive:created')
  })
})

// ── 2. Socket event handler tests ──

describe('socket event handlers', () => {
  let socket: ReturnType<typeof createMockSocket>

  beforeEach(async () => {
    setupInitMockResponses()
    socket = createMockSocket()
    await useWorldStore.getState().init(ROOM_ID, socket as never)
  })

  // -- Scene events --

  it('scene:created adds to scenes array', () => {
    const newScene = makeScene({ id: 'scene-2', name: 'New Scene' })
    socket._trigger('scene:created', newScene)

    expect(useWorldStore.getState().scenes).toHaveLength(2)
    expect(useWorldStore.getState().scenes[1]?.id).toBe('scene-2')
  })

  it('scene:updated updates matching scene', () => {
    socket._trigger('scene:updated', makeScene({ id: 'scene-1', name: 'Updated Name' }))

    expect(useWorldStore.getState().scenes[0]?.name).toBe('Updated Name')
  })

  it('scene:deleted removes from scenes', () => {
    socket._trigger('scene:deleted', { id: 'scene-1' })

    expect(useWorldStore.getState().scenes).toHaveLength(0)
  })

  it('scene:entity:linked adds entity entry to sceneEntityMap', () => {
    socket._trigger('scene:entity:linked', { sceneId: 'scene-1', entityId: 'entity-2' })

    const entries = useWorldStore.getState().sceneEntityMap['scene-1'] ?? []
    expect(entries.some((e) => e.entityId === 'entity-2')).toBe(true)
  })

  it('scene:entity:linked does not duplicate existing entity entry', () => {
    socket._trigger('scene:entity:linked', { sceneId: 'scene-1', entityId: 'entity-1' })

    const entries = useWorldStore.getState().sceneEntityMap['scene-1'] ?? []
    expect(entries.filter((e) => e.entityId === 'entity-1')).toHaveLength(1)
  })

  it('scene:entity:linked defaults visible to true when omitted', () => {
    socket._trigger('scene:entity:linked', { sceneId: 'scene-1', entityId: 'entity-new' })

    const entries = useWorldStore.getState().sceneEntityMap['scene-1'] ?? []
    const entry = entries.find((e) => e.entityId === 'entity-new')
    expect(entry?.visible).toBe(true)
  })

  it('scene:entity:linked respects explicit visible=false', () => {
    socket._trigger('scene:entity:linked', {
      sceneId: 'scene-1',
      entityId: 'entity-hidden',
      visible: false,
    })

    const entries = useWorldStore.getState().sceneEntityMap['scene-1'] ?? []
    const entry = entries.find((e) => e.entityId === 'entity-hidden')
    expect(entry?.visible).toBe(false)
  })

  it('scene:entity:unlinked removes entity entry from sceneEntityMap', () => {
    socket._trigger('scene:entity:unlinked', { sceneId: 'scene-1', entityId: 'entity-1' })

    const entries = useWorldStore.getState().sceneEntityMap['scene-1'] ?? []
    expect(entries.some((e) => e.entityId === 'entity-1')).toBe(false)
  })

  // -- scene:entity:updated (visibility toggle) --

  it('scene:entity:updated toggles visible on matching entry', () => {
    socket._trigger('scene:entity:updated', {
      sceneId: 'scene-1',
      entityId: 'entity-1',
      visible: false,
    })

    const entries = useWorldStore.getState().sceneEntityMap['scene-1'] ?? []
    const entry = entries.find((e) => e.entityId === 'entity-1')
    expect(entry?.visible).toBe(false)
  })

  it('scene:entity:updated is no-op for unknown sceneId (no crash, no new key)', () => {
    socket._trigger('scene:entity:updated', {
      sceneId: 'nonexistent',
      entityId: 'entity-1',
      visible: false,
    })

    const after = useWorldStore.getState().sceneEntityMap
    // Should create the key with empty mapped result, but not crash
    expect(after['nonexistent']).toEqual([])
  })

  it('scene:entity:updated does not affect other entries in same scene', () => {
    // Link a second entity
    socket._trigger('scene:entity:linked', { sceneId: 'scene-1', entityId: 'entity-2' })

    // Toggle visibility of entity-1 only
    socket._trigger('scene:entity:updated', {
      sceneId: 'scene-1',
      entityId: 'entity-1',
      visible: false,
    })

    const entries = useWorldStore.getState().sceneEntityMap['scene-1'] ?? []
    expect(entries.find((e) => e.entityId === 'entity-1')?.visible).toBe(false)
    expect(entries.find((e) => e.entityId === 'entity-2')?.visible).toBe(true)
  })

  // -- Entity events --

  it('entity:created adds to entities record', () => {
    const newEntity = makeEntity({ id: 'entity-2', name: 'Villain' })
    socket._trigger('entity:created', newEntity)

    expect(useWorldStore.getState().entities['entity-2']).toBeDefined()
    expect(useWorldStore.getState().entities['entity-2']?.name).toBe('Villain')
  })

  it('entity:updated updates matching entity', () => {
    socket._trigger('entity:updated', makeEntity({ id: 'entity-1', name: 'Renamed Hero' }))

    expect(useWorldStore.getState().entities['entity-1']?.name).toBe('Renamed Hero')
  })

  it('entity:deleted removes from entities', () => {
    socket._trigger('entity:deleted', { id: 'entity-1' })

    expect(useWorldStore.getState().entities['entity-1']).toBeUndefined()
  })

  // Regression: entity deletion must also remove tokens referencing that entity
  // (mirrors DB FK CASCADE that deletes tactical_tokens when entity is deleted)
  it('entity:deleted also removes tokens referencing that entity from tacticalInfo', () => {
    // Set up tactical mode with two tokens: one for entity-1, one for entity-2
    socket._trigger(
      'tactical:updated',
      makeTacticalInfo({
        tokens: [
          makeToken({ id: 'token-a', entityId: 'entity-1' }),
          makeToken({ id: 'token-b', entityId: 'entity-2' }),
        ],
      }),
    )
    // Also add entity-2 to the store
    socket._trigger('entity:created', makeEntity({ id: 'entity-2', name: 'Other' }))

    // Delete entity-1
    socket._trigger('entity:deleted', { id: 'entity-1' })

    // entity-1's token should be gone, entity-2's token should remain
    const tokens = useWorldStore.getState().tacticalInfo?.tokens ?? []
    expect(tokens.find((t) => t.id === 'token-a')).toBeUndefined()
    expect(tokens.find((t) => t.id === 'token-b')).toBeDefined()
  })

  it('entity:deleted removes ALL tokens for that entity (multi-token)', () => {
    socket._trigger(
      'tactical:updated',
      makeTacticalInfo({
        tokens: [
          makeToken({ id: 'token-a1', entityId: 'entity-1' }),
          makeToken({ id: 'token-a2', entityId: 'entity-1' }),
          makeToken({ id: 'token-b1', entityId: 'entity-2' }),
        ],
      }),
    )

    socket._trigger('entity:deleted', { id: 'entity-1' })

    const tokens = useWorldStore.getState().tacticalInfo?.tokens ?? []
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.id).toBe('token-b1')
  })

  it('entity:deleted is safe when tacticalInfo is null', () => {
    // tacticalInfo is null (not in tactical mode)
    socket._trigger('entity:deleted', { id: 'entity-1' })

    expect(useWorldStore.getState().tacticalInfo).toBeNull()
    expect(useWorldStore.getState().entities['entity-1']).toBeUndefined()
  })

  // -- Tactical events --

  it('tactical:updated sets tacticalInfo', () => {
    const tactical = makeTacticalInfo()
    socket._trigger('tactical:updated', tactical)

    expect(useWorldStore.getState().tacticalInfo).not.toBeNull()
    expect(useWorldStore.getState().tacticalInfo?.mapUrl).toBe('/map.png')
  })

  it('tactical:updated with tacticalMode=0', () => {
    // First activate tactical
    socket._trigger('tactical:updated', makeTacticalInfo())
    expect(useWorldStore.getState().tacticalInfo).not.toBeNull()

    socket._trigger('tactical:updated', makeTacticalInfo({ tacticalMode: 0 }))

    expect(useWorldStore.getState().tacticalInfo?.tacticalMode).toBe(0)
  })

  it('tactical:token:added adds to tacticalInfo.tokens', () => {
    socket._trigger('tactical:updated', makeTacticalInfo())

    const token = makeToken({ id: 'token-1' })
    socket._trigger('tactical:token:added', token)

    const tokens = useWorldStore.getState().tacticalInfo?.tokens ?? []
    expect(tokens.find((t) => t.id === 'token-1')).toBeDefined()
  })

  it('tactical:token:added is no-op when tacticalInfo is null', () => {
    // tacticalInfo is null (no tactical active)
    socket._trigger('tactical:token:added', makeToken())

    expect(useWorldStore.getState().tacticalInfo).toBeNull()
  })

  it('tactical:token:updated updates token fields', () => {
    socket._trigger(
      'tactical:updated',
      makeTacticalInfo({
        tokens: [makeToken({ id: 'token-1', x: 100 })],
      }),
    )

    socket._trigger('tactical:token:updated', makeToken({ id: 'token-1', x: 300 }))

    const tokens = useWorldStore.getState().tacticalInfo?.tokens ?? []
    const token = tokens.find((t) => t.id === 'token-1')
    expect(token?.x).toBe(300)
  })

  it('tactical:token:removed removes from tacticalInfo.tokens', () => {
    socket._trigger(
      'tactical:updated',
      makeTacticalInfo({
        tokens: [makeToken({ id: 'token-1' })],
      }),
    )

    socket._trigger('tactical:token:removed', { id: 'token-1' })

    const tokens = useWorldStore.getState().tacticalInfo?.tokens ?? []
    expect(tokens.find((t) => t.id === 'token-1')).toBeUndefined()
  })

  // -- Chat events --

  it('chat:new appends to chatMessages', () => {
    const msg = makeChatMessage({ id: 'msg-2', content: 'World' })
    socket._trigger('chat:new', msg)

    const msgs = useWorldStore.getState().chatMessages
    expect(msgs).toHaveLength(2)
    expect(msgs[1]?.id).toBe('msg-2')
  })

  it('chat:new adds id to freshChatIds atomically with chatMessages', () => {
    // This test guards against the timing bug where freshChatIds was updated in a
    // useEffect (after render), causing MessageCard to mount with isNew=false.
    // Both must update in the same zustand set() call.
    const msg = makeChatMessage({ id: 'msg-fresh', content: 'Fresh' })
    socket._trigger('chat:new', msg)

    const state = useWorldStore.getState()
    expect(state.chatMessages.find((m) => m.id === 'msg-fresh')).toBeDefined()
    expect(state.freshChatIds.has('msg-fresh')).toBe(true)
  })

  it('chat:new clears freshChatIds after 2500ms', () => {
    vi.useFakeTimers()
    const msg = makeChatMessage({ id: 'msg-expire', content: 'Expire' })
    socket._trigger('chat:new', msg)

    expect(useWorldStore.getState().freshChatIds.has('msg-expire')).toBe(true)

    vi.advanceTimersByTime(2500)

    expect(useWorldStore.getState().freshChatIds.has('msg-expire')).toBe(false)
    vi.useRealTimers()
  })

  it('chat:retracted filters out message', () => {
    socket._trigger('chat:retracted', { id: 'msg-1' })

    expect(useWorldStore.getState().chatMessages).toHaveLength(0)
  })

  // -- Room state events --

  it('room:state:updated merges into room', () => {
    socket._trigger('room:state:updated', { activeSceneId: 'scene-99' })

    const room = useWorldStore.getState().room
    expect(room.activeSceneId).toBe('scene-99')
    expect(room.ruleSystemId).toBe('generic')
  })

  // -- Tracker events --

  it('tracker:created adds to teamTrackers', () => {
    const tracker = makeTracker({ id: 'tracker-2', label: 'Mana' })
    socket._trigger('tracker:created', tracker)

    expect(useWorldStore.getState().teamTrackers).toHaveLength(2)
  })

  it('tracker:deleted removes from teamTrackers', () => {
    socket._trigger('tracker:deleted', { id: 'tracker-1' })

    expect(useWorldStore.getState().teamTrackers).toHaveLength(0)
  })

  // -- Asset events --

  it('asset:created adds to assets', () => {
    const asset = makeAsset({ id: 'asset-2', name: 'new.png' })
    socket._trigger('asset:created', asset)

    expect(useWorldStore.getState().assets).toHaveLength(2)
    // asset:created prepends
    expect(useWorldStore.getState().assets[0]?.id).toBe('asset-2')
  })

  it('asset:updated updates matching asset', () => {
    socket._trigger('asset:updated', makeAsset({ id: 'asset-1', name: 'renamed.png' }))

    expect(useWorldStore.getState().assets[0]?.name).toBe('renamed.png')
  })

  it('asset:deleted removes from assets', () => {
    socket._trigger('asset:deleted', { id: 'asset-1' })

    expect(useWorldStore.getState().assets).toHaveLength(0)
  })

  // -- Tactical edge cases --

  it('tactical:updated replaces tacticalInfo completely', () => {
    socket._trigger('tactical:updated', makeTacticalInfo({ mapUrl: '/old.png' }))
    const updatedTactical = makeTacticalInfo({ mapUrl: '/new.png', roundNumber: 3 })
    socket._trigger('tactical:updated', updatedTactical)

    expect(useWorldStore.getState().tacticalInfo?.mapUrl).toBe('/new.png')
    expect(useWorldStore.getState().tacticalInfo?.roundNumber).toBe(3)
  })

  it('tactical:token:updated is no-op when tacticalInfo is null', () => {
    // tacticalInfo is null (no tactical active)
    socket._trigger('tactical:token:updated', makeToken({ id: 'token-1', x: 999 }))

    expect(useWorldStore.getState().tacticalInfo).toBeNull()
  })

  it('tactical:token:updated is no-op when token does not exist', () => {
    socket._trigger(
      'tactical:updated',
      makeTacticalInfo({
        tokens: [makeToken({ id: 'token-1', x: 100 })],
      }),
    )

    socket._trigger('tactical:token:updated', makeToken({ id: 'nonexistent', x: 300 }))

    // Existing token unchanged
    const tokens = useWorldStore.getState().tacticalInfo?.tokens ?? []
    const token = tokens.find((t) => t.id === 'token-1')
    expect(token?.x).toBe(100)
  })

  it('tactical:token:removed is no-op when tacticalInfo is null', () => {
    socket._trigger('tactical:token:removed', { id: 'token-1' })

    expect(useWorldStore.getState().tacticalInfo).toBeNull()
  })

  // -- Tracker edge cases --

  it('tracker:updated updates matching tracker fields', () => {
    const updated = makeTracker({ id: 'tracker-1', label: 'HP', current: 15, max: 20 })
    socket._trigger('tracker:updated', updated)

    const tracker = useWorldStore.getState().teamTrackers[0]
    expect(tracker).toBeDefined()
    expect(tracker?.current).toBe(15)
    expect(tracker?.label).toBe('HP')
  })

  // -- Showcase events --

  it('showcase:created adds to showcaseItems', () => {
    const item = makeShowcaseItem({ id: 'showcase-2' })
    socket._trigger('showcase:created', item)

    expect(useWorldStore.getState().showcaseItems).toHaveLength(2)
  })

  it('showcase:updated updates matching showcase item', () => {
    const updated = makeShowcaseItem({ id: 'showcase-1', type: 'handout' })
    socket._trigger('showcase:updated', updated)

    expect(useWorldStore.getState().showcaseItems[0]?.type).toBe('handout')
  })

  it('showcase:deleted removes from showcaseItems', () => {
    socket._trigger('showcase:deleted', { id: 'showcase-1' })

    expect(useWorldStore.getState().showcaseItems).toHaveLength(0)
  })

  it('showcase:cleared empties showcaseItems', () => {
    socket._trigger('showcase:cleared')

    expect(useWorldStore.getState().showcaseItems).toHaveLength(0)
  })

  // -- Scene edge cases --

  it('scene:entity:linked creates entry for unknown sceneId', () => {
    socket._trigger('scene:entity:linked', { sceneId: 'new-scene', entityId: 'entity-1' })

    expect(useWorldStore.getState().sceneEntityMap['new-scene']).toEqual([
      { entityId: 'entity-1', visible: true },
    ])
  })

  it('scene:entity:unlinked on empty list does not crash', () => {
    socket._trigger('scene:entity:unlinked', { sceneId: 'nonexistent', entityId: 'entity-1' })

    expect(useWorldStore.getState().sceneEntityMap['nonexistent']).toEqual([])
  })

  // -- Room state --

  it('room:state:updated preserves fields not in payload', () => {
    // Set initial room state with both fields
    useWorldStore.setState({
      room: {
        activeSceneId: 'scene-1',
        ruleSystemId: 'dnd5e',
      },
    })

    // Update only one field
    socket._trigger('room:state:updated', { activeSceneId: 'scene-2' })

    const room = useWorldStore.getState().room
    expect(room.activeSceneId).toBe('scene-2')
    expect(room.ruleSystemId).toBe('dnd5e')
  })

  // -- Archive events --

  it('archive:created adds to archives', () => {
    const archive = makeArchive({ id: 'archive-new' })
    socket._trigger('archive:created', archive)

    const archives = useWorldStore.getState().archives
    expect(archives.some((a) => a.id === 'archive-new')).toBe(true)
  })

  it('archive:updated updates matching archive', () => {
    const archive = makeArchive({ id: 'archive-1' })
    socket._trigger('archive:created', archive)

    socket._trigger('archive:updated', makeArchive({ id: 'archive-1', name: 'Renamed' }))

    const archives = useWorldStore.getState().archives
    const found = archives.find((a) => a.id === 'archive-1')
    expect(found?.name).toBe('Renamed')
  })

  it('archive:deleted removes from archives', () => {
    const archive = makeArchive({ id: 'archive-del' })
    socket._trigger('archive:created', archive)

    socket._trigger('archive:deleted', { id: 'archive-del' })

    const archives = useWorldStore.getState().archives
    expect(archives.find((a) => a.id === 'archive-del')).toBeUndefined()
  })
})

// ── 3. Action method tests ──

describe('action methods', () => {
  let socket: ReturnType<typeof createMockSocket>

  beforeEach(async () => {
    setupInitMockResponses()
    socket = createMockSocket()
    await useWorldStore.getState().init(ROOM_ID, socket as never)
    vi.mocked(fetch).mockClear()
  })

  function getLastFetchCall() {
    const calls = vi.mocked(fetch).mock.calls
    const lastCall = calls[calls.length - 1] as [string, RequestInit | undefined]
    const url = lastCall[0]
    const options = lastCall[1]
    return { url, method: options?.method ?? 'GET', body: options?.body }
  }

  it('addScene calls POST /api/rooms/{roomId}/scenes', async () => {
    await useWorldStore.getState().addScene('new-id', 'My Scene', {
      imageUrl: '',
      width: 1920,
      height: 1080,
      particlePreset: 'none',
      ambientPreset: '',
      ambientAudioUrl: '',
      ambientAudioVolume: 0.5,
    })

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/scenes`)
    expect(method).toBe('POST')
  })

  it('updateScene calls PATCH /api/rooms/{roomId}/scenes/{id}', async () => {
    await useWorldStore.getState().updateScene('scene-1', { name: 'Renamed' })

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/scenes/scene-1`)
    expect(method).toBe('PATCH')
  })

  it('deleteScene calls DELETE /api/rooms/{roomId}/scenes/{id}', async () => {
    await useWorldStore.getState().deleteScene('scene-1')

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/scenes/scene-1`)
    expect(method).toBe('DELETE')
  })

  it('addEntity calls POST /api/rooms/{roomId}/entities', async () => {
    await useWorldStore.getState().addEntity(makeEntity({ id: 'new-entity' }))

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/entities`)
    expect(method).toBe('POST')
  })

  it('updateEntity calls PATCH /api/rooms/{roomId}/entities/{id}', async () => {
    await useWorldStore.getState().updateEntity('entity-1', { name: 'Updated' })

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/entities/entity-1`)
    expect(method).toBe('PATCH')
  })

  it('updateToken calls PATCH /api/rooms/{roomId}/tactical/tokens/{id}', async () => {
    await useWorldStore.getState().updateToken('token-1', { x: 500 })

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/tactical/tokens/token-1`)
    expect(method).toBe('PATCH')
  })

  it('exitTactical calls POST /api/rooms/{roomId}/tactical/exit', async () => {
    await useWorldStore.getState().exitTactical()

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/tactical/exit`)
    expect(method).toBe('POST')
  })

  // ── Regression: C1 — addScene sends body.id ──
  it('addScene sends client ID in request body', async () => {
    await useWorldStore.getState().addScene('my-scene-id', 'Test', {
      imageUrl: '',
      width: 0,
      height: 0,
      particlePreset: 'none',
      ambientPreset: '',
      ambientAudioUrl: '',
      ambientAudioVolume: 0.5,
    })

    const { body } = getLastFetchCall()
    const parsed = JSON.parse(body as string)
    expect(parsed.id).toBe('my-scene-id')
    expect(parsed.name).toBe('Test')
  })

  // ── Regression: C2 — duplicateScene sends body.id ──
  it('duplicateScene sends newId in request body', async () => {
    // Populate a source scene in the store
    socket._trigger('scene:created', {
      id: 'src-scene',
      name: 'Source',
      sortOrder: 0,
      gmOnly: false,
      atmosphere: { imageUrl: '' },
    })

    await useWorldStore.getState().duplicateScene('src-scene', 'dup-scene-id')

    const { body } = getLastFetchCall()
    const parsed = JSON.parse(body as string)
    expect(parsed.id).toBe('dup-scene-id')
    expect(parsed.name).toBe('Source (copy)')
  })

  // ── Regression: C4 — updateShowcaseItem returns a Promise ──
  it('updateShowcaseItem is async (returns a Promise)', async () => {
    const result = useWorldStore.getState().updateShowcaseItem('item-1', { title: 'updated' })
    expect(result).toBeInstanceOf(Promise)
    await result
  })

  // ── getScene / getSceneEntityEntries ──

  it('getScene returns scene by id', () => {
    const scene = useWorldStore.getState().getScene('scene-1')
    expect(scene).not.toBeNull()
    expect(scene?.name).toBe('Test Scene')
  })

  it('getScene returns null for non-existent id', () => {
    expect(useWorldStore.getState().getScene('no-such-scene')).toBeNull()
  })

  it('getScene returns null for null id', () => {
    expect(useWorldStore.getState().getScene(null)).toBeNull()
  })

  it('getSceneEntityEntries returns entries for known scene', () => {
    const entries = useWorldStore.getState().getSceneEntityEntries('scene-1')
    expect(entries).toEqual([{ entityId: 'entity-1', visible: true }])
  })

  it('getSceneEntityEntries returns stable empty array for unknown scene', () => {
    const entries1 = useWorldStore.getState().getSceneEntityEntries('no-scene')
    const entries2 = useWorldStore.getState().getSceneEntityEntries('no-scene')
    expect(entries1).toEqual([])
    expect(entries1).toBe(entries2) // same reference
  })

  // ── Handout local actions ──

  it('addHandoutAsset adds to handoutAssets', () => {
    useWorldStore.getState().addHandoutAsset({
      id: 'h1',
      imageUrl: '/img.png',
      createdAt: Date.now(),
    })

    expect(useWorldStore.getState().handoutAssets).toHaveLength(1)
    expect(useWorldStore.getState().handoutAssets[0]?.id).toBe('h1')
  })

  it('updateHandoutAsset updates matching handout', () => {
    useWorldStore.getState().addHandoutAsset({
      id: 'h2',
      imageUrl: '/old.png',
      createdAt: Date.now(),
    })
    useWorldStore.getState().updateHandoutAsset('h2', { imageUrl: '/new.png' })

    const handout = useWorldStore.getState().handoutAssets.find((h) => h.id === 'h2')
    expect(handout?.imageUrl).toBe('/new.png')
  })

  it('deleteHandoutAsset removes from handoutAssets', () => {
    useWorldStore.getState().addHandoutAsset({
      id: 'h3',
      imageUrl: '/del.png',
      createdAt: Date.now(),
    })
    useWorldStore.getState().deleteHandoutAsset('h3')

    expect(useWorldStore.getState().handoutAssets.find((h) => h.id === 'h3')).toBeUndefined()
  })
})
