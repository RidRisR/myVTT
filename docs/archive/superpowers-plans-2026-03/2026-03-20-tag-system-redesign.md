# Tag System Schema Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat `tags TEXT '[]'` JSON columns with a proper `category` enum column + normalized `tags` table + junction tables, eliminating the semantic conflation of system classification and user-defined tags.

**Architecture:** Assets get a `category` column (`'map'|'token'`) for system classification. User-defined tags become first-class entities in a `tags` table. Many-to-many relationships use `asset_tags` and `blueprint_tags` junction tables. The client API surface stays `tags: string[]` — the server handles name↔ID mapping via `syncTags()` helper. The "All" category tab is removed since every asset must have a category.

**Tech Stack:** SQLite (better-sqlite3), Express 5, Socket.io, React, zustand, Vitest

**Migration:** No ALTER TABLE needed — there is no production data. Preview containers are ephemeral. Schema changes use `CREATE TABLE IF NOT EXISTS` on fresh databases.

**Atomicity:** Tasks 1–6 (server-side schema + routes + types) MUST be implemented and committed together. Intermediate states between these tasks will break the build because the old `tags TEXT` column is removed while routes still reference it.

**Behavior change:** Tag names are now normalized (lowercased, whitespace-collapsed) via `normalizeTagName()`. Tags like `"Beast"` become `"beast"`. This is intentional — `COLLATE NOCASE` on the tags table enforces case-insensitive uniqueness.

---

## File Map

| File                                                  | Action    | Responsibility                                                                                             |
| ----------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `server/schema.ts`                                    | Modify    | Add `category` col, `tags`/`asset_tags`/`blueprint_tags` tables; remove `tags TEXT` from assets+blueprints |
| `server/tagHelpers.ts`                                | Create    | `normalizeTagName`, `findOrCreateTag`, `syncTags`, `getTagNames`, `getAllTags`                             |
| `server/routes/tags.ts`                               | Create    | Tag CRUD: GET/POST/PATCH/DELETE `/api/rooms/:roomId/tags`                                                  |
| `server/routes/assets.ts`                             | Modify    | Use `category` column + `syncTags` for junction table; remove `extra.tags` extraction                      |
| `server/routes/blueprints.ts`                         | Modify    | Use `syncTags` for junction table; remove `tags` column operations                                         |
| `server/routes/bundle.ts`                             | Modify    | JOIN tag names from junction tables; return `tags: TagMeta[]`                                              |
| `server/index.ts`                                     | Modify    | Mount tag routes                                                                                           |
| `src/shared/assetTypes.ts`                            | Modify    | Add `AssetCategory`, `TagMeta`; add `category` to `AssetMeta`; remove `AUTO_TAGS`                          |
| `src/shared/entityTypes.ts`                           | No change | Blueprint.tags stays `string[]`                                                                            |
| `src/shared/storeTypes.ts`                            | Modify    | Add `category` + `tags` to `AssetRecord`                                                                   |
| `src/shared/bundleTypes.ts`                           | Modify    | Add `tags: TagMeta[]` to `BundleResponse`                                                                  |
| `src/shared/assetUpload.ts`                           | Modify    | Add `category` param to upload functions                                                                   |
| `src/shared/socketEvents.ts`                          | Modify    | Add `tag:created/updated/deleted` events                                                                   |
| `src/stores/worldStore.ts`                            | Modify    | Add tags slice, normalizeAsset uses `category`, tag socket events, uploadAsset passes `category`           |
| `src/asset-picker/assetPickerUtils.ts`                | Modify    | Filter by `a.category` instead of `a.tags.includes(cat)`; remove `AUTO_TAGS` usage                         |
| `src/ui/CategoryTabs.tsx`                             | Modify    | Remove "All" button; default to first category                                                             |
| `src/ui/TagEditorPopover.tsx`                         | Modify    | Remove `AUTO_TAGS` filtering; use store tags for suggestions                                               |
| `src/ui/TagFilterBar.tsx`                             | Modify    | Remove "All" button from category tabs layer (lines 39-50)                                                 |
| `src/asset-picker/AssetPickerPanel.tsx`               | Modify    | Default `activeCategory` to `'map'`; pass `category` on upload                                             |
| `src/asset-picker/AssetGrid.tsx`                      | Modify    | Pass `category` in upload call                                                                             |
| `src/asset-picker/AssetGridItem.tsx`                  | Modify    | Remove `AUTO_TAGS` import + usage at line 92                                                               |
| `src/dock/MapDockTab.tsx`                             | Modify    | Filter by `a.category === 'map'`; upload with `category: 'map'`                                            |
| `src/dock/BlueprintDockTab.tsx`                       | Modify    | Upload with `category: 'token'` instead of `tags: ['token']`                                               |
| `server/__tests__/scenarios/asset-tagging.test.ts`    | Rewrite   | Test category + junction-table tags                                                                        |
| `server/__tests__/scenarios/tag-crud.test.ts`         | Create    | Tag CRUD + rename propagation tests                                                                        |
| `src/asset-picker/__tests__/assetPickerUtils.test.ts` | Modify    | Remove AUTO_TAGS-specific test cases                                                                       |
| `src/gm/__tests__/entity-filtering.test.ts`           | Modify    | Replace local `AUTO_TAGS` with `category` field filtering                                                  |

---

## Task 1: Schema — Add category column, tags table, junction tables

**Files:**

- Modify: `server/schema.ts:148-159` (assets table), `server/schema.ts:48-55` (blueprints table), `server/schema.ts:181-188` (indexes)

- [ ] **Step 1: Modify assets table**

Replace lines 149-159 in `server/schema.ts`:

```sql
-- Assets (file management)
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  name TEXT DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'image',
  category TEXT NOT NULL DEFAULT 'map' CHECK(category IN ('map', 'token')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  extra TEXT DEFAULT '{}'
);
```

Changes: `tags TEXT DEFAULT '[]'` → `category TEXT NOT NULL DEFAULT 'map' CHECK(category IN ('map', 'token'))`.

