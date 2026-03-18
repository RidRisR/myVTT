# AssetPicker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified AssetPicker dialog for browsing/uploading/managing assets, with drag-to-tag and sortable grid, plus unify Dock panel styles to single-row circular thumbnails.

**Architecture:** AssetPicker is a Radix Dialog with a single @dnd-kit DndContext supporting two drag types (tag-drop and sort-reorder). Backend adds sort_order column and batch reorder endpoint. Dock panels (Maps, Blueprints) are restyled to single-row horizontal scroll with circular thumbnails.

**Tech Stack:** React, @dnd-kit/core + @dnd-kit/sortable, Radix UI (Dialog, ContextMenu), zustand, Express, SQLite

**Spec:** `docs/design/14-AssetPicker统一资产选择组件.md`

---

## File Structure

| File                                               | Action | Responsibility                                   |
| -------------------------------------------------- | ------ | ------------------------------------------------ |
| `server/schema.ts`                                 | Modify | Add sort_order column to assets table            |
| `server/routes/assets.ts`                          | Modify | Add sortOrder to PATCH, add reorder endpoint     |
| `src/shared/storeTypes.ts`                         | Modify | Add sortOrder to AssetRecord                     |
| `src/shared/assetTypes.ts`                         | Modify | Add sortOrder to AssetMeta                       |
| `src/shared/socketEvents.ts`                       | Modify | Add asset:reordered event                        |
| `src/shared/assetApi.ts`                           | Modify | Add reorderAssets API helper                     |
| `src/stores/worldStore.ts`                         | Modify | Add reorderAssets action, handle asset:reordered |
| `src/asset-picker/AssetPickerDialog.tsx`           | Create | Dialog shell + DndContext + mode logic           |
| `src/asset-picker/AssetGrid.tsx`                   | Create | Sortable grid + upload card                      |
| `src/asset-picker/AssetGridItem.tsx`               | Create | Single card + ContextMenu + droppable            |
| `src/asset-picker/DraggableTag.tsx`                | Create | Draggable tag pill                               |
| `src/dock/MapDockTab.tsx`                          | Modify | Single-row circular layout + horizontal scroll   |
| `src/dock/BlueprintDockTab.tsx`                    | Modify | Single-row horizontal scroll                     |
| `src/layout/HamburgerMenu.tsx`                     | Modify | Add asset management menu item                   |
| `public/locales/en/dock.json`                      | Modify | Add maps + asset_library i18n keys               |
| `public/locales/zh-CN/dock.json`                   | Modify | Add maps + asset_library i18n keys               |
| `server/__tests__/scenarios/asset-reorder.test.ts` | Create | Reorder endpoint tests                           |

---

### Task 1: Backend — sort_order column and PATCH support

**Files:**

- Modify: `server/schema.ts:150-158`
- Modify: `server/routes/assets.ts:26-36, 114-172`
- Modify: `src/shared/storeTypes.ts:60-67`
- Test: `server/__tests__/routes.test.ts`

- [ ] **Step 1: Add sort_order to schema**

In `server/schema.ts`, add `sort_order` column to the assets CREATE TABLE:

```sql
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  name TEXT DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'image',
  tags TEXT DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  extra TEXT DEFAULT '{}'
);
```

- [ ] **Step 2: Update GET to order by sort_order**

In `server/routes/assets.ts`, change the GET handler's ORDER BY:

```typescript
query += ' ORDER BY sort_order ASC, created_at DESC'
```

- [ ] **Step 3: Add sortOrder to PATCH handler**

In the PATCH handler (`server/routes/assets.ts:114-172`), add after the `tags` handling:

```typescript
if (body.sortOrder !== undefined) {
  updates.push('sort_order = ?')
  params.push(body.sortOrder)
}
```

- [ ] **Step 4: Add sortOrder to AssetRecord type**

In `src/shared/storeTypes.ts`, add to AssetRecord:

