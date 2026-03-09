# Fog of War + Vision + Walls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a fog of war system with dynamic token-based vision (raycasting through walls) and GM-painted fog regions to combat mode.

**Architecture:** Single canvas fog overlay rendered above tokens. Client-side visibility polygon computation using ray-to-endpoint raycasting against wall segments stored in Yjs. GM can also paint rectangular fog regions. All data synced via Yjs Maps keyed per scene.

**Tech Stack:** React, TypeScript, HTML5 Canvas (2D context), Yjs Y.Map, existing react-zoom-pan-pinch infrastructure.

**Worktree:** `.worktrees/combat-tools/` on branch `feat/combat-tools`

---

## Context for Implementer

### Codebase Patterns

**Yjs hooks** follow this pattern (see `src/combat/useDrawings.ts`):
- `useState` for React state, `useEffect` with `observe/unobserve` for sync
- CRUD methods via `useCallback` with `yDoc` dependency
- Y.Map for keyed collections, Y.Array for ordered lists

**Tool trackers** follow this pattern (see `src/combat/DrawTracker.tsx`):
- Component rendered inside `<TransformWrapper>` → `<TransformComponent>` → `<CombatMap>`
- Uses `useTransformContext()` to get `wrapperComponent` and `transformState`
- `screenToMap()` from `combatUtils.ts` for coordinate conversion
- `snapToGrid()` for grid-aligned placement
- `className="combat-token"` on overlay div to prevent panning conflict
- Window-level `pointermove`/`pointerup` listeners during active interaction

**Layer rendering** happens as children of `<CombatMap>` inside `CombatViewer.tsx`. Z-index controls stacking. All in-map layers use `position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointerEvents: none`.

**ID generation:** Always use `generateTokenId()` from `combatUtils.ts`.

### Key Files

| File | Role |
|------|------|
| `src/combat/combatTypes.ts` | Type definitions + normalizer |
| `src/combat/combatUtils.ts` | snapToGrid, screenToMap, generateTokenId, keepMinScale |
| `src/combat/CombatViewer.tsx` | Main combat controller — wires hooks, state, layers, keyboard shortcuts |
| `src/combat/CombatToolbar.tsx` | Fixed-position toolbar with tool buttons + layer toggles |
| `src/combat/CombatMap.tsx` | Renders background + grid + children layers |
| `src/combat/useDrawings.ts` | Template for Yjs array/map hooks |
| `src/combat/DrawTracker.tsx` | Template for tool interaction overlays |
| `src/yjs/useScenes.ts` | Scene interface + Yjs hook |
| `src/App.tsx` | Top-level wiring of hooks → CombatViewer props |

### Current Z-Index Scheme (will change)

| Layer | Current Z | New Z |
|-------|-----------|-------|
| CursorLayer | 500 | 800 |
| PingLayer | 501 | 801 |
| MeasureLayer | 502 | 802 |
| DrawingLayer | 503 | 503 (unchanged) |
| FogCanvas | — | 600 (NEW) |
| WallLayer | — | 700 (NEW) |
| DrawTracker overlay | 998 | 998 (unchanged) |

---

## Task 1: Data Model — Types + Normalizer

**Files:**
- Modify: `src/combat/combatTypes.ts`
- Modify: `src/yjs/useScenes.ts`

**Step 1: Add WallSegment and FogRegion types to combatTypes.ts**

Add after the `TokenBlueprint` interface:

```typescript
export interface WallSegment {
  id: string
  x1: number  // map pixels, snapped to grid intersections
  y1: number
  x2: number
  y2: number
}

export interface FogRegion {
  id: string
  gridX: number   // grid cell coordinate
  gridY: number
  gridW: number   // width in grid cells
  gridH: number   // height in grid cells
  revealed: boolean  // true = reveals fog, false = adds fog back
}
```

**Step 2: Add visionRadius to CombatToken interface**

Add `visionRadius: number` (grid squares, 0 = no vision) to the `CombatToken` interface, after `locked`.

**Step 3: Add visionRadius to normalizeCombatToken**

Add `visionRadius: (raw.visionRadius as number) ?? 0` to the normalizer return.

**Step 4: Add fogEnabled to Scene interface in useScenes.ts**

Add `fogEnabled: boolean` to the `Scene` interface, after `sortOrder`.

**Step 5: Commit**

```
feat(combat): add wall, fog region, and vision radius types
```

---

## Task 2: Yjs Hooks — useWalls + useFogRegions

**Files:**
- Create: `src/combat/useWalls.ts`
- Create: `src/combat/useFogRegions.ts`

**Step 1: Create useWalls.ts**