- [ ] **Step 2: Remove tags column from blueprints table**

Replace lines 48-55:

```sql
-- Blueprints (entity template factory)
CREATE TABLE IF NOT EXISTS blueprints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  image_url TEXT DEFAULT '',
  defaults TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL
);
```

Changes: removed `tags TEXT DEFAULT '[]'`.

- [ ] **Step 3: Add tags table + junction tables after assets table**

Insert after assets table (before team_trackers):

```sql
-- Tag definitions (room-level, first-class entities)
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Asset ↔ Tag junction
CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, tag_id)
);

-- Blueprint ↔ Tag junction
CREATE TABLE IF NOT EXISTS blueprint_tags (
  blueprint_id TEXT NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (blueprint_id, tag_id)
);
```

- [ ] **Step 4: Add indexes for junction tables**

Append to existing indexes block:

```sql
CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_tags_tag ON blueprint_tags(tag_id);
```

- [ ] **Step 5: Run TypeScript check**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT-tag-redesign && npx tsc -b --noEmit`
Expected: errors in routes that reference `tags` column (assets.ts, blueprints.ts) — these will be fixed in later tasks.

- [ ] **Step 6: Commit**

```bash
git add server/schema.ts
git commit -m "refactor(schema): add category column, tags table, junction tables; remove tags JSON columns (#137)"
```

---

## Task 2: Tag helper functions

**Files:**

- Create: `server/tagHelpers.ts`

- [ ] **Step 1: Create tagHelpers.ts**

```typescript
// server/tagHelpers.ts — Tag normalization and junction-table operations
import crypto from 'crypto'
import type Database from 'better-sqlite3'

/** Normalize tag name: trim, collapse whitespace, lowercase */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Validate a tag name after normalization */
export function validateTagName(name: string): boolean {
  const normalized = normalizeTagName(name)
  return normalized.length > 0 && normalized.length <= 100
}

/**
 * Find existing tag by name or create a new one.
 * Uses INSERT ... ON CONFLICT to handle concurrent creation safely.
 */
export function findOrCreateTag(db: Database.Database, name: string): string {
  const normalized = normalizeTagName(name)
  const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(normalized) as
    | { id: string }
    | undefined
  if (existing) return existing.id

  const id = crypto.randomUUID()
  db.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)').run(
    id,
    normalized,
    Date.now(),
  )
  return id
}

/**
 * Sync junction table to match desired tag names.
 * Atomically replaces all tags for the given entity.
 * @param junctionTable - 'asset_tags' or 'blueprint_tags'
 * @param fkColumn - 'asset_id' or 'blueprint_id'
 */
export function syncTags(
  db: Database.Database,
  junctionTable: 'asset_tags' | 'blueprint_tags',
  fkColumn: 'asset_id' | 'blueprint_id',
  entityId: string,
  tagNames: string[],
): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM ${junctionTable} WHERE ${fkColumn} = ?`).run(entityId)
    const insert = db.prepare(`INSERT INTO ${junctionTable} (${fkColumn}, tag_id) VALUES (?, ?)`)
    for (const name of tagNames) {
      const tagId = findOrCreateTag(db, name)
      insert.run(entityId, tagId)
    }
  })()
}

/** Get tag names for an entity via junction table */
export function getTagNames(
  db: Database.Database,
  junctionTable: 'asset_tags' | 'blueprint_tags',
  fkColumn: 'asset_id' | 'blueprint_id',
  entityId: string,
): string[] {
  const rows = db
    .prepare(
      `SELECT t.name FROM tags t JOIN ${junctionTable} jt ON t.id = jt.tag_id WHERE jt.${fkColumn} = ?`,
    )
    .all(entityId) as { name: string }[]
  return rows.map((r) => r.name)
}

/** Get all tags defined in this room */
export function getAllTags(
  db: Database.Database,
): { id: string; name: string; color: string | null; sortOrder: number; createdAt: number }[] {
  return db
    .prepare(
      'SELECT id, name, color, sort_order AS sortOrder, created_at AS createdAt FROM tags ORDER BY sort_order, name',
    )
    .all() as {
    id: string
    name: string
    color: string | null
    sortOrder: number
    createdAt: number
  }[]
}
```

- [ ] **Step 2: Commit**

```bash
git add server/tagHelpers.ts
git commit -m "feat: add tag helper functions for normalization and junction table ops (#137)"
```

---

## Task 3: Tag CRUD routes

**Files:**

- Create: `server/routes/tags.ts`
- Modify: `server/index.ts` (mount route)

- [ ] **Step 1: Create tag CRUD routes**