```typescript
interface AssetRecord {
  id: string
  url: string
  name: string
  mediaType: string
  sortOrder: number
  createdAt: number
  extra: Record<string, unknown>
}
```

- [ ] **Step 5: Run existing tests**

Run: `npx vitest run server/__tests__/routes.test.ts`
Expected: PASS (schema change is backward compatible)

- [ ] **Step 6: Commit**

```bash
git add server/schema.ts server/routes/assets.ts src/shared/storeTypes.ts
git commit -m "feat: add sort_order column to assets table"
```

---

### Task 2: Backend — batch reorder endpoint

**Files:**

- Modify: `server/routes/assets.ts`
- Modify: `src/shared/socketEvents.ts:74-77`
- Create: `server/__tests__/scenarios/asset-reorder.test.ts`

- [ ] **Step 1: Write failing test for reorder endpoint**

Create `server/__tests__/scenarios/asset-reorder.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '../testEnv'

describe('Asset reorder', () => {
  let env: ReturnType<typeof createTestEnv> extends Promise<infer T> ? T : never
  let assets: { id: string }[]

  beforeAll(async () => {
    env = await createTestEnv()
    // Upload 3 test assets
    assets = []
    for (let i = 0; i < 3; i++) {
      const res = await env.uploadAsset(`test${i}.png`)
      assets.push(await res.json())
    }
  })

  afterAll(() => env?.cleanup())

  it('should batch reorder assets', async () => {
    const order = [
      { id: assets[2].id, sortOrder: 1000 },
      { id: assets[0].id, sortOrder: 2000 },
      { id: assets[1].id, sortOrder: 3000 },
    ]
    const res = await env.api('PATCH', `/api/rooms/${env.roomId}/assets/reorder`, { order })
    expect(res.status).toBe(200)

    // Verify order
    const listRes = await env.api('GET', `/api/rooms/${env.roomId}/assets`)
    const list = await listRes.json()
    expect(list[0].id).toBe(assets[2].id)
    expect(list[1].id).toBe(assets[0].id)
    expect(list[2].id).toBe(assets[1].id)
  })

  it('should return 400 for invalid order payload', async () => {
    const res = await env.api('PATCH', `/api/rooms/${env.roomId}/assets/reorder`, { order: 'bad' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/scenarios/asset-reorder.test.ts`
Expected: FAIL (route not found)

- [ ] **Step 3: Add asset:reordered to socket events**

In `src/shared/socketEvents.ts`, add to ServerToClientEvents:

```typescript
'asset:reordered': (assets: AssetRecord[]) => void
```

Update the server's `socketTypes.ts` accordingly.

- [ ] **Step 4: Implement reorder endpoint**

In `server/routes/assets.ts`, add before the DELETE handler:

```typescript
router.patch('/api/rooms/:roomId/assets/reorder', room, (req, res) => {
  const body = req.body as Record<string, unknown>
  const order = body.order
  if (!Array.isArray(order)) {
    res.status(400).json({ error: 'order must be an array' })
    return
  }

  const stmt = req.roomDb!.prepare('UPDATE assets SET sort_order = ? WHERE id = ?')
  const transaction = req.roomDb!.transaction((items: { id: string; sortOrder: number }[]) => {
    for (const item of items) {
      stmt.run(item.sortOrder, item.id)
    }
  })
  transaction(order as { id: string; sortOrder: number }[])

  const rows = req
    .roomDb!.prepare('SELECT * FROM assets ORDER BY sort_order ASC, created_at DESC')
    .all() as Record<string, unknown>[]
  const assets = rows.map(toAsset)
  io.to(req.roomId!).emit('asset:reordered', assets)
  res.json(assets)
})
```

**Important:** This route must be placed BEFORE the `/:id` PATCH route to avoid Express treating "reorder" as an `:id` parameter.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/__tests__/scenarios/asset-reorder.test.ts`
Expected: PASS

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add server/routes/assets.ts src/shared/socketEvents.ts server/socketTypes.ts server/__tests__/scenarios/asset-reorder.test.ts
git commit -m "feat: add batch reorder endpoint for assets"
```