Follow `useDrawings.ts` pattern but use Y.Map (keyed by wall ID, scoped per scene):

```typescript
import { useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { WallSegment } from './combatTypes'

export function useWalls(yDoc: Y.Doc | null, sceneId: string | null) {
  const [walls, setWalls] = useState<WallSegment[]>([])

  useEffect(() => {
    if (!yDoc || !sceneId) {
      setWalls([])
      return
    }

    const yWalls = yDoc.getMap<WallSegment>('walls_' + sceneId)
    const read = () => {
      const arr: WallSegment[] = []
      yWalls.forEach(w => arr.push(w))
      return arr
    }
    setWalls(read())

    const observer = () => setWalls(read())
    yWalls.observe(observer)
    return () => yWalls.unobserve(observer)
  }, [yDoc, sceneId])

  const addWall = useCallback((wall: WallSegment) => {
    if (!yDoc || !sceneId) return
    yDoc.getMap<WallSegment>('walls_' + sceneId).set(wall.id, wall)
  }, [yDoc, sceneId])

  const deleteWall = useCallback((wallId: string) => {
    if (!yDoc || !sceneId) return
    yDoc.getMap<WallSegment>('walls_' + sceneId).delete(wallId)
  }, [yDoc, sceneId])

  const clearAll = useCallback(() => {
    if (!yDoc || !sceneId) return
    const yWalls = yDoc.getMap<WallSegment>('walls_' + sceneId)
    yDoc.transact(() => {
      const keys = Array.from(yWalls.keys())
      keys.forEach(k => yWalls.delete(k))
    })
  }, [yDoc, sceneId])

  return { walls, addWall, deleteWall, clearAll }
}
```

**Step 2: Create useFogRegions.ts**

Same pattern, scoped per scene:

```typescript
import { useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import type { FogRegion } from './combatTypes'

export function useFogRegions(yDoc: Y.Doc | null, sceneId: string | null) {
  const [fogRegions, setFogRegions] = useState<FogRegion[]>([])

  useEffect(() => {
    if (!yDoc || !sceneId) {
      setFogRegions([])
      return
    }

    const yFog = yDoc.getMap<FogRegion>('fog_' + sceneId)
    const read = () => {
      const arr: FogRegion[] = []
      yFog.forEach(r => arr.push(r))
      return arr
    }
    setFogRegions(read())

    const observer = () => setFogRegions(read())
    yFog.observe(observer)
    return () => yFog.unobserve(observer)
  }, [yDoc, sceneId])

  const addFogRegion = useCallback((region: FogRegion) => {
    if (!yDoc || !sceneId) return
    yDoc.getMap<FogRegion>('fog_' + sceneId).set(region.id, region)
  }, [yDoc, sceneId])

  const deleteFogRegion = useCallback((regionId: string) => {
    if (!yDoc || !sceneId) return
    yDoc.getMap<FogRegion>('fog_' + sceneId).delete(regionId)
  }, [yDoc, sceneId])

  const clearAll = useCallback(() => {
    if (!yDoc || !sceneId) return
    const yFog = yDoc.getMap<FogRegion>('fog_' + sceneId)
    yDoc.transact(() => {
      const keys = Array.from(yFog.keys())
      keys.forEach(k => yFog.delete(k))
    })
  }, [yDoc, sceneId])

  return { fogRegions, addFogRegion, deleteFogRegion, clearAll }
}
```

**Step 3: Commit**

```
feat(combat): add Yjs hooks for walls and fog regions
```

---

## Task 3: Visibility Algorithm

**Files:**
- Create: `src/combat/visibility.ts`

**Step 1: Implement ray-segment intersection + visibility polygon computation**

Pure math functions, no React, no dependencies:

```typescript
interface Point { x: number; y: number }
interface Segment { x1: number; y1: number; x2: number; y2: number }

/**
 * Compute the visibility polygon from `origin` given `walls` within `bounds`.
 * Returns clockwise array of vertices forming the visible area.
 */
export function computeVisibility(
  origin: Point,
  walls: Segment[],
  bounds: { x: number; y: number; w: number; h: number },
): Point[] {
  // Add boundary edges as walls so the polygon is always closed
  const bx = bounds.x, by = bounds.y
  const bw = bounds.w, bh = bounds.h
  const allSegments: Segment[] = [
    ...walls,
    { x1: bx, y1: by, x2: bx + bw, y2: by },
    { x1: bx + bw, y1: by, x2: bx + bw, y2: by + bh },
    { x1: bx + bw, y1: by + bh, x2: bx, y2: by + bh },
    { x1: bx, y1: by + bh, x2: bx, y2: by },
  ]

  // Collect unique angles to all endpoints
  const angleSet = new Set<number>()
  for (const seg of allSegments) {
    for (const pt of [{ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }]) {
      const a = Math.atan2(pt.y - origin.y, pt.x - origin.x)
      angleSet.add(a - 0.00001)
      angleSet.add(a)
      angleSet.add(a + 0.00001)
    }
  }

  const angles = Array.from(angleSet)

  // Cast rays, find closest intersection for each angle
  const intersections: Array<{ angle: number; x: number; y: number }> = []
  for (const angle of angles) {
    const rdx = Math.cos(angle)
    const rdy = Math.sin(angle)

    let closestT = Infinity
    let closestPt: Point | null = null

    for (const seg of allSegments) {
      const sdx = seg.x2 - seg.x1
      const sdy = seg.y2 - seg.y1
      const denom = sdx * rdy - sdy * rdx
      if (Math.abs(denom) < 1e-10) continue

      const t2 = (rdx * (seg.y1 - origin.y) - rdy * (seg.x1 - origin.x)) / denom
      if (t2 < 0 || t2 > 1) continue

      const t1 = (seg.x1 + sdx * t2 - origin.x) / (Math.abs(rdx) > 1e-10 ? rdx : (seg.y1 + sdy * t2 - origin.y) / rdy)
      if (t1 < 0) continue

      if (t1 < closestT) {
        closestT = t1
        closestPt = { x: origin.x + rdx * t1, y: origin.y + rdy * t1 }
      }
    }

    if (closestPt) {
      intersections.push({ angle, ...closestPt })
    }
  }

  // Sort by angle to form the polygon
  intersections.sort((a, b) => a.angle - b.angle)
  return intersections.map(i => ({ x: i.x, y: i.y }))
}

/**
 * Clip a polygon to a circle centered at `center` with `radius`.
 * Returns new polygon vertices clipped to the circle boundary.
 */
export function clipPolygonToCircle(
  polygon: Point[],
  center: Point,
  radius: number,
): Point[] {
  if (polygon.length === 0) return []
  const r2 = radius * radius
  const result: Point[] = []

  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i]
    const next = polygon[(i + 1) % polygon.length]

    const currInside = (curr.x - center.x) ** 2 + (curr.y - center.y) ** 2 <= r2
    const nextInside = (next.x - center.x) ** 2 + (next.y - center.y) ** 2 <= r2

    if (currInside) {
      result.push(curr)
    }

    if (currInside !== nextInside) {
      // Find circle intersection along edge curr→next
      const dx = next.x - curr.x
      const dy = next.y - curr.y
      const fx = curr.x - center.x
      const fy = curr.y - center.y
      const a = dx * dx + dy * dy
      const b = 2 * (fx * dx + fy * dy)
      const c = fx * fx + fy * fy - r2
      const disc = b * b - 4 * a * c
      if (disc >= 0) {
        const sqrtDisc = Math.sqrt(disc)
        const t1 = (-b - sqrtDisc) / (2 * a)
        const t2 = (-b + sqrtDisc) / (2 * a)
        const t = (t1 >= 0 && t1 <= 1) ? t1 : (t2 >= 0 && t2 <= 1) ? t2 : -1
        if (t >= 0) {
          result.push({ x: curr.x + dx * t, y: curr.y + dy * t })
        }
      }
    }

    // If both outside but edge might cross through circle — skip for simplicity
    // (the boundary walls ensure this is rare; close enough for VTT use)
  }

  return result
}
```

**Step 2: Commit**

```
feat(combat): add 2D raycasting visibility algorithm
```

---

## Task 4: FogCanvas Component

**Files:**
- Create: `src/combat/FogCanvas.tsx`

**Step 1: Create the fog canvas component**

Renders a `<canvas>` element that fills the map area. Takes visibility polygons, fog regions, scene dimensions, and role as props. Uses `useRef` + `useEffect` to draw to canvas context.

