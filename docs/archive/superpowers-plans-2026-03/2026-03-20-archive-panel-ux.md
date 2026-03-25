# Archive Panel UX Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Archive panel UX with map-background cards, a "clear map" action, and better load-confirm styling.

**Architecture:** Three changes to ArchivePanel.tsx: (1) archive rows become cards with `mapUrl` as `background-image` + dark gradient overlay, (2) new "clear map" button in the bottom action bar with Popover confirmation, (3) load confirmation button changes from `bg-danger` to `bg-accent`. Server needs one new route `POST /tactical/clear` and store needs a `clearTactical()` action.

**Tech Stack:** React, Tailwind CSS, Radix Popover, Lucide icons, Express, better-sqlite3

---

### Task 1: Server — `POST /tactical/clear` route

Clears all tactical tokens + resets map for the active scene. Follows the same pattern as `POST /tactical/exit` but also deletes tokens and resets map fields.

**Files:**

- Modify: `server/routes/tactical.ts` (add route after `/tactical/exit`)
- Test: `server/__tests__/scenarios/tactical-mode.test.ts`

- [ ] **Step 1: Write failing integration test**

Add to `server/__tests__/scenarios/tactical-mode.test.ts`:

```ts
it('POST /tactical/clear removes all tokens and resets map', async () => {
  // Setup: enter tactical, add a token, set map
  await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/enter`)
  await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/tokens/quick`, {
    x: 5,
    y: 5,
    name: 'Goblin',
    color: '#ff0000',
  })
  await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/tactical`, {
    mapUrl: '/uploads/test-map.png',
    mapWidth: 1000,
    mapHeight: 800,
  })

  // Act
  const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/tactical/clear`)
  expect(status).toBe(200)

  // Assert: tokens empty, map cleared, still in tactical mode
  const result = data as { tokens: unknown[]; mapUrl: string | null; tacticalMode: number }
  expect(result.tokens).toHaveLength(0)
  expect(result.mapUrl).toBeNull()
  expect(result.tacticalMode).toBe(1) // stays in tactical mode
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/scenarios/tactical-mode.test.ts -t "POST /tactical/clear"`
Expected: FAIL (404 — route doesn't exist)

- [ ] **Step 3: Implement the route**

Add to `server/routes/tactical.ts`, after the `/tactical/exit` route (around line 164):

```ts
// POST /tactical/clear — remove all tokens + reset map, stay in tactical mode
router.post('/api/rooms/:roomId/tactical/clear', room, (req, res) => {
  const db = req.roomDb!
  const sceneId = getActiveSceneId(db)
  if (!sceneId) {
    res.status(404).json({ error: 'No active scene' })
    return
  }

  const doClear = db.transaction(() => {
    // Delete orphan ephemeral entities (tactical-only, not in any scene)
    const orphans = db
      .prepare(
        `SELECT e.id FROM entities e
         JOIN tactical_tokens t ON t.entity_id = e.id
         WHERE t.scene_id = ? AND e.lifecycle = 'ephemeral'
           AND NOT EXISTS (SELECT 1 FROM scene_entities se WHERE se.entity_id = e.id)`,
      )
      .all(sceneId) as { id: string }[]

    // Delete all tactical tokens for this scene
    db.prepare('DELETE FROM tactical_tokens WHERE scene_id = ?').run(sceneId)

    // Delete orphan entities
    const deleteEntity = db.prepare('DELETE FROM entities WHERE id = ?')
    for (const { id } of orphans) {
      deleteEntity.run(id)
    }

    // Reset map fields (keep tactical_mode as-is)
    db.prepare(
      `UPDATE tactical_state
       SET map_url = NULL, map_width = NULL, map_height = NULL,
           round_number = 0, current_turn_token_id = NULL
       WHERE scene_id = ?`,
    ).run(sceneId)

    return orphans.map((o) => o.id)
  })
  const orphanIds = doClear()

  // Emit entity:deleted for orphans
  for (const id of orphanIds) {
    io.to(req.roomId!).emit('entity:deleted', { id })
  }

  // Emit updated tactical state
  const state = getTacticalState(db, sceneId)
  if (state) {
    io.to(req.roomId!).emit('tactical:updated', state)
  }
  res.json(state)
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/scenarios/tactical-mode.test.ts -t "POST /tactical/clear"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/tactical.ts server/__tests__/scenarios/tactical-mode.test.ts
git commit -m "feat: add POST /tactical/clear route"
```

---

### Task 2: Store — `clearTactical()` action

**Files:**

- Modify: `src/stores/worldStore.ts` (add action after `exitTactical`)
- Test: `src/stores/__tests__/worldStore.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/stores/__tests__/worldStore.test.ts` near the `exitTactical` test:

```ts
it('clearTactical calls POST /api/rooms/{roomId}/tactical/clear', async () => {
  await useWorldStore.getState().clearTactical()

  const { url, method } = getLastFetchCall()
  expect(url).toContain(`/api/rooms/${ROOM_ID}/tactical/clear`)
  expect(method).toBe('POST')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/__tests__/worldStore.test.ts -t "clearTactical"`
Expected: FAIL (clearTactical is not a function)

- [ ] **Step 3: Add clearTactical to the store**

In `src/stores/worldStore.ts`, add the type to the store interface (near `exitTactical`):

```ts
clearTactical: () => Promise<void>
```

Add the implementation after `exitTactical`:

```ts
clearTactical: async () => {
  const roomId = get()._roomId
  if (!roomId) return
  await api.post(`/api/rooms/${roomId}/tactical/clear`)
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/__tests__/worldStore.test.ts -t "clearTactical"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/worldStore.ts src/stores/__tests__/worldStore.test.ts
git commit -m "feat: add clearTactical store action"
```

---

### Task 3: i18n — Add "clear map" keys

**Files:**

- Modify: `public/locales/en/gm.json`
- Modify: `public/locales/zh-CN/gm.json`

- [ ] **Step 1: Add English keys**

Add to the `archive` section in `public/locales/en/gm.json`:

```json
"clear_map": "Clear map",
"clear_map_confirm": "Clear current battlefield? All tokens and the map background will be removed."
```

- [ ] **Step 2: Add Chinese keys**

Add to the `archive` section in `public/locales/zh-CN/gm.json`:

```json
"clear_map": "清空地图",
"clear_map_confirm": "确定清空当前战场？所有 token 和地图背景将被移除。"
```

- [ ] **Step 3: Commit**

```bash
git add public/locales/en/gm.json public/locales/zh-CN/gm.json
git commit -m "feat: add clear-map i18n keys"
```

---

### Task 4: ArchivePanel — Map-background cards + clear button + load-confirm restyle

This is the main UI task. Three changes in one file.

**Files:**

- Modify: `src/gm/ArchivePanel.tsx`

- [ ] **Step 1: Add `Eraser` import and `clearTactical` store binding**

At the top of `ArchivePanel.tsx`:

Add `Eraser` to the lucide-react import line.

Inside the component, add store binding:

```tsx
const clearTactical = useWorldStore((s) => s.clearTactical)
```

Add state for clear confirm popover:

```tsx
const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
```

- [ ] **Step 2: Restyle archive rows as map-background cards**

Replace the archive row outer `<div>` (the one starting at the `sortedArchives.map` callback, with `className` containing `rounded-md px-2.5 py-2`) with a card that uses `mapUrl` as background:

```tsx
<div
  key={archive.id}
  onClick={() => {
    setSelectedId(isSelected ? null : archive.id)
  }}
  className={`relative rounded-lg overflow-hidden cursor-pointer transition-all duration-fast group ${
    isSelected
      ? 'ring-2 ring-accent'
      : 'ring-1 ring-border-glass hover:ring-accent/40'
  }`}
  style={
    archive.mapUrl
      ? {
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.7)), url(${archive.mapUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : undefined
  }
>
  <div className={`px-2.5 py-2 ${archive.mapUrl ? 'min-h-[56px] flex flex-col justify-end' : 'bg-surface/40'}`}>
    <div className="flex items-center gap-2">
      {/* Name or rename input — keep existing code */}
      {renamingId === archive.id ? (
        /* ... existing rename input unchanged ... */
      ) : (
        <span className={`flex-1 text-xs truncate ${archive.mapUrl ? 'text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-text-primary'}`}>
          {archive.name}
        </span>
      )}

      {/* Remove the 🗺 emoji indicator — the map background IS the indicator */}

      {/* ⋮ Dropdown menu — keep existing code unchanged */}
    </div>
  </div>
</div>
```

Key styling decisions:

- Cards with `mapUrl`: dark gradient overlay, white text with `drop-shadow` for readability
- Cards without `mapUrl`: `bg-surface/40` fallback
- Selected: `ring-2 ring-accent` replaces old `bg-accent/15 border`
- `min-h-[56px]` when has map for visual presence
- The `🗺` emoji indicator is removed — the background image itself communicates this

- [ ] **Step 3: Change load confirmation button from danger to accent**

Find the load confirmation button (the one with `data-testid="confirm-action"` inside the load Popover, around line 280):

Change:

```tsx
className =
  'text-[11px] text-white bg-danger px-2.5 py-1 rounded hover:bg-danger/80 cursor-pointer transition-colors duration-fast'
```

To:

```tsx
className =
  'text-[11px] text-white bg-accent px-2.5 py-1 rounded hover:bg-accent-bold cursor-pointer transition-colors duration-fast'
```

- [ ] **Step 4: Add "Clear map" button with Popover confirmation in bottom action bar**

In the bottom action bar `<div>`, add after the "Save new" button block and before `<div className="flex-1" />`:

```tsx
<Popover.Root open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
  <Popover.Trigger asChild>
    <button
      data-testid="archive-clear-map"
      onClick={() => {
        setClearConfirmOpen(true)
      }}
      className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary px-2 py-1 rounded hover:bg-surface/60 cursor-pointer transition-colors duration-fast"
      title={t('archive.clear_map')}
    >
      <Eraser size={12} strokeWidth={1.5} />
      {t('archive.clear_map')}
    </button>
  </Popover.Trigger>
  <PopoverContent side="top" align="center" className="min-w-[140px]">
    <p className="text-xs text-text-primary mb-2.5">{t('archive.clear_map_confirm')}</p>
    <div className="flex justify-end gap-2">
      <button
        data-testid="confirm-cancel"
        onClick={() => {
          setClearConfirmOpen(false)
        }}
        className="text-[11px] text-text-muted px-2 py-1 rounded hover:bg-hover cursor-pointer transition-colors duration-fast"
      >
        {t('cancel', { ns: 'ui' })}
      </button>
      <button
        data-testid="confirm-action"
        onClick={async () => {
          setClearConfirmOpen(false)
          try {
            await clearTactical()
            toast('success', t('archive.clear_map'))
          } catch (err) {
            console.error('Clear tactical failed:', err)
            toast('error', t('archive.clear_map'))
          }
        }}
        className="text-[11px] text-white bg-danger px-2.5 py-1 rounded hover:bg-danger/80 cursor-pointer transition-colors duration-fast"
      >
        {t('confirm_default', { ns: 'ui' })}
      </button>
    </div>
  </PopoverContent>
</Popover.Root>
```

Note: "Clear map" confirm button intentionally uses `bg-danger` — this IS destructive (unlike load, which is reversible via re-loading an archive).

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/gm/ArchivePanel.tsx
git commit -m "feat: archive panel map-background cards, clear-map button, accent load-confirm"
```

---

### Task 5: Manual Verification

- [ ] **Step 1: Start preview**

Run: `./scripts/preview start feat/archive-panel-ux`

- [ ] **Step 2: Verify card rendering**

1. Open GM sidebar → Archives tab
2. Create an archive while a tactical map is set → card should show map as background with dark gradient
3. Create an archive without a map → card should show `bg-surface/40` fallback
4. Selected card should have gold/blue ring border
5. Text on map cards should be white with shadow, readable against any map image

- [ ] **Step 3: Verify clear map**

1. Set up a tactical map with tokens
2. Click "Clear map" → confirmation popover should appear
3. Confirm → tokens and map should be removed, tactical mode stays active
4. Verify other connected clients see the clear via Socket.io broadcast

- [ ] **Step 4: Verify load confirm styling**

1. Select an archive → click "Load"
2. Confirm button should be accent-colored (gold/blue), not red

- [ ] **Step 5: Stop preview**

Run: `./scripts/preview stop`
