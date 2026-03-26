# Asset Media Type Rename + Auto-Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `assets.type` → `media_type` across the full stack, fix tags storage, add auto-tagging on upload, and improve MapDockTab filtering to separate maps from token images.

**Architecture:** Pure mechanical rename of `type` → `media_type` (SQL column + all TypeScript references), then fix the pre-existing bug where tags are stored in `extra.tags` JSON instead of the `tags` column, then add auto-tagging (MapDockTab → `map` tag, BlueprintDockTab → `token` tag) and tag-based filtering in MapDockTab.

**Tech Stack:** SQLite, Express, TypeScript, zustand, React, vitest

**Important:** The schema column rename (`type` → `media_type`) will break existing room.db files. This is fine — dev stage, no production data. Users delete old room.db and it gets recreated.

**Scope note:** `ShowcaseItem.type` (in `showcaseTypes.ts`, `App.tsx`, `PeekCard.tsx`, `FocusedCard.tsx`) is a **different** type field — it refers to showcase display mode (`'image' | 'handout' | 'text'`), NOT asset media type. Do NOT rename these.

---

## File Structure

| File                                                   | Action | Responsibility                                                        |
| ------------------------------------------------------ | ------ | --------------------------------------------------------------------- |
| `server/schema.ts:154`                                 | Modify | Rename column `type` → `media_type`                                   |
| `server/routes/assets.ts`                              | Modify | Rename all `type` refs, fix tags in INSERT/PATCH to use `tags` column |
| `src/shared/assetTypes.ts:5`                           | Modify | Rename `type` → `mediaType`                                           |
| `src/shared/storeTypes.ts:64`                          | Modify | Rename `type` → `mediaType` in AssetRecord                            |
| `src/shared/assetUpload.ts:38,43,51,68`                | Modify | Rename `type` → `mediaType` in params and return type                 |
| `src/stores/worldStore.ts:158,238,939`                 | Modify | Rename in action types, normalizeAsset, uploadAsset                   |
| `src/dock/MapDockTab.tsx:40,50`                        | Modify | Rename filter, add `map` tag on upload, tag-based filtering           |
| `src/dock/BlueprintDockTab.tsx:73`                     | Modify | Rename, add `token` tag on upload                                     |
| `server/__tests__/routes.test.ts`                      | Modify | Update `type` → `media_type` in assertions                            |
| `server/__tests__/scenarios/asset-roundtrip.test.ts`   | Modify | Update FormData field name                                            |
| `server/__tests__/scenarios/multi-client-sync.test.ts` | Modify | Update type assertions                                                |
| `src/stores/__tests__/worldStore.test.ts`              | Modify | Update mock data and assertions                                       |
| `server/__tests__/scenarios/asset-tagging.test.ts`     | Create | Integration test for auto-tagging and tag-based filtering             |

---

### Task 1: Schema + Server Routes Rename

Rename the SQL column and all server-side references. Also fix the pre-existing bug where tags go into `extra.tags` instead of the `tags` column.

**Files:**

- Modify: `server/schema.ts:154`
- Modify: `server/routes/assets.ts:29-31,85,94,130-132`

- [ ] **Step 1: Rename schema column**

In `server/schema.ts:154`, change:

```sql
type TEXT NOT NULL DEFAULT 'image',
```

to:

```sql
media_type TEXT NOT NULL DEFAULT 'image',
```

Also update the comment on line 149 from `-- Assets (unified: maps, tokens, handouts, blueprints)` to `-- Assets (file management)`.

- [ ] **Step 2: Update GET filter in assets.ts**

In `server/routes/assets.ts:29-31`, change:

```typescript
if (req.query.type) {
  query += ' AND type = ?'
  params.push(req.query.type)
}
```

to:

```typescript
if (req.query.mediaType) {
  query += ' AND media_type = ?'
  params.push(req.query.mediaType)
}
```

- [ ] **Step 3: Update POST handler — rename type + fix tags storage**

In `server/routes/assets.ts:85`, change:

```typescript
const assetType = (uploadBody.type as string) || 'image'
```

to:

```typescript
const mediaType = (uploadBody.mediaType as string) || 'image'
```

Add tags extraction after the `extra` parsing (after line 89):

```typescript
const tags = extra.tags ? JSON.stringify(extra.tags) : '[]'
```

In lines 93-96, change the INSERT to include `tags` column and use `media_type`:

```typescript
req
  .roomDb!.prepare(
    'INSERT INTO assets (id, url, name, media_type, tags, created_at, extra) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  .run(id, url, name, mediaType, tags, Date.now(), JSON.stringify(extra))
```

- [ ] **Step 4: Update PATCH handler — rename type + fix tags storage**

In `server/routes/assets.ts:130-133`, change:

```typescript
if (body.type !== undefined) {
  updates.push('type = ?')
  params.push(body.type)
}
```

to:

```typescript
if (body.mediaType !== undefined) {
  updates.push('media_type = ?')
  params.push(body.mediaType)
}
```

For tags (lines 138-141), change from storing in extra to storing in `tags` column:

```typescript
if (body.tags !== undefined) {
  updates.push('tags = ?')
  params.push(JSON.stringify(body.tags))
}
```

