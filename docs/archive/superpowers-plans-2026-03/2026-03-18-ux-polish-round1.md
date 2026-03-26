# UX Polish Round 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 UX issues identified in the full-journey audit: sidebar defaults, empty scene guidance, Chinese→English text, random seat name, token spawn position, Team Dashboard empty state, Scene tab in sidebar, and SceneConfigPanel retirement.

**Architecture:** All changes are client-side React/zustand. No server or database changes. Each task is independent and can be committed separately. The Scene tab task (Task 7) has a dependency on Task 1 (uiStore type change).

**Tech Stack:** React, zustand, Tailwind CSS, Lucide icons

**Conventions:**

- Read `docs/conventions/ui-patterns.md` — Tailwind only, Lucide icons at strokeWidth 1.5
- Read `docs/conventions/store-actions.md` — store methods for API calls, components use single-line onClick
- All work happens in worktree at `/Users/zhonghanzhen/Desktop/proj/myVTT-ux-polish` on branch `feat/ux-polish`

---

## File Map

| File                                        | Action | Task | Purpose                                      |
| ------------------------------------------- | ------ | ---- | -------------------------------------------- |
| `src/stores/uiStore.ts`                     | Modify | 1, 6 | Add 'scene' to GmSidebarTab, change defaults |
| `src/scene/SceneViewer.tsx`                 | Modify | 2    | Fix empty scene state messaging              |
| `src/gm/GmDock.tsx`                         | Modify | 3    | Translate Chinese text to English            |
| `src/gm/GmSidebar.tsx`                      | Modify | 3, 7 | Translate labels, add Scene tab              |
| `src/dock/BlueprintDockTab.tsx`             | Modify | 3    | Translate preset tags and UI text            |
| `src/dock/CharacterLibraryTab.tsx`          | Modify | 3    | Translate UI text                            |
| `src/gm/EntityPanel.tsx`                    | Modify | 3    | Translate UI text                            |
| `src/gm/ArchivePanel.tsx`                   | Modify | 3    | Translate UI text                            |
| `src/dock/MapDockTab.tsx`                   | Modify | 3    | Translate toast text                         |
| `src/gm/EntityRow.tsx`                      | Modify | 3    | Translate UI text                            |
| `src/layout/PortraitBar.tsx`                | Modify | 3    | Translate UI text                            |
| `src/layout/HamburgerMenu.tsx`              | Modify | 3    | Translate UI text                            |
| `src/gm/__tests__/entity-filtering.test.ts` | Modify | 3    | Update test tags to match English            |
| `src/identity/SeatSelect.tsx`               | Modify | 4    | Add random name generator button             |
| `src/combat/KonvaMap.tsx`                   | Modify | 5    | (reference only — already uses click coords) |
| `src/gm/GmDock.tsx`                         | Modify | 5    | Change hardcoded 200,200 to canvas center    |
| `src/team/TeamDashboard.tsx`                | Modify | 6    | Default-collapse when no trackers            |
| `src/gm/SceneConfigSidebarTab.tsx`          | Create | 7    | Scene config content for sidebar             |
| `src/gm/SceneButton.tsx`                    | Modify | 8    | Remove SceneConfigPanel, keep SceneListPanel |
| `src/gm/SceneConfigPanel.tsx`               | Delete | 8    | Retired — content moved to sidebar tab       |

---

### Task 1: GM sidebar default to collapsed

**Files:**

- Modify: `src/stores/uiStore.ts:108-109`

- [ ] **Step 1: Change sidebar defaults**

In `src/stores/uiStore.ts`, change line 108-109:

```typescript
// Before:
gmSidebarTab: 'archives',
gmSidebarCollapsed: false,

// After:
gmSidebarTab: 'archives',
gmSidebarCollapsed: true,
```

- [ ] **Step 2: Verify in browser**

Open the preview at http://localhost:5102, create a new room, join as GM. Sidebar should start collapsed (only the icon tab bar visible, content area hidden).

- [ ] **Step 3: Commit**

```bash
git add src/stores/uiStore.ts
git commit -m "fix(ui): default GM sidebar to collapsed on new room"
```

---

### Task 2: Fix empty scene state messaging

**Files:**

- Modify: `src/scene/SceneViewer.tsx:50-63`

- [ ] **Step 1: Update empty state UI**

