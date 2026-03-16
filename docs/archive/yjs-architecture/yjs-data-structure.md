# Yjs 数据结构

> 本文档描述 Y.Doc 的完整数据结构、存储模式和数据流。

---

## 一、Y.Doc 完整结构

所有容器使用 `yDoc.getMap('xxx')` 顶层共享类型，保证多客户端实例唯一，无竞态条件。

```
Y.Doc（顶层共享类型）
│
│   ── WorldMaps（通过 createWorldMaps 统一管理）──
│
├── 'room'             (Y.Map)                    ← 房间状态
│   ├── mode: 'scene' | 'combat'
│   ├── activeSceneId: string | null
│   ├── combatSceneId: string | null
│   └── pinnedShowcaseId?: string
│
├── 'scenes'           (Y.Map<Y.Map>)             ← 场景定义
│   └── [sceneId]      (Y.Map)
│       ├── name, imageUrl, width, height: string/number
│       ├── gridSize, gridVisible, gridColor: number/boolean/string
│       ├── gridOffsetX, gridOffsetY: number
│       ├── sortOrder: number
│       ├── 'entities'  (Y.Map<Entity>)            ← 场景实体（plain object）
│       └── 'tokens'    (Y.Map<MapToken>)           ← 战斗 token（plain object）
│
├── 'roster'           (Y.Map<Y.Map>)              ← 跨场景持久角色名册
│   └── [entityId]     (Y.Map)
│       ├── id, name, imageUrl, color, size, notes  ← 基础字段（字段级 CRDT）
│       ├── blueprintId?: string
│       ├── 'ruleData'      (Y.Map)                 ← 规则数据（顶层 key 级 CRDT）
│       │   ├── kind: string
│       │   ├── level: number
│       │   ├── resources: { ... }                   ← 各 key 内部仍是 plain object
│       │   └── attributes: { ... }
│       └── 'permissions'   (Y.Map)                  ← 权限（字段级 CRDT）
│           ├── default: 'none' | 'observer' | 'owner'
│           └── 'seats'     (Y.Map)                   ← 每个座位独立 CRDT
│               ├── [seatId]: 'none' | 'observer' | 'owner'
│               └── ...
│
├── 'blueprints'       (Y.Map)                     ← Token 模板（plain object）
│   └── [blueprintId] → Blueprint
│
├── 'seats'            (Y.Map)                     ← 玩家座位（plain object）
│   └── [seatId] → Seat { id, name, color, role, portraitUrl?, activeCharacterId? }
│
│   ── 独立于 WorldMaps 的根级别数据 ──
│
├── 'chat_log'         (Y.Array<ChatMessage>)      ← 聊天消息
│
├── 'team_metrics'     (Y.Map<TeamTracker>)        ← 团队追踪器
│
├── 'showcase_items'   (Y.Map<ShowcaseItem>)       ← 展示卡片
│
└── 'handout_assets'   (Y.Map<HandoutAsset>)       ← 讲义素材库
```

## 二、存储模式对照

| 容器               | Y.Doc key         | 存储方式                         | Observer             | 并发安全        |
| ------------------ | ----------------- | -------------------------------- | -------------------- | --------------- |
| roster             | `roster`          | 嵌套 Y.Map（字段级 CRDT）        | `.observeDeep()`     | 字段级合并      |
| roster.permissions | 嵌套于 entity Map | 嵌套 Y.Map（seats 为独立 Y.Map） | via `.observeDeep()` | 字段级合并      |
| roster.ruleData    | 嵌套于 entity Map | 嵌套 Y.Map（顶层 key 级）        | via `.observeDeep()` | 顶层 key 级合并 |
| scenes             | `scenes`          | 嵌套 Y.Map（配置 + 子容器）      | `.observeDeep()`     | 字段级合并      |
| scene.entities     | 嵌套于 scene Map  | plain object 整体替换            | `.observe()`         | 后写入胜        |
| scene.tokens       | 嵌套于 scene Map  | plain object 整体替换            | `.observe()`         | 后写入胜        |
| blueprints         | `blueprints`      | plain object 整体替换            | `.observe()`         | 后写入胜        |
| seats              | `seats`           | plain object 整体替换            | `.observe()`         | 后写入胜        |
| chat_log           | `chat_log`        | plain object 追加                | `.observe(event)`    | 追加安全        |
| team_metrics       | `team_metrics`    | plain object 整体替换            | `.observe()`         | 后写入胜        |
| showcase_items     | `showcase_items`  | plain object 整体替换            | `.observe()`         | 后写入胜        |
| handout_assets     | `handout_assets`  | plain object 整体替换            | `.observe()`         | 后写入胜        |

## 三、数据流概览

```
useYjsConnection(roomId)             → Y.Doc + WebsocketProvider + Awareness
  └→ useWorld(yDoc)                  → WorldMaps（createWorldMaps 统一创建）
      ├→ useRoom(world.room)         → 'room' map
      ├→ useScenes(world.scenes)     → 'scenes' map
      ├→ useEntities(world, ...)     → 聚合 roster + scene.entities
      ├→ useSceneTokens(world)       → scene 内嵌套的 tokens map
      └→ useIdentity(world.seats)    → 'seats' map
  └→ ChatPanel(yDoc)                 → yDoc.getArray('chat_log')
  └→ useShowcase(yDoc)               → yDoc.getMap('showcase_items') + yDoc.getMap('room')
  └→ useTeamMetrics(yDoc)            → yDoc.getMap('team_metrics')
  └→ useHandoutAssets(yDoc)          → yDoc.getMap('handout_assets')
```

## 四、Yjs 安全规则

### 顶层共享类型 vs 嵌套 Y.Map

`yDoc.getMap('xxx')` 是 Yjs **顶层共享类型**——无论多少客户端调用，返回的永远是同一个实例，不存在竞态问题。

嵌套 Y.Map（`parent.set(key, new Y.Map())`）只在以下条件下安全：

1. key 是 UUID（非固定字符串）
2. 只有一个客户端触发创建
3. WebSocket 同步已完成

### 并发安全的权限/规则数据

Roster 中的 `permissions` 和 `ruleData` 使用嵌套 Y.Map 结构：

- `permissions.seats` 是独立 Y.Map，不同客户端可并发修改不同座位的权限
- `ruleData` 顶层 key 是独立条目，不同客户端可并发修改 `resources` 和 `attributes` 而不冲突
- 场景实体（`scene.entities`）使用 plain object 整体替换，因为只有 GM 操作

### 回归测试

`src/yjs/__tests__/useWorld.test.ts` 包含孤儿引用竞态条件的回归测试，验证了旧 `ensureSubMap` 模式的破坏性行为。
