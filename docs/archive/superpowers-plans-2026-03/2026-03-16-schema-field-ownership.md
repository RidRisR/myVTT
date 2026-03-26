# Schema Field Ownership Migration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 3 misplaced fields from `room_state` to their correct tables: `rule_system_id` → `rooms`, `tactical_mode` + `active_archive_id` → `tactical_state`.

**Architecture:** Direct schema redesign (no backward-compatible migration — no old instances exist). Modify `CREATE TABLE` definitions in `schema.ts`, update all server routes that read/write the moved fields, then update frontend types/stores/components to match.

**Tech Stack:** Express 5.2 + better-sqlite3 (server), zustand v5 + React 19 (frontend), vitest (tests)

**Spec:** `docs/design/12-Schema字段归属迁移设计.md`

---

## Chunk 1: Schema + Server Foundation

### Task 1: Schema Definitions

**Files:**

- Modify: `server/schema.ts:6-11` (rooms table)
- Modify: `server/schema.ts:18-25` (room_state table)
- Modify: `server/schema.ts:100-108` (tactical_state table)
- Modify: `server/schema.ts:178-184` (migration area)

- [ ] **Step 1: Update `rooms` CREATE TABLE — add `rule_system_id`**

In `server/schema.ts`, change the `rooms` table definition inside `initGlobalSchema()`:

```typescript
// Before (lines 6-11):
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT DEFAULT 'anonymous',
  created_at INTEGER NOT NULL
)

// After:
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT DEFAULT 'anonymous',
  created_at INTEGER NOT NULL,
  rule_system_id TEXT NOT NULL DEFAULT 'generic'
)
```

- [ ] **Step 2: Update `room_state` CREATE TABLE — remove 3 columns**

In `server/schema.ts`, change lines 18-25:

```typescript
// Before:
CREATE TABLE IF NOT EXISTS room_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_scene_id TEXT,
  active_archive_id TEXT,
  tactical_mode INTEGER NOT NULL DEFAULT 0,
  rule_system_id TEXT NOT NULL DEFAULT 'generic',
  plugin_config TEXT NOT NULL DEFAULT '{}'
);

// After:
CREATE TABLE IF NOT EXISTS room_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_scene_id TEXT,
  plugin_config TEXT NOT NULL DEFAULT '{}'
);
```

- [ ] **Step 3: Update `tactical_state` CREATE TABLE — add 2 columns**

In `server/schema.ts`, change lines 100-108:

```typescript
// Before:
CREATE TABLE IF NOT EXISTS tactical_state (
  scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
  map_url TEXT,
  map_width INTEGER,
  map_height INTEGER,
  grid TEXT NOT NULL DEFAULT '{}',
  round_number INTEGER NOT NULL DEFAULT 0,
  current_turn_token_id TEXT
);

// After:
CREATE TABLE IF NOT EXISTS tactical_state (
  scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
  map_url TEXT,
  map_width INTEGER,
  map_height INTEGER,
  grid TEXT NOT NULL DEFAULT '{}',
  round_number INTEGER NOT NULL DEFAULT 0,
  current_turn_token_id TEXT,
  tactical_mode INTEGER NOT NULL DEFAULT 0,
  active_archive_id TEXT
);
```

- [ ] **Step 4: Remove migration area**

Delete the migration try/catch blocks at lines 178-184 of `server/schema.ts`:

```typescript
// Delete these lines entirely:
// Migrations for existing DBs (SQLite doesn't support IF NOT EXISTS in ALTER TABLE)
try {
  db.exec(`ALTER TABLE room_state ADD COLUMN rule_system_id TEXT NOT NULL DEFAULT 'generic'`)
} catch {
  /* column already exists */
}
try {
  db.exec(`ALTER TABLE room_state ADD COLUMN plugin_config TEXT NOT NULL DEFAULT '{}'`)
} catch {
  /* column already exists */
}
```

- [ ] **Step 5: Commit**

```bash
git add server/schema.ts
git commit -m "refactor: move field ownership in schema definitions

rule_system_id → rooms table, tactical_mode + active_archive_id → tactical_state"
```

---

### Task 2: Server — `rooms.ts` (rule_system_id ownership + GET /rooms/:id)

**Files:**

- Modify: `server/routes/rooms.ts:11-38`

- [ ] **Step 1: Update POST /api/rooms — write rule_system_id to rooms table**

In `server/routes/rooms.ts`, change lines 29-37:

