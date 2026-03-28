# 战术系统

## 概述

战术模式是 myVTT 的「按需叠加」功能——GM 一键打开战术地图，浮现在氛围图之上，不切屏。关闭后回到叙事模式，Token 数据保留。

## 视觉实现

```
┌─ SceneViewer (z-0) ──────────────────────────────┐
│  全屏氛围图 + 粒子 + 环境音                         │
│                                                    │
│  ┌─ TacticalPanel (z-tactical, fixed inset-0) ──┐ │
│  │  backdrop-blur-[8px] + bg-deep/50 毛玻璃       │ │
│  │  radial-gradient 暗角融合                       │ │
│  │                                                │ │
│  │  ┌─ KonvaMap (react-konva Stage) ───────────┐ │ │
│  │  │  Stage                                    │ │ │
│  │  │  ├─ BackgroundLayer (战术地图底图)          │ │ │
│  │  │  ├─ KonvaGrid (网格线)                     │ │ │
│  │  │  ├─ KonvaTokenLayer (所有 Token)           │ │ │
│  │  │  │   ├─ KonvaToken × N                    │ │ │
│  │  │  │   └─ GhostToken (拖拽预览)              │ │ │
│  │  │  └─ Tools Layer (测量/范围工具)             │ │ │
│  │  └──────────────────────────────────────────┘ │ │
│  │                                                │ │
│  │  TacticalToolbar + TokenContextMenu + Tooltip   │ │
│  └────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

**进入/退出动画**：

- 进入：TacticalPanel opacity 0→1（400ms），SceneViewer 同步 blur 过渡
- 退出：TacticalPanel opacity 1→0（250ms）

## 数据模型

### SQL 层

每个场景最多一个 `tactical_state` 记录 + 多个 `tactical_tokens`：

```
tactical_state (PK: scene_id)
  ├── tactical_mode (INTEGER, 0|1)         # 战术模式开关（per-scene）
  ├── map_url, map_width, map_height       # 战术地图
  ├── grid (JSON)                          # 网格配置
  ├── round_number                         # 回合计数
  └── current_turn_token_id                # 先攻（预留）

tactical_tokens (PK: id, UNIQUE: scene_id+entity_id)
  ├── entity_id → entities.id             # 必须关联实体
  ├── x, y                                 # 地图坐标
  ├── width, height                        # 尺寸（格数）
  ├── image_scale_x, image_scale_y         # 图像缩放
  └── initiative_position                  # 先攻位置（预留）
```

**核心约束**：

- `UNIQUE(scene_id, entity_id)` — 同一实体在同一场景只有一个 Token
- 所有 Token 必须关联 Entity（无匿名 Token）
- `entity_id → entities.id ON DELETE CASCADE` — 实体删除时 Token 自动删除

### 前端类型

```typescript
interface TacticalInfo {
  sceneId: string
  tacticalMode: number              // 0 | 1, stored in tactical_state (per-scene)
  mapUrl: string | null
  mapWidth: number | null
  mapHeight: number | null
  grid: {
    size: number
    snap: boolean
    visible: boolean
    color: string
    offsetX: number
    offsetY: number
  }
  roundNumber: number
  currentTurnTokenId: string | null
  tokens: MapToken[]
}

interface MapToken {
  id: string
  entityId: string
  x: number
  y: number
  width: number
  height: number
  imageScaleX: number
  imageScaleY: number
  initiativePosition: number | null // initiative ordering (reserved)
}
```

## Token 拖拽数据流

```
用户按住 Token
  │
  ▼
KonvaToken onDragMove (60fps)
  │ 本地 React state 更新位置（即时响应）
  │ awareness:tokenDrag → Socket.io → 其他客户端显示 GhostToken
  │
  ▼
用户松手 (onDragEnd)
  │ grid snap 计算最终位置
  │ REST: PATCH /api/rooms/:roomId/tactical/tokens/:tokenId { x, y }
  │ → 服务端写入 SQLite
  │ → Socket.io broadcast tactical:token:updated
  │ → 所有客户端 store 更新
  │
  ▼
