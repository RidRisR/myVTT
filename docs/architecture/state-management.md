# 状态管理

## 架构概览

```
REST API (init) ──► zustand stores ──► React components
                        ▲
Socket.io events ───────┘ (real-time updates)
```

四个 zustand store 各司其职，通过 `init()` 加载初始数据，通过 Socket.io 事件保持实时同步。

## Store 职责划分

| Store              | 文件               | 职责                                                                                     | 大小     |
| ------------------ | ------------------ | ---------------------------------------------------------------------------------------- | -------- |
| `useWorldStore`    | `worldStore.ts`    | 核心数据：scenes, entities, tactical, assets, blueprints, tags, showcase, archives, logs | ~1000 行 |
| `useIdentityStore` | `identityStore.ts` | 座位/身份：seats, mySeatId, onlineSeatIds                                                | ~200 行  |
| `useSessionStore`  | `sessionStore.ts`  | 客户端 session 状态：selection + pending interactions（plugin system Phase 6）           | ~60 行   |
| `useUiStore`       | `uiStore.ts`       | 客户端 UI 状态（不持久化）：选中 Token、活动工具、主题等                                 | ~320 行  |

### worldStore 概要

最大的 store，包含所有需要实时同步的业务数据。

**状态字段**：

- `room: RoomState` — 活动场景 ID、战术模式开关、规则系统 ID
- `scenes: Scene[]` — 场景列表
- `sceneEntityMap: Record<string, SceneEntityEntry[]>` — 每个场景的实体关联
- `entities: Record<string, Entity>` — 实体表（id → Entity）
- `tacticalInfo: TacticalInfo | null` — 当前战术状态
- `showcaseItems: ShowcaseItem[]` — 展示材料
- `showcasePinnedItemId: string | null` — 置顶展示
- `teamTrackers: TeamTracker[]` — 团队追踪器
- `archives: ArchiveRecord[]` — 战术存档（扁平数组）
- `assets: AssetMeta[]` — 素材列表
- `blueprints: Blueprint[]` — 蓝图列表
- `tags: TagMeta[]` — 标签列表
- `logEntries: GameLogEntry[]` — 游戏日志
- `logEntriesById: Record<string, GameLogEntry>` — 日志索引（id → entry）
- `logWatermark: number` — 已同步的最大 seq
- `handoutAssets: HandoutAsset[]` — Handout（纯本地状态）

**Actions 分类**：

| 类别      | 主要 Actions                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| 初始化    | `init(roomId, socket)`                                                                                                 |
| 房间状态  | `setActiveScene`, `setRuleSystem`                                                                                      |
| 场景      | `addScene`, `updateScene`, `deleteScene`                                                                               |
| 场景-实体 | `addEntityToScene`, `removeEntityFromScene`, `toggleEntityVisibility`                                                  |
| 实体      | `addEntity`, `updateEntity`, `deleteEntity`, `createEphemeralNpcInScene`, `spawnEphemeralTokenAtPosition`              |
| 蓝图      | `saveEntityAsBlueprint`, `spawnFromBlueprint`                                                                          |
| 战术      | `enterTactical`, `exitTactical`, `loadArchive`, `saveArchive`, `updateTacticalGrid`, `setTacticalMapUrl`               |
| Token     | `createToken`, `addToken`, `updateToken`, `deleteToken`                                                                |
| 存档      | `fetchArchives`, `createArchive`, `deleteArchive`, `updateArchive`                                                     |
| 聊天      | （通过 REST API 直接调用，Socket 事件更新 store）                                                                      |
| 展示      | `addShowcaseItem`, `updateShowcaseItem`, `deleteShowcaseItem`, `clearShowcase`, `pinShowcaseItem`, `unpinShowcaseItem` |
| 追踪器    | `addTeamTracker`, `updateTeamTracker`, `deleteTeamTracker`                                                             |
| Handout   | `addHandoutAsset`, `updateHandoutAsset`, `deleteHandoutAsset`（纯本地）                                                |

### identityStore 概要

管理座位系统和身份认领。

**Actions**：`init(roomId, socket)`, `claimSeat`, `createSeat`, `leaveSeat`, `deleteSeat`, `updateSeat`

**Socket.io 事件**：`seat:created`, `seat:updated`, `seat:deleted`, `seat:online`, `seat:offline`

**特殊机制**：座位 ID 持久化到 `sessionStorage`（key: `myvtt-seat-id`），刷新页面自动恢复。

### sessionStore 概要

客户端 session 状态，用于 plugin system Phase 6 交互。

**状态**：`selection: string[]`（选中实体 ID 列表）、`pendingInteractions: Map<string, PendingInteraction>`

**API**：`_setSelection(entityIds)`, `requestInput(interactionId)`, `resolveInput(interactionId, value)`, `cancelInput(interactionId)`

### uiStore 概要

