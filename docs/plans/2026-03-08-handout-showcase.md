# Handout Showcase Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** GM can upload images to a handout asset library in the BottomDock, package them with title/description, and one-click showcase them to all players.

**Architecture:** New `handout_assets` Yjs Map stores the library. A new "Handouts" tab in BottomDock displays the grid. An edit modal handles both upload-packaging and later editing. Clicking a card pushes a ShowcaseItem to the existing showcase system.

**Tech Stack:** React, Yjs (Y.Map), existing uploadAsset() utility, existing useShowcase hook.

---

### Task 1: Handout Asset Yjs Hook

**Files:**
- Create: `src/dock/useHandoutAssets.ts`

**Step 1: Create the hook**

Following the exact pattern from `src/yjs/useScenes.ts` and `src/combat/useTokenLibrary.ts`:

```typescript
import { useEffect, useState } from 'react'
import * as Y from 'yjs'

export interface HandoutAsset {
  id: string
  title: string
  imageUrl: string
  description: string
  createdAt: number
}

function readAssets(yMap: Y.Map<HandoutAsset>): HandoutAsset[] {
  const items: HandoutAsset[] = []
  yMap.forEach((item) => items.push(item))
  items.sort((a, b) => a.createdAt - b.createdAt)
  return items
}

export function useHandoutAssets(yDoc: Y.Doc) {
  const yHandouts = yDoc.getMap<HandoutAsset>('handout_assets')
  const [assets, setAssets] = useState<HandoutAsset[]>(() => readAssets(yHandouts))

  useEffect(() => {
    setAssets(readAssets(yHandouts))
    const observer = () => setAssets(readAssets(yHandouts))
    yHandouts.observe(observer)
    return () => yHandouts.unobserve(observer)
  }, [yHandouts])

  const addAsset = (asset: HandoutAsset) => {
    yHandouts.set(asset.id, asset)
  }

  const updateAsset = (id: string, updates: Partial<HandoutAsset>) => {
    const existing = yHandouts.get(id)
    if (existing) {
      yHandouts.set(id, { ...existing, ...updates })
    }
  }

  const deleteAsset = (id: string) => {
    yHandouts.delete(id)
  }

  return { assets, addAsset, updateAsset, deleteAsset }
}
```

**Step 2: Commit**

```bash
git add src/dock/useHandoutAssets.ts
git commit -m "feat: add useHandoutAssets Yjs hook for handout asset library"
```

---

### Task 2: Handout Edit Modal

**Files:**
- Create: `src/dock/HandoutEditModal.tsx`

**Step 1: Create the modal component**

Dark glass modal, fixed overlay. Used for both post-upload packaging and later editing. Props:

```typescript
import { useState } from 'react'

interface HandoutEditModalProps {
  imageUrl: string
  initialTitle: string
  initialDescription: string
  onConfirm: (title: string, description: string) => void
  onCancel: () => void
}

export function HandoutEditModal({
  imageUrl,
  initialTitle,
  initialDescription,
  onConfirm,
  onCancel,
}: HandoutEditModalProps) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)

  const handleSubmit = () => {
    onConfirm(title.trim() || 'Untitled', description.trim())
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: 'rgba(15, 15, 25, 0.95)',
        backdropFilter: 'blur(20px)',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
        width: 400,
        maxHeight: '80vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
      }}>
        {/* Image preview */}
        <img
          src={imageUrl}
          alt="Preview"
          style={{
            width: '100%',
            maxHeight: 240,
            objectFit: 'contain',
            background: 'rgba(0,0,0,0.3)',
          }}
        />

        {/* Form fields */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                color: '#fff',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={3}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.6)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'sans-serif',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'sans-serif',
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/dock/HandoutEditModal.tsx
git commit -m "feat: add HandoutEditModal component for handout packaging"
```

---

### Task 3: Handout Dock Tab

**Files:**
- Create: `src/dock/HandoutDockTab.tsx`

**Step 1: Create the tab component**

Grid layout following MapDockTab pattern. Click = showcase, hover = edit/delete buttons. Upload triggers modal.

