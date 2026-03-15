# myVTT - Lightweight Scene-Based VTT

## Project Overview

myVTT is a lightweight Virtual Tabletop built with React + Socket.io + SQLite for real-time multi-user collaboration. It features a dual-mode design:

- **Scene Mode**: Atmospheric full-screen scenes for narrative play
- **Combat Mode**: Lightweight tactical combat with token management and grid support

## Tech Stack

- **Frontend**: React 19.2, Vite 7.3, TypeScript 5.9
- **Real-time Sync**: Socket.io v4.8 (client + server)
- **State Management**: zustand v5.0.11 (REST + Socket.io → React bridge)
- **Canvas Rendering**: konva v10.2 + react-konva v19.2 (combat tactical map)
- **Styling**: Tailwind CSS v4 + design tokens (see Styling Infrastructure section)
- **Icons**: Lucide React v0.577
- **Server**: Node.js with Express 5.2, better-sqlite3 v12.6 (persistence)
- **File Upload**: multer 2.1
- **Testing**: vitest v4 + @testing-library/react v16 + jsdom

## Critical Architecture Notes

### Entity System

- Core type: `Entity` (id, name, imageUrl, color, size, notes, ruleData, permissions, lifecycle)
- `entities` = global unique store for ALL entities (PC + NPC), persisted in SQLite
- Scene holds `sceneEntityEntries` — a reference list of `{ entityId, visible }` objects (NOT embedded entity data). `visible` controls on-stage vs backstage.
- `lifecycle` enum: `'ephemeral'` (one-time NPC, deleted on removal), `'reusable'` (important NPC, kept in library), `'persistent'` (PC/companion, auto-joins new scenes)
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

### Token Drag Pattern

- **During drag**: update local React state only (60fps smooth)
- **On pointerUp**: grid snap + REST API write (network sync via Socket.io broadcast)
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

| Layer    | Value | Use case              |
| -------- | ----- | --------------------- |
| base     | 0     | Default stacking      |
| tactical | 100   | Tactical map overlays |
| ui       | 1000  | General UI panels     |
| popover  | 5000  | Dropdowns, tooltips   |
| overlay  | 8000  | Modal backdrops       |
| modal    | 9000  | Modals, dialogs       |
| toast    | 10000 | Toast notifications   |

## State Management

Data flow: **REST API (init/CRUD) + Socket.io (real-time events) → zustand stores → React components** (via fine-grained selectors)

- Stores fetch initial state via REST, then listen for Socket.io events to stay in sync
- Components subscribe via zustand selectors — never call REST APIs directly in render
- Do NOT add derived-data methods (`.filter()`, `.sort()`) to zustand stores — they return new references on every call and cause infinite re-renders when used as selectors. Use `useMemo` in components instead
- **Selector fallback values MUST be module-level constants** — `?? {}` or `?? []` inside a selector creates a new reference every call, breaking zustand's `Object.is()` equality check and causing infinite re-renders. Use `const EMPTY: X[] = []` at module scope instead.
- **All hooks MUST be placed before any early return** — React requires the same number of hooks in the same order on every render. `useMemo`/`useEffect`/`useWorldStore()` after `if (loading) return ...` will crash when the condition flips.
- **Avoid inline derived computations in render** — `Object.values(record)`, `arr.filter(...)`, or function calls that return new arrays/objects MUST be wrapped in `useMemo` with proper deps, not called directly in the render body or JSX props.

**Store files in `src/stores/`:**

| File               | Purpose                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `worldStore.ts`    | Main bridge — REST init + Socket.io events for scenes, entities, room, etc. |
| `uiStore.ts`       | Client-only UI state: selectedTokenId, activeTool, theme, panel open/closed |
| `identityStore.ts` | Seat/identity state                                                         |
| `selectors.ts`     | Selector functions for efficient component subscriptions                    |
| `assetStore.ts`    | Asset management — upload, list, update, delete                             |

### Store Action Convention (Testability)

**Core rule: All user actions that affect shared state MUST be named Store methods. Component onClick handlers MUST be single-line calls.**

| Action type              | Where?              | Example                                      |
| ------------------------ | ------------------- | -------------------------------------------- |
| Involves API calls       | Store method        | `worldStore.addScene(...)`                   |
| Multi-step orchestration | Store method        | `worldStore.spawnFromBlueprint(bp, sceneId)` |
| Pure UI state            | Component / uiStore | `uiStore.setSelectedTokenId(null)`           |

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

- Entry point: `server/index.ts` (Express + HTTP + Socket.io)
- Routes: `server/routes/` (modular route files, each receives `io` for broadcasting)
- Database: `server/db.ts` + `server/schema.ts` (per-room SQLite in `data/rooms/{roomId}/room.db`, WAL mode)
- Awareness: `server/awareness.ts` (ephemeral Socket.io events: cursor, drag, etc.)
- Assets: Uploaded files stored in `data/rooms/{roomId}/uploads/`
- Tests: `server/__tests__/` (vitest + supertest, runs in node environment)

**Server Security Rules:**

- All route parameters used in filesystem paths MUST be validated against `/^[a-zA-Z0-9_-]+$/` — enforced by `app.param('roomId', ...)` middleware
- multer uploads MUST have `fileFilter` restricting to allowed MIME types (image/video/audio)
- Asset deletion MUST clean up both metadata (SQLite) and the associated file on disk
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
- [x] Data layer refactor (REST API + Socket.io + SQLite)
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

- **Commit messages and PR titles MUST be in English** — no Chinese or other non-ASCII characters in the subject line
- Follow conventional commits format: `type: short description` (e.g., `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`)
- Do NOT add `Co-Authored-By` or any AI attribution lines to commit messages
- Do NOT add AI-generated disclaimers (e.g., "Generated with Claude Code") to PR descriptions

## Code Quality & Testing

### Formatting & Linting

- **Prettier** (`.prettierrc`): no semicolons, single quotes, trailing commas, printWidth 100, tabWidth 2
- **ESLint**: TypeScript-aware, react-hooks rules (`exhaustive-deps` as warn)
- **lint-staged + husky**: runs `prettier --write` + `eslint --fix` automatically on every git commit, then `tsc --noEmit` for full type-checking
- `react-hooks/set-state-in-effect` is OFF — Socket.io listener pattern requires setting state in effects

### TypeScript

- Strict mode enabled (`strict: true`)
- `noUnusedLocals: true`, `noUnusedParameters: true`
- Target: ES2022 (app) / ES2023 (server)

### Testing

- **Framework**: vitest + jsdom
- **Test files**: `src/**/__tests__/` directories
- **Test utilities**: `src/__test-utils__/` (fixtures, setup)
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

- **Preparation area**: Server-side storage for GM's unrevealed content (encounters, NPC templates, plot notes). Players cannot access — REST API with JWT role check.
- **Encrypted fields**: Entity `secretData` field encrypted with AES-256-GCM. F12 shows ciphertext only. Encryption key distributed via `GET /api/rooms/:roomId/key` (GM only).
- **Auth**: JWT cookie + server-side role lookup (part of the identity system in doc 53)
- **Deploy flow**: GM deploys preparation content → server writes to SQLite + broadcasts via Socket.io
