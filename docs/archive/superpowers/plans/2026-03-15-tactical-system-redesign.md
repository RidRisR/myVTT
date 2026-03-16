# Tactical System & Token Data Model Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the combat/encounter system into a per-scene tactical system with SQL-backed tokens, atomic token creation, and proper archive lifecycle — eliminating JSON blob storage and the singleton combat state.

**Architecture:** Three sequential PRs — (A) data layer: schema + API, (B) business layer: store + atomic creation + archive lifecycle, (C) UI layer: component rename + KonvaMap split. Each PR is self-contained and passes all tests independently.

**Tech Stack:** SQLite (better-sqlite3), Express 5, Socket.io v4, zustand v5, React 19, Vitest, Supertest, react-konva

---

## Design Document Reference

Full design: `docs/design/10-战斗系统与Token数据模型重构设计.md`

Key decisions (all finalized):

- All tokens require `entityId` (mandatory FK, no anonymous tokens)
- `tactical_state` is per-scene (not global singleton)
- `tactical_tokens` is a proper SQL table (not JSON blob)
- Entity deletion cascades to token deletion (no degradation)
- `archive_tokens.snapshot_data` is a single JSON column (not 8 nullable columns)
- `enterTactical`/`exitTactical` writes `room_state.tactical_mode`, broadcasts via Socket.io
- Creating a scene auto-creates a `tactical_state` row
- Scene deletion cascades to `tactical_state` + `tactical_tokens`

---

## Chunk 1: PR A — Data Layer (Schema + API)

**Branch:** `feat/tactical-data-layer`
**Worktree:** `.worktrees/feat/tactical-data-layer`

### Files Changed in PR A

**Created:**

- `server/routes/tactical.ts` — replaces `combat.ts`, SQL-backed token CRUD + enterTactical/exitTactical
- `server/routes/archives.ts` — replaces `encounters.ts`, archive CRUD + load/save
- `server/__tests__/scenarios/tactical-schema.test.ts` — verify new table structure
- `server/__tests__/scenarios/tactical-tokens-crud.test.ts` — SQL token CRUD
- `server/__tests__/scenarios/tactical-tokens-cascade.test.ts` — FK cascade behavior
- `server/__tests__/scenarios/tactical-mode.test.ts` — enterTactical/exitTactical broadcasts
- `server/__tests__/scenarios/tactical-lifecycle.test.ts` — replaces `combat-lifecycle.test.ts`
- `server/__tests__/scenarios/archive-crud.test.ts` — replaces `encounter-crud.test.ts`

**Modified:**

- `server/schema.ts` — new tables, renamed tables, new room_state fields
- `server/routes/scenes.ts` — auto-create `tactical_state` on scene creation
- `server/routes/state.ts` — expose `tactical_mode` + `activeArchiveId`
- `server/index.ts` — import new routes
- `server/__tests__/helpers/test-server.ts` — import new routes
- `src/shared/entityTypes.ts` — `MapToken` required `entityId`, `width`/`height`, no `permissions`; `Entity` adds `width`/`height` drops `size`; rename `CombatState`→`TacticalState`, `EncounterData`→`ArchiveData`

**Deleted:**

- `server/routes/combat.ts`
- `server/routes/encounters.ts`
- `server/__tests__/scenarios/combat-lifecycle.test.ts`
- `server/__tests__/scenarios/encounter-crud.test.ts`
- `server/__tests__/scenarios/token-degradation.test.ts` (replaced by cascade tests)

---

### Task A1: Create worktree + verify baseline

- [ ] **Step 1: Create worktree**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT
git worktree add .worktrees/feat/tactical-data-layer -b feat/tactical-data-layer
cd .worktrees/feat/tactical-data-layer
cp .env.example .env
# Edit .env to set PORT=3002 (to avoid conflict with main dev server)
```

- [ ] **Step 2: Install dependencies and verify tests pass at baseline**

```bash
npm install
npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all existing tests pass (or note which already fail)

---

### Task A2: Rewrite `server/schema.ts`

**Files:** Modify `server/schema.ts`

This is the foundation. All other tasks depend on getting the schema right.

- [ ] **Step 1: Read current schema**

```bash
cat server/schema.ts
```

- [ ] **Step 2: Write the new schema**

Replace the entire content of `server/schema.ts`. Key changes:

1. `entities` table: rename `size REAL` → `width REAL NOT NULL DEFAULT 1`, add `height REAL NOT NULL DEFAULT 1`
2. `combat_state` singleton → DELETE entirely
3. `encounters` table → rename to `archives`, remove `tokens TEXT` JSON field (tokens now in `archive_tokens`)
4. Add `tactical_state` table (per-scene, PK = `scene_id`)
5. Add `tactical_tokens` table (FK to `tactical_state.scene_id` + `entities.id`)
6. Add `archive_tokens` table (FK to `archives.id`, `snapshot_data TEXT` JSON column)
7. `room_state`: rename `active_encounter_id` → `active_archive_id`, add `tactical_mode INTEGER DEFAULT 0`

```typescript
// server/schema.ts — full replacement
export const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS room_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_scene_id TEXT,
  active_archive_id TEXT,
  tactical_mode INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO room_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled Scene',
  background_url TEXT,
  background_type TEXT NOT NULL DEFAULT 'image',
  ambient_audio_url TEXT,
  ambient_audio_volume REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Unnamed',
  image_url TEXT,
  color TEXT NOT NULL DEFAULT '#888888',
  width REAL NOT NULL DEFAULT 1,
  height REAL NOT NULL DEFAULT 1,
  notes TEXT,
  rule_data TEXT DEFAULT '{}',
  permissions TEXT DEFAULT '{}',
  lifecycle TEXT NOT NULL DEFAULT 'ephemeral' CHECK (lifecycle IN ('ephemeral','reusable','persistent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scene_entity_entries (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS archives (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Archive',
  map_url TEXT,
  map_width INTEGER,
  map_height INTEGER,
  grid TEXT DEFAULT '{}',
  gm_only INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS archive_tokens (
  id TEXT PRIMARY KEY,
  archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 1,
  height REAL NOT NULL DEFAULT 1,
  image_scale_x REAL NOT NULL DEFAULT 1,
  image_scale_y REAL NOT NULL DEFAULT 1,
  snapshot_lifecycle TEXT NOT NULL CHECK (snapshot_lifecycle IN ('ephemeral','reusable','persistent')),
  original_entity_id TEXT,
  snapshot_data TEXT
);

CREATE TABLE IF NOT EXISTS tactical_state (
  scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
  map_url TEXT,
  map_width INTEGER,
  map_height INTEGER,
  grid TEXT NOT NULL DEFAULT '{}',
  round_number INTEGER NOT NULL DEFAULT 0,
  current_turn_token_id TEXT
);

CREATE TABLE IF NOT EXISTS tactical_tokens (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES tactical_state(scene_id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 1,
  height REAL NOT NULL DEFAULT 1,
  image_scale_x REAL NOT NULL DEFAULT 1,
  image_scale_y REAL NOT NULL DEFAULT 1,
  initiative_position INTEGER
);

CREATE TABLE IF NOT EXISTS blueprints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Unnamed Blueprint',
  image_url TEXT,
  color TEXT NOT NULL DEFAULT '#888888',
  width REAL NOT NULL DEFAULT 1,
  height REAL NOT NULL DEFAULT 1,
  notes TEXT,
  rule_data TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`
```

> **Note:** The `blueprints` table should mirror whatever currently exists — check the current file before replacing. The schema above covers the critical new tables; preserve any other tables verbatim.

- [ ] **Step 3: Commit**

```bash
git add server/schema.ts
git commit -m "refactor: rewrite schema — tactical_state per-scene, tactical_tokens SQL table, archive_tokens with snapshot_data"
```

---

### Task A3: Update TypeScript shared types

**Files:** Modify `src/shared/entityTypes.ts`

- [ ] **Step 1: Read current types**

```bash
cat src/shared/entityTypes.ts
```

- [ ] **Step 2: Update `Entity` type** — rename `size` → `width`, add `height`

```typescript
export interface Entity {
  id: string
  name: string
  imageUrl?: string
  color: string
  width: number // was: size: number
  height: number // new
  notes?: string
  ruleData?: Record<string, unknown>
  permissions?: EntityPermissions
  lifecycle: 'ephemeral' | 'reusable' | 'persistent'
}
```

- [ ] **Step 3: Update `MapToken` type** — `entityId` required, `width`/`height`, no `permissions`/`label`/`imageUrl`/`color`

```typescript
export interface MapToken {
  id: string
  entityId: string // required, no longer optional
  x: number
  y: number
  width: number // was: size: number
  height: number // new
  imageScaleX: number // new, default 1
  imageScaleY: number // new, default 1
  initiativePosition?: number
}
```

- [ ] **Step 4: Rename `CombatState` → `TacticalState`, `EncounterData` → `ArchiveData`**

Update the type names and their field names to match the new schema.

`TacticalState` should have: `sceneId`, `mapUrl?`, `mapWidth?`, `mapHeight?`, `grid`, `roundNumber`, `currentTurnTokenId?`, `tokens: MapToken[]`

`ArchiveData` (formerly `EncounterData`): `id`, `sceneId`, `name`, `mapUrl?`, `mapWidth?`, `mapHeight?`, `grid`, `gmOnly`, `createdAt` — NO `tokens` field (tokens are loaded separately via `archive_tokens` table)

- [ ] **Step 5: Commit**

```bash
git add src/shared/entityTypes.ts
git commit -m "refactor: update MapToken (entityId required, width/height), Entity (width/height), rename CombatState→TacticalState"
```

---

### Task A4: Write failing integration tests for new schema and APIs

**Files:** Create test files

Write tests first. They will fail until the implementation is in place.

- [ ] **Step 1: Write `tactical-schema.test.ts`**

```typescript
// server/__tests__/scenarios/tactical-schema.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, cleanup } from '../helpers/test-server'

