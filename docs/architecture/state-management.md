# 状态管理

## 架构概览

```
REST API (init) ──► zustand stores ──► React components
                        ▲
Socket.io events ───────┘ (real-time updates)
```

四个 zustand store 各司其职，通过 `init()` 加载初始数据，通过 Socket.io 事件保持实时同步。

## Store 职责划分

| Store              | 文件               | 职责                                                                     | 大小     |
| ------------------ | ------------------ | ------------------------------------------------------------------------ | -------- |
| `useWorldStore`    | `worldStore.ts`    | 核心数据：scenes, entities, tactical, chat, showcase, archives, trackers | ~1000 行 |
| `useIdentityStore` | `identityStore.ts` | 座位/身份：seats, mySeatId, onlineSeatIds                                | ~200 行  |
| `useAssetStore`    | `assetStore.ts`    | 素材管理：assets CRUD + upload                                           | ~100 行  |
| `useUiStore`       | `uiStore.ts`       | 客户端 UI 状态（不持久化）：选中 Token、活动工具、主题等                 | ~100 行  |

### worldStore 概要

最大的 store，包含所有需要实时同步的业务数据。

**状态字段**：

- `room: RoomState` — 活动场景 ID、战术模式开关、规则系统 ID
- `scenes: Scene[]` — 场景列表
- `sceneEntityMap: Record<string, SceneEntityEntry[]>` — 每个场景的实体关联
- `entities: Record<string, Entity>` — 实体表（id → Entity）
- `tacticalInfo: TacticalInfo | null` — 当前战术状态
- `chatMessages: ChatMessage[]` — 聊天消息
- `freshChatIds: Set<string>` — 新消息高亮（2500ms 后清除）
- `showcaseItems: ShowcaseItem[]` — 展示材料
- `pinnedShowcaseId: string | null` — 置顶展示
- `teamTrackers: TeamTracker[]` — 团队追踪器
- `archives: Record<string, ArchiveRecord[]>` — 按场景分组的存档
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

**特殊机制**：座位 ID 持久化到 `sessionStorage`（key: `myvtt-seat-id`），刷新页面自动恢复。

### assetStore 概要

素材文件管理。

**Actions**：`init(roomId)`, `refresh`, `upload`, `update`, `remove`, `softRemove`

**`softRemove`**：UI 立即移除 → 延迟后服务端删除 → 返回撤销函数。用于「删除 + Toast 撤销」模式。

### uiStore 概要

纯客户端状态，不与服务端同步。

**状态**：`inspectedCharacterId`, `selectedTokenId`, `bgContextMenu`, `activeTool`, `gmViewAsPlayer`, `theme`, `portraitBarVisible`, `teamPanelVisible`, `gmSidebarTab`, `gmSidebarCollapsed`

## 初始化流程

```
App.tsx mount
  │
  ├─ worldStore.init(roomId, socket)
  │   ├─ REST: GET /api/rooms/:roomId/state    → room
  │   ├─ REST: GET /api/rooms/:roomId/scenes   → scenes
  │   ├─ REST: GET /api/rooms/:roomId/entities → entities
  │   ├─ REST: GET .../scenes/:id/entities      → sceneEntityMap (per-scene)
  │   ├─ REST: GET .../tactical                 → tacticalInfo
  │   ├─ REST: GET .../chat                     → chatMessages
  │   ├─ REST: GET .../showcase                 → showcaseItems
  │   ├─ REST: GET .../trackers                 → teamTrackers
  │   └─ registerSocketEvents(socket)            → 28 个事件监听器
  │
  ├─ identityStore.init(roomId, socket)
  │   ├─ REST: GET .../seats                    → seats
  │   ├─ sessionStorage → 恢复 mySeatId
  │   └─ registerSocketEvents                    → seat:*, awareness:*
  │
  └─ assetStore.init(roomId)
      └─ REST: GET .../assets                   → assets
```

## Socket.io 事件处理

worldStore 监听 28 个 Socket.io 事件，每个事件对应一个 `set()` 调用更新 store。

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
| `entity:created/updated/deleted`           | `entities{}`                                       |
| `tactical:activated/updated/ended`         | `tacticalInfo`                                     |
| `tactical:token:added/updated/removed`     | `tacticalInfo.tokens[]`                            |
| `chat:new`                                 | `chatMessages[]` + `freshChatIds`                  |
| `chat:retracted`                           | `chatMessages[]`                                   |
| `room:state:updated`                       | `room`                                             |
| `tracker:created/updated/deleted`          | `teamTrackers[]`                                   |
| `showcase:created/updated/deleted/cleared` | `showcaseItems[]`                                  |
| `asset:created/updated/deleted`            | （转发给 assetStore 或 worldStore 的 assets 字段） |
| `archive:created/updated/deleted`          | `archives{}`                                       |

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
3. **freshChatIds 机制** — 新消息高亮动画：Socket.io `chat:new` 事件在同一个 `set()` 调用中原子性更新 `chatMessages` + `freshChatIds`，2500ms 后 `setTimeout` 清除。硬编码 2500ms 与 CSS 动画时长对应。
