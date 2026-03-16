# 12 - Schema 字段归属迁移设计

## 背景与动机

`room_state` 单例表当前混存了三类不同归属的字段：

| 字段                | 实际归属                       | 当前位置     | 问题                            |
| ------------------- | ------------------------------ | ------------ | ------------------------------- |
| `rule_system_id`    | 房间身份（创建时确定，不可变） | `room_state` | 应在全局 `rooms` 表             |
| `tactical_mode`     | 场景级战术状态                 | `room_state` | 应在 per-scene `tactical_state` |
| `active_archive_id` | 场景级战术状态                 | `room_state` | 应在 per-scene `tactical_state` |

### 具体 bug

`active_archive_id` 在全局 `room_state` 中，但 archives 是 per-scene 的。GM 在场景 A 加载存档 `arc-001` → 切到场景 B → `activeArchiveId` 仍指向 `arc-001`（场景 A 的存档）→ ArchivePanel 高亮失效、保存按钮行为错误。

`tactical_mode` 同理：GM 在场景 A 打开战术面板 → 切到场景 B → 面板不应自动展开，因为场景 B 可能不需要战术模式。

### 产品设计明确

- 每个场景创建时自动伴生一个 `tactical_state` 行（已实现：`scenes.ts:46`）
- 战术模式开关、活动存档、地图配置、Token 布局都跟随场景切换
- `rule_system_id` 在房间创建时确定，不可更改，是房间的身份属性

## Schema 变更

### 全局库 `rooms` 表 — 新增列

```sql
ALTER TABLE rooms ADD COLUMN rule_system_id TEXT NOT NULL DEFAULT 'generic'
```

### Per-room `tactical_state` 表 — 新增两列

```sql
ALTER TABLE tactical_state ADD COLUMN tactical_mode INTEGER NOT NULL DEFAULT 0
ALTER TABLE tactical_state ADD COLUMN active_archive_id TEXT
```

### `room_state` 表 — 旧列废弃

SQLite < 3.35.0 不支持 `DROP COLUMN`，旧列保留但不再读写：

| 字段                | 迁移后状态              |
| ------------------- | ----------------------- |
| `active_scene_id`   | **保留** — 全局当前场景 |
| `plugin_config`     | **保留** — 全局插件配置 |
| `tactical_mode`     | 废弃（不再读写）        |
| `active_archive_id` | 废弃（不再读写）        |
| `rule_system_id`    | 废弃（不再读写）        |

### 数据迁移逻辑

在 `initRoomSchema()` 的 migration 区域执行：

```typescript
// 1. tactical_state 加列
try {
  db.exec('ALTER TABLE tactical_state ADD COLUMN tactical_mode INTEGER NOT NULL DEFAULT 0')
} catch {}
try {
  db.exec('ALTER TABLE tactical_state ADD COLUMN active_archive_id TEXT')
} catch {}

// 2. 补全旧场景缺失的 tactical_state 行（场景创建于伴生逻辑之前）
db.exec(`INSERT OR IGNORE INTO tactical_state (scene_id) SELECT id FROM scenes`)

// 3. 从 room_state 迁移数据到当前活跃场景的 tactical_state
const rs = db
  .prepare('SELECT active_scene_id, tactical_mode, active_archive_id FROM room_state WHERE id = 1')
  .get()
if (rs?.active_scene_id) {
  db.prepare(
    'UPDATE tactical_state SET tactical_mode = ?, active_archive_id = ? WHERE scene_id = ?',
  ).run(rs.tactical_mode, rs.active_archive_id, rs.active_scene_id)
}
```

在 `initGlobalSchema()` 中：

```typescript
try {
  db.exec("ALTER TABLE rooms ADD COLUMN rule_system_id TEXT NOT NULL DEFAULT 'generic'")
} catch {}
```

`rule_system_id` 从各房间的 `room.db` 回填到 `rooms` 表的逻辑在房间首次打开时执行（`withRoom` 中间件或 `getRoomDb` 调用时）。

## 服务端路由变更

### `rooms.ts`（全局 DB）

- **POST /api/rooms**：`rule_system_id` 直接写入 `rooms` 表的 INSERT 语句，不再写 `room_state`
- **GET /api/rooms**：响应中包含 `ruleSystemId`（之前不包含）

### `state.ts`（room_state）