In `src/scene/SceneViewer.tsx`, replace the empty-state block (lines 50-63). The current text "No scene selected" is misleading because a scene always exists — it just has no background image yet.

```tsx
// Before (lines 50-63):
if (!currentUrl) {
  return (
    <div
      onContextMenu={onContextMenu}
      className="w-screen h-screen flex items-center justify-center bg-deep relative"
    >
      {blurOverlay}
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Image size={32} strokeWidth={1} className="text-text-muted/40" />
        <p className="text-text-muted text-sm">No scene selected</p>
        <p className="text-text-muted/50 text-xs">Upload a scene from the asset dock</p>
      </div>
    </div>
  )
}

// After:
if (!currentUrl) {
  return (
    <div
      onContextMenu={onContextMenu}
      className="w-screen h-screen flex items-center justify-center bg-deep relative"
    >
      {blurOverlay}
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Image size={32} strokeWidth={1} className="text-text-muted/20" />
        {scene && <p className="text-text-muted/40 text-sm">{scene.name}</p>}
        <p className="text-text-muted/20 text-xs">Set a background from the Gallery tab</p>
      </div>
    </div>
  )
}
```

Key changes:

- Icon and text opacity reduced (these are hints, not calls to action)
- Shows scene name so user knows which scene they're on
- Text changed to "Set a background from the Gallery tab" — accurate guidance

- [ ] **Step 2: Verify in browser**

Create a new room → join as GM. The scene should show the scene name ("Scene 1") with subtle hint text, not the alarming "No scene selected".

- [ ] **Step 3: Commit**

```bash
git add src/scene/SceneViewer.tsx
git commit -m "fix(ui): replace misleading empty scene text with scene name and gallery hint"
```

---

### Task 3: Translate all Chinese UI text to English

**Files:**

- Modify: `src/gm/GmDock.tsx` (lines 121, 124, 242)
- Modify: `src/gm/GmSidebar.tsx` (lines 8, 9, 87)
- Modify: `src/dock/BlueprintDockTab.tsx` (lines 9, 83, 85, 213, 352, 382, 395, 410)
- Modify: `src/dock/CharacterLibraryTab.tsx` (lines 46, 82, 85, 118, 125, 136, 138, 165, 175)
- Modify: `src/gm/EntityPanel.tsx` (lines 99, 116, 181, 194, 210, 243, 254, 255, 261, 264-266, 276, 279)
- Modify: `src/gm/ArchivePanel.tsx` (lines 75, 78, 87, 103, 114, 126, 127, 207, 218, 230, 248, 251, 262, 265, 277, 280, 289-291, 305-307)

- [ ] **Step 1: Translate GmDock.tsx**

```
已删除Token → Token deleted
撤销 → Undo
蓝图 → Blueprints
```

- [ ] **Step 2: Translate GmSidebar.tsx**

```
存档 → Archives
实体 → Entities
展开侧边栏 → Expand sidebar
收起侧边栏 → Collapse sidebar
```

- [ ] **Step 3: Translate BlueprintDockTab.tsx**

```
PRESET_TAGS: 人形→Humanoid, 野兽→Beast, 魔法生物→Magical, 亡灵→Undead, 物件→Object
已删除蓝图 → Deleted blueprint
撤销 → Undo
无匹配蓝图 → No matching blueprints
标签 → Tags
无标签 → No tags
添加标签... → Add tag...
添加 → Add
```

- [ ] **Step 4: Translate CharacterLibraryTab.tsx**

```
新角色 → New Character
已删除 → Deleted
撤销 → Undo
搜索角色... → Search characters...
新建角色 → New character
暂无保存的角色 → No saved characters
点击右上角「+」创建，或将NPC「保存为角色」 → Click + to create, or save an NPC as a character
持久 → Persistent
可复用 → Reusable
删除角色 → Delete character
```

- [ ] **Step 5: Translate EntityPanel.tsx**

```
新NPC → New NPC
已删除 → Deleted
升级为场景角色 → Promote to scene character
离场 → Backstage / 上场 → On stage
降级为战术对象 → Demote to tactical object
搜索NPC... → Search NPCs...
暂无NPC → No NPCs
点击下方「+」创建 → Click + below to create
无匹配结果 → No matches
在场 → On Stage / 离场 → Backstage / 战术对象 → Tactical
新建NPC → New NPC
```

- [ ] **Step 6: Translate ArchivePanel.tsx**

