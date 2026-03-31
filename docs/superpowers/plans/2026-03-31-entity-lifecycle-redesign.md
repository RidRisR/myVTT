# Entity Lifecycle Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `EntityLifecycle = 'ephemeral' | 'reusable' | 'persistent'` with `'persistent' | 'tactical' | 'scene'`, removing auto-link behavior and adding scene-scoped cleanup.

**Architecture:** Rename lifecycle enum values, remove the two auto-link code paths (entity creation + scene creation), expand scene deletion cleanup to cover both `scene` and `tactical` entities, and update all client references. No data migration needed.

**Tech Stack:** TypeScript, Express, SQLite (better-sqlite3), React, zustand, vitest

**Spec:** `docs/superpowers/specs/2026-03-31-entity-lifecycle-redesign-design.md`

---

### Task 1: Type Definition + Schema + Fixtures

**Files:**

- Modify: `src/shared/entityTypes.ts:5`
- Modify: `server/schema.ts:61,105,229`
- Modify: `src/__test-utils__/fixtures.ts:7`

- [ ] **Step 1: Update EntityLifecycle type**

In `src/shared/entityTypes.ts`, change line 5:

```typescript
// Old:
export type EntityLifecycle = 'ephemeral' | 'reusable' | 'persistent'
// New:
export type EntityLifecycle = 'persistent' | 'tactical' | 'scene'
```

- [ ] **Step 2: Update schema CHECK constraints and default**

In `server/schema.ts`, change line 61:

```sql
-- Old:
lifecycle TEXT DEFAULT 'ephemeral' CHECK(lifecycle IN ('ephemeral','reusable','persistent')),
-- New:
lifecycle TEXT DEFAULT 'persistent' CHECK(lifecycle IN ('persistent','tactical','scene')),
```

Change line 105:

```sql
-- Old:
snapshot_lifecycle TEXT NOT NULL CHECK(snapshot_lifecycle IN ('ephemeral','reusable','persistent')),
-- New:
snapshot_lifecycle TEXT NOT NULL CHECK(snapshot_lifecycle IN ('persistent','tactical','scene')),
```

Line 229 (`idx_entities_lifecycle`) — no change needed, index stays.

- [ ] **Step 3: Update test fixture default**

In `src/__test-utils__/fixtures.ts`, change line 7:

```typescript
// Old:
lifecycle: 'ephemeral',
// New:
lifecycle: 'tactical',
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -80`

Expected: Compile errors in files that still use old lifecycle values (this is expected — we fix them in subsequent tasks).

- [ ] **Step 5: Commit**

```bash
git add src/shared/entityTypes.ts server/schema.ts src/__test-utils__/fixtures.ts
git commit -m "refactor: redefine EntityLifecycle values — persistent/tactical/scene"
```

---

### Task 2: Server — entities.ts

**Files:**

- Modify: `server/routes/entities.ts:85,112-121`

- [ ] **Step 1: Change default lifecycle + remove auto-link**

In `server/routes/entities.ts`:

Line 85 — change default:

```typescript
// Old:
lifecycle = 'ephemeral',
// New:
lifecycle = 'persistent',
```

Lines 112-121 — delete the entire `if (lifecycle === 'persistent')` block that auto-links to all scenes:

```typescript
// DELETE THIS BLOCK:
// Persistent entities auto-link to all existing scenes
if (lifecycle === 'persistent') {
  const scenes = db.prepare('SELECT id FROM scenes').all() as { id: string }[]
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, 1)',
  )
  for (const s of scenes) {
    stmt.run(s.id, id)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/entities.ts
git commit -m "refactor: remove persistent auto-link, default lifecycle to persistent"
```

---

### Task 3: Server — scenes.ts

**Files:**

- Modify: `server/routes/scenes.ts:50-59,130-137,159-162,178-186,207-217,308-311`

- [ ] **Step 1: Remove auto-link persistent on scene creation**

In `server/routes/scenes.ts`, delete lines 50-59 inside the `createScene` transaction:

```typescript
// DELETE THIS BLOCK:
// Auto-link persistent entities
const persistentEntities = req
  .roomDb!.prepare("SELECT id FROM entities WHERE lifecycle = 'persistent'")
  .all() as { id: string }[]
const linkStmt = req.roomDb!.prepare(
  'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, 1)',
)
for (const e of persistentEntities) {
  linkStmt.run(id, e.id)
}
```