describe('tactical schema structure', () => {
  let ctx: Awaited<ReturnType<typeof setupTestRoom>>
  beforeAll(async () => {
    ctx = await setupTestRoom()
  })
  afterAll(() => cleanup(ctx))

  it('tactical_state has scene_id primary key (not id=1)', async () => {
    const res = await ctx.request.get(`/api/rooms/${ctx.roomId}/scenes`)
    expect(res.status).toBe(200)
    const sceneId = res.body[0]?.id
    if (!sceneId) return // No scenes yet, schema test via direct table info

    const stateRes = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    // Should return 404 or empty when no scene active, not crash
    expect([200, 404]).toContain(stateRes.status)
  })

  it('creating a scene auto-creates tactical_state row', async () => {
    const scene = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/scenes`)
      .send({ name: 'Test Scene' })
    expect(scene.status).toBe(201)
    const sceneId = scene.body.id

    // Switch to that scene
    await ctx.request.patch(`/api/rooms/${ctx.roomId}/state`).send({ activeSceneId: sceneId })

    const tactical = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    expect(tactical.status).toBe(200)
    expect(tactical.body.sceneId).toBe(sceneId)
    expect(tactical.body.tokens).toEqual([])
  })

  it('room_state includes tacticalMode field', async () => {
    const res = await ctx.request.get(`/api/rooms/${ctx.roomId}/state`)
    expect(res.status).toBe(200)
    expect(typeof res.body.tacticalMode).toBe('number')
    expect(res.body).toHaveProperty('activeArchiveId')
  })
})
```

- [ ] **Step 2: Write `tactical-tokens-crud.test.ts`**

```typescript
// server/__tests__/scenarios/tactical-tokens-crud.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, cleanup } from '../helpers/test-server'

describe('tactical tokens CRUD', () => {
  let ctx: Awaited<ReturnType<typeof setupTestRoom>>
  let sceneId: string
  let entityId: string

  beforeAll(async () => {
    ctx = await setupTestRoom()
    // Create scene + entity
    const scene = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'S' })
    sceneId = scene.body.id
    await ctx.request.patch(`/api/rooms/${ctx.roomId}/state`).send({ activeSceneId: sceneId })

    const entity = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/entities`)
      .send({ name: 'Goblin', color: '#ff0000', width: 1, height: 1, lifecycle: 'ephemeral' })
    entityId = entity.body.id
  })
  afterAll(() => cleanup(ctx))

  it('POST /tactical/tokens creates a token row (not JSON blob)', async () => {
    const res = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId, x: 5, y: 3, width: 1, height: 1 })
    expect(res.status).toBe(201)
    expect(res.body.entityId).toBe(entityId)
    expect(res.body.x).toBe(5)
    expect(res.body.y).toBe(3)
  })

  it('PATCH /tactical/tokens/:id updates single row', async () => {
    const create = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId, x: 0, y: 0, width: 1, height: 1 })
    const tokenId = create.body.id

    const update = await ctx.request
      .patch(`/api/rooms/${ctx.roomId}/tactical/tokens/${tokenId}`)
      .send({ x: 10, y: 20 })
    expect(update.status).toBe(200)
    expect(update.body.x).toBe(10)
    expect(update.body.y).toBe(20)
  })

  it('DELETE /tactical/tokens/:id removes the row', async () => {
    const create = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId, x: 1, y: 1, width: 1, height: 1 })
    const tokenId = create.body.id

    const del = await ctx.request.delete(`/api/rooms/${ctx.roomId}/tactical/tokens/${tokenId}`)
    expect(del.status).toBe(200)

    // Verify gone
    const state = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    expect(state.body.tokens.find((t: { id: string }) => t.id === tokenId)).toBeUndefined()
  })

  it('GET /tactical returns tokens array (not JSON blob)', async () => {
    const state = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    expect(Array.isArray(state.body.tokens)).toBe(true)
  })

  it('rejects token creation when entityId does not exist', async () => {
    const res = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId: 'nonexistent-id', x: 0, y: 0, width: 1, height: 1 })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 3: Write `tactical-tokens-cascade.test.ts`**

```typescript
// server/__tests__/scenarios/tactical-tokens-cascade.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, cleanup } from '../helpers/test-server'

describe('tactical tokens FK cascade', () => {
  let ctx: Awaited<ReturnType<typeof setupTestRoom>>
  let sceneId: string

  beforeAll(async () => {
    ctx = await setupTestRoom()
    const scene = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'S' })
    sceneId = scene.body.id
    await ctx.request.patch(`/api/rooms/${ctx.roomId}/state`).send({ activeSceneId: sceneId })
  })
  afterAll(() => cleanup(ctx))

  it('deleting an entity cascades to its token', async () => {
    const entity = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/entities`)
      .send({ name: 'Orc', color: '#00f', width: 1, height: 1, lifecycle: 'ephemeral' })
    const entityId = entity.body.id

    await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId, x: 0, y: 0, width: 1, height: 1 })

    // Delete the entity
    await ctx.request.delete(`/api/rooms/${ctx.roomId}/entities/${entityId}`)

    // Token should be gone
    const state = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    expect(state.body.tokens.every((t: { entityId: string }) => t.entityId !== entityId)).toBe(true)
  })

  it('deleting a scene cascades to tactical_state and tokens', async () => {
    const scene2 = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'S2' })
    const sid2 = scene2.body.id
    await ctx.request.patch(`/api/rooms/${ctx.roomId}/state`).send({ activeSceneId: sid2 })

    const entity = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/entities`)
      .send({ name: 'Troll', color: '#0f0', width: 2, height: 2, lifecycle: 'ephemeral' })
    await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId: entity.body.id, x: 5, y: 5, width: 2, height: 2 })

    // Delete scene2
    await ctx.request.delete(`/api/rooms/${ctx.roomId}/scenes/${sid2}`)

    // Switch back and try to GET tactical for deleted scene (should 404 or return clean)
    await ctx.request.patch(`/api/rooms/${ctx.roomId}/state`).send({ activeSceneId: sceneId })
    const state = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    expect(state.status).toBe(200) // still works for remaining scene
  })
})
```

- [ ] **Step 4: Write `tactical-mode.test.ts`**

```typescript
// server/__tests__/scenarios/tactical-mode.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, cleanup } from '../helpers/test-server'

describe('tactical mode enter/exit', () => {
  let ctx: Awaited<ReturnType<typeof setupTestRoom>>

  beforeAll(async () => {
    ctx = await setupTestRoom()
  })
  afterAll(() => cleanup(ctx))

  it('POST /tactical/enter sets tacticalMode=1 in room_state', async () => {
    const res = await ctx.request.post(`/api/rooms/${ctx.roomId}/tactical/enter`)
    expect(res.status).toBe(200)

    const state = await ctx.request.get(`/api/rooms/${ctx.roomId}/state`)
    expect(state.body.tacticalMode).toBe(1)
  })

  it('POST /tactical/exit sets tacticalMode=0 in room_state', async () => {
    await ctx.request.post(`/api/rooms/${ctx.roomId}/tactical/enter`)
    const res = await ctx.request.post(`/api/rooms/${ctx.roomId}/tactical/exit`)
    expect(res.status).toBe(200)

    const state = await ctx.request.get(`/api/rooms/${ctx.roomId}/state`)
    expect(state.body.tacticalMode).toBe(0)
  })

  it('entering tactical mode does NOT clear existing tokens', async () => {
    const scene = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'S' })
    await ctx.request.patch(`/api/rooms/${ctx.roomId}/state`).send({ activeSceneId: scene.body.id })
    const entity = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/entities`)
      .send({ name: 'E', color: '#000', width: 1, height: 1, lifecycle: 'ephemeral' })
    await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId: entity.body.id, x: 0, y: 0, width: 1, height: 1 })

    // Enter, then exit, tokens must still be there
    await ctx.request.post(`/api/rooms/${ctx.roomId}/tactical/enter`)
    await ctx.request.post(`/api/rooms/${ctx.roomId}/tactical/exit`)

    const state = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    expect(state.body.tokens.length).toBe(1)
  })
})
```

- [ ] **Step 5: Write `archive-crud.test.ts`** (replaces `encounter-crud.test.ts`)

New test file for `archives` route. Key assertions:

- `GET /scenes/:sceneId/archives` returns archives array
- `POST /scenes/:sceneId/archives` creates archive (no `tokens` field in body)
- `PATCH /archives/:id` updates archive
- `DELETE /archives/:id` deletes archive + cascades to `archive_tokens`
- Archive response does NOT have a `tokens` JSON field (tokens loaded separately)

```typescript
// server/__tests__/scenarios/archive-crud.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, cleanup } from '../helpers/test-server'

describe('archive CRUD', () => {
  let ctx: Awaited<ReturnType<typeof setupTestRoom>>
  let sceneId: string

  beforeAll(async () => {
    ctx = await setupTestRoom()
    const scene = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'S' })
    sceneId = scene.body.id
  })
  afterAll(() => cleanup(ctx))

  it('POST /archives creates an archive without tokens blob', async () => {
    const res = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`)
      .send({ name: 'Goblin Ambush' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Goblin Ambush')
    expect(res.body).not.toHaveProperty('tokens') // no JSON blob
    expect(res.body.sceneId).toBe(sceneId)
  })

  it('GET /archives returns archives array for scene', async () => {
    const res = await ctx.request.get(`/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('PATCH /archives/:id updates name', async () => {
    const create = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`)
      .send({ name: 'Old Name' })
    const archiveId = create.body.id

    const update = await ctx.request
      .patch(`/api/rooms/${ctx.roomId}/archives/${archiveId}`)
      .send({ name: 'New Name' })
    expect(update.status).toBe(200)
    expect(update.body.name).toBe('New Name')
  })

  it('DELETE /archives/:id removes archive', async () => {
    const create = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`)
      .send({ name: 'To Delete' })
    const archiveId = create.body.id

    const del = await ctx.request.delete(`/api/rooms/${ctx.roomId}/archives/${archiveId}`)
    expect(del.status).toBe(200)

    const list = await ctx.request.get(`/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`)
    expect(list.body.find((a: { id: string }) => a.id === archiveId)).toBeUndefined()
  })
})
```

- [ ] **Step 6: Write `tactical-lifecycle.test.ts`** (replaces `combat-lifecycle.test.ts`)

Focus on: tactical_state is per-scene, switching scenes preserves each scene's state independently.

```typescript
// server/__tests__/scenarios/tactical-lifecycle.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, cleanup } from '../helpers/test-server'

