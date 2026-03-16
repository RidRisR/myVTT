# Entity Architecture Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat Character/CombatToken data model with the new Entity architecture: nested Y.Map('world'), per-entity permissions, scene-scoped entities/tokens, and party container for PCs.

**Architecture:** Single `Y.Map('world')` containing nested Y.Maps for scenes (with entities + tokens), party (PCs as nested Y.Maps for field-level CRDT), prepared (GM staging), blueprints, seats, and chat. All game data moves into `entity.ruleData`. UI accesses data through adapter pattern on RuleSystem interface.

**Tech Stack:** React 19, TypeScript 5.9, Yjs (Y.Map, Y.Map nesting, observe/observeDeep), y-websocket v2

**Breaking change:** Existing room data is incompatible. Wipe `db/` folder after migration.

---

## Overview

15 tasks across 4 phases:

| Phase           | Tasks | What                                                                  |
| --------------- | ----- | --------------------------------------------------------------------- |
| 1. Types        | 1-2   | New interfaces, permission helpers                                    |
| 2. Data layer   | 3-6   | useWorld, useEntities, useSceneTokens, migration of useRoom/useScenes |
| 3. UI migration | 7-12  | App.tsx, PortraitBar, combat, character panels, chat, dock            |
| 4. Cleanup      | 13-15 | Delete old code, update RuleSystem, verify build                      |

Each task ends with `npx tsc --noEmit` (type-check) and, where applicable, `npm run build` (full build). No test framework exists in this project; verification is type-checking + manual browser testing.

---

### Task 1: Entity type definitions

**Files:**

- Create: `src/shared/entityTypes.ts`
- Create: `src/shared/permissions.ts`

**Step 1: Create entityTypes.ts**

```typescript
// src/shared/entityTypes.ts

export type PermissionLevel = 'none' | 'observer' | 'owner'

export interface EntityPermissions {
  default: PermissionLevel
  seats: Record<string, PermissionLevel>
}

export interface Entity {
  id: string
  name: string
  imageUrl: string
  color: string
  size: number
  blueprintId?: string
  notes: string
  ruleData: unknown
  permissions: EntityPermissions
}

export interface MapToken {
  id: string
  entityId?: string
  x: number
  y: number
  size: number
  gmOnly: boolean
  label?: string
  imageUrl?: string
  color?: string
}

export interface Blueprint {
  id: string
  name: string
  imageUrl: string
  defaultSize: number
  defaultColor: string
  defaultRuleData?: unknown
}
```

**Step 2: Create permissions.ts**

```typescript
// src/shared/permissions.ts
import type { Entity, PermissionLevel } from './entityTypes'

export function getPermission(entity: Entity, seatId: string): PermissionLevel {
  return entity.permissions.seats[seatId] ?? entity.permissions.default
}

export function canSee(entity: Entity, seatId: string, role: 'GM' | 'PL'): boolean {
  if (role === 'GM') return true
  return getPermission(entity, seatId) !== 'none'
}

export function canEdit(entity: Entity, seatId: string, role: 'GM' | 'PL'): boolean {
  if (role === 'GM') return true
  return getPermission(entity, seatId) === 'owner'
}

export function defaultPCPermissions(ownerSeatId: string): Entity['permissions'] {
  return { default: 'observer', seats: { [ownerSeatId]: 'owner' } }
}

export function defaultNPCPermissions(): Entity['permissions'] {
  return { default: 'observer', seats: {} }
}

export function hiddenNPCPermissions(): Entity['permissions'] {
  return { default: 'none', seats: {} }
}
```

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors (new files, nothing imports them yet)

**Step 4: Commit**

```bash
git add src/shared/entityTypes.ts src/shared/permissions.ts
git commit -m "feat: add Entity type definitions and permission helpers"
```

---

### Task 2: useWorld hook — nested Y.Map structure

**Files:**

- Create: `src/yjs/useWorld.ts`

**Step 1: Create useWorld.ts**

This hook initializes and provides typed access to the `Y.Map('world')` structure. It ensures nested Y.Maps exist (creates them in a transaction if missing).