- [ ] **Step 2: Update scene deletion cleanup**

Replace the ephemeral-only cleanup (lines 130-137 + 139-162) with cleanup for both `scene` and `tactical` entities. Replace:

```typescript
// Find ephemeral entities linked only to this scene
const ephemeralEntities = req
  .roomDb!.prepare(
    `SELECT e.id FROM entities e
         JOIN scene_entities se ON se.entity_id = e.id
         WHERE se.scene_id = ? AND e.lifecycle = 'ephemeral'`,
  )
  .all(req.params.id) as { id: string }[]
```

With:

```typescript
// Find scene/tactical entities linked to this scene (via scene_entities)
const linkedCleanupEntities = req
  .roomDb!.prepare(
    `SELECT e.id FROM entities e
         JOIN scene_entities se ON se.entity_id = e.id
         WHERE se.scene_id = ? AND e.lifecycle IN ('scene', 'tactical')`,
  )
  .all(req.params.id) as { id: string }[]

// Find tactical-only orphans (have tactical_tokens but no scene_entities link)
const tacticalOrphans = req
  .roomDb!.prepare(
    `SELECT DISTINCT e.id FROM entities e
         JOIN tactical_tokens t ON t.entity_id = e.id
         WHERE t.scene_id = ? AND e.lifecycle = 'tactical'
           AND NOT EXISTS (SELECT 1 FROM scene_entities se WHERE se.entity_id = e.id)`,
  )
  .all(req.params.id) as { id: string }[]

const entitiesToClean = [...linkedCleanupEntities, ...tacticalOrphans]
```

Update the transaction and Socket emissions to use `entitiesToClean` instead of `ephemeralEntities`:

```typescript
const deleteScene = req.roomDb!.transaction(() => {
  for (const e of entitiesToClean) {
    degradeTokenReferences(req.roomDb!, e.id)
    req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(e.id)
  }
  // ... rest unchanged
})
deleteScene()

for (const e of entitiesToClean) {
  io.to(req.roomId!).emit('entity:deleted', { id: e.id })
}
```

- [ ] **Step 3: Update single-scene constraint**

Replace lines 178-186:

```typescript
// Old:
// Ephemeral entities can only be in one scene
if (entity.lifecycle === 'ephemeral') {
  const existing = req
    .roomDb!.prepare('SELECT scene_id FROM scene_entities WHERE entity_id = ?')
    .get(req.params.entityId) as { scene_id: string } | undefined
  if (existing && existing.scene_id !== req.params.sceneId) {
    res.status(400).json({ error: 'Ephemeral entity is already linked to another scene' })
    return
  }
}
```

```typescript
// New:
// Tactical and scene entities can only be in one scene
if (entity.lifecycle === 'tactical' || entity.lifecycle === 'scene') {
  const existing = req
    .roomDb!.prepare('SELECT scene_id FROM scene_entities WHERE entity_id = ?')
    .get(req.params.entityId) as { scene_id: string } | undefined
  if (existing && existing.scene_id !== req.params.sceneId) {
    res.status(400).json({ error: 'This entity is already linked to another scene' })
    return
  }
}
```

- [ ] **Step 4: Update unlink cleanup logic**

Replace lines 207-217:

```typescript
// Old:
const isEphemeral = entity?.lifecycle === 'ephemeral'
// ...
const shouldDeleteEntity = isEphemeral && !hasTacticalToken
```

```typescript
// New:
const isScoped = entity?.lifecycle === 'tactical' || entity?.lifecycle === 'scene'
// ...
const shouldDeleteEntity = isScoped && !hasTacticalToken
```

Also update the comment on line 213 from "Keep ephemeral entities alive" to "Keep scoped entities alive" and line 224 from "Only delete ephemeral entities" to "Only delete scoped entities".

- [ ] **Step 5: Update spawn route lifecycle**

In the spawn route (line 308-311), change `'ephemeral'` to `'tactical'`:

```sql
-- Old:
VALUES (?, ?, 'ephemeral', ?)
-- New:
VALUES (?, ?, 'tactical', ?)
```

- [ ] **Step 6: Commit**