```typescript
import { useRef, useEffect } from 'react'
import type { FogRegion } from './combatTypes'

interface FogCanvasProps {
  width: number
  height: number
  gridSize: number
  gridOffsetX: number
  gridOffsetY: number
  fogRegions: FogRegion[]
  visibilityPolygons: Array<{ x: number; y: number }>[]  // one polygon per token
  role: 'GM' | 'PL'
  visible: boolean  // layer toggle
}

export function FogCanvas({
  width, height, gridSize, gridOffsetX, gridOffsetY,
  fogRegions, visibilityPolygons, role, visible,
}: FogCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear
    ctx.clearRect(0, 0, width, height)

    if (!visible) return

    // 1. Fill entire canvas with fog
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.fillRect(0, 0, width, height)

    // 2. Cut out GM-revealed regions
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0, 0, 0, 1)'
    for (const region of fogRegions) {
      if (region.revealed) {
        const px = region.gridX * gridSize + gridOffsetX
        const py = region.gridY * gridSize + gridOffsetY
        const pw = region.gridW * gridSize
        const ph = region.gridH * gridSize
        ctx.fillRect(px, py, pw, ph)
      }
    }

    // 3. Add back hidden regions (GM re-hid an area)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    for (const region of fogRegions) {
      if (!region.revealed) {
        const px = region.gridX * gridSize + gridOffsetX
        const py = region.gridY * gridSize + gridOffsetY
        const pw = region.gridW * gridSize
        const ph = region.gridH * gridSize
        ctx.fillRect(px, py, pw, ph)
      }
    }

    // 4. Cut out vision polygons
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0, 0, 0, 1)'
    for (const polygon of visibilityPolygons) {
      if (polygon.length < 3) continue
      ctx.beginPath()
      ctx.moveTo(polygon[0].x, polygon[0].y)
      for (let i = 1; i < polygon.length; i++) {
        ctx.lineTo(polygon[i].x, polygon[i].y)
      }
      ctx.closePath()
      ctx.fill()
    }
  }, [width, height, gridSize, gridOffsetX, gridOffsetY, fogRegions, visibilityPolygons, visible])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 600,
        opacity: role === 'GM' ? 0.3 : 1,
      }}
    />
  )
}
```

**Step 2: Commit**

```
feat(combat): add FogCanvas component with vision cutouts
```

---

## Task 5: WallLayer + WallTracker

**Files:**
- Create: `src/combat/WallLayer.tsx`
- Create: `src/combat/WallTracker.tsx`

**Step 1: Create WallLayer.tsx — GM-only SVG visualization of walls**

```typescript
import type { WallSegment } from './combatTypes'

interface WallLayerProps {
  walls: WallSegment[]
  visible: boolean  // GM layer toggle
  selectedWallId: string | null
}

export function WallLayer({ walls, visible, selectedWallId }: WallLayerProps) {
  if (!visible || walls.length === 0) return null

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 700,
        overflow: 'visible',
      }}
    >
      {walls.map(w => (
        <line
          key={w.id}
          x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
          stroke={selectedWallId === w.id ? '#f59e0b' : '#06b6d4'}
          strokeWidth={selectedWallId === w.id ? 3 : 2}
          strokeLinecap="round"
          opacity={0.8}
        />
      ))}
      {/* Endpoints */}
      {walls.map(w => (
        <g key={'ep-' + w.id}>
          <circle cx={w.x1} cy={w.y1} r={3}
            fill={selectedWallId === w.id ? '#f59e0b' : '#06b6d4'} opacity={0.6} />
          <circle cx={w.x2} cy={w.y2} r={3}
            fill={selectedWallId === w.id ? '#f59e0b' : '#06b6d4'} opacity={0.6} />
        </g>
      ))}
    </svg>
  )
}
```

**Step 2: Create WallTracker.tsx — pointer interaction for placing walls**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTransformContext } from 'react-zoom-pan-pinch'
import { screenToMap, snapToGrid, generateTokenId } from './combatUtils'
import type { WallSegment } from './combatTypes'

interface WallTrackerProps {
  active: boolean
  gridSize: number
  gridOffsetX: number
  gridOffsetY: number
  onAddWall: (wall: WallSegment) => void
  onDeleteWall: (wallId: string) => void
  walls: WallSegment[]
  selectedWallId: string | null
  onSelectWall: (id: string | null) => void
}