```typescript
// src/yjs/useWorld.ts
import { useMemo } from 'react'
import * as Y from 'yjs'

export interface WorldMaps {
  /** Top-level world map */
  world: Y.Map<unknown>
  /** Y.Map of sceneId → Y.Map (each scene contains config keys, 'entities' Y.Map, 'tokens' Y.Map) */
  scenes: Y.Map<Y.Map<unknown>>
  /** Y.Map of entityId → Y.Map (PC entities, field-level CRDT) */
  party: Y.Map<Y.Map<unknown>>
  /** Y.Map of entityId → plain Entity object (GM staging area) */
  prepared: Y.Map<unknown>
  /** Y.Map of blueprintId → plain Blueprint object */
  blueprints: Y.Map<unknown>
  /** Y.Map of seatId → plain Seat object */
  seats: Y.Map<unknown>
  /** Y.Array of ChatMessage objects */
  chat: Y.Array<unknown>
  /** Y.Map of room-level state (mode, activeSceneId, etc.) */
  room: Y.Map<unknown>
}

function ensureSubMap(parent: Y.Map<unknown>, key: string, doc: Y.Doc): Y.Map<unknown> {
  let sub = parent.get(key) as Y.Map<unknown> | undefined
  if (!(sub instanceof Y.Map)) {
    sub = new Y.Map()
    doc.transact(() => {
      parent.set(key, sub!)
    })
  }
  return sub
}

function ensureSubArray(parent: Y.Map<unknown>, key: string, doc: Y.Doc): Y.Array<unknown> {
  let sub = parent.get(key) as Y.Array<unknown> | undefined
  if (!(sub instanceof Y.Array)) {
    sub = new Y.Array()
    doc.transact(() => {
      parent.set(key, sub!)
    })
  }
  return sub
}

export function useWorld(yDoc: Y.Doc): WorldMaps {
  return useMemo(() => {
    const world = yDoc.getMap('world')
    return {
      world,
      scenes: ensureSubMap(world, 'scenes', yDoc) as Y.Map<Y.Map<unknown>>,
      party: ensureSubMap(world, 'party', yDoc) as Y.Map<Y.Map<unknown>>,
      prepared: ensureSubMap(world, 'prepared', yDoc),
      blueprints: ensureSubMap(world, 'blueprints', yDoc),
      seats: ensureSubMap(world, 'seats', yDoc),
      chat: ensureSubArray(world, 'chat', yDoc) as Y.Array<unknown>,
      room: ensureSubMap(world, 'room', yDoc),
    }
  }, [yDoc])
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/yjs/useWorld.ts
git commit -m "feat: add useWorld hook for nested Y.Map structure"
```

---

### Task 3: useEntities hook — entity CRUD across containers

**Files:**

- Create: `src/entities/useEntities.ts`

**Step 1: Create useEntities.ts**

This hook observes party + prepared + current scene's entities, merges them into a single lookup, and provides CRUD operations. PCs use nested Y.Map (field-level CRDT), NPCs use plain objects.