```typescript
// Before:
db.prepare('INSERT INTO rooms (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run(
  id,
  name,
  'anonymous',
  now,
)
// Initialize room database (triggers schema creation), then stamp rule system
const roomDb = getRoomDb(dataDir, id)
roomDb.prepare('UPDATE room_state SET rule_system_id = ? WHERE id = 1').run(ruleSystemId)

// After:
db.prepare(
  'INSERT INTO rooms (id, name, created_by, created_at, rule_system_id) VALUES (?, ?, ?, ?, ?)',
).run(id, name, 'anonymous', now, ruleSystemId)
// Initialize room database (triggers schema creation)
getRoomDb(dataDir, id)
```

Also update the POST response (line 38) to include `ruleSystemId`:

```typescript
// Before:
res.status(201).json({ id, name, createdBy: 'anonymous', createdAt: now })

// After:
res.status(201).json({ id, name, createdBy: 'anonymous', createdAt: now, ruleSystemId })
```

- [ ] **Step 2: Add GET /api/rooms/:id endpoint**

Add after the existing `GET /api/rooms` route (after line 17):

```typescript
router.get('/api/rooms/:roomId', (req, res) => {
  const db = getGlobalDb(dataDir)
  const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.roomId) as
    | Record<string, unknown>
    | undefined
  if (!row) {
    res.status(404).json({ error: 'Room not found' })
    return
  }
  res.json(toCamelAll([row])[0])
})
```

Note: `toCamelAll` returns an array, so we use `[0]` to unwrap.

- [ ] **Step 3: Commit**

```bash
git add server/routes/rooms.ts
git commit -m "feat: move rule_system_id to rooms table, add GET /rooms/:id"
```

---

### Task 3: Server — `tactical.ts` (export helper, update enter/exit, add PATCH field)

**Files:**

- Modify: `server/routes/tactical.ts:28,92-98,132-146`

- [ ] **Step 1: Export `getTacticalState` helper**

In `server/routes/tactical.ts`, change line 28:

```typescript
// Before:
function getTacticalState(db: Database.Database, sceneId: string) {

// After:
export function getTacticalState(db: Database.Database, sceneId: string) {
```

- [ ] **Step 2: Update POST /tactical/enter — write to tactical_state, broadcast tactical:updated**

In `server/routes/tactical.ts`, replace lines 132-138:

```typescript
// Before:
router.post('/api/rooms/:roomId/tactical/enter', room, (req, res) => {
  req.roomDb!.prepare('UPDATE room_state SET tactical_mode = 1 WHERE id = 1').run()
  const state = getRoomState(req.roomDb!)
  io.to(req.roomId!).emit('room:state:updated', state)
  res.json(state)
})

// After:
router.post('/api/rooms/:roomId/tactical/enter', room, (req, res) => {
  const sceneId = getActiveSceneId(req.roomDb!)
  if (!sceneId) {
    res.status(404).json({ error: 'No active scene' })
    return
  }
  req.roomDb!.prepare('UPDATE tactical_state SET tactical_mode = 1 WHERE scene_id = ?').run(sceneId)
  const state = getTacticalState(req.roomDb!, sceneId)
  io.to(req.roomId!).emit('tactical:updated', state)
  res.json(state)
})
```

- [ ] **Step 3: Update POST /tactical/exit — same pattern**

Replace lines 140-146:

```typescript
// Before:
router.post('/api/rooms/:roomId/tactical/exit', room, (req, res) => {
  req.roomDb!.prepare('UPDATE room_state SET tactical_mode = 0 WHERE id = 1').run()
  const state = getRoomState(req.roomDb!)
  io.to(req.roomId!).emit('room:state:updated', state)
  res.json(state)
})

// After:
router.post('/api/rooms/:roomId/tactical/exit', room, (req, res) => {
  const sceneId = getActiveSceneId(req.roomDb!)
  if (!sceneId) {
    res.status(404).json({ error: 'No active scene' })
    return
  }
  req.roomDb!.prepare('UPDATE tactical_state SET tactical_mode = 0 WHERE scene_id = ?').run(sceneId)
  const state = getTacticalState(req.roomDb!, sceneId)
  io.to(req.roomId!).emit('tactical:updated', state)
  res.json(state)
})
```

- [ ] **Step 4: Add `tacticalMode` to PATCH /tactical fieldMap**

In `server/routes/tactical.ts`, add to the `simpleFields` object (lines 92-98):

```typescript
// Before:
const simpleFields: Record<string, string> = {
  mapUrl: 'map_url',
  mapWidth: 'map_width',
  mapHeight: 'map_height',
  roundNumber: 'round_number',
  currentTurnTokenId: 'current_turn_token_id',
}

// After:
const simpleFields: Record<string, string> = {
  mapUrl: 'map_url',
  mapWidth: 'map_width',
  mapHeight: 'map_height',
  roundNumber: 'round_number',
  currentTurnTokenId: 'current_turn_token_id',
  tacticalMode: 'tactical_mode',
}
```