```bash
git add server/routes/scenes.ts
git commit -m "refactor: scenes.ts — remove auto-link, expand cleanup to scene+tactical"
```

---

### Task 4: Server — tactical.ts

**Files:**

- Modify: `server/routes/tactical.ts:173-178,271-297,425-429`

- [ ] **Step 1: Update tactical clear orphan query**

Lines 173-178, change `'ephemeral'` to `'tactical'`:

```typescript
// Delete orphan tactical entities (tactical-only, not in any scene)
const orphans = db
  .prepare(
    `SELECT e.id FROM entities e
           JOIN tactical_tokens t ON t.entity_id = e.id
           WHERE t.scene_id = ? AND e.lifecycle = 'tactical'
             AND NOT EXISTS (SELECT 1 FROM scene_entities se WHERE se.entity_id = e.id)`,
  )
  .all(sceneId) as { id: string }[]
```

- [ ] **Step 2: Update quick-create lifecycle**

Line 271 comment: change "ephemeral entity + token" to "tactical entity + token".

Line 297, change `'ephemeral'` to `'tactical'`:

```sql
VALUES (?, '{"default":"observer","seats":{}}', 'tactical')
```

- [ ] **Step 3: Update duplicate token lifecycle**

Line 429, change `'ephemeral'` to `'tactical'`:

```sql
VALUES (?, ?, 'tactical')
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/tactical.ts
git commit -m "refactor: tactical.ts — ephemeral → tactical"
```

---

### Task 5: Server — archives.ts

**Files:**

- Modify: `server/routes/archives.ts:172,194,199,275,288,294,301,311,347`

- [ ] **Step 1: Update archive save — snapshot strategy**

Line 172: `if (lifecycle === 'ephemeral')` → `if (lifecycle === 'tactical')`

Line 194: `'ephemeral',` → `'tactical',`

Line 199 comment: `// Reusable/persistent: store reference` → `// Persistent/scene: store reference`

- [ ] **Step 2: Update archive load — orphan cleanup**

Line 275: `e.lifecycle = 'ephemeral'` → `e.lifecycle = 'tactical'`

Line 288 comment: `Delete orphan ephemeral entities` → `Delete orphan tactical entities`

Line 294 comment: `recreate entity (if ephemeral)` → `recreate entity (if tactical)`

- [ ] **Step 3: Update archive load — entity restoration**

Line 301: `VALUES (?, ?, 'ephemeral')` → `VALUES (?, ?, 'tactical')`

Line 311: `if (lifecycle === 'ephemeral')` → `if (lifecycle === 'tactical')`

Line 347 comment: `// Reusable/persistent:` → `// Persistent/scene:`

- [ ] **Step 4: Commit**

```bash
git add server/routes/archives.ts
git commit -m "refactor: archives.ts — ephemeral → tactical"
```

---

### Task 6: Client — worldStore + CharacterLibraryTab + PortraitBar + EntityRow

**Files:**

- Modify: `src/stores/worldStore.ts:811`
- Modify: `src/dock/CharacterLibraryTab.tsx:29,32,52,168-170`
- Modify: `src/layout/PortraitBar.tsx:462-469,471-480`
- Modify: `src/gm/EntityRow.tsx:105`

- [ ] **Step 1: Update worldStore NPC creation**

`src/stores/worldStore.ts` line 811:

```typescript
// Old:
lifecycle: 'ephemeral',
// New:
lifecycle: 'tactical',
```

- [ ] **Step 2: Update CharacterLibraryTab**

`src/dock/CharacterLibraryTab.tsx`:

Line 29 comment: `// Filter: reusable or persistent` → `// Filter: persistent only (exclude tactical and scene)`

Line 32 — change filter condition:

```typescript
// Old:
if (e.lifecycle === 'ephemeral') return false
// New:
if (e.lifecycle !== 'persistent') return false
```

Line 52 — change default lifecycle:

```typescript
// Old:
lifecycle: 'reusable',
// New:
lifecycle: 'persistent',
```

Lines 168-170 — simplify label (no more reusable vs persistent distinction):

```typescript
// Old:
{
  entity.lifecycle === 'persistent' ? t('character.persistent') : t('character.reusable')
}
// New:
{
  t('character.persistent')
}
```

- [ ] **Step 3: Update PortraitBar context menu**