```typescript
import { useRef, useState } from 'react'
import type { HandoutAsset } from './useHandoutAssets'
import { uploadAsset } from '../shared/assetUpload'
import { generateTokenId } from '../combat/combatUtils'
import { HandoutEditModal } from './HandoutEditModal'

interface HandoutDockTabProps {
  assets: HandoutAsset[]
  onAddAsset: (asset: HandoutAsset) => void
  onUpdateAsset: (id: string, updates: Partial<HandoutAsset>) => void
  onDeleteAsset: (id: string) => void
  onShowcase: (asset: HandoutAsset) => void
}

export function HandoutDockTab({
  assets,
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
  onShowcase,
}: HandoutDockTabProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Modal state: 'upload' for new, 'edit' for existing
  const [modal, setModal] = useState<
    | { mode: 'upload'; imageUrl: string; fileName: string }
    | { mode: 'edit'; asset: HandoutAsset }
    | null
  >(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const imageUrl = await uploadAsset(file)
      const fileName = file.name.replace(/\.[^.]+$/, '')
      setModal({ mode: 'upload', imageUrl, fileName })
    } finally {
      setUploading(false)
    }
  }

  const handleModalConfirm = (title: string, description: string) => {
    if (modal?.mode === 'upload') {
      const asset: HandoutAsset = {
        id: generateTokenId(),
        title,
        imageUrl: modal.imageUrl,
        description,
        createdAt: Date.now(),
      }
      onAddAsset(asset)
    } else if (modal?.mode === 'edit') {
      onUpdateAsset(modal.asset.id, { title, description })
    }
    setModal(null)
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
        gap: 8,
      }}>
        {assets.map((asset) => {
          const isHovered = hoveredId === asset.id
          return (
            <div
              key={asset.id}
              style={{
                position: 'relative',
                cursor: 'pointer',
                borderRadius: 8,
                overflow: 'hidden',
                border: '2px solid rgba(255,255,255,0.08)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onClick={() => onShowcase(asset)}
              onMouseEnter={() => setHoveredId(asset.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <img
                src={asset.imageUrl}
                alt={asset.title}
                style={{
                  width: '100%',
                  height: 70,
                  objectFit: 'cover',
                  display: 'block',
                }}
                draggable={false}
              />
              <div style={{
                padding: '4px 6px',
                fontSize: 10,
                color: 'rgba(255,255,255,0.6)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                background: 'rgba(0,0,0,0.3)',
              }}>
                {asset.title || 'Untitled'}
              </div>

              {/* Edit button on hover */}
              {isHovered && (
                <button
                  onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', asset }) }}
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >✎</button>
              )}

              {/* Delete button on hover */}
              {isHovered && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteAsset(asset.id) }}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#f87171',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    padding: 0,
                  }}
                >×</button>
              )}
            </div>
          )
        })}

        {/* Upload card */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            height: 70 + 24,
            borderRadius: 8,
            border: '2px dashed rgba(255,255,255,0.15)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: 'rgba(255,255,255,0.3)',
            fontSize: 20,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.3)'
          }}
        >
          {uploading ? (
            <span style={{ fontSize: 11 }}>Uploading...</span>
          ) : (
            <>
              <span>+</span>
              <span style={{ fontSize: 10 }}>Add Handout</span>
            </>
          )}
        </div>
      </div>

      {/* Edit / Upload-packaging modal */}
      {modal && (
        <HandoutEditModal
          imageUrl={modal.mode === 'upload' ? modal.imageUrl : modal.asset.imageUrl}
          initialTitle={modal.mode === 'upload' ? modal.fileName : modal.asset.title}
          initialDescription={modal.mode === 'upload' ? '' : modal.asset.description}
          onConfirm={handleModalConfirm}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/dock/HandoutDockTab.tsx
git commit -m "feat: add HandoutDockTab component with grid, upload, edit, showcase"
```

---

### Task 4: Integrate into BottomDock and App

**Files:**
- Modify: `src/dock/BottomDock.tsx`
- Modify: `src/App.tsx`

**Step 1: Update BottomDock**

Add `'handouts'` to TabId, add new props, add tab button + content rendering.

Changes to `BottomDock.tsx`:

1. Import HandoutDockTab and HandoutAsset type:
```typescript
import { HandoutDockTab } from './HandoutDockTab'
import type { HandoutAsset } from './useHandoutAssets'
```

2. Extend TabId:
```typescript
type TabId = 'maps' | 'tokens' | 'handouts'
```