---

### Task 3: Client store — reorderAssets action and sortOrder support

**Files:**

- Modify: `src/shared/assetTypes.ts:1-14`
- Modify: `src/shared/assetApi.ts`
- Modify: `src/stores/worldStore.ts:70, 438-451, 947-974`

- [ ] **Step 1: Add sortOrder to AssetMeta**

In `src/shared/assetTypes.ts`:

```typescript
export interface AssetMeta {
  id: string
  url: string
  name: string
  mediaType: 'image' | 'handout'
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

- [ ] **Step 2: Add reorderAssets API helper**

In `src/shared/assetApi.ts`, add:

```typescript
export async function reorderAssets(
  order: { id: string; sortOrder: number }[],
): Promise<AssetMeta[]> {
  const roomId = getCurrentRoomId()
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/assets/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ order }),
  })
  if (!res.ok) throw new Error(`Reorder failed: ${res.statusText}`)
  return (await res.json()) as AssetMeta[]
}
```

- [ ] **Step 3: Add reorderAssets to worldStore**

In `src/stores/worldStore.ts`, add the action interface (after removeAsset):

```typescript
reorderAssets: (order: { id: string; sortOrder: number }[]) => Promise<void>
```

Add the implementation (after softRemoveAsset implementation):

```typescript
reorderAssets: async (order) => {
  const result = await reorderAssetsApi(order)
  set({ assets: result })
},
```

- [ ] **Step 4: Add asset:reordered socket handler**

In worldStore.ts socket handlers (after `asset:deleted` handler):

```typescript
socket.on('asset:reordered', (assets) => {
  set({ assets })
})
```

- [ ] **Step 5: Update normalizeAsset to include sortOrder**

In the `normalizeAsset` function in worldStore.ts, ensure `sortOrder` is included in the returned object. Check the existing function and add `sortOrder: raw.sortOrder ?? 0`.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/assetTypes.ts src/shared/assetApi.ts src/stores/worldStore.ts
git commit -m "feat: add reorderAssets store action and sortOrder support"
```

---

### Task 4: Install @dnd-kit dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install @dnd-kit/core and @dnd-kit/sortable**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify build**

Run: `npx tsc -b --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit/core and @dnd-kit/sortable"
```

---

### Task 5: AssetPickerDialog component

**Files:**

- Create: `src/asset-picker/AssetPickerDialog.tsx`
- Create: `src/asset-picker/AssetGrid.tsx`
- Create: `src/asset-picker/AssetGridItem.tsx`
- Create: `src/asset-picker/DraggableTag.tsx`

This is the largest task. It creates all 4 AssetPicker files.

- [ ] **Step 1: Create DraggableTag component**

Create `src/asset-picker/DraggableTag.tsx`:

```tsx
import { useDraggable } from '@dnd-kit/core'

interface DraggableTagProps {
  tag: string
  selected: boolean
  onClick: () => void
}

export function DraggableTag({ tag, selected, onClick }: DraggableTagProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tag-${tag}`,
    data: { type: 'tag', tag },
  })

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[11px] cursor-grab whitespace-nowrap transition-colors duration-fast ${
        selected ? 'bg-accent text-white' : 'bg-glass text-text-muted hover:text-text-primary'
      } ${isDragging ? 'opacity-50' : ''}`}
      {...listeners}
      {...attributes}
    >
      {tag}
    </button>
  )
}
```

- [ ] **Step 2: Create AssetGridItem component**

Create `src/asset-picker/AssetGridItem.tsx`:

```tsx
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ContextMenuContent } from '../ui/primitives/ContextMenuContent'
import { ContextMenuItem } from '../ui/primitives/ContextMenuItem'
import { useTranslation } from 'react-i18next'
import type { AssetMeta } from '../shared/assetTypes'

interface AssetGridItemProps {
  asset: AssetMeta
  onClick?: () => void
  onRename: (id: string) => void
  onEditTags: (id: string) => void
  onDelete: (id: string) => void
}

export function AssetGridItem({
  asset,
  onClick,
  onRename,
  onEditTags,
  onDelete,
}: AssetGridItemProps) {
  const { t } = useTranslation('dock')
  const { isOver: isTagOver, setNodeRef: setDropRef } = useDroppable({
    id: `drop-${asset.id}`,
    data: { type: 'asset-drop-target', assetId: asset.id },
  })
  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: asset.id,
    data: { type: 'asset', assetId: asset.id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={(node) => {
            setSortRef(node)
            setDropRef(node)
          }}
          style={style}
          className="flex flex-col items-center gap-1 cursor-pointer"
          onClick={onClick}
          {...attributes}
          {...listeners}
        >
          <div
            className={`w-24 h-24 rounded-lg overflow-hidden transition-all duration-fast ${
              isTagOver
                ? 'ring-2 ring-accent shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                : 'border-2 border-transparent hover:scale-[1.03]'
            }`}
          >
            <img
              src={asset.url}
              alt={asset.name}
              className="w-full h-full object-cover block"
              draggable={false}
            />
          </div>
          <span className="text-[10px] text-text-muted/60 text-center overflow-hidden text-ellipsis whitespace-nowrap max-w-[96px]">
            {asset.name}
          </span>
        </div>
      </ContextMenu.Trigger>

      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onRename(asset.id)}>
          {t('asset.rename', 'Rename')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onEditTags(asset.id)}>
          {t('asset.edit_tags', 'Edit Tags')}
        </ContextMenuItem>
        <ContextMenuItem variant="danger" onSelect={() => onDelete(asset.id)}>
          {t('asset.delete', 'Delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu.Root>
  )
}
```

- [ ] **Step 3: Create AssetGrid component**

Create `src/asset-picker/AssetGrid.tsx`:

```tsx
import { useRef, useState, useMemo } from 'react'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorldStore } from '../stores/worldStore'
import { AssetGridItem } from './AssetGridItem'
import type { AssetMeta } from '../shared/assetTypes'

interface AssetGridProps {
  assets: AssetMeta[]
  mode: 'select' | 'manage'
  autoTags?: string[]
  onSelect?: (asset: AssetMeta) => void
  onRename: (id: string) => void
  onEditTags: (id: string) => void
  onDelete: (id: string) => void
}

export function AssetGrid({
  assets,
  mode,
  autoTags,
  onSelect,
  onRename,
  onEditTags,
  onDelete,
}: AssetGridProps) {
  const { t } = useTranslation('dock')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const uploadAsset = useWorldStore((s) => s.uploadAsset)

  const sortableIds = useMemo(() => assets.map((a) => a.id), [assets])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const asset = await uploadAsset(file, {
        name: file.name.replace(/\.[^.]+$/, ''),
        mediaType: 'image',
        tags: autoTags,
      })
      if (mode === 'select' && onSelect) {
        onSelect(asset)
      }
    } finally {
      setUploading(false)
    }
  }

  const handleClick = (asset: AssetMeta) => {
    if (mode === 'select' && onSelect) {
      onSelect(asset)
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleUpload(e)}
      />

      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div
          className="grid gap-3 max-h-[320px] overflow-y-auto p-1"
          style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
        >
          {/* Upload card — first position */}
          <div
            onClick={() => fileRef.current?.click()}
            className="w-24 h-24 border-2 border-dashed border-border-glass rounded-lg cursor-pointer flex flex-col items-center justify-center text-text-muted/30 transition-colors duration-fast hover:border-text-muted/30 hover:text-text-muted/50 mx-auto"
          >
            {uploading ? (
              <span className="text-xs">...</span>
            ) : (
              <>
                <Plus size={22} strokeWidth={1.5} />
                <span className="text-[10px] mt-1">{t('asset.upload', 'Upload')}</span>
              </>
            )}
          </div>

          {assets.map((asset) => (
            <AssetGridItem
              key={asset.id}
              asset={asset}
              onClick={() => handleClick(asset)}
              onRename={onRename}
              onEditTags={onEditTags}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </>
  )
}
```