- [ ] **Step 5: Remove unused `getRoomState` helper**

The `getRoomState()` function (lines 53-56) is no longer called by enter/exit. Check if it's used elsewhere. If not (it shouldn't be), delete it:

```typescript
// Delete lines 53-56:
function getRoomState(db: Database.Database) {
  const row = db.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<string, unknown>
  return toCamel(row)
}
```

- [ ] **Step 6: Commit**

```bash
git add server/routes/tactical.ts
git commit -m "refactor: tactical enter/exit write to tactical_state, export getTacticalState"
```

---

### Task 4: Server — `state.ts` (simplify + broadcast tactical:updated on scene switch)

**Files:**

- Modify: `server/routes/state.ts` (full file, 50 lines)

Note: The `GET /state` handler (lines 11-17) uses `SELECT * FROM room_state` — after the schema change removes the 3 columns from `room_state`, the response automatically stops including them. No code change needed for GET.

- [ ] **Step 1: Simplify fieldMap — remove 3 migrated fields**

In `server/routes/state.ts`, change lines 24-30:

```typescript
// Before:
const fieldMap: Record<string, string> = {
  activeSceneId: 'active_scene_id',
  activeArchiveId: 'active_archive_id',
  tacticalMode: 'tactical_mode',
  ruleSystemId: 'rule_system_id',
  // pluginConfig intentionally NOT added here — DB column exists but no RoomState field yet
}

// After:
const fieldMap: Record<string, string> = {
  activeSceneId: 'active_scene_id',
}
```

- [ ] **Step 2: Add tactical:updated broadcast on scene switch**

Add import for `getTacticalState` at top of file:

```typescript
import { getTacticalState } from './tactical'
```

After the `room:state:updated` emit (after line 44), add tactical:updated broadcast when `activeSceneId` changes:

```typescript
io.to(req.roomId!).emit('room:state:updated', updated)

// When scene changes, broadcast the new scene's tactical state
if (body.activeSceneId) {
  const tactical = getTacticalState(req.roomDb!, body.activeSceneId as string)
  if (tactical) {
    io.to(req.roomId!).emit('tactical:updated', tactical)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/state.ts
git commit -m "refactor: simplify state.ts fieldMap, broadcast tactical:updated on scene switch"
```

---

### Task 5: Server — `archives.ts` (update DELETE + POST load)

**Files:**

- Modify: `server/routes/archives.ts:100-105,375,392-424`

- [ ] **Step 1: Update DELETE — clear active_archive_id from tactical_state**

In `server/routes/archives.ts`, change lines 100-105 inside the `deleteArchive` transaction:

```typescript
// Before:
// Clear dangling room_state reference
req
  .roomDb!.prepare(
    'UPDATE room_state SET active_archive_id = NULL WHERE id = 1 AND active_archive_id = ?',
  )
  .run(req.params.archiveId)

// After:
// Clear dangling tactical_state reference (all scenes that reference this archive)
// NOTE: Spec says `WHERE scene_id = ? AND active_archive_id = ?` (single scene).
// Plan intentionally broadens to all scenes — an archive ID is globally unique,
// so clearing all references is safer and avoids needing to resolve scene_id here.
req
  .roomDb!.prepare('UPDATE tactical_state SET active_archive_id = NULL WHERE active_archive_id = ?')
  .run(req.params.archiveId)
```

- [ ] **Step 2: Update POST /load — write to tactical_state, use getTacticalState**

Add import at top of file:

```typescript
import { getTacticalState } from './tactical'
```

In the `doLoad` transaction, change line 375:

```typescript
// Before:
// e. Update room_state active_archive_id
db.prepare('UPDATE room_state SET active_archive_id = ? WHERE id = 1').run(archiveId)

// After:
// e. Update tactical_state active_archive_id
db.prepare('UPDATE tactical_state SET active_archive_id = ? WHERE scene_id = ?').run(
  archiveId,
  sceneId,
)
```

- [ ] **Step 3: Replace manual tactical response build + change broadcast**

Replace lines 392-424 (from the `room:state:updated` emit through the `res.json`):

```typescript
// Before (lines 392-424):
    // 7. Emit room:state:updated so clients see activeArchiveId change
    const roomStateRow = db.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<...>
    io.to(req.roomId!).emit('room:state:updated', toCamel(roomStateRow))
    // Build and return the current tactical state
    const stateRow = db.prepare('SELECT * FROM tactical_state WHERE scene_id = ?')...
    // ... 20+ lines of manual assembly ...

// After:
    // 7. Emit tactical:updated (replaces room:state:updated — activeArchiveId is now per-scene)
    const result = getTacticalState(db, sceneId!)
    io.to(req.roomId!).emit('tactical:updated', result)
    res.json(result)
```