3. Add props to BottomDockProps interface:
```typescript
  handoutAssets: HandoutAsset[]
  onAddHandoutAsset: (asset: HandoutAsset) => void
  onUpdateHandoutAsset: (id: string, updates: Partial<HandoutAsset>) => void
  onDeleteHandoutAsset: (id: string) => void
  onShowcaseHandout: (asset: HandoutAsset) => void
```

4. Destructure new props in the function signature.

5. Add content rendering after tokens tab (inside the expanded content area):
```typescript
{activeTab === 'handouts' && (
  <HandoutDockTab
    assets={handoutAssets}
    onAddAsset={onAddHandoutAsset}
    onUpdateAsset={onUpdateHandoutAsset}
    onDeleteAsset={onDeleteHandoutAsset}
    onShowcase={onShowcaseHandout}
  />
)}
```

6. Add Handouts tab button after Tokens button (before selectedToken actions):
```typescript
<button onClick={() => toggleTab('handouts')} style={tabBtnStyle(activeTab === 'handouts')}>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
  Handouts
</button>
```

**Step 2: Update App.tsx**

1. Import useHandoutAssets:
```typescript
import { useHandoutAssets } from './dock/useHandoutAssets'
```

2. Call the hook (after existing hooks near line 37):
```typescript
const { assets: handoutAssets, addAsset: addHandoutAsset, updateAsset: updateHandoutAsset, deleteAsset: deleteHandoutAsset } = useHandoutAssets(yDoc)
```

3. Add a handler to convert HandoutAsset → ShowcaseItem and push to showcase:
```typescript
const handleShowcaseHandout = (asset: HandoutAsset) => {
  const item: ShowcaseItem = {
    id: generateTokenId(),
    type: 'handout',
    title: asset.title,
    description: asset.description,
    imageUrl: asset.imageUrl,
    senderId: mySeatId!,
    senderName: mySeat.name,
    senderColor: mySeat.color,
    ephemeral: false,
    timestamp: Date.now(),
  }
  addShowcaseItem(item)
}
```

4. Pass new props to BottomDock:
```typescript
<BottomDock
  // ...existing props...
  handoutAssets={handoutAssets}
  onAddHandoutAsset={addHandoutAsset}
  onUpdateHandoutAsset={updateHandoutAsset}
  onDeleteHandoutAsset={deleteHandoutAsset}
  onShowcaseHandout={handleShowcaseHandout}
/>
```

**Step 3: Commit**

```bash
git add src/dock/BottomDock.tsx src/App.tsx
git commit -m "feat: integrate handout tab into BottomDock with showcase trigger"
```

---

### Task 5: Clean up test harness

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/gm/GmToolbar.tsx` (if showcase test buttons should be removed)

**Step 1: Remove test showcase buttons from GmToolbar**

The `handleShowcaseTest` and `testShowcaseItems` array in App.tsx, plus the `onShowcaseTest` / `onShowcaseClear` props on GmToolbar, were for dev testing. Now that we have real handout showcase flow, remove these.

- Remove `testShowcaseItems`, `handleShowcaseTest`, `testCounterRef` from App.tsx
- Remove `onShowcaseTest` and `onShowcaseClear` props from GmToolbar component
- Keep the `clearShowcase` hook result — it's still used by the showcase Delete button

**Step 2: Commit**

```bash
git add src/App.tsx src/gm/GmToolbar.tsx
git commit -m "chore: remove showcase test harness (replaced by handout dock)"
```

---

### Task 6: Verify & manual test

**Step 1: Run dev server**

```bash
npm run dev
```

**Step 2: Manual test checklist**

- [ ] BottomDock shows 3 tabs: Maps, Tokens, Handouts
- [ ] Click "Add Handout" → file picker opens
- [ ] After selecting image → edit modal appears with image preview, pre-filled title
- [ ] Confirm → handout appears in grid
- [ ] Hover card → edit (pencil) and delete (×) buttons appear
- [ ] Click edit → modal opens with existing data pre-filled
- [ ] Click card → ShowcaseOverlay shows the image with entrance animation
- [ ] Showcase shows title + description correctly
- [ ] Delete card → removed from grid
- [ ] Multiple handouts display correctly in grid
- [ ] All Yjs data syncs across multiple browser tabs

**Step 3: Final commit (if any fixes needed)**
