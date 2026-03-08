# Resource Bar Abstraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Abstract unified resource bar component from 4 duplicated implementations, reducing ~150 lines of code duplication

**Architecture:** Create `ResourceBar` component in `src/shared/ui/` with flexible props (height, valueDisplay, draggable, showButtons). Extract `MiniHoldButton` to shared. Migrate TeamMetricsTab, CharacterHoverPreview, CharacterEditPanel, MyCharacterCard to use new component.

**Tech Stack:** React 19.2, TypeScript 5.9, inline styles (existing pattern)

---

## Task 1: Extract MiniHoldButton to Shared

**Files:**
- Create: `src/shared/ui/MiniHoldButton.tsx`
- Reference: `src/layout/CharacterHoverPreview.tsx:14-35` (current implementation)
- Reference: `.worktrees/team-dashboard/src/team/TeamMetricsTab.tsx:25-46` (similar)

**Step 1: Create MiniHoldButton component**

Create `src/shared/ui/MiniHoldButton.tsx`:

```tsx
import { useHoldRepeat } from '../useHoldRepeat'

interface MiniHoldButtonProps {
  label: string
  onTick: () => void
  color: string
}

export function MiniHoldButton({ label, onTick, color }: MiniHoldButtonProps) {
  const { holdStart, holdStop } = useHoldRepeat(onTick)
  return (
    <button
      onPointerDown={holdStart}
      onPointerUp={holdStop}
      onPointerLeave={holdStop}
      style={{
        width: 20,
        height: 20,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 4,
        cursor: 'pointer',
        color,
        fontSize: 11,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        lineHeight: 1,
        flexShrink: 0,
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
    >
      {label}
    </button>
  )
}
```

**Step 2: Verify file compiles**

Run: `npx tsc --noEmit`
Expected: No errors in MiniHoldButton.tsx

**Step 3: Commit**

```bash
git add src/shared/ui/MiniHoldButton.tsx
git commit -m "feat(ui): extract MiniHoldButton to shared component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Create ResourceBar Component

**Files:**
- Create: `src/shared/ui/ResourceBar.tsx`
- Reference: Design spec at `docs/plans/2026-03-09-resource-bar-abstraction-design.md`

**Step 1: Create ResourceBar component skeleton**

Create `src/shared/ui/ResourceBar.tsx`:

```tsx
import { useState } from 'react'
import { MiniHoldButton } from './MiniHoldButton'

interface ResourceBarProps {
  // Data
  label?: string
  current: number
  max: number
  color: string

  // Appearance
  height?: number
  showLabel?: boolean
  valueDisplay?: 'none' | 'outside' | 'inline'

  // Interaction
  draggable?: boolean
  showButtons?: boolean
  onChange?: (newCurrent: number) => void

  // Optional style override
  className?: string
  style?: React.CSSProperties
}