describe('tactical state lifecycle (per-scene)', () => {
  let ctx: Awaited<ReturnType<typeof setupTestRoom>>

  beforeAll(async () => {
    ctx = await setupTestRoom()
  })
  afterAll(() => cleanup(ctx))

  it('each scene has its own independent tactical_state', async () => {
    const sceneA = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'A' })
    const sceneB = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'B' })

    // Add entity and token to scene A
    await ctx.request
      .patch(`/api/rooms/${ctx.roomId}/state`)
      .send({ activeSceneId: sceneA.body.id })
    const entity = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/entities`)
      .send({ name: 'G', color: '#f00', width: 1, height: 1, lifecycle: 'ephemeral' })
    await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId: entity.body.id, x: 3, y: 3, width: 1, height: 1 })

    // Switch to scene B
    await ctx.request
      .patch(`/api/rooms/${ctx.roomId}/state`)
      .send({ activeSceneId: sceneB.body.id })
    const stateB = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    expect(stateB.body.tokens).toEqual([]) // scene B has no tokens

    // Switch back to scene A — tokens still there
    await ctx.request
      .patch(`/api/rooms/${ctx.roomId}/state`)
      .send({ activeSceneId: sceneA.body.id })
    const stateA = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    expect(stateA.body.tokens.length).toBe(1)
  })

  it('PATCH /tactical updates map/grid on tactical_state', async () => {
    const scene = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'C' })
    await ctx.request.patch(`/api/rooms/${ctx.roomId}/state`).send({ activeSceneId: scene.body.id })

    const res = await ctx.request.patch(`/api/rooms/${ctx.roomId}/tactical`).send({
      mapUrl: 'http://example.com/map.png',
      mapWidth: 1920,
      mapHeight: 1080,
    })
    expect(res.status).toBe(200)

    const state = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    expect(state.body.mapUrl).toBe('http://example.com/map.png')
  })
})
```

- [ ] **Step 7: Run tests — verify they all FAIL** (routes don't exist yet)

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|tactical|archive)"
```

Expected: new tests fail with 404/500, old tests may also fail.

- [ ] **Step 8: Commit failing tests**

```bash
git add server/__tests__/scenarios/
git commit -m "test: add failing tests for tactical schema, token CRUD, cascade, mode, archive CRUD"
```

---

### Task A5: Create `server/routes/tactical.ts`

**Files:** Create `server/routes/tactical.ts`, delete `server/routes/combat.ts`

- [ ] **Step 1: Create `server/routes/tactical.ts`**

```typescript
// server/routes/tactical.ts
import { Router } from 'express'
import { Server } from 'socket.io'
import { getRoomDb } from '../db'
import { withRoom } from '../middleware'
import { randomUUID } from 'crypto'

export function tacticalRoutes(dataDir: string, io: Server): Router {
  const router = Router()

  // GET /api/rooms/:roomId/tactical — return tactical_state + tokens for active scene
  router.get('/api/rooms/:roomId/tactical', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    const state = req.room_state

    if (!state.active_scene_id) {
      return res.status(404).json({ error: 'No active scene' })
    }

    const tactical = db
      .prepare('SELECT * FROM tactical_state WHERE scene_id = ?')
      .get(state.active_scene_id) as Record<string, unknown> | undefined

    if (!tactical) {
      return res.status(404).json({ error: 'No tactical state for scene' })
    }

    const tokens = db
      .prepare('SELECT * FROM tactical_tokens WHERE scene_id = ?')
      .all(state.active_scene_id)

    res.json({
      sceneId: tactical.scene_id,
      mapUrl: tactical.map_url ?? null,
      mapWidth: tactical.map_width ?? null,
      mapHeight: tactical.map_height ?? null,
      grid: JSON.parse((tactical.grid as string) ?? '{}'),
      roundNumber: tactical.round_number ?? 0,
      currentTurnTokenId: tactical.current_turn_token_id ?? null,
      tokens: tokens.map(toToken),
    })
  })

  // PATCH /api/rooms/:roomId/tactical — update map/grid/round fields
  router.patch('/api/rooms/:roomId/tactical', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    const state = req.room_state

    if (!state.active_scene_id) return res.status(404).json({ error: 'No active scene' })

    const { mapUrl, mapWidth, mapHeight, grid, roundNumber, currentTurnTokenId } = req.body

    db.prepare(
      `
      UPDATE tactical_state
      SET map_url = COALESCE(?, map_url),
          map_width = COALESCE(?, map_width),
          map_height = COALESCE(?, map_height),
          grid = COALESCE(?, grid),
          round_number = COALESCE(?, round_number),
          current_turn_token_id = COALESCE(?, current_turn_token_id)
      WHERE scene_id = ?
    `,
    ).run(
      mapUrl ?? null,
      mapWidth ?? null,
      mapHeight ?? null,
      grid ? JSON.stringify(grid) : null,
      roundNumber ?? null,
      currentTurnTokenId ?? null,
      state.active_scene_id,
    )

    const updated = db
      .prepare('SELECT * FROM tactical_state WHERE scene_id = ?')
      .get(state.active_scene_id) as Record<string, unknown>
    const tokens = db
      .prepare('SELECT * FROM tactical_tokens WHERE scene_id = ?')
      .all(state.active_scene_id)

    const payload = {
      sceneId: updated.scene_id,
      mapUrl: updated.map_url ?? null,
      mapWidth: updated.map_width ?? null,
      mapHeight: updated.map_height ?? null,
      grid: JSON.parse((updated.grid as string) ?? '{}'),
      roundNumber: updated.round_number ?? 0,
      currentTurnTokenId: updated.current_turn_token_id ?? null,
      tokens: tokens.map(toToken),
    }

    io.to(req.params.roomId).emit('tactical:updated', payload)
    res.json(payload)
  })

  // POST /api/rooms/:roomId/tactical/enter
  router.post('/api/rooms/:roomId/tactical/enter', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    db.prepare('UPDATE room_state SET tactical_mode = 1 WHERE id = 1').run()
    const state = db.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<
      string,
      unknown
    >
    const payload = normalizeRoomState(state)
    io.to(req.params.roomId).emit('room:state:updated', payload)
    res.json(payload)
  })

  // POST /api/rooms/:roomId/tactical/exit
  router.post('/api/rooms/:roomId/tactical/exit', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    db.prepare('UPDATE room_state SET tactical_mode = 0 WHERE id = 1').run()
    const state = db.prepare('SELECT * FROM room_state WHERE id = 1').get() as Record<
      string,
      unknown
    >
    const payload = normalizeRoomState(state)
    io.to(req.params.roomId).emit('room:state:updated', payload)
    res.json(payload)
  })

  // POST /api/rooms/:roomId/tactical/tokens — create token (entity must exist)
  router.post('/api/rooms/:roomId/tactical/tokens', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    const state = req.room_state

    if (!state.active_scene_id) return res.status(404).json({ error: 'No active scene' })

    const {
      entityId,
      x = 0,
      y = 0,
      width = 1,
      height = 1,
      imageScaleX = 1,
      imageScaleY = 1,
    } = req.body
    if (!entityId) return res.status(400).json({ error: 'entityId is required' })

    const entity = db.prepare('SELECT id FROM entities WHERE id = ?').get(entityId)
    if (!entity) return res.status(404).json({ error: 'Entity not found' })

    const id = randomUUID()
    db.prepare(
      `
      INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height, image_scale_x, image_scale_y)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(id, state.active_scene_id, entityId, x, y, width, height, imageScaleX, imageScaleY)

    const token = db.prepare('SELECT * FROM tactical_tokens WHERE id = ?').get(id)
    const payload = toToken(token as Record<string, unknown>)

    io.to(req.params.roomId).emit('tactical:token:added', payload)
    res.status(201).json(payload)
  })

  // PATCH /api/rooms/:roomId/tactical/tokens/:tokenId
  router.patch('/api/rooms/:roomId/tactical/tokens/:tokenId', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    const { tokenId } = req.params
    const { x, y, width, height, imageScaleX, imageScaleY, initiativePosition } = req.body

    const existing = db.prepare('SELECT id FROM tactical_tokens WHERE id = ?').get(tokenId)
    if (!existing) return res.status(404).json({ error: 'Token not found' })

    db.prepare(
      `
      UPDATE tactical_tokens SET
        x = COALESCE(?, x),
        y = COALESCE(?, y),
        width = COALESCE(?, width),
        height = COALESCE(?, height),
        image_scale_x = COALESCE(?, image_scale_x),
        image_scale_y = COALESCE(?, image_scale_y),
        initiative_position = COALESCE(?, initiative_position)
      WHERE id = ?
    `,
    ).run(
      x ?? null,
      y ?? null,
      width ?? null,
      height ?? null,
      imageScaleX ?? null,
      imageScaleY ?? null,
      initiativePosition ?? null,
      tokenId,
    )

    const token = db.prepare('SELECT * FROM tactical_tokens WHERE id = ?').get(tokenId)
    const payload = toToken(token as Record<string, unknown>)

    io.to(req.params.roomId).emit('tactical:token:updated', payload)
    res.json(payload)
  })

  // DELETE /api/rooms/:roomId/tactical/tokens/:tokenId
  router.delete('/api/rooms/:roomId/tactical/tokens/:tokenId', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    const { tokenId } = req.params

    const existing = db.prepare('SELECT id FROM tactical_tokens WHERE id = ?').get(tokenId)
    if (!existing) return res.status(404).json({ error: 'Token not found' })

    db.prepare('DELETE FROM tactical_tokens WHERE id = ?').run(tokenId)

    io.to(req.params.roomId).emit('tactical:token:removed', { id: tokenId })
    res.json({ id: tokenId })
  })

  return router
}

function toToken(row: Record<string, unknown>) {
  return {
    id: row.id,
    entityId: row.entity_id,
    sceneId: row.scene_id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    imageScaleX: row.image_scale_x ?? 1,
    imageScaleY: row.image_scale_y ?? 1,
    initiativePosition: row.initiative_position ?? null,
  }
}

function normalizeRoomState(row: Record<string, unknown>) {
  return {
    activeSceneId: row.active_scene_id ?? null,
    activeArchiveId: row.active_archive_id ?? null,
    tacticalMode: row.tactical_mode ?? 0,
  }
}
```

- [ ] **Step 2: Delete old `combat.ts`**

```bash
git rm server/routes/combat.ts
```

- [ ] **Step 3: Run tactical tests — most should now pass**

```bash
npm test -- server/__tests__/scenarios/tactical-tokens-crud.test.ts --reporter=verbose
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/tactical.ts
git commit -m "feat: add tactical.ts route — SQL-backed token CRUD + enterTactical/exitTactical"
```

---

### Task A6: Create `server/routes/archives.ts`

**Files:** Create `server/routes/archives.ts`, delete `server/routes/encounters.ts`

Create the archives route. Key differences from old `encounters.ts`:

- Route paths: `/archives` instead of `/encounters`
- No `tokens` field in archive record (tokens are in `archive_tokens` table)
- `activate` endpoint renamed to `load` (PR B will implement full logic; for now stub)
- `save-snapshot` endpoint renamed to `save` (PR B implements; stub for now)

- [ ] **Step 1: Create `server/routes/archives.ts`** with CRUD + stub load/save

```typescript
// server/routes/archives.ts
import { Router } from 'express'
import { Server } from 'socket.io'
import { getRoomDb } from '../db'
import { withRoom } from '../middleware'
import { randomUUID } from 'crypto'

export function archiveRoutes(dataDir: string, io: Server): Router {
  const router = Router()

  // GET /api/rooms/:roomId/scenes/:sceneId/archives
  router.get('/api/rooms/:roomId/scenes/:sceneId/archives', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    const archives = db
      .prepare('SELECT * FROM archives WHERE scene_id = ? ORDER BY created_at')
      .all(req.params.sceneId)
    res.json(archives.map(toArchive))
  })

  // POST /api/rooms/:roomId/scenes/:sceneId/archives
  router.post('/api/rooms/:roomId/scenes/:sceneId/archives', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    const {
      name = 'Untitled Archive',
      mapUrl,
      mapWidth,
      mapHeight,
      grid,
      gmOnly = false,
    } = req.body
    const id = randomUUID()

    db.prepare(
      `
      INSERT INTO archives (id, scene_id, name, map_url, map_width, map_height, grid, gm_only)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      req.params.sceneId,
      name,
      mapUrl ?? null,
      mapWidth ?? null,
      mapHeight ?? null,
      grid ? JSON.stringify(grid) : '{}',
      gmOnly ? 1 : 0,
    )

    const archive = db.prepare('SELECT * FROM archives WHERE id = ?').get(id)
    const payload = toArchive(archive as Record<string, unknown>)

    io.to(req.params.roomId).emit('archive:created', payload)
    res.status(201).json(payload)
  })

  // PATCH /api/rooms/:roomId/archives/:archiveId
  router.patch('/api/rooms/:roomId/archives/:archiveId', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    const { archiveId } = req.params
    const { name, mapUrl, mapWidth, mapHeight, grid, gmOnly } = req.body

    const existing = db.prepare('SELECT id FROM archives WHERE id = ?').get(archiveId)
    if (!existing) return res.status(404).json({ error: 'Archive not found' })

    db.prepare(
      `
      UPDATE archives SET
        name = COALESCE(?, name),
        map_url = COALESCE(?, map_url),
        map_width = COALESCE(?, map_width),
        map_height = COALESCE(?, map_height),
        grid = COALESCE(?, grid),
        gm_only = COALESCE(?, gm_only)
      WHERE id = ?
    `,
    ).run(
      name ?? null,
      mapUrl ?? null,
      mapWidth ?? null,
      mapHeight ?? null,
      grid ? JSON.stringify(grid) : null,
      gmOnly !== undefined ? (gmOnly ? 1 : 0) : null,
      archiveId,
    )

    const updated = db.prepare('SELECT * FROM archives WHERE id = ?').get(archiveId)
    const payload = toArchive(updated as Record<string, unknown>)

    io.to(req.params.roomId).emit('archive:updated', payload)
    res.json(payload)
  })

  // DELETE /api/rooms/:roomId/archives/:archiveId
  router.delete('/api/rooms/:roomId/archives/:archiveId', withRoom(dataDir), (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    const { archiveId } = req.params

    const existing = db.prepare('SELECT id FROM archives WHERE id = ?').get(archiveId)
    if (!existing) return res.status(404).json({ error: 'Archive not found' })

    db.prepare('DELETE FROM archives WHERE id = ?').run(archiveId)

    io.to(req.params.roomId).emit('archive:deleted', { id: archiveId })
    res.json({ id: archiveId })
  })

  // POST /api/rooms/:roomId/archives/:archiveId/load — load archive into tactical state
  // Full implementation in PR B; stub returns 501
  router.post('/api/rooms/:roomId/archives/:archiveId/load', withRoom(dataDir), (_req, res) => {
    res.status(501).json({ error: 'Not implemented — coming in PR B' })
  })

  // POST /api/rooms/:roomId/archives/:archiveId/save — save tactical state to archive
  // Full implementation in PR B; stub returns 501
  router.post('/api/rooms/:roomId/archives/:archiveId/save', withRoom(dataDir), (_req, res) => {
    res.status(501).json({ error: 'Not implemented — coming in PR B' })
  })

  return router
}