```
存档 N → Archive N
已存为新档 → Saved as new archive
已删除 → Deleted
已覆盖存档 → Archive overwritten
请先选择场景 → Select a scene first
暂无战场存档 → No combat archives
点击下方「+」创建 → Click + below to create
重命名 → Rename
复制 → Duplicate
删除 → Delete
存为新档 → Save New
覆盖 → Overwrite
加载 → Load
删除"..."？ → Delete "..."?
确认/取消 → Confirm/Cancel
加载"..."？当前战场将被替换。→ Load "..."? Current battlefield will be replaced.
```

- [ ] **Step 7: Translate MapDockTab.tsx**

```
已删除 → Deleted
撤销 → Undo
```

- [ ] **Step 8: Translate EntityRow.tsx**

```
常驻 → Persistent
在场景中 → In scene
重命名 → Rename
加入场景 → Add to scene
删除 → Delete
删除"..."？ → Delete "..."?
```

- [ ] **Step 9: Translate PortraitBar.tsx**

```
我的角色 → My Character
离场 → Backstage
保存为蓝图 → Save as Blueprint
保存为角色 → Save as Character
移除 → Remove
创建我的角色 → Create My Character
```

- [ ] **Step 10: Translate HamburgerMenu.tsx**

```
游戏系统 → Game System
建房时确定，不可更改 → Set at room creation, cannot change
```

- [ ] **Step 11: Update entity-filtering.test.ts**

The test uses Chinese tag strings that match PRESET_TAGS. Update them to match the new English values:

```
人形 → Humanoid
野兽 → Beast
亡灵 → Undead
魔法生物 → Magical
```

- [ ] **Step 12: Run type check**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT-ux-polish && npx tsc --noEmit
```

- [ ] **Step 13: Run tests to verify tag translation didn't break anything**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT-ux-polish && npx vitest run src/gm/__tests__/entity-filtering.test.ts
```

- [ ] **Step 14: Verify in browser**

Check ALL panels — GmDock tabs, sidebar labels, blueprint tags, character library, entity panel groups, entity row actions, archive panel buttons, portrait bar context menu, hamburger menu. All text should be English.

- [ ] **Step 15: Commit**

```bash
git add src/gm/GmDock.tsx src/gm/GmSidebar.tsx src/dock/BlueprintDockTab.tsx src/dock/CharacterLibraryTab.tsx src/gm/EntityPanel.tsx src/gm/ArchivePanel.tsx src/dock/MapDockTab.tsx src/gm/EntityRow.tsx src/layout/PortraitBar.tsx src/layout/HamburgerMenu.tsx src/gm/__tests__/entity-filtering.test.ts
git commit -m "fix(i18n): translate all Chinese UI text to English"
```

---

### Task 4: Add random name button to seat selection

**Files:**

- Modify: `src/identity/SeatSelect.tsx:102-116`

- [ ] **Step 1: Add random name generator and button**

At the top of `SeatSelect.tsx`, add a name list and generator function (before the component):

```typescript
const RANDOM_NAMES = [
  'Adventurer',
  'Wanderer',
  'Sage',
  'Knight',
  'Rogue',
  'Mystic',
  'Ranger',
  'Bard',
  'Paladin',
  'Sorcerer',
  'Druid',
  'Monk',
  'Cleric',
  'Warlock',
  'Barbarian',
]

function randomName(): string {
  const name = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] as string
  const suffix = Math.floor(Math.random() * 100)
  return `${name}${suffix}`
}
```

- [ ] **Step 2: Add dice button next to name input**

Replace the name input section (lines 102-116) with a row containing the input + a randomize button:

```tsx
<div className="mb-3">
  <label className="text-xs text-text-muted block mb-1">Name</label>
  <div className="flex gap-1.5">
    <input
      autoFocus
      value={name}
      onChange={(e) => {
        setName(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && name.trim()) onCreate(name.trim(), role, color)
      }}
      placeholder="Your character name"
      className="flex-1 px-3 py-2 border border-border-glass rounded-md text-sm bg-surface text-text-primary outline-none box-border placeholder:text-text-muted/40"
    />
    <button
      onClick={() => {
        setName(randomName())
      }}
      className="px-2 py-2 border border-border-glass rounded-md bg-surface text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer transition-colors duration-fast"
      title="Random name"
    >
      <Dices size={16} strokeWidth={1.5} />
    </button>
  </div>
</div>
```