```typescript
// server/routes/tags.ts — Tag CRUD (room-level)
import { Router } from 'express'
import crypto from 'crypto'
import type { TypedServer } from '../socketTypes'
import { withRoom } from '../middleware'
import { normalizeTagName, validateTagName, getTagNames } from '../tagHelpers'

export function tagRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  // GET all tags
  router.get('/api/rooms/:roomId/tags', room, (req, res) => {
    const rows = req
      .roomDb!.prepare(
        'SELECT id, name, color, sort_order AS sortOrder, created_at AS createdAt FROM tags ORDER BY sort_order, name',
      )
      .all()
    res.json(rows)
  })

  // POST create tag
  router.post('/api/rooms/:roomId/tags', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const rawName = body.name as string | undefined
    if (!rawName || !validateTagName(rawName)) {
      res.status(400).json({ error: 'Invalid tag name' })
      return
    }
    const name = normalizeTagName(rawName)
    const existing = req.roomDb!.prepare('SELECT id FROM tags WHERE name = ?').get(name)
    if (existing) {
      res.status(409).json({ error: 'Tag already exists' })
      return
    }
    const id = crypto.randomUUID()
    const now = Date.now()
    req
      .roomDb!.prepare(
        'INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, name, (body.color as string) || null, 0, now)
    const tag = { id, name, color: (body.color as string) || null, sortOrder: 0, createdAt: now }
    io.to(req.roomId!).emit('tag:created', tag)
    res.status(201).json(tag)
  })

  // PATCH rename/update tag
  router.patch('/api/rooms/:roomId/tags/:id', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
    if (!row) {
      res.status(404).json({ error: 'Tag not found' })
      return
    }
    const body = req.body as Record<string, unknown>
    const updates: string[] = []
    const params: unknown[] = []

    if (body.name !== undefined) {
      const name = normalizeTagName(body.name as string)
      if (!validateTagName(body.name as string)) {
        res.status(400).json({ error: 'Invalid tag name' })
        return
      }
      // Check uniqueness (excluding self)
      const dup = req
        .roomDb!.prepare('SELECT id FROM tags WHERE name = ? AND id != ?')
        .get(name, req.params.id)
      if (dup) {
        res.status(409).json({ error: 'Tag name already exists' })
        return
      }
      updates.push('name = ?')
      params.push(name)
    }
    if (body.color !== undefined) {
      updates.push('color = ?')
      params.push(body.color)
    }

    if (updates.length === 0) {
      res.json(row)
      return
    }

    params.push(req.params.id)
    req.roomDb!.prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    const updated = req
      .roomDb!.prepare(
        'SELECT id, name, color, sort_order AS sortOrder, created_at AS createdAt FROM tags WHERE id = ?',
      )
      .get(req.params.id)
    io.to(req.roomId!).emit('tag:updated', updated)

    // Broadcast updated assets/blueprints that use this tag (rename propagation)
    if (body.name !== undefined) {
      const assetIds = (
        req
          .roomDb!.prepare('SELECT asset_id FROM asset_tags WHERE tag_id = ?')
          .all(req.params.id) as {
          asset_id: string
        }[]
      ).map((r) => r.asset_id)
      for (const aid of assetIds) {
        const aRow = req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(aid) as Record<
          string,
          unknown
        >
        if (aRow) {
          const asset = toAssetWithTags(req.roomDb!, aRow)
          io.to(req.roomId!).emit('asset:updated', asset)
        }
      }
      const bpIds = (
        req
          .roomDb!.prepare('SELECT blueprint_id FROM blueprint_tags WHERE tag_id = ?')
          .all(req.params.id) as {
          blueprint_id: string
        }[]
      ).map((r) => r.blueprint_id)
      for (const bpId of bpIds) {
        const bpRow = req
          .roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?')
          .get(bpId) as Record<string, unknown>
        if (bpRow) {
          const bp = toBlueprintWithTags(req.roomDb!, bpRow)
          io.to(req.roomId!).emit('blueprint:updated', bp)
        }
      }
    }

    res.json(updated)
  })

  // DELETE tag (CASCADE removes junction rows)
  router.delete('/api/rooms/:roomId/tags/:id', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT id FROM tags WHERE id = ?').get(req.params.id)
    if (!row) {
      res.status(404).json({ error: 'Tag not found' })
      return
    }

    // Collect affected entity IDs BEFORE cascade delete
    const assetIds = (
      req
        .roomDb!.prepare('SELECT asset_id FROM asset_tags WHERE tag_id = ?')
        .all(req.params.id) as {
        asset_id: string
      }[]
    ).map((r) => r.asset_id)
    const bpIds = (
      req
        .roomDb!.prepare('SELECT blueprint_id FROM blueprint_tags WHERE tag_id = ?')
        .all(req.params.id) as {
        blueprint_id: string
      }[]
    ).map((r) => r.blueprint_id)

    req.roomDb!.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('tag:deleted', { id: req.params.id as string })

    // Broadcast updated entities (tags list changed)
    for (const aid of assetIds) {
      const aRow = req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(aid) as
        | Record<string, unknown>
        | undefined
      if (aRow) {
        io.to(req.roomId!).emit('asset:updated', toAssetWithTags(req.roomDb!, aRow))
      }
    }
    for (const bpId of bpIds) {
      const bpRow = req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(bpId) as
        | Record<string, unknown>
        | undefined
      if (bpRow) {
        io.to(req.roomId!).emit('blueprint:updated', toBlueprintWithTags(req.roomDb!, bpRow))
      }
    }

    res.status(204).end()
  })

  return router
}

// Helper: build asset response with tags from junction table
function toAssetWithTags(db: Database.Database, row: Record<string, unknown>) {
  const { toCamel, parseJsonFields } = require('../db')
  const { getTagNames } = require('../tagHelpers')
  const base = parseJsonFields(toCamel(row), 'extra')
  base.tags = getTagNames(db, 'asset_tags', 'asset_id', row.id as string)
  return base
}

function toBlueprintWithTags(db: Database.Database, row: Record<string, unknown>) {
  const { toCamel, parseJsonFields } = require('../db')
  const { getTagNames } = require('../tagHelpers')
  const base = parseJsonFields(toCamel(row), 'defaults')
  base.tags = getTagNames(db, 'blueprint_tags', 'blueprint_id', row.id as string)
  return base
}
```

**Important:** The `toAssetWithTags` and `toBlueprintWithTags` helpers shown above use `require` for brevity. During implementation, use proper static imports at the top of the file (`import { toCamel, parseJsonFields } from '../db'` and `import { getTagNames } from '../tagHelpers'`). Alternatively, extract these into `tagHelpers.ts` to keep them DRY across `tags.ts`, `assets.ts`, and `blueprints.ts`.

- [ ] **Step 2: Mount tag routes in server/index.ts**

Find where other routes are mounted (e.g., `app.use(assetRoutes(dataDir, io))`) and add:

```typescript
import { tagRoutes } from './routes/tags'
// ...
app.use(tagRoutes(dataDir, io))
```

- [ ] **Step 3: Add tag socket events to socketEvents.ts**

In `src/shared/socketEvents.ts`, `ServerToClientEvents`, after the Assets section add:

```typescript
// ── Tags ──
'tag:created': (tag: { id: string; name: string; color: string | null; sortOrder: number; createdAt: number }) => void
'tag:updated': (tag: { id: string; name: string; color: string | null; sortOrder: number; createdAt: number }) => void
'tag:deleted': (data: { id: string }) => void
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/tags.ts server/index.ts src/shared/socketEvents.ts
git commit -m "feat: add tag CRUD routes with create, rename, delete (#137)"
```

---

## Task 4: Adapt assets routes for category + junction table

**Files:**

- Modify: `server/routes/assets.ts`

Key changes to `server/routes/assets.ts`:

- [ ] **Step 1: Update toAsset helper to use junction table**

Replace the `toAsset` function (line 22-24) with:

```typescript
import { syncTags, getTagNames } from '../tagHelpers'
import type Database from 'better-sqlite3'

function toAssetWithTags(db: Database.Database, row: Record<string, unknown>): AssetRecord {
  const base = parseJsonFields(toCamel(row), 'extra') as unknown as AssetRecord
  ;(base as Record<string, unknown>).tags = getTagNames(
    db,
    'asset_tags',
    'asset_id',
    row.id as string,
  )
  return base
}
```

- [ ] **Step 2: Update GET to support `?category=` filter**

In the GET handler (line 26-36), add category filter:

```typescript
if (req.query.category) {
  query += ' AND category = ?'
  params.push(req.query.category)
}
```

Update `res.json(rows.map(toAsset))` → `res.json(rows.map((r) => toAssetWithTags(req.roomDb!, r)))`.

- [ ] **Step 3: Update POST to use category + syncTags**

In POST handler, replace the tags extraction (line 90) and INSERT (line 95):

```typescript
const category = (uploadBody.category as string) || 'map'
// Validate category
const VALID_CATEGORIES = ['map', 'token']
if (!VALID_CATEGORIES.includes(category)) {
  res.status(400).json({ error: `Invalid category: ${category}` })
  return
}
const tags: string[] = uploadBody.tags
  ? (JSON.parse(uploadBody.tags as string) as string[])
  : extra.tags
    ? (extra.tags as string[])
    : []
```

Update INSERT SQL to use `category` instead of `tags`:

```sql
INSERT INTO assets (id, url, name, media_type, category, created_at, extra) VALUES (?, ?, ?, ?, ?, ?, ?)
```

After INSERT, call `syncTags`:

```typescript
if (tags.length > 0) {
  syncTags(req.roomDb!, 'asset_tags', 'asset_id', id, tags)
}
```

Remove `extra.tags` from stored extra (strip it):

```typescript
delete extra.tags
```

Update the response to use `toAssetWithTags`.

- [ ] **Step 4: Update PATCH to handle category + tags via junction**

In PATCH handler (line 144-206):

- Add category update support:

```typescript
if (body.category !== undefined) {
  if (!VALID_CATEGORIES.includes(body.category as string)) {
    res.status(400).json({ error: `Invalid category` })
    return
  }
  updates.push('category = ?')
  params.push(body.category)
}
```

- Replace tags JSON update (lines 165-168) with syncTags call:

```typescript
// Handle tags via junction table (after SQL UPDATE)
if (body.tags !== undefined) {
  syncTags(req.roomDb!, 'asset_tags', 'asset_id', req.params.id, body.tags as string[])
}
```

Move the `tags` handling to AFTER the UPDATE statement, not inside it. The `updates.length === 0` early return needs to also check `body.tags !== undefined`.

Update response to use `toAssetWithTags`.

- [ ] **Step 5: Update reorder handler**

In reorder handler (line 136-141), update response to use `toAssetWithTags`.

- [ ] **Step 6: Commit**

```bash
git add server/routes/assets.ts
git commit -m "refactor(assets): use category column + junction table for tags (#137)"
```

---

## Task 5: Adapt blueprints routes for junction table

**Files:**

- Modify: `server/routes/blueprints.ts`

- [ ] **Step 1: Update toBlueprint to use junction table**

Replace `toBlueprint` (line 13-15):

```typescript
import { syncTags, getTagNames } from '../tagHelpers'
import type Database from 'better-sqlite3'

function toBlueprintWithTags(db: Database.Database, row: Record<string, unknown>): Blueprint {
  const base = parseJsonFields(toCamel(row), 'defaults') as unknown as Blueprint
  ;(base as Record<string, unknown>).tags = getTagNames(
    db,
    'blueprint_tags',
    'blueprint_id',
    row.id as string,
  )
  return base
}
```

- [ ] **Step 2: Update from-upload (POST /blueprints/from-upload)**

In the from-upload handler (line 34-123):

- Remove `tags` from blueprint INSERT SQL (line 84):

```sql
INSERT INTO blueprints (id, name, image_url, defaults, created_at) VALUES (?, ?, ?, ?, ?)
```

- After transaction, call syncTags for the blueprint:

```typescript
const parsedTags: string[] = body.tags
  ? JSON.parse(typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags))
  : []
if (parsedTags.length > 0) {
  syncTags(req.roomDb!, 'blueprint_tags', 'blueprint_id', blueprintId, parsedTags)
}
```

- Update asset INSERT to use `category: 'token'` (since blueprints are always tokens):

```sql
INSERT INTO assets (id, url, name, media_type, category, created_at, extra) VALUES (?, ?, ?, 'image', 'token', ?, '{}')
```

- Update response to use `toAssetWithTags` and `toBlueprintWithTags`.

- [ ] **Step 3: Update POST /blueprints**

Remove `tags` from INSERT SQL (line 135). After insert, call syncTags. Update response to use `toBlueprintWithTags`.

- [ ] **Step 4: Update PATCH /blueprints/:id**

Replace tags JSON update (lines 170-172) with:

```typescript
// Handle tags after SQL UPDATE
if (body.tags !== undefined) {
  syncTags(req.roomDb!, 'blueprint_tags', 'blueprint_id', req.params.id, body.tags as string[])
}
```

Early return check: `if (updates.length === 0 && body.tags === undefined)`.
Update response to use `toBlueprintWithTags`.