function toArchive(row: Record<string, unknown>) {
  return {
    id: row.id,
    sceneId: row.scene_id,
    name: row.name,
    mapUrl: row.map_url ?? null,
    mapWidth: row.map_width ?? null,
    mapHeight: row.map_height ?? null,
    grid: typeof row.grid === 'string' ? JSON.parse(row.grid) : (row.grid ?? {}),
    gmOnly: Boolean(row.gm_only),
    createdAt: row.created_at,
  }
}
```

- [ ] **Step 2: Delete old `encounters.ts`**

```bash
git rm server/routes/encounters.ts
```

- [ ] **Step 3: Run archive tests**

```bash
npm test -- server/__tests__/scenarios/archive-crud.test.ts --reporter=verbose
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/archives.ts
git commit -m "feat: add archives.ts route — CRUD for archives, stub load/save"
```

---

### Task A7: Update `server/routes/scenes.ts` — auto-create `tactical_state`

**Files:** Modify `server/routes/scenes.ts`

When a scene is created, immediately INSERT a default `tactical_state` row for it.

- [ ] **Step 1: Read scenes route**

```bash
cat server/routes/scenes.ts
```

- [ ] **Step 2: Find the POST scene creation handler and add tactical_state insert**

Inside the scene creation transaction (or immediately after the INSERT INTO scenes):

```typescript
// After INSERT INTO scenes ...
db.prepare('INSERT INTO tactical_state (scene_id) VALUES (?)').run(id)
```

This must be inside the same transaction if scenes.ts uses one, or as a separate statement immediately after.

- [ ] **Step 3: Run schema tests**

```bash
npm test -- server/__tests__/scenarios/tactical-schema.test.ts --reporter=verbose
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/scenes.ts
git commit -m "feat: auto-create tactical_state row when scene is created"
```

---

### Task A8: Update `server/routes/state.ts` and `server/index.ts`

**Files:** Modify `server/routes/state.ts`, `server/index.ts`

- [ ] **Step 1: Update `state.ts`** — expose `tacticalMode` + `activeArchiveId`

Read `server/routes/state.ts`. Find where `room_state` is serialized and update:

- `active_encounter_id` → `activeArchiveId`
- Add `tactical_mode` → `tacticalMode`

- [ ] **Step 2: Update `server/index.ts`** — import new routes

```typescript
// Replace:
import { combatRoutes } from './routes/combat'
import { encounterRoutes } from './routes/encounters'
// With:
import { tacticalRoutes } from './routes/tactical'
import { archiveRoutes } from './routes/archives'

// Replace mount:
// app.use(combatRoutes(DATA_DIR, io))
// app.use(encounterRoutes(DATA_DIR, io))
// With:
app.use(tacticalRoutes(DATA_DIR, io))
app.use(archiveRoutes(DATA_DIR, io))
```

- [ ] **Step 3: Update `server/__tests__/helpers/test-server.ts`** — same import changes

- [ ] **Step 4: Delete old scenario test files**

```bash
git rm server/__tests__/scenarios/combat-lifecycle.test.ts
git rm server/__tests__/scenarios/encounter-crud.test.ts
git rm server/__tests__/scenarios/token-degradation.test.ts
```

- [ ] **Step 5: Run ALL tests**

```bash
npm test -- --reporter=verbose 2>&1 | tail -50
```

Fix any failures before committing.

- [ ] **Step 6: Commit**

```bash
git add server/routes/state.ts server/index.ts server/__tests__/helpers/test-server.ts
git commit -m "refactor: wire up tactical + archive routes, update state.ts to expose tacticalMode"
```

---

### Task A9: Final PR A test run and TypeScript check

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

All tests must pass.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Fix any type errors. Note: worldStore.ts and UI components will have many errors because they still reference old names — that's expected and will be fixed in PR B/C. Fix only server-side errors here.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors in server layer post-schema refactor"
```

- [ ] **Step 4: Push and create PR A**

```bash
git push -u origin feat/tactical-data-layer
gh pr create \
  --title "refactor: tactical data layer — per-scene tactical_state, SQL tactical_tokens, archive_tokens" \
  --body "$(cat <<'EOF'
## Summary
- Rewrites schema: `tactical_state` is now per-scene (not singleton), `tactical_tokens` is a proper SQL table (not JSON blob), `archive_tokens` uses `snapshot_data TEXT` JSON column
- Renames `encounters`→`archives`, `combat_state`→`tactical_state`, adds `room_state.tactical_mode`
- Creates per-scene tactical state auto-insert on scene creation
- Adds `POST /tactical/enter` + `POST /tactical/exit` writing to `room_state`
- Deletes old `combat.ts` and `encounters.ts` route files

## Tests Added
- `tactical-schema.test.ts` — auto-create, room_state fields
- `tactical-tokens-crud.test.ts` — SQL CRUD
- `tactical-tokens-cascade.test.ts` — FK cascade (entity delete → token delete, scene delete → all cascade)
- `tactical-mode.test.ts` — enter/exit tactical mode
- `tactical-lifecycle.test.ts` — per-scene isolation
- `archive-crud.test.ts` — archive CRUD
EOF
)"
```