- [ ] **Step 3: Add Dices import**

Add `Dices` to the lucide-react import:

```typescript
import { Trash2, Dices } from 'lucide-react'
```

- [ ] **Step 4: Run type check**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT-ux-polish && npx tsc --noEmit
```

- [ ] **Step 5: Verify in browser**

Go to seat selection, click the dice button — a random name like "Ranger42" should fill the input.

- [ ] **Step 6: Commit**

```bash
git add src/identity/SeatSelect.tsx
git commit -m "feat(ui): add random name generator button to seat selection"
```

---

### Task 5: Token spawns at canvas center instead of (200, 200)

**Files:**

- Modify: `src/gm/GmDock.tsx:107`

- [ ] **Step 1: Find the hardcoded spawn coordinates**

In `src/gm/GmDock.tsx` line 107, the token spawn uses hardcoded `200, 200`:

```typescript
void useWorldStore.getState().placeEntityOnMap(entity.id, 200, 200)
```

- [ ] **Step 2: Calculate canvas center**

The canvas viewport center depends on the Konva stage position and scale. We need to get viewport center coordinates in canvas space. Check how the tactical map stores its position/scale — look for stage position in worldStore or uiStore.

Read `src/combat/KonvaMap.tsx` to find how `stagePos` and `scale` are tracked. The canvas center in map coordinates is:

```
centerX = (-stagePos.x + window.innerWidth / 2) / scale
centerY = (-stagePos.y + window.innerHeight / 2) / scale
```

However, since GmDock doesn't have direct access to Konva stage state, and the token can also be spawned in scene mode, use a simpler approach: spawn at the center of the scene/map dimensions.

Replace the hardcoded coordinates with a calculation using `window.innerWidth / 2` and `window.innerHeight / 2` as a reasonable default (tokens appear at screen center):

```typescript
void useWorldStore
  .getState()
  .placeEntityOnMap(
    entity.id,
    Math.round(window.innerWidth / 2),
    Math.round(window.innerHeight / 2),
  )
```

Note: This is a temporary fix. The proper solution (drag-to-place from dock) is tracked in issue #108.

- [ ] **Step 3: Check for other hardcoded spawn positions**

Search for other places that spawn tokens with hardcoded coordinates:

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT-ux-polish && grep -rn "placeEntityOnMap\|createToken" src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".test."
```

Fix any other hardcoded `200, 200` occurrences with the same pattern.

- [ ] **Step 4: Verify in browser**

Enter tactical mode, spawn a blueprint token from the dock. It should appear near the center of the visible canvas, not the top-left corner.

- [ ] **Step 5: Commit**

```bash
git add src/gm/GmDock.tsx
git commit -m "fix(ui): spawn tokens at screen center instead of hardcoded (200, 200)"
```

---

### Task 6: Team Dashboard default-collapse when empty

**Files:**

- Modify: `src/stores/uiStore.ts:105`
- Modify: `src/team/TeamDashboard.tsx`

- [ ] **Step 1: Change default visibility**

In `src/stores/uiStore.ts` line 105, change:

```typescript
// Before:
teamPanelVisible: true,

// After:
teamPanelVisible: false,
```

- [ ] **Step 2: Auto-show when trackers are added**

In `src/team/TeamDashboard.tsx`:

First, update the import on line 1:

```typescript
// Before:
import { useState } from 'react'
// After:
import { useState, useRef, useEffect } from 'react'
```

Then add a useEffect that auto-shows the panel when trackers go from 0 to >0:

```typescript
// Add after the existing hooks, before the return
const prevTrackerCount = useRef(trackers.length)
useEffect(() => {
  if (prevTrackerCount.current === 0 && trackers.length > 0) {
    setTeamPanelVisible(true)
  }
  prevTrackerCount.current = trackers.length
}, [trackers.length, setTeamPanelVisible])
```

This ensures the panel appears automatically when the GM creates the first tracker, but stays hidden by default for new rooms.

- [ ] **Step 3: Verify in browser**

1. New room: Team Dashboard should show only the small "Team" button, not the full panel
2. Click Team button → panel opens → Add a tracker → tracker appears
3. Collapse panel → reload → panel stays collapsed (no trackers auto-expanded)

- [ ] **Step 4: Commit**