export function ResourceBar({
  label,
  current,
  max,
  color,
  height = 8,
  showLabel = false,
  valueDisplay = 'none',
  draggable = false,
  showButtons = false,
  onChange,
  className,
  style,
}: ResourceBarProps) {
  const [isDragging, setIsDragging] = useState(false)

  // Calculate percentage
  const pct = max > 0 ? Math.min(current / max, 1) : 0

  // Placeholder - we'll implement drag logic next
  const handleBarDrag = (e: React.PointerEvent) => {
    console.log('drag start')
  }

  const handleIncrement = () => onChange?.(Math.min(max, current + 1))
  const handleDecrement = () => onChange?.(Math.max(0, current - 1))

  return (
    <div className={className} style={style}>
      {/* Header: label + outside value */}
      {(showLabel || valueDisplay === 'outside') && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 3,
          fontSize: 10,
        }}>
          {showLabel && (
            <span style={{
              color: 'rgba(255,255,255,0.55)',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {label}
            </span>
          )}
          {valueDisplay === 'outside' && (
            <span style={{
              fontSize: 9,
              color: '#fff',
              fontWeight: 700,
              flexShrink: 0,
              marginLeft: 6,
            }}>
              {current}/{max}
            </span>
          )}
        </div>
      )}

      {/* Bar row: [- button] + bar + [+ button] */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {showButtons && (
          <MiniHoldButton label="-" onTick={handleDecrement} color="#ef4444" />
        )}

        {/* Progress bar */}
        <div
          style={{
            flex: showButtons ? 1 : undefined,
            width: showButtons ? undefined : '100%',
            height,
            borderRadius: Math.min(height / 2, 8),
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
            position: 'relative',
            cursor: draggable ? 'ew-resize' : 'default',
            userSelect: 'none',
          }}
          onPointerDown={draggable ? handleBarDrag : undefined}
        >
          {/* Fill */}
          <div style={{
            height: '100%',
            width: `${pct * 100}%`,
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            borderRadius: Math.min(height / 2, 8),
            transition: isDragging ? 'none' : 'width 0.2s ease',
          }} />

          {/* Inline value overlay */}
          {valueDisplay === 'inline' && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: Math.max(8, height * 0.5),
              fontWeight: 700,
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}>
              {current} / {max}
            </div>
          )}
        </div>

        {showButtons && (
          <MiniHoldButton label="+" onTick={handleIncrement} color="#22c55e" />
        )}
      </div>
    </div>
  )
}
```

**Step 2: Implement drag logic**

Replace `handleBarDrag` in `src/shared/ui/ResourceBar.tsx`:

```tsx
const handleBarDrag = (e: React.PointerEvent) => {
  if (!draggable || !onChange) return
  e.preventDefault()
  e.stopPropagation()  // Prevent parent click events

  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const calcValue = (clientX: number) =>
    Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * max)

  onChange(calcValue(e.clientX))
  setIsDragging(true)

  const onMove = (ev: PointerEvent) => {
    onChange(calcValue(ev.clientX))
  }
  const onUp = () => {
    setIsDragging(false)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
```

**Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/shared/ui/ResourceBar.tsx
git commit -m "feat(ui): create ResourceBar component with drag support

- Flexible props: height, valueDisplay, draggable, showButtons
- Reuses existing drag pattern (window listeners)
- Adaptive border radius and font size
- Event isolation with stopPropagation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Migrate TeamMetricsTab (Worktree)

**Context:** This file is in `.worktrees/team-dashboard/`

**Files:**
- Modify: `.worktrees/team-dashboard/src/team/TeamMetricsTab.tsx`
- Remove: Lines 25-46 (MiniHoldButton), 52 (draggingId state), 70-90 (handleBarDrag)

**Step 1: Add ResourceBar import**

At top of `.worktrees/team-dashboard/src/team/TeamMetricsTab.tsx`, add:

```tsx
import { ResourceBar } from '../../../src/shared/ui/ResourceBar'
```

**Step 2: Remove duplicated code**

Delete these sections:
- Lines 25-46: `function MiniHoldButton` (entire component)
- Line 52: `const [draggingId, setDraggingId] = useState<string | null>(null)`
- Lines 70-90: `const handleBarDrag = (e: React.PointerEvent, tracker: TeamTracker) => { ... }`

**Step 3: Replace compact mode bars (lines 109-142)**

Replace the entire compact mode mapping with:

```tsx
if (!expanded) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: trackers.length >= 2 ? '1fr 1fr' : '1fr',
      gap: '10px 14px',
    }}>
      {trackers.map((t) => (
        <ResourceBar
          key={t.id}
          label={t.label}
          current={t.current}
          max={t.max}
          color={t.color}
          height={8}
          valueDisplay="outside"
          draggable={isGM}
          onChange={(val) => onUpdateTracker(t.id, { current: val })}
        />
      ))}
    </div>
  )
}
```

**Step 4: Replace expanded mode bars (lines 212-238)**

Find the bar row in expanded mode (inside the `.map((t) => ...)` around line 212), replace with:

```tsx
{/* Bar row: - draggable bar + */}
<ResourceBar
  current={t.current}
  max={t.max}
  color={t.color}
  height={16}
  valueDisplay="inline"
  draggable
  showButtons
  onChange={(val) => onUpdateTracker(t.id, { current: val })}
/>
```

**Step 5: Verify TypeScript compilation**

Run: `cd .worktrees/team-dashboard && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
cd .worktrees/team-dashboard
git add src/team/TeamMetricsTab.tsx
git commit -m "refactor(team): migrate TeamMetricsTab to ResourceBar