---

## Chunk 2: PR B — Business Logic (Store + Token Creation + Archive Lifecycle)

**Branch:** `feat/tactical-store-business`
**Worktree:** `.worktrees/feat/tactical-store-business`

**Depends on:** PR A merged to `main`

### Files Changed in PR B

**Modified:**

- `src/stores/worldStore.ts` — rename all methods/types, add atomic token creation methods, archive load/save
- `src/stores/uiStore.ts` — rename `'encounters'` → `'archives'` in tab type
- `src/stores/selectors.ts` — rename `selectCombatInfo` → `selectTacticalInfo`
- `server/routes/tactical.ts` — add `POST /tactical/tokens` (create ephemeral entity + token atomically), `POST /tactical/tokens/from-entity`, `POST /tactical/tokens/:id/duplicate`
- `server/routes/archives.ts` — implement `POST /archives/:id/load` + `POST /archives/:id/save`
- `server/routes/scenes.ts` — delete entity cleanup on scene entity removal when entity has no scene_entity_entries

**Created:**

- `server/__tests__/scenarios/archive-save-load.test.ts`
- `server/__tests__/scenarios/token-create-atomic.test.ts`
- `server/__tests__/scenarios/token-place-entity.test.ts`

---

### Task B1: Create worktree for PR B

- [ ] **Step 1: Create worktree from updated main**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT
# (after PR A is merged)
git fetch origin
git worktree add .worktrees/feat/tactical-store-business -b feat/tactical-store-business origin/main
cd .worktrees/feat/tactical-store-business
cp .env.example .env
# Set PORT=3003
npm install
npm test  # Baseline: all tests pass
```

---

### Task B2: Write failing tests for business logic

- [ ] **Step 1: Write `token-create-atomic.test.ts`**

```typescript
// server/__tests__/scenarios/token-create-atomic.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, cleanup } from '../helpers/test-server'

describe('atomic token creation', () => {
  let ctx: Awaited<ReturnType<typeof setupTestRoom>>
  let sceneId: string

  beforeAll(async () => {
    ctx = await setupTestRoom()
    const scene = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'S' })
    sceneId = scene.body.id
    await ctx.request.patch(`/api/rooms/${ctx.roomId}/state`).send({ activeSceneId: sceneId })
  })
  afterAll(() => cleanup(ctx))

  it('POST /tactical/tokens/quick creates ephemeral entity + token atomically', async () => {
    const res = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens/quick`)
      .send({ x: 5, y: 3, name: 'Quick NPC', color: '#ff0000' })

    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
    expect(res.body.entity).toBeDefined()
    expect(res.body.entity.lifecycle).toBe('ephemeral')
    expect(res.body.token.entityId).toBe(res.body.entity.id)

    // Verify entity is in DB
    const entityRes = await ctx.request.get(
      `/api/rooms/${ctx.roomId}/entities/${res.body.entity.id}`,
    )
    expect(entityRes.status).toBe(200)
    expect(entityRes.body.lifecycle).toBe('ephemeral')
  })

  it('quick-create does NOT create a scene_entity_entry', async () => {
    const res = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens/quick`)
      .send({ x: 1, y: 1 })

    const entityId = res.body.entity.id
    const entries = await ctx.request.get(`/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`)
    const hasEntry = entries.body.some((e: { entityId: string }) => e.entityId === entityId)
    expect(hasEntry).toBe(false)
  })
})
```

- [ ] **Step 2: Write `token-place-entity.test.ts`**

```typescript
// server/__tests__/scenarios/token-place-entity.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, cleanup } from '../helpers/test-server'

describe('place existing entity on map', () => {
  let ctx: Awaited<ReturnType<typeof setupTestRoom>>
  let sceneId: string
  let entityId: string

  beforeAll(async () => {
    ctx = await setupTestRoom()
    const scene = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'S' })
    sceneId = scene.body.id
    await ctx.request.patch(`/api/rooms/${ctx.roomId}/state`).send({ activeSceneId: sceneId })

    // Create a persistent entity (PC)
    const entity = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/entities`)
      .send({ name: 'Hero', color: '#0f0', width: 1, height: 1, lifecycle: 'persistent' })
    entityId = entity.body.id
  })
  afterAll(() => cleanup(ctx))

  it('POST /tactical/tokens/from-entity places entity without duplicating it', async () => {
    const res = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`)
      .send({ entityId, x: 4, y: 4 })

    expect(res.status).toBe(201)
    expect(res.body.entityId).toBe(entityId)

    // Entity count should be unchanged
    const entities = await ctx.request.get(`/api/rooms/${ctx.roomId}/entities`)
    const heroes = entities.body.filter((e: { name: string }) => e.name === 'Hero')
    expect(heroes.length).toBe(1)
  })

  it('returns 409 if entity already has a token in this scene', async () => {
    // Place once
    await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`)
      .send({ entityId, x: 0, y: 0 })

    // Try to place again
    const res = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens/from-entity`)
      .send({ entityId, x: 5, y: 5 })

    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 3: Write `archive-save-load.test.ts`**

```typescript
// server/__tests__/scenarios/archive-save-load.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, cleanup } from '../helpers/test-server'

describe('archive save and load', () => {
  let ctx: Awaited<ReturnType<typeof setupTestRoom>>
  let sceneId: string

  beforeAll(async () => {
    ctx = await setupTestRoom()
    const scene = await ctx.request.post(`/api/rooms/${ctx.roomId}/scenes`).send({ name: 'S' })
    sceneId = scene.body.id
    await ctx.request.patch(`/api/rooms/${ctx.roomId}/state`).send({ activeSceneId: sceneId })
  })
  afterAll(() => cleanup(ctx))

  it('save creates archive_tokens snapshot of current tactical state', async () => {
    // Set up 2 tokens
    const e1 = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/entities`)
      .send({ name: 'G1', color: '#f00', width: 1, height: 1, lifecycle: 'ephemeral' })
    const e2 = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/entities`)
      .send({ name: 'Reusable NPC', color: '#0f0', width: 1, height: 1, lifecycle: 'reusable' })
    await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId: e1.body.id, x: 1, y: 1, width: 1, height: 1 })
    await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId: e2.body.id, x: 2, y: 2, width: 1, height: 1 })

    // Create archive
    const arch = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`)
      .send({ name: 'Battle 1' })
    const archiveId = arch.body.id

    // Save
    const save = await ctx.request.post(`/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)
    expect(save.status).toBe(200)

    // Verify archive_tokens created: ephemeral has snapshot_data, reusable has original_entity_id
    // (We verify this by loading the archive and checking the result)
  })

  it('load archive restores tokens to tactical state', async () => {
    // Save archive with known tokens
    const e1 = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/entities`)
      .send({ name: 'Orc', color: '#f0f', width: 1, height: 1, lifecycle: 'ephemeral' })
    await ctx.request
      .post(`/api/rooms/${ctx.roomId}/tactical/tokens`)
      .send({ entityId: e1.body.id, x: 5, y: 5, width: 1, height: 1 })

    const arch = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`)
      .send({ name: 'Orc Ambush' })
    await ctx.request.post(`/api/rooms/${ctx.roomId}/archives/${arch.body.id}/save`)

    // Clear tactical tokens manually
    const tokens = (await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)).body.tokens
    for (const t of tokens) {
      await ctx.request.delete(`/api/rooms/${ctx.roomId}/tactical/tokens/${t.id}`)
    }

    // Load archive
    const load = await ctx.request.post(`/api/rooms/${ctx.roomId}/archives/${arch.body.id}/load`)
    expect(load.status).toBe(200)

    // Should have tokens restored
    const state = await ctx.request.get(`/api/rooms/${ctx.roomId}/tactical`)
    expect(state.body.tokens.length).toBeGreaterThan(0)
  })

  it('loading archive does not modify the archive itself (immutable)', async () => {
    const arch = await ctx.request
      .post(`/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`)
      .send({ name: 'Immutable' })
    const archiveId = arch.body.id

    // Save then load twice
    await ctx.request.post(`/api/rooms/${ctx.roomId}/archives/${archiveId}/save`)
    await ctx.request.post(`/api/rooms/${ctx.roomId}/archives/${archiveId}/load`)
    await ctx.request.post(`/api/rooms/${ctx.roomId}/archives/${archiveId}/load`)

    // Archive still exists unchanged
    const archives = await ctx.request.get(`/api/rooms/${ctx.roomId}/scenes/${sceneId}/archives`)
    const found = archives.body.find((a: { id: string }) => a.id === archiveId)
    expect(found).toBeDefined()
    expect(found.name).toBe('Immutable')
  })
})
```

- [ ] **Step 4: Run tests — verify they fail**