```bash
git add src/stores/uiStore.ts src/team/TeamDashboard.tsx
git commit -m "fix(ui): default Team Dashboard to collapsed, auto-show on first tracker"
```

---

### Task 7: Add Scene tab to GM sidebar

**Files:**

- Modify: `src/stores/uiStore.ts:26` (type)
- Create: `src/gm/SceneConfigSidebarTab.tsx` (new component)
- Modify: `src/gm/GmSidebar.tsx` (add tab)

- [ ] **Step 1: Add 'scene' to GmSidebarTab type**

In `src/stores/uiStore.ts` line 26:

```typescript
// Before:
export type GmSidebarTab = 'archives' | 'entities'

// After:
export type GmSidebarTab = 'archives' | 'entities' | 'scene'
```

- [ ] **Step 2: Create SceneConfigSidebarTab component**

Create `src/gm/SceneConfigSidebarTab.tsx`. This extracts the form content from `SceneConfigPanel.tsx` into a sidebar-friendly layout (no floating panel, no click-outside-to-close, integrated save):

```tsx
import { useState, useRef } from 'react'
import { Upload, XCircle } from 'lucide-react'
import { useWorldStore } from '../stores/worldStore'

const PARTICLE_PRESETS = ['none', 'embers', 'snow', 'dust', 'rain', 'fireflies'] as const

export function SceneConfigSidebarTab() {
  const scene = useWorldStore((s) => {
    const id = s.activeSceneId
    return id ? (s.scenes.find((sc) => sc.id === id) ?? null) : null
  })
  const updateScene = useWorldStore((s) => s.updateScene)
  const uploadAsset = useWorldStore((s) => s.uploadAsset)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [audioUploading, setAudioUploading] = useState(false)

  if (!scene) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/40 text-xs">
        No active scene
      </div>
    )
  }

  const { atmosphere } = scene

  const handleUpdate = (updates: Parameters<typeof updateScene>[1]) => {
    void updateScene(scene.id, updates)
  }

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAudioUploading(true)
    try {
      const result = await uploadAsset(file, {})
      handleUpdate({ atmosphere: { ambientAudioUrl: result.url } })
    } catch (err) {
      console.error('Audio upload failed:', err)
    } finally {
      setAudioUploading(false)
      if (audioInputRef.current) audioInputRef.current.value = ''
    }
  }

  const audioFileName = atmosphere.ambientAudioUrl
    ? decodeURIComponent(atmosphere.ambientAudioUrl.split('/').pop() ?? '').slice(0, 30)
    : ''

  const inputClass =
    'w-full bg-surface text-text-primary text-xs rounded px-2 py-1.5 border border-border-glass focus:border-accent focus:outline-none transition-colors duration-fast'
  const labelClass = 'text-text-muted text-xs font-medium'

  return (
    <div className="p-3 flex flex-col gap-3 overflow-y-auto h-full">
      {/* Scene name */}
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Name</label>
        <input
          type="text"
          defaultValue={scene.name}
          onBlur={(e) => {
            const val = e.target.value.trim() || 'Untitled'
            if (val !== scene.name) handleUpdate({ name: val })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className={inputClass}
          placeholder="Scene name"
        />
      </div>

      {/* Background (read-only) */}
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Background</label>
        <div className="text-text-muted text-xs bg-surface rounded px-2 py-1.5 border border-border-glass truncate">
          {atmosphere.imageUrl
            ? decodeURIComponent(atmosphere.imageUrl.split('/').pop() ?? '')
            : 'None — set via Gallery tab'}
        </div>
      </div>

      {/* Particle preset */}
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Particle Effect</label>
        <select
          value={atmosphere.particlePreset}
          onChange={(e) => {
            handleUpdate({
              atmosphere: { particlePreset: e.target.value as typeof atmosphere.particlePreset },
            })
          }}
          className={inputClass}
        >
          {PARTICLE_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {preset.charAt(0).toUpperCase() + preset.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Ambient audio section */}
      <div className="flex flex-col gap-2">
        <span className="text-text-muted text-xs font-semibold uppercase tracking-wide">
          Ambient Audio
        </span>

        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            void handleAudioUpload(e)
          }}
        />

        {atmosphere.ambientAudioUrl ? (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 text-text-muted text-xs bg-surface rounded px-2 py-1.5 border border-border-glass truncate">
              {audioFileName}
            </div>
            <button
              onClick={() => {
                handleUpdate({ atmosphere: { ambientAudioUrl: '' } })
              }}
              className="text-text-muted hover:text-danger transition-colors duration-fast p-1 cursor-pointer shrink-0"
              title="Remove audio"
            >
              <XCircle size={14} strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => audioInputRef.current?.click()}
            disabled={audioUploading}
            className="flex items-center justify-center gap-1.5 w-full bg-surface text-text-muted text-xs rounded px-2 py-2 border border-dashed border-border-glass hover:border-accent hover:text-accent transition-colors duration-fast cursor-pointer disabled:opacity-50"
          >
            <Upload size={12} strokeWidth={1.5} />
            {audioUploading ? 'Uploading...' : 'Upload audio file'}
          </button>
        )}

        {/* Volume slider */}
        <div className="flex items-center justify-between gap-2">
          <label className={labelClass}>Volume</label>
          <div className="flex items-center gap-2 flex-1 max-w-[160px]">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={atmosphere.ambientAudioVolume}
              onChange={(e) => {
                handleUpdate({ atmosphere: { ambientAudioVolume: parseFloat(e.target.value) } })
              }}
              className="flex-1 accent-accent h-1"
            />
            <span className="text-text-muted text-[10px] w-8 text-right">
              {Math.round(atmosphere.ambientAudioVolume * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

Key differences from SceneConfigPanel:

- No floating positioning / click-outside-to-close — it's embedded in the sidebar
- No local state + Save button — uses `onBlur` for name, `onChange` for everything else (auto-save)
- Reads active scene directly from worldStore (no props needed)
- Uses `updateScene` and `uploadAsset` from worldStore (following store-actions convention — no direct API imports)

- [ ] **Step 3: Add Scene tab to GmSidebar**

In `src/gm/GmSidebar.tsx`:

Add import:

```typescript
import { Image } from 'lucide-react'
import { SceneConfigSidebarTab } from './SceneConfigSidebarTab'
```

Add to TABS array:

```typescript
const TABS: { id: GmSidebarTab; icon: typeof Swords; label: string }[] = [
  { id: 'scene', icon: Image, label: 'Scene' },
  { id: 'archives', icon: Swords, label: 'Archives' },
  { id: 'entities', icon: ClipboardList, label: 'Entities' },
]
```

Add to tab content rendering:

```tsx
{
  activeTab === 'scene' && <SceneConfigSidebarTab />
}
{
  activeTab === 'archives' && <ArchivePanel />
}
{
  activeTab === 'entities' && <EntityPanel />
}
```

- [ ] **Step 4: Update default sidebar tab**

In `src/stores/uiStore.ts` line 108:

```typescript
// Before:
gmSidebarTab: 'archives',

