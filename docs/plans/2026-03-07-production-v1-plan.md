# myVTT Production V1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the myVTT prototype into a production-ready VTT with user identity, token panel sidebar, dice presets, shared counters, measurement tool, player cursors, and Docker deployment.

**Architecture:** Seat-claiming identity system stored in Yjs (`Y.Map('players')`), right sidebar panel replacing floating overlay, canvas-only tldraw with all game logic in panel. All state synced via Yjs CRDT.

**Tech Stack:** tldraw v4.4.0, Yjs 13.6.29, y-websocket 2.1.0, React 19.2, Vite 7.3, TypeScript 5.9, Express 5.2, Docker

**Design Document:** `docs/plans/2026-03-07-production-v1-design.md`

---

## Phase 1: Identity & Panel (Architecture Foundation)

### Task 1: User Identity — useIdentity Hook

**Files:**
- Create: `src/identity/useIdentity.ts`
- Modify: `src/useYjsStore.ts` (export awareness)

**Step 1: Modify useYjsStore to export awareness**

In `src/useYjsStore.ts`, the `wsProvider` is created inside `useEffect` so it's not accessible outside. We need to restructure so awareness can be exported.

Change `src/useYjsStore.ts` — add `awareness` to the return value by storing `wsProvider` in a ref:

```typescript
// src/useYjsStore.ts — add these imports
import { useEffect, useRef, useState } from 'react'
// ... existing imports ...

export function useYjsStore() {
  // ... existing store and yDoc ...
  const [isLoading, setIsLoading] = useState(true)
  const wsProviderRef = useRef<WebsocketProvider | null>(null)

  useEffect(() => {
    // ... existing yArr, yStore setup ...

    const wsProvider = new WebsocketProvider(WEBSOCKET_URL, ROOM_NAME, yDoc)
    wsProviderRef.current = wsProvider

    // ... rest of existing effect (sync, listen, handleYjsChange) ...

    return () => {
      unsubscribe()
      yStore.off('change', handleYjsChange)
      wsProvider.destroy()
      wsProviderRef.current = null
    }
  }, [store, yDoc])

  return { store, yDoc, isLoading, awareness: wsProviderRef.current?.awareness ?? null }
}
```

**Step 2: Verify the app still compiles**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT && npx tsc --noEmit`
Expected: No new errors (awareness is nullable, won't break existing code)

**Step 3: Create useIdentity hook**

Create `src/identity/useIdentity.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'

export interface Seat {
  id: string
  name: string
  color: string
  role: 'GM' | 'PL'
}

const SEAT_STORAGE_KEY = 'myvtt-seat-id'
const SEAT_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']

export function useIdentity(yDoc: Y.Doc, awareness: Awareness | null) {
  const [seats, setSeats] = useState<Seat[]>([])
  const [mySeatId, setMySeatId] = useState<string | null>(null)

  const yPlayers = yDoc.getMap<Seat>('players')

  // Sync seats from Yjs
  useEffect(() => {
    const updateSeats = () => {
      const allSeats: Seat[] = []
      yPlayers.forEach((seat) => allSeats.push(seat))
      setSeats(allSeats)
    }
    updateSeats()
    yPlayers.observe(updateSeats)
    return () => yPlayers.unobserve(updateSeats)
  }, [yPlayers])

  // Auto-claim from localStorage on mount
  useEffect(() => {
    const cached = localStorage.getItem(SEAT_STORAGE_KEY)
    if (cached && yPlayers.has(cached)) {
      setMySeatId(cached)
    }
  }, [yPlayers])

  // Broadcast identity via awareness
  useEffect(() => {
    if (!awareness || !mySeatId) return
    const seat = yPlayers.get(mySeatId)
    if (seat) {
      awareness.setLocalStateField('seat', {
        seatId: seat.id,
        name: seat.name,
        color: seat.color,
      })
    }
  }, [awareness, mySeatId, seats]) // seats dep ensures re-broadcast on name/color change

  const claimSeat = useCallback((seatId: string) => {
    setMySeatId(seatId)
    localStorage.setItem(SEAT_STORAGE_KEY, seatId)
    // awareness update handled by the effect above
  }, [])

  const createSeat = useCallback((name: string, role: 'GM' | 'PL', color?: string) => {
    const id = crypto.randomUUID()
    const seatColor = color ?? SEAT_COLORS[seats.length % SEAT_COLORS.length]
    const seat: Seat = { id, name, color: seatColor, role }
    yPlayers.set(id, seat)
    claimSeat(id)
    return id
  }, [yPlayers, seats.length, claimSeat])

  const leaveSeat = useCallback(() => {
    setMySeatId(null)
    localStorage.removeItem(SEAT_STORAGE_KEY)
    if (awareness) {
      awareness.setLocalStateField('seat', null)
    }
  }, [awareness])

  const mySeat = mySeatId ? yPlayers.get(mySeatId) ?? null : null

  return {
    seats,
    mySeat,
    mySeatId,
    claimSeat,
    createSeat,
    leaveSeat,
    SEAT_COLORS,
  }
}
```

**Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS (new file compiles with no errors)

**Step 5: Commit**

```bash
git add src/identity/useIdentity.ts src/useYjsStore.ts
git commit -m "feat: add useIdentity hook with seat claiming + export awareness"
```

---

### Task 2: Seat Selection UI

**Files:**
- Create: `src/identity/SeatSelect.tsx`

**Step 1: Create SeatSelect component**

Create `src/identity/SeatSelect.tsx`:

```tsx
import { useState } from 'react'
import type { Seat } from './useIdentity'

interface SeatSelectProps {
  seats: Seat[]
  onClaim: (seatId: string) => void
  onCreate: (name: string, role: 'GM' | 'PL', color: string) => void
  colors: string[]
}