awareness:tokenDragEnd → 其他客户端移除 GhostToken
```

## Token 创建方式

| 方式           | 入口                 | 行为                                    |
| -------------- | -------------------- | --------------------------------------- |
| 右键空白处     | KonvaMap contextmenu | 创建 ephemeral Entity + 放置 Token      |
| 从场景角色拖入 | EntityPanel drag     | 使用已有 Entity，创建 Token             |
| 从蓝图创建     | Blueprint spawn      | 创建 Entity from Blueprint + 放置 Token |
| 存档加载       | Archive load         | 批量恢复 Token（见下方）                |

## 存档系统（Archive）

存档是战术状态的「快照」，允许 GM 保存/加载战术地图布局。

### 数据结构

```
archives (PK: id, FK: scene_id)
  ├── name, map_url, map_width, map_height, grid
  └── archive_tokens[]
       ├── position (x, y, width, height, scales)
       ├── snapshot_lifecycle           # 保存时的 lifecycle
       ├── original_entity_id           # reusable/persistent → 引用
       └── snapshot_data (JSON)         # ephemeral → 完整快照
```

### 保存流程（Save）

```
POST /api/rooms/:roomId/archives/:archiveId/save
  │
  ├─ 读取当前 tactical_state + tactical_tokens
  ├─ 删除 archive 原有 archive_tokens
  ├─ 遍历每个 tactical_token：
  │   ├─ 查找关联 entity
  │   ├─ entity.lifecycle == 'ephemeral'
  │   │   → snapshot_data = entity 完整 JSON
  │   │   → original_entity_id = entity.id
  │   └─ entity.lifecycle == 'reusable'|'persistent'
  │       → snapshot_data = null
  │       → original_entity_id = entity.id
  └─ 保存 map/grid 配置到 archive
```

### 加载流程（Load）

```
POST /api/rooms/:roomId/archives/:archiveId/load
  │
  ├─ 读取 archive + archive_tokens
  ├─ 清空当前 tactical_tokens
  ├─ 更新 tactical_state (map, grid)
  ├─ 遍历每个 archive_token：
  │   ├─ snapshot_lifecycle == 'ephemeral'
  │   │   ├─ original_entity_id 存在且实体仍在 → 复用
  │   │   └─ 否则 → 从 snapshot_data 创建新 entity
  │   └─ snapshot_lifecycle == 'reusable'|'persistent'
  │       └─ original_entity_id 引用现有 entity
  └─ 创建 tactical_tokens
```

## 战术模式进出

### Enter（进入战术模式）

`tactical_mode` is a per-scene flag stored in the `tactical_state` table (not in `room_state`).

```
worldStore.enterTactical()
  │
  ├─ POST /api/rooms/:roomId/tactical/enter
  │   → 服务端 SET tactical_mode = 1 (in tactical_state for active scene)
  │   → Socket.io broadcast tactical:updated (full TacticalInfo)
  │
  └─ 所有客户端：TacticalPanel 渲染，SceneViewer 模糊
```

### Exit（退出战术模式）

```
worldStore.exitTactical()
  │
  ├─ POST /api/rooms/:roomId/tactical/exit
  │   → 服务端 SET tactical_mode = 0 (in tactical_state for active scene)
  │   → Socket.io broadcast tactical:updated (full TacticalInfo)
  │
  └─ 所有客户端：TacticalPanel 淡出，SceneViewer 恢复
     （tactical_state 和 tokens 保留在数据库，不删除）