- [ ] **Step 4: Create AssetPickerDialog component**

Create `src/asset-picker/AssetPickerDialog.tsx`:

```tsx
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { X } from 'lucide-react'
import { DialogContent } from '../ui/primitives/DialogContent'
import { useWorldStore } from '../stores/worldStore'
import { DraggableTag } from './DraggableTag'
import { AssetGrid } from './AssetGrid'
import type { AssetMeta } from '../shared/assetTypes'

interface AssetPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'select' | 'manage'
  filter?: { mediaType?: string }
  autoTags?: string[]
  onSelect?: (asset: AssetMeta) => void
}

export function AssetPickerDialog({
  open,
  onOpenChange,
  mode,
  filter,
  autoTags,
  onSelect,
}: AssetPickerProps) {
  const { t } = useTranslation('dock')
  const allAssets = useWorldStore((s) => s.assets)
  const updateAsset = useWorldStore((s) => s.updateAsset)
  const removeAsset = useWorldStore((s) => s.removeAsset)
  const reorderAssets = useWorldStore((s) => s.reorderAssets)

  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [draggedTag, setDraggedTag] = useState<string | null>(null)

  // Filter assets
  const filteredAssets = useMemo(() => {
    let result = allAssets
    if (filter?.mediaType) {
      result = result.filter((a) => a.mediaType === filter.mediaType)
    }
    if (selectedTags.length > 0) {
      result = result.filter((a) => selectedTags.every((t) => a.tags.includes(t)))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((a) => a.name.toLowerCase().includes(q))
    }
    return result
  }, [allAssets, filter, selectedTags, search])

  // Collect available tags
  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    for (const a of allAssets) {
      for (const tag of a.tags) tags.add(tag)
    }
    return Array.from(tags)
  }, [allAssets])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleSelect = useCallback(
    (asset: AssetMeta) => {
      if (onSelect) onSelect(asset)
      onOpenChange(false)
    },
    [onSelect, onOpenChange],
  )

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current
    if (data?.type === 'tag') {
      setDraggedTag(data.tag as string)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedTag(null)
    const { active, over } = event
    if (!over) return

    const activeData = active.data.current
    const overData = over.data.current

    // Tag drop onto asset
    if (activeData?.type === 'tag' && overData?.type === 'asset-drop-target') {
      const tag = activeData.tag as string
      const assetId = overData.assetId as string
      const asset = allAssets.find((a) => a.id === assetId)
      if (asset && !asset.tags.includes(tag)) {
        void updateAsset(assetId, { tags: [...asset.tags, tag] })
      }
      return
    }

    // Sortable reorder
    if (activeData?.type === 'asset' && active.id !== over.id) {
      const oldIndex = filteredAssets.findIndex((a) => a.id === active.id)
      const newIndex = filteredAssets.findIndex((a) => a.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(filteredAssets, oldIndex, newIndex)
        const GAP = 1000
        const order = reordered.map((a, i) => ({ id: a.id, sortOrder: (i + 1) * GAP }))
        void reorderAssets(order)
      }
    }
  }

  const handleDelete = (id: string) => {
    void removeAsset(id)
  }

  const handleRename = (id: string) => {
    const asset = allAssets.find((a) => a.id === id)
    if (!asset) return
    const name = prompt(t('asset.rename_prompt', 'New name:'), asset.name)
    if (name && name.trim()) {
      void updateAsset(id, { name: name.trim() })
    }
  }

  const handleEditTags = (id: string) => {
    const asset = allAssets.find((a) => a.id === id)
    if (!asset) return
    const input = prompt(t('asset.tags_prompt', 'Tags (comma separated):'), asset.tags.join(', '))
    if (input !== null) {
      const tags = input
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      void updateAsset(id, { tags })
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] w-[90vw]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Dialog.Title className="text-base font-semibold text-text-primary">
            {mode === 'select'
              ? t('asset.select_title', 'Select Image')
              : t('asset.manage_title', 'Asset Library')}
          </Dialog.Title>
          <Dialog.Close className="text-text-muted hover:text-text-primary cursor-pointer">
            <X size={16} strokeWidth={1.5} />
          </Dialog.Close>
        </div>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Tag filter + search */}
          <div className="flex gap-1.5 mb-3 items-center overflow-x-auto">
            <button
              onClick={() => setSelectedTags([])}
              className={`px-3 py-1 rounded-full text-[11px] whitespace-nowrap transition-colors duration-fast cursor-pointer ${
                selectedTags.length === 0
                  ? 'bg-accent text-white'
                  : 'bg-glass text-text-muted hover:text-text-primary'
              }`}
            >
              {t('asset.all', 'All')}
            </button>
            {availableTags.map((tag) => (
              <DraggableTag
                key={tag}
                tag={tag}
                selected={selectedTags.includes(tag)}
                onClick={() =>
                  setSelectedTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }
              />
            ))}
            <div className="flex-1" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('asset.search', 'Search...')}
              className="bg-glass border border-border-glass rounded-md px-2.5 py-1 text-[11px] text-text-primary placeholder:text-text-muted/30 outline-none w-32"
            />
          </div>

          {/* Grid */}
          <AssetGrid
            assets={filteredAssets}
            mode={mode}
            autoTags={autoTags}
            onSelect={handleSelect}
            onRename={handleRename}
            onEditTags={handleEditTags}
            onDelete={handleDelete}
          />

          {/* Drag overlay for tags */}
          <DragOverlay>
            {draggedTag ? (
              <span className="px-3 py-1 rounded-full text-[11px] bg-accent text-white shadow-lg">
                {draggedTag}
              </span>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Footer hint */}
        <p className="text-[10px] text-text-muted/25 text-center mt-3">
          {mode === 'select'
            ? t('asset.hint_select', 'Click to select · Right-click to manage · Drag tags to label')
            : t(
                'asset.hint_manage',
                'Right-click to manage · Drag tags to label · Drag to reorder',
              )}
        </p>
      </DialogContent>
    </Dialog.Root>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc -b --noEmit`