export function SeatSelect({ seats, onClaim, onCreate, colors }: SeatSelectProps) {
  const [mode, setMode] = useState<'choose' | 'create'>('choose')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'GM' | 'PL'>('PL')
  const [color, setColor] = useState(colors[0])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontFamily: 'sans-serif', background: '#f5f5f5',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 32,
        minWidth: 360, boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
      }}>
        <h2 style={{ margin: '0 0 24px', fontSize: 20, textAlign: 'center' }}>
          Join Session
        </h2>

        {/* Existing seats */}
        {seats.length > 0 && mode === 'choose' && (
          <>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
              Claim an existing seat:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {seats.map((seat) => (
                <button
                  key={seat.id}
                  onClick={() => onClaim(seat.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px', border: '1px solid #e5e7eb',
                    borderRadius: 8, background: '#fff', cursor: 'pointer',
                    fontSize: 14, textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: seat.color, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{seat.name}</span>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: seat.role === 'GM' ? '#fef3c7' : '#dbeafe',
                    color: seat.role === 'GM' ? '#92400e' : '#1e40af',
                  }}>
                    {seat.role}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center', color: '#999', fontSize: 12, margin: '12px 0' }}>or</div>
          </>
        )}

        {/* Create new seat */}
        {mode === 'choose' && (
          <button
            onClick={() => setMode('create')}
            style={{
              width: '100%', padding: '10px 16px',
              background: '#2563eb', color: '#fff', border: 'none',
              borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            Create New Seat
          </button>
        )}

        {mode === 'create' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
                Name
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your character name"
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #ddd',
                  borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
                Role
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['PL', 'GM'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    style={{
                      flex: 1, padding: '8px 12px', border: '2px solid',
                      borderColor: role === r ? '#2563eb' : '#e5e7eb',
                      borderRadius: 6, cursor: 'pointer', fontSize: 14,
                      fontWeight: 600,
                      background: role === r ? (r === 'GM' ? '#fef3c7' : '#dbeafe') : '#fff',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
                Color
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {colors.map((c) => (
                  <div
                    key={c}
                    onClick={() => setColor(c)}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: c,
                      cursor: 'pointer',
                      border: color === c ? '3px solid #111' : '3px solid transparent',
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setMode('choose')}
                style={{
                  flex: 1, padding: '10px', border: '1px solid #ddd',
                  borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14,
                }}
              >
                Back
              </button>
              <button
                onClick={() => name.trim() && onCreate(name.trim(), role, color)}
                disabled={!name.trim()}
                style={{
                  flex: 1, padding: '10px',
                  background: name.trim() ? '#2563eb' : '#ccc', color: '#fff',
                  border: 'none', borderRadius: 8,
                  cursor: name.trim() ? 'pointer' : 'default',
                  fontSize: 14, fontWeight: 600,
                }}
              >
                Join
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/identity/SeatSelect.tsx
git commit -m "feat: add SeatSelect UI component"
```

---

### Task 3: Integrate Identity into App + Refactor roleState

**Files:**
- Modify: `src/App.tsx` — conditional rendering (SeatSelect vs main UI), pass identity down
- Modify: `src/roleState.ts` — derive role from seat
- Modify: `src/RoleSwitcher.tsx` — replace with identity display + leave button
- Modify: `src/DiceSidebar.tsx` — show player name instead of role
- Modify: `src/useYjsStore.ts` — use env var for WS URL

**Step 1: Update roleState to support seat-based role**

Replace `src/roleState.ts`:

```typescript
import { atom } from 'tldraw'

// Role is now set by the identity system when a seat is claimed.
// Default to 'PL' — will be updated by App.tsx on seat claim.
export const currentRole = atom<'GM' | 'PL'>('currentRole', 'PL')
```

Note: We keep `currentRole` as an atom so `getShapeVisibility` and existing code still works. The App component will set it when the user claims a seat.

**Step 2: Refactor RoleSwitcher into identity badge**

Replace `src/RoleSwitcher.tsx`:

```tsx
import type { Seat } from './identity/useIdentity'

interface IdentityBadgeProps {
  seat: Seat
  onLeave: () => void
}

export function IdentityBadge({ seat, onLeave }: IdentityBadgeProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 60,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 8,
        padding: '6px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        fontFamily: 'sans-serif',
        fontSize: 13,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: seat.color,
      }} />
      <span style={{ fontWeight: 600, color: '#333' }}>{seat.name}</span>
      <span style={{
        fontSize: 11, padding: '1px 6px', borderRadius: 4,
        background: seat.role === 'GM' ? '#fef3c7' : '#dbeafe',
        color: seat.role === 'GM' ? '#92400e' : '#1e40af',
      }}>
        {seat.role}
      </span>
      <button
        onClick={onLeave}
        title="Leave seat"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#999', fontSize: 14, padding: '0 2px', lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}
```

**Step 3: Update DiceSidebar to show player name**

In `src/DiceSidebar.tsx`, change the props and roller display:

1. Add `playerName` prop:
```tsx
export function DiceSidebar({ yDoc, playerName }: { yDoc: Y.Doc; playerName: string }) {
```

2. Change `roller: role` to `roller: playerName` in both `handleRoll` and quick button handlers:
```typescript
// In handleRoll:
roller: playerName || 'Anonymous',

// In quick button onClick:
roller: playerName || 'Anonymous',
```

3. Update log entry display — the roller color should use seat color. For now, use a generic color since we just have the name:
```tsx
// Replace the roller display line:
<span style={{ fontWeight: 600, color: '#2563eb' }}>
  {entry.roller}
</span>
```

4. Remove `import { currentRole } from './roleState'` and `const role = useValue(currentRole)` since we use `playerName` prop now.

Also remove `import { useValue } from 'tldraw'` if no longer needed (but check — it may still be needed elsewhere).

**Step 4: Update App.tsx — integrate identity system**

Replace `src/App.tsx`:

```tsx
import { Tldraw, type TLShape } from 'tldraw'
import 'tldraw/tldraw.css'
import { useYjsStore } from './useYjsStore'
import { PropertyContextMenu } from './PropertyContextMenu'
import { PropertyOverlay } from './PropertyOverlay'
import { IdentityBadge } from './RoleSwitcher'
import { DiceSidebar } from './DiceSidebar'
import { SeatSelect } from './identity/SeatSelect'
import { useIdentity } from './identity/useIdentity'
import { currentRole } from './roleState'

function getShapeVisibility(shape: TLShape) {
  if (shape.meta?.gmOnly && currentRole.get() === 'PL') return 'hidden' as const
  return 'inherit' as const
}

export default function App() {
  const { store, yDoc, isLoading, awareness } = useYjsStore()
  const { seats, mySeat, claimSeat, createSeat, leaveSeat, SEAT_COLORS } = useIdentity(yDoc, awareness)

  // Update global role atom when seat changes
  if (mySeat) {
    currentRole.set(mySeat.role)
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'sans-serif', fontSize: '18px', color: '#666',
      }}>
        Connecting to server...
      </div>
    )
  }

  // Show seat selection if not seated
  if (!mySeat) {
    return (
      <SeatSelect
        seats={seats}
        onClaim={claimSeat}
        onCreate={createSeat}
        colors={SEAT_COLORS}
      />
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        store={store}
        getShapeVisibility={getShapeVisibility}
        components={{
          ContextMenu: PropertyContextMenu,
          InFrontOfTheCanvas: PropertyOverlay,
        }}
      />
      <IdentityBadge seat={mySeat} onLeave={leaveSeat} />
      <DiceSidebar yDoc={yDoc} playerName={mySeat.name} />
    </div>
  )
}
```

**Step 5: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Manual test**

Run: `npm run dev` (terminal 1) + `npm run server` (terminal 2)
1. Open browser → should see SeatSelect screen
2. Create new seat "TestGM" as GM → enter main UI → badge shows name
3. Open new incognito tab → should see seat list with "TestGM" → create "TestPL"
4. Roll dice in both tabs → log shows player names
5. Refresh first tab → auto-claimed from localStorage
6. Click × on badge → back to SeatSelect

**Step 7: Commit**

```bash
git add src/App.tsx src/roleState.ts src/RoleSwitcher.tsx src/DiceSidebar.tsx src/useYjsStore.ts
git commit -m "feat: integrate seat identity system, replace role switcher with identity badge"
```

---

### Task 4: Token Panel Sidebar

**Files:**
- Create: `src/panel/TokenPanel.tsx`
- Modify: `src/App.tsx` — layout with right sidebar

**Step 1: Create TokenPanel component**

Create `src/panel/TokenPanel.tsx`:

```tsx
import { useState } from 'react'
import { useEditor, useValue, type TLShapeId } from 'tldraw'

export function TokenPanel() {
  const editor = useEditor()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addKey, setAddKey] = useState('')
  const [addValue, setAddValue] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  const tokenData = useValue('tokenData', () => {
    const shapes = editor.getSelectedShapes()
    if (shapes.length !== 1) return null
    const shape = shapes[0]
    if (!shape.meta?.name) return null
    return {
      shapeId: shape.id,
      name: shape.meta.name as string,
      properties: (shape.meta.properties ?? []) as { key: string; value: string }[],
      gmOnly: shape.meta.gmOnly === true,
    }
  }, [editor])

  if (!tokenData) {
    return (
      <div style={{
        padding: 24, textAlign: 'center', color: '#999', fontSize: 13,
        fontFamily: 'sans-serif',
      }}>
        Select a token to view its properties
      </div>
    )
  }

  const updateProperty = (index: number, newValue: string) => {
    const shape = editor.getShape(tokenData.shapeId)
    if (!shape) return
    const props = [...(shape.meta.properties as { key: string; value: string }[])]
    props[index] = { ...props[index], value: newValue }
    editor.updateShape({
      id: shape.id, type: shape.type,
      meta: { ...shape.meta, properties: props },
    })
  }

  const deleteProperty = (index: number) => {
    const shape = editor.getShape(tokenData.shapeId)
    if (!shape) return
    const props = (shape.meta.properties as { key: string; value: string }[]).filter(
      (_, i) => i !== index
    )
    editor.updateShape({
      id: shape.id, type: shape.type,
      meta: { ...shape.meta, properties: props },
    })
    setEditingIndex(null)
  }

  const addProperty = () => {
    if (!addKey.trim()) return
    const shape = editor.getShape(tokenData.shapeId)
    if (!shape) return
    const existing = (shape.meta.properties ?? []) as { key: string; value: string }[]
    editor.updateShape({
      id: shape.id, type: shape.type,
      meta: {
        ...shape.meta,
        properties: [...existing, { key: addKey.trim(), value: addValue.trim() }],
      },
    })
    setAddKey('')
    setAddValue('')
    setIsAdding(false)
  }

  const updateName = (newName: string) => {
    const shape = editor.getShape(tokenData.shapeId)
    if (!shape || !newName.trim()) return
    editor.updateShape({
      id: shape.id, type: shape.type,
      meta: { ...shape.meta, name: newName.trim() },
    })
    setEditingName(false)
  }

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      {/* Token Name */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {editingName ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => updateName(nameValue)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') updateName(nameValue)
              if (e.key === 'Escape') setEditingName(false)
            }}
            style={{
              flex: 1, padding: '4px 8px', border: '1px solid #2563eb',
              borderRadius: 4, fontSize: 15, fontWeight: 700,
            }}
          />
        ) : (
          <span
            onClick={() => { setEditingName(true); setNameValue(tokenData.name) }}
            style={{ fontWeight: 700, fontSize: 15, cursor: 'pointer', flex: 1 }}
            title="Click to rename"
          >
            {tokenData.name}
          </span>
        )}
        {tokenData.gmOnly && (
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>
            GM Only
          </span>
        )}
      </div>

      {/* Properties */}
      <div style={{ padding: '8px 16px' }}>
        {tokenData.properties.map((prop, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0',
              borderBottom: i < tokenData.properties.length - 1 ? '1px solid #f3f4f6' : 'none',
            }}
          >
            <span style={{ fontWeight: 600, color: '#333', minWidth: 60 }}>{prop.key}</span>
            <span style={{ flex: 1 }} />
            {editingIndex === i ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => { updateProperty(i, editValue); setEditingIndex(null) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { updateProperty(i, editValue); setEditingIndex(null) }
                  if (e.key === 'Escape') setEditingIndex(null)
                }}
                style={{
                  width: 80, padding: '2px 6px', border: '1px solid #2563eb',
                  borderRadius: 4, fontSize: 13,
                }}
              />
            ) : (
              <span
                onClick={() => { setEditingIndex(i); setEditValue(prop.value) }}
                style={{
                  color: '#666', cursor: 'pointer',
                  borderBottom: '1px dashed #ccc', padding: '0 2px',
                }}
              >
                {prop.value || '—'}
              </span>
            )}
            <span
              onClick={() => deleteProperty(i)}
              style={{ color: '#ccc', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
              title="Delete property"
            >
              ×
            </span>
          </div>
        ))}

        {tokenData.properties.length === 0 && !isAdding && (
          <div style={{ color: '#999', padding: '8px 0' }}>No properties</div>
        )}

        {/* Add property form */}
        {isAdding ? (
          <div style={{ padding: '8px 0', borderTop: '1px solid #f3f4f6', marginTop: 4 }}>
            <input
              autoFocus
              placeholder="Key (e.g. HP)"
              value={addKey}
              onChange={(e) => setAddKey(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px', border: '1px solid #ddd',
                borderRadius: 4, fontSize: 13, marginBottom: 4, boxSizing: 'border-box',
              }}
            />
            <input
              placeholder="Value (e.g. 30)"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addProperty()}
              style={{
                width: '100%', padding: '6px 8px', border: '1px solid #ddd',
                borderRadius: 4, fontSize: 13, marginBottom: 8, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setIsAdding(false)} style={{
                flex: 1, padding: '4px', border: '1px solid #ddd', borderRadius: 4,
                background: '#fff', cursor: 'pointer', fontSize: 12,
              }}>Cancel</button>
              <button onClick={addProperty} disabled={!addKey.trim()} style={{
                flex: 1, padding: '4px', border: 'none', borderRadius: 4,
                background: addKey.trim() ? '#2563eb' : '#ccc', color: '#fff',
                cursor: addKey.trim() ? 'pointer' : 'default', fontSize: 12,
              }}>Add</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              width: '100%', padding: '6px', marginTop: 8,
              border: '1px dashed #ddd', borderRadius: 4,
              background: 'none', cursor: 'pointer', color: '#666', fontSize: 12,
            }}
          >
            + Add Property
          </button>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Update App.tsx layout — add right sidebar**

In `src/App.tsx`, modify the main UI return to include a right sidebar:

```tsx
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex' }}>
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Tldraw
          store={store}
          getShapeVisibility={getShapeVisibility}
          components={{
            ContextMenu: PropertyContextMenu,
            InFrontOfTheCanvas: PropertyOverlay,
          }}
        />
      </div>

      {/* Right Sidebar */}
      <div style={{
        width: 280, borderLeft: '1px solid #e5e7eb', background: '#fff',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Token Panel — needs editor context from Tldraw */}
        {/* Will be integrated after we solve the editor context issue */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* TokenPanel goes here — but it needs useEditor() which requires Tldraw context */}
        </div>
      </div>

      <IdentityBadge seat={mySeat} onLeave={leaveSeat} />
    </div>
  )
```

**Important design note:** `TokenPanel` uses `useEditor()` which requires it to be rendered inside `<Tldraw>`. We have two options:
- (A) Render TokenPanel inside Tldraw via a custom component
- (B) Pass the editor ref out of Tldraw

Option A is simpler. We'll render the sidebar _inside_ Tldraw using a custom component that portals outside:

Instead, restructure: render the sidebar panel as part of a wrapper component inside Tldraw that uses `createPortal` to render into a sidebar container outside the canvas.

Actually, the simplest approach: put the sidebar div OUTSIDE Tldraw, but use tldraw's `useEditor` inside by rendering TokenPanel within Tldraw's component tree via `components` or `onMount`.

**Better approach**: Use `onMount` to capture the editor reference, then pass it to TokenPanel.

Update `src/App.tsx`:

```tsx
import { useRef } from 'react'
import { Tldraw, type TLShape, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useYjsStore } from './useYjsStore'
import { PropertyContextMenu } from './PropertyContextMenu'
import { PropertyOverlay } from './PropertyOverlay'
import { IdentityBadge } from './RoleSwitcher'
import { DiceSidebar } from './DiceSidebar'
import { SeatSelect } from './identity/SeatSelect'
import { useIdentity } from './identity/useIdentity'
import { currentRole } from './roleState'
import { TokenPanel } from './panel/TokenPanel'

function getShapeVisibility(shape: TLShape) {
  if (shape.meta?.gmOnly && currentRole.get() === 'PL') return 'hidden' as const
  return 'inherit' as const
}

export default function App() {
  const { store, yDoc, isLoading, awareness } = useYjsStore()
  const { seats, mySeat, claimSeat, createSeat, leaveSeat, SEAT_COLORS } = useIdentity(yDoc, awareness)
  const editorRef = useRef<Editor | null>(null)

  if (mySeat) {
    currentRole.set(mySeat.role)
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'sans-serif', fontSize: '18px', color: '#666',
      }}>
        Connecting to server...
      </div>
    )
  }

  if (!mySeat) {
    return (
      <SeatSelect
        seats={seats}
        onClaim={claimSeat}
        onCreate={createSeat}
        colors={SEAT_COLORS}
      />
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <Tldraw
          store={store}
          getShapeVisibility={getShapeVisibility}
          onMount={(editor) => { editorRef.current = editor }}
          components={{
            ContextMenu: PropertyContextMenu,
            InFrontOfTheCanvas: PropertyOverlay,
          }}
        />
      </div>
      <div
        style={{
          width: 280, borderLeft: '1px solid #e5e7eb', background: '#fff',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DiceSidebar yDoc={yDoc} playerName={mySeat.name} />
      </div>
      <IdentityBadge seat={mySeat} onLeave={leaveSeat} />
    </div>
  )
}
```

**Wait** — TokenPanel needs `useEditor()` which only works inside Tldraw's React context. Since the sidebar is outside `<Tldraw>`, we can't use `useEditor()` there.

**Solution:** Modify TokenPanel to accept `editor` as a prop instead of using `useEditor()`. Replace `useEditor()` with prop, and use `useValue` directly (it doesn't require Tldraw context — it's just a tldraw reactive primitive).

Update `src/panel/TokenPanel.tsx` — change the component to accept an `editor` prop:

```tsx
import { useState } from 'react'
import { useValue, type Editor } from 'tldraw'

export function TokenPanel({ editor }: { editor: Editor }) {
  // Replace useEditor() with the prop
  // ... rest of code uses editor prop instead of useEditor()
```

Then in App.tsx, only render TokenPanel after editor is mounted:

```tsx
// Inside the sidebar div:
{editorRef.current && <TokenPanel editor={editorRef.current} />}
```

**But there's a problem**: `editorRef.current` is a ref, so changes to it won't trigger re-render. We need state:

```tsx
const [editor, setEditor] = useState<Editor | null>(null)

// In Tldraw:
onMount={(e) => setEditor(e)}

// In sidebar:
{editor && <TokenPanel editor={editor} />}
```

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Manual test**

1. Open app → claim seat → main UI
2. Right sidebar visible (dice roller in sidebar now)
3. Select a shape with `meta.name` → TokenPanel shows properties
4. Edit/add/delete properties → syncs to other tab
5. Select non-token shape → empty state message

**Step 5: Commit**

```bash
git add src/panel/TokenPanel.tsx src/App.tsx
git commit -m "feat: add TokenPanel sidebar with property editing"
```

---

### Task 5: Refactor Context Menu — Create Token, Copy Token

**Files:**
- Modify: `src/PropertyContextMenu.tsx`

**Step 1: Refactor context menu**

Update `src/PropertyContextMenu.tsx` to add:
- **Create Token**: prompts for name, sets `meta.name` → shape becomes a token
- **Copy Token**: duplicates shape with meta (name + " Copy")
- Keep existing: Add Property, Clear Properties, Hide/Show from Players
- Add Property and Clear Properties only show when shape is a token (has `meta.name`)

```tsx
import { useState } from 'react'
import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  useValue,
  type TLUiContextMenuProps,
} from 'tldraw'
import { currentRole } from './roleState'

export function PropertyContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor()
  const [showDialog, setShowDialog] = useState<'add-property' | 'create-token' | null>(null)
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')

  const selectedShapes = useValue('selectedShapes', () => editor.getSelectedShapes(), [editor])
  const singleShape = selectedShapes.length === 1 ? selectedShapes[0] : null
  const role = useValue(currentRole)
  const isGM = role === 'GM'
  const isToken = !!singleShape?.meta?.name
  const hasProperties =
    singleShape?.meta?.properties &&
    (singleShape.meta.properties as { key: string; value: string }[]).length > 0
  const isGmOnly = singleShape?.meta?.gmOnly === true

  const handleCreateToken = () => {
    setEditKey('')
    setShowDialog('create-token')
  }

  const handleSaveToken = () => {
    if (!singleShape || !editKey.trim()) return
    editor.updateShape({
      id: singleShape.id,
      type: singleShape.type,
      meta: {
        ...singleShape.meta,
        name: editKey.trim(),
        properties: singleShape.meta.properties ?? [],
      },
    })
    setShowDialog(null)
  }

  const handleCopyToken = () => {
    if (!singleShape) return
    // Duplicate the shape
    const serialized = editor.getShape(singleShape.id)
    if (!serialized) return
    editor.duplicateShapes([singleShape.id])
    // After duplication, the new shape is selected — update its name
    requestAnimationFrame(() => {
      const newShapes = editor.getSelectedShapes()
      const newShape = newShapes.find((s) => s.id !== singleShape.id)
      if (newShape) {
        editor.updateShape({
          id: newShape.id,
          type: newShape.type,
          meta: {
            ...newShape.meta,
            name: (singleShape.meta.name as string) + ' Copy',
          },
        })
      }
    })
  }

  const handleAddProperty = () => {
    setEditKey('')
    setEditValue('')
    setShowDialog('add-property')
  }

  const handleSaveProperty = () => {
    if (!singleShape || !editKey.trim()) return
    const existing = (singleShape.meta.properties ?? []) as { key: string; value: string }[]
    editor.updateShape({
      id: singleShape.id,
      type: singleShape.type,
      meta: {
        ...singleShape.meta,
        properties: [...existing, { key: editKey.trim(), value: editValue.trim() }],
      },
    })
    setShowDialog(null)
  }

  const handleClearProperties = () => {
    if (!singleShape) return
    editor.updateShape({
      id: singleShape.id,
      type: singleShape.type,
      meta: { ...singleShape.meta, properties: [] },
    })
  }

  const handleToggleVisibility = () => {
    if (!singleShape) return
    editor.updateShape({
      id: singleShape.id,
      type: singleShape.type,
      meta: { ...singleShape.meta, gmOnly: !isGmOnly },
    })
  }

  const dialogTitle = showDialog === 'create-token' ? 'Create Token' : 'Add Property'
  const dialogPlaceholder = showDialog === 'create-token' ? 'Token name (e.g. Goblin)' : 'Name (e.g. HP, AC)'
  const onDialogSave = showDialog === 'create-token' ? handleSaveToken : handleSaveProperty

  return (
    <>
      <DefaultContextMenu {...props}>
        <DefaultContextMenuContent />
        {singleShape && (
          <TldrawUiMenuGroup id="token-actions">
            {!isToken && (
              <TldrawUiMenuItem id="create-token" label="Create Token" onSelect={handleCreateToken} />
            )}
            {isToken && (
              <>
                <TldrawUiMenuItem id="copy-token" label="Copy Token" onSelect={handleCopyToken} />
                <TldrawUiMenuItem id="add-property" label="Add Property" onSelect={handleAddProperty} />
                {hasProperties && (
                  <TldrawUiMenuItem id="clear-properties" label="Clear Properties" onSelect={handleClearProperties} />
                )}
              </>
            )}
            {isGM && (
              <TldrawUiMenuItem
                id="toggle-visibility"
                label={isGmOnly ? 'Show to Players' : 'Hide from Players'}
                onSelect={handleToggleVisibility}
              />
            )}
          </TldrawUiMenuGroup>
        )}
      </DefaultContextMenu>

      {showDialog && (
        <div
          style={{
            position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 99999,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, minWidth: 300,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)', fontFamily: 'sans-serif',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{dialogTitle}</h3>
            <div style={{ marginBottom: showDialog === 'add-property' ? 12 : 16 }}>
              <input
                autoFocus
                placeholder={dialogPlaceholder}
                value={editKey}
                onChange={(e) => setEditKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onDialogSave()}
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #ddd',
                  borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>
            {showDialog === 'add-property' && (
              <div style={{ marginBottom: 16 }}>
                <input
                  placeholder="Value (e.g. 10, 15)"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onDialogSave()}
                  style={{
                    width: '100%', padding: '8px 12px', border: '1px solid #ddd',
                    borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDialog(null)}
                style={{
                  padding: '6px 16px', border: '1px solid #ddd', borderRadius: 6,
                  background: '#fff', cursor: 'pointer', fontSize: 14,
                }}
              >Cancel</button>
              <button
                onClick={onDialogSave}
                disabled={!editKey.trim()}
                style={{
                  padding: '6px 16px', border: 'none', borderRadius: 6,
                  background: editKey.trim() ? '#2563eb' : '#ccc', color: '#fff',
                  cursor: editKey.trim() ? 'pointer' : 'default', fontSize: 14,
                }}
              >
                {showDialog === 'create-token' ? 'Create' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Manual test**

1. Right-click an image → see "Create Token" option
2. Create token "Goblin" → right-click again → see "Copy Token", "Add Property", no "Create Token"
3. Copy token → new shape named "Goblin Copy" with same properties
4. Select token → TokenPanel shows in sidebar

**Step 4: Commit**

```bash
git add src/PropertyContextMenu.tsx
git commit -m "feat: refactor context menu with Create Token, Copy Token actions"
```

---

### Task 6: Remove PropertyOverlay

**Files:**
- Delete: `src/PropertyOverlay.tsx`
- Modify: `src/App.tsx` — remove InFrontOfTheCanvas component

**Step 1: Remove PropertyOverlay from App.tsx**

In `src/App.tsx`:
- Remove the import: `import { PropertyOverlay } from './PropertyOverlay'`
- Remove `InFrontOfTheCanvas: PropertyOverlay` from components prop

**Step 2: Delete PropertyOverlay.tsx**

Delete `src/PropertyOverlay.tsx`

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git rm src/PropertyOverlay.tsx
git add src/App.tsx
git commit -m "refactor: remove PropertyOverlay, replaced by TokenPanel sidebar"
```

---

### Task 7: Shared Counters

**Files:**
- Create: `src/panel/CounterBar.tsx`
- Modify: `src/App.tsx` — add CounterBar to sidebar

**Step 1: Create CounterBar component**

Create `src/panel/CounterBar.tsx`:

```tsx
import { useEffect, useState } from 'react'
import * as Y from 'yjs'

interface CounterBarProps {
  yDoc: Y.Doc
}

export function CounterBar({ yDoc }: CounterBarProps) {
  const yCounters = yDoc.getMap<number>('counters')
  const [counters, setCounters] = useState<Map<string, number>>(new Map())
  const [newName, setNewName] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    const update = () => {
      const m = new Map<string, number>()
      yCounters.forEach((val, key) => m.set(key, val))
      setCounters(m)
    }
    update()
    yCounters.observe(update)
    return () => yCounters.unobserve(update)
  }, [yCounters])

  const increment = (key: string) => yCounters.set(key, (yCounters.get(key) ?? 0) + 1)
  const decrement = (key: string) => yCounters.set(key, (yCounters.get(key) ?? 0) - 1)
  const remove = (key: string) => yCounters.delete(key)

  const addCounter = () => {
    if (!newName.trim()) return
    yCounters.set(newName.trim(), 0)
    setNewName('')
    setIsAdding(false)
  }

  return (
    <div style={{
      borderTop: '1px solid #e5e7eb', padding: '8px 16px',
      fontFamily: 'sans-serif', fontSize: 13,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#333' }}>Counters</span>
        <button
          onClick={() => setIsAdding(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#2563eb', fontSize: 12,
          }}
        >
          + Add
        </button>
      </div>

      {Array.from(counters.entries()).map(([key, val]) => (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 0',
        }}>
          <span style={{ flex: 1, color: '#555' }}>{key}</span>
          <button onClick={() => decrement(key)} style={btnStyle}>-</button>
          <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>{val}</span>
          <button onClick={() => increment(key)} style={btnStyle}>+</button>
          <span
            onClick={() => remove(key)}
            style={{ color: '#ccc', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
          >
            ×
          </span>
        </div>
      ))}

      {counters.size === 0 && !isAdding && (
        <div style={{ color: '#ccc', fontSize: 12, padding: '4px 0' }}>No counters</div>
      )}

      {isAdding && (
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <input
            autoFocus
            placeholder="Counter name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCounter()}
            style={{
              flex: 1, padding: '4px 8px', border: '1px solid #ddd',
              borderRadius: 4, fontSize: 12, boxSizing: 'border-box',
            }}
          />
          <button onClick={addCounter} style={{
            padding: '4px 8px', background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>Add</button>
          <button onClick={() => setIsAdding(false)} style={{
            padding: '4px 8px', background: '#fff', border: '1px solid #ddd',
            borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>×</button>
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  width: 22, height: 22, display: 'flex', alignItems: 'center',
  justifyContent: 'center', border: '1px solid #ddd', borderRadius: 4,
  background: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
}
```

**Step 2: Integrate into App.tsx sidebar**

Add `CounterBar` to the sidebar in `src/App.tsx`, between TokenPanel and DiceSidebar.

**Step 3: Verify compilation and test**

Run: `npx tsc --noEmit`
Manual test: counters appear in sidebar, +/- work, sync across tabs

**Step 4: Commit**

```bash
git add src/panel/CounterBar.tsx src/App.tsx
git commit -m "feat: add shared counters with Yjs sync"
```

---

### Task 8: Dice Presets

**Files:**
- Modify: `src/diceUtils.ts` — add preset types and multi-dice roll
- Modify: `src/DiceSidebar.tsx` — preset selector + auto-effect

**Step 1: Extend diceUtils**

Add to `src/diceUtils.ts`:

```typescript
export interface DicePreset {
  id: string
  name: string
  dice: Array<{ id: string; label: string; sides: number; color: string }>
  outcomes: Array<{
    when: string    // expression like 'hope > fear'
    label: string
    effect: 'notify' | 'increment_counter' | 'decrement_counter'
    counter?: string
  }>
}

export interface MultiDiceResult {
  presetName: string
  dice: Array<{ label: string; value: number; color: string }>
  outcome: { label: string; effect: string; counter?: string } | null
}

export const DEFAULT_PRESETS: DicePreset[] = [
  {
    id: 'daggerheart-2d12',
    name: 'Daggerheart 2d12',
    dice: [
      { id: 'hope', label: 'Hope', sides: 12, color: '#3b82f6' },
      { id: 'fear', label: 'Fear', sides: 12, color: '#ef4444' },
    ],
    outcomes: [
      {
        when: 'fear > hope',
        label: 'Fear',
        effect: 'increment_counter',
        counter: 'Fear',
      },
      {
        when: 'hope > fear',
        label: 'Hope',
        effect: 'notify',
      },
      {
        when: 'hope == fear',
        label: 'Critical!',
        effect: 'notify',
      },
    ],
  },
]

export function rollPreset(preset: DicePreset): MultiDiceResult {
  const results = preset.dice.map((d) => ({
    label: d.label,
    value: Math.floor(Math.random() * d.sides) + 1,
    color: d.color,
  }))

  // Build variable map for outcome evaluation
  const vars: Record<string, number> = {}
  results.forEach((r, i) => {
    vars[preset.dice[i].id] = r.value
  })

  // Evaluate outcomes
  let outcome: MultiDiceResult['outcome'] = null
  for (const o of preset.outcomes) {
    if (evaluateCondition(o.when, vars)) {
      outcome = { label: o.label, effect: o.effect, counter: o.counter }
      break
    }
  }

  return { presetName: preset.name, dice: results, outcome }
}

function evaluateCondition(when: string, vars: Record<string, number>): boolean {
  // Simple condition parser: "a > b", "a == b", "a < b", "a >= b", "a <= b"
  const match = when.match(/^(\w+)\s*(>|<|==|>=|<=)\s*(\w+)$/)
  if (!match) return false
  const left = vars[match[1]] ?? parseInt(match[1], 10)
  const right = vars[match[3]] ?? parseInt(match[3], 10)
  if (isNaN(left) || isNaN(right)) return false
  switch (match[2]) {
    case '>': return left > right
    case '<': return left < right
    case '==': return left === right
    case '>=': return left >= right
    case '<=': return left <= right
    default: return false
  }
}
```

**Step 2: Update DiceSidebar with preset support**

Add preset selector and auto-effect to `src/DiceSidebar.tsx`:

- Add import: `import { DEFAULT_PRESETS, rollPreset, type MultiDiceResult } from './diceUtils'`
- Add state: `const [selectedPreset, setSelectedPreset] = useState<string | null>(null)`
- Add a preset selector section above the custom input
- When preset is rolled: push a log entry AND trigger counter effect if applicable

The preset roll log entry format:
```typescript
{
  id: crypto.randomUUID(),
  roller: playerName,
  expression: `${result.presetName}: ${result.dice.map(d => `${d.label}=${d.value}`).join(', ')}`,
  rolls: result.dice.map(d => d.value),
  modifier: 0,
  total: result.dice.reduce((s, d) => s + d.value, 0),
  timestamp: Date.now(),
}
```

For counter auto-effect, DiceSidebar needs access to `yDoc.getMap('counters')`:
```typescript
if (result.outcome?.effect === 'increment_counter' && result.outcome.counter) {
  const yCounters = yDoc.getMap<number>('counters')
  const current = yCounters.get(result.outcome.counter) ?? 0
  yCounters.set(result.outcome.counter, current + 1)
}
if (result.outcome?.effect === 'decrement_counter' && result.outcome.counter) {
  const yCounters = yDoc.getMap<number>('counters')
  const current = yCounters.get(result.outcome.counter) ?? 0
  yCounters.set(result.outcome.counter, current - 1)
}
```

**Step 3: Verify and test**

Run: `npx tsc --noEmit`
Manual test: select Daggerheart preset → roll → auto-effect triggers counter

**Step 4: Commit**

```bash
git add src/diceUtils.ts src/DiceSidebar.tsx
git commit -m "feat: add dice presets with auto-effect counter integration"
```

---

## Phase 2: Canvas Enhancement

### Task 9: Measurement Tool

**Files:**
- Create: `src/tools/measureState.ts`
- Create: `src/tools/MeasureTool.ts`
- Create: `src/tools/MeasureOverlay.tsx`
- Modify: `src/App.tsx` — register tool + add toolbar button

**Step 1: Create measurement state atom**

Create `src/tools/measureState.ts`:

```typescript
import { atom } from 'tldraw'

export interface MeasureData {
  startX: number
  startY: number
  endX: number
  endY: number
}

export const measureData = atom<MeasureData | null>('measureData', null)
export const pixelsPerUnit = atom<number>('pixelsPerUnit', 50) // 50px = 1 unit (5ft)
```

**Step 2: Create MeasureTool StateNode**

Create `src/tools/MeasureTool.ts`:

```typescript
import { StateNode, type TLPointerEventInfo } from 'tldraw'
import { measureData } from './measureState'

class Idle extends StateNode {
  static override id = 'idle'

  override onPointerDown(info: TLPointerEventInfo) {
    const { x, y } = this.editor.inputs.currentPagePoint
    measureData.set({ startX: x, startY: y, endX: x, endY: y })
    this.parent.transition('measuring')
  }
}

class Measuring extends StateNode {
  static override id = 'measuring'

  override onPointerMove() {
    const current = measureData.get()
    if (!current) return
    const { x, y } = this.editor.inputs.currentPagePoint
    measureData.set({ ...current, endX: x, endY: y })
  }

  override onPointerUp() {
    this.parent.transition('idle')
  }

  override onCancel() {
    measureData.set(null)
    this.parent.transition('idle')
  }
}

export class MeasureTool extends StateNode {
  static override id = 'measure'
  static override initial = 'idle'
  static override children = () => [Idle, Measuring]

  override onExit() {
    measureData.set(null)
  }
}
```

**Step 3: Create MeasureOverlay component**

Create `src/tools/MeasureOverlay.tsx`:

```tsx
import { useValue, useEditor } from 'tldraw'
import { measureData, pixelsPerUnit } from './measureState'

export function MeasureOverlay() {
  const editor = useEditor()
  const data = useValue(measureData)
  const ppu = useValue(pixelsPerUnit)

  if (!data) return null

  const startScreen = editor.pageToScreen({ x: data.startX, y: data.startY })
  const endScreen = editor.pageToScreen({ x: data.endX, y: data.endY })

  const dx = data.endX - data.startX
  const dy = data.endY - data.startY
  const distPx = Math.sqrt(dx * dx + dy * dy)
  const distUnits = (distPx / ppu).toFixed(1)

  const midX = (startScreen.x + endScreen.x) / 2
  const midY = (startScreen.y + endScreen.y) / 2

  return (
    <svg
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        width: '100%', height: '100%',
      }}
    >
      <line
        x1={startScreen.x} y1={startScreen.y}
        x2={endScreen.x} y2={endScreen.y}
        stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4"
      />
      <circle cx={startScreen.x} cy={startScreen.y} r={4} fill="#2563eb" />
      <circle cx={endScreen.x} cy={endScreen.y} r={4} fill="#2563eb" />
      <rect
        x={midX - 30} y={midY - 12} width={60} height={24} rx={4}
        fill="rgba(37,99,235,0.9)"
      />
      <text
        x={midX} y={midY + 4} textAnchor="middle" fill="#fff"
        fontSize={12} fontFamily="sans-serif" fontWeight={600}
      >
        {distUnits}
      </text>
    </svg>
  )
}
```

**Step 4: Register MeasureTool in App.tsx**

In `src/App.tsx`:

```tsx
import { MeasureTool } from './tools/MeasureTool'
import { MeasureOverlay } from './tools/MeasureOverlay'

// In Tldraw component:
<Tldraw
  store={store}
  getShapeVisibility={getShapeVisibility}
  tools={[MeasureTool]}
  onMount={(editor) => setEditor(editor)}
  components={{
    ContextMenu: PropertyContextMenu,
    InFrontOfTheCanvas: MeasureOverlay,
  }}
/>
```

Add a toolbar button (fixed position, next to identity badge):

```tsx
<button
  onClick={() => editor?.setCurrentTool('measure')}
  style={{
    position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)',
    zIndex: 99999, padding: '8px 16px', background: '#fff', border: '1px solid #ddd',
    borderRadius: 8, cursor: 'pointer', fontFamily: 'sans-serif', fontSize: 13,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  }}
>
  Measure
</button>
```

**Step 5: Verify and test**

Run: `npx tsc --noEmit`
Manual test: click Measure → drag on canvas → see dashed line + distance → Esc clears

**Step 6: Commit**

```bash
git add src/tools/
git add src/App.tsx
git commit -m "feat: add measurement tool with distance overlay"
```

---

### Task 10: Player Cursors

**Files:**
- Create: `src/cursors/useCursors.ts`
- Create: `src/cursors/CursorOverlay.tsx`
- Modify: `src/App.tsx` — integrate cursor overlay

**Step 1: Create useCursors hook**

Create `src/cursors/useCursors.ts`:

```typescript
import { useEffect, useState } from 'react'
import type { Awareness } from 'y-protocols/awareness'

export interface RemoteCursor {
  seatId: string
  name: string
  color: string
  x: number
  y: number
}

export function useCursors(awareness: Awareness | null) {
  const [cursors, setCursors] = useState<RemoteCursor[]>([])

  useEffect(() => {
    if (!awareness) return

    const update = () => {
      const states = awareness.getStates()
      const clientId = awareness.clientID
      const remote: RemoteCursor[] = []

      states.forEach((state, id) => {
        if (id === clientId) return
        if (state.cursor && state.seat) {
          remote.push({
            seatId: state.seat.seatId,
            name: state.seat.name,
            color: state.seat.color,
            x: state.cursor.x,
            y: state.cursor.y,
          })
        }
      })

      setCursors(remote)
    }

    awareness.on('change', update)
    return () => awareness.off('change', update)
  }, [awareness])

  return cursors
}

export function useBroadcastCursor(awareness: Awareness | null) {
  useEffect(() => {
    if (!awareness) return

    const handlePointerMove = (e: PointerEvent) => {
      awareness.setLocalStateField('cursor', { x: e.clientX, y: e.clientY })
    }

    const handlePointerLeave = () => {
      awareness.setLocalStateField('cursor', null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [awareness])
}
```

**Step 2: Create CursorOverlay component**

Create `src/cursors/CursorOverlay.tsx`:

```tsx
import type { RemoteCursor } from './useCursors'

export function CursorOverlay({ cursors }: { cursors: RemoteCursor[] }) {
  return (
    <>
      {cursors.map((c) => (
        <div
          key={c.seatId}
          style={{
            position: 'fixed',
            left: c.x,
            top: c.y,
            pointerEvents: 'none',
            zIndex: 99998,
            transform: 'translate(-2px, -2px)',
          }}
        >
          {/* Arrow cursor */}
          <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
            <path
              d="M0 0L16 12H6L3 20L0 0Z"
              fill={c.color}
              stroke="#fff"
              strokeWidth={1}
            />
          </svg>
          <span style={{
            position: 'absolute', left: 16, top: 12,
            background: c.color, color: '#fff',
            padding: '1px 6px', borderRadius: 4,
            fontSize: 10, fontFamily: 'sans-serif',
            whiteSpace: 'nowrap',
          }}>
            {c.name}
          </span>
        </div>
      ))}
    </>
  )
}
```

**Step 3: Integrate into App.tsx**

```tsx
import { useCursors, useBroadcastCursor } from './cursors/useCursors'
import { CursorOverlay } from './cursors/CursorOverlay'

// Inside App component (after useIdentity):
const cursors = useCursors(awareness)
useBroadcastCursor(awareness)

// In the JSX, add after IdentityBadge:
<CursorOverlay cursors={cursors} />
```

**Step 4: Verify and test**

Run: `npx tsc --noEmit`
Manual test: open two browser tabs → move mouse → see cursor with seat color

**Step 5: Commit**

```bash
git add src/cursors/
git add src/App.tsx
git commit -m "feat: add player cursor display via Yjs awareness"
```

---

## Phase 3: Deployment

### Task 11: URL Environment Variables

**Files:**
- Create: `.env`
- Create: `.env.production`
- Modify: `src/useYjsStore.ts` — use env vars
- Modify: `src/assetStore.ts` — use env vars

**Step 1: Create .env files**

`.env`:
```
VITE_WS_URL=ws://localhost:4444
VITE_API_URL=http://localhost:4444
```

`.env.production`:
```
# In production (single server), use relative URLs
VITE_WS_URL=
VITE_API_URL=
```

**Step 2: Update useYjsStore.ts**

```typescript
const WEBSOCKET_URL = import.meta.env.VITE_WS_URL ||
  `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
```

**Step 3: Update assetStore.ts**

```typescript
const API_BASE = import.meta.env.VITE_API_URL || ''

export const assetStore: TLAssetStore = {
  async upload(_asset, file) {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST', body: formData,
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
    const { url } = await res.json()
    return { src: `${API_BASE}${url}` }
  },
  resolve(asset) {
    return asset.props.src
  },
}
```

**Step 4: Verify and commit**

```bash
git add .env .env.production src/useYjsStore.ts src/assetStore.ts
git commit -m "feat: environment-based URL configuration"
```

---

### Task 12: Production Mode — Single Server

**Files:**
- Modify: `server/index.mjs` — serve Vite build output
- Modify: `package.json` — add production start script

**Step 1: Update server/index.mjs**

Add static file serving for the Vite build output, before the default route:

```javascript
// Serve Vite build in production
const DIST_DIR = path.join(__dirname, '..', 'dist')
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/') || req.url === '/admin') {
      return next()
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}
```

**Step 2: Update package.json scripts**

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "server": "node server/index.mjs",
  "start": "npm run build && NODE_ENV=production node server/index.mjs"
}
```

Also change HOST default to `'0.0.0.0'` in server/index.mjs to listen on all interfaces in production:

```javascript
const HOST = process.env.HOST || '0.0.0.0'
```

**Step 3: Verify**

Run: `npm run start`
Open: `http://localhost:4444` → should show the full app
Test: All features work (sync, identity, dice, etc.)

**Step 4: Commit**

```bash
git add server/index.mjs package.json
git commit -m "feat: production mode single-server with Vite build serving"
```

---

### Task 13: Docker Deployment

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Step 1: Create .dockerignore**

```
node_modules
dist
db
server/uploads
.git
.env
*.md
```

**Step 2: Create Dockerfile**

```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY server/ ./server/
EXPOSE 4444
ENV HOST=0.0.0.0
ENV PORT=4444
CMD ["node", "server/index.mjs"]
```

**Step 3: Create docker-compose.yml**

```yaml
services:
  myvtt:
    build: .
    ports:
      - "4444:4444"
    volumes:
      - vtt-data:/app/db
      - vtt-uploads:/app/server/uploads
    restart: unless-stopped

volumes:
  vtt-data:
  vtt-uploads:
```

**Step 4: Verify**

Run: `docker-compose up --build`
Open: `http://localhost:4444` → full app working
Test: restart container → data persists (seats, tokens, counters, dice log)

**Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: add Docker deployment with persistent volumes"
```

---

## Verification Checklist

### Identity System
- [ ] First visit → SeatSelect → create seat → enter main UI
- [ ] Refresh → auto-claim from localStorage
- [ ] New browser → SeatSelect → claim existing seat → data intact
- [ ] Two users online → independent seats → awareness shows both

### Token Panel
- [ ] Drag image → right-click "Create Token" → input name → panel shows info
- [ ] Click token → panel shows properties → edit → sync to other tab
- [ ] Right-click "Copy Token" → new token with independent properties
- [ ] Delete token → data gone → no cleanup needed
- [ ] Click non-token → panel shows empty state

### Dice Presets
- [ ] Select Daggerheart preset → roll → auto-judge Hope/Fear → Fear counter +1
- [ ] Dice log shows "PlayerName: Daggerheart 2d12: Hope=X, Fear=Y"

### Shared Counters
- [ ] Add counter "Fear" → +/- buttons work → sync across tabs
- [ ] Dice preset auto-increments counter

### Measurement Tool
- [ ] Click Measure → drag → dashed line + distance label → Esc clears

### Player Cursors
- [ ] Two tabs → move mouse → see cursor with seat color + name

### Production Deployment
- [ ] `docker-compose up --build` → `http://localhost:4444` → all features work
- [ ] Container restart → data persists (seats, tokens, counters, dice log)

### Regression
- [ ] Canvas sync → shapes appear in both tabs
- [ ] GM/PL visibility → GM-only shapes hidden for PL seat
- [ ] Dice log → all rolls visible to all users
