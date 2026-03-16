# myVTT

Lightweight, self-hosted Virtual Tabletop for TTRPG sessions.

Scene-based atmosphere + lightweight tactical combat, real-time multiplayer via Yjs CRDT.

## Quick Start

```bash
npm install
npm run dev        # starts both server (port 4444) and client (port 5173)
```

Open `http://localhost:5173` in two browser tabs to test multiplayer.

### Scripts

| Command              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | Start server + client concurrently                       |
| `npm run dev:server` | Server only (port 4444)                                  |
| `npm run dev:client` | Vite dev server only                                     |
| `npm run build`      | TypeScript check + Vite production build                 |
| `npm run start`      | Production server (serves built files + WebSocket + API) |

## Tech Stack

| Layer           | Technology                          |
| --------------- | ----------------------------------- |
| Frontend        | React 19, TypeScript 5.9, Vite 7    |
| Real-time sync  | Yjs (CRDT) + y-websocket v2         |
| Persistence     | y-leveldb (LevelDB)                 |
| Combat viewport | react-zoom-pan-pinch                |
| Server          | Express 5, multer (file upload), ws |
| Styling         | Inline styles, dark glass theme     |

## Design Philosophy

See [docs/design.md](docs/design.md) for the full design document.

**Core ideas:**

- **Scene-based, not canvas-based** — Full-screen scene images with cinematic transitions, not an infinite whiteboard
- **Lightweight combat** — Owlbear Rodeo-level tactical map (tokens on a zoomable map), not a drawing app
- **Trust-based** — No backend auth; all state is globally synced via Yjs CRDT, role-based visibility is client-side
- **Self-hosted** — Single Node.js server, deploy anywhere with Docker

## Project Structure

```
src/
  App.tsx                    # Root: mode switching, state wiring
  main.tsx                   # React entry

  yjs/                       # Yjs data layer
    useYjsConnection.ts      # Y.Doc + WebsocketProvider + awareness
    useRoom.ts               # Room state (mode, active/combat scene)
    useScenes.ts             # Scene CRUD (Y.Map)

  scene/                     # Scene mode (exploration/narrative)
    SceneViewer.tsx           # Full-screen scene image

  combat/                    # Combat mode (tactical map)
    CombatViewer.tsx          # TransformWrapper + map + tokens
    CombatMap.tsx             # Scene background + SVG grid overlay
    TokenLayer.tsx            # Token rendering + drag logic
    MapToken.tsx              # Single token (image + border)
    TokenOverlay.tsx          # Name, HP bar, status chips
    TokenPropertiesPanel.tsx  # GM token editing panel
    combatTypes.ts            # CombatToken, TokenBlueprint types
    combatUtils.ts            # Grid snap, coordinate conversion
    useCombatTokens.ts        # Token CRUD (Y.Map)
    useTokenLibrary.ts        # Blueprint library CRUD (Y.Map)

  dock/                      # Bottom dock (GM asset library)
    BottomDock.tsx            # Tab bar + expanded content
    MapDockTab.tsx            # Scene/map thumbnails
    TokenDockTab.tsx          # Token blueprint library

  chat/                      # Dice roller + chat
    ChatPanel.tsx             # Overlay panel (bottom-right)
    ChatInput.tsx             # Dice expression input + @key autocomplete
    ChatMessageBubble.tsx     # Message rendering
    DiceResultCard.tsx        # Dice roll display
    DiceReel.tsx              # Animated dice

  identity/                  # Seat/player system
    SeatSelect.tsx            # Seat selection screen
    useIdentity.ts            # Seat CRUD + awareness

  layout/                    # UI chrome
    HamburgerMenu.tsx         # Top-left menu
    PortraitBar.tsx           # Top-center player portraits
    MyCharacterCard.tsx       # Left-side character card (5-zone)
    CharacterDetailPanel.tsx  # Right-side inspected character

  gm/                        # GM tools
    GmToolbar.tsx             # Scene picker, combat toggle
    SceneLibrary.tsx          # Scene management modal

  shared/                    # Reusable utilities
    roleState.ts              # GM/PL state (useSyncExternalStore)
    tokenTypes.ts             # Resource, Attribute, Status, Handout
    tokenUtils.ts             # Bar colors, status colors
    diceUtils.ts              # NdM parser + roll logic
    assetUpload.ts            # File upload to server
    panelUtils.ts             # Numeric value parsing
    useHoldRepeat.ts          # Hold-to-repeat button hook

server/
  index.mjs                  # Express + WebSocket + multer + admin page
  uploads/                   # Uploaded assets
```

## License

Private project.