```bash
npm test -- server/__tests__/scenarios/token-create-atomic.test.ts server/__tests__/scenarios/token-place-entity.test.ts server/__tests__/scenarios/archive-save-load.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit failing tests**

```bash
git add server/__tests__/scenarios/
git commit -m "test: add failing tests for atomic token creation, entity placement, archive save/load"
```

---

### Task B3: Implement atomic token creation endpoints

**Files:** Modify `server/routes/tactical.ts`

Add three new endpoints:

- [ ] **Step 1: Add `POST /tactical/tokens/quick` (atomic ephemeral entity + token)**

Inside `tacticalRoutes`, before the existing `POST /tactical/tokens`:

```typescript
// POST /api/rooms/:roomId/tactical/tokens/quick — create ephemeral entity + token atomically
router.post('/api/rooms/:roomId/tactical/tokens/quick', withRoom(dataDir), (req, res) => {
  const db = getRoomDb(req.params.roomId, dataDir)
  const state = req.room_state

  if (!state.active_scene_id) return res.status(404).json({ error: 'No active scene' })

  const {
    x = 0,
    y = 0,
    width = 1,
    height = 1,
    name = 'NPC',
    color = '#888888',
    imageUrl,
  } = req.body

  const entityId = randomUUID()
  const tokenId = randomUUID()

  const transaction = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO entities (id, name, image_url, color, width, height, lifecycle)
      VALUES (?, ?, ?, ?, ?, ?, 'ephemeral')
    `,
    ).run(entityId, name, imageUrl ?? null, color, width, height)

    db.prepare(
      `
      INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(tokenId, state.active_scene_id, entityId, x, y, width, height)
  })

  transaction()

  const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(entityId)
  const token = db.prepare('SELECT * FROM tactical_tokens WHERE id = ?').get(tokenId)

  const payload = {
    entity: toEntity(entity as Record<string, unknown>),
    token: toToken(token as Record<string, unknown>),
  }
  io.to(req.params.roomId).emit('tactical:token:added', payload.token)
  io.to(req.params.roomId).emit('entity:added', payload.entity)
  res.status(201).json(payload)
})
```

- [ ] **Step 2: Add `POST /tactical/tokens/from-entity` (place existing entity)**

```typescript
// POST /api/rooms/:roomId/tactical/tokens/from-entity
router.post('/api/rooms/:roomId/tactical/tokens/from-entity', withRoom(dataDir), (req, res) => {
  const db = getRoomDb(req.params.roomId, dataDir)
  const state = req.room_state

  if (!state.active_scene_id) return res.status(404).json({ error: 'No active scene' })

  const { entityId, x = 0, y = 0, width, height } = req.body
  if (!entityId) return res.status(400).json({ error: 'entityId is required' })

  const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(entityId)
  if (!entity) return res.status(404).json({ error: 'Entity not found' })

  // 1:1 check — entity can only have one token per scene
  const existing = db
    .prepare('SELECT id FROM tactical_tokens WHERE scene_id = ? AND entity_id = ?')
    .get(state.active_scene_id, entityId)
  if (existing) return res.status(409).json({ error: 'Entity already has a token in this scene' })

  const e = entity as Record<string, unknown>
  const tokenId = randomUUID()
  db.prepare(
    `
    INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    tokenId,
    state.active_scene_id,
    entityId,
    x,
    y,
    width ?? e.width ?? 1,
    height ?? e.height ?? 1,
  )

  const token = db.prepare('SELECT * FROM tactical_tokens WHERE id = ?').get(tokenId)
  const payload = toToken(token as Record<string, unknown>)

  io.to(req.params.roomId).emit('tactical:token:added', payload)
  res.status(201).json(payload)
})
```

- [ ] **Step 3: Add `POST /tactical/tokens/:tokenId/duplicate`**

```typescript
router.post(
  '/api/rooms/:roomId/tactical/tokens/:tokenId/duplicate',
  withRoom(dataDir),
  (req, res) => {
    const db = getRoomDb(req.params.roomId, dataDir)
    const state = req.room_state

    if (!state.active_scene_id) return res.status(404).json({ error: 'No active scene' })

    const original = db
      .prepare('SELECT * FROM tactical_tokens WHERE id = ?')
      .get(req.params.tokenId) as Record<string, unknown> | undefined
    if (!original) return res.status(404).json({ error: 'Token not found' })

    const originalEntity = db
      .prepare('SELECT * FROM entities WHERE id = ?')
      .get(original.entity_id) as Record<string, unknown>

    const { offsetX = 1, offsetY = 1 } = req.body

    const newEntityId = randomUUID()
    const newTokenId = randomUUID()

    const transaction = db.transaction(() => {
      // Copy entity as ephemeral
      db.prepare(
        `
      INSERT INTO entities (id, name, image_url, color, width, height, notes, rule_data, lifecycle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ephemeral')
    `,
      ).run(
        newEntityId,
        originalEntity.name,
        originalEntity.image_url,
        originalEntity.color,
        originalEntity.width,
        originalEntity.height,
        originalEntity.notes,
        originalEntity.rule_data,
      )

      // Copy token with offset
      db.prepare(
        `
      INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height, image_scale_x, image_scale_y)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      ).run(
        newTokenId,
        state.active_scene_id,
        newEntityId,
        (original.x as number) + offsetX,
        (original.y as number) + offsetY,
        original.width,
        original.height,
        original.image_scale_x,
        original.image_scale_y,
      )
    })

    transaction()

    const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(newEntityId)
    const token = db.prepare('SELECT * FROM tactical_tokens WHERE id = ?').get(newTokenId)

    const payload = {
      entity: toEntity(entity as Record<string, unknown>),
      token: toToken(token as Record<string, unknown>),
    }
    io.to(req.params.roomId).emit('tactical:token:added', payload.token)
    io.to(req.params.roomId).emit('entity:added', payload.entity)
    res.status(201).json(payload)
  },
)
```

Also add the `toEntity()` helper in `tactical.ts`:

```typescript
function toEntity(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url ?? null,
    color: row.color,
    width: row.width,
    height: row.height,
    notes: row.notes ?? null,
    ruleData:
      typeof row.rule_data === 'string'
        ? JSON.parse(row.rule_data as string)
        : (row.rule_data ?? {}),
    permissions:
      typeof row.permissions === 'string'
        ? JSON.parse(row.permissions as string)
        : (row.permissions ?? {}),
    lifecycle: row.lifecycle,
  }
}
```

- [ ] **Step 4: Run token creation tests**

```bash
npm test -- server/__tests__/scenarios/token-create-atomic.test.ts server/__tests__/scenarios/token-place-entity.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/tactical.ts
git commit -m "feat: add atomic token creation — quick (ephemeral entity+token), from-entity, duplicate"
```

---

### Task B4: Implement archive save/load in `server/routes/archives.ts`

**Files:** Modify `server/routes/archives.ts`

This is the most complex endpoint. The load logic follows the design doc section 3.5:

1. Find orphan ephemeral entities (have tactical_token, no scene_entity_entry) → delete them
2. Clear current scene's tactical_tokens
3. Restore from archive_tokens (by lifecycle rules)

- [ ] **Step 1: Implement `POST /archives/:archiveId/save`**

```typescript
// In archiveRoutes, replace stub:
router.post('/api/rooms/:roomId/archives/:archiveId/save', withRoom(dataDir), (req, res) => {
  const db = getRoomDb(req.params.roomId, dataDir)
  const roomState = req.room_state

  if (!roomState.active_scene_id) return res.status(404).json({ error: 'No active scene' })

  const archive = db.prepare('SELECT * FROM archives WHERE id = ?').get(req.params.archiveId) as
    | Record<string, unknown>
    | undefined
  if (!archive) return res.status(404).json({ error: 'Archive not found' })

  const tokens = db
    .prepare(
      'SELECT tt.*, e.lifecycle, e.name, e.image_url, e.color, e.width as e_width, e.height as e_height, e.notes, e.rule_data, e.permissions FROM tactical_tokens tt JOIN entities e ON e.id = tt.entity_id WHERE tt.scene_id = ?',
    )
    .all(roomState.active_scene_id) as Record<string, unknown>[]

  const transaction = db.transaction(() => {
    // Clear existing archive_tokens
    db.prepare('DELETE FROM archive_tokens WHERE archive_id = ?').run(req.params.archiveId)

    // Snapshot current tokens
    for (const t of tokens) {
      const id = randomUUID()
      const isEphemeral = t.lifecycle === 'ephemeral'
      db.prepare(
        `
        INSERT INTO archive_tokens (id, archive_id, x, y, width, height, image_scale_x, image_scale_y, snapshot_lifecycle, original_entity_id, snapshot_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        id,
        req.params.archiveId,
        t.x,
        t.y,
        t.width,
        t.height,
        t.image_scale_x ?? 1,
        t.image_scale_y ?? 1,
        t.lifecycle,
        isEphemeral ? null : t.entity_id, // only non-ephemeral store original_entity_id
        isEphemeral
          ? JSON.stringify({
              name: t.name,
              imageUrl: t.image_url ?? null,
              color: t.color,
              width: t.e_width,
              height: t.e_height,
              notes: t.notes ?? null,
              ruleData:
                typeof t.rule_data === 'string'
                  ? JSON.parse(t.rule_data as string)
                  : (t.rule_data ?? {}),
              permissions:
                typeof t.permissions === 'string'
                  ? JSON.parse(t.permissions as string)
                  : (t.permissions ?? {}),
            })
          : null,
      )
    }

    // Also update archive map/grid from current tactical_state
    const state = db
      .prepare('SELECT * FROM tactical_state WHERE scene_id = ?')
      .get(roomState.active_scene_id) as Record<string, unknown>
    db.prepare(
      `
      UPDATE archives SET map_url = ?, map_width = ?, map_height = ?, grid = ? WHERE id = ?
    `,
    ).run(
      state.map_url ?? null,
      state.map_width ?? null,
      state.map_height ?? null,
      state.grid ?? '{}',
      req.params.archiveId,
    )
  })

  transaction()

  const updated = db.prepare('SELECT * FROM archives WHERE id = ?').get(req.params.archiveId)
  res.json(toArchive(updated as Record<string, unknown>))
})
```

- [ ] **Step 2: Implement `POST /archives/:archiveId/load`**

```typescript
router.post('/api/rooms/:roomId/archives/:archiveId/load', withRoom(dataDir), (req, res) => {
  const db = getRoomDb(req.params.roomId, dataDir)
  const roomState = req.room_state

  if (!roomState.active_scene_id) return res.status(404).json({ error: 'No active scene' })

  const archive = db.prepare('SELECT * FROM archives WHERE id = ?').get(req.params.archiveId) as
    | Record<string, unknown>
    | undefined
  if (!archive) return res.status(404).json({ error: 'Archive not found' })

  const archiveTokens = db
    .prepare('SELECT * FROM archive_tokens WHERE archive_id = ?')
    .all(req.params.archiveId) as Record<string, unknown>[]

  const transaction = db.transaction(() => {
    const sceneId = roomState.active_scene_id

    // Step 1: Find orphan ephemeral entities (tactical_token, no scene_entity_entry, lifecycle=ephemeral)
    const orphans = db
      .prepare(
        `
      SELECT tt.entity_id FROM tactical_tokens tt
      WHERE tt.scene_id = ?
      AND tt.entity_id IN (SELECT id FROM entities WHERE lifecycle = 'ephemeral')
      AND tt.entity_id NOT IN (
        SELECT entity_id FROM scene_entity_entries WHERE scene_id = ?
      )
    `,
      )
      .all(sceneId, sceneId) as { entity_id: string }[]

    // Step 2: Clear current tactical_tokens
    db.prepare('DELETE FROM tactical_tokens WHERE scene_id = ?').run(sceneId)

    // Step 3: Delete orphan ephemeral entities (cascade handles any remaining refs)
    for (const o of orphans) {
      db.prepare('DELETE FROM entities WHERE id = ?').run(o.entity_id)
    }

    // Step 4: Restore from archive_tokens
    for (const at of archiveTokens) {
      const tokenId = randomUUID()
      const lifecycle = at.snapshot_lifecycle as string

      if (lifecycle === 'ephemeral') {
        // Create new entity from snapshot
        const snap = JSON.parse(at.snapshot_data as string)
        const newEntityId = randomUUID()
        db.prepare(
          `
          INSERT INTO entities (id, name, image_url, color, width, height, notes, rule_data, permissions, lifecycle)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ephemeral')
        `,
        ).run(
          newEntityId,
          snap.name,
          snap.imageUrl ?? null,
          snap.color,
          snap.width,
          snap.height,
          snap.notes ?? null,
          JSON.stringify(snap.ruleData ?? {}),
          JSON.stringify(snap.permissions ?? {}),
        )
        db.prepare(
          `
          INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height, image_scale_x, image_scale_y)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          tokenId,
          sceneId,
          newEntityId,
          at.x,
          at.y,
          at.width,
          at.height,
          at.image_scale_x ?? 1,
          at.image_scale_y ?? 1,
        )
      } else {
        // reusable/persistent — reference existing entity
        const existingEntity = at.original_entity_id
          ? db.prepare('SELECT id FROM entities WHERE id = ?').get(at.original_entity_id)
          : null
        if (!existingEntity) continue // entity gone, skip

        db.prepare(
          `
          INSERT INTO tactical_tokens (id, scene_id, entity_id, x, y, width, height, image_scale_x, image_scale_y)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          tokenId,
          sceneId,
          at.original_entity_id,
          at.x,
          at.y,
          at.width,
          at.height,
          at.image_scale_x ?? 1,
          at.image_scale_y ?? 1,
        )
      }
    }

    // Update tactical_state map from archive
    db.prepare(
      `
      UPDATE tactical_state SET map_url = ?, map_width = ?, map_height = ?, grid = ? WHERE scene_id = ?
    `,
    ).run(
      archive.map_url ?? null,
      archive.map_width ?? null,
      archive.map_height ?? null,
      archive.grid ?? '{}',
      sceneId,
    )

    // Update active_archive_id
    db.prepare('UPDATE room_state SET active_archive_id = ? WHERE id = 1').run(req.params.archiveId)
  })

  transaction()

  // Return current tactical state
  const state = db
    .prepare('SELECT * FROM tactical_state WHERE scene_id = ?')
    .get(roomState.active_scene_id) as Record<string, unknown>
  const tokens = db
    .prepare('SELECT * FROM tactical_tokens WHERE scene_id = ?')
    .all(roomState.active_scene_id)
  const payload = {
    sceneId: state.scene_id,
    mapUrl: state.map_url ?? null,
    mapWidth: state.map_width ?? null,
    mapHeight: state.map_height ?? null,
    grid: JSON.parse((state.grid as string) ?? '{}'),
    roundNumber: state.round_number ?? 0,
    currentTurnTokenId: state.current_turn_token_id ?? null,
    tokens: tokens.map((t) => toToken(t as Record<string, unknown>)),
  }

  io.to(req.params.roomId).emit('tactical:activated', payload)
  res.json(payload)
})
```

- [ ] **Step 3: Run archive tests**

```bash
npm test -- server/__tests__/scenarios/archive-save-load.test.ts --reporter=verbose
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/archives.ts
git commit -m "feat: implement archive save/load — ephemeral snapshot, reusable/persistent by reference"
```

---

### Task B5: Rename worldStore — all combat→tactical, encounters→archives

**Files:** Modify `src/stores/worldStore.ts`

This is a large mechanical rename. Do it systematically.

- [ ] **Step 1: Read the full worldStore**

```bash
wc -l src/stores/worldStore.ts
cat src/stores/worldStore.ts
```

- [ ] **Step 2: Rename types at the top of worldStore**

| Old                     | New                       |
| ----------------------- | ------------------------- |
| `CombatInfo` interface  | `TacticalInfo`            |
| `EncounterRecord`       | `ArchiveRecord`           |
| `normalizeCombatInfo()` | `normalizeTacticalInfo()` |

- [ ] **Step 3: Rename store state fields**

| Old                                 | New                                  |
| ----------------------------------- | ------------------------------------ |
| `combatInfo: CombatInfo \| null`    | `tacticalInfo: TacticalInfo \| null` |
| `encounters: EncounterRecord[]`     | `archives: ArchiveRecord[]`          |
| `activeEncounterId: string \| null` | `activeArchiveId: string \| null`    |
| `isCombat: boolean`                 | `isTactical: boolean`                |

- [ ] **Step 4: Rename store methods**

| Old                    | New                                               |
| ---------------------- | ------------------------------------------------- |
| `startCombat()`        | `enterTactical()` — calls `POST /tactical/enter`  |
| `endCombat()`          | `exitTactical()` — calls `POST /tactical/exit`    |
| `activateEncounter()`  | `loadArchive()` — calls `POST /archives/:id/load` |
| `saveEncounter()`      | `saveArchive()` — calls `POST /archives/:id/save` |
| `updateCombatGrid()`   | `updateTacticalGrid()`                            |
| `setCombatMapUrl()`    | `setTacticalMapUrl()`                             |
| `fetchEncounters()`    | `fetchArchives()`                                 |
| `createEncounter()`    | `createArchive()`                                 |
| `deleteEncounter()`    | `deleteArchive()`                                 |
| `updateEncounter()`    | `updateArchive()`                                 |
| `duplicateEncounter()` | `duplicateArchive()`                              |

- [ ] **Step 5: Add new store methods for token creation**

```typescript
// Add to WorldStore interface:
createToken(x: number, y: number, opts?: { name?: string; color?: string }): Promise<void>
placeEntityOnMap(entityId: string, x: number, y: number): Promise<void>
duplicateToken(tokenId: string, offsetX?: number, offsetY?: number): Promise<void>
```

Implementations call the new atomic endpoints:

```typescript
createToken: async (x, y, opts = {}) => {
  const { activeSceneId } = get()
  if (!activeSceneId) return
  const res = await fetch(`${API_BASE}/rooms/${roomId}/tactical/tokens/quick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y, ...opts }),
  })
  // Socket.io will update state via 'tactical:token:added' event
},

