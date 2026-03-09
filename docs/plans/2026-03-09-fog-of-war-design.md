# Fog of War + Vision + Walls — Design

## Overview

Add a fog of war system to combat mode with three components:
1. **Dynamic vision** — tokens have vision radii; 2D raycasting computes visibility polygons against walls
2. **GM-painted fog** — GM manually reveals/hides rectangular grid regions
3. **Wall segments** — line segments that block line-of-sight, drawn by the GM

All computation is client-side. Each player's client computes visibility for their own tokens. The GM sees everything (fog rendered at reduced opacity).

---

## Fixed Layer Stack

Formalize the render order inside CombatMap (bottom to top):

```
1. Background image/video           (existing)
2. Grid SVG overlay                  (existing)
3. DrawingLayer SVG       z:503      (existing)
4. TokenLayer                        (existing)
5. FogCanvas              z:600      NEW — single canvas, above tokens
6. WallLayer SVG          z:700      NEW — GM-only wall visualization
7. CursorLayer            z:800      (moved up from 500, above fog)
8. PingLayer              z:801      (moved up from 501, above fog)
9. MeasureLayer           z:802      (moved up from 502, above fog)
```

Fog sits above tokens so players cannot see tokens hidden in fog. Cursors, pings, and measures render above fog so they remain visible to all users.

---

## Data Model

### WallSegment (new, per-scene)

```typescript
interface WallSegment {
  id: string
  x1: number; y1: number   // map pixels, snapped to grid intersections
  x2: number; y2: number
}
```

Yjs storage: `yDoc.getMap('walls_' + sceneId)`

Walls block vision only — no movement blocking in v1. Door/window/terrain types are a future enhancement (just add a `type` field and filter before raycasting).

### FogRegion (new, per-scene)

```typescript
interface FogRegion {
  id: string
  gridX: number; gridY: number   // grid cell coordinates
  gridW: number; gridH: number   // width/height in grid cells
  revealed: boolean              // true = hole in fog, false = fog added back
}
```

Yjs storage: `yDoc.getMap('fog_' + sceneId)`

GM paints rectangular regions to reveal or re-hide areas.

### CombatToken addition

```typescript
interface CombatToken {
  // ... existing fields ...
  visionRadius: number      // grid squares, 0 = no vision (default 0)
}
```

### Scene addition

```typescript
interface Scene {
  // ... existing fields ...
  fogEnabled: boolean       // default false
}
```

---

## Fog Rendering Pipeline

Single `<canvas>` element sized to the map, `pointerEvents: 'none'`, z-index 600.

### Render steps (per frame):

1. `ctx.globalCompositeOperation = 'source-over'`
2. `ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'` — fill entire canvas (full fog)
3. `ctx.globalCompositeOperation = 'destination-out'`
4. For each GM-revealed `FogRegion`: fill rectangle (punches hole in fog)
5. For each token with `visionRadius > 0` owned by current player:
   - Compute visibility polygon via raycasting against wall segments
   - Clip polygon to circular vision radius
   - Fill polygon (punches hole in fog)
6. **GM view**: set canvas `style.opacity = 0.3` so GM sees through but knows player view

### When to recompute

Only when inputs change:
- Token positions change (on Yjs update, not during drag)
- Walls added/removed/moved
- Fog regions changed
- Vision radius changed

Memoized via `useMemo`. During token drag, fog updates on drop (not mid-drag).

---

## Vision Computation

### Algorithm: Ray-to-endpoint

Pure function, ~100 lines, no external dependencies.

```typescript
function computeVisibility(
  origin: { x: number; y: number },
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  bounds: { x: number; y: number; w: number; h: number },
): Array<{ x: number; y: number }>
```

Steps:
1. Add map boundary edges as implicit wall segments
2. Collect all segment endpoints
3. For each endpoint, cast 3 rays: angle, angle ± 0.00001 (peek around corners)
4. For each ray, find closest intersection with any segment
5. Sort intersections by angle
6. Return as polygon vertices

### Clipping to vision radius

After computing the full visibility polygon, clip it to a circle centered on the token with radius `visionRadius * gridSize` pixels. This limits how far the token can see even in open areas.

### Performance