```

## 组件清单

| 文件                   | 职责                                             |
| ---------------------- | ------------------------------------------------ |
| `TacticalPanel.tsx`    | 战术面板容器（fixed 浮层、背景模糊、进出动画）   |
| `KonvaMap.tsx`         | react-konva Stage 主画布（缩放、平移、右键菜单） |
| `BackgroundLayer.tsx`  | 战术地图底图渲染                                 |
| `KonvaGrid.tsx`        | 网格线渲染                                       |
| `KonvaTokenLayer.tsx`  | Token 图层（管理所有 KonvaToken）                |
| `KonvaToken.tsx`       | 单个 Token（图像、拖拽、选中高亮、资源条）       |
| `GhostToken.tsx`       | 其他玩家拖拽时的半透明预览                       |
| `TokenContextMenu.tsx` | Token 右键菜单                                   |
| `TokenTooltip.tsx`     | Token hover 信息提示                             |
| `TacticalToolbar.tsx`  | 工具选择 + 缩放控制（右侧垂直胶囊）              |
| `combatUtils.ts`       | 坐标转换、grid snap 计算                         |
| `tools/`               | 测量工具（距离、圆形范围、锥形范围、矩形范围）   |
| `hooks/`               | 战术相关 hooks                                   |

## 服务端端点

### tactical.ts

All paths are prefixed with `/api/rooms/:roomId`.

| 方法   | 路径                                | 说明                                                                   |
| ------ | ----------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/tactical`                         | 获取当前场景的战术状态 + tokens                                        |
| POST   | `/tactical/enter`                   | 进入战术模式（sets tactical_mode = 1 in tactical_state）               |
| POST   | `/tactical/exit`                    | 退出战术模式（sets tactical_mode = 0 in tactical_state）               |
| POST   | `/tactical/clear`                   | 删除所有 tokens + orphan ephemeral entities，重置 map 字段             |
| PATCH  | `/tactical`                         | 更新战术状态（map, grid, tacticalMode 等）                             |
| POST   | `/tactical/tokens`                  | 添加 Token（关联已有 entity）                                          |
| POST   | `/tactical/tokens/quick`            | 原子创建 ephemeral entity + token（右键空白处快速放置）                |
| POST   | `/tactical/tokens/from-entity`      | 从已有 entity 创建 token（读取 core:token 组件获取默认 width/height）  |
| POST   | `/tactical/tokens/:tokenId/duplicate` | 复制 entity（components + tags）+ token（偏移 offsetX/offsetY）       |
| PATCH  | `/tactical/tokens/:tokenId`         | 更新 Token 位置/尺寸/initiativePosition                               |
| DELETE | `/tactical/tokens/:tokenId`         | 移除 Token                                                             |

### archives.ts

All paths are prefixed with `/api/rooms/:roomId`.

| 方法   | 路径                                    | 说明                                         |
| ------ | --------------------------------------- | -------------------------------------------- |
| GET    | `/scenes/:sceneId/archives`             | 获取场景的存档列表（GM sees all; PL excludes gm_only） |
| POST   | `/scenes/:sceneId/archives`             | 创建空存档                                   |
| PATCH  | `/archives/:archiveId`                  | 更新存档元数据（name, map, grid, gmOnly）    |
| DELETE | `/archives/:archiveId`                  | 删除存档（CASCADE 清理 archive_tokens）      |
| POST   | `/archives/:archiveId/save`             | 保存当前战术状态到存档                       |
| POST   | `/archives/:archiveId/load`             | 从存档加载战术状态                           |

## Socket Events

Tactical state changes are broadcast via Socket.io to all clients in the room.

| Event                    | Payload           | Emitted by                                                    |
| ------------------------ | ----------------- | ------------------------------------------------------------- |
| `tactical:updated`       | `TacticalInfo`    | PATCH /tactical, POST /tactical/enter, /exit, /clear, archive load |
| `tactical:token:added`   | `MapToken`        | POST /tactical/tokens, /tokens/quick, /tokens/from-entity, /tokens/:id/duplicate |
| `tactical:token:updated` | `MapToken`        | PATCH /tactical/tokens/:tokenId                               |
| `tactical:token:removed` | `{ id: string }`  | DELETE /tactical/tokens/:tokenId                              |

Note: `tactical:updated` carries the full `TacticalInfo` (including all tokens). The granular `tactical:token:*` events carry individual token payloads for incremental updates.