// After:
gmSidebarTab: 'scene',
```

- [ ] **Step 5: Run type check**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT-ux-polish && npx tsc --noEmit
```

- [ ] **Step 6: Verify in browser**

1. Open GM view → expand sidebar → Scene tab should be default
2. Scene name, particle preset, audio upload/volume should all work
3. Change scene name → switch tabs → come back → name persists
4. Archives and Entities tabs still work

- [ ] **Step 7: Commit**

```bash
git add src/stores/uiStore.ts src/gm/SceneConfigSidebarTab.tsx src/gm/GmSidebar.tsx
git commit -m "feat(ui): add Scene config tab to GM sidebar"
```

---

### Task 8: Retire floating SceneConfigPanel

**Files:**

- Modify: `src/gm/SceneButton.tsx`
- Delete: `src/gm/SceneConfigPanel.tsx`
- Modify: `src/gm/SceneListPanel.tsx` (remove edit button)

- [ ] **Step 1: Remove SceneConfigPanel from SceneButton**

In `src/gm/SceneButton.tsx`:

1. Remove the import of `SceneConfigPanel` (line 6)
2. Remove `editingSceneId` state and `editingScene` derived value (lines 31, 33)
3. Remove `setEditingSceneId(null)` from the click handler (line 47)
4. Remove the entire `{editingScene && <SceneConfigPanel ... />}` block (lines 79-91)
5. Remove `onUpdateScene` from props interface (it was only used by SceneConfigPanel). Keep `onDeleteScene` — it's still used by SceneListPanel. Add `onRenameScene` prop to replace the rename functionality that was handled through `onUpdateScene`.

