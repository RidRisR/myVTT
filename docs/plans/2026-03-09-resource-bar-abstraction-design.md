# Resource Bar Abstraction Design

## Overview
Abstract a unified resource bar component to eliminate code duplication across TeamMetricsTab, CharacterHoverPreview, CharacterEditPanel, and MyCharacterCard. Currently, each component implements its own progress bar with draggable interaction, leading to ~150 lines of duplicated code.

## Problem Statement
**Current state:** 4+ components each implement their own resource/progress bars:
- TeamMetricsTab (compact 8px + expanded 16px draggable bars)
- CharacterHoverPreview (6px readonly + 10px editable bars)
- CharacterEditPanel (18px editable bars with +/- buttons)
- MyCharacterCard (similar to CharacterEditPanel)

**Pain points:**
- Duplicated drag logic (~30 lines × 4 files)
- Duplicated MiniHoldButton component (3 definitions)
- Inconsistent styling details (borderRadius, transitions)
- Hard to maintain: style changes require updating 4+ files

**Goal:** Single reusable component that covers all use cases through props.

---

## Design Approach

**Selected: Method 1 - Single Full-Featured Component** (vs. layered architecture or compound component patterns)

**Rationale:**
- Only 4 fixed usage scenarios (not dozens of variations)
- Simple direct API, easy to understand and migrate
- Centralized drag logic maintenance
- Follows YAGNI principle

---

## Component API

### File Location
`src/shared/ui/ResourceBar.tsx`

### TypeScript Interface

```tsx
interface ResourceBarProps {
  // === Data ===
  label?: string           // Resource name, e.g. "HP", "MP"
  current: number          // Current value
  max: number              // Maximum value
  color: string            // Bar color, e.g. "#22c55e"

  // === Appearance ===
  height?: number          // Bar height in px, default 8
  showLabel?: boolean      // Show label above bar
  valueDisplay?: 'none' | 'outside' | 'inline'
  //   - 'none': No value display
  //   - 'outside': Show "current/max" to the right of bar (compact scenarios)
  //   - 'inline': Show "current/max" overlaid on bar (editable large bars)

  // === Interaction ===
  draggable?: boolean      // Enable drag-to-change
  showButtons?: boolean    // Show +/- hold-to-repeat buttons
  onChange?: (newCurrent: number) => void  // Value change callback

  // === Optional Style Override ===
  className?: string
  style?: React.CSSProperties
}
```

---

## Usage Scenarios

### Scenario 1: TeamMetricsTab Compact (Read-only)
```tsx
<ResourceBar
  label="Fear"
  current={3}
  max={10}
  color="#ef4444"
  height={8}
  valueDisplay="outside"
/>
```

### Scenario 2: TeamMetricsTab Expanded (Draggable)
```tsx
<ResourceBar
  current={3}
  max={10}
  color="#ef4444"
  height={16}
  valueDisplay="inline"
  draggable
  onChange={(val) => onUpdateTracker(id, { current: val })}
/>
```

### Scenario 3: CharacterHoverPreview (Mini Read-only)
```tsx
<ResourceBar
  label="HP"
  current={45}
  max={50}
  color="#22c55e"
  height={6}
  valueDisplay="outside"
/>
```

### Scenario 4: CharacterEditPanel (Full Edit)
```tsx
<ResourceBar
  label="HP"
  current={45}
  max={50}
  color="#22c55e"
  height={18}
  valueDisplay="inline"
  draggable
  showButtons
  onChange={(val) => updateResource(i, { current: val })}
/>
```

---

## Implementation Architecture

### Component Structure

```tsx
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

  // Drag logic (reuse existing pattern)
  const handleBarDrag = (e: React.PointerEvent) => {
    if (!draggable || !onChange) return
    e.preventDefault()
    e.stopPropagation()  // Prevent parent click events (e.g. TeamDashboard expand)

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

  // +/- button callbacks (reuse useHoldRepeat hook)
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
          <MiniHoldButton
            label="-"
            onTick={handleDecrement}
            color="#ef4444"
          />
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
          <MiniHoldButton
            label="+"
            onTick={handleIncrement}
            color="#22c55e"
          />
        )}
      </div>
    </div>
  )
}
```