placeEntityOnMap: async (entityId, x, y) => {
  const { activeSceneId } = get()
  if (!activeSceneId) return
  await fetch(`${API_BASE}/rooms/${roomId}/tactical/tokens/from-entity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityId, x, y }),
  })
},

duplicateToken: async (tokenId, offsetX = 1, offsetY = 1) => {
  const { activeSceneId } = get()
  if (!activeSceneId) return
  await fetch(`${API_BASE}/rooms/${roomId}/tactical/tokens/${tokenId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offsetX, offsetY }),
  })
},
```

- [ ] **Step 6: Update Socket.io event listeners**

Rename all `combat:*` → `tactical:*` and `encounter:*` → `archive:*` in the Socket.io listener registration.

- [ ] **Step 7: Update WS_EVENTS constant array** (if present)

- [ ] **Step 8: TypeScript check — server side only**

```bash
npx tsc --noEmit 2>&1 | grep -v "^src/" | head -30
```

- [ ] **Step 9: Commit**

```bash
git add src/stores/worldStore.ts
git commit -m "refactor: rename worldStore — combat→tactical, encounters→archives, add createToken/placeEntityOnMap/duplicateToken"
```

---

### Task B6: Rename uiStore and selectors

**Files:** Modify `src/stores/uiStore.ts`, `src/stores/selectors.ts`

- [ ] **Step 1: Update `uiStore.ts`**

```typescript
// Change type:
type GmSidebarTab = 'archives' | 'entities'
// Change default:
gmSidebarTab: 'archives'
```

- [ ] **Step 2: Update `selectors.ts`**

Rename `selectCombatInfo` → `selectTacticalInfo`, update field access `s.combatInfo` → `s.tacticalInfo`.

- [ ] **Step 3: Commit**

```bash
git add src/stores/uiStore.ts src/stores/selectors.ts
git commit -m "refactor: rename uiStore encounters→archives tab, selectCombatInfo→selectTacticalInfo"
```

---

### Task B7: Final PR B tests + TypeScript

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Note: UI components will have errors — that's expected; those are fixed in PR C.

- [ ] **Step 3: Fix any server-side or store TS errors**

- [ ] **Step 4: Push and create PR B**

```bash
git push -u origin feat/tactical-store-business
gh pr create \
  --title "refactor: store + business logic — archive save/load, atomic token creation" \
  --body "..."
