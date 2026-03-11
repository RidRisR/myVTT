# myVTT - Lightweight Scene-Based VTT

## Project Overview

myVTT is a lightweight Virtual Tabletop built with React + Yjs + y-websocket for real-time multi-user collaboration. It features a dual-mode design:

- **Scene Mode**: Atmospheric full-screen scenes for narrative play
- **Combat Mode**: Lightweight tactical combat with token management and grid support

## Tech Stack

- **Frontend**: React 19.2, Vite 7.3, TypeScript 5.9
- **Real-time Sync**: Yjs v13.6.29, y-websocket v2.1.0
- **State Management**: zustand v5.0.11 (Yjs→React bridge layer)
- **Canvas Rendering**: konva v10.2 + react-konva v19.2 (combat tactical map)
- **Styling**: Tailwind CSS v4 + design tokens (see Styling Infrastructure section)
- **Icons**: Lucide React v0.577
- **Server**: Node.js with Express 5.2, y-leveldb v0.2.0 (persistence)
- **File Upload**: multer 2.1
- **Testing**: vitest v4 + @testing-library/react v16 + jsdom

## Critical Architecture Notes

### y-websocket Version (IMPORTANT)

**MUST use y-websocket v2.1.0** - do NOT upgrade to v3:

- v3 is **client-only** (server moved to `@y/websocket-server`)
- `@y/websocket-server` requires yjs v14 (pre-release), conflicts with v13
- v2 bundles server utils at `y-websocket/bin/utils`
- Server import: `require('y-websocket/bin/utils')` (NOT `.cjs`)

### ESM/CJS Compatibility

- Project uses `"type": "module"` in package.json
- Server file (`server/index.mjs`) uses `createRequire(import.meta.url)` for CJS modules
- `ws` package: default export is WebSocket class, use `ws.Server` not `WebSocketServer`

### Y.Doc Shared State

**Data Structure:**

- `yDoc` created in `useState` (not useEffect) for component sharing
- Do NOT call `yDoc.destroy()` in cleanup - lifecycle managed by useState
- All containers use top-level shared types: `yDoc.getMap('scenes')`, `yDoc.getMap('room')`, etc. — managed via `createWorldMaps()` in `src/yjs/useWorld.ts`
- `createWorldMaps()` top-level keys: `scenes`, `entities`, `blueprints`, `seats`, `room`
- Independent root maps (not in createWorldMaps): `chat_log`, `team_metrics`, `showcase_items`, `handout_assets`
- Scene Y.Maps are created by user action (addScene), not auto-init
- `entities` uses nested Y.Maps with `permissions` and `ruleData` as nested Y.Map structures for field-level CRDT

**Yjs Nesting Rules (IMPORTANT):**

- Global containers (seats, room, scenes, entities, etc.) MUST use top-level shared types: `yDoc.getMap('xxx')`
- NEVER use `ensureSubMap` or check-then-create patterns (`if (!exists) parent.set(key, new Y.Map())`) during initialization — this causes race conditions when multiple clients connect before sync completes
- Nested Y.Map creation (`parent.set(key, new Y.Map())`) is ONLY allowed inside explicit user actions (e.g., addScene), where: (1) the operation happens after WebSocket sync is complete, (2) the key is a unique ID (UUID), not a fixed string, (3) only one client triggers the creation
- Plain objects stored as Y.Map values have NO field-level CRDT — use nested Y.Map for fields that need concurrent editing

**Entity System:**

- Core type: `Entity` (id, name, imageUrl, color, size, notes, ruleData, permissions, persistent)
- `entities` = global unique store for ALL entities (PC + NPC), nested Y.Map with field-level CRDT
- Scene holds `entityIds` — a reference list (array) of entity IDs, NOT embedded entity data
- `persistent: true` on an entity means it auto-joins all scenes and is protected from GC (PC default: true, NPC default: false)
- Linked creation = add existing entity to scene; Unlinked creation = create new entity in global store
- When an entity is deleted, tokens that referenced it degrade to anonymous tokens
- Combat tokens: `MapToken` with optional `entityId` for linking to entities
- Blueprints: reusable token templates stored in `blueprints` map
- Adapters: `entityAdapters.ts` provides read-only getters (getEntityResources, getEntityAttributes, etc.)

### Combat Map Rendering (react-konva)

The tactical map is rendered via **react-konva** (Canvas), not DOM+CSS:

- `KonvaMap.tsx` is the main canvas container (Stage → Layers)
- Layers: background image → grid → tokens → tools overlay
- Token positions are in map coordinates; Konva handles the camera transform
- Screen→Map conversion still applies when converting pointer events: `mapX = (screenX - stageOffset.x) / scale`

### react-zoom-pan-pinch (Legacy Reference)

Still present in the codebase but no longer used for the main tactical map. If encountered:

- `useTransformContext()` returns `ZoomPanPinch` instance with `transformState` (scale, positionX, positionY) and `wrapperComponent` (DOM ref)
- Token drag conflict: add `className="combat-token"`, configure `panning={{ excluded: ['combat-token'] }}`

### Token Drag Pattern

- **During drag**: update local React state only (60fps smooth)
- **On pointerUp**: grid snap + Yjs write (network sync)
- Use window-level pointermove/pointerup listeners during drag
- 3px threshold before visual drag starts (prevents accidental drags)

### UI Design Patterns

- **Styling**: Use **Tailwind CSS classes**, not inline styles — Tailwind supports pseudo-classes, animations, and responsive design that inline styles cannot
- **Floating UI**: `position: fixed` + Tailwind z-index utilities (see z-index system below)
- **Dark glass theme**: use `bg-glass` token + `backdrop-blur` — do NOT hardcode `rgba(15,15,25,0.92)`
- **Click-outside-to-close**: document pointerdown listener checking `contains()`
- **Hold-to-repeat buttons**: `useHoldRepeat` custom hook in `src/shared/useHoldRepeat.ts`
- **Destructive operations**: MUST show a confirmation dialog (`ConfirmDialog` in `src/shared/ui/`)
- **User feedback**: use Toast notifications (`useToast` + `ToastProvider` in `src/shared/ui/`)
- **Icons**: use **Lucide React** components, strokeWidth=1.5, sizes: 16/20/24px

**z-index Semantic Layers** (defined in `tailwind.config.ts`):

| Layer | Value | Use case |
|-------|-------|----------|
| base | 0 | Default stacking |
| combat | 100 | Combat map overlays |
| ui | 1000 | General UI panels |
| popover | 5000 | Dropdowns, tooltips |
| overlay | 8000 | Modal backdrops |
| modal | 9000 | Modals, dialogs |
| toast | 10000 | Toast notifications |

## State Management

Data flow: **Yjs → zustand store → React components** (via fine-grained selectors)

- Yjs observers write into zustand stores; components subscribe via selectors — never read Y.Map directly in render
- Do NOT use SyncedStore (abandoned, incompatible with React 19)

**Store files in `src/stores/`:**

| File | Purpose |
|------|---------|
| `worldStore.ts` | Main bridge — Yjs observer writes scenes, entities, room, etc. into React-readable state |
| `uiStore.ts` | Client-only UI state: selectedTokenId, activeTool, theme, panel open/closed |
| `identityStore.ts` | Seat/identity state |
| `selectors.ts` | Selector functions for efficient component subscriptions |

## Styling Infrastructure

All styling uses **Tailwind CSS v4**. Do NOT write inline styles.

**Design tokens** are defined in `tailwind.config.ts` as semantic color names:

| Token | Use |
|-------|-----|
| `bg-glass` | Panel/floating UI background |
| `text-primary` | Main text |
| `text-muted` | Secondary/disabled text |
| `border-glass` | Panel borders |
| `accent` | Highlight / interactive accent color |
| `danger` | Destructive actions |
| `success` | Positive feedback |

**Themes** (toggled via `data-theme` attribute on `<html>`):
- **Warm** (default): warm brown-black + amber gold accent — "candlelit parchment" feel
- **Cold**: cool blue-black + blue accent

**Animation durations** (Tailwind classes or CSS variables):
- 150ms — micro-interactions (hover states)
- 250ms — standard transitions
- 400ms — emphasis animations
- Always respect `prefers-reduced-motion`

## Server Architecture

- File: `server/index.mjs`
- Port: 4444 (y-websocket + y-leveldb)
- Persistence: LevelDB database in `./db` directory
- Assets: Uploaded files stored in `public/assets/`

## Development Workflow

### Current Status