```typescript
// src/entities/useEntities.ts
import { useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { Entity } from '../shared/entityTypes'
import type { WorldMaps } from '../yjs/useWorld'

type EntityWithSource = Entity & { _source: 'party' | 'prepared' | string }

function readYMapEntity(yMap: Y.Map<unknown>): Entity {
  return {
    id: yMap.get('id') as string,
    name: (yMap.get('name') as string) ?? '',
    imageUrl: (yMap.get('imageUrl') as string) ?? '',
    color: (yMap.get('color') as string) ?? '',
    size: (yMap.get('size') as number) ?? 1,
    blueprintId: yMap.get('blueprintId') as string | undefined,
    notes: (yMap.get('notes') as string) ?? '',
    ruleData: yMap.get('ruleData') ?? null,
    permissions: (yMap.get('permissions') as Entity['permissions']) ?? {
      default: 'observer',
      seats: {},
    },
  }
}

function entityToYMap(entity: Entity, doc: Y.Doc): Y.Map<unknown> {
  const yMap = new Y.Map<unknown>()
  doc.transact(() => {
    // We don't set values here — they must be set AFTER integration
  })
  return yMap
}

function setYMapFields(yMap: Y.Map<unknown>, entity: Entity) {
  yMap.set('id', entity.id)
  yMap.set('name', entity.name)
  yMap.set('imageUrl', entity.imageUrl)
  yMap.set('color', entity.color)
  yMap.set('size', entity.size)
  if (entity.blueprintId) yMap.set('blueprintId', entity.blueprintId)
  yMap.set('notes', entity.notes)
  yMap.set('ruleData', entity.ruleData)
  yMap.set('permissions', entity.permissions)
}

export function useEntities(world: WorldMaps, currentSceneId: string | null, yDoc: Y.Doc) {
  const [entities, setEntities] = useState<EntityWithSource[]>([])

  // Collect entities from all sources
  const rebuild = useCallback(() => {
    const result: EntityWithSource[] = []

    // Party (PCs) — nested Y.Maps
    world.party.forEach((yMap, _id) => {
      if (yMap instanceof Y.Map) {
        result.push({ ...readYMapEntity(yMap), _source: 'party' })
      }
    })

    // Prepared (GM staging) — plain objects
    world.prepared.forEach((val, _id) => {
      const entity = val as Entity
      if (entity && entity.id) {
        result.push({ ...entity, _source: 'prepared' })
      }
    })

    // Current scene entities — plain objects
    if (currentSceneId) {
      const sceneMap = world.scenes.get(currentSceneId)
      if (sceneMap instanceof Y.Map) {
        const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
        if (sceneEntities instanceof Y.Map) {
          sceneEntities.forEach((entity, _id) => {
            if (entity && entity.id) {
              result.push({ ...entity, _source: `scene:${currentSceneId}` })
            }
          })
        }
      }
    }

    setEntities(result)
  }, [world, currentSceneId])

  // Observe all containers
  useEffect(() => {
    rebuild()

    // Party: observeDeep because values are nested Y.Maps
    world.party.observeDeep(rebuild)

    // Prepared: observe (plain objects, top-level changes only)
    world.prepared.observe(rebuild)

    // Current scene entities
    let sceneEntitiesMap: Y.Map<unknown> | null = null
    if (currentSceneId) {
      const sceneMap = world.scenes.get(currentSceneId)
      if (sceneMap instanceof Y.Map) {
        sceneEntitiesMap = sceneMap.get('entities') as Y.Map<unknown> | null
        if (sceneEntitiesMap instanceof Y.Map) {
          sceneEntitiesMap.observe(rebuild)
        }
      }
    }

    return () => {
      world.party.unobserveDeep(rebuild)
      world.prepared.unobserve(rebuild)
      if (sceneEntitiesMap instanceof Y.Map) {
        sceneEntitiesMap.unobserve(rebuild)
      }
    }
  }, [world, currentSceneId, rebuild])

  // --- CRUD ---

  /** Add PC to party (nested Y.Map) */
  const addPartyEntity = useCallback(
    (entity: Entity) => {
      yDoc.transact(() => {
        const yMap = new Y.Map<unknown>()
        world.party.set(entity.id, yMap)
        setYMapFields(yMap, entity)
      })
    },
    [world, yDoc],
  )

  /** Add NPC to current scene (plain object) */
  const addSceneEntity = useCallback(
    (entity: Entity, sceneId?: string) => {
      const targetSceneId = sceneId ?? currentSceneId
      if (!targetSceneId) return
      const sceneMap = world.scenes.get(targetSceneId)
      if (!(sceneMap instanceof Y.Map)) return
      const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
      if (sceneEntities instanceof Y.Map) {
        sceneEntities.set(entity.id, entity)
      }
    },
    [world, currentSceneId],
  )

  /** Add entity to prepared (plain object) */
  const addPreparedEntity = useCallback(
    (entity: Entity) => {
      world.prepared.set(entity.id, entity)
    },
    [world],
  )

  /** Update entity (auto-detects source) */
  const updateEntity = useCallback(
    (id: string, updates: Partial<Entity>) => {
      // Check party first (nested Y.Map)
      const partyYMap = world.party.get(id)
      if (partyYMap instanceof Y.Map) {
        yDoc.transact(() => {
          for (const [key, value] of Object.entries(updates)) {
            partyYMap.set(key, value)
          }
        })
        return
      }

      // Check prepared
      const preparedEntity = world.prepared.get(id) as Entity | undefined
      if (preparedEntity) {
        world.prepared.set(id, { ...preparedEntity, ...updates })
        return
      }

      // Check current scene
      if (currentSceneId) {
        const sceneMap = world.scenes.get(currentSceneId)
        if (sceneMap instanceof Y.Map) {
          const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
          if (sceneEntities instanceof Y.Map) {
            const existing = sceneEntities.get(id)
            if (existing) {
              sceneEntities.set(id, { ...existing, ...updates })
              return
            }
          }
        }
      }
    },
    [world, currentSceneId, yDoc],
  )

  /** Delete entity from wherever it lives */
  const deleteEntity = useCallback(
    (id: string) => {
      if (world.party.has(id)) {
        world.party.delete(id)
        return
      }
      if (world.prepared.has(id)) {
        world.prepared.delete(id)
        return
      }
      if (currentSceneId) {
        const sceneMap = world.scenes.get(currentSceneId)
        if (sceneMap instanceof Y.Map) {
          const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
          if (sceneEntities instanceof Y.Map && sceneEntities.has(id)) {
            sceneEntities.delete(id)
          }
        }
      }
    },
    [world, currentSceneId],
  )

  /** Get entity by ID */
  const getEntity = useCallback(
    (id: string | null): Entity | null => {
      if (!id) return null
      return entities.find((e) => e.id === id) ?? null
    },
    [entities],
  )

  /** Promote entity from scene to prepared (GM collection) */
  const promoteToGM = useCallback(
    (id: string) => {
      if (!currentSceneId) return
      const sceneMap = world.scenes.get(currentSceneId)
      if (!(sceneMap instanceof Y.Map)) return
      const sceneEntities = sceneMap.get('entities') as Y.Map<Entity> | undefined
      if (!(sceneEntities instanceof Y.Map)) return
      const entity = sceneEntities.get(id)
      if (!entity) return
      yDoc.transact(() => {
        world.prepared.set(id, entity)
        sceneEntities.delete(id)
      })
    },
    [world, currentSceneId, yDoc],
  )

  return {
    entities: entities as Entity[],
    addPartyEntity,
    addSceneEntity,
    addPreparedEntity,
    updateEntity,
    deleteEntity,
    getEntity,
    promoteToGM,
  }
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/entities/useEntities.ts
git commit -m "feat: add useEntities hook with multi-container entity management"
```