- 200 wall segments × 10 tokens = ~5ms total computation
- Canvas rendering: <1ms
- Well within 16ms frame budget (60fps)

---

## Wall Drawing Tool

### Toolbar

New tool: `'wall'` (GM only, keyboard shortcut `W`)

### Interaction

1. Click grid intersection → place start point (shows dot marker)
2. Click second grid intersection → wall segment created, stored to Yjs
3. Chain mode: continue placing from last endpoint (each click adds a segment)
4. Escape or right-click → stop chain, return to select tool
5. Hover near existing wall → highlight it
6. Click existing wall (in select mode) → select it; Delete key → remove from Yjs

### Snapping

Both endpoints snap to nearest grid intersection using existing `snapToGrid` utility.

### WallLayer (GM-only visual)

SVG overlay at z-index 700. Renders all walls as colored lines (e.g., cyan, 2px). Players never see this layer — walls are invisible data used only for raycasting.

---

## GM Fog Painting Tool

### Toolbar

New tool: `'fog'` (GM only, keyboard shortcut `F`)

Sub-mode toggle: **Reveal** (default) / **Hide**

### Interaction

1. Click + drag on map → rectangular selection snapping to grid cells
2. On release: create `FogRegion` with `revealed: true` (reveal mode) or `revealed: false` (hide mode)
3. Visual feedback during drag: semi-transparent green (reveal) or red (hide) rectangle

### Fog region evaluation

When rendering fog, iterate regions in order of creation. Each region either reveals or re-hides its area. This allows the GM to reveal a room, then selectively hide parts of it again.

---

## Toolbar Changes

### Active tool expansion

```typescript
type ActiveTool = 'select' | 'measure' | 'draw' | 'wall' | 'fog'
```

`'wall'` and `'fog'` only available when `role === 'GM'`.

### Layer visibility expansion

```typescript
interface LayerVisibility {
  grid: boolean
  drawings: boolean
  gmTokens: boolean
  tokenLabels: boolean
  fog: boolean        // NEW — toggle fog visibility
  walls: boolean      // NEW — toggle wall line display (GM only)
}
```

---

## Client-Side Architecture

### Why client-side

- Server is a simple y-websocket + y-leveldb relay — no computation capability
- Each client has all data (token positions + walls) via Yjs
- Sub-5ms computation, no reason to offload
- Instant feedback, no network round-trip
- Trade-off: determined players can inspect Y.Doc to see hidden data. Acceptable for cooperative TTRPG.

### What NOT to use Yjs Awareness for

Do not share computed visibility polygons via awareness. Each client computes its own vision from shared wall/token data. Sharing results would flood the network with large polygon data for no benefit.

---

## New Files

| File | Purpose |
|------|---------|
| `src/combat/visibility.ts` | Pure raycasting algorithm (computeVisibility) |
| `src/combat/FogCanvas.tsx` | Canvas fog overlay component |
| `src/combat/WallLayer.tsx` | SVG wall visualization (GM only) |
| `src/combat/WallTracker.tsx` | Wall drawing interaction handler |
| `src/combat/FogTracker.tsx` | Fog painting interaction handler |
| `src/combat/useWalls.ts` | Yjs hook for wall CRUD per scene |
| `src/combat/useFogRegions.ts` | Yjs hook for fog region CRUD per scene |

## Modified Files

| File | Changes |
|------|---------|
| `src/combat/combatTypes.ts` | Add `WallSegment`, `FogRegion`, `visionRadius` to CombatToken |
| `src/combat/CombatViewer.tsx` | Wire new hooks, tools, layers, keyboard shortcuts |
| `src/combat/CombatToolbar.tsx` | Add wall/fog tools, layer toggles, fog sub-mode |
| `src/combat/CombatMap.tsx` | Render FogCanvas, WallLayer in correct order |
| `src/combat/CursorLayer.tsx` | z-index 500 → 800 |
| `src/combat/PingLayer.tsx` | z-index 501 → 801 |
| `src/combat/MeasureLayer.tsx` | z-index 502 → 802 |
| `src/yjs/useScenes.ts` | Add `fogEnabled` to Scene interface |
| `src/App.tsx` | Instantiate useWalls, useFogRegions, pass to CombatViewer |
