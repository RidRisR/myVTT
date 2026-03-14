import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'events'
import { useWorldStore } from '../worldStore'
import type { Scene, CombatInfo, RoomState, TeamTracker, AssetRecord } from '../worldStore'
import type { Entity, MapToken } from '../../shared/entityTypes'
import type { ShowcaseItem } from '../../showcase/showcaseTypes'
import type { ChatTextMessage } from '../../chat/chatTypes'

// ── Mock fetch globally (api.ts uses fetch internally) ──

const mockResponses: Record<string, unknown> = {}

vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string) => {
    const path = new URL(url).pathname
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '1' }),
      json: async () => mockResponses[path] ?? [],
    }
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
  size: 1,
  notes: '',
  ruleData: {},
  permissions: { default: 'none', seats: {} },
  persistent: true,
  ...overrides,
})

const makeToken = (overrides: Partial<MapToken> = {}): MapToken => ({
  id: 'token-1',
  x: 100,
  y: 200,
  size: 1,
  permissions: { default: 'none', seats: {} },
  ...overrides,
})

const makeCombatInfo = (overrides: Partial<CombatInfo> = {}): CombatInfo => ({
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
  tokens: {},
  initiativeOrder: [],
  initiativeIndex: 0,
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

// ── Reset store between tests ──

beforeEach(() => {
  useWorldStore.setState({
    room: { activeSceneId: null, activeEncounterId: null },
    scenes: [],
    entities: {},
    sceneEntityMap: {},
    chatMessages: [],
    combatInfo: null,
    blueprints: [],
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
  Object.keys(mockResponses).forEach((k) => delete mockResponses[k])
})

// ── Helper: set up mock responses for init() ──

function setupInitMockResponses(overrides: Record<string, unknown> = {}) {
  const scene = makeScene()
  const defaults: Record<string, unknown> = {
    [`/api/rooms/${ROOM_ID}/scenes`]: [scene],
    [`/api/rooms/${ROOM_ID}/entities`]: [makeEntity()],
    [`/api/rooms/${ROOM_ID}/chat`]: [makeChatMessage()],
    [`/api/rooms/${ROOM_ID}/combat`]: null,
    [`/api/rooms/${ROOM_ID}/team-trackers`]: [makeTracker()],
    [`/api/rooms/${ROOM_ID}/state`]: { activeSceneId: scene.id, activeEncounterId: null },
    [`/api/rooms/${ROOM_ID}/assets`]: [makeAsset()],
    [`/api/rooms/${ROOM_ID}/showcase`]: [makeShowcaseItem()],
    [`/api/rooms/${ROOM_ID}/scenes/${scene.id}/entities`]: ['entity-1'],
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
    expect(state.scenes[0].name).toBe('Test Scene')
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

  it('populates sceneEntityMap with per-scene entity IDs', async () => {
    setupInitMockResponses()
    const socket = createMockSocket()

    await useWorldStore.getState().init(ROOM_ID, socket as never)

    const map = useWorldStore.getState().sceneEntityMap
    expect(map['scene-1']).toEqual(['entity-1'])
  })

  it('registers socket event listeners for all WS_EVENTS', async () => {
    setupInitMockResponses()
    const socket = createMockSocket()

    await useWorldStore.getState().init(ROOM_ID, socket as never)

    // All expected events should have been registered
    const registeredEvents = socket._onSpy.mock.calls.map((c) => c[0])
    expect(registeredEvents).toContain('scene:created')
    expect(registeredEvents).toContain('entity:created')
    expect(registeredEvents).toContain('combat:activated')
    expect(registeredEvents).toContain('chat:new')
    expect(registeredEvents).toContain('room:state:updated')
    expect(registeredEvents).toContain('tracker:created')
    expect(registeredEvents).toContain('asset:created')
    expect(registeredEvents).toContain('showcase:created')
    expect(registeredEvents).toContain('encounter:created')
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
    expect(removedEvents).toContain('combat:activated')
    expect(removedEvents).toContain('chat:new')
    expect(removedEvents).toContain('room:state:updated')
    expect(removedEvents).toContain('tracker:created')
    expect(removedEvents).toContain('asset:created')
    expect(removedEvents).toContain('showcase:cleared')
    expect(removedEvents).toContain('encounter:created')
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
    expect(useWorldStore.getState().scenes[1].id).toBe('scene-2')
  })

  it('scene:updated updates matching scene', () => {
    socket._trigger('scene:updated', makeScene({ id: 'scene-1', name: 'Updated Name' }))

    expect(useWorldStore.getState().scenes[0].name).toBe('Updated Name')
  })

  it('scene:deleted removes from scenes', () => {
    socket._trigger('scene:deleted', { id: 'scene-1' })

    expect(useWorldStore.getState().scenes).toHaveLength(0)
  })

  it('scene:entity:linked adds entity ID to sceneEntityMap', () => {
    socket._trigger('scene:entity:linked', { sceneId: 'scene-1', entityId: 'entity-2' })

    expect(useWorldStore.getState().sceneEntityMap['scene-1']).toContain('entity-2')
  })

  it('scene:entity:linked does not duplicate existing entity ID', () => {
    socket._trigger('scene:entity:linked', { sceneId: 'scene-1', entityId: 'entity-1' })

    const ids = useWorldStore.getState().sceneEntityMap['scene-1']
    expect(ids.filter((id) => id === 'entity-1')).toHaveLength(1)
  })

  it('scene:entity:unlinked removes entity ID from sceneEntityMap', () => {
    socket._trigger('scene:entity:unlinked', { sceneId: 'scene-1', entityId: 'entity-1' })

    expect(useWorldStore.getState().sceneEntityMap['scene-1']).not.toContain('entity-1')
  })

  // -- Entity events --

  it('entity:created adds to entities record', () => {
    const newEntity = makeEntity({ id: 'entity-2', name: 'Villain' })
    socket._trigger('entity:created', newEntity)

    expect(useWorldStore.getState().entities['entity-2']).toBeDefined()
    expect(useWorldStore.getState().entities['entity-2'].name).toBe('Villain')
  })

  it('entity:updated updates matching entity', () => {
    socket._trigger('entity:updated', makeEntity({ id: 'entity-1', name: 'Renamed Hero' }))

    expect(useWorldStore.getState().entities['entity-1'].name).toBe('Renamed Hero')
  })

  it('entity:deleted removes from entities', () => {
    socket._trigger('entity:deleted', { id: 'entity-1' })

    expect(useWorldStore.getState().entities['entity-1']).toBeUndefined()
  })

  // -- Combat events --

  it('combat:activated sets combatInfo', () => {
    const combat = makeCombatInfo()
    socket._trigger('combat:activated', combat)

    expect(useWorldStore.getState().combatInfo).not.toBeNull()
    expect(useWorldStore.getState().combatInfo?.mapUrl).toBe('/map.png')
  })

  it('combat:ended clears combatInfo', () => {
    // First activate combat
    socket._trigger('combat:activated', makeCombatInfo())
    expect(useWorldStore.getState().combatInfo).not.toBeNull()

    socket._trigger('combat:ended')

    expect(useWorldStore.getState().combatInfo).toBeNull()
  })

  it('combat:token:added adds to combatInfo.tokens', () => {
    socket._trigger('combat:activated', makeCombatInfo())

    const token = makeToken({ id: 'token-1' })
    socket._trigger('combat:token:added', token)

    expect(useWorldStore.getState().combatInfo?.tokens['token-1']).toBeDefined()
  })

  it('combat:token:added is no-op when combatInfo is null', () => {
    // combatInfo is null (no combat active)
    socket._trigger('combat:token:added', makeToken())

    expect(useWorldStore.getState().combatInfo).toBeNull()
  })

  it('combat:token:updated updates token fields', () => {
    socket._trigger('combat:activated', makeCombatInfo({
      tokens: { 'token-1': makeToken({ id: 'token-1', x: 100 }) },
    }))

    socket._trigger('combat:token:updated', { tokenId: 'token-1', changes: { x: 300 } })

    expect(useWorldStore.getState().combatInfo?.tokens['token-1'].x).toBe(300)
  })

  it('combat:token:removed removes from combatInfo.tokens', () => {
    socket._trigger('combat:activated', makeCombatInfo({
      tokens: { 'token-1': makeToken({ id: 'token-1' }) },
    }))

    socket._trigger('combat:token:removed', { tokenId: 'token-1' })

    expect(useWorldStore.getState().combatInfo?.tokens['token-1']).toBeUndefined()
  })

  // -- Chat events --

  it('chat:new appends to chatMessages', () => {
    const msg = makeChatMessage({ id: 'msg-2', content: 'World' })
    socket._trigger('chat:new', msg)

    const msgs = useWorldStore.getState().chatMessages
    expect(msgs).toHaveLength(2)
    expect(msgs[1].id).toBe('msg-2')
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
    expect(room.activeEncounterId).toBeNull()
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
    expect(useWorldStore.getState().assets[0].id).toBe('asset-2')
  })

  it('asset:updated updates matching asset', () => {
    socket._trigger('asset:updated', makeAsset({ id: 'asset-1', name: 'renamed.png' }))

    expect(useWorldStore.getState().assets[0].name).toBe('renamed.png')
  })

  it('asset:deleted removes from assets', () => {
    socket._trigger('asset:deleted', { id: 'asset-1' })

    expect(useWorldStore.getState().assets).toHaveLength(0)
  })

  // -- Combat edge cases --

  it('combat:updated replaces combatInfo completely', () => {
    socket._trigger('combat:activated', makeCombatInfo({ mapUrl: '/old.png' }))
    const updatedCombat = makeCombatInfo({ mapUrl: '/new.png', initiativeIndex: 3 })
    socket._trigger('combat:updated', updatedCombat)

    expect(useWorldStore.getState().combatInfo?.mapUrl).toBe('/new.png')
    expect(useWorldStore.getState().combatInfo?.initiativeIndex).toBe(3)
  })

  it('combat:token:updated is no-op when combatInfo is null', () => {
    // combatInfo is null (no combat active)
    socket._trigger('combat:token:updated', { tokenId: 'token-1', changes: { x: 999 } })

    expect(useWorldStore.getState().combatInfo).toBeNull()
  })

  it('combat:token:updated is no-op when token does not exist', () => {
    socket._trigger('combat:activated', makeCombatInfo({
      tokens: { 'token-1': makeToken({ id: 'token-1', x: 100 }) },
    }))

    socket._trigger('combat:token:updated', { tokenId: 'nonexistent', changes: { x: 300 } })

    // Existing token unchanged
    expect(useWorldStore.getState().combatInfo?.tokens['token-1'].x).toBe(100)
  })

  it('combat:token:removed is no-op when combatInfo is null', () => {
    socket._trigger('combat:token:removed', { tokenId: 'token-1' })

    expect(useWorldStore.getState().combatInfo).toBeNull()
  })

  // -- Tracker edge cases --

  it('tracker:updated updates matching tracker fields', () => {
    const updated = makeTracker({ id: 'tracker-1', label: 'HP', current: 15, max: 20 })
    socket._trigger('tracker:updated', updated)

    const tracker = useWorldStore.getState().teamTrackers[0]
    expect(tracker.current).toBe(15)
    expect(tracker.label).toBe('HP')
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

    expect(useWorldStore.getState().showcaseItems[0].type).toBe('handout')
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

    expect(useWorldStore.getState().sceneEntityMap['new-scene']).toEqual(['entity-1'])
  })

  it('scene:entity:unlinked on empty list does not crash', () => {
    socket._trigger('scene:entity:unlinked', { sceneId: 'nonexistent', entityId: 'entity-1' })

    expect(useWorldStore.getState().sceneEntityMap['nonexistent']).toEqual([])
  })

  // -- Room state --

  it('room:state:updated preserves fields not in payload', () => {
    // Set initial room state with both fields
    useWorldStore.setState({ room: { activeSceneId: 'scene-1', activeEncounterId: 'enc-1' } })

    // Update only one field
    socket._trigger('room:state:updated', { activeSceneId: 'scene-2' })

    const room = useWorldStore.getState().room
    expect(room.activeSceneId).toBe('scene-2')
    expect(room.activeEncounterId).toBe('enc-1')
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
    const lastCall = calls[calls.length - 1]
    const url = lastCall[0] as string
    const options = lastCall[1] as RequestInit | undefined
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

  it('addToken calls POST /api/rooms/{roomId}/combat/tokens', async () => {
    await useWorldStore.getState().addToken(makeToken())

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/combat/tokens`)
    expect(method).toBe('POST')
  })

  it('updateToken calls PATCH /api/rooms/{roomId}/combat/tokens/{id}', async () => {
    await useWorldStore.getState().updateToken('token-1', { x: 500 })

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/combat/tokens/token-1`)
    expect(method).toBe('PATCH')
  })

  it('endCombat calls POST /api/rooms/{roomId}/combat/end', async () => {
    await useWorldStore.getState().endCombat()

    const { url, method } = getLastFetchCall()
    expect(url).toContain(`/api/rooms/${ROOM_ID}/combat/end`)
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
    const result = useWorldStore.getState().updateShowcaseItem('item-1', { pinned: true })
    expect(result).toBeInstanceOf(Promise)
    await result
  })

  // ── getScene / getSceneEntityIds ──

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

  it('getSceneEntityIds returns ids for known scene', () => {
    const ids = useWorldStore.getState().getSceneEntityIds('scene-1')
    expect(ids).toEqual(['entity-1'])
  })

  it('getSceneEntityIds returns stable empty array for unknown scene', () => {
    const ids1 = useWorldStore.getState().getSceneEntityIds('no-scene')
    const ids2 = useWorldStore.getState().getSceneEntityIds('no-scene')
    expect(ids1).toEqual([])
    expect(ids1).toBe(ids2) // same reference
  })

  // ── Handout local actions ──

  it('addHandoutAsset adds to handoutAssets', () => {
    useWorldStore.getState().addHandoutAsset({
      id: 'h1',
      imageUrl: '/img.png',
      createdAt: Date.now(),
    })

    expect(useWorldStore.getState().handoutAssets).toHaveLength(1)
    expect(useWorldStore.getState().handoutAssets[0].id).toBe('h1')
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
