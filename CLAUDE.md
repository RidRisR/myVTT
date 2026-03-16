# myVTT - Lightweight Scene-Based VTT

React + Socket.io + SQLite VTT with dual-mode: Scene (atmosphere) + Tactical (combat tokens on react-konva canvas).

## Tech Stack

| Layer    | Stack                                                                      |
| -------- | -------------------------------------------------------------------------- |
| Frontend | React 19.2, Vite 7.3, TypeScript 5.9, Tailwind CSS v4, konva + react-konva |
| State    | zustand v5 (REST init + Socket.io events → React)                          |
| Server   | Express 5.2, better-sqlite3 (per-room SQLite), Socket.io v4.8              |
| Testing  | vitest v4 + @testing-library/react + jsdom                                 |

## ⚠️ MANDATORY — Required Reading Before You Code

**STOP. Before writing any code, check the table below. If your task matches a trigger, you MUST read the linked document first. Do NOT skip this step.**

| When you are…                                        | Read first                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| Adding a click handler / user action that calls APIs | [store-actions.md](docs/conventions/store-actions.md)                 |
| Fixing any bug                                       | [bug-fix-workflow.md](docs/conventions/bug-fix-workflow.md)           |
| Adding or modifying server routes / middleware       | [server-infrastructure.md](docs/conventions/server-infrastructure.md) |
| Creating branches, committing, or opening PRs        | [git-workflow.md](docs/conventions/git-workflow.md)                   |

## ⚠️ Bug Fix Discipline

**Every bug fix MUST**: identify root cause → add regression test → propose & implement systemic prevention for the entire bug category. PR must have `## Root Cause`, `## Regression Test`, `## Systemic Prevention` sections. See [bug-fix-workflow.md](docs/conventions/bug-fix-workflow.md).

## Architecture Gotchas (cannot be linted — read before touching these areas)

### react-konva (Canvas, not DOM)

- `KonvaMap.tsx`: Stage → Layers (background → grid → tokens → tools)
- Token positions in map coordinates; screen→map: `mapX = (screenX - stageOffset.x) / scale`
- **Konva right-click**: `e.evt.stopPropagation()` required — `preventDefault()` alone does NOT stop DOM-level `contextmenu` from firing
- Token drag: local React state during drag (60fps) → grid snap + REST on pointerUp

### zustand Selector Pitfalls

- **No derived-data methods in stores** — `.filter()` / `.sort()` return new refs → infinite re-renders. Use `useMemo` in components
- **Module-level constants for all fallback/default values** — `?? []` or `?? {}` inline creates a new reference on every call/render. This breaks both zustand `Object.is()` equality and `useMemo` deps stability. Use `const EMPTY: X[] = []` at module scope anywhere the value is used in selector return, `useMemo` dep array, or component-level equality comparison.
- **All hooks before any early return** — React hook ordering rules apply
- **Flags that describe data must live with the data** — If a flag (e.g. "is this item new?") controls render behavior on first mount, it MUST be in the same zustand `set()` call as the item itself. Tracking it in a component `useState` + `useEffect` creates a timing gap: the component mounts before the effect fires, so `useRef(flag)` freezes the wrong value. Example: `freshChatIds` is updated atomically with `chatMessages` inside the `chat:new` handler.

### Express / Server

- `res.sendFile()` MUST include `dotfiles: 'allow'` — Express silently 404s paths with dot-prefixed dirs
- Route params in filesystem paths: validated via `app.param('roomId', ...)` middleware
- multer: `fileFilter` restricts MIME types; asset deletion cleans both SQLite and disk file

## UI Patterns

- **Tailwind only** — no inline styles (except dynamic runtime values)
- Design tokens: `bg-glass`, `text-primary`, `text-muted`, `border-glass`, `accent`, `danger`, `success`
- z-index: base(0) → tactical(100) → ui(1000) → popover(5000) → overlay(8000) → modal(9000) → toast(10000)
- Icons: Lucide React, strokeWidth=1.5, sizes 16/20/24px
- Themes: Warm (default, amber gold) / Cold (blue)

## Code Quality

- **Prettier**: no semicolons, single quotes, trailing commas, printWidth 100
- **ESLint**: TypeScript strict, react-hooks, `no-restricted-imports` for api module
- **Husky**: pre-commit runs lint-staged + tsc + doc structure check
- **TypeScript**: strict mode, noUnusedLocals, noUnusedParameters, noUncheckedIndexedAccess
- **Tests**: `npm test` (vitest run), files in `src/**/__tests__/` and `server/__tests__/`
- `react-hooks/set-state-in-effect` OFF — Socket.io listener pattern requires it

## Product Design Principles

1. **轻备团优先** — minimal GM preparation overhead
2. **氛围感至上** — atmosphere over mechanical precision
3. **直觉式交互** — zero learning curve

Target aesthetic: **Alchemy RPG** — dark warm tones, candlelit parchment feel.

## Architecture (details in docs/)

For deeper understanding, read the linked docs. The summaries below help you orient quickly.

| Document                                                      | What it covers                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [overview](docs/architecture/overview.md)                     | Tech stack, data flow, module map, deployment, Socket.io events          |
| [data-model](docs/architecture/data-model.md)                 | SQLite schema (13 tables), Entity/Scene/Token types, JSON field strategy |
| [state-management](docs/architecture/state-management.md)     | 4 zustand stores, Socket.io event handlers, optimistic update rules      |
| [tactical-system](docs/architecture/tactical-system.md)       | KonvaMap layers, Token drag flow, Archive save/load, enter/exit          |
| [rule-plugin-system](docs/architecture/rule-plugin-system.md) | RulePlugin 6+1 layer interface, registry, SDK, existing plugins          |

**Quick reference**:

- **Data flow**: REST API (init) + Socket.io (real-time) → zustand stores → React
- **Stores**: worldStore (core data), identityStore (seats), assetStore (files), uiStore (client UI)
- **Server**: `server/index.ts` → 11 route modules → `schema.ts` (13 tables) → per-room SQLite
- **Entity lifecycle**: `'ephemeral'` (one-time NPC) / `'reusable'` (library NPC) / `'persistent'` (PC)
- **Entity data**: `{ id, name, imageUrl, color, width, height, notes, ruleData, permissions, lifecycle }`
- **Scene-Entity M2M**: `sceneEntityEntries: { entityId, visible }[]` (NOT embedded entity data)
- **Entity deletion**: FK `ON DELETE CASCADE` removes related tokens
- **Rule plugin**: `getRulePlugin(roomState.ruleSystemId)` — base code never imports `plugins/` directly
- **No auth**: Currently no JWT/identity — `withRole` reads `X-MyVTT-Role` header (spoofable)

## Documentation Language

- New docs (design, plans, specs): Chinese (中文)
- Code comments and CLAUDE.md: English