- **GET /state**：响应中移除 `tacticalMode`、`activeArchiveId`、`ruleSystemId`
- **PATCH /state**：fieldMap 中移除三个迁出字段，只保留 `activeSceneId`
- **PATCH /state 切换场景时**：广播 `tactical:updated` 事件携带新场景的 tactical_state（含 `tacticalMode` + `activeArchiveId`），让前端自动切换战术状态

### `tactical.ts`

- **GET /tactical**：响应中新增 `tacticalMode` 和 `activeArchiveId` 字段（从 `tactical_state` 读取）
- **POST /tactical/enter**：`UPDATE tactical_state SET tactical_mode = 1 WHERE scene_id = ?`，广播 `tactical:updated`
- **POST /tactical/exit**：`UPDATE tactical_state SET tactical_mode = 0 WHERE scene_id = ?`，广播 `tactical:updated`
- **PATCH /tactical**：fieldMap 新增 `tacticalMode`。注意 `activeArchiveId` **不**加入 PATCH /tactical — 它只由 archives 路由通过 load/delete 操作修改，不允许客户端直接 PATCH

### `archives.ts`

- **POST /archives/:id/load**：`UPDATE tactical_state SET active_archive_id = ? WHERE scene_id = ?`（替代 `room_state`），广播 `tactical:updated`（替代 `room:state:updated`）。响应构建改为复用 `getTacticalState()` 共享函数（从 `tactical.ts` 导出），消除当前 load 路由中手动拼装 tactical 响应的重复代码。
- **DELETE /archives/:id**：清理引用改为 `UPDATE tactical_state SET active_archive_id = NULL WHERE scene_id = ? AND active_archive_id = ?`

### Socket 事件变更

| 事件                 | 变更                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| `room:state:updated` | payload 不再包含 `tacticalMode`、`activeArchiveId`、`ruleSystemId`    |
| `tactical:updated`   | payload 新增 `tacticalMode`、`activeArchiveId`                        |
| `tactical:ended`     | **删除** — 退出战术模式改为 `tactical:updated` with `tacticalMode: 0` |

## 前端变更

### 类型变更

**`RoomState`**（worldStore.ts）：

```typescript
// 迁移后
export interface RoomState {
  activeSceneId: string | null
  ruleSystemId: string
}
```

注：`ruleSystemId` 仍在前端 `RoomState` 中，但数据源变更：`GET /state` 不再返回该字段。前端 init 时从 `GET /rooms` 列表或 `GET /rooms/:id`（待确认哪个更自然）获取 `ruleSystemId`，在 `worldStore.init()` 中写入 `room.ruleSystemId`。

**`TacticalInfo`**（worldStore.ts）新增字段：

```typescript
export interface TacticalInfo {
  sceneId: string
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
  tokens: MapToken[]
  roundNumber: number
  currentTurnTokenId: string | null
  tacticalMode: number // 新增
  activeArchiveId: string | null // 新增
}
```

### 受影响的组件

| 文件                              | 当前                                        | 迁移后                                                                                          |
| --------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `selectors.ts` `selectIsTactical` | `s.room.tacticalMode === 1`                 | `s.tacticalInfo?.tacticalMode === 1`（`=== 1` 已产生 boolean，无需 `?? false`）                 |
| `ArchivePanel.tsx:10`             | `s.room.activeArchiveId`                    | `s.tacticalInfo?.activeArchiveId ?? null`                                                       |
| `ArchivePanel.tsx:12`             | `s.tacticalInfo !== null`                   | `selectIsTactical`（复用 selector）                                                             |
| `KonvaMap.tsx:214`                | `if (!tacticalInfo) return`（createToken）  | 语义变更：`tacticalInfo` 始终非 null，移除空检查或改为 `if (!tacticalInfo?.mapUrl)`             |
| `KonvaMap.tsx:270`                | `if (!tacticalInfo)` 显示空状态             | 语义变更：`tacticalInfo` 始终非 null，改为 `if (!tacticalInfo?.mapUrl)`                         |
| `PortraitBar.tsx:606`             | `tacticalInfo ? \`Round ...\`` null 检查    | `tacticalInfo` 始终非 null，改为检查 `tacticalInfo?.tacticalMode === 1`（仅战术模式显示 Round） |
| `useCameraControls.ts:62,82`      | `if (!tacticalInfo) return`                 | dead code — `tacticalInfo` 始终非 null，移除无效空检查                                          |
| `worldStore.ts` `setRuleSystem`   | `api.patch('/state', { ruleSystemId: id })` | 移除或改为 PATCH `/rooms/:id`（`ruleSystemId` 不再在 `room_state`）                             |
| `worldStore.ts` `WS_EVENTS`       | 包含 `'tactical:ended'`                     | 移除 `'tactical:ended'`（事件已删除）                                                           |

