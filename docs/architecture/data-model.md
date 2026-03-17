# 数据模型

## 存储架构

- **全局库** `data/global.db`：仅 `rooms` 表
- **房间库** `data/rooms/{roomId}/room.db`：13 张表，完全隔离

所有 SQLite 连接启用 WAL 模式 + `foreign_keys = ON`。

## Schema 总览

```
rooms (全局)
  └── room.db (per-room)
       ├── room_state (singleton)
       ├── seats
       ├── scenes
       │    ├── scene_entities (M2M → entities)
       │    ├── archives
       │    │    └── archive_tokens
       │    └── tactical_state
       │         └── tactical_tokens (→ entities)
       ├── entities
       ├── chat_messages
       ├── assets
       ├── team_trackers
       └── showcase_items
```

## 表定义

### rooms（全局库）

| 列         | 类型    | 说明    |
| ---------- | ------- | ------- |
| id             | TEXT PK | 房间 ID                       |
| name           | TEXT    | 房间名                        |
| created_by     | TEXT    | 创建者                        |
| created_at     | INTEGER | 时间戳                        |
| rule_system_id | TEXT    | 规则系统 ID（默认 'generic'） |

### room_state（单例行，id=1）

| 列              | 类型       | 说明         |
| --------------- | ---------- | ------------ |
| active_scene_id | TEXT       | 当前活动场景 |
| plugin_config   | TEXT(JSON) | 插件配置     |

### seats

| 列                  | 类型    | 说明                    |
| ------------------- | ------- | ----------------------- |
| id                  | TEXT PK | 座位 ID                 |
| name                | TEXT    | 显示名                  |
| color               | TEXT    | 主题色                  |
| role                | TEXT    | 'GM' 或 'PL'            |
| user_id             | TEXT    | 用户 ID（预留，未使用） |
| portrait_url        | TEXT    | 头像                    |
| active_character_id | TEXT    | 当前操控角色            |
| sort_order          | INTEGER | 排序                    |

### scenes

| 列         | 类型       | 说明               |
| ---------- | ---------- | ------------------ |
| id         | TEXT PK    | 场景 ID            |
| name       | TEXT       | 场景名             |
| sort_order | INTEGER    | 排序               |
| gm_only    | INTEGER    | GM 专属场景        |
| atmosphere | TEXT(JSON) | 氛围配置（见下方） |

**atmosphere JSON 结构**：

```json
{
  "imageUrl": "string",
  "width": 1920,
  "height": 1080,
  "particlePreset": "none|embers|snow|dust|rain|fireflies",
  "ambientPreset": "string",
  "ambientAudioUrl": "string",
  "ambientAudioVolume": 0.5
}
```

### entities

| 列           | 类型       | 说明                                    |
| ------------ | ---------- | --------------------------------------- |
| id           | TEXT PK    | 实体 ID                                 |
| name         | TEXT       | 名称                                    |
| image_url    | TEXT       | 头像/Token 图                           |
| color        | TEXT       | 主题色                                  |
| width        | REAL       | 宽度（格数）                            |
| height       | REAL       | 高度（格数）                            |
| notes        | TEXT       | GM 笔记                                 |
| rule_data    | TEXT(JSON) | 规则数据（由插件解读）                  |
| permissions  | TEXT(JSON) | 权限配置（见下方）                      |
| lifecycle    | TEXT       | 'ephemeral' / 'reusable' / 'persistent' |
| blueprint_id | TEXT       | 关联蓝图 ID                             |

**permissions JSON 结构**：

```json
{
  "default": "none|observer|owner",
  "seats": { "seat-id": "none|observer|owner" }
}
```

**lifecycle 语义**：

- `ephemeral`：一次性 NPC，只存在于创建场景，不污染实体库
- `reusable`：可复用 NPC，可在多个场景间共享
- `persistent`：PC 角色，永久存在

### scene_entities（M2M 关联表）

| 列        | 类型    | 说明                     |
| --------- | ------- | ------------------------ |
| scene_id  | TEXT FK | → scenes.id（CASCADE）   |
| entity_id | TEXT FK | → entities.id（CASCADE） |
| visible   | INTEGER | 是否上场（0=候场）       |

### archives

| 列         | 类型       | 说明                   |
| ---------- | ---------- | ---------------------- |
| id         | TEXT PK    | 存档 ID                |
| scene_id   | TEXT FK    | → scenes.id（CASCADE） |
| name       | TEXT       | 存档名                 |
| map_url    | TEXT       | 战术地图 URL           |
| map_width  | INTEGER    | 地图宽度               |
| map_height | INTEGER    | 地图高度               |
| grid       | TEXT(JSON) | 网格配置               |
| gm_only    | INTEGER    | GM 专属                |

### archive_tokens

| 列                           | 类型       | 说明                     |
| ---------------------------- | ---------- | ------------------------ |
| id                           | TEXT PK    | Token ID                 |
| archive_id                   | TEXT FK    | → archives.id（CASCADE） |
| x, y                         | REAL       | 位置                     |
| width, height                | REAL       | 尺寸                     |
| image_scale_x, image_scale_y | REAL       | 图像缩放                 |
| snapshot_lifecycle           | TEXT       | 快照时的 lifecycle       |
| original_entity_id           | TEXT       | 原始实体引用             |
| snapshot_data                | TEXT(JSON) | 实体快照（ephemeral 用） |

**快照策略**：

- `ephemeral` 实体 → `snapshot_data` 包含完整 JSON 快照，`original_entity_id` 可能为 null
- `reusable`/`persistent` 实体 → `snapshot_data = null`，通过 `original_entity_id` 引用现有实体