- Remove ~70 lines of duplicated bar rendering
- Remove local MiniHoldButton, handleBarDrag, draggingId
- Use ResourceBar for both compact and expanded modes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
cd ../..
```

---

## Task 4: Migrate CharacterHoverPreview

**Files:**
- Modify: `src/layout/CharacterHoverPreview.tsx`
- Remove: Lines 14-35 (MiniHoldButton), 43 (draggingRes state), 65-83 (handleBarDrag)

**Step 1: Add ResourceBar import, remove MiniHoldButton**

At top of `src/layout/CharacterHoverPreview.tsx`:

```tsx
import { ResourceBar } from '../shared/ui/ResourceBar'
import { MiniHoldButton } from '../shared/ui/MiniHoldButton'
```

**Step 2: Remove duplicated code**

Delete these sections:
- Lines 14-35: `function MiniHoldButton` (entire component)
- Line 43: `const [draggingRes, setDraggingRes] = useState<number | null>(null)`
- Lines 65-83: `const handleBarDrag = (e: React.PointerEvent, ...) => { ... }`

**Step 3: Replace resource bars (lines 189-236)**

Replace the entire `{resources.map((res, i) => { ... })}` block with:

```tsx
{resources.map((res, i) => (
  <ResourceBar
    key={i}
    label={res.key || 'Unnamed'}
    current={res.current}
    max={res.max}
    color={res.color}
    height={canEdit ? 10 : 6}
    valueDisplay={canEdit ? 'inline' : 'outside'}
    draggable={canEdit}
    showButtons={canEdit}
    onChange={(val) => updateResource(i, { current: val })}
    style={{ marginBottom: i < resources.length - 1 ? 5 : 0 }}
  />
))}
```

**Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/layout/CharacterHoverPreview.tsx
git commit -m "refactor(layout): migrate CharacterHoverPreview to ResourceBar

- Remove ~50 lines of duplicated bar rendering
- Remove local MiniHoldButton, handleBarDrag, draggingRes
- Single conditional ResourceBar for readonly/editable modes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Migrate CharacterEditPanel

**Files:**
- Modify: `src/layout/CharacterEditPanel.tsx`
- Remove: Lines 60-83 (HoldButton), 89 (draggingRes state), 147-166 (handleBarDrag)

**Step 1: Add ResourceBar import**

At top of `src/layout/CharacterEditPanel.tsx`:

```tsx
import { ResourceBar } from '../shared/ui/ResourceBar'
```

**Step 2: Remove duplicated code**

Delete these sections:
- Lines 60-83: `function HoldButton` (entire component)
- Line 89: `const [draggingRes, setDraggingRes] = useState<number | null>(null)`
- Lines 147-166: `const handleBarDrag = (e: React.PointerEvent, ...) => { ... }`

**Step 3: Replace resource bars in renderResources (lines 314-337)**

Find the bar row section (around line 314 in `renderResources`), replace with:

```tsx
{/* Bar row: - draggable bar + */}
<ResourceBar
  current={res.current}
  max={res.max}
  color={res.color}
  height={18}
  valueDisplay="inline"
  draggable
  showButtons
  onChange={(val) => updateResource(i, { current: val })}