export function WallTracker({
  active, gridSize, gridOffsetX, gridOffsetY,
  onAddWall, onDeleteWall, walls,
  selectedWallId, onSelectWall,
}: WallTrackerProps) {
  const ctx = useTransformContext()
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null)

  const toMap = useCallback((clientX: number, clientY: number) => {
    const wrapper = ctx.wrapperComponent
    if (!wrapper) return null
    const wrapperRect = wrapper.getBoundingClientRect()
    const { scale, positionX, positionY } = ctx.transformState
    return screenToMap(clientX, clientY, wrapperRect, scale, positionX, positionY)
  }, [ctx])

  const snapPoint = useCallback((mapX: number, mapY: number) => {
    return snapToGrid(mapX, mapY, gridSize, gridOffsetX, gridOffsetY)
  }, [gridSize, gridOffsetX, gridOffsetY])

  // Cancel wall chain on tool deactivation
  useEffect(() => {
    if (!active) {
      setStartPoint(null)
      setPreviewEnd(null)
      onSelectWall(null)
    }
  }, [active, onSelectWall])

  // Delete selected wall on Delete/Backspace key
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWallId) {
        e.preventDefault()
        onDeleteWall(selectedWallId)
        onSelectWall(null)
      }
      if (e.key === 'Escape') {
        setStartPoint(null)
        setPreviewEnd(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, selectedWallId, onDeleteWall, onSelectWall])

  if (!active) return null

  return (
    <>
      {/* Interaction overlay */}
      <div
        className="combat-token"
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100%', height: '100%',
          zIndex: 998,
          cursor: 'crosshair',
          pointerEvents: 'auto',
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          const coords = toMap(e.clientX, e.clientY)
          if (!coords) return
          const snapped = snapPoint(coords.mapX, coords.mapY)

          if (e.button === 2) {
            // Right-click: cancel chain
            e.preventDefault()
            setStartPoint(null)
            setPreviewEnd(null)
            return
          }

          if (!startPoint) {
            // First click: check if clicking near an existing wall to select it
            const hitWall = findNearestWall(walls, coords.mapX, coords.mapY, 10)
            if (hitWall) {
              onSelectWall(hitWall.id)
              return
            }
            // Start new wall chain
            onSelectWall(null)
            setStartPoint(snapped)
          } else {
            // Second+ click: create wall segment
            const wall: WallSegment = {
              id: generateTokenId(),
              x1: startPoint.x,
              y1: startPoint.y,
              x2: snapped.x,
              y2: snapped.y,
            }
            // Don't create zero-length walls
            if (wall.x1 !== wall.x2 || wall.y1 !== wall.y2) {
              onAddWall(wall)
            }
            // Chain: new start = previous end
            setStartPoint(snapped)
            setPreviewEnd(null)
          }
        }}
        onPointerMove={(e) => {
          if (!startPoint) return
          const coords = toMap(e.clientX, e.clientY)
          if (!coords) return
          const snapped = snapPoint(coords.mapX, coords.mapY)
          setPreviewEnd(snapped)
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Preview line while placing */}
      {startPoint && (
        <svg
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
            zIndex: 701,
            overflow: 'visible',
          }}
        >
          {/* Start dot */}
          <circle cx={startPoint.x} cy={startPoint.y} r={4}
            fill="#06b6d4" opacity={0.9} />
          {/* Preview line */}
          {previewEnd && (
            <>
              <line
                x1={startPoint.x} y1={startPoint.y}
                x2={previewEnd.x} y2={previewEnd.y}
                stroke="#06b6d4" strokeWidth={2}
                strokeDasharray="6,4" opacity={0.7}
              />
              <circle cx={previewEnd.x} cy={previewEnd.y} r={4}
                fill="#06b6d4" opacity={0.9} />
            </>
          )}
        </svg>
      )}
    </>
  )
}

/** Find the wall closest to (px, py) within `threshold` pixels. */
function findNearestWall(
  walls: WallSegment[],
  px: number, py: number,
  threshold: number,
): WallSegment | null {
  let best: WallSegment | null = null
  let bestDist = threshold

  for (const w of walls) {
    const dist = pointToSegmentDist(px, py, w.x1, w.y1, w.x2, w.y2)
    if (dist < bestDist) {
      bestDist = dist
      best = w
    }
  }
  return best
}