纯客户端状态，不与服务端同步。

**状态**：`openCardId`, `pinnedCards`, `selectedTokenIds: string[]`, `primarySelectedTokenId`, `bgContextMenu`, `editingHandout`, `activeTool`, `gmViewAsPlayer`, `theme`, `portraitBarVisible`, `teamPanelVisible`, `lastMeasureTool`, `toolPersist`, `gridConfigOpen`, `gmSidebarTab`, `gmSidebarCollapsed`, `gmDockTab`, `activePluginPanels`

## 初始化流程

```
App.tsx mount
  │
  ├─ worldStore.init(roomId, socket)
  │   ├─ REST: GET /api/rooms/:roomId/bundle   → 批量加载所有数据
  │   │   (room, scenes, entities, sceneEntityMap, tactical,
  │   │    showcase, trackers, assets, blueprints, tags, logEntries)
  │   └─ registerSocketEvents(socket)            → 35 个事件监听器
  │
  └─ identityStore.init(roomId, socket)
      ├─ REST: GET .../seats                    → seats
      ├─ sessionStorage → 恢复 mySeatId
      └─ registerSocketEvents                    → seat:created/updated/deleted, seat:online/offline
```

## Socket.io 事件处理

worldStore 监听 35 个 Socket.io 事件，每个事件对应一个 `set()` 调用更新 store。

```typescript
// 典型的事件处理模式
socket.on('entity:created', (entity: Entity) => {
  set((s) => ({ entities: { ...s.entities, [entity.id]: entity } }))
})
socket.on('entity:deleted', ({ id }: { id: string }) => {
  set((s) => {
    const { [id]: _, ...rest } = s.entities
    return { entities: rest }
  })
})
```

**worldStore 监听的事件**：

| 事件                                       | store 更新                                         |
| ------------------------------------------ | -------------------------------------------------- |
| `scene:created/updated/deleted`            | `scenes[]`                                         |
| `scene:entity:linked/unlinked/updated`     | `sceneEntityMap{}`                                 |
| `entity:created/updated/deleted`           | `entities{}`                                       |
| `tactical:updated`                         | `tacticalInfo`                                     |
| `tactical:token:added/updated/removed`     | `tacticalInfo.tokens[]`                            |
| `room:state:updated`                       | `room`                                             |
| `tracker:created/updated/deleted`          | `teamTrackers[]`                                   |
| `showcase:created/updated/deleted/cleared` | `showcaseItems[]`                                  |
| `asset:created/updated/deleted/reordered`  | `assets[]`                                         |
| `blueprint:created/updated/deleted`        | `blueprints[]`                                     |
| `tag:created/updated/deleted`              | `tags[]`                                           |
| `archive:created/updated/deleted`          | `archives[]`                                       |
| `log:new`                                  | `logEntries[]` + `logEntriesById{}` + `logWatermark` |

## 乐观更新

大多数 action 采用**悲观模式**：REST API 成功 → 服务端广播 Socket.io → 所有客户端（包括发起者）通过事件更新 store。

仅 3 处使用**乐观模式**（在 REST 响应前先更新本地 store）：

| Action                          | 原因                       |
| ------------------------------- | -------------------------- |
| `createEphemeralNpcInScene`     | 用户期望右键立即看到 NPC   |
| `spawnEphemeralTokenAtPosition` | 用户期望右键立即看到 Token |
| `pinShowcaseItem`               | Pin 操作需要即时视觉反馈   |

## Selector 规则

选择器定义在 `src/stores/selectors.ts`，用于从 store 中派生数据。

**核心选择器**：

| 选择器                                | 返回值                           |
| ------------------------------------- | -------------------------------- |
| `selectRoom`                          | RoomState                        |
| `selectActiveSceneId`                 | string                           |
| `selectScenes`                        | Scene[]                          |
| `selectEntities`                      | Record<string, Entity>           |
| `selectTokens`                        | MapToken[]                       |
| `selectTacticalInfo`                  | TacticalInfo \| null             |
| `selectActiveScene`                   | Scene \| null                    |
| `selectIsTactical`                    | boolean                          |
| `selectEntityById(id)`                | (state) => Entity \| undefined   |
| `selectTokenById(id)`                 | (state) => MapToken \| undefined |
| `selectSeats`                         | Seat[]                           |
| `selectMySeatId`                      | string \| null                   |
| `selectSpeakerEntities(seatId, role)` | Entity[]                         |

**⚠️ Selector 陷阱**（详见 CLAUDE.md Gotchas）：

1. **禁止在 store 中定义派生方法** — `.filter()` / `.sort()` 返回新引用 → 无限重渲染。用 `useMemo`。
2. **模块级常量做 fallback** — `?? []` 或 `?? {}` 内联创建新引用，破坏 `Object.is()` 相等性。用 `const EMPTY: X[] = []` 模块级常量。
