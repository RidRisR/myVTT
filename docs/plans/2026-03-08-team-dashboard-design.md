# Team Dashboard Design

## Overview
A persistent, always-visible dashboard at the top-right of the screen for team-level shared state. All players can see it; only the GM can edit. Built with an extensible tab framework, starting with a Team Metrics tab.

## Layout & Position
- `position: fixed`, `top: 12px`, `right: 16px`, `width: 546px`
- Right-aligned with ChatPanel (`bottom: 12, right: 16, width: 546`)
- z-index: 10000 (same layer as other floating UI)
- Dark glass theme: `rgba(15,15,25,0.92)` + `backdrop-filter: blur(16px)`

## Interaction States

### Compact State (always visible)
- Tab bar at top (Metrics, future: Announcements, etc.)
- Below tabs: current tab's compact content
- Metrics tab compact view: mini resource bars in a dual-column layout
- Minimal vertical footprint (~60-80px)

### Expanded State (GM only)
- GM clicks an expand/collapse chevron button
- Content area grows to show editing controls:
  - +/- hold-to-repeat buttons per metric (reuse MiniHoldButton)
  - Draggable resource bars (ew-resize, reuse pattern from CharacterHoverPreview)
  - Add/delete/rename metrics
- Players always see compact state (read-only)

## Data Structure

### Yjs Storage
Each tab module uses its own Y.Map for isolation and extensibility.

```ts
// yDoc.getMap('team_metrics')
// Key: 'trackers' → JSON array of TeamTracker

interface TeamTracker {
  id: string        // unique ID
  label: string     // "Fear", "Hope", "Morale"
  current: number   // current value
  max: number       // maximum value
  color: string     // bar color, e.g. "#ef4444"
  sortOrder: number // display order
}
```

### Editing Permissions
- **GM**: CRUD on trackers (add, rename, delete, change color/max), modify current values via drag or +/- buttons
- **Players**: Read-only view of all tracker values

## File Structure
1. `src/team/TeamDashboard.tsx` — Main panel: tab bar, expand/collapse, renders active tab content
2. `src/team/TeamMetricsTab.tsx` — Metrics tab: compact + expanded views, resource bars, editing UI
3. `src/team/useTeamMetrics.ts` — Yjs hook for reading/writing `team_metrics` map
4. `src/App.tsx` — Mount TeamDashboard (visible to all players)

## UI Details

### Compact Metrics Layout
- Two-column grid when >=2 trackers, single column for 1
- Each tracker: label (left) + mini bar + `current/max` text (right)
- Bar height: 6px (read-only), same gradient style as character resource bars

### Expanded Metrics Layout (GM)
- Single-column, each tracker on its own row
- Bar height: 10px, draggable (ew-resize cursor)
- +/- MiniHoldButtons flanking the value display
- "Add Metric" button at bottom
- Each tracker has a hover-reveal delete (x) button
- Click tracker label to inline-edit name

### Tab Framework
- Tab bar: horizontal button row at top of panel
- Active tab highlighted with `rgba(255,255,255,0.12)` background
- New tabs added by creating a new component + registering in TeamDashboard
- First version: only Metrics tab; tab bar still rendered for future extensibility