/>
```

**Step 4: Remove color picker code from bar section**

The color picker (lines 339-346) should remain AFTER the ResourceBar, not inside it. Keep it as is.

**Step 5: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/layout/CharacterEditPanel.tsx
git commit -m "refactor(layout): migrate CharacterEditPanel to ResourceBar

- Remove ~25 lines of duplicated bar rendering per resource
- Remove local HoldButton, handleBarDrag, draggingRes
- Use ResourceBar for cleaner resource editing UI

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Migrate MyCharacterCard

**Files:**
- Modify: `src/layout/MyCharacterCard.tsx`
- Similar changes to CharacterEditPanel

**Step 1: Add ResourceBar import**

At top of `src/layout/MyCharacterCard.tsx`:

```tsx
import { ResourceBar } from '../shared/ui/ResourceBar'
```

**Step 2: Locate and remove duplicated code**

Search for:
- `function HoldButton` or `function MiniHoldButton` → delete entire component
- `const [dragging...` state → delete line
- `const handleBarDrag = ` → delete entire function

**Step 3: Find resource bar rendering**

Search for the resource mapping (should be similar to CharacterEditPanel around line 248).

Replace the bar row section with:

```tsx
<ResourceBar
  current={res.current}
  max={res.max}
  color={res.color}
  height={18}
  valueDisplay="inline"
  draggable
  showButtons
  onChange={(val) => updateResource(i, { current: val })}
/>
```

**Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/layout/MyCharacterCard.tsx
git commit -m "refactor(layout): migrate MyCharacterCard to ResourceBar

- Remove ~30 lines of duplicated bar rendering
- Remove local button component, handleBarDrag, dragging state
- Consistent resource bar UI with other components

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Manual Testing

**No code changes, just verification**

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test TeamMetricsTab (in worktree)**

Open: `http://localhost:5173` (if running worktree dev server)

Verify:
- [ ] Compact mode: 8px bars, values on right, GM can drag
- [ ] Expanded mode: 16px bars, inline values, +/- buttons work
- [ ] Click outside bar expands panel (stopPropagation works)
- [ ] Hold buttons accelerate after 500ms

**Step 3: Test CharacterHoverPreview**

Hover over a character portrait.

Verify:
- [ ] Read-only: 6px bars, values on right, no drag
- [ ] Editable (if GM): 10px bars, inline values, drag + buttons work

**Step 4: Test CharacterEditPanel**

Click a character portrait to open edit panel.

Verify:
- [ ] 18px bars, inline values visible
- [ ] Drag works, values clamp (0 ≤ current ≤ max)
- [ ] +/- buttons work with hold-to-repeat

**Step 5: Test MyCharacterCard**

Open your character card (if available in UI).

Verify:
- [ ] Same as CharacterEditPanel tests
- [ ] No visual regressions

**Step 6: Visual regression check**

Compare before/after screenshots (if available) for:
- Bar heights match spec (6px, 8px, 10px, 16px, 18px)
- Colors unchanged
- Spacing unchanged
- Font sizes appropriate for bar height

**Step 7: Document test results**

If all tests pass, proceed to final commit. If issues found, fix and re-test.

---

## Task 8: Final Cleanup and Documentation

**Files:**
- Update: `docs/plans/2026-03-09-resource-bar-abstraction-design.md` (mark as implemented)
- Update: `.claude/projects/-Users-zhonghanzhen-Desktop-proj-myVTT/memory/MEMORY.md` (add pattern note)

**Step 1: Add implementation note to design doc**

Add at top of `docs/plans/2026-03-09-resource-bar-abstraction-design.md`:

```markdown
> **Status:** ✅ Implemented (2026-03-09)
> **Components:** `src/shared/ui/ResourceBar.tsx`, `src/shared/ui/MiniHoldButton.tsx`
```

**Step 2: Update project memory**

Add to `.claude/projects/-Users-zhonghanzhen-Desktop-proj-myVTT/memory/MEMORY.md` under `## UI Patterns`:

```markdown
### ResourceBar Component
- **Location**: `src/shared/ui/ResourceBar.tsx`
- **Purpose**: Unified progress/resource bar (eliminates ~150 lines of duplication)
- **Key props**: `height`, `valueDisplay: 'none' | 'outside' | 'inline'`, `draggable`, `showButtons`
- **Drag pattern**: Window-level listeners, `e.stopPropagation()` to prevent parent clicks
- **Usage**: TeamMetricsTab, CharacterHoverPreview, CharacterEditPanel, MyCharacterCard
```

**Step 3: Commit documentation updates**

```bash
git add docs/plans/2026-03-09-resource-bar-abstraction-design.md
git add .claude/projects/-Users-zhonghanzhen-Desktop-proj-myVTT/memory/MEMORY.md
git commit -m "docs: mark resource bar abstraction as implemented

- Add status note to design doc
- Document ResourceBar pattern in project memory

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**Step 4: Build production to verify**

Run: `npx tsc --noEmit && npx vite build`
Expected: No errors, successful build

**Step 5: Final verification**

Run: `git log --oneline -8`
Expected: See all 8 commits from this plan

---

## Success Criteria

- [x] `ResourceBar` component created in `src/shared/ui/`
- [x] `MiniHoldButton` extracted to shared
- [x] 4 components migrated (TeamMetricsTab, CharacterHoverPreview, CharacterEditPanel, MyCharacterCard)
- [x] ~150 lines of duplicated code removed
- [x] No TypeScript errors
- [x] All manual tests pass
- [x] Production build succeeds
- [x] Documentation updated

---

## Rollback Plan

If issues arise:

1. **Revert all commits:**
   ```bash
   git revert HEAD~7..HEAD
   ```

2. **Cherry-pick specific fixes if needed:**
   ```bash
   git cherry-pick <commit-hash>
   ```

3. **Return to previous state:**
   ```bash
   git reset --hard HEAD~8
   ```

---

## Notes for Implementer

- **DRY:** All bar logic is now in one place (`ResourceBar.tsx`)
- **YAGNI:** No premature features added (animations, themes, etc.)
- **TDD approach:** TypeScript compilation is our "test" (verify after each change)
- **Frequent commits:** 8 commits total, one per logical change
- **Event isolation:** `e.stopPropagation()` is critical for TeamDashboard click-to-expand

**Reference files:**
- Design spec: `docs/plans/2026-03-09-resource-bar-abstraction-design.md`
- Existing drag pattern: `src/layout/CharacterHoverPreview.tsx:65-83` (before migration)
- Hold repeat hook: `src/shared/useHoldRepeat.ts`