Remove the old `currentExtra.tags` assignment (the 3 lines at 138-141 that set `currentExtra.tags` and `extraChanged`). Tags now go in the `tags` column, not in `extra`.

- [ ] **Step 5: Run server tests to verify**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT-phase2-media-type && npx vitest run server/__tests__/routes.test.ts --reporter=verbose`

Expected: Some tests may fail because they reference old `type` field. That's expected — we fix tests in Task 6.

- [ ] **Step 6: Commit**

```bash
git add server/schema.ts server/routes/assets.ts
git commit -m "refactor: rename assets.type to media_type and fix tags column storage"
```

---

### Task 2: Shared Types Rename

Rename `type` → `mediaType` in all shared TypeScript type definitions.

**Files:**

- Modify: `src/shared/assetTypes.ts:5`
- Modify: `src/shared/storeTypes.ts:64`
- Modify: `src/shared/assetUpload.ts:38,43,51,68`

- [ ] **Step 1: Rename in AssetMeta**

In `src/shared/assetTypes.ts:5`, change:

```typescript
type: 'image' | 'handout'
```

to:

```typescript
mediaType: 'image' | 'handout'
```

- [ ] **Step 2: Rename in AssetRecord**

In `src/shared/storeTypes.ts:64`, change:

```typescript
type: string
```

to:

```typescript
mediaType: string
```

- [ ] **Step 3: Rename in assetUpload.ts**

In `src/shared/assetUpload.ts`, make these changes:

Line 38, parameter type:

```typescript
meta?: { name?: string; mediaType?: string; extra?: Record<string, unknown> },
```

Line 43, return type:

```typescript
mediaType: string
```

Line 51, formData append:

```typescript
if (meta?.mediaType) formData.append('mediaType', meta.mediaType)
```

Line 68, second return type:

```typescript
mediaType: string
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT-phase2-media-type && npx tsc --noEmit 2>&1 | head -30`

Expected: Errors in worldStore.ts, MapDockTab.tsx, BlueprintDockTab.tsx (they still use old `type`). These are fixed in Tasks 3 and 4.

- [ ] **Step 5: Commit**

```bash
git add src/shared/assetTypes.ts src/shared/storeTypes.ts src/shared/assetUpload.ts
git commit -m "refactor: rename type to mediaType in shared asset types"
```

---

### Task 3: Store Rename

Update worldStore.ts to use `mediaType` instead of `type`.

**Files:**

- Modify: `src/stores/worldStore.ts:158,238,239,939`

- [ ] **Step 1: Update uploadAsset action type signature**

In `src/stores/worldStore.ts:158`, change:

```typescript
type?: AssetMeta['type']
```

to:

```typescript
mediaType?: AssetMeta['mediaType']
```

- [ ] **Step 2: Update normalizeAsset function**

In `src/stores/worldStore.ts:238`, change:

```typescript
type: (raw.type as AssetMeta['type'] | undefined) || 'image',
```

to:

```typescript
mediaType: (raw.mediaType as AssetMeta['mediaType'] | undefined) || 'image',
```

Also in line 239, simplify tag reading now that tags are in the `tags` column:

```typescript
tags: (raw.tags as string[] | undefined) || [],
```

(Remove the `extra.tags` fallback — tags are now stored in the `tags` column, not in `extra`.)

- [ ] **Step 3: Update uploadAsset action**

In `src/stores/worldStore.ts:939`, change:

```typescript
type: meta.type || 'image',
```

to:

```typescript
mediaType: meta.mediaType || 'image',
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT-phase2-media-type && npx tsc --noEmit 2>&1 | head -30`

Expected: Errors in MapDockTab.tsx and BlueprintDockTab.tsx (fixed in Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/stores/worldStore.ts
git commit -m "refactor: rename type to mediaType in worldStore"
```

---

### Task 4: UI Rename + Auto-Tagging

Update MapDockTab and BlueprintDockTab to use `mediaType`, and add auto-tagging on upload.

**Files:**

- Modify: `src/dock/MapDockTab.tsx:40,50`
- Modify: `src/dock/BlueprintDockTab.tsx:73`

- [ ] **Step 1: Update MapDockTab — rename + auto-tag + tag-based filtering**

In `src/dock/MapDockTab.tsx:40`, change the filter from:

```typescript
const assets = useMemo(() => allAssets.filter((a) => a.type === 'image'), [allAssets])
```

to:

```typescript
const assets = useMemo(
  () => allAssets.filter((a) => a.mediaType === 'image' && a.tags.includes('map')),
  [allAssets],
)
```

In line 50, change the upload call to include `map` tag:

```typescript
await upload(file, { mediaType: 'image', tags: ['map'] })
```

- [ ] **Step 2: Update BlueprintDockTab — rename + auto-tag**

In `src/dock/BlueprintDockTab.tsx:71-73`, change:

```typescript
const asset = await uploadAsset(file, {
  name: file.name.replace(/\.[^.]+$/, ''),
  type: 'image',
})
```

to:

```typescript
const asset = await uploadAsset(file, {
  name: file.name.replace(/\.[^.]+$/, ''),
  mediaType: 'image',
  extra: { tags: ['token'] },
})
```