The simplified SceneButton only manages scene switching via SceneListPanel.

Updated component:

```tsx
import { useState } from 'react'
import { Image } from 'lucide-react'
import type { Scene } from '../stores/worldStore'
import { SceneListPanel } from './SceneListPanel'

interface SceneButtonProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (sceneId: string) => void
  onDeleteScene: (id: string) => void
  onDuplicateScene: (sceneId: string) => void
  onCreateScene: () => void
  onRenameScene: (id: string, name: string) => void
}

export function SceneButton({
  scenes,
  activeSceneId,
  onSelectScene,
  onDeleteScene,
  onDuplicateScene,
  onCreateScene,
  onRenameScene,
}: SceneButtonProps) {
  const [showSceneList, setShowSceneList] = useState(false)

  return (
    <>
      <div
        className="fixed bottom-3 left-4 z-toast font-sans"
        onPointerDown={(e) => {
          e.stopPropagation()
        }}
      >
        <button
          onClick={() => {
            setShowSceneList(!showSceneList)
          }}
          className="flex items-center gap-1.5 rounded-lg bg-glass backdrop-blur-[12px] border border-border-glass px-3.5 py-2 text-xs font-semibold text-text-primary shadow-[0_2px_12px_rgba(0,0,0,0.3)] cursor-pointer hover:bg-hover transition-colors duration-fast"
        >
          <Image size={14} strokeWidth={1.5} />
          Scenes
        </button>
      </div>

      {showSceneList && (
        <SceneListPanel
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSelectScene={onSelectScene}
          onDeleteScene={onDeleteScene}
          onRenameScene={onRenameScene}
          onDuplicateScene={onDuplicateScene}
          onCreateScene={onCreateScene}
          onClose={() => {
            setShowSceneList(false)
          }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Remove edit button from SceneListPanel**

In `src/gm/SceneListPanel.tsx`:

1. Remove `onEditScene` from props interface and destructuring
2. Remove the edit (Pencil) button from the hover actions (lines 168-176)
3. Remove `Pencil` from lucide-react imports

Scene config is now always accessible via the sidebar Scene tab, so the edit button per-scene in the list is redundant.

- [ ] **Step 3: Update App.tsx SceneButton props**

In `src/App.tsx`, the SceneButton call passes `onUpdateScene` which is no longer needed. Update to match the new props:

Remove `onUpdateScene` prop, add `onRenameScene`:

```tsx
<SceneButton
  scenes={scenes}
  activeSceneId={room.activeSceneId}
  onSelectScene={(sceneId) => { void setActiveScene(sceneId) }}
  onDeleteScene={handleDeleteScene}
  onDuplicateScene={(sceneId) => { void duplicateScene(sceneId, crypto.randomUUID()) }}
  onCreateScene={() => { handleAddScene(crypto.randomUUID(), 'New Scene', { ... }) }}
  onRenameScene={(id, name) => { void updateScene(id, { name }) }}
/>
```

- [ ] **Step 4: Delete SceneConfigPanel.tsx**

```bash
rm src/gm/SceneConfigPanel.tsx
```

- [ ] **Step 5: Run type check**

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT-ux-polish && npx tsc --noEmit
```

- [ ] **Step 6: Verify in browser**

1. Click Scenes button → list shows scenes, can switch/create/duplicate/delete/rename
2. No edit button on scene cards (config is in sidebar now)
3. Sidebar Scene tab has all the configuration options

- [ ] **Step 7: Commit**

```bash
git add -u src/gm/SceneButton.tsx src/gm/SceneListPanel.tsx src/gm/SceneConfigPanel.tsx src/App.tsx
git commit -m "refactor(ui): retire floating SceneConfigPanel, scene config lives in sidebar"
```

---

## Execution Order

Tasks 1-6 are independent and can be executed in any order or in parallel.
Task 7 (Scene tab) should be done before Task 8 (retire panel).
Task 8 depends on Task 7.

Recommended order: 1 → 3 → 2 → 4 → 5 → 6 → 7 → 8

## Verification

After all tasks:

```bash
cd /Users/zhonghanzhen/Desktop/proj/myVTT-ux-polish
npx tsc --noEmit
npm test
npx playwright test --config=e2e/playwright.config.ts e2e/scenarios/ux-review.spec.ts
```