### Key Design Decisions

1. **Drag Logic Reuse** - Fully adopts existing window-level listener pattern, consistent with TeamMetricsTab and CharacterEditPanel
2. **Event Isolation** - `e.stopPropagation()` prevents triggering parent component click events (e.g., TeamDashboard expand-on-click)
3. **MiniHoldButton Reuse** - Directly uses existing `useHoldRepeat` hook (extracted to shared/ui)
4. **Responsive Font Size** - Inline value font size auto-adjusts based on height (`height * 0.5`, min 8px)
5. **Adaptive Border Radius** - `borderRadius: Math.min(height / 2, 8)` ensures small bars are rounded, large bars not overly round

---

## Migration Strategy

### Step 1: Create Shared Components

**File: `src/shared/ui/MiniHoldButton.tsx`**
Extract from CharacterHoverPreview.tsx, TeamMetricsTab.tsx, CharacterEditPanel.tsx (currently duplicated 3× with slight variations).

**File: `src/shared/ui/ResourceBar.tsx`**
New component as designed above.

### Step 2: Migrate Each Consumer

#### TeamMetricsTab Migration

**Before (~70 lines):**
```tsx
// Compact mode - 109-141 lines
{trackers.map((t) => {
  const pct = t.max > 0 ? Math.min(t.current / t.max, 1) : 0
  const isDragging = draggingId === t.id
  return (
    <div key={t.id}>
      <div style={{...}}>
        <span>{t.label}</span>
        <span>{t.current}/{t.max}</span>
      </div>
      <div onPointerDown={...} style={{...}}>
        <div style={{...}} />
      </div>
    </div>
  )
})}

// Expanded mode - 212-238 lines
<div style={{...}}>
  <MiniHoldButton label="-" ... />
  <div onPointerDown={...} style={{...}}>
    <div style={{...}} />
    <div style={{...}}>{t.current} / {t.max}</div>
  </div>
  <MiniHoldButton label="+" ... />
</div>
```

**After (~20 lines):**
```tsx
// Compact mode
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

// Expanded mode
{trackers.map((t) => (
  <ResourceBar
    key={t.id}
    current={t.current}
    max={t.max}
    color={t.color}
    height={16}
    valueDisplay="inline"
    draggable
    showButtons
    onChange={(val) => onUpdateTracker(t.id, { current: val })}
  />
))}
```

**Code reduction:** ~70 lines → ~20 lines

**Removals:**
- `handleBarDrag` function (lines 70-90)
- `draggingId` state
- Local `MiniHoldButton` component (lines 25-46)

---

#### CharacterHoverPreview Migration

**Before (~48 lines):**
```tsx
{resources.map((res, i) => {
  const pct = res.max > 0 ? Math.min(res.current / res.max, 1) : 0
  const isDragging = draggingRes === i
  return (
    <div key={i}>
      <div style={{...}}>
        <span>{res.key}</span>
        {canEdit && (<>
          <MiniHoldButton .../>
          <MiniHoldButton .../>
        </>)}
        <span>{res.current}/{res.max}</span>
      </div>
      <div onPointerDown={...}>
        <div style={{...}} />
        {canEdit && <div>{res.current}/{res.max}</div>}
      </div>
    </div>
  )
})}
```

**After (~15 lines):**
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

**Code reduction:** ~48 lines → ~15 lines

**Removals:**
- `handleBarDrag` function (lines 65-83)
- `draggingRes` state
- Local `MiniHoldButton` component (lines 14-35)

---

#### CharacterEditPanel Migration

**Before (~24 lines per resource bar):**
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
  <HoldButton
    label="-"
    onTick={() => updateResource(i, { current: Math.max(0, res.current - 1) })}
    color="#ef4444"
  />
  <div style={{...}} onPointerDown={(e) => handleBarDrag(e, i, res.max)}>
    <div style={{...}} />
    <div style={{...}}>{res.current} / {res.max}</div>
  </div>
  <HoldButton
    label="+"
    onTick={() => updateResource(i, { current: Math.min(res.max, res.current + 1) })}
    color="#22c55e"
  />