Note: BlueprintDockTab calls `uploadAsset` from `assetUpload.ts` directly (not the store action), so tags must go via `extra.tags` which the server extracts into the `tags` column (as fixed in Task 1 Step 3).

- [ ] **Step 3: Verify TypeScript compiles cleanly**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT-phase2-media-type && npx tsc --noEmit`

Expected: Clean (0 errors).

- [ ] **Step 4: Commit**

```bash
git add src/dock/MapDockTab.tsx src/dock/BlueprintDockTab.tsx
git commit -m "feat: auto-tag uploads and filter maps by tag"
```

---

### Task 5: Update Tests

Update all test files to use `mediaType` instead of `type`, and add a new integration test for auto-tagging.

**Files:**

- Modify: `server/__tests__/routes.test.ts:339,343,380,385`
- Modify: `server/__tests__/scenarios/asset-roundtrip.test.ts:22,32`
- Modify: `server/__tests__/scenarios/multi-client-sync.test.ts:167,175`
- Modify: `src/stores/__tests__/worldStore.test.ts:13,668,1068,1105-1106,1116,1128-1129,1140`
- Create: `server/__tests__/scenarios/asset-tagging.test.ts`

- [ ] **Step 1: Update routes.test.ts**

Change all asset `type` references to `media_type` (server-side uses snake_case column name, but the `toAsset` helper converts to camelCase `mediaType` in response):

Line 339: `type: 'image'` → `mediaType: 'image'`
Line 343: `expect(data.type).toBe('image')` → `expect(data.mediaType).toBe('image')`
Line 380: `.field('type', 'image')` → `.field('mediaType', 'image')`
Line 385: `expect(uploadRes.body.type).toBe('image')` → `expect(uploadRes.body.mediaType).toBe('image')`

- [ ] **Step 2: Update asset-roundtrip.test.ts**

Line 22: `formData.append('type', 'image')` → `formData.append('mediaType', 'image')`
Line 32: `expect(data.type).toBe('image')` → `expect(data.mediaType).toBe('image')`

- [ ] **Step 3: Update multi-client-sync.test.ts**

Line 167: `type: 'image'` → `mediaType: 'image'`
Line 175: `expect(payload.type).toBe('image')` → `expect(payload.mediaType).toBe('image')`

- [ ] **Step 4: Update worldStore.test.ts**

Line 13: `type: 'image'` → `mediaType: 'image'` (in asset fixture)
Line 668: `type: 'blueprint'` → remove or change to `mediaType: 'image'` (blueprint type no longer exists in assets)
Line 1068: `type: 'blueprint'` → remove or change to `mediaType: 'image'`
Line 1106: `uploadAsset(file, { type: 'image', tags: ['tag1'] })` → `uploadAsset(file, { mediaType: 'image', tags: ['tag1'] })`
Line 1116: `type: 'image'` → `mediaType: 'image'`
Line 1129: `uploadAsset(file, { type: 'image' })` → `uploadAsset(file, { mediaType: 'image' })`
Line 1140: `type: 'image'` → `mediaType: 'image'`

Also check for any `type: 'image'` in mock asset objects and update them. Be careful NOT to change `type: 'text'` or `type: 'handout'` on ShowcaseItem mocks — those are different types.

- [ ] **Step 5: Write auto-tagging integration test**

Create `server/__tests__/scenarios/asset-tagging.test.ts`:

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

describe('Asset Tagging', () => {
  it('upload stores tags in tags column', async () => {
    const formData = new FormData()
    formData.append('file', new Blob(['test'], { type: 'image/png' }), 'map.png')
    formData.append('mediaType', 'image')
    formData.append('extra', JSON.stringify({ tags: ['map'] }))

    const { data, status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/assets`, formData)
    expect(status).toBe(201)
    const asset = data as Record<string, unknown>
    expect(asset.mediaType).toBe('image')
    expect(asset.tags).toEqual(['map'])
  })

  it('filters assets by mediaType query param', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets?mediaType=image`)
    const list = data as Record<string, unknown>[]
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((a) => a.mediaType === 'image')).toBe(true)
  })

  it('PATCH updates tags in tags column', async () => {
    // Get first asset
    const { data: listData } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/assets`)
    const list = listData as Record<string, unknown>[]
    const assetId = list[0]!.id as string

    const { data, status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/assets/${assetId}`, {
      tags: ['map', 'cave'],
    })
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).tags).toEqual(['map', 'cave'])
  })
})
```

- [ ] **Step 6: Run all tests**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT-phase2-media-type && npx vitest run --reporter=verbose 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/__tests__/ src/stores/__tests__/
git commit -m "test: update asset tests for mediaType rename and add tagging tests"
```

---

### Task 6: Lint + Build Verification

Final verification that everything compiles and passes all checks.

- [ ] **Step 1: Run full check suite**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT-phase2-media-type
npx prettier --check .
npx tsc --noEmit
npx vitest run
```

Expected: All pass.

- [ ] **Step 2: Run build**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT-phase2-media-type && npm run build
```

Expected: Build succeeds.