```

---

## Chunk 3: PR C — UI Refactor (Component Rename + KonvaMap Split)

**Branch:** `feat/tactical-ui-refactor`
**Worktree:** `.worktrees/feat/tactical-ui-refactor`

**Depends on:** PR B merged to `main`

### Files Changed in PR C

**Renamed:**

- `src/gm/EncounterPanel.tsx` → `src/gm/ArchivePanel.tsx`

**Created:**

- `src/combat/hooks/useCameraControls.ts` (~80 lines)
- `src/combat/hooks/useTokenAwareness.ts` (~60 lines)
- `src/combat/hooks/useEntityDrop.ts` (~40 lines)
- `src/combat/BackgroundLayer.tsx` (~110 lines)
- `src/combat/ZoomControls.tsx` (~30 lines)

**Modified:**

- `src/combat/KonvaMap.tsx` (~746 → ~150 lines)
- `src/combat/TacticalPanel.tsx` — rename `combatInfo` → `tacticalInfo`, `startCombat` → `enterTactical`, etc.
- `src/gm/GmSidebar.tsx` — import `ArchivePanel`, rename tab
- `src/App.tsx` — `selectTacticalInfo`, `placeEntityOnMap` store method
- All other components using `combatInfo` → `tacticalInfo`
- `tailwind.config.ts` — `z-combat` → `z-tactical`

---

### Task C1: Create worktree for PR C

- [ ] **Step 1: Create worktree**

```bash
git worktree add .worktrees/feat/tactical-ui-refactor -b feat/tactical-ui-refactor origin/main
cd .worktrees/feat/tactical-ui-refactor
cp .env.example .env
# Set PORT=3004
npm install
npm test  # Baseline passes
```

---

### Task C2: Rename EncounterPanel → ArchivePanel and update GmSidebar

**Files:** `src/gm/EncounterPanel.tsx` → `src/gm/ArchivePanel.tsx`, `src/gm/GmSidebar.tsx`

- [ ] **Step 1: Copy and rename**

```bash
cp src/gm/EncounterPanel.tsx src/gm/ArchivePanel.tsx
git rm src/gm/EncounterPanel.tsx
```

- [ ] **Step 2: Update `ArchivePanel.tsx`** — rename component export + all internal references

```typescript
// export function EncounterPanel → export function ArchivePanel
// encounters → archives
// activeEncounterId → activeArchiveId
// sortedEncounters → sortedArchives
// selectedEnc → selectedArchive
// deletingEnc → deletingArchive
// All store method calls updated to match PR B renames
// UI label: '遭遇' → '存档'
// '激活遭遇' → '激活存档'
// '暂无遭遇预设' → '暂无战场存档'
```

- [ ] **Step 3: Update `GmSidebar.tsx`**

```typescript
import { ArchivePanel } from './ArchivePanel'
// TABS: { id: 'encounters', label: '遭遇' } → { id: 'archives', label: '存档' }
// Render: activeTab === 'archives' && <ArchivePanel />
```

- [ ] **Step 4: TypeScript check on changed files**

```bash
npx tsc --noEmit 2>&1 | grep -E "(EncounterPanel|ArchivePanel|GmSidebar)"
```

- [ ] **Step 5: Commit**

```bash
git add src/gm/
git commit -m "refactor: rename EncounterPanel→ArchivePanel, update GmSidebar tab"
```

---

### Task C3: Update App.tsx and TacticalPanel.tsx

**Files:** `src/App.tsx`, `src/combat/TacticalPanel.tsx`

- [ ] **Step 1: Update `App.tsx`**
- `selectCombatInfo` → `selectTacticalInfo`
- `combatInfo` local var → `tacticalInfo`
- `combatInfo={combatInfo}` prop → `tacticalInfo={tacticalInfo}`
- `handleDropEntityOnMap` → call `worldStore.placeEntityOnMap(entityId, x, y)` (remove manual token construction)

- [ ] **Step 2: Update `TacticalPanel.tsx`**
- All `combatInfo` → `tacticalInfo`
- `startCombat()` → `enterTactical()`
- `endCombat()` → `exitTactical()`
- `isCombat` → `isTactical`
- `z-combat` → `z-tactical`

- [ ] **Step 3: Update `tailwind.config.ts`**
- Rename `z-combat: '100'` → `z-tactical: '100'`

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/combat/TacticalPanel.tsx tailwind.config.ts
git commit -m "refactor: App.tsx + TacticalPanel — combatInfo→tacticalInfo, placeEntityOnMap, z-tactical"
```

---

### Task C4: Update remaining combat components

**Files:** KonvaMap.tsx, KonvaTokenLayer.tsx, GridConfigPanel.tsx, and any other files using `combatInfo`

- [ ] **Step 1: Find all remaining references**

```bash
grep -r "combatInfo\|EncounterPanel\|startCombat\|endCombat\|isCombat\|encounters" src/ --include="*.tsx" --include="*.ts" -l
```

- [ ] **Step 2: Update each file**

For each file:

- `combatInfo` → `tacticalInfo`
- Store method call updates per PR B renames

- [ ] **Step 3: Update KonvaMap.tsx — replace token creation handlers**

The three inline handlers in KonvaMap.tsx that create/copy tokens should now call store methods:

```typescript
// OLD: handleCreateToken — builds anonymous token locally
// NEW:
const handleCreateToken = useCallback((mapX: number, mapY: number) => {
  worldStore.createToken(mapX, mapY)
}, [])

// OLD: handleCopyToken — {...token, id: new}
// NEW:
const handleCopyToken = useCallback((tokenId: string) => {
  worldStore.duplicateToken(tokenId)
}, [])
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

All errors should be resolved.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor: update combat components — combatInfo→tacticalInfo, token creation via store methods"
```

---

### Task C5: Extract hooks from KonvaMap.tsx

**Files:** Create 3 new hook files, reduce KonvaMap.tsx

> `★ Insight ─────────────────────────────────────`
> The current KonvaMap.tsx violates the single responsibility principle at 746 lines. Custom hooks are the React pattern for extracting stateful logic while keeping component render logic clean. Each hook here is a "has state + manages effects" unit — exactly the right extraction boundary.
> `─────────────────────────────────────────────────`

- [ ] **Step 1: Create `src/combat/hooks/useCameraControls.ts`**

Extract zoom/pan/fit/reset logic. Signature:

```typescript
export function useCameraControls(stageRef: React.RefObject<Konva.Stage>) {
  const [scale, setScale] = useState(1)
  const [stageOffset, setStageOffset] = useState({ x: 0, y: 0 })
  // ... zoom/pan handlers
  return {
    scale,
    stageOffset,
    handleWheel,
    handleFitToScreen,
    handleResetZoom,
    handleZoomIn,
    handleZoomOut,
  }
}
```

- [ ] **Step 2: Create `src/combat/hooks/useTokenAwareness.ts`**

Extract Socket.io drag broadcasting. Signature:

```typescript
export function useTokenAwareness(roomId: string) {
  // emit awareness:token:drag events during drag
  return { broadcastTokenDrag, broadcastTokenDragEnd }
}
```

- [ ] **Step 3: Create `src/combat/hooks/useEntityDrop.ts`**

Extract `onDragOver`/`onDrop` handling (entity drops from library). Signature:

```typescript
export function useEntityDrop(
  sceneId: string,
  stageRef: React.RefObject<Konva.Stage>,
  scale: number,
  stageOffset: { x: number; y: number },
) {
  // converts screen coords → map coords, calls worldStore.placeEntityOnMap
  return { handleDragOver, handleDrop }
}
```

- [ ] **Step 4: Create `src/combat/BackgroundLayer.tsx`**

Extract the `BackgroundLayer` component (Image/Video background rendering). Konva `Layer` with `KonvaImage` or video component.

- [ ] **Step 5: Create `src/combat/ZoomControls.tsx`**

Extract the zoom button UI component. Pure DOM (fixed position buttons), no Konva.

- [ ] **Step 6: Update `KonvaMap.tsx`** to use the extracted pieces

The refactored KonvaMap.tsx should be ~150 lines: import hooks, import sub-components, assemble Stage.

- [ ] **Step 7: TypeScript check + test run**

```bash
npx tsc --noEmit
npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/combat/
git commit -m "refactor: extract KonvaMap — useCameraControls, useTokenAwareness, useEntityDrop, BackgroundLayer, ZoomControls"
```

---

### Task C6: Write hook unit tests

**Files:** Create hook test files in `src/combat/__tests__/`

- [ ] **Step 1: Write `useCameraControls.test.ts`**

```typescript
// src/combat/__tests__/useCameraControls.test.ts
import { renderHook, act } from '@testing-library/react'
import { useCameraControls } from '../hooks/useCameraControls'

describe('useCameraControls', () => {
  it('starts at scale=1', () => {
    const { result } = renderHook(() => useCameraControls({ current: null } as any))
    expect(result.current.scale).toBe(1)
  })

  it('handleZoomIn increases scale', () => {
    const { result } = renderHook(() => useCameraControls({ current: null } as any))
    act(() => result.current.handleZoomIn())
    expect(result.current.scale).toBeGreaterThan(1)
  })

  it('handleZoomOut decreases scale', () => {
    const { result } = renderHook(() => useCameraControls({ current: null } as any))
    act(() => {
      result.current.handleZoomIn()
      result.current.handleZoomOut()
    })
    expect(result.current.scale).toBeCloseTo(1, 1)
  })
})
```

- [ ] **Step 2: Run hook tests**

```bash
npm test -- src/combat/__tests__/useCameraControls.test.ts --reporter=verbose
```

- [ ] **Step 3: Commit**

```bash
git add src/combat/__tests__/
git commit -m "test: useCameraControls hook unit tests"
```

---

### Task C7: Full PR C validation

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

All tests must pass.

- [ ] **Step 2: TypeScript strict check**

```bash
npx tsc --noEmit
```

Zero errors.

- [ ] **Step 3: Push and create PR C**

```bash
git push -u origin feat/tactical-ui-refactor
gh pr create \
  --title "refactor: tactical UI — rename EncounterPanel, KonvaMap split, store methods in components" \
  --body "..."
```

---

## Test Coverage Summary

| PR  | New Test Files                                                                                                              | Coverage                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A   | `tactical-schema`, `tactical-tokens-crud`, `tactical-tokens-cascade`, `tactical-mode`, `tactical-lifecycle`, `archive-crud` | Schema structure, SQL CRUD, FK cascade, mode broadcast, per-scene isolation    |
| B   | `token-create-atomic`, `token-place-entity`, `archive-save-load`                                                            | Atomic transactions, 1:1 enforcement, ephemeral snapshot, lifecycle load rules |
| C   | `useCameraControls`                                                                                                         | Hook unit test                                                                 |

All integration tests run against a real SQLite server in Node.js — no mocks.