- [ ] **Step 5: Commit**

```bash
git add server/routes/blueprints.ts
git commit -m "refactor(blueprints): use junction table for tags (#137)"
```

---

## Task 6: Adapt bundle route + client types

**Files:**

- Modify: `server/routes/bundle.ts`
- Modify: `src/shared/assetTypes.ts`
- Modify: `src/shared/storeTypes.ts`
- Modify: `src/shared/bundleTypes.ts`

- [ ] **Step 1: Update bundle.ts**

Add imports:

```typescript
import { getTagNames, getAllTags } from '../tagHelpers'
```

Update assets mapping (lines 37-42): replace `parseJsonFields(toCamel(r), 'extra', 'tags')` with:

```typescript
const assets = (
  roomDb.prepare('SELECT * FROM assets ORDER BY sort_order ASC, created_at DESC').all() as Record<
    string,
    unknown
  >[]
).map((r) => {
  const base = parseJsonFields(toCamel(r), 'extra')
  base.tags = getTagNames(roomDb, 'asset_tags', 'asset_id', r.id as string)
  return base
})
```

Update blueprints mapping (lines 71-76): replace `parseJsonFields(toCamel(r), 'defaults', 'tags')` with:

```typescript
const blueprints = (
  roomDb.prepare('SELECT * FROM blueprints ORDER BY created_at DESC').all() as Record<
    string,
    unknown
  >[]
).map((r) => {
  const base = parseJsonFields(toCamel(r), 'defaults')
  base.tags = getTagNames(roomDb, 'blueprint_tags', 'blueprint_id', r.id as string)
  return base
})
```

Add `allTags` query and include in return:

```typescript
const allTags = getAllTags(roomDb)
// In the return object inside the transaction:
return { /* ...existing fields... */ tags: allTags }
```

In the outer return (line 106-123), add: `tags: data.tags`.

- [ ] **Step 2: Update assetTypes.ts**

Replace contents:

```typescript
export type AssetCategory = 'map' | 'token'

export interface TagMeta {
  id: string
  name: string
  color: string | null
  sortOrder: number
  createdAt: number
}

export interface AssetMeta {
  id: string
  url: string
  name: string
  mediaType: 'image' | 'handout'
  category: AssetCategory
  tags: string[]
  sortOrder: number
  width?: number
  height?: number
  createdAt: number
  handout?: {
    title: string
    description: string
  }
}
```

Key changes: removed `AUTO_TAGS`, added `AssetCategory`, `TagMeta`, added `category` field to `AssetMeta`.

- [ ] **Step 3: Update storeTypes.ts**

Add `category` and `tags` to `AssetRecord` (line 60-68):

```typescript
export interface AssetRecord {
  id: string
  url: string
  name: string
  mediaType: string
  category: string
  tags: string[]
  sortOrder: number
  createdAt: number
  extra: Record<string, unknown>
}
```

- [ ] **Step 4: Update bundleTypes.ts**

Add import and field:

```typescript
import type { TagMeta } from './assetTypes'
```

Add `tags: TagMeta[]` to `BundleResponse`.

- [ ] **Step 5: Commit**

```bash
git add server/routes/bundle.ts src/shared/assetTypes.ts src/shared/storeTypes.ts src/shared/bundleTypes.ts
git commit -m "refactor(bundle): return tags list and join tag names for assets/blueprints (#137)"
```

---

## Task 7: Client upload functions — add category param

**Files:**

- Modify: `src/shared/assetUpload.ts`

- [ ] **Step 1: Update uploadAsset function**

In `uploadAsset` (line 74-110):

- Add `category` and `tags` to meta parameter:

```typescript
export async function uploadAsset(
  file: File,
  meta?: {
    name?: string
    mediaType?: string
    category?: string
    tags?: string[]
    extra?: Record<string, unknown>
  },
): Promise<{
  id: string
  url: string
  name: string
  mediaType: string
  category: string
  tags: string[]
  createdAt: number
  extra: Record<string, unknown>
}>
```

- Add FormData appends:

```typescript
if (meta?.category) formData.append('category', meta.category)
if (meta?.tags) formData.append('tags', JSON.stringify(meta.tags))
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/assetUpload.ts
git commit -m "feat(upload): support category and tags fields in asset upload (#137)"
```

---

## Task 8: Store — tags slice, normalizeAsset, socket events

**Files:**

- Modify: `src/stores/worldStore.ts`

- [ ] **Step 1: Add TagMeta import and tags state**

Add to imports:

```typescript
import type { AssetMeta, TagMeta } from '../shared/assetTypes'
```

Add `tags: TagMeta[]` to `WorldState` interface.
Add `tags: []` to initial state and `_reset`.

- [ ] **Step 2: Update normalizeAsset to include category**

In `normalizeAsset` (lines 238-254), add category extraction:

```typescript
category: (raw.category as AssetMeta['category'] | undefined) || 'map',
```

- [ ] **Step 3: Update loadAll to include tags**

In `loadAll` (line 270), add:

```typescript
tags: bundle.tags,
```

- [ ] **Step 4: Add tag socket event listeners**

In `registerSocketEvents`, after blueprint events (line ~480), add:

```typescript
// ── Tag events ──
socket.on('tag:created', (tag) => {
  set((s) => ({ tags: [...s.tags, tag as TagMeta] }))
})
socket.on('tag:updated', (tag) => {
  set((s) => ({
    tags: s.tags.map((t) => (t.id === (tag as TagMeta).id ? (tag as TagMeta) : t)),
  }))
})
socket.on('tag:deleted', ({ id }: { id: string }) => {
  set((s) => ({ tags: s.tags.filter((t) => t.id !== id) }))
})
```

Add the three event names to `WS_EVENTS` array.

- [ ] **Step 5: Update uploadAsset action**

In `uploadAsset` action (line 952-962), change from packing tags into `extra` to passing directly:

```typescript
uploadAsset: async (file, meta) => {
  const result = await uploadAssetFile(file, {
    name: meta.name || file.name,
    mediaType: meta.mediaType || 'image',
    category: meta.category,
    tags: meta.tags,
  })
  return normalizeAsset(result as unknown as Record<string, unknown>)
},
```

Update the `uploadAsset` type signature in WorldState to include `category`:

```typescript
uploadAsset: (
  file: File,
  meta: { name?: string; mediaType?: string; category?: string; tags?: string[] },
) => Promise<AssetMeta>
```

- [ ] **Step 6: Commit**

```bash
git add src/stores/worldStore.ts
git commit -m "feat(store): add tags slice with socket events and category support (#137)"
```

---

## Task 9: Client UI — remove AUTO_TAGS, use category for filtering

**Files:**

- Modify: `src/asset-picker/assetPickerUtils.ts`
- Modify: `src/ui/CategoryTabs.tsx`
- Modify: `src/ui/TagFilterBar.tsx`
- Modify: `src/ui/TagEditorPopover.tsx`
- Modify: `src/asset-picker/AssetPickerPanel.tsx`
- Modify: `src/asset-picker/AssetGrid.tsx`
- Modify: `src/asset-picker/AssetGridItem.tsx`

- [ ] **Step 1: Update assetPickerUtils.ts**

Remove `AUTO_TAGS` import. Update `filterAssets` category filter (line 45-48):

```typescript
if (opts.category) {
  const cat = opts.category
  result = result.filter((a) => a.category === cat) // was: a.tags.includes(cat)
}
```

Update `collectUserTags` (line 61-69) — no longer need to exclude AUTO_TAGS:

```typescript
export function collectUserTags(assets: AssetMeta[]): string[] {
  const tags = new Set<string>()
  for (const a of assets) {
    for (const tag of a.tags) {
      tags.add(tag)
    }
  }
  return Array.from(tags).sort()
}
```

Update `filterUserTags` (line 105-107) — tags are all user tags now:

```typescript
export function filterUserTags(tags: string[]): string[] {
  return tags // No filtering needed — all tags are user-defined now
}
```

Update `computeSuggestions` (line 110-120) — remove AUTO_TAGS filter:

```typescript
export function computeSuggestions(
  knownTags: string[],
  currentTags: string[],
  input: string,
): string[] {
  const q = input.trim().toLowerCase()
  return knownTags
    .filter((t) => !currentTags.includes(t))
    .filter((t) => !q || t.toLowerCase().includes(q))
}
```

Update `shouldShowCreateOption` (line 123-128) — remove AUTO_TAGS check:

```typescript
export function shouldShowCreateOption(input: string, allKnownTags: string[]): boolean {
  const q = input.trim()
  if (!q) return false
  return !allKnownTags.some((t) => t.toLowerCase() === q.toLowerCase())
}
```

- [ ] **Step 2: Update CategoryTabs.tsx — remove "All" button**

Replace CategoryTabs component. Remove the "All" button, default active to first category:

```typescript
import type { ReactNode } from 'react'

interface CategoryTabsProps {
  categories: Array<{ key: string; label: string }>
  active: string
  onSelect: (key: string) => void
  trailing?: ReactNode
}

export function CategoryTabs({ categories, active, onSelect, trailing }: CategoryTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border-glass/30 pb-1">
      {categories.map((cat) => (
        <button
          key={cat.key}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            active === cat.key
              ? 'text-text-primary border-b-2 border-accent'
              : 'text-text-muted hover:text-text-primary'
          }`}
          onClick={() => {
            onSelect(cat.key)
          }}
        >
          {cat.label}
        </button>
      ))}
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  )
}
```

Key changes: `active` is now `string` (not `string | null`), `onSelect` takes `string` (not `string | null`), no "All" button.

- [ ] **Step 2b: Update TagFilterBar.tsx — remove "All" button from category layer**

In `TagFilterBar.tsx` lines 39-50, the category tabs section has an "All" button. Remove it and update the `onCategoryChange` type. Change `activeCategory` prop type from `string | null` to `string`, and `onCategoryChange` from `(category: string | null) => void` to `(category: string) => void`.

Remove the "All" button (lines 39-50):

```typescript
{categories && categories.length > 0 && onCategoryChange && (
  <div className="flex items-center gap-3 border-b border-border-glass/20 px-1">
    {categories.map((cat) => (
      <button
        key={cat}
        onClick={() => {
          onCategoryChange(cat)
        }}
        className={`text-[11px] pb-1.5 cursor-pointer transition-colors duration-fast capitalize ${
          activeCategory === cat
            ? 'text-text-primary border-b-2 border-accent -mb-px'
            : 'text-text-muted/50 hover:text-text-muted/70'
        }`}
      >
        {t(`asset.category_${cat}`, `${cat}s`)}
      </button>
    ))}
    {categoryTrailing && (
      <>
        <div className="flex-1" />
        {categoryTrailing}
      </>
    )}
  </div>
)}
```

Update interface:

```typescript
activeCategory?: string
onCategoryChange?: (category: string) => void
```

- [ ] **Step 2c: Update AssetGridItem.tsx — remove AUTO_TAGS**

In `AssetGridItem.tsx` line 9, remove `AUTO_TAGS` import. At line 92, change:

```typescript
// OLD: const userTags = asset.tags.filter((tag) => !AUTO_TAGS.includes(tag))
// NEW:
const userTags = asset.tags
```

- [ ] **Step 3: Update AssetPickerPanel.tsx**

Change `activeCategory` initial state from `null` to `'map'`:

```typescript
const [activeCategory, setActiveCategory] = useState<string>('map')
```

Update `effectiveAutoTags` — since category is always set, this simplifies:

```typescript
const effectiveAutoTags = useMemo(() => {
  if (autoTags) return autoTags
  return undefined // Tags are separate from category now
}, [autoTags])
```

The upload in AssetGrid now uses `category` directly (see next step).

Update `CategoryTabs` usage — `active` is now `string`, `onSelect` takes `string`:

```typescript
<CategoryTabs
  categories={CATEGORIES}
  active={activeCategory}
  onSelect={(cat) => {
    setActiveCategory(cat)
    setSelectedTags([])
  }}
  ...
