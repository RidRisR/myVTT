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

**Yjs Mutation Rules:**

- All Y.Doc mutations MUST happen inside a `transact()` block
- When using delta persistence (`ydoc.on('update', ...)`), the listener MUST be registered BEFORE any mutations
- When writing a complete state to a Y.Map (e.g., activateEncounter), clear all existing keys first before writing new ones — prevents stale data from previous operations

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

| Layer   | Value | Use case            |
| ------- | ----- | ------------------- |
| base    | 0     | Default stacking    |
| combat  | 100   | Combat map overlays |
| ui      | 1000  | General UI panels   |
| popover | 5000  | Dropdowns, tooltips |
| overlay | 8000  | Modal backdrops     |
| modal   | 9000  | Modals, dialogs     |
| toast   | 10000 | Toast notifications |

## State Management

Data flow: **Yjs → zustand store → React components** (via fine-grained selectors)

- Yjs observers write into zustand stores; components subscribe via selectors — never read Y.Map directly in render
- Do NOT use SyncedStore (abandoned, incompatible with React 19)
- Do NOT add derived-data methods (`.filter()`, `.sort()`) to zustand stores — they return new references on every call and cause infinite re-renders when used as selectors. Use `useMemo` in components instead
- **Selector fallback values MUST be module-level constants** — `?? {}` or `?? []` inside a selector creates a new reference every call, breaking zustand's `Object.is()` equality check and causing infinite re-renders. Use `const EMPTY: X[] = []` at module scope instead.
- **All hooks MUST be placed before any early return** — React requires the same number of hooks in the same order on every render. `useMemo`/`useEffect`/`useWorldStore()` after `if (loading) return ...` will crash when the condition flips.
- **Avoid inline derived computations in render** — `Object.values(record)`, `arr.filter(...)`, or function calls that return new arrays/objects MUST be wrapped in `useMemo` with proper deps, not called directly in the render body or JSX props.

**Store files in `src/stores/`:**

| File               | Purpose                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `worldStore.ts`    | Main bridge — Yjs observer writes scenes, entities, room, etc. into React-readable state |
| `uiStore.ts`       | Client-only UI state: selectedTokenId, activeTool, theme, panel open/closed              |
| `identityStore.ts` | Seat/identity state                                                                      |
| `selectors.ts`     | Selector functions for efficient component subscriptions                                 |
| `assetStore.ts`    | Asset management — upload, list, update, delete                                          |

### Store Action Convention (Testability)

**Core rule: All user actions that affect shared state MUST be named Store methods. Component onClick handlers MUST be single-line calls.**

| Action type | Where? | Example |
|-------------|--------|---------|
| Involves API calls | Store method | `worldStore.addScene(...)` |
| Multi-step orchestration | Store method | `worldStore.spawnFromBlueprint(bp, sceneId)` |
| Pure UI state | Component / uiStore | `uiStore.setSelectedTokenId(null)` |

```
✅ <button onClick={() => worldStore.spawnFromBlueprint(bp, sceneId)} />
❌ <button onClick={() => { addEntity(); addToScene(); addToken(); }} />
```

**Why**: Store methods can be called directly in Node.js integration tests, enabling full-chain verification (Store → HTTP → SQLite → Socket → Store). Multi-step logic inside component closures cannot be tested without a browser.

### Integration Testing

- Integration test files: `server/__tests__/scenarios/*.test.ts` (Node environment, real server)
- Test entry point is **Store methods** or **raw HTTP calls** (= simulating button clicks), verifying both Store state and server state
- Use `setupTestRoom()` from `server/__tests__/helpers/test-server.ts` to create ephemeral room + test server; call `cleanup()` to tear down
- Each test file = one complete user journey, executed in chronological order
- **Dual verification**: after each operation, assert both Store state (`getState()`) and server state (`GET` request)
- Tests run in pure Node.js (no browser, no mocks) — use `// @vitest-environment node` pragma

## Styling Infrastructure

All styling uses **Tailwind CSS v4**. Do NOT write inline styles.

- Fixed pixel values MUST use Tailwind arbitrary values (e.g., `h-[70px]`), not `style={{}}`
- `style={{}}` is ONLY acceptable for: (1) dynamic values computed at runtime, (2) CSS properties without Tailwind equivalents (e.g., `contentVisibility`, complex `gridTemplateColumns`)

**Design tokens** are defined in `tailwind.config.ts` as semantic color names:

| Token          | Use                                  |
| -------------- | ------------------------------------ |
| `bg-glass`     | Panel/floating UI background         |
| `text-primary` | Main text                            |
| `text-muted`   | Secondary/disabled text              |
| `border-glass` | Panel borders                        |
| `accent`       | Highlight / interactive accent color |
| `danger`       | Destructive actions                  |
| `success`      | Positive feedback                    |

