# myVTT - Lightweight Scene-Based VTT

## Project Overview

myVTT is a lightweight Virtual Tabletop built with React + Yjs + y-websocket for real-time multi-user collaboration. It features a dual-mode design:

- **Scene Mode**: Atmospheric full-screen scenes for narrative play
- **Combat Mode**: Lightweight tactical combat with token management and grid support

## Tech Stack

- **Frontend**: React 19.2, Vite 7.3, TypeScript 5.9
- **Real-time Sync**: Yjs v13.6.29, y-websocket v2.1.0
- **Server**: Node.js with Express 5.2, y-leveldb v0.2.0 (persistence)
- **UI Libraries**: react-zoom-pan-pinch v3.7.0 (combat zoom/pan)
- **File Upload**: multer 2.1

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
- Main maps: `room`, `scenes`, `combat_tokens`, `token_blueprints`, `players`, `team_trackers`
- Chat log: `yDoc.getArray('chat_log')` with Y.Array.observe()

**Entity System:**

- Core type: `Entity` (id, name, avatar, permissions, resources, attributes, statuses, notes)
- Combat tokens: `MapToken` extends Entity with map coordinates (x, y, size)
- Blueprints: reusable token templates stored in `token_blueprints` map
- Adapters: `entityAdapters.ts` provides read-only getters (getEntityResources, getEntityAttributes, etc.)

### react-zoom-pan-pinch

- `useTransformContext()` returns `ZoomPanPinch` instance with:
  - `transformState`: scale, positionX, positionY
  - `wrapperComponent`: DOM ref
- Token drag conflict resolution: add `className="combat-token"`, configure `panning={{ excluded: ['combat-token'] }}`
- Screen→Map conversion: `mapX = (screenX - wrapperRect.left - positionX) / scale`

### Token Drag Pattern

- **During drag**: update local React state only (60fps smooth)
- **On pointerUp**: grid snap + Yjs write (network sync)
- Use window-level pointermove/pointerup listeners during drag
- 3px threshold before visual drag starts (prevents accidental drags)

### UI Design Patterns

- **Floating UI**: `position: fixed` + z-index 10000+
- **Dark glass theme**: `rgba(15,15,25,0.92)` bg + `backdrop-filter: blur(16px)`
- **Click-outside-to-close**: document pointerdown listener checking `contains()`
- **Hold-to-repeat buttons**: custom hook with acceleration

## Server Architecture

- File: `server/index.mjs`
- Port: 4444 (y-websocket + y-leveldb)
- Persistence: LevelDB database in `./db` directory
- Assets: Uploaded files stored in `public/assets/`

## Development Workflow

### Current Status

- [x] Scene mode MVP
- [x] Combat mode with token drag/drop
- [x] Character cards with 5-zone layout
- [x] Bottom dock asset library (maps/tokens/handouts tabs)
- [ ] Measurement tools + cursors
- [ ] UX polish
- [ ] Cloud deployment (Nginx + HTTPS + Docker)

### Parallel Development Strategy

This project supports parallel feature development using git worktrees:

1. Shared functions extracted to `/src/shared/` (idUtils, entityTypes, etc.)
2. Feature branches work independently with minimal conflicts
3. Merge strategy: sequential integration with rebase

Branch-specific constraints are documented in respective feature branch CLAUDE.md files.

### Branch Protection

- **`main` branch is protected** - direct pushes are NOT allowed
- All changes MUST go through Pull Requests
- Create a feature/fix branch, commit there, then open a PR to merge into main

### Documentation Language

- All newly created documentation files (specs, plans, design docs, etc.) MUST be written in Chinese (中文)
- Code comments and CLAUDE.md may remain in English

### Commit Convention

- Do NOT add `Co-Authored-By` or any AI attribution lines to commit messages