---

### Task 4: useSceneTokens hook — per-scene token management

**Files:**

- Create: `src/combat/useSceneTokens.ts`

**Step 1: Create useSceneTokens.ts**

```typescript
// src/combat/useSceneTokens.ts
import { useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { MapToken } from '../shared/entityTypes'
import type { WorldMaps } from '../yjs/useWorld'

function getTokensMap(world: WorldMaps, sceneId: string | null): Y.Map<MapToken> | null {
  if (!sceneId) return null
  const sceneMap = world.scenes.get(sceneId)
  if (!(sceneMap instanceof Y.Map)) return null
  const tokens = sceneMap.get('tokens')
  if (tokens instanceof Y.Map) return tokens as Y.Map<MapToken>
  return null
}

export function useSceneTokens(world: WorldMaps, sceneId: string | null, yDoc: Y.Doc) {
  const [tokens, setTokens] = useState<MapToken[]>([])

  const tokensMap = getTokensMap(world, sceneId)

  useEffect(() => {
    if (!tokensMap) {
      setTokens([])
      return
    }
    const read = () => {
      const result: MapToken[] = []
      tokensMap.forEach((t) => result.push(t))
      setTokens(result)
    }
    read()
    tokensMap.observe(read)
    return () => tokensMap.unobserve(read)
  }, [tokensMap])

  const addToken = useCallback(
    (token: MapToken) => {
      tokensMap?.set(token.id, token)
    },
    [tokensMap],
  )

  const updateToken = useCallback(
    (id: string, updates: Partial<MapToken>) => {
      if (!tokensMap) return
      const existing = tokensMap.get(id)
      if (existing) {
        tokensMap.set(id, { ...existing, ...updates })
      }
    },
    [tokensMap],
  )

  const deleteToken = useCallback(
    (id: string) => {
      tokensMap?.delete(id)
    },
    [tokensMap],
  )

  const getToken = useCallback(
    (id: string | null): MapToken | null => {
      if (!id || !tokensMap) return null
      return tokensMap.get(id) ?? null
    },
    [tokensMap],
  )

  return { tokens, addToken, updateToken, deleteToken, getToken }
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/combat/useSceneTokens.ts
git commit -m "feat: add useSceneTokens hook for per-scene token management"
```

---

### Task 5: Migrate useRoom to use world.room

**Files:**

- Modify: `src/yjs/useRoom.ts`

**Step 1: Update useRoom to accept world.room Y.Map instead of yDoc**

Change the hook signature from `useRoom(yDoc)` to `useRoom(yRoom: Y.Map<unknown>)`. This decouples it from the top-level Y.Doc and works with the nested structure.

Current (line 18-19):

```typescript
export function useRoom(yDoc: Y.Doc) {
  const yRoom = yDoc.getMap<unknown>('room')
```

Replace with:

```typescript
export function useRoom(yRoom: Y.Map<unknown>) {
```

Remove the `const yRoom = yDoc.getMap<unknown>('room')` line. Update all `yDoc.transact()` calls to use `yRoom.doc!.transact()`.

The rest of the hook stays the same — it already uses yRoom internally.

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: Errors in App.tsx where `useRoom(yDoc)` is called — this is expected, will be fixed in Task 7.

**Step 3: Commit**

```bash
git add src/yjs/useRoom.ts
git commit -m "refactor: useRoom accepts Y.Map instead of yDoc"
```

---

### Task 6: Migrate useScenes + scene helper for nested structure

**Files:**

- Modify: `src/yjs/useScenes.ts`

**Step 1: Update useScenes to work with world.scenes**

Change hook signature from `useScenes(yDoc)` to `useScenes(yScenes: Y.Map<Y.Map<unknown>>, yDoc: Y.Doc)`.

Scene config fields (name, imageUrl, gridSize, etc.) are now stored as individual keys on the scene Y.Map, not as a flat Scene object. The hook must read/write them accordingly.

Also, when creating a scene, initialize the nested `entities` and `tokens` Y.Maps.

Key changes:

- `addScene` must create a Y.Map with config fields + nested entities/tokens Y.Maps in a transaction
- `updateScene` must set individual keys on the scene Y.Map
- `deleteScene` is simply `yScenes.delete(id)`
- Reading scenes: iterate yScenes, for each scene Y.Map read config keys into a Scene object

The Scene interface stays the same (it's what the UI sees). The hook translates between Scene objects and Y.Map keys.

```typescript
// Updated readScenes helper
function readScenes(yScenes: Y.Map<Y.Map<unknown>>): Scene[] {
  const scenes: Scene[] = []
  yScenes.forEach((sceneMap, id) => {
    if (!(sceneMap instanceof Y.Map)) return
    scenes.push({
      id,
      name: (sceneMap.get('name') as string) ?? '',
      imageUrl: (sceneMap.get('imageUrl') as string) ?? '',
      width: (sceneMap.get('width') as number) ?? 0,
      height: (sceneMap.get('height') as number) ?? 0,
      gridSize: (sceneMap.get('gridSize') as number) ?? 50,
      gridVisible: (sceneMap.get('gridVisible') as boolean) ?? true,
      gridColor: (sceneMap.get('gridColor') as string) ?? 'rgba(255,255,255,0.15)',
      gridOffsetX: (sceneMap.get('gridOffsetX') as number) ?? 0,
      gridOffsetY: (sceneMap.get('gridOffsetY') as number) ?? 0,
      sortOrder: (sceneMap.get('sortOrder') as number) ?? 0,
    })
  })
  return scenes
}

// Updated addScene
const addScene = (scene: Scene) => {
  yDoc.transact(() => {
    const sceneMap = new Y.Map<unknown>()
    yScenes.set(scene.id, sceneMap)
    // Config fields
    sceneMap.set('name', scene.name)
    sceneMap.set('imageUrl', scene.imageUrl)
    sceneMap.set('width', scene.width)
    sceneMap.set('height', scene.height)
    sceneMap.set('gridSize', scene.gridSize)
    sceneMap.set('gridVisible', scene.gridVisible)
    sceneMap.set('gridColor', scene.gridColor)
    sceneMap.set('gridOffsetX', scene.gridOffsetX)
    sceneMap.set('gridOffsetY', scene.gridOffsetY)
    sceneMap.set('sortOrder', scene.sortOrder)
    // Nested containers
    sceneMap.set('entities', new Y.Map())
    sceneMap.set('tokens', new Y.Map())
  })
}

// Updated updateScene
const updateScene = (id: string, updates: Partial<Scene>) => {
  const sceneMap = yScenes.get(id)
  if (!(sceneMap instanceof Y.Map)) return
  yDoc.transact(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id') continue // don't overwrite id
      sceneMap.set(key, value)
    }
  })
}
```

Must use `observeDeep` on yScenes since we need to detect changes to config keys inside nested scene Y.Maps.

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: Errors in App.tsx — will be fixed in Task 7.

**Step 3: Commit**

```bash
git add src/yjs/useScenes.ts
git commit -m "refactor: useScenes works with nested Y.Map scene structure"
```

---

### Task 7: Migrate useIdentity to use world.seats

**Files:**

- Modify: `src/identity/useIdentity.ts`

**Step 1: Update useIdentity signature**

Change from `useIdentity(yDoc, awareness)` to `useIdentity(ySeats: Y.Map<unknown>, awareness: Awareness | null)`.

Replace `const yPlayers = yDoc.getMap<Seat>('players')` with using the passed-in `ySeats` map (cast as `Y.Map<Seat>`).

The rest of the hook logic stays the same.

**Step 2: Verify**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/identity/useIdentity.ts
git commit -m "refactor: useIdentity accepts Y.Map instead of yDoc"
```

---

### Task 8: Rewire App.tsx — connect new hooks

**Files:**

- Modify: `src/App.tsx`

This is the critical integration task. Replace all old hook calls with the new world-based hooks.

**Step 1: Replace hook initialization (lines 33-41)**

```typescript
// Old:
const { yDoc, isLoading, awareness } = useYjsConnection(roomId)
const { seats, ... } = useIdentity(yDoc, awareness)
const { room, ... } = useRoom(yDoc)
const { scenes, ... } = useScenes(yDoc)
const { tokens, ... } = useCombatTokens(yDoc)
const { blueprints, ... } = useTokenLibrary(yDoc)
const { characters, ... } = useCharacters(yDoc)

// New:
const { yDoc, isLoading, awareness } = useYjsConnection(roomId)
const world = useWorld(yDoc)
const { seats, ... } = useIdentity(world.seats as Y.Map<Seat>, awareness)
const { room, ... } = useRoom(world.room)
const { scenes, ... } = useScenes(world.scenes, yDoc)
const combatSceneId = room.mode === 'combat' ? room.combatSceneId : null
const { entities, addPartyEntity, addSceneEntity, updateEntity, deleteEntity, getEntity } = useEntities(world, room.activeSceneId, yDoc)
const { tokens, addToken, updateToken, deleteToken, getToken } = useSceneTokens(world, combatSceneId, yDoc)
```

**Step 2: Update auto-create PC logic (lines 52-81)**

Replace `Character` creation with `Entity` creation using `addPartyEntity`:

```typescript
useEffect(() => {
  if (!mySeat || !mySeatId) return
  const hasPC = entities.some((e) => {
    const perm = e.permissions.seats[mySeatId]
    return perm === 'owner'
  })
  if (!hasPC) {
    // Don't auto-create — design decision: no auto-character creation
    // Just set active if one exists
  }
  // ... simplified logic
}, [mySeat, mySeatId, entities])
```

Actually per the design doc: "不自动创建角色" — remove auto-create entirely. Just auto-set activeCharacterId if seat has an owned entity but no active one.

**Step 3: Update all component props**

Replace `characters` prop passing with `entities`. Replace `Character` type references with `Entity`. Replace `getCharacter` with `getEntity`.

Key changes:

- `PortraitBar`: `entities` instead of `characters`
- `MyCharacterCard`: `entity` instead of `character` (rename prop)
- `CombatViewer`: `getEntity` instead of `getCharacter`
- `ChatPanel`: `speakerEntities` instead of `speakerCharacters`
- `BottomDock`: `entities` instead of `characters`

**Step 4: Update delete handler**

```typescript
const handleDeleteEntity = (entityId: string) => {
  // Tokens auto-disappear (render-time check), no cascade needed
  deleteEntity(entityId)
  if (inspectedCharacterId === entityId) setInspectedCharacterId(null)
}
```

**Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: Many errors in child components (PortraitBar, etc.) that still expect Character. This is expected — we fix them in subsequent tasks.

**Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: App.tsx uses world-based hooks and Entity model"
```

---

### Task 9: Migrate PortraitBar to Entity

**Files:**

- Modify: `src/layout/PortraitBar.tsx`

**Step 1: Update props interface**

Replace `Character` with `Entity` in all props. Replace permission checks:

```typescript
// Old:
const featuredChars = characters.filter((c) => c.type === 'pc' || (c.type === 'npc' && c.featured))

// New (all entities visible to this seat are shown):
import { canSee } from '../shared/permissions'
const visibleEntities = entities.filter((e) => canSee(e, mySeatId, role))
```

Replace ownership checks:

```typescript
// Old:
if (char.type === 'pc' && char.seatId === mySeatId)

// New:
import { canEdit } from '../shared/permissions'
if (canEdit(entity, mySeatId, role))
```

**Step 2: Update resource/status rendering**

Since resources/statuses now live in `ruleData`, the PortraitBar needs a temporary adapter. For now, add a simple extraction helper at the top of the file:

```typescript
// Temporary adapter until RuleSystem is implemented
function getEntityResources(
  entity: Entity,
): { key: string; current: number; max: number; color: string }[] {
  const rd = entity.ruleData as any
  if (!rd?.resources) return []
  if (Array.isArray(rd.resources)) return rd.resources
  // Object form: { hp: {cur, max}, ... }
  return Object.entries(rd.resources).map(([key, val]: [string, any]) => ({
    key,
    current: val.cur ?? val.current ?? 0,
    max: val.max ?? 0,
    color: val.color ?? '#3b82f6',
  }))
}

function getEntityStatuses(entity: Entity): { label: string }[] {
  const rd = entity.ruleData as any
  return rd?.statuses ?? []
}
```

Use these throughout the component instead of direct `character.resources` access.

**Step 3: Verify**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/layout/PortraitBar.tsx
git commit -m "refactor: PortraitBar uses Entity model with permission checks"
```

---

### Task 10: Migrate combat components to Entity + MapToken

**Files:**

- Modify: `src/combat/CombatViewer.tsx`
- Modify: `src/combat/TokenLayer.tsx`
- Modify: `src/combat/MapToken.tsx`
- Modify: `src/combat/TokenOverlay.tsx`
- Modify: `src/combat/combatUtils.ts`

**Step 1: Update CombatViewer props**

Replace `getCharacter: (id: string) => Character | null` with `getEntity: (id: string) => Entity | null`.
Replace `CombatToken` with `MapToken`.

**Step 2: Update TokenLayer**

Replace character lookup:

```typescript
// Old:
const char = getCharacter(t.characterId)

// New:
const entity = t.entityId ? getEntity(t.entityId) : null
```

Replace visibility check:

```typescript
// Old:
if (role === 'GM') return true
return !t.gmOnly

// New:
if (role === 'GM') return true
if (t.gmOnly) return false
if (t.entityId) {
  const entity = getEntity(t.entityId)
  if (entity && !canSee(entity, mySeatId, role)) return false
}
return true
```

Replace drag permission:

```typescript
// Old:
canDragToken(role, char.seatId ?? null, mySeatId)

// New (in combatUtils.ts):
export function canDragToken(role: 'GM' | 'PL', entity: Entity | null, mySeatId: string): boolean {
  if (role === 'GM') return true
  if (!entity) return false
  return canEdit(entity, mySeatId, role)
}
```

**Step 3: Update MapToken**

Replace `character: Character` prop with `entity: Entity | null`. Read appearance from entity. Handle null entity (pure marker token).

**Step 4: Update TokenOverlay**

Replace `character: Character` prop with `entity: Entity`. Use the same temporary adapter functions as PortraitBar for resources/statuses.

**Step 5: Verify**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add src/combat/
git commit -m "refactor: combat components use Entity + MapToken model"
```

---

### Task 11: Migrate character panels to Entity

**Files:**

- Modify: `src/layout/MyCharacterCard.tsx`
- Modify: `src/layout/CharacterEditPanel.tsx`
- Modify: `src/layout/CharacterHoverPreview.tsx`
- Modify: `src/layout/CharacterDetailPanel.tsx`

**Step 1: Update all panel props from Character to Entity**

All four panels receive `character: Character` → change to `entity: Entity`.
All `onUpdateCharacter` → `onUpdateEntity`.

**Step 2: Extract temporary adapter for ruleData**

Create a shared temporary adapter file:

```typescript
// src/shared/entityAdapters.ts
import type { Entity } from './entityTypes'

export function getEntityResources(entity: Entity) {
  const rd = entity.ruleData as any
  if (!rd?.resources) return []
  if (Array.isArray(rd.resources)) return rd.resources
  return Object.entries(rd.resources).map(([key, val]: [string, any]) => ({
    key,
    current: val.cur ?? val.current ?? 0,
    max: val.max ?? 0,
    color: val.color ?? '#3b82f6',
  }))
}

export function getEntityAttributes(entity: Entity) {
  const rd = entity.ruleData as any
  if (!rd?.attributes) return []
  if (Array.isArray(rd.attributes)) return rd.attributes
  return Object.entries(rd.attributes).map(([key, val]: [string, any]) => ({
    key,
    value: typeof val === 'number' ? val : (val?.value ?? 0),
    category: val?.category,
  }))
}

export function getEntityStatuses(entity: Entity) {
  const rd = entity.ruleData as any
  return rd?.statuses ?? []
}
```

Use this in all panels instead of direct `character.resources` etc.

**Step 3: Update resource/attribute/status editing**

When updating resources, attributes, or statuses, write back to ruleData:

```typescript
// Old:
onUpdateCharacter(character.id, { resources: newResources })

// New:
const rd = (entity.ruleData ?? {}) as any
onUpdateEntity(entity.id, { ruleData: { ...rd, resources: newResources } })
```

**Step 4: Remove handouts tab from MyCharacterCard**

Per design: handouts deleted from Entity. Remove the CARDS tab and related code.

**Step 5: Remove favorites handling from MyCharacterCard**

Per design: favorites deleted. Remove favorites-related props from ChatPanel integration.

**Step 6: Verify**

Run: `npx tsc --noEmit`

**Step 7: Commit**

```bash
git add src/layout/ src/shared/entityAdapters.ts
git commit -m "refactor: character panels use Entity model with ruleData adapters"
```

---

### Task 12: Migrate ChatPanel + BottomDock

**Files:**

- Modify: `src/chat/ChatPanel.tsx`
- Modify: `src/dock/BottomDock.tsx`
- Modify: `src/dock/TokenDockTab.tsx`
- Modify: `src/shared/characterUtils.ts`

**Step 1: Update ChatPanel**

Replace `speakerCharacters: Character[]` with `speakerEntities: Entity[]`.
Replace character property resolution to use adapters:

```typescript
// Old:
...(speakerChar.resources ?? []).filter(r => r.key).map(...)
...(speakerChar.attributes ?? []).filter(a => a.key).map(...)

// New:
...getEntityResources(speakerEntity).filter(r => r.key).map(...)
...getEntityAttributes(speakerEntity).filter(a => a.key).map(...)
```

Remove favorites props entirely (deleted feature).

**Step 2: Update BottomDock**

Replace `characters: Character[]` with `entities: Entity[]`.
Replace `onAddCharacter` with `onAddSceneEntity`.

Update `createCharFromBlueprint` to create Entity:

```typescript
const createEntityFromBlueprint = (bp: Blueprint, sceneId: string): Entity => {
  const name = nextNpcName(bp.name, entities, bp.id)
  return {
    id: generateTokenId(),
    name,
    imageUrl: bp.imageUrl,
    color: bp.defaultColor,
    size: bp.defaultSize,
    blueprintId: bp.id,
    notes: '',
    ruleData: bp.defaultRuleData ?? null,
    permissions: defaultNPCPermissions(),
  }
}
```

**Step 3: Update characterUtils.ts**

Rename to `entityUtils.ts` or update `nextNpcName` to work with Entity[]:

```typescript
export function nextNpcName(
  baseName: string,
  existingEntities: Entity[],
  blueprintId: string,
): string {
  const siblings = existingEntities.filter((e) => e.blueprintId === blueprintId)
  // ... same logic
}
```

**Step 4: Update TokenDockTab**

Replace `TokenBlueprint` with `Blueprint` from entityTypes.

**Step 5: Verify**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add src/chat/ src/dock/ src/shared/characterUtils.ts
git commit -m "refactor: ChatPanel and BottomDock use Entity model"
```

---

### Task 13: Delete old code

**Files:**

- Delete: `src/shared/characterTypes.ts`
- Delete: `src/characters/useCharacters.ts`
- Delete: `src/combat/useCombatTokens.ts`
- Delete: `src/combat/useTokenLibrary.ts` (if fully replaced by world.blueprints)
- Modify: `src/combat/combatTypes.ts` — remove CombatToken (replaced by MapToken), keep or delete TokenBlueprint
- Modify: `src/shared/tokenTypes.ts` — keep Resource/Attribute/Status interfaces (still used by adapters and ruleData types)

**Step 1: Delete files**

```bash
rm src/shared/characterTypes.ts
rm src/characters/useCharacters.ts
rm src/combat/useCombatTokens.ts
```

**Step 2: Clean up imports**

Search all files for remaining imports of deleted modules and fix them.

**Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: Clean build with no errors

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old Character/CombatToken types and hooks"
```

---

### Task 14: Update RuleSystem interface

**Files:**

- Modify: `src/rules/types.ts`

**Step 1: Update to use Entity instead of Character**

```typescript
// Old:
import type { Character } from '../shared/characterTypes'
export interface CharacterCardProps {
  character: Character
  onUpdateCharacter: (id: string, updates: Partial<Character>) => void
}
export interface RuleSystem {
  getRollActions(character: Character): RollAction[]
}

// New:
import type { Entity } from '../shared/entityTypes'
export interface EntityCardProps {
  entity: Entity
  onUpdateEntity: (id: string, updates: Partial<Entity>) => void
  onRollAction: (action: RollAction) => void
}
export interface RuleSystem {
  id: string
  name: string
  // Adapter methods for generic UI
  getMainResource(entity: Entity): { current: number; max: number } | null
  getPortraitResources(
    entity: Entity,
  ): { label: string; current: number; max: number; color: string }[]
  getFormulaTokens(entity: Entity): Record<string, number>
  getStatuses(entity: Entity): { label: string }[]
  // Rule-specific UI
  EntityCard: React.ComponentType<EntityCardProps>
  // Dice
  getRollActions(entity: Entity): RollAction[]
  evaluateRoll(
    termResults: DiceTermResult[],
    total: number,
    context: RollContext,
  ): JudgmentResult | null
  getDieStyles(termResults: DiceTermResult[]): DieStyle[]
  getJudgmentDisplay(result: JudgmentResult): JudgmentDisplay
  getModifierOptions(): ModifierOption[]
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit && npm run build`

**Step 3: Commit**

```bash
git add src/rules/types.ts
git commit -m "refactor: RuleSystem interface uses Entity with adapter methods"
```

---

### Task 15: Final verification and database reset

**Step 1: Full build**

Run: `npm run build`
Expected: Clean build

**Step 2: Clear old data**

```bash
rm -rf db/
```

Old room data is incompatible with the new nested structure.

**Step 3: Manual test**

```bash
npm run dev
```

Open browser, create a new room, verify:

- [ ] Can create a seat and join
- [ ] Scene switching works
- [ ] Can add blueprints to token library
- [ ] Can spawn entities from blueprints to scene
- [ ] Entities appear in portrait bar
- [ ] Combat mode: tokens render on map
- [ ] Token drag works for GM
- [ ] Entity data persists across page refresh

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: entity architecture refactor complete"
```

---

## Post-Refactor: What Still Needs Work

These are NOT part of this plan but should follow:

1. **Replace temporary entityAdapters.ts** with proper RuleSystem adapter calls once a rule system (Daggerheart) is implemented
2. **Blueprint management** — currently minimal, may need its own UI
3. **Promote/demote UX** — UI for moving entities between scene ↔ GM collection
4. **Scene deletion cascade** — verify that deleting a scene cleans up properly
5. **Migration tooling** — if any existing room data needs to be preserved (not expected for dev)