Expected: No errors related to asset-picker files

- [ ] **Step 6: Commit**

```bash
git add src/asset-picker/
git commit -m "feat: add AssetPicker dialog with DnD support"
```

---

### Task 6: Wire AssetPicker into BlueprintDockTab

**Files:**

- Modify: `src/dock/BlueprintDockTab.tsx`

- [ ] **Step 1: Replace direct file upload with AssetPicker**

In `BlueprintDockTab.tsx`, replace the direct `<input type="file">` upload flow with an AssetPicker in select mode. The upload card's `onClick` should open the AssetPicker dialog instead of a file input. When the user selects an asset, create a blueprint from it.

Key changes:

- Add `const [pickerOpen, setPickerOpen] = useState(false)` state
- Upload card click: `setPickerOpen(true)` instead of `fileRef.current?.click()`
- Add `<AssetPickerDialog>` with `mode="select"`, `filter={{ mediaType: 'image' }}`, `autoTags={['token']}`
- `onSelect` handler: create blueprint from selected asset (same logic as current `handleUpload` minus the upload step)

- [ ] **Step 2: Verify build**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/dock/BlueprintDockTab.tsx
git commit -m "feat: wire AssetPicker into blueprint creation flow"
```

---

### Task 7: Wire AssetPicker into CharacterEditPanel

**Files:**

- Modify: `src/layout/CharacterEditPanel.tsx`

- [ ] **Step 1: Replace direct file upload with AssetPicker**

In `CharacterEditPanel.tsx` (around line 175-189), replace the portrait click → file input flow with AssetPicker in select mode. When the user selects an asset, update `entity.imageUrl = asset.url`.

- [ ] **Step 2: Verify build**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/layout/CharacterEditPanel.tsx
git commit -m "feat: wire AssetPicker into character portrait selection"
```