### tactical_state（per-scene）

| 列                    | 类型       | 说明                   |
| --------------------- | ---------- | ---------------------- |
| scene_id              | TEXT PK FK | → scenes.id（CASCADE） |
| tactical_mode         | INTEGER    | 战术模式开关           |
| active_archive_id     | TEXT       | 当前活动存档           |
| map_url               | TEXT       | 战术地图 URL           |
| map_width, map_height | INTEGER    | 地图尺寸               |
| grid                  | TEXT(JSON) | 网格配置               |
| round_number          | INTEGER    | 当前回合数             |
| current_turn_token_id | TEXT       | 当前回合 Token（预留） |

### tactical_tokens

| 列                           | 类型    | 说明                                 |
| ---------------------------- | ------- | ------------------------------------ |
| id                           | TEXT PK | Token ID                             |
| scene_id                     | TEXT FK | → tactical_state.scene_id（CASCADE） |
| entity_id                    | TEXT FK | → entities.id（CASCADE）             |
| x, y                         | REAL    | 位置                                 |
| width, height                | REAL    | 尺寸                                 |
| image_scale_x, image_scale_y | REAL    | 图像缩放                             |
| initiative_position          | INTEGER | 先攻位置（预留，未接线）             |

**约束**：`UNIQUE(scene_id, entity_id)` — 同一实体在同一场景只能有一个 Token。

### chat_messages

| 列           | 类型       | 说明             |
| ------------ | ---------- | ---------------- |
| id           | TEXT PK    | 消息 ID          |
| type         | TEXT       | 'text' 或 'roll' |
| sender_id    | TEXT       | 发送者座位 ID    |
| sender_name  | TEXT       | 发送者名         |
| sender_color | TEXT       | 发送者颜色       |
| portrait_url | TEXT       | 头像             |
| content      | TEXT       | 消息内容         |
| roll_data    | TEXT(JSON) | 骰子数据         |
| timestamp    | INTEGER    | 时间戳           |

### assets

| 列         | 类型       | 说明                                    |
| ---------- | ---------- | --------------------------------------- |
| id         | TEXT PK    | 素材 ID                                 |
| url        | TEXT       | 文件 URL                                |
| name       | TEXT       | 显示名                                  |
| type       | TEXT       | 'image' / 'blueprint' / 'map' / 'audio' |
| tags       | TEXT(JSON) | 标签数组                                |
| created_at | INTEGER    | 时间戳                                  |
| extra      | TEXT(JSON) | 额外数据（blueprint 的默认属性等）      |

### team_trackers

| 列         | 类型    | 说明      |
| ---------- | ------- | --------- |
| id         | TEXT PK | 追踪器 ID |
| label      | TEXT    | 标签      |
| current    | INTEGER | 当前值    |
| max        | INTEGER | 最大值    |
| color      | TEXT    | 颜色      |
| sort_order | INTEGER | 排序      |

### showcase_items

| 列         | 类型       | 说明      |
| ---------- | ---------- | --------- |
| id         | TEXT PK    | 展示项 ID |
| type       | TEXT       | 'image'   |
| data       | TEXT(JSON) | 展示数据  |
| pinned     | INTEGER    | 是否置顶  |
| sort_order | INTEGER    | 排序      |
| created_at | INTEGER    | 时间戳    |

## JSON 字段策略

| 字段              | 表                       | 存储方式  | 理由                         |
| ----------------- | ------------------------ | --------- | ---------------------------- |
| atmosphere        | scenes                   | JSON blob | 字段组合固定，不需要单独查询 |
| grid              | tactical_state, archives | JSON blob | 6 个子字段，不需要索引       |
| permissions       | entities                 | JSON blob | 结构灵活（动态 seat ID）     |
| rule_data         | entities                 | JSON blob | 由插件自定义，schema 未知    |
| roll_data         | chat_messages            | JSON blob | 骰子结果的复杂嵌套结构       |
| snapshot_data     | archive_tokens           | JSON blob | 完整实体快照                 |
| tags, extra, data | assets, showcase_items   | JSON blob | 灵活扩展字段                 |

## 命名转换约定

- SQLite 列名：`snake_case`（如 `image_url`、`rule_data`）
- REST API 响应 + 前端：`camelCase`（如 `imageUrl`、`ruleData`）
- 转换工具在 `server/db.ts`：
  - `toCamel(row)` — snake_case → camelCase
  - `parseJsonFields(row, ...fields)` — 解析 JSON 字符串字段
  - `toBoolFields(row, ...fields)` — SQLite 0/1 → boolean

## TypeScript 类型映射

前端类型定义在 `src/shared/entityTypes.ts`：

| 类型                | 对应表                           |
| ------------------- | -------------------------------- |
| `Entity`            | entities                         |
| `MapToken`          | tactical_tokens                  |
| `Blueprint`         | assets (type='blueprint')        |
| `Atmosphere`        | scenes.atmosphere JSON           |
| `EntityPermissions` | entities.permissions JSON        |
| `SceneEntityEntry`  | scene_entities                   |
| `TacticalState`     | tactical_state + tactical_tokens |

## 索引

| 索引                       | 表              | 列         |
| -------------------------- | --------------- | ---------- |
| idx_scene_entities_scene   | scene_entities  | scene_id   |
| idx_chat_messages_ts       | chat_messages   | timestamp  |
| idx_entities_lifecycle     | entities        | lifecycle  |
| idx_tactical_tokens_scene  | tactical_tokens | scene_id   |
| idx_tactical_tokens_entity | tactical_tokens | entity_id  |
| idx_archive_tokens_archive | archive_tokens  | archive_id |