Also remove the now-unused `toCamel` import if it's only used for the deleted `roomStateRow` line. Check other usages first — `toArchive` uses `toCamel` so it stays.

Note: the old code emitted `tactical:activated` from the load route (line 423). The new code emits `tactical:updated` instead. This is intentional — `tactical:activated` is now redundant since `tactical:updated` carries the same payload (including `tacticalMode`). The frontend `tactical:activated` handler does the same thing as `tactical:updated` (both call `normalizeTacticalInfo`), so this is safe. Task 7 Step 4 will also remove `tactical:activated` from WS_EVENTS for cleanup.

- [ ] **Step 4: Commit**

```bash
git add server/routes/archives.ts
git commit -m "refactor: archives write active_archive_id to tactical_state, reuse getTacticalState"
```

---

### Task 6: Update Server Tests

**Files:**

- Modify: `server/__tests__/scenarios/tactical-mode.test.ts:43-55`
- Modify: `server/__tests__/scenarios/tactical-broadcast.test.ts:155-191`
- Modify: `server/__tests__/scenarios/multi-client-sync.test.ts:93-131`
- Modify: `server/__tests__/scenarios/rule-system-switch.test.ts`
- Modify: `server/__tests__/scenarios/archive-broadcast.test.ts`
- Modify: `server/__tests__/scenarios/archive-error-cases.test.ts`

- [ ] **Step 1: tactical-mode.test.ts — verify via GET /tactical instead of GET /state**

Change lines 43-45 and 53-55:

```typescript
// Before (line 43-45):
// Verify via GET /state
const { data: state } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
expect((state as { tacticalMode: number }).tacticalMode).toBe(1)

// After:
// Verify via GET /tactical
const { data: tactical } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
expect((tactical as { tacticalMode: number }).tacticalMode).toBe(1)
```

Same for the exit test (lines 53-55), expect `tacticalMode` to be `0`.

Also update the enter/exit response assertions — they now return tactical state (with `tacticalMode`), not room state:

```typescript
// The response from POST /tactical/enter now returns tactical state format
expect((data as { tacticalMode: number }).tacticalMode).toBe(1) // still works, same field name
```

- [ ] **Step 2: tactical-broadcast.test.ts — change event from room:state:updated to tactical:updated**

Change lines 155-172 (enter test) and 174-191 (exit test):

```typescript
// Before (line 161-163):
const eventPromise = waitForSocketEvent<{ tacticalMode: number }>(socket2, 'room:state:updated')

// After:
const eventPromise = waitForSocketEvent<{ tacticalMode: number }>(socket2, 'tactical:updated')
```

Same for the exit test block.

- [ ] **Step 3: multi-client-sync.test.ts — change event for enter/exit tests**

Change test 5.5 (lines 93-102) and test 5.7 (lines 124-130):

```typescript
// Before (line 97):
const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'room:state:updated')

// After:
const eventPromise = waitForSocketEvent<Record<string, unknown>>(clientB, 'tactical:updated')
```

- [ ] **Step 4: rule-system-switch.test.ts — rewrite all 4 tests**

This file has 4 tests, all of which use `GET /state` or `PATCH /state` for `ruleSystemId`. After migration, `ruleSystemId` is immutable (set at room creation) and lives in `rooms` table. Rewrite the entire file:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