`src/layout/PortraitBar.tsx`:

Lines 462-469 — "save as character" for tactical AND scene:

```typescript
// Old:
{isGM && entity.lifecycle === 'ephemeral' && (
  <ContextMenuItem
    onSelect={() => {
      void updateEntity(entity.id, { lifecycle: 'reusable' })
    }}
  >
    {t('portrait.save_as_character')}
  </ContextMenuItem>
)}
// New:
{isGM && entity.lifecycle !== 'persistent' && (
  <ContextMenuItem
    onSelect={() => {
      void updateEntity(entity.id, { lifecycle: 'persistent' })
    }}
  >
    {t('portrait.save_as_character')}
  </ContextMenuItem>
)}
```

Lines 471-480 — remove the persistent guard (all entities can be removed from scene now):

```typescript
// Old:
{isGM && entity.lifecycle !== 'persistent' && (
  <ContextMenuItem
    variant="danger"
    onSelect={() => {
      onRemoveFromScene(entity.id)
    }}
  >
    {t('portrait.remove')}
  </ContextMenuItem>
)}
// New:
{isGM && (
  <ContextMenuItem
    variant="danger"
    onSelect={() => {
      onRemoveFromScene(entity.id)
    }}
  >
    {t('portrait.remove')}
  </ContextMenuItem>
)}
```

- [ ] **Step 4: Update EntityRow**

`src/gm/EntityRow.tsx` line 105 — no change needed (already uses `'persistent'`).

- [ ] **Step 5: Commit**

```bash
git add src/stores/worldStore.ts src/dock/CharacterLibraryTab.tsx src/layout/PortraitBar.tsx
git commit -m "refactor: client — update lifecycle values in stores and UI"
```

---

### Task 7: Tests — entity-lifecycle.test.ts

**Files:**

- Modify: `server/__tests__/scenarios/entity-lifecycle.test.ts`

- [ ] **Step 1: Rewrite entity lifecycle tests**

Replace the entire test file with updated lifecycle values and test cases. Key changes:

- `'ephemeral'` → `'tactical'`
- `'reusable'` → `'persistent'` (where used as value)
- Remove test for "creates persistent entity — auto-links to all scenes" (behavior removed)
- Remove test for "new scene auto-links persistent entities" (behavior removed)
- Add test for scene-scoped entity cleanup on scene deletion
- Update promotion test: tactical → persistent (was ephemeral → reusable)

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('entity-lifecycle-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Entity Lifecycle Journey', () => {
  let sceneAId: string, sceneBId: string
  let tacticalId: string, persistentId: string

  it('creates two scenes', async () => {
    const { data: a } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene A',
      atmosphere: {},
    })
    sceneAId = (a as { id: string }).id
    const { data: b } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene B',
      atmosphere: {},
    })
    sceneBId = (b as { id: string }).id
  })

  it('creates tactical entity', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'tactical',
      components: {
        'core:identity': { name: 'Goblin', imageUrl: '', color: '#888' },
      },
    })
    tacticalId = (data as { id: string; lifecycle: string }).id
    expect((data as { lifecycle: string }).lifecycle).toBe('tactical')
  })

  it('creates persistent entity — does NOT auto-link to scenes', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'persistent',
      components: {
        'core:identity': { name: 'Hero', imageUrl: '', color: '#888' },
      },
    })
    persistentId = (data as { id: string }).id

    const { data: aEnts } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`,
    )
    const ids = (aEnts as { entityId: string }[]).map((r) => r.entityId)
    expect(ids).not.toContain(persistentId)
  })

  it('links tactical to scene A', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tacticalId}`)
  })

  it('rejects tactical entity in second scene', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities/${tacticalId}`,
    )
    expect(status).toBe(400)
  })

  it('promotes tactical to persistent', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/entities/${tacticalId}`, {
      lifecycle: 'persistent',
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${tacticalId}`)
    expect((data as { lifecycle: string }).lifecycle).toBe('persistent')
  })

  it('unlinks persistent from scene — entity preserved', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tacticalId}`)
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${tacticalId}`)
    expect(status).toBe(200)
  })

  it('creates tactical and unlinks — entity deleted', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'tactical',
      components: {
        'core:identity': { name: 'Temp NPC', imageUrl: '', color: '#888' },
      },
    })
    const tempId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tempId}`)
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tempId}`)
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${tempId}`)
    expect(status).toBe(404)
  })

  it('new scene does NOT auto-link persistent entities', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene C',
      atmosphere: {},
    })
    const sceneCId = (data as { id: string }).id
    const { data: ents } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneCId}/entities`,
    )
    const ids = (ents as { entityId: string }[]).map((r) => r.entityId)
    expect(ids).not.toContain(persistentId)
  })

  it('deleting scene cleans up tactical entities', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'tactical',
      components: {
        'core:identity': { name: 'Scene Goblin', imageUrl: '', color: '#888' },
      },
    })
    const sceneGoblinId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${sceneGoblinId}`)
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}`)
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${sceneGoblinId}`)
    expect(status).toBe(404)
    const { status: heroStatus } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities/${persistentId}`,
    )
    expect(heroStatus).toBe(200)
  })

  it('deleting scene cleans up scene-scoped entities', async () => {
    // Create a new scene for this test
    const { data: sceneData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene D',
      atmosphere: {},
    })
    const sceneDId = (sceneData as { id: string }).id

    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'scene',
      components: {
        'core:identity': { name: 'Scene NPC', imageUrl: '', color: '#888' },
      },
    })
    const sceneNpcId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneDId}/entities/${sceneNpcId}`)
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneDId}`)
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${sceneNpcId}`)
    expect(status).toBe(404)
  })

  it('scene-scoped entity has single-scene constraint', async () => {
    const { data: sceneData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene E',
      atmosphere: {},
    })
    const sceneEId = (sceneData as { id: string }).id

    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      lifecycle: 'scene',
      components: {
        'core:identity': { name: 'Scene Guard', imageUrl: '', color: '#888' },
      },
    })
    const guardId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneEId}/entities/${guardId}`)

    // Create another scene and try to link
    const { data: sceneData2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene F',
      atmosphere: {},
    })
    const sceneFId = (sceneData2 as { id: string }).id
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneFId}/entities/${guardId}`,
    )
    expect(status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run server/__tests__/scenarios/entity-lifecycle.test.ts`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/scenarios/entity-lifecycle.test.ts
git commit -m "test: rewrite entity-lifecycle tests for new lifecycle values"
```

---

### Task 8: Tests — entity-filtering.test.ts

**Files:**

- Modify: `src/gm/__tests__/entity-filtering.test.ts:73,93-95`

- [ ] **Step 1: Update test data lifecycle values**

Line 73 — change default lifecycle in local `makeEntity`:

```typescript
// Old:
lifecycle: 'ephemeral' as const,
// New:
lifecycle: 'tactical' as const,
```

Lines 93-95 — change NPC lifecycle values:

```typescript
// Old:
const npc1 = makeEntity({ id: 'npc1', name: 'Goblin', lifecycle: 'ephemeral' as const })
const npc2 = makeEntity({ id: 'npc2', name: 'Dragon', lifecycle: 'ephemeral' as const })
const npc3 = makeEntity({ id: 'npc3', name: 'Goblin Chief', lifecycle: 'ephemeral' as const })
// New:
const npc1 = makeEntity({ id: 'npc1', name: 'Goblin', lifecycle: 'tactical' as const })
const npc2 = makeEntity({ id: 'npc2', name: 'Dragon', lifecycle: 'tactical' as const })
const npc3 = makeEntity({ id: 'npc3', name: 'Goblin Chief', lifecycle: 'tactical' as const })
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/gm/__tests__/entity-filtering.test.ts`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/gm/__tests__/entity-filtering.test.ts
git commit -m "test: update entity-filtering tests for new lifecycle values"
```

---

### Task 9: Full Verification

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 3: Lint check**

Run: `npx prettier --check "src/**/*.{ts,tsx}" "server/**/*.ts" "plugins/**/*.{ts,tsx}"`

Expected: No formatting issues.

- [ ] **Step 4: Grep for any remaining old values**

Run: `grep -rn "'ephemeral'\|'reusable'" src/ server/ plugins/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v __tests__ | grep -v ".test."`

Expected: No matches (all old lifecycle values replaced in production code).

- [ ] **Step 5: Final commit if any fixes needed**

Only if previous steps revealed issues that needed fixing.