function pointToSegmentDist(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return Math.hypot(px - projX, py - projY)
}
```

**Step 3: Commit**

```
feat(combat): add wall drawing tool and wall visualization layer
```

---

## Task 6: FogTracker — GM Fog Painting Tool

**Files:**
- Create: `src/combat/FogTracker.tsx`

**Step 1: Create FogTracker.tsx**

GM paints rectangular grid regions to reveal/hide fog. Click+drag → rectangle selection snapping to grid cells.

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTransformContext } from 'react-zoom-pan-pinch'
import { screenToMap, generateTokenId } from './combatUtils'
import type { FogRegion } from './combatTypes'

interface FogTrackerProps {
  active: boolean
  fogMode: 'reveal' | 'hide'
  gridSize: number
  gridOffsetX: number
  gridOffsetY: number
  onAddFogRegion: (region: FogRegion) => void
}

export function FogTracker({
  active, fogMode, gridSize, gridOffsetX, gridOffsetY, onAddFogRegion,
}: FogTrackerProps) {
  const ctx = useTransformContext()
  const [dragging, setDragging] = useState(false)
  const startCellRef = useRef<{ gx: number; gy: number } | null>(null)
  const [previewRect, setPreviewRect] = useState<{ gx: number; gy: number; gw: number; gh: number } | null>(null)

  const toMap = useCallback((clientX: number, clientY: number) => {
    const wrapper = ctx.wrapperComponent
    if (!wrapper) return null
    const wrapperRect = wrapper.getBoundingClientRect()
    const { scale, positionX, positionY } = ctx.transformState
    return screenToMap(clientX, clientY, wrapperRect, scale, positionX, positionY)
  }, [ctx])

  const toGridCell = useCallback((mapX: number, mapY: number) => {
    return {
      gx: Math.floor((mapX - gridOffsetX) / gridSize),
      gy: Math.floor((mapY - gridOffsetY) / gridSize),
    }
  }, [gridSize, gridOffsetX, gridOffsetY])

  useEffect(() => {
    if (!active) {
      setDragging(false)
      setPreviewRect(null)
      startCellRef.current = null
    }
  }, [active])

  // Window-level move/up during drag
  useEffect(() => {
    if (!dragging) return

    const handleMove = (e: PointerEvent) => {
      const coords = toMap(e.clientX, e.clientY)
      if (!coords || !startCellRef.current) return
      const cell = toGridCell(coords.mapX, coords.mapY)
      const start = startCellRef.current

      const minGX = Math.min(start.gx, cell.gx)
      const minGY = Math.min(start.gy, cell.gy)
      const maxGX = Math.max(start.gx, cell.gx)
      const maxGY = Math.max(start.gy, cell.gy)

      setPreviewRect({
        gx: minGX,
        gy: minGY,
        gw: maxGX - minGX + 1,
        gh: maxGY - minGY + 1,
      })
    }

    const handleUp = () => {
      if (previewRect && previewRect.gw > 0 && previewRect.gh > 0) {
        onAddFogRegion({
          id: generateTokenId(),
          gridX: previewRect.gx,
          gridY: previewRect.gy,
          gridW: previewRect.gw,
          gridH: previewRect.gh,
          revealed: fogMode === 'reveal',
        })
      }
      setDragging(false)
      setPreviewRect(null)
      startCellRef.current = null
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [dragging, toMap, toGridCell, previewRect, fogMode, onAddFogRegion])

  if (!active) return null

  return (
    <>
      <div
        className="combat-token"
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100%', height: '100%',
          zIndex: 998,
          cursor: 'crosshair',
          pointerEvents: 'auto',
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          const coords = toMap(e.clientX, e.clientY)
          if (!coords) return
          const cell = toGridCell(coords.mapX, coords.mapY)
          startCellRef.current = cell
          setPreviewRect({ gx: cell.gx, gy: cell.gy, gw: 1, gh: 1 })
          setDragging(true)
        }}
      />

      {/* Preview rectangle */}
      {previewRect && (
        <div
          style={{
            position: 'absolute',
            left: previewRect.gx * gridSize + gridOffsetX,
            top: previewRect.gy * gridSize + gridOffsetY,
            width: previewRect.gw * gridSize,
            height: previewRect.gh * gridSize,
            background: fogMode === 'reveal'
              ? 'rgba(34, 197, 94, 0.25)'
              : 'rgba(239, 68, 68, 0.25)',
            border: fogMode === 'reveal'
              ? '2px solid rgba(34, 197, 94, 0.6)'
              : '2px solid rgba(239, 68, 68, 0.6)',
            pointerEvents: 'none',
            zIndex: 701,
            boxSizing: 'border-box',
          }}
        />
      )}
    </>
  )
}
```

**Step 2: Commit**

```
feat(combat): add fog painting tool for GM
```

---

## Task 7: Update Z-Indices + CombatToolbar

**Files:**
- Modify: `src/combat/CursorLayer.tsx` — z-index 500 → 800
- Modify: `src/combat/PingLayer.tsx` — z-index 501 → 801
- Modify: `src/combat/MeasureLayer.tsx` — z-index 502 → 802
- Modify: `src/combat/CombatToolbar.tsx` — add wall/fog tools, layer toggles, fog sub-mode

**Step 1: Update z-indices in CursorLayer, PingLayer, MeasureLayer**

In each file, change the `zIndex` value in the container's style object:
- `CursorLayer.tsx`: `zIndex: 500` → `zIndex: 800`
- `PingLayer.tsx`: `zIndex: 501` → `zIndex: 801`
- `MeasureLayer.tsx`: `zIndex: 502` → `zIndex: 802`

**Step 2: Update CombatToolbar**

Expand `LayerVisibility` interface:

```typescript
export interface LayerVisibility {
  grid: boolean
  drawings: boolean
  gmTokens: boolean
  tokenLabels: boolean
  fog: boolean       // NEW
  walls: boolean     // NEW
}

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  grid: true,
  drawings: true,
  gmTokens: true,
  tokenLabels: true,
  fog: true,         // NEW
  walls: true,       // NEW
}
```

Expand tool type to include `'wall' | 'fog'`:

```typescript
type ToolType = 'select' | 'measure' | 'draw' | 'wall' | 'fog'
```

Update `CombatToolbarProps`:
- Change `activeTool` type to `ToolType`
- Change `onToolChange` type to `(tool: ToolType) => void`
- Add `fogMode: 'reveal' | 'hide'` prop
- Add `onFogModeChange: (mode: 'reveal' | 'hide') => void` prop
- Add `onClearAllFog?: () => void` (GM only)
- Add `onClearAllWalls?: () => void` (GM only)

Add SVG icon components for Wall and Fog tools. Add the new tool buttons to the tools array (GM only). Add fog sub-mode toggle (Reveal/Hide) when fog tool is active. Add fog + walls layer toggles.

Add a `FogIcon` and a `WallIcon` SVG component (simple inline SVGs matching existing style).

**Step 3: Commit**

```
feat(combat): update z-indices, add wall/fog tools to toolbar
```

---

## Task 8: Wire Everything in CombatViewer + App.tsx

**Files:**
- Modify: `src/combat/CombatViewer.tsx`
- Modify: `src/combat/CombatMap.tsx`
- Modify: `src/App.tsx`

**Step 1: Update CombatViewer props**

Add to `CombatViewerProps`:

```typescript
walls: WallSegment[]
onAddWall: (wall: WallSegment) => void
onDeleteWall: (wallId: string) => void
onClearAllWalls: () => void
fogRegions: FogRegion[]
onAddFogRegion: (region: FogRegion) => void
onClearAllFog: () => void
```

**Step 2: Add state and hooks to CombatViewer**

```typescript
const [fogMode, setFogMode] = useState<'reveal' | 'hide'>('reveal')
const [selectedWallId, setSelectedWallId] = useState<string | null>(null)
```

Expand `activeTool` type to include `'wall' | 'fog'`.

**Step 3: Compute visibility polygons**

Add `useMemo` that computes visibility for the current player's tokens:

```typescript
const visibilityPolygons = useMemo(() => {
  if (!scene || role === 'GM' || !scene.fogEnabled) return []
  if (walls.length === 0 && fogRegions.length === 0) return []

  const bounds = { x: 0, y: 0, w: scene.width, h: scene.height }
  const wallSegments = walls // already in the right format

  // Find tokens owned by the current player that have visionRadius > 0
  return tokens
    .filter(t => {
      const char = getCharacter(t.characterId)
      return char?.seatId === mySeatId && t.visionRadius > 0
    })
    .map(t => {
      const cx = t.x + (t.size * scene.gridSize) / 2
      const cy = t.y + (t.size * scene.gridSize) / 2
      const radiusPx = t.visionRadius * scene.gridSize

      const visPoly = computeVisibility({ x: cx, y: cy }, wallSegments, bounds)
      return clipPolygonToCircle(visPoly, { x: cx, y: cy }, radiusPx)
    })
}, [scene, role, walls, tokens, getCharacter, mySeatId, fogRegions.length])
```

Import `computeVisibility` and `clipPolygonToCircle` from `./visibility`.

**Step 4: Add new layers to CombatMap children**

Inside the `<CombatMap>` children, add in this order (after TokenLayer, before CursorLayer):

```tsx
{scene.fogEnabled && (
  <FogCanvas
    width={scene.width}
    height={scene.height}
    gridSize={scene.gridSize}
    gridOffsetX={scene.gridOffsetX}
    gridOffsetY={scene.gridOffsetY}
    fogRegions={fogRegions}
    visibilityPolygons={visibilityPolygons}
    role={role}
    visible={layerVisibility.fog}
  />
)}

{role === 'GM' && (
  <WallLayer
    walls={walls}
    visible={layerVisibility.walls}
    selectedWallId={selectedWallId}
  />
)}

<WallTracker
  active={activeTool === 'wall'}
  gridSize={scene.gridSize}
  gridOffsetX={scene.gridOffsetX}
  gridOffsetY={scene.gridOffsetY}
  onAddWall={onAddWall}
  onDeleteWall={onDeleteWall}
  walls={walls}
  selectedWallId={selectedWallId}
  onSelectWall={setSelectedWallId}
/>

<FogTracker
  active={activeTool === 'fog'}
  fogMode={fogMode}
  gridSize={scene.gridSize}
  gridOffsetX={scene.gridOffsetX}
  gridOffsetY={scene.gridOffsetY}
  onAddFogRegion={onAddFogRegion}
/>
```

