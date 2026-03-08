# Team Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a persistent, always-visible team dashboard at the top-right of the screen with an extensible tab framework, starting with a Team Metrics tab (shared numeric trackers like Fear/Hope/Morale).

**Architecture:** The dashboard is a `position: fixed` panel at `top: 12, right: 16, width: 546`. It has a compact state (always visible, mini resource bars) and an expanded state (GM-only, with editing controls). Data is stored in Yjs (`yDoc.getMap('team_metrics')`) following the same hook pattern as `useHandoutAssets`. The tab framework renders one tab at a time with a horizontal tab bar.

**Tech Stack:** React 19, TypeScript, Yjs (Y.Map), inline styles (dark glass theme)

**Design doc:** `docs/plans/2026-03-08-team-dashboard-design.md`

---

### Task 1: Create useTeamMetrics Yjs Hook

**Files:**
- Create: `src/team/useTeamMetrics.ts`

**Step 1: Create the hook file**

Follow the exact pattern from `src/dock/useHandoutAssets.ts`. The hook reads/writes a Y.Map keyed by tracker ID.

```ts
import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { generateTokenId } from '../combat/combatUtils'

export interface TeamTracker {
  id: string
  label: string
  current: number
  max: number
  color: string
  sortOrder: number
}

function readTrackers(yMap: Y.Map<TeamTracker>): TeamTracker[] {
  const items: TeamTracker[] = []
  yMap.forEach((item) => items.push(item))
  items.sort((a, b) => a.sortOrder - b.sortOrder)
  return items
}

const DEFAULT_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899']

export function useTeamMetrics(yDoc: Y.Doc) {
  const yMetrics = yDoc.getMap<TeamTracker>('team_metrics')
  const [trackers, setTrackers] = useState<TeamTracker[]>(() => readTrackers(yMetrics))

  useEffect(() => {
    setTrackers(readTrackers(yMetrics))
    const observer = () => setTrackers(readTrackers(yMetrics))
    yMetrics.observe(observer)
    return () => yMetrics.unobserve(observer)
  }, [yMetrics])

  const addTracker = (label: string) => {
    const id = generateTokenId()
    const colorIndex = trackers.length % DEFAULT_COLORS.length
    const tracker: TeamTracker = {
      id,
      label,
      current: 0,
      max: 10,
      color: DEFAULT_COLORS[colorIndex],
      sortOrder: trackers.length,
    }
    yMetrics.set(id, tracker)
  }

  const updateTracker = (id: string, updates: Partial<TeamTracker>) => {
    const existing = yMetrics.get(id)
    if (existing) {
      yMetrics.set(id, { ...existing, ...updates })
    }
  }

  const deleteTracker = (id: string) => {
    yMetrics.delete(id)
  }

  return { trackers, addTracker, updateTracker, deleteTracker }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `useTeamMetrics.ts`

**Step 3: Commit**

```bash
git add src/team/useTeamMetrics.ts
git commit -m "feat: add useTeamMetrics Yjs hook for team tracker data"
```

---

### Task 2: Create TeamMetricsTab Component

**Files:**
- Create: `src/team/TeamMetricsTab.tsx`

**Step 1: Create the metrics tab component**

This component has two modes: compact (read-only mini bars) and expanded (GM editing with drag, +/-, add/delete). Reuse `useHoldRepeat` for +/- buttons and the window-level pointermove/pointerup drag pattern from `CharacterHoverPreview`.

```tsx
import { useState } from 'react'
import type { TeamTracker } from './useTeamMetrics'
import { useHoldRepeat } from '../shared/useHoldRepeat'

interface TeamMetricsTabProps {
  trackers: TeamTracker[]
  expanded: boolean
  isGM: boolean
  onUpdateTracker: (id: string, updates: Partial<TeamTracker>) => void
  onAddTracker: (label: string) => void
  onDeleteTracker: (id: string) => void
}