describe('rule system', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await setupTestRoom('rule-system-test')
  })
  afterAll(() => ctx.cleanup())

  it('defaults to generic on room creation', async () => {
    const { data: rooms } = await ctx.api('GET', '/api/rooms')
    const room = (rooms as Array<{ id: string; ruleSystemId: string }>).find(
      (r) => r.id === ctx.roomId,
    )
    expect(room?.ruleSystemId).toBe('generic')
  })

  it('room created with custom ruleSystemId', async () => {
    const { status, data } = await ctx.api('POST', '/api/rooms', {
      name: 'DH Room',
      ruleSystemId: 'daggerheart',
    })
    expect(status).toBe(201)
    const created = data as { id: string; ruleSystemId: string }
    expect(created.ruleSystemId).toBe('daggerheart')

    // Verify persisted in rooms table
    const { data: rooms } = await ctx.api('GET', '/api/rooms')
    const found = (rooms as Array<{ id: string; ruleSystemId: string }>).find(
      (r) => r.id === created.id,
    )
    expect(found?.ruleSystemId).toBe('daggerheart')
  })

  it('GET /rooms/:id returns ruleSystemId', async () => {
    const { status, data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}`)
    expect(status).toBe(200)
    expect((data as { ruleSystemId: string }).ruleSystemId).toBe('generic')
  })
})
```

This replaces the old tests (PATCH ruleSystemId, persist after PATCH, switch back to generic) which are no longer valid since ruleSystemId is immutable.

- [ ] **Step 5: archive-broadcast.test.ts — update TWO tests for archive load**

Test 1 (line 119): "POST /archives/:id/load broadcasts tactical:activated" — the load route now emits `tactical:updated` instead of `tactical:activated`:

```typescript
// Before (line 131):
const eventPromise = waitForSocketEvent<{ tokens: unknown[] }>(socket2, 'tactical:activated')

// After:
const eventPromise = waitForSocketEvent<{ tokens: unknown[] }>(socket2, 'tactical:updated')
```

Test 2 (line 142): "POST /archives/:id/load broadcasts room:state:updated with activeArchiveId" — now listen for `tactical:updated` and check `activeArchiveId`:

```typescript
// Before (lines 154-156):
const eventPromise = waitForSocketEvent<{ activeArchiveId: string }>(socket2, 'room:state:updated')

// After:
const eventPromise = waitForSocketEvent<{ activeArchiveId: string }>(socket2, 'tactical:updated')
```

- [ ] **Step 6: archive-error-cases.test.ts — update BOTH verification points**

The test at lines 141-168 verifies `activeArchiveId` via `GET /state` twice (before and after delete). Both must change to `GET /tactical`:

```typescript
// Before (line 158):
const { data: stateBefore } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
expect((stateBefore as { activeArchiveId: string | null }).activeArchiveId).toBe(archiveId)

// After:
const { data: tacticalBefore } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
expect((tacticalBefore as { activeArchiveId: string | null }).activeArchiveId).toBe(archiveId)

// Before (line 165):
const { data: stateAfter } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/state`)
expect((stateAfter as { activeArchiveId: string | null }).activeArchiveId).toBeNull()

// After:
const { data: tacticalAfter } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
expect((tacticalAfter as { activeArchiveId: string | null }).activeArchiveId).toBeNull()
```

- [ ] **Step 7: Run all server tests**

```bash
npx vitest run server/__tests__ --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add server/__tests__/
git commit -m "test: update server tests for schema field ownership changes"
```

---

## Chunk 2: Frontend + Frontend Tests + Regression Tests

### Task 7: Frontend — worldStore.ts (types, loadAll, socket handlers)

**Files:**

- Modify: `src/stores/worldStore.ts:25-30,32-48,234-280,354-362,478-510,516,567-572`

- [ ] **Step 1: Update `RoomState` interface — remove 2 fields**

Change lines 25-30:

```typescript
// Before:
export interface RoomState {
  activeSceneId: string | null
  activeArchiveId: string | null
  tacticalMode: number
  ruleSystemId: string
}

// After:
export interface RoomState {
  activeSceneId: string | null
  ruleSystemId: string
}
```

- [ ] **Step 2: Update `TacticalInfo` interface — add 2 fields**

Change lines 32-48:

```typescript
// Before:
export interface TacticalInfo {
  sceneId: string
  mapUrl: string | null
  mapWidth: number | null
  mapHeight: number | null
  grid: { ... }
  tokens: MapToken[]
  roundNumber: number
  currentTurnTokenId: string | null
}

// After:
export interface TacticalInfo {
  sceneId: string
  mapUrl: string | null
  mapWidth: number | null
  mapHeight: number | null
  grid: { ... }
  tokens: MapToken[]
  roundNumber: number
  currentTurnTokenId: string | null
  tacticalMode: number
  activeArchiveId: string | null
}
```

- [ ] **Step 3: Update `loadAll()` — add GET /rooms/:id for ruleSystemId**

In the `loadAll` function (line 234-280), add `GET /rooms/:id` to the `Promise.all`:

```typescript
// Before (lines 235-243):
const [scenes, entitiesArr, chat, trackers, state, assets, showcase] = await Promise.all([
  api.get<Scene[]>(`/api/rooms/${roomId}/scenes`),
  api.get<Entity[]>(`/api/rooms/${roomId}/entities`),
  api.get<ChatMessage[]>(`/api/rooms/${roomId}/chat?limit=200`),
  api.get<TeamTracker[]>(`/api/rooms/${roomId}/team-trackers`),
  api.get<RoomState>(`/api/rooms/${roomId}/state`),
  api.get<AssetRecord[]>(`/api/rooms/${roomId}/assets`),
  api.get<ShowcaseItem[]>(`/api/rooms/${roomId}/showcase`),
])

// After:
const [scenes, entitiesArr, chat, trackers, state, assets, showcase, roomInfo] = await Promise.all([
  api.get<Scene[]>(`/api/rooms/${roomId}/scenes`),
  api.get<Entity[]>(`/api/rooms/${roomId}/entities`),
  api.get<ChatMessage[]>(`/api/rooms/${roomId}/chat?limit=200`),
  api.get<TeamTracker[]>(`/api/rooms/${roomId}/team-trackers`),
  api.get<{ activeSceneId: string | null }>(`/api/rooms/${roomId}/state`),
  api.get<AssetRecord[]>(`/api/rooms/${roomId}/assets`),
  api.get<ShowcaseItem[]>(`/api/rooms/${roomId}/showcase`),
  api.get<{ ruleSystemId: string }>(`/api/rooms/${roomId}`),
])
```

Then update the return (line 275):

```typescript
// Before:
    room: state,

// After:
    room: { ...state, ruleSystemId: roomInfo.ruleSystemId },
```

- [ ] **Step 4: Remove `tactical:ended` handler + consolidate `tactical:activated` into `tactical:updated`**

Delete `tactical:ended` handler (lines 360-362):

```typescript
// Delete:
socket.on('tactical:ended', () => {
  set(() => ({ tacticalInfo: null }))
})
```

Delete `tactical:activated` handler (lines 354-356) — it's now redundant since all server routes emit `tactical:updated` instead:

```typescript
// Delete:
socket.on('tactical:activated', (tacticalState: TacticalInfo) => {
  set(() => ({ tacticalInfo: normalizeTacticalInfo(tacticalState) }))
})
```

The remaining `tactical:updated` handler (lines 357-358) handles all tactical state changes.

Update `WS_EVENTS` array — remove both `'tactical:ended'` (line 490) and `'tactical:activated'` (line 488):

```typescript
// Remove these two lines:
  'tactical:activated',
  'tactical:ended',
```

- [ ] **Step 5: Update initial state — remove fields from room**

Change line 516:

```typescript
// Before:
  room: { activeSceneId: null, activeArchiveId: null, tacticalMode: 0, ruleSystemId: 'generic' },

// After:
  room: { activeSceneId: null, ruleSystemId: 'generic' },
```

- [ ] **Step 6: Update or remove `setRuleSystem` action**

Change lines 567-572. Since `ruleSystemId` is now in the `rooms` table (global DB), and it's immutable after creation, this action should be removed:

```typescript
// Delete setRuleSystem entirely (lines 567-572):
  setRuleSystem: async (id) => {
    const roomId = get()._roomId
    if (!roomId) return
    await api.patch(`/api/rooms/${roomId}/state`, { ruleSystemId: id })
    // No local update needed — 'room:state:updated' socket event handles it
  },
```

Also remove `setRuleSystem` from the `WorldState` interface definition (search for the type declaration).

- [ ] **Step 7: Update `_reset` method — match new RoomState shape**

Change `_reset` at lines 982-989:

```typescript
// Before:
      room: {
        activeSceneId: null,
        activeArchiveId: null,
        tacticalMode: 0,
        ruleSystemId: 'generic',
      },

// After:
      room: {
        activeSceneId: null,
        ruleSystemId: 'generic',
      },
```

Note: `normalizeTacticalInfo` (lines 222-230) uses object spread on the raw payload, so the new `tacticalMode` and `activeArchiveId` fields are passed through automatically — no code change needed there.

- [ ] **Step 8: Commit**

```bash
git add src/stores/worldStore.ts
git commit -m "refactor: update worldStore types, loadAll, remove tactical:ended handler"
```

---

### Task 8: Frontend — selectors.ts + components

**Files:**

- Modify: `src/stores/selectors.ts:27-29`
- Modify: `src/gm/ArchivePanel.tsx:10,12`
- Modify: `src/combat/KonvaMap.tsx:214,270`
- Modify: `src/layout/PortraitBar.tsx:606`
- Modify: `src/combat/hooks/useCameraControls.ts:62,82`

- [ ] **Step 1: Update `selectIsTactical` selector**

In `src/stores/selectors.ts`, change lines 27-29:

```typescript
// Before:
export const selectIsTactical = (s: { room: RoomState }): boolean => {
  return s.room.tacticalMode === 1
}

// After:
export const selectIsTactical = (s: { tacticalInfo: TacticalInfo | null }): boolean => {
  return s.tacticalInfo?.tacticalMode === 1
}
```

Update the import at top of file — add `TacticalInfo` if not already imported.

- [ ] **Step 2: Update `ArchivePanel.tsx` — read from tacticalInfo**

Change lines 10 and 12:

```typescript
// Before:
  const activeArchiveId = useWorldStore((s) => s.room.activeArchiveId)
  ...
  const isTactical = useWorldStore((s) => s.tacticalInfo !== null)

// After:
  const activeArchiveId = useWorldStore((s) => s.tacticalInfo?.activeArchiveId ?? null)
  ...
  const isTactical = useWorldStore(selectIsTactical)
```

Add import for `selectIsTactical`:

```typescript
import { selectIsTactical } from '../stores/selectors'
```

- [ ] **Step 3: Update `KonvaMap.tsx` — fix tacticalInfo null checks**

Line 214 — `handleCreateToken`:

```typescript
// Before:
if (!tacticalInfo) return

// After:
if (!tacticalInfo?.mapUrl) return
```

Line 270 — empty state display:

```typescript
// Before:
    if (!tacticalInfo) {

// After:
    if (!tacticalInfo?.mapUrl) {
```

- [ ] **Step 4: Update `PortraitBar.tsx:606` — check tacticalMode instead of null**

```typescript
// Before:
{
  tacticalInfo ? `Round ${tacticalInfo.roundNumber}` : 'No tactical session active'
}

// After:
{
  tacticalInfo?.tacticalMode === 1
    ? `Round ${tacticalInfo.roundNumber}`
    : 'No tactical session active'
}
```

- [ ] **Step 5: Update `useCameraControls.ts` — remove dead null checks**

Line 62:

```typescript
// Before:
if (!tacticalInfo || containerSize.width === 0 || containerSize.height === 0) return

// After:
if (containerSize.width === 0 || containerSize.height === 0) return
```

Line 82:

```typescript
// Before:
if (!tacticalInfo) return

// After (remove entire guard — tacticalInfo is always non-null):
// (delete this line)
```

- [ ] **Step 6: Commit**

```bash
git add src/stores/selectors.ts src/gm/ArchivePanel.tsx src/combat/KonvaMap.tsx src/layout/PortraitBar.tsx src/combat/hooks/useCameraControls.ts
git commit -m "refactor: update frontend selectors and components for new field locations"
```

---

### Task 9: Frontend Tests

**Files:**

- Modify: `src/stores/__tests__/worldStore.test.ts`
- Modify: `src/stores/__tests__/selectors.test.ts`

- [ ] **Step 1: Update worldStore.test.ts — mock responses + RoomState shape**

Key changes needed:

1. **Add mock for `GET /rooms/:id`** in `setupInitMockResponses` — add `{ ruleSystemId: 'generic' }` response for the new endpoint (`/api/rooms/${ROOM_ID}`)
2. **Remove `activeArchiveId`, `tacticalMode` from all RoomState mock objects** — includes `setupInitMockResponses` state response (~line 198), `beforeEach` setState (~line 170), and any inline RoomState construction
3. **Add `tacticalMode: 0` and `activeArchiveId: null` to all TacticalInfo mock objects**
4. **Remove `tactical:ended` event test (line 377-383)** — replace with `tactical:updated` carrying `tacticalMode: 0`:
   - Line 377: rename test `'tactical:ended clears tacticalInfo'` → `'tactical:updated with tacticalMode=0 clears tactical mode'`
   - Line 382: `socket._trigger('tactical:ended')` → `socket._trigger('tactical:updated', makeTacticalInfo({ tacticalMode: 0 }))`
   - Assertion: instead of `tacticalInfo` being `null`, check `tacticalInfo.tacticalMode === 0`
5. **Replace ALL `tactical:activated` references** — there are ~13 occurrences, not just one test:
   - **Line 260**: `expect(registeredEvents).toContain('tactical:activated')` → remove this assertion
   - **Line 281**: `expect(removedEvents).toContain('tactical:activated')` → remove this assertion
   - **Lines 369-375**: rename test `'tactical:activated sets tacticalInfo'` → `'tactical:updated sets tacticalInfo'`, change `socket._trigger('tactical:activated', ...)` → `socket._trigger('tactical:updated', ...)`
   - **Line 379**: `socket._trigger('tactical:activated', ...)` (setup in `tactical:ended` test) → `socket._trigger('tactical:updated', ...)`
   - **Line 388**: `socket._trigger('tactical:activated', ...)` (setup in `tactical:updated` test) → `socket._trigger('tactical:updated', ...)`
   - **Lines 406, 421**: `'tactical:activated'` event name strings → `'tactical:updated'`
   - **Line 526**: `socket._trigger('tactical:activated', ...)` (setup in map update test) → `socket._trigger('tactical:updated', ...)`
   - **Line 543**: `'tactical:activated'` event name → `'tactical:updated'`
     **Quick approach**: global find-replace `'tactical:activated'` → `'tactical:updated'` within the file, then remove the two `toContain('tactical:activated')` assertions (lines 260, 281) since the event no longer exists.
6. **Update `room:state:updated` tests**:
   - **Lines 477-483**: the handler test asserts `expect(room.activeArchiveId).toBeNull()` — remove this assertion since `activeArchiveId` is no longer in `RoomState`
   - **Lines 621-638**: the "preserves fields not in payload" test checks `activeArchiveId` preservation — rewrite to test that only `activeSceneId` and `ruleSystemId` survive partial update

- [ ] **Step 2: Update selectors.test.ts — all RoomState instances**

There are ~6 locations in `selectors.test.ts` where `RoomState` mock objects include `activeArchiveId` and `tacticalMode`. ALL must be updated to the new shape `{ activeSceneId, ruleSystemId }`.

Update `selectIsTactical` tests to read from `tacticalInfo.tacticalMode`:

```typescript
// Before:
expect(selectIsTactical({ room: { tacticalMode: 1, ... } })).toBe(true)

// After:
expect(selectIsTactical({ tacticalInfo: { tacticalMode: 1 } as TacticalInfo })).toBe(true)
expect(selectIsTactical({ tacticalInfo: null })).toBe(false)
```

- [ ] **Step 3: Run all frontend tests**

```bash
npx vitest run src/stores/__tests__ --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/stores/__tests__/
git commit -m "test: update frontend tests for schema field ownership changes"
```

---

### Task 10: New Regression Tests

**Files:**

- Create: `server/__tests__/scenarios/schema-field-ownership.test.ts`

- [ ] **Step 1: Write regression test file**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('schema-field-ownership')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Schema Field Ownership', () => {
  let sceneA: string
  let sceneB: string

  it('setup: create two scenes', async () => {
    const { data: a } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene A',
      atmosphere: {},
    })
    sceneA = (a as { id: string }).id
    const { data: b } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene B',
      atmosphere: {},
    })
    sceneB = (b as { id: string }).id
  })

  it('scene switch preserves per-scene tacticalMode', async () => {
    // Activate scene A, enter tactical
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneA })
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)

    // Switch to scene B — should have tacticalMode=0
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneB })
    const { data: tacticalB } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tacticalB as { tacticalMode: number }).tacticalMode).toBe(0)

    // Switch back to A — should still be tacticalMode=1
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneA })
    const { data: tacticalA } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tacticalA as { tacticalMode: number }).tacticalMode).toBe(1)
  })

  it('scene switch preserves per-scene activeArchiveId', async () => {
    // Create archive on scene A, load it
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneA })
    const { data: archive } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneA}/archives`,
      { name: 'Archive 1' },
    )
    const archiveId = (archive as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/archives/${archiveId}/load`)

    // Verify A has the archive active
    const { data: tA1 } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tA1 as { activeArchiveId: string | null }).activeArchiveId).toBe(archiveId)

    // Switch to B — should have null activeArchiveId
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneB })
    const { data: tB } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tB as { activeArchiveId: string | null }).activeArchiveId).toBeNull()

    // Switch back to A — should still have the archive
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneA })
    const { data: tA2 } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tA2 as { activeArchiveId: string | null }).activeArchiveId).toBe(archiveId)
  })

  it('new scene gets default tactical_state with tacticalMode=0', async () => {
    const { data: newScene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene C',
      atmosphere: {},
    })
    const sceneC = (newScene as { id: string }).id
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/state`, { activeSceneId: sceneC })
    const { data: tactical } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tactical`)
    expect((tactical as { tacticalMode: number }).tacticalMode).toBe(0)
    expect((tactical as { activeArchiveId: string | null }).activeArchiveId).toBeNull()
  })

  it('rule_system_id in rooms table', async () => {
    const { data: rooms } = await ctx.api('GET', '/api/rooms')
    const room = (rooms as Array<{ id: string; ruleSystemId: string }>).find(
      (r) => r.id === ctx.roomId,
    )
    expect(room?.ruleSystemId).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the new test**

```bash
npx vitest run server/__tests__/scenarios/schema-field-ownership.test.ts --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests pass (server + frontend).

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/scenarios/schema-field-ownership.test.ts
git commit -m "test: add regression tests for per-scene tactical state and rule_system_id"
```

---

### Task 11: Type-check + Lint

- [ ] **Step 1: Run TypeScript type-check**

```bash
npx tsc --noEmit
```

Expected: No errors. If there are errors, fix them — likely `setRuleSystem` references in the `WorldState` interface or components importing removed fields.

- [ ] **Step 2: Run ESLint**

```bash
npx eslint . --ext .ts,.tsx
```

Expected: No errors.

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -A
git commit -m "chore: fix type-check and lint issues from schema migration"
```

---

### Task 12: Final Verification + PR

- [ ] **Step 1: Run full test suite one final time**

```bash
npm test
```

- [ ] **Step 2: Create PR**

Branch name: `refactor/schema-field-ownership`

PR title: "refactor: move field ownership from room_state to correct tables"

PR body should reference the spec: `docs/design/12-Schema字段归属迁移设计.md`