</div>
```

**After (~10 lines):**
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

**Code reduction:** ~24 lines → ~10 lines

**Removals:**
- `handleBarDrag` function (lines 147-166)
- `draggingRes` state
- Local `HoldButton` component (lines 60-83)

---

#### MyCharacterCard Migration

Similar pattern to CharacterEditPanel. Expected code reduction: ~30 lines → ~12 lines.

---

### Step 3: Cleanup

After all migrations:
1. Remove `handleBarDrag` from 4 files
2. Remove `draggingId`/`draggingRes` state from 4 files
3. Remove 3 duplicate `MiniHoldButton`/`HoldButton` definitions
4. Total estimated code reduction: **~150 lines**

---

## Visual Specification

### Heights by Scenario
- **Mini read-only:** 6px (CharacterHoverPreview readonly)
- **Compact:** 8px (TeamMetricsTab compact)
- **Editable small:** 10px (CharacterHoverPreview editable)
- **Editable medium:** 16px (TeamMetricsTab expanded)
- **Editable large:** 18px (CharacterEditPanel, MyCharacterCard)

### Border Radius
- Adaptive: `Math.min(height / 2, 8)` → fully rounded for small bars, capped at 8px for large bars

### Colors
- Background: `rgba(255,255,255,0.06)`
- Fill: `linear-gradient(90deg, ${color}, ${color}cc)` (with alpha fade)
- Text (outside): `#fff` bold
- Text (inline): `#fff` bold with `text-shadow: 0 1px 2px rgba(0,0,0,0.5)`

### Transitions
- Width change: `0.2s ease` (disabled during drag)
- No transition during drag for 60fps smoothness

---

## Testing Strategy

### Manual Testing Checklist
1. **TeamMetricsTab**
   - Compact mode: bars display correctly, values on right
   - GM can drag bars in compact mode (if draggable={isGM})
   - Expanded mode: bars display inline values, +/- buttons work, drag works
   - Click outside bar still expands panel (stopPropagation works)

2. **CharacterHoverPreview**
   - Read-only mode: 6px bars, values on right, no interaction
   - Editable mode: 10px bars, inline values, drag + buttons work

3. **CharacterEditPanel**
   - 18px bars, inline values, drag + buttons work
   - Values clamp correctly (0 ≤ current ≤ max)
   - Hold-to-repeat accelerates after 500ms

4. **MyCharacterCard**
   - Same as CharacterEditPanel tests

### Visual Regression
- Compare before/after screenshots for all 4 components
- Ensure heights, colors, spacing, font sizes match original

---

## Benefits

### Code Quality
- ✅ **-150 lines** of duplicated code removed
- ✅ Single source of truth for drag logic
- ✅ Consistent styling across all resource bars
- ✅ Easier to maintain and modify

### Developer Experience
- ✅ Simple API: `<ResourceBar current={5} max={10} color="#22c55e" ... />`
- ✅ Clear prop names (no magic numbers)
- ✅ TypeScript autocomplete for all props

### Future Extensibility
- Easy to add new features globally (e.g., animation effects, accessibility)
- Easy to add new resource bar usage scenarios
- Centralized place to adjust visual design

---

## Risks & Mitigations

### Risk: Breaking Existing Behavior
**Mitigation:** Thorough manual testing of all 4 consumer components before merge.

### Risk: Subtle Visual Differences
**Mitigation:** Visual regression testing (screenshot comparison).

### Risk: Performance Regression
**Mitigation:** Reuse exact same drag pattern (window listeners), no performance impact expected.

---

## Future Enhancements (Out of Scope)

- Accessibility: ARIA labels, keyboard control
- Animation: pulse effect on value change
- Theming: accept custom background/border styles
- Vertical orientation support

These can be added incrementally without breaking existing usage.