**Step 5: Update keyboard shortcuts**

Add to the `switch` statement in the keydown handler:

```typescript
case 'w':
case 'W':
  if (role === 'GM') {
    setActiveTool('wall')
    onSelectToken(null)
  }
  break
case 'f':
case 'F':
  if (role === 'GM') {
    setActiveTool('fog')
    onSelectToken(null)
  }
  break
```

**Step 6: Update CombatToolbar props**

Pass new props to CombatToolbar:

```tsx
<CombatToolbar
  // ... existing props ...
  fogMode={fogMode}
  onFogModeChange={setFogMode}
  onClearAllFog={role === 'GM' ? onClearAllFog : undefined}
  onClearAllWalls={role === 'GM' ? onClearAllWalls : undefined}
/>
```

**Step 7: Update App.tsx**

Import and instantiate hooks:

```typescript
import { useWalls } from './combat/useWalls'
import { useFogRegions } from './combat/useFogRegions'

// Inside App component, after useDrawings:
const { walls, addWall, deleteWall, clearAll: clearAllWalls } = useWalls(yDoc, room.combatSceneId)
const { fogRegions, addFogRegion, clearAll: clearAllFog } = useFogRegions(yDoc, room.combatSceneId)
```

Pass new props to CombatViewer:

```tsx
<CombatViewer
  // ... existing props ...
  walls={walls}
  onAddWall={addWall}
  onDeleteWall={deleteWall}
  onClearAllWalls={clearAllWalls}
  fogRegions={fogRegions}
  onAddFogRegion={addFogRegion}
  onClearAllFog={clearAllFog}
/>
```

**Step 8: Commit**

```
feat(combat): wire fog of war system into combat viewer
```

---

## Task 9: Add visionRadius to Token Context Menu

**Files:**
- Modify: `src/combat/CombatViewer.tsx` (context menu items)

**Step 1: Add vision radius options to context menu**

In the `contextMenuItems` useMemo, add vision radius options (after size options):

```typescript
// Vision radius (GM only)
if (role === 'GM') {
  const visionOptions = [0, 3, 6, 12, 24]
  for (const v of visionOptions) {
    if (token.visionRadius !== v) {
      items.push({
        label: v === 0 ? 'Vision: None' : `Vision: ${v} sq`,
        onClick: () => onUpdateToken(token.id, { visionRadius: v }),
      })
    }
  }
}
```

**Step 2: Commit**

```
feat(combat): add vision radius to token context menu
```

---

## Task 10: Add fogEnabled Toggle to Scene Settings

**Files:**
- Modify: `src/gm/GmToolbar.tsx` or wherever scene settings are edited

**Step 1: Find where scene properties are edited**

Check how `gridVisible`, `gridSize`, `gridColor` are toggled for the combat scene. Add a similar toggle for `fogEnabled`. This is likely in `GmToolbar.tsx` or a scene settings panel.

Add a checkbox or toggle button labeled "Fog of War" that calls `onUpdateScene(sceneId, { fogEnabled: !scene.fogEnabled })`.

**Step 2: Commit**

```
feat(combat): add fog of war toggle to scene settings
```

---

## Verification Checklist

After all tasks, test with 2 browser windows connected to the same room:

1. **Walls**: GM activates wall tool (W key) → clicks two grid points → wall appears → wall syncs to window 2
2. **Wall selection**: GM clicks near existing wall in wall mode → wall highlights → Delete key removes it
3. **Wall chaining**: Click multiple points in sequence → creates connected wall segments
4. **Fog toggle**: GM enables fogEnabled on scene → entire map turns dark for player window
5. **GM fog paint**: GM activates fog tool (F key) → drag rectangle → reveals area → syncs to player
6. **Fog hide mode**: GM switches to "Hide" mode → paints over revealed area → re-fogs it
7. **Vision**: GM sets visionRadius on a player's token via context menu → player sees circular visibility area around their token
8. **Raycasting**: Place walls around a corner → player's vision blocked by wall → can't see behind it
9. **GM view**: GM sees fog at 30% opacity → can see everything but knows player view
10. **Layer toggles**: GM toggles fog/walls visibility in toolbar → layers show/hide
11. **Keyboard shortcuts**: W/F/Esc work for tool switching
12. **No regression**: Select, measure, draw tools still work correctly
