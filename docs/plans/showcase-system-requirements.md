# Showcase System — Requirements & Desired UX

## Purpose

TRPG sessions need a way to push content to all players' screens simultaneously — narrative text, handout images, NPC portraits, etc. This "Showcase" system serves two use cases:

1. **Spotlight** — "Look here!" Temporary attention-grabbing display in the center of the screen
2. **Materials Panel** — A persistent collection of all showcased materials that players can revisit

---

## Core Interaction Flow

```
GM/Player triggers showcase
     ↓
Spotlight appears (center screen, large, animated entrance)
     ↓
  ┌──────────────────────────────────────────┐
  │  Ephemeral (narrative text):             │
  │    → auto-fades after ~8s                │
  │    → GM can "Pin" to save as material    │
  │    → does NOT enter Materials Panel      │
  │                                          │
  │  Material (handout/image):               │
  │    → stays until manually dismissed      │
  │    → enters Materials Panel on dismiss   │
  │    → can be re-opened from Materials     │
  └──────────────────────────────────────────┘
```

---

## Data Model

```typescript
interface ShowcaseItem {
  id: string
  type: 'handout' | 'image' | 'text'
  title?: string
  description?: string
  imageUrl?: string
  text?: string              // for type='text'
  senderId: string
  senderName: string
  senderColor: string
  ephemeral: boolean         // true = transient, false = persistent material
  timestamp: number
}
```

Yjs storage:
- `yDoc.getMap('showcase_items')` — all materials (CRUD collection)
- Spotlight state can be derived or stored separately

---

## UX Requirements

### 1. Spotlight — New Item Entrance Animation

**This is the most critical UX requirement.** When a new item is showcased, it must appear with a visually impactful, attention-grabbing animation that clearly signals "something new has arrived."

**Desired feel:**
- The item should "materialize" into view — NOT slide in from an edge, NOT just instantly appear
- There should be a sense of physicality: scale bounce, glow, blur-to-sharp, or similar
- The animation should be distinct from scroll-based navigation (which is smooth, continuous, no-frills)
- Duration: ~0.5–0.8s, not too fast (blink and miss) nor too slow (feels sluggish)

**What DIDN'T work (avoid these pitfalls):**
- `scale(0.92) → scale(1)` with `opacity 0 → 1` — too subtle, barely noticeable
- CSS `@keyframes` on a wrapper div applied via React ref/state change — the animation never played because React's render cycle meant the DOM element already existed before the animation style was applied
- `useEffect` to set animation state — runs AFTER paint, so first frame has no animation
- `useLayoutEffect` to set animation state — still didn't produce visible animation (unclear why, possibly React batching or CSS animation replay issues)

**Technical challenge:**
The core difficulty is that items arrive via Yjs → React state → render. By the time React renders the new item, the DOM element may already exist from a previous render pass (same `key`), and CSS animations don't replay when re-applied to existing elements. Any solution must ensure the animation plays reliably on every new item arrival.

**Possible approaches to explore (not yet tried):**
- Force DOM remount with a changing key (e.g., `key={item.id + '-' + animationTrigger}`)
- Use Web Animations API (`element.animate()`) via ref instead of CSS keyframes
- Use a separate "entrance portal" component that mounts fresh each time
- CSS animation with `animation-name: none` → actual name toggle via className (force reflow between)

### 2. Scrollable Queue (Carousel)

When multiple items exist, they form a vertical scrollable queue:

- **Focused item** at screen center — expanded, shows full content + action buttons
- **Adjacent items** above/below — compact "peek" previews, scaled down, faded
- **Mouse wheel / trackpad** — continuous analog scrolling (NOT step-by-step discrete jumps)
- **Snap-to-nearest** — after scroll idle (~150ms), smoothly snap to the nearest integer position
- **Click non-focused item** — snaps to that item

**Scroll mechanics (what worked well):**
- `scrollY` as a continuous float (e.g., 2.3 = between items 2 and 3)
- Each item positioned by: `y = (index - scrollY) * SLOT_SPACING`
- Opacity and scale interpolated by distance from center
- `isSnapped` boolean controls CSS transition: off during active scroll, on during snap-back
- Snap trick: `setIsSnapped(true)` then `requestAnimationFrame(() => setScrollY(Math.round))` — ensures transition is enabled before position changes, so the snap animates

**Parameters that felt good:**
- `SLOT_SPACING = 140px` between item centers
- `SCROLL_SENSITIVITY = 0.008` (deltaY multiplier for continuous scroll)
- `SNAP_DELAY = 150ms` idle before snap
- Items beyond `absDist > 3.5` are not rendered
- Opacity: `max(0.05, 1 - absDist * 0.35)`
- Scale: `max(0.82, 1 - absDist * 0.06)`

### 3. Card Designs

**FocusedCard (center, expanded):**
- Text type: centered serif italic 24px, text-shadow glow, no background card
- Image/Handout type: dark glass card (`rgba(15,15,25,0.92)` + `blur(20px)` + rounded 16px), image + title + description + sender attribution
- Action buttons: Dismiss, Pin (GM only, ephemeral items only)

**PeekCard (non-focused, compact):**
- Text type: single-line truncated italic text, smaller font
- Image/Handout type: horizontal row — 44x44 thumbnail + title + sender name

### 4. Ephemeral Auto-Removal

- Items with `ephemeral: true` auto-delete from Yjs after 8 seconds
- GM can "Pin" an ephemeral item before it disappears → converts to persistent material

### 5. Materials Panel (Future Step)

Right-side panel for browsing all persistent materials. Not yet implemented — will be a vertical list with thumbnails, click to re-spotlight.

### 6. `/show` Chat Command (Future Step)

`/show <text>` in chat → creates ephemeral text showcase item.

### 7. Handout Display from Character Card (Future Step)

Character card's handouts section gets a "Show" button that pushes the handout to all players as a spotlight.

---

## Permissions

- **GM**: can dismiss any item, pin any ephemeral item, delete any material
- **Player**: can dismiss items they sent, cannot pin or delete others' items

---

## Sync

All showcase state is via Yjs — every connected client sees the same spotlight and materials in real-time.

---

## Priority

1. **Entrance animation** — must feel good before anything else matters
2. **Scrollable queue** — already working well in previous iteration
3. **Materials Panel** — next milestone
4. **Chat /show + handout buttons** — final integration