**不需要修改的**：`App.tsx`, `GmDock.tsx`, `MapDockTab.tsx`, `BlueprintDockTab.tsx`, `useRulePlugin.ts`, `HamburgerMenu.tsx` — 这些通过 `selectIsTactical` 或 `s.room.ruleSystemId` 间接访问，selector 改了就全部生效。

### Socket 事件处理变更

- `room:state:updated` handler：不变，payload 自然不含迁出字段
- `tactical:activated` / `tactical:updated` handler：payload 现在包含 `tacticalMode` + `activeArchiveId`，`normalizeTacticalInfo` 处理新字段
- `tactical:ended` handler：**删除**，退出战术模式通过 `tactical:updated` with `tacticalMode: 0` 传达
- `WS_EVENTS` 数组（`worldStore.ts`）：移除 `'tactical:ended'` 条目

### `isTactical` 语义变更

**当前**：`tacticalInfo !== null` ≈ `room.tacticalMode === 1`（因为 `tacticalInfo` 只在进入战术模式时加载）

**迁移后**：`tacticalInfo` 始终非 null（场景伴生），`isTactical` 必须显式读取 `tacticalInfo.tacticalMode === 1`。所有使用 `tacticalInfo !== null` 作为「战术模式是否开启」判断的代码需修改。

## 测试影响

### 需要修改的现有测试

| 测试文件                      | 改动内容                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `tactical-mode.test.ts`       | `tacticalMode` 从 `GET /state` 改为 `GET /tactical` 验证                                                  |
| `rule-system-switch.test.ts`  | `ruleSystemId` 不再在 `/state`，创建房间时验证 `GET /rooms`                                               |
| `archive-broadcast.test.ts`   | `activeArchiveId` 广播事件从 `room:state:updated` 改为 `tactical:updated`                                 |
| `archive-error-cases.test.ts` | 删除存档清 `activeArchiveId` 改为从 `GET /tactical` 验证                                                  |
| `worldStore.test.ts`          | `RoomState` mock 移除三字段；`TacticalInfo` mock 新增两字段；`tactical:ended` 测试改为 `tactical:updated` |
| `selectors.test.ts`           | `selectIsTactical` 测试改为从 `tacticalInfo.tacticalMode` 读取                                            |

### 新增回归测试

| 场景                         | 验证内容                                                               |
| ---------------------------- | ---------------------------------------------------------------------- |
| 场景切换保留 tacticalMode    | 场景 A `tacticalMode=1` → 切到 B → 切回 A → A 仍 `tacticalMode=1`      |
| 场景切换保留 activeArchiveId | 场景 A 加载存档 → 切到 B → 切回 A → A 的 `activeArchiveId` 不变        |
| 新场景伴生 tactical_state    | 创建场景 → `GET /tactical`（切到该场景后）→ 200，`tacticalMode: 0`     |
| rule_system_id 在 rooms 表   | 创建房间带 `ruleSystemId: 'daggerheart'` → `GET /rooms` 列表包含该字段 |
| 数据迁移兼容                 | 旧格式 DB 打开 → migration 自动搬移字段值 → 新位置正确                 |

## Assumptions

- SQLite 版本 < 3.35.0，不支持 DROP COLUMN，旧列保留但废弃
- `tactical_state` 已在场景创建时自动 INSERT（`scenes.ts:46`），本次无需改动
- `rule_system_id` 创建后不可更改的约束由 UI 保证（HamburgerMenu 不提供切换入口），无需数据库级约束
- 数据迁移只需处理当前活跃场景的 `tactical_mode` 和 `active_archive_id`，非活跃场景保持默认值

## Edge Cases

- 旧 DB 中 `tactical_state` 行不存在（场景创建于伴生逻辑之前）→ migration 需先确保每个 scene 有对应 `tactical_state` 行
- `active_archive_id` 指向已删除的存档 → 现有 DELETE 清理逻辑已处理，迁移到 `tactical_state` 后保持相同逻辑
- 房间首次打开时 `rooms.rule_system_id` 为 `'generic'`（默认值）但 `room_state.rule_system_id` 为 `'daggerheart'` → 回填逻辑在 `withRoom` 中执行
- 多客户端同时在线时切换场景 → `PATCH /state` 的 `activeSceneId` 变更广播 `room:state:updated` + `tactical:updated`，所有客户端同步获得新场景的战术状态