function MiniHoldButton({ label, onTick, color }: { label: string; onTick: () => void; color: string }) {
  const { holdStart, holdStop } = useHoldRepeat(onTick)
  return (
    <button
      onPointerDown={holdStart} onPointerUp={holdStop} onPointerLeave={holdStop}
      style={{
        width: 16, height: 16,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 3, cursor: 'pointer',
        color, fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, lineHeight: 1, flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
    >
      {label}
    </button>
  )
}

export function TeamMetricsTab({
  trackers, expanded, isGM,
  onUpdateTracker, onAddTracker, onDeleteTracker,
}: TeamMetricsTabProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  const canEdit = isGM && expanded

  const handleBarDrag = (e: React.PointerEvent, tracker: TeamTracker) => {
    if (!canEdit) return
    e.preventDefault()
    const bar = e.currentTarget as HTMLElement
    const rect = bar.getBoundingClientRect()
    const calcValue = (clientX: number) =>
      Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * tracker.max)
    onUpdateTracker(tracker.id, { current: calcValue(e.clientX) })
    setDraggingId(tracker.id)
    const onMove = (ev: PointerEvent) => {
      onUpdateTracker(tracker.id, { current: calcValue(ev.clientX) })
    }
    const onUp = () => {
      setDraggingId(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const commitLabelEdit = (id: string, label: string) => {
    const trimmed = label.trim()
    if (trimmed) onUpdateTracker(id, { label: trimmed })
    setEditingId(null)
  }

  const commitNewTracker = (label: string) => {
    const trimmed = label.trim()
    if (trimmed) onAddTracker(trimmed)
    setNewLabel('')
    setAddingNew(false)
  }

  if (trackers.length === 0 && !canEdit) return null

  // Compact mode: dual-column mini bars
  if (!expanded) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: trackers.length >= 2 ? '1fr 1fr' : '1fr',
        gap: '4px 12px',
      }}>
        {trackers.map((t) => {
          const pct = t.max > 0 ? Math.min(t.current / t.max, 1) : 0
          return (
            <div key={t.id} style={{ minWidth: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 10, marginBottom: 2,
              }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 9, flexShrink: 0, marginLeft: 4 }}>{t.current}/{t.max}</span>
              </div>
              <div style={{
                height: 6, borderRadius: 3,
                background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${pct * 100}%`,
                  background: `linear-gradient(90deg, ${t.color}, ${t.color}cc)`,
                  borderRadius: 3, transition: 'width 0.2s ease',
                }} />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Expanded mode: single-column with editing controls
  return (
    <div>
      {trackers.map((t) => {
        const pct = t.max > 0 ? Math.min(t.current / t.max, 1) : 0
        const isDragging = draggingId === t.id
        return (
          <div
            key={t.id}
            style={{ marginBottom: 6, position: 'relative' }}
            onMouseEnter={(e) => {
              const x = e.currentTarget.querySelector('.tracker-x') as HTMLElement
              if (x) x.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              const x = e.currentTarget.querySelector('.tracker-x') as HTMLElement
              if (x) x.style.opacity = '0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, marginBottom: 3, gap: 4 }}>
              {editingId === t.id ? (
                <input
                  autoFocus
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onBlur={() => commitLabelEdit(t.id, editingLabel)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitLabelEdit(t.id, editingLabel)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  style={{
                    flex: 1, padding: '1px 4px', borderRadius: 3,
                    background: 'rgba(255,255,255,0.08)', color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    outline: 'none', fontSize: 11, fontWeight: 600,
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <span
                  onClick={() => { setEditingId(t.id); setEditingLabel(t.label) }}
                  style={{
                    color: 'rgba(255,255,255,0.5)', fontWeight: 600,
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >{t.label}</span>
              )}
              <MiniHoldButton label="-" onTick={() => onUpdateTracker(t.id, { current: Math.max(0, t.current - 1) })} color="#ef4444" />
              <MiniHoldButton label="+" onTick={() => onUpdateTracker(t.id, { current: Math.min(t.max, t.current + 1) })} color="#22c55e" />
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>{t.current}/{t.max}</span>
            </div>
            <div
              style={{
                height: 10, borderRadius: 5,
                background: 'rgba(255,255,255,0.06)',
                overflow: 'hidden', position: 'relative',
                cursor: 'ew-resize', userSelect: 'none',
              }}
              onPointerDown={(e) => handleBarDrag(e, t)}
            >
              <div style={{
                height: '100%', width: `${pct * 100}%`,
                background: `linear-gradient(90deg, ${t.color}, ${t.color}cc)`,
                borderRadius: 5,
                transition: isDragging ? 'none' : 'width 0.2s ease',
              }} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700, color: '#fff',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
              }}>
                {t.current}/{t.max}
              </div>
            </div>
            {/* Hover-reveal delete button */}
            <span
              className="tracker-x"
              onClick={() => onDeleteTracker(t.id)}
              style={{
                position: 'absolute', top: -4, right: -4,
                width: 14, height: 14, borderRadius: '50%',
                background: 'rgba(30,30,40,0.95)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 9, fontWeight: 700, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                opacity: 0, transition: 'opacity 0.15s',
              }}
            >
              x
            </span>
          </div>
        )
      })}

      {/* Add tracker button */}
      {!addingNew ? (
        <button
          onClick={() => setAddingNew(true)}
          style={{
            marginTop: 4, width: '100%', padding: '5px 0',
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: 6, cursor: 'pointer',
            color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 600,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
        >
          + Add Metric
        </button>
      ) : (
        <input
          autoFocus
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onBlur={() => commitNewTracker(newLabel)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitNewTracker(newLabel)
            if (e.key === 'Escape') { setAddingNew(false); setNewLabel('') }
          }}
          placeholder="Metric name..."
          style={{
            marginTop: 4, width: '100%', padding: '5px 8px',
            background: 'rgba(255,255,255,0.06)', color: '#e4e4e7',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6, outline: 'none',
            fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/team/TeamMetricsTab.tsx
git commit -m "feat: add TeamMetricsTab with compact and expanded views"
```

---

### Task 3: Create TeamDashboard Shell Component

**Files:**
- Create: `src/team/TeamDashboard.tsx`

**Step 1: Create the dashboard component**

The dashboard has a fixed position, tab bar, and expand/collapse chevron (GM only). It renders the active tab content.

```tsx
import { useState } from 'react'
import * as Y from 'yjs'
import { useTeamMetrics } from './useTeamMetrics'
import { TeamMetricsTab } from './TeamMetricsTab'

interface TeamDashboardProps {
  yDoc: Y.Doc
  isGM: boolean
}

type TabId = 'metrics'

const TABS: { id: TabId; label: string }[] = [
  { id: 'metrics', label: 'Metrics' },
]

export function TeamDashboard({ yDoc, isGM }: TeamDashboardProps) {
  const { trackers, addTracker, updateTracker, deleteTracker } = useTeamMetrics(yDoc)
  const [activeTab, setActiveTab] = useState<TabId>('metrics')
  const [expanded, setExpanded] = useState(false)

  // Hide entire dashboard if no trackers and not GM
  if (trackers.length === 0 && !isGM) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 16,
        width: 546,
        zIndex: 10000,
        fontFamily: 'sans-serif',
        pointerEvents: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div style={{
        background: 'rgba(15, 15, 25, 0.92)',
        backdropFilter: 'blur(16px)',
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '8px 12px',
        color: '#e4e4e7',
      }}>
        {/* Tab bar + expand/collapse */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          marginBottom: 6,
        }}>
          <div style={{
            display: 'flex', gap: 2, flex: 1,
            background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 2,
          }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '4px 12px', border: 'none', cursor: 'pointer',
                  borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: activeTab === tab.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.15s',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {isGM && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.35)', padding: 4,
                display: 'flex', alignItems: 'center',
                transition: 'color 0.15s',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>

        {/* Active tab content */}
        {activeTab === 'metrics' && (
          <TeamMetricsTab
            trackers={trackers}
            expanded={expanded}
            isGM={isGM}
            onUpdateTracker={updateTracker}
            onAddTracker={addTracker}
            onDeleteTracker={deleteTracker}
          />
        )}
      </div>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/team/TeamDashboard.tsx
git commit -m "feat: add TeamDashboard shell with tab framework"
```

---

### Task 4: Mount TeamDashboard in App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add import and render**

Add import at top (after existing layout imports, ~line 21):
```ts
import { TeamDashboard } from './team/TeamDashboard'
```

Add component rendering after PortraitBar (around line 222), before MyCharacterCard:
```tsx
{/* Top-right: Team dashboard */}
<TeamDashboard yDoc={yDoc} isGM={isGM} />
```

This renders for ALL players (TeamDashboard hides itself when empty and non-GM).

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Verify in browser**

Run: `npm run dev`
- As GM: see empty dashboard with "Metrics" tab + expand chevron
- Click expand → see "Add Metric" button
- Add a metric → compact bar appears
- As player: see nothing (no trackers yet)
- After GM adds metrics → players see compact bars

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount TeamDashboard in App for all players"
```

---

### Task 5: Build & Final Verification

**Step 1: Run full typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run Vite build**

Run: `npx vite build`
Expected: Build succeeds

**Step 3: Manual browser test checklist**

1. GM: Dashboard visible top-right with "Metrics" tab
2. GM: Click expand chevron → expanded editing mode
3. GM: Click "Add Metric" → type name → Enter → metric appears
4. GM: Drag bar to change value → works smoothly
5. GM: +/- buttons → increment/decrement with hold-to-repeat
6. GM: Click label → inline edit → Enter to save
7. GM: Hover metric → x appears → click → deletes metric
8. GM: Collapse → compact dual-column bars
9. Player: Sees compact bars (read-only), no expand button
10. Player: When 0 metrics, dashboard hidden entirely

**Step 4: Final commit (if any fixes needed)**

```bash
git add -u
git commit -m "fix: address team dashboard issues from manual testing"
```