/>
```

Pass `activeCategory` to AssetGrid as a new prop for upload:

```typescript
<AssetGrid
  assets={filteredAssets}
  mode={mode}
  autoTags={effectiveAutoTags}
  category={activeCategory}
  onSelect={handleSelect}
  ...
/>
```

- [ ] **Step 4: Update AssetGrid.tsx — pass category on upload**

Add `category` prop to `AssetGridProps`:

```typescript
interface AssetGridProps {
  // ... existing
  category: string
}
```

In `handleUpload`, pass `category`:

```typescript
const asset = await uploadAsset(file, {
  name: file.name.replace(/\.[^.]+$/, ''),
  mediaType: 'image',
  category,
  tags: autoTags,
})
```

- [ ] **Step 5: Update TagEditorPopover.tsx — remove AUTO_TAGS**

Remove `AUTO_TAGS` import. Update `autoTagsOnItem` computation — no longer needed since all tags are user tags:

```typescript
// Remove: const autoTagsOnItem = useMemo(() => tags.filter((t) => AUTO_TAGS.includes(t)), [tags])

// Update addTag — remove AUTO_TAGS check:
const addTag = (tag: string) => {
  const trimmed = tag.trim()
  if (!trimmed || tags.includes(trimmed)) return
  onTagsChange([...tags, trimmed])
  setInput('')
}

// Update removeTag — simpler without auto-tags preservation:
const removeTag = (tag: string) => {
  onTagsChange(tags.filter((t) => t !== tag))
}

// Update userTags — all tags are user tags:
const userTags = tags // was: filterUserTags(tags)
```

- [ ] **Step 6: Commit**

```bash
git add src/asset-picker/assetPickerUtils.ts src/ui/CategoryTabs.tsx src/ui/TagFilterBar.tsx src/ui/TagEditorPopover.tsx src/asset-picker/AssetPickerPanel.tsx src/asset-picker/AssetGrid.tsx src/asset-picker/AssetGridItem.tsx
git commit -m "refactor(ui): use category field for classification, remove AUTO_TAGS (#137)"
```

---

## Task 10: Dock tabs — use category for filtering/upload

**Files:**

- Modify: `src/dock/MapDockTab.tsx`
- Modify: `src/dock/BlueprintDockTab.tsx`

- [ ] **Step 1: Update MapDockTab.tsx**

Remove `AUTO_TAGS` import (line 6).

Update asset filter (line 39-41):

```typescript
const assets = useMemo(
  () => allAssets.filter((a) => a.mediaType === 'image' && a.category === 'map'),
  [allAssets],
)
```

Update `availableTags` — no AUTO_TAGS filtering (lines 44-52):

```typescript
const availableTags = useMemo(() => {
  const used = new Set<string>()
  for (const a of assets) {
    for (const t of a.tags) {
      used.add(t)
    }
  }
  return Array.from(used).sort()
}, [assets])
```

Update upload call (line 67):

```typescript
await upload(file, { mediaType: 'image', category: 'map' })
```

- [ ] **Step 2: Update BlueprintDockTab.tsx**

Remove `AUTO_TAGS` import (line 13).

Update `availableTags` — no AUTO_TAGS filtering (lines 64-72):

```typescript
const availableTags = useMemo(() => {
  const used = new Set<string>()
  for (const bp of blueprints) {
    for (const t of bp.tags) {
      used.add(t)
    }
  }
  return Array.from(used).sort()
}, [blueprints])
```

Upload call (line 47) already uses `tags: ['token']` but needs `category: 'token'` instead:

```typescript
await uploadAndCreateBlueprint(file, {
  name: file.name,
  defaults: { color: '#3b82f6', width: 1, height: 1 },
})
```

Note: The `tags: ['token']` is removed — `category: 'token'` is set on the asset inside the `from-upload` route (Task 5 Step 2). Blueprint tags should only contain user-defined tags.

- [ ] **Step 3: Commit**

```bash
git add src/dock/MapDockTab.tsx src/dock/BlueprintDockTab.tsx
git commit -m "refactor(dock): use category for filtering, remove AUTO_TAGS (#137)"
```

---

## Task 11: Tests — asset tagging + tag CRUD

**Files:**

- Rewrite: `server/__tests__/scenarios/asset-tagging.test.ts`
- Create: `server/__tests__/scenarios/tag-crud.test.ts`
- Update: `server/__tests__/scenarios/blueprint-from-upload.test.ts`

- [ ] **Step 1: Rewrite asset-tagging.test.ts**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('asset-tagging-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Asset Tagging (category + junction table)', () => {
  let assetId: string

  it('upload with category and tags', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['test'], { type: 'image/png' }), 'map.png')
    formData.append('mediaType', 'image')
    formData.append('category', 'map')
    formData.append('tags', JSON.stringify(['forest', 'cave']))

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.category).toBe('map')
    expect(data.tags).toEqual(expect.arrayContaining(['forest', 'cave']))
    assetId = data.id as string
  })

  it('category defaults to map', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['test'], { type: 'image/png' }), 'default.png')
    formData.append('mediaType', 'image')

    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    const data = (await res.json()) as Record<string, unknown>
    expect(data.category).toBe('map')
    expect(data.tags).toEqual([])
  })

  it('filters by category', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets?category=map`)
    const list = data as Record<string, unknown>[]
    expect(list.every((a) => a.category === 'map')).toBe(true)
  })

  it('PATCH updates tags via junction table', async () => {
    const { data, status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/${assetId}`, {
      tags: ['forest', 'dungeon'],
    })
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).tags).toEqual(
      expect.arrayContaining(['forest', 'dungeon']),
    )
  })

  it('PATCH updates category', async () => {
    const { data, status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/${assetId}`, {
      category: 'token',
    })
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).category).toBe('token')
  })

  it('tags are auto-created in tags table', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tags`)
    const tags = data as Record<string, unknown>[]
    const names = tags.map((t) => t.name)
    expect(names).toContain('forest')
    expect(names).toContain('dungeon')
  })
})
```

- [ ] **Step 2: Create tag-crud.test.ts**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('tag-crud-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Tag CRUD', () => {
  let tagId: string

  it('creates a tag', async () => {
    const { data, status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tags`, {
      name: '  Forest  ',
    })
    expect(status).toBe(201)
    const tag = data as Record<string, unknown>
    expect(tag.name).toBe('forest') // normalized
    tagId = tag.id as string
  })

  it('rejects duplicate tag name', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tags`, {
      name: 'FOREST', // case-insensitive dup
    })
    expect(status).toBe(409)
  })

  it('lists all tags', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tags`)
    const tags = data as Record<string, unknown>[]
    expect(tags.length).toBeGreaterThanOrEqual(1)
    expect(tags.some((t) => t.name === 'forest')).toBe(true)
  })

  it('renames a tag', async () => {
    const { data, status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tags/${tagId}`, {
      name: 'Woodland',
    })
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).name).toBe('woodland')
  })

  it('rename propagates to assets', async () => {
    // Upload asset with old tag, then rename should reflect
    const formData = new FormData()
    formData.append('file', new Blob(['x'], { type: 'image/png' }), 'test.png')
    formData.append('tags', JSON.stringify(['woodland']))
    const res = await fetch(`${ctx.apiBase}/api/rooms/${ctx.roomId}/assets`, {
      method: 'POST',
      body: formData,
    })
    const asset = (await res.json()) as Record<string, unknown>
    expect(asset.tags).toContain('woodland')

    // Rename the tag
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tags/${tagId}`, { name: 'Enchanted' })

    // Fetch asset again — should have new tag name
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets`)
    const assets = data as Record<string, unknown>[]
    const updated = assets.find((a) => a.id === asset.id)
    expect(updated).toBeDefined()
    expect(updated!.tags).toContain('enchanted')
  })

  it('deletes a tag', async () => {
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/tags/${tagId}`)
    expect(status).toBe(204)

    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/tags`)
    const tags = data as Record<string, unknown>[]
    expect(tags.some((t) => t.id === tagId)).toBe(false)
  })
})
```

- [ ] **Step 3: Update blueprint-from-upload.test.ts**

Update the test assertion for tags to expect lowercase (since `normalizeTagName` lowercases). The blueprint tags test (line 34) asserts `['Beast']` — change to `['beast']`:

```typescript
expect(bp.tags).toEqual(['beast'])
```

Also the asset created by from-upload should have `category: 'token'`.

- [ ] **Step 4: Run all tests**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT-tag-redesign && npx vitest run
```