**Themes** (toggled via `data-theme` attribute on `<html>`):

- **Warm** (default): warm brown-black + amber gold accent — "candlelit parchment" feel
- **Cold**: cool blue-black + blue accent

**Animation durations** (Tailwind classes or CSS variables):

- 150ms — micro-interactions (hover states)
- 250ms — standard transitions
- 400ms — emphasis animations
- Always respect `prefers-reduced-motion`

## Server Architecture

- Files: `server/app.mjs` (Express app + routes) + `server/index.mjs` (server startup + WebSocket)
- Port: 4444 (y-websocket + y-leveldb)
- Persistence: per-room LevelDB in `data/rooms/{roomId}/db/`
- Assets: Uploaded files stored in `data/rooms/{roomId}/uploads/`
- Tests: `server/__tests__/` (vitest + supertest, runs in node environment)

**Server Security Rules:**

- All route parameters used in filesystem paths MUST be validated against `/^[a-zA-Z0-9_-]+$/` — enforced by `app.param('roomId', ...)` middleware
- multer uploads MUST have `fileFilter` restricting to allowed MIME types (image/video/audio)
- Asset deletion MUST clean up both metadata (LevelDB) and the associated file on disk
- `res.sendFile()` MUST include `dotfiles: 'allow'` when serving user-uploaded files — Express's `send` module silently returns 404 for paths containing dot-prefixed directories (e.g., `.worktrees/`)

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
- [ ] Security & permissions system (preparation area + encrypted fields)
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
- **lint-staged + husky**: runs `prettier --write` + `eslint --fix` automatically on every git commit, then `tsc --noEmit` for full type-checking
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

### Bug Fix Workflow (IMPORTANT)

Every bug fix MUST follow this process — fixing the symptom alone is not enough:

1. **Fix the bug** — apply the minimal correct fix
2. **Add a regression test** — write a test that would have caught this bug. The test must fail without the fix and pass with it
3. **Think about systemic prevention** — ask: "What category of bug is this? Can a rule, convention, or structural guard prevent the entire category?" If yes, add it to CLAUDE.md or as a lint rule/middleware/type constraint
4. **Update CLAUDE.md if needed** — if the bug revealed a non-obvious framework behavior or environment quirk, document it so the same mistake isn't repeated

Examples of systemic prevention:

- Express `send` module rejects dotfile paths → documented + test added for file serving round-trip
- `app.param()` middleware → structural guard that auto-validates all routes, not just the ones we remember to check
- classic-level v3 returns `undefined` instead of throwing → documented API difference
- Duplicate data source (worldStore.blueprints vs assetStore type='blueprint') → Single Source of Truth rule (below)

### Single Source of Truth Rule

**Each category of business data MUST have exactly one Store as its source of truth.** If a new Store can cover the same data as an existing Store field, the old field MUST be removed in the same PR.

Symptoms of violation: data exists in memory but disappears on refresh, data appears in wrong UI tab, inconsistent state between stores.

Example: `worldStore.blueprints` (local-only array) vs `assetStore` assets with `type: 'blueprint'` (server-persisted). The local array was never saved to the server — blueprints vanished on page reload. Fix: delete `worldStore.blueprints`, use `assetStore` as the single source.


## Product Design Principles

Three core principles (from `docs/design/01-产品愿景与设计理念.md`):

1. **轻备团优先 (Low Prep Overhead)** — GMs should be able to run sessions with minimal preparation. Avoid features that require significant upfront setup.
2. **氛围感至上 (Atmosphere First)** — Scene immersion takes priority over mechanical precision. Visual and audio atmosphere are first-class features.
3. **直觉式交互 (Intuitive Interaction)** — Zero learning curve. Players who've never used a VTT should be able to participate immediately.

Target aesthetic: **Alchemy RPG** — dark warm tones, candlelit parchment feel, subtle particle effects.

## Planned: Security & Permissions System (Not Yet Implemented)

A future security upgrade (designed in `docs/design/07-权限与数据隔离方案设计.md`, part of the security system in `docs/design/03-聊天防伪系统.md`):

- **Single Y.Doc architecture preserved** — no dual-doc split
- **Preparation area**: Server-side JSON storage (`{PERSISTENCE_DIR}/prep/{roomId}/`) for GM's unrevealed content (encounters, NPC templates, plot notes). Players cannot access — REST API with JWT role check.
- **Encrypted fields**: Entity `secretData` field encrypted with AES-256-GCM. F12 shows ciphertext only. Encryption key distributed via `GET /api/rooms/:roomId/key` (GM only).
- **Auth**: JWT cookie + server-side role lookup (part of the identity system in doc 53)
- **Deploy flow**: GM deploys preparation content → server reads JSON → writes to Y.Doc via `transact('server')`

Entity `secretData` loses field-level CRDT (encrypted blob = last-write-wins), acceptable since only GM edits secrets.