---

### Task 8: Hamburger menu — asset management entry

**Files:**

- Modify: `src/layout/HamburgerMenu.tsx`
- Modify: `public/locales/en/dock.json`
- Modify: `public/locales/zh-CN/dock.json`

- [ ] **Step 1: Add i18n keys**

In `public/locales/en/dock.json`, add:

```json
"asset_library": "Asset Library"
```

In `public/locales/zh-CN/dock.json`, add:

```json
"asset_library": "资产库"
```

- [ ] **Step 2: Add AssetPicker to HamburgerMenu**

In `src/layout/HamburgerMenu.tsx`, add a new menu item after the theme toggle section. Import `AssetPickerDialog` and add state `const [assetPickerOpen, setAssetPickerOpen] = useState(false)`. Add a button that calls `setAssetPickerOpen(true)`, and render `<AssetPickerDialog mode="manage" open={assetPickerOpen} onOpenChange={setAssetPickerOpen} />`.

Only show this menu item when the user is GM (consistent with other GM-only features).

- [ ] **Step 3: Verify build**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/layout/HamburgerMenu.tsx public/locales/en/dock.json public/locales/zh-CN/dock.json
git commit -m "feat: add asset library entry in hamburger menu"
```

---

### Task 9: Dock panel — MapDockTab single-row circular layout

**Files:**

- Modify: `src/dock/MapDockTab.tsx`
- Modify: `public/locales/en/dock.json`
- Modify: `public/locales/zh-CN/dock.json`

- [ ] **Step 1: Update i18n keys for Maps rename**

In `public/locales/en/dock.json`, add/rename:

```json
"maps": "Maps"
```

In `public/locales/zh-CN/dock.json`:

```json
"maps": "地图"
```

- [ ] **Step 2: Rename Gallery tab label**

In the parent component that renders the tab label (check `src/gm/GmDock.tsx`), change the tab label from `t('dock.gallery')` to `t('dock.maps')`. Update the `data-testid` from `dock-tab-gallery` to `dock-tab-maps` (or keep for backward compat).

- [ ] **Step 3: Rewrite MapDockTab layout to single-row circular**

Change the grid layout in `MapDockTab.tsx` from the current multi-row square grid to a single-row horizontal scroll with circular thumbnails:

- Replace `gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))'` with `display: flex; overflow-x: auto; gap: 12px`
- Change square thumbnails to 56px circles (`w-14 h-14 rounded-full overflow-hidden`)
- Name label below each circle
- Upload card at the end (also circular)
- Keep the existing tag filter bar at the top
- Keep existing ContextMenu behavior

- [ ] **Step 4: Verify build**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/dock/MapDockTab.tsx src/gm/GmDock.tsx public/locales/en/dock.json public/locales/zh-CN/dock.json
git commit -m "refactor: MapDockTab to single-row circular layout and rename to Maps"
```

---

### Task 10: Dock panel — BlueprintDockTab single-row layout

**Files:**

- Modify: `src/dock/BlueprintDockTab.tsx`

- [ ] **Step 1: Change grid to single-row horizontal scroll**

In `BlueprintDockTab.tsx`, change the grid layout from `gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))'` to a flex row with horizontal scrolling:

- Replace grid container with `display: flex; overflow-x: auto; gap: 12px`
- Keep the existing circular token style (already 56px circles)
- Keep the existing tag filter bar
- Keep existing ContextMenu behavior

- [ ] **Step 2: Verify build**

Run: `npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/dock/BlueprintDockTab.tsx
git commit -m "refactor: BlueprintDockTab to single-row horizontal scroll"
```

---

### Task 11: Final integration test and cleanup

**Files:**

- All modified files

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Run linter**

Run: `npx eslint .`
Expected: No new errors

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "chore: final cleanup for AssetPicker feature"
```