- [ ] **Step 5: Run TypeScript + ESLint checks**

```bash
npx tsc -b --noEmit && npx eslint .
```

- [ ] **Step 6: Commit**

```bash
git add server/__tests__/scenarios/asset-tagging.test.ts server/__tests__/scenarios/tag-crud.test.ts server/__tests__/scenarios/blueprint-from-upload.test.ts
git commit -m "test: rewrite asset tagging + add tag CRUD integration tests (#137)"
```

---

## Task 12: Fix remaining AUTO_TAGS references + test updates + final cleanup

**Files:**

- Modify: `src/asset-picker/__tests__/assetPickerUtils.test.ts` — remove AUTO_TAGS-specific test cases (lines 167, 262, 278)
- Modify: `src/gm/__tests__/entity-filtering.test.ts` — replace local `AUTO_TAGS` constant (line 218) with `category` field filtering
- Modify: `src/stores/__tests__/worldStore.test.ts` — add `category: 'map'` and `tags: []` to `makeAsset` helper if present
- Any other files still importing `AUTO_TAGS`

- [ ] **Step 1: Search for remaining AUTO_TAGS references**

```bash
grep -rn 'AUTO_TAGS' src/
```

Fix ALL remaining references — `AUTO_TAGS` no longer exists.

- [ ] **Step 2: Update assetPickerUtils.test.ts**

Remove or rewrite tests that assert AUTO_TAGS exclusion behavior:

- `'excludes AUTO_TAGS (map, token, portrait)'` → tags are all user tags now, remove this test
- `'removes AUTO_TAGS'` in filterUserTags → `filterUserTags` is now identity, update accordingly
- `'excludes AUTO_TAGS and current tags'` in computeSuggestions → remove AUTO_TAGS assertion

- [ ] **Step 3: Update entity-filtering.test.ts**

Replace the local `AUTO_TAGS` constant (line 218) and `tags.includes(category)` logic (line 265) with `category` field filtering: `a.category === category`.

- [ ] **Step 4: Update worldStore.test.ts**

If `makeAsset` helper exists, add `category: 'map'` and `tags: []` to match the updated `AssetRecord`/`AssetMeta` types. Also update `normalizeAsset` JSDoc in worldStore.ts — remove `extra.tags` reference.

- [ ] **Step 5: Run full verification**

```bash
npx tsc -b --noEmit && npx eslint . && npx vitest run
```

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore: remove remaining AUTO_TAGS references, update tests (#137)"
```

---

## Verification Checklist

After all tasks, verify:

1. `npx tsc -b --noEmit` — TypeScript clean
2. `npx eslint .` — ESLint clean
3. `npx vitest run` — All tests pass
4. `./scripts/preview start feat/tag-system-redesign` — Manual verification:
   - Upload map → appears in Gallery tab, `category: 'map'`
   - Upload token blueprint → appears in Blueprints tab, `category: 'token'`
   - Add user tag to asset via TagEditorPopover → tag created in tags table
   - Rename tag via API → all assets reflect new name
   - Delete tag → junction rows cascade deleted
   - AssetPickerPanel shows Maps/Tokens tabs (no "All")
   - TagFilterBar shows only user tags (no `map`/`token`/`portrait`)