- [x] Scene mode MVP
- [x] Combat mode with token drag/drop (react-konva canvas)
- [x] Character cards with 5-zone layout
- [x] Bottom dock asset library (maps/tokens/handouts tabs)
- [x] Measurement tools + range templates (basic implementation in `src/combat/tools/`)
- [x] Ambient audio system
- [x] Theme toggle (Warm/Cold presets)
- [ ] Cursor sync across clients
- [ ] UX polish
- [ ] Dual-document security architecture
- [ ] Cloud deployment (Nginx + HTTPS + Docker)

### Git Workflow (IMPORTANT)

**All development MUST use git worktrees with dedicated branches:**

1. Create a new worktree + branch for every feature or fix: `git worktree add .worktrees/<branch-name> -b <branch-name>`
2. Do all work inside the worktree directory
3. Submit a Pull Request to merge into `main` — direct pushes are NOT allowed

**Linear history — squash merge only:**

- The `main` branch MUST maintain a linear commit history
- PRs MUST be merged using **squash merge** (`gh pr merge --squash`) — never use merge commits or rebase merge
- This keeps `main` clean: one commit per PR, no merge bubbles

**Merge requires explicit user consent (IMPORTANT):**

- **NEVER merge a PR** without the user explicitly saying so (e.g. "merge", "合并", "merge the PR")
- Creating a PR and merging a PR are two separate steps — do NOT merge immediately after creating
- After creating a PR, stop and wait for the user to review and give the go-ahead

**Worktree conventions:**

- Worktree directory: `.worktrees/<branch-name>` (already in `.gitignore`)
- Each worktree has its own `.env` file for port/path isolation (see `.env.example`)
- Shared functions live in `/src/shared/` to minimize cross-branch conflicts

### Documentation Language

- All newly created documentation files (specs, plans, design docs, etc.) MUST be written in Chinese (中文)
- Code comments and CLAUDE.md may remain in English

### Commit Convention

- Do NOT add `Co-Authored-By` or any AI attribution lines to commit messages
- Do NOT add AI-generated disclaimers (e.g., "Generated with Claude Code") to PR descriptions

## Code Quality & Testing

### Formatting & Linting

- **Prettier** (`.prettierrc`): no semicolons, single quotes, trailing commas, printWidth 100, tabWidth 2
- **ESLint**: TypeScript-aware, react-hooks rules (`exhaustive-deps` as warn)
- **lint-staged + husky**: runs `prettier --write` + `eslint --fix` automatically on every git commit
- `react-hooks/set-state-in-effect` is OFF — Yjs observer pattern requires setting state in effects

### TypeScript

- Strict mode enabled (`strict: true`)
- `noUnusedLocals: true`, `noUnusedParameters: true`
- Target: ES2022 (app) / ES2023 (server)

### Testing

- **Framework**: vitest + jsdom
- **Test files**: `src/**/__tests__/` directories
- **Test utilities**: `src/__test-utils__/` (fixtures, yjs-helpers, setup)
- Commands: `npm test` (single run) · `npm run test:watch` · `npm run test:coverage`

## Product Design Principles

Three core principles (from `docs/design-discussion/00-产品愿景与设计理念.md`):

1. **轻备团优先 (Low Prep Overhead)** — GMs should be able to run sessions with minimal preparation. Avoid features that require significant upfront setup.
2. **氛围感至上 (Atmosphere First)** — Scene immersion takes priority over mechanical precision. Visual and audio atmosphere are first-class features.
3. **直觉式交互 (Intuitive Interaction)** — Zero learning curve. Players who've never used a VTT should be able to participate immediately.

Target aesthetic: **Alchemy RPG** — dark warm tones, candlelit parchment feel, subtle particle effects.

## Planned: Dual-Document Architecture (Not Yet Implemented)

A major future security upgrade (designed in `docs/design-discussion/30-双文档架构方案.md`):

- Split current single Y.Doc into **Public Doc** (all players) + **GM Secret Doc** (GM only)
- Room-level token auth: `gmToken` and `playerToken` distributed via URL hash, stored in sessionStorage, sent as WebSocket query param
- WebSocket room naming: `{roomId}:public` and `{roomId}:secret`
- Three entity visibility states: fully public · visible but has secrets · completely hidden
- Cross-doc operations: short-term = client-side relay (GM browser reads secret → writes public); long-term = server API

**Do not implement features that assume the current single-doc model is permanent** — the dual-doc split will change how entity visibility and GM-only data are handled.
