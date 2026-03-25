# 10 - 战术系统与 Token 数据模型重构设计

> **✅ 实现状态：核心已落地，先攻系统延后**
>
> Token 规范化（所有 Token 必须有 entityId）、per-scene tactical_state + tactical_tokens SQL 表、Archive save/load、KonvaMap 层级重构均已实现。
> **未落地部分**：先攻系统（initiative_position 字段已预留但未接线）。

> **术语变更说明：** 本文档将原"战斗模式（Combat Mode）"统一更名为**"战术模式（Tactical Mode）"**。
>
> 原因：进入/退出战术模式只是 UI 视图切换（D11），不代表叙事上"开始/结束战斗"。GM 可能在非战斗场景下使用网格地图（探索地城、潜入、解谜等）。"战术"描述的是**交互方式**（网格 + 定位 + Token），而非叙事状态。
>
> 相关改名一览：
>
> | 旧术语                            | 新术语                               |
> | --------------------------------- | ------------------------------------ |
> | 战斗模式                          | **战术模式**                         |
> | `combat_state` / `combat_tokens`  | `tactical_state` / `tactical_tokens` |
> | `encounters` / `encounter_tokens` | `archives` / `archive_tokens`        |
> | `startCombat` / `endCombat`       | `enterTactical` / `exitTactical`     |
> | 遭遇 / 预设                       | **存档**                             |
> | 战斗临时（UI 分组名）             | **战术对象**                         |

## 一、现状分析

### 1.1 当前 Token 数据模型

```typescript
// src/shared/entityTypes.ts
interface MapToken {
  id: string
  entityId?: string // 可选：链接到 Entity
  x: number
  y: number
  size: number
  permissions: EntityPermissions
  label?: string // ← 冗余：与 Entity.name 重复
  imageUrl?: string // ← 冗余：与 Entity.imageUrl 重复
  color?: string // ← 冗余：与 Entity.color 重复
}
```

**渲染时的 fallback 链**（`KonvaToken.tsx:41-48`）：

```typescript
const color = entity?.color ?? token.color ?? '#888888'
const imageUrl = entity?.imageUrl ?? token.imageUrl ?? ''
const name = entity?.name ?? token.label ?? ''
```

**问题：**

- 链接 token 在创建时**复制** Entity 的 `name`/`imageUrl`/`color`（快照），但 Entity 更新后快照不会同步
- 渲染时虽然优先使用 Entity 数据，但快照仍然存在于存储中，造成混淆
- 匿名 token（无 `entityId`）使用自身的 `label`/`color` 是合理的，但两种 token 共用同一个类型定义导致语义不清

### 1.2 Token 存储结构

Token 以 **JSON blob** 存储在两个地方：

| 表                      | 字段                       | 用途               |
| ----------------------- | -------------------------- | ------------------ |
| `tactical_state` (单行) | `tokens TEXT DEFAULT '{}'` | 当前战术运行时状态 |
| `archives`              | `tokens TEXT DEFAULT '{}'` | 战场存档快照       |

**操作模式**（`server/routes/combat.ts`）：

```
每次 token CRUD:
  1. SELECT tokens FROM tactical_state  →  读取整个 JSON
  2. JSON.parse(tokens)               →  解析
  3. tokens[id] = {...}               →  修改
  4. JSON.stringify(tokens)           →  序列化
  5. UPDATE tactical_state SET tokens=?  →  写回整个 JSON
```

**问题：**

- 无法对单个 token 进行 SQL 查询或索引
- 无法通过 FK 级联自动清理（当前依赖手动 `degradeTokenReferences`）
- 每次修改一个 token 的位置（拖拽 60fps）都要读写整个 JSON blob
- 并发修改可能导致后写覆盖先写（Last-Write-Wins，无字段级合并）

### 1.3 Archive ↔ TacticalState 关系（旧：Encounter ↔ CombatState）

```
┌──────────────┐     activate     ┌──────────────────┐
│   archives   │ ──────────────→  │   tactical_state   │
│  (存档模板)   │                  │   (运行时单例)    │
│              │  save-snapshot   │                  │
│              │ ←──────────────  │                  │
└──────────────┘                  └──────────────────┘
```

**激活流程**（`encounters.ts:115-156`，将重命名为 `archives.ts`）：

1. 读取存档记录
2. 设置 `room_state.active_archive_id`
3. 将存档的 map/grid/tokens **全量覆盖**到 `tactical_state`
4. 先攻重置为空

**保存流程**（`encounters.ts:159-181`，同上将重命名）：

1. 读取当前 `tactical_state`
2. 将 map/grid/tokens 写回存档记录（不含先攻）

**问题：**

- **ad-hoc 战斗**：`startCombat()` 创建 `adhoc-${uuid}` ID 但**不创建存档记录**，这意味着 ad-hoc 战斗无法被保存
- **endCombat 不清数据**：只清 `active_archive_id = NULL`，tactical_state 中的地图/token/网格**残留**
- archives 和 tactical_state **字段完全重复**（mapUrl, mapWidth, mapHeight, grid, tokens），是同一套数据的两份拷贝
- 激活时全量覆盖，无法处理"部分保留运行时修改"的场景

### 1.4 Token 创建路径碎片化

| 路径             | 位置                                           | 创建方式                    | 链接？       |
| ---------------- | ---------------------------------------------- | --------------------------- | ------------ |
| 拖 Entity 到地图 | `App.tsx:349-365`                              | 复制 entity 属性到 token    | ✅ entityId  |
| 蓝图 spawn       | `GmDock.tsx` → `worldStore.spawnFromBlueprint` | 先创 Entity，再手动创 token | ✅ entityId  |
| 右键空白创建     | `KonvaMap.tsx:366-393`                         | 随机颜色，无 entity         | ❌ 匿名      |
| 复制 token       | `KonvaMap.tsx:396-409`                         | `{...token, id: new}`       | 继承原 token |

**违反 Store Action Convention：** 前 3 种路径的 token 创建逻辑散布在不同组件中，而非统一的 store 方法。这使得：

- 无法在集成测试中测试创建流程
- 每条路径各自处理属性复制，容易遗漏或不一致
- 添加新的创建路径需要在多处复制逻辑

### 1.5 KonvaMap.tsx 职责过载（746 行）

| 职责                 | 行数估计 | 说明                     |
| -------------------- | -------- | ------------------------ |
| 相机控制             | ~90 行   | zoom/pan/fit/reset       |
| 拖拽感知同步         | ~60 行   | awareness Socket.io 事件 |
| 右键菜单             | ~40 行   | context menu 状态管理    |
| Tooltip              | ~20 行   | hover 延迟显示           |
| Token 创建/复制/删除 | ~70 行   | 4 个 handler             |
| Entity drop 处理     | ~40 行   | onDragOver/onDrop        |
| 背景渲染             | ~110 行  | Image/Video background   |
| 缩放按钮             | ~20 行   | UI 组件                  |
| 组合渲染             | ~100 行  | Stage + Layer 组装       |

**问题：** 混合了视图渲染、业务逻辑、输入处理、网络同步等多种职责，难以单独测试和维护。

### 1.6 先攻系统（半成品）

**已有：**

- 数据存储：`tactical_state.initiative_order: string[]`（tokenId 数组）、`initiative_index: number`
- Store actions：`setInitiativeOrder(order)`、`advanceInitiative()`
- REST API：通过 `PATCH /combat` 更新

**缺失：**

- 无 UI 面板用于构建/查看先攻列表
- 无自动排序机制（DnD 先攻骰等）
- 无回合开始/结束事件
- 无持续效果/倒计时管理
- 先攻列表中的 tokenId 可能指向已删除的 token（无清理机制）

---

## 二、重构议题

### 议题 1：Token 数据模型重设计 ✅ 已决策

**目标：** 消除 Token 上的冗余数据，让 Entity 成为唯一的业务数据容器。

**决策：所有 Token 都必须关联 Entity，entityId 必填，1:1 关系。**

不再区分"链接 token"和"匿名 token"。每个 token 背后都有一个 Entity，token 只负责地图上的位置和尺寸。

```typescript
interface MapToken {
  id: string
  entityId: string // 必填，1:1 关系
  x: number
  y: number
  width: number // 占地（网格单位），替代原 size
  height: number // 占地（网格单位）
  imageScaleX: number // 图片缩放，默认 1
  imageScaleY: number // 图片缩放，默认 1
}
```

**Entity 对应变更：** `size: number` 改为 `width: number` + `height: number`，作为创建 Token 时的默认占地尺寸。

**设计理由：**

- **无联合类型、无分支逻辑：** 渲染永远从 Entity 读取数据（名字、颜色、头像等），一条路径
- **任何 Token 随时可编辑数据：** 因为背后一定有 Entity，不需要"升级"操作
- **右键空白创建 Token：** 创建 ephemeral Entity + tactical_token，不创建 scene_entity_entry（战术对象）
- **蓝图 spawn：** 创建 ephemeral Entity + tactical_token，不创建 scene_entity_entry（战术对象）
- **拖角色到地图：** 已有 Entity（已有 scene_entity_entry）+ 创建 tactical_token
- **width/height 替代 size：** 支持非正方形 Token（如龙、马车等），`imageScaleX`/`imageScaleY` 控制图片在占地区域内的缩放
- **Token `permissions` 字段已移除：** Token 不再有独立的权限字段，统一从关联 Entity 的 `permissions` 继承。渲染和权限检查只走一条路径
- **蓝图 spawn / 右键创建的 Entity lifecycle = `ephemeral`：** 这些方式创建的 Entity 始终为 ephemeral，加载存档时如果没有 scene_entity_entry 则自动清理

**场景实体列表分组：**

Entity 在场景中的存在分为两个层级：**scene_entity_entry**（场景级，跨战斗持久）和 **tactical_token**（战术地图级，加载存档时可清理）。一个 Entity 可以只有 tactical_token 而没有 scene_entity_entry——即"战术对象"，只存在于当前战术地图上。

UI 中使用两组分类：

```
侧边栏实体列表
├── 场景角色（有 scene_entity_entry）
│   ├── 酒馆老板
│   └── 大法师艾琳
└── 战术对象（有 tactical_token，无 scene_entity_entry）
    ├── 哥布林 A
    ├── 木桶
    └── 篝火
    （仅战术模式显示，加载存档时自动清理）
```

**分组判定逻辑：**

| 条件                                      | 分组     |
| ----------------------------------------- | -------- |
| 有 scene_entity_entry                     | 场景角色 |
| 有 tactical_token + 无 scene_entity_entry | 战术对象 |

**拖拽升降级：**

- 从"战术对象"拖到"场景角色" → 创建 scene_entity_entry（升级为场景角色，加载存档不再清理）
- 从"场景角色"拖到"战术对象" → 删除 scene_entity_entry（降级为战术对象，加载存档时会被清理）
- 右键 token →"添加到场景"同理

**创建路径与 scene_entity_entry：**

| 创建方式              | 创建 scene_entity_entry？ | 分组     |
| --------------------- | ------------------------- | -------- |
| 战术模式右键地图创建  | ❌                        | 战术对象 |
| 存档加载 ephemeral    | ❌                        | 战术对象 |
| 蓝图 spawn            | ❌                        | 战术对象 |
| 叙事模式右键创建 NPC  | ✅                        | 场景角色 |
| 拖已有 Entity 到地图  | 已有 ✅                   | 场景角色 |
| GM 在实体面板创建角色 | ✅                        | 场景角色 |

---

### 议题 2：Token 存储层重构（JSON → SQL 表） ✅ 已决策

**目标：** 将 tokens 从 JSON blob 提升为独立 SQL 表，获得 SQL 查询、FK 级联、单行 CRUD 的能力。

#### 2.1 三张表的职责

| 表                | 含义                                       | 生命周期                       |
| ----------------- | ------------------------------------------ | ------------------------------ |
| `tactical_tokens` | 当前战术地图上的 token，实时状态           | 按场景存储，进入战术模式时显示 |
| `tactical_state`  | 当前战术地图的全局信息（地图、网格、回合） | 按场景存储，每个场景各自保留   |
| `archive_tokens`  | 存档中保存的 token 快照                    | 存档数据，加载时读取           |

```
archive_tokens（存档库）
    │
    │ 加载存档（复制）
    ▼
tactical_tokens + tactical_state（运行时，实时更新）
    │
    │ 保存为存档（可选）
    ▼
archive_tokens（新存档）
```

#### 2.2 表结构

```sql
-- 战术全局状态（按场景存储，每个场景各自保留战场）
CREATE TABLE tactical_state (
  scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
  map_url TEXT,
  map_width INTEGER,
  map_height INTEGER,
  grid TEXT DEFAULT '{}',
  round_number INTEGER DEFAULT 0,
  current_turn_token_id TEXT
);
```

- 不再是单例（`CHECK(id = 1)`），改为按 `scene_id` 索引
- 切场景时各自保留战场状态，互不影响
- **场景删除时 `ON DELETE CASCADE` 自动清理** `tactical_state` 行及其关联的 `tactical_tokens`
- **创建场景时自动 INSERT 默认 `tactical_state` 行**（服务端在创建场景的事务中同时创建）

```sql
-- 战术运行时 token（按场景归属）
CREATE TABLE tactical_tokens (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES tactical_state(scene_id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 1,
  height REAL NOT NULL DEFAULT 1,
  image_scale_x REAL NOT NULL DEFAULT 1,
  image_scale_y REAL NOT NULL DEFAULT 1,
  initiative_position INTEGER   -- NULL = 未加入先攻
);
```

- `scene_id` FK 指向 `tactical_state`，场景战场清空时 token 自动清理
- `entity_id` FK `ON DELETE CASCADE`：Entity 删除 → Token 直接消失
- 不再需要 `degradeTokenReferences` 降级逻辑

```sql
-- 存档 token（快照）
CREATE TABLE archive_tokens (
  id TEXT PRIMARY KEY,
  archive_id TEXT NOT NULL REFERENCES archives(id) ON DELETE CASCADE,
  -- 位置和尺寸
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 1,
  height REAL NOT NULL DEFAULT 1,
  image_scale_x REAL NOT NULL DEFAULT 1,
  image_scale_y REAL NOT NULL DEFAULT 1,
  -- 激活行为判断
  snapshot_lifecycle TEXT NOT NULL,     -- 决定激活时走哪条逻辑
  -- 引用（reusable/persistent 用）
  original_entity_id TEXT,             -- 不做 FK
  -- 快照数据（仅 ephemeral 用，JSON 列）
  snapshot_data TEXT                    -- JSON: {name, imageUrl, color, width, height, notes, ruleData, permissions}
);
```

- `original_entity_id` **不做 FK**：ephemeral Entity 可能在加载新存档时被清理，如果做 FK 会导致 CASCADE 删除存档记录或外键约束报错
- `snapshot_lifecycle` 用于区分加载存档时的行为路径
- `snapshot_data` 为单个 JSON 列，仅 ephemeral token 填充，reusable/persistent 为 NULL（它们使用真实 Entity 的当前数据）。这些字段是只读的，只在保存/加载存档时整体读写，不需要 SQL 级查询

#### 2.3 存档语义：不可变模板

- 加载存档 = 从存档复制到战术状态，**存档本身不变**
- GM 可主动选择：丢弃（存档不变）/ 另存为新存档 / 覆盖原存档

#### 2.4 存档加载逻辑

| lifecycle  | Entity 还在                 | Entity 不在                 |
| ---------- | --------------------------- | --------------------------- |
| persistent | 引用现有 Entity + 恢复位置  | 跳过                        |
| reusable   | 引用现有 Entity + 恢复位置  | 跳过                        |
| ephemeral  | 从快照创建新 Entity + Token | 从快照创建新 Entity + Token |

#### 2.5 性能对比

| 操作                    | 当前（JSON blob）                         | 重构后（SQL 表）                             |
| ----------------------- | ----------------------------------------- | -------------------------------------------- |
| 移动一个 token          | 读→解析→改→序列化→写回（5 步）            | `UPDATE ... SET x=?, y=? WHERE id=?`（1 步） |
| 两人同时移动不同 token  | 后写覆盖先写（数据丢失风险）              | 不同行，互不影响                             |
| Entity 删除后清理 token | 手动扫描 JSON（`degradeTokenReferences`） | `ON DELETE CASCADE` 自动处理                 |
| 单次写入耗时            | ~174μs（JSON 解析+序列化）                | ~11μs（单行 UPDATE）                         |

#### 2.6 API 变更

| 原 API                            | 新 API                                                          | 说明                   |
| --------------------------------- | --------------------------------------------------------------- | ---------------------- |
| `PATCH /combat` (tokens 整体替换) | 移除 tokens 字段                                                | token 通过专用路由管理 |
| `POST /tactical/tokens`           | 保留，改为 INSERT 行                                            | 不再读写 JSON          |
| `PATCH /tactical/tokens/:id`      | 保留，改为 UPDATE 行                                            | 单行更新               |
| `DELETE /tactical/tokens/:id`     | 保留，改为 DELETE 行                                            | CASCADE 自动处理       |
| `GET /tactical`                   | 返回 `{ map, grid, tokens[], roundNumber, currentTurnTokenId }` | tokens 从表查询        |

---

### 议题 3：存档 ↔ 战术状态 生命周期 ✅ 已决策

**目标：** 理清存档与运行时的关系，消除 ad-hoc 战斗的特殊处理。

#### 3.1 核心概念重定义

| 概念                                                       | 旧理解                     | 新定义                                                                                                       |
| ---------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| tactical_state + tactical_tokens                           | 全局单例，只有一场战斗     | 按场景存储，每个场景各自保留战场状态                                                                         |
| archives（旧 encounters）                                  | "遭遇"，与战斗生命周期绑定 | **战场存档**，纯粹的保存/恢复机制                                                                            |
| enterTactical / exitTactical（旧 startCombat / endCombat） | 创建/销毁战斗数据          | **房间共享 UI 模式切换**（写入 `room_state.tactical_mode`，Socket.io 广播给所有客户端），不创建/销毁战斗数据 |
| ad-hoc 战斗                                                | 没有存档记录的特殊战斗     | 不再需要——场景天然就有自己的战场                                                                             |

#### 3.2 新模型

```
场景 A 的战场（tactical_state + tactical_tokens, scene_id = A）
    ↑ 加载存档              ↓ 保存为存档
    │                      │
    └── 存档列表 ───────────┘
        ├── "哥布林伏击"     （archive + archive_tokens）
        ├── "Boss 战第二阶段"
        └── "备用方案"

场景 B 的战场（tactical_state + tactical_tokens, scene_id = B）
    （完全独立，互不影响）
```

- 每个场景有自己的 `tactical_state` 行和 `tactical_tokens` 行集合
- 切换场景时战场数据自动保留，切回来还在
- archives 是存档机制：保存 = 快照当前战场，加载 = 覆盖当前战场

#### 3.3 操作语义

| 操作             | 行为                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **进入战术模式** | 写入 `room_state.tactical_mode = 1`，Socket.io 广播，所有客户端切换到战术地图视图，显示当前场景的 tactical_state/tactical_tokens |
| **退出战术模式** | 写入 `room_state.tactical_mode = 0`，Socket.io 广播，所有客户端切回场景模式，战场数据**保留不清空**                              |
| **加载存档**     | 清空当前场景的 tactical_tokens，从 archive_tokens 恢复（按 lifecycle 规则）                                                      |
| **保存为存档**   | 将当前场景的 tactical_state + tactical_tokens 快照到 archive + archive_tokens                                                    |
| **另存为新存档** | 创建新 archive 记录 + 快照                                                                                                       |
| **覆盖存档**     | 覆盖现有 archive 记录 + 快照                                                                                                     |
| **清空战场**     | GM 手动操作，清空当前场景的 tactical_tokens 和 tactical_state                                                                    |

#### 3.5 存档加载与 Entity 关系

**核心原则：scene_entity_entry 是"场景角色"的标志。有 entry 的 Entity 跨战斗持久，无 entry 的 Entity 是战术对象，加载存档时自动清理。**

三层数据与加载存档的关系：

| 层级                               | 数据                       | 加载存档时              |
| ---------------------------------- | -------------------------- | ----------------------- |
| Entity + scene_entity_entry        | 场景角色（酒馆老板等）     | **不受影响**            |
| Entity（无 entry）+ tactical_token | 战术对象（哥布林、木桶等） | **清理 Entity + token** |
| tactical_tokens                    | 战术地图上的棋子位置       | **全量替换**            |

**加载存档流程：**

```sql
-- Step 1: 找出即将成为孤儿的战术对象 Entity
--（有 tactical_token、无 scene_entity_entry、lifecycle = ephemeral）
CREATE TEMP TABLE orphans AS
SELECT ct.entity_id FROM tactical_tokens ct
WHERE ct.scene_id = ?
AND NOT EXISTS (
  SELECT 1 FROM scene_entity_entries se
  WHERE se.entity_id = ct.entity_id
)
AND (SELECT lifecycle FROM entities WHERE id = ct.entity_id) = 'ephemeral';

-- Step 2: 清空当前场景的所有 tactical_tokens
DELETE FROM tactical_tokens WHERE scene_id = ?;

-- Step 3: 删除孤儿 ephemeral entities（FK CASCADE 自动清理关联数据）
DELETE FROM entities WHERE id IN (SELECT entity_id FROM orphans);

-- Step 4: 从 archive_tokens 恢复（按 lifecycle 规则，见 2.4）
INSERT INTO tactical_tokens ...;
```

**边界情况对比：**

| Entity                 | 有 scene_entity_entry | 在战场上 | 在存档中 | 加载存档后                                      |
| ---------------------- | --------------------- | -------- | -------- | ----------------------------------------------- |
| 酒馆老板               | ✅                    | ✅       | ❌       | token 消失，Entity + entry 保留。GM 可重新拖入  |
| 酒馆老板               | ✅                    | ❌       | ❌       | 无影响                                          |
| 哥布林 A（上一场战斗） | ❌                    | ✅       | ❌       | **Entity + token 均删除**（战术对象，自动清理） |
| 强盗 X（新存档）       | ❌                    | ❌       | ✅       | 从快照创建新 Entity + token（战术对象）         |

**设计理由：**

- scene_entity_entry = GM 的意图表达："这个角色属于这个场景"
- 无 entry 的 Entity 是战术对象，只存在于当前战术地图，没有跨战斗的意义
- GM 可以随时通过拖拽将战术对象升级为场景角色（创建 scene_entity_entry），此后加载存档不再清理
- 不增加新的 lifecycle 类型，用现有关系图推断清理行为

#### 3.4 解决的问题

- **ad-hoc 战斗无法保存** → 不再存在 ad-hoc 概念，每个场景天然有战场，随时可保存为存档
- **exitTactical 数据残留** → 退出战术模式不清数据，这是期望行为（下次进入还能看到）
- **切场景战斗中断** → 每个场景独立战场，切换不影响任何数据

---

### 议题 4：Token 创建统一化 + Store Action 整合 ✅ 已决策

**目标：** 所有 token 创建路径统一到 worldStore 方法，服务端提供原子接口。

#### 4.1 服务端原子接口

所有 Token 都需要 Entity，所以创建 Token 必然涉及 Entity 操作。服务端在一个事务中完成全部步骤：

| 接口                                                           | 事务内操作                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /scenes/:sceneId/tactical/tokens` (快速创建)             | 创建 ephemeral Entity → 创建 tactical_token（不创建 scene_entity_entry，战术对象）                      |
| `POST /scenes/:sceneId/tactical/tokens/from-entity` (已有角色) | 创建 tactical_token（Entity 已存在，已有 scene_entity_entry）                                           |
| `POST /scenes/:sceneId/spawn` (蓝图 spawn)                     | 创建 ephemeral Entity → 创建 tactical_token（不创建 scene_entity_entry，战术对象）                      |
| `POST /scenes/:sceneId/tactical/tokens/:id/duplicate` (复制)   | 创建 ephemeral Entity（复制原 Entity 数据）→ 创建 tactical_token（不创建 scene_entity_entry，战术对象） |

客户端只需调用一个方法，不再手动组合多步操作。

#### 4.2 Store Actions

```typescript
interface WorldStore {
  // 快速创建（右键空白处）— 服务端原子创建 Entity + Token
  createToken(sceneId: string, x: number, y: number): void

  // 已有 Entity 放到地图上
  placeEntityOnMap(sceneId: string, entityId: string, x: number, y: number): void

  // 复制 token — 服务端原子复制 Entity + Token
  duplicateToken(sceneId: string, tokenId: string, offsetX: number, offsetY: number): void

  // 蓝图 spawn — 已有，重构后服务端自动创建 tactical_token
  spawnFromBlueprint(sceneId: string, blueprintId: string, x?: number, y?: number): void
}
```

#### 4.3 组件变更

| 原来                                             | 重构后                                                 |
| ------------------------------------------------ | ------------------------------------------------------ |
| `App.tsx:handleDropEntityOnMap` — 手动构造 token | `worldStore.placeEntityOnMap(sceneId, entityId, x, y)` |
| `KonvaMap.tsx:handleCreateToken` — 随机颜色      | `worldStore.createToken(sceneId, x, y)`                |
| `KonvaMap.tsx:handleCopyToken` — `{...token}`    | `worldStore.duplicateToken(sceneId, tokenId, dx, dy)`  |
| `GmDock.tsx` — spawn 后手动创 token              | `worldStore.spawnFromBlueprint(...)` 内部自动处理      |

**原则：组件 onClick handler 只调一个 store 方法，所有多步逻辑在 store → 服务端完成。**

---

### 议题 5：先攻 / 回合系统设计 ⏳ 延后

**延后原因：** 先攻系统与规则引擎紧密耦合，留到规则接口设计阶段一并处理。

**本次只做：** 在 `tactical_tokens` 表上预留 `initiative_position INTEGER` 字段，`tactical_state` 表上预留 `round_number` 和 `current_turn_token_id` 字段。数据模型就绪，UI 和业务逻辑后续实现。

---

### 议题 6：KonvaMap 组件拆分 ✅ 已决策

**目标：** 将 746 行拆分为职责清晰的子组件/hooks，隔离 konva 依赖，方便未来替换渲染引擎。

**拆分方案：**

```
KonvaMap.tsx (主容器，~150 行)
├── hooks/
│   ├── useCameraControls.ts      (~80 行) — zoom/pan/fit/reset
│   ├── useTokenAwareness.ts      (~60 行) — Socket.io drag broadcasting
│   └── useEntityDrop.ts          (~40 行) — onDragOver/onDrop handling
├── BackgroundLayer.tsx            (~110 行) — Image/Video background
├── ZoomControls.tsx               (~30 行) — zoom button UI
├── KonvaTokenLayer.tsx            (已独立，不变)
├── KonvaToken.tsx                 (不变)
├── TokenContextMenu.tsx           (已独立，不变)
└── TokenTooltip.tsx               (已独立，不变)
```

**提取原则：**

- **视图渲染** → 独立组件（BackgroundLayer, ZoomControls）
- **有状态交互逻辑** → custom hooks（useCameraControls, useTokenAwareness）
- **事件处理** → hooks 或移入 store（useEntityDrop → 最终调 store 方法）
- **主容器** 只负责组装
- **konva 依赖** 限制在 `src/combat/` 目录内，store 和 shared 代码不引用 konva

---

## 三、依赖关系与实施顺序

```
议题 1（Token 模型）+ 议题 2（Token SQL 表）
    ↓
议题 3（存档生命周期）+ 议题 4（Token 创建统一化）
    ↓
议题 6（KonvaMap 拆分）

议题 5（先攻系统）── 延后到规则接口设计阶段
```

建议分 3 个 PR 实施：

- **PR A**：议题 1 + 2（数据层：类型系统 + SQL 表迁移 + API 重构）
- **PR B**：议题 3 + 4（业务层：存档系统 + Token 创建统一化）
- **PR C**：议题 6（代码层：KonvaMap 拆分 + konva 依赖隔离）

### 测试规划

沿用现有测试模式：集成测试在 `server/__tests__/scenarios/`，纯 Node 环境，真实服务器 + SQLite。

#### PR A 测试（数据层）

**需改造的现有测试：**

| 测试文件                                              | 改造原因                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `token-degradation.test.ts`                           | Token 不再降级为 anonymous，Entity 删除时 CASCADE 直接删 token |
| `tactical-lifecycle.test.ts`（旧 `combat-lifecycle`） | tactical_state 从单例改为按场景存储，API 路径变更              |
| `archive-crud.test.ts`（旧 `encounter-crud`）         | archives 表去掉 `tokens` JSON 字段，改用 archive_tokens 表     |
| `spawn.test.ts`                                       | spawn 后自动创建 tactical_token，需验证原子事务                |
| `schema.test.ts` / `schema-alignment.test.ts`         | 新增表结构校验                                                 |

**新增测试：**

| 测试文件                             | 覆盖场景                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `tactical-tokens-crud.test.ts`       | Token 单行 CRUD：创建 → 移动(UPDATE x,y) → 删除；验证 Entity 1:1 约束    |
| `tactical-tokens-cascade.test.ts`    | FK 级联：删 Entity → token 消失；删 scene → tactical_state + tokens 全清 |
| `tactical-tokens-concurrent.test.ts` | 并发：两个客户端同时移动不同 token，互不覆盖                             |
| `entity-width-height.test.ts`        | Entity `size` → `width`/`height` 迁移后 CRUD 正确性                      |

#### PR B 测试（业务层）

**新增测试：**

| 测试文件                      | 覆盖场景                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `archive-save.test.ts`        | 保存存档：当前战场 → archive_tokens 快照（ephemeral 存完整数据，reusable/persistent 只存引用）                  |
| `archive-load.test.ts`        | 加载存档：ephemeral → 从快照重建新 Entity；reusable → 引用现有 Entity + 恢复位置；persistent Entity 已删 → 跳过 |
| `archive-immutable.test.ts`   | 模板不可变：加载存档后修改战场，验证原存档未被改动                                                              |
| `token-create-atomic.test.ts` | 原子创建：快速创建 → 验证 Entity + scene_entity + tactical_token 同时存在；任一步失败 → 全部回滚                |
| `token-place-entity.test.ts`  | 已有角色放到地图：验证不重复创建 Entity，只创建 tactical_token                                                  |
| `token-duplicate.test.ts`     | 复制 token：验证新 Entity 数据与原 Entity 一致，位置有偏移                                                      |

#### PR C 测试（代码层）

KonvaMap 拆分是纯重构，主要依赖现有测试回归。额外新增：

| 测试文件                    | 覆盖场景                                             |
| --------------------------- | ---------------------------------------------------- |
| `useCameraControls.test.ts` | 提取后的 hook 单元测试：zoom/pan/fit/reset 逻辑      |
| 现有全部测试通过            | 拆分不改变任何行为，所有 scenario 测试必须零修改通过 |

---

## 四、待讨论决策点

每个议题中需要你确认的关键决策：

| #   | 议题          | 决策点                              | 结论                                                                                                        |
| --- | ------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| D1  | Token 模型    | 是否区分 linked/anonymous           | ✅ **不区分**。所有 Token 必须关联 Entity，entityId 必填                                                    |
| D2  | Token 模型    | size 字段设计                       | ✅ `size` 改为 `width` + `height`，新增 `imageScaleX`/`imageScaleY`                                         |
| D3  | Token 模型    | Entity:Token 关系                   | ✅ **1:1**（运行时），存档中可 1:N（同一 Entity 在不同存档有不同位置）                                      |
| D4  | Token SQL 表  | tactical_tokens.entity_id 是否做 FK | ✅ 做 FK，**ON DELETE CASCADE**                                                                             |
| D5  | Token SQL 表  | archive_tokens.entity_id 是否做 FK  | ✅ **不做 FK**（ephemeral Entity 删除后存档数据应保留）                                                     |
| D6  | Token SQL 表  | 快照字段设计                        | ✅ 快照字段仅 ephemeral 填充，reusable/persistent 用真实 Entity 数据                                        |
| D7  | 存档语义      | 模板 vs 存档                        | ✅ **不可变模板**，加载不修改存档，GM 可主动另存/覆盖                                                       |
| D8  | 存档加载      | 各 lifecycle 的加载行为             | ✅ persistent/reusable 引用现有 Entity（不在则跳过），ephemeral 从快照重建                                  |
| D9  | 存档生命周期  | tactical_state 存储方式             | ✅ **按场景存储**（scene_id 索引），不再是全局单例                                                          |
| D10 | 存档生命周期  | archives 的语义                     | ✅ **战场存档**（保存/恢复机制），不再与战斗生命周期绑定                                                    |
| D11 | 存档生命周期  | enterTactical/exitTactical 语义     | ✅ **房间共享 UI 模式切换**（写入 `room_state.tactical_mode`，Socket.io 广播），不创建/销毁数据，退出不清空 |
| D12 | 存档生命周期  | ad-hoc 战斗                         | ✅ **取消**，场景天然有战场，不需要特殊处理                                                                 |
| D13 | Token 创建    | 服务端接口设计                      | ✅ **原子接口**，一个事务完成 Entity + 场景关联 + tactical_token                                            |
| D14 | 先攻系统      | 本次范围                            | ✅ **延后**，只预留数据字段，UI 和逻辑留到规则接口阶段                                                      |
| D15 | KonvaMap 拆分 | 是否在本次重构中做                  | ✅ **做**，隔离 konva 依赖，方便未来替换渲染引擎                                                            |
| D16 | 存档加载      | 加载存档是否清理旧 Entity           | ✅ **按 scene_entity_entry 判定**：有 entry = 场景角色，保留；无 entry = 战术对象，清理                     |
| D17 | 实体分组      | 实体列表分几组                      | ✅ **两组**：场景角色（有 scene_entity_entry）、战术对象（无 entry，仅战术模式显示）                        |

---

## 五、代码层改名清单

本次重构需要将代码中所有 `combat` / `encounter` 命名统一为 `tactical` / `archive`。以下是需要变更的完整清单。

### 5.1 文件/目录重命名

| 旧路径                        | 新路径                          |
| ----------------------------- | ------------------------------- |
| `src/combat/`                 | `src/tactical/`                 |
| `src/combat/combatUtils.ts`   | `src/tactical/tacticalUtils.ts` |
| `src/gm/EncounterPanel.tsx`   | `src/gm/ArchivePanel.tsx`       |
| `server/routes/combat.ts`     | `server/routes/tactical.ts`     |
| `server/routes/encounters.ts` | `server/routes/archives.ts`     |

> `src/combat/` 下的其他文件（KonvaMap、KonvaToken 等）名称不含 combat，搬到 `src/tactical/` 后无需重命名。

### 5.2 数据库 Schema（`server/schema.ts`）

| 旧名                                | 新名                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `encounters` 表                     | `archives`                                                                   |
| `combat_state` 表                   | `tactical_state`                                                             |
| `room_state.active_encounter_id` 列 | `room_state.active_archive_id`                                               |
| _(新增)_                            | `room_state.tactical_mode` 列（`INTEGER DEFAULT 0`，0=场景模式，1=战术模式） |

### 5.3 TypeScript 类型（`src/shared/entityTypes.ts` + `src/stores/worldStore.ts`）

| 旧名                      | 新名                      | 位置           |
| ------------------------- | ------------------------- | -------------- |
| `CombatInfo`              | `TacticalInfo`            | worldStore.ts  |
| `CombatState`             | `TacticalState`           | entityTypes.ts |
| `EncounterRecord`         | `ArchiveRecord`           | worldStore.ts  |
| `EncounterData`           | `ArchiveData`             | entityTypes.ts |
| `combatInfo` (store 字段) | `tacticalInfo`            | worldStore.ts  |
| `encounters` (store 字段) | `archives`                | worldStore.ts  |
| `normalizeCombatInfo()`   | `normalizeTacticalInfo()` | worldStore.ts  |

### 5.4 Store Actions（`worldStore.ts`）

| 旧方法名               | 新方法名               |
| ---------------------- | ---------------------- |
| `startCombat()`        | `enterTactical()`      |
| `endCombat()`          | `exitTactical()`       |
| `activateEncounter()`  | `loadArchive()`        |
| `saveEncounter()`      | `saveArchive()`        |
| `fetchEncounters()`    | `fetchArchives()`      |
| `createEncounter()`    | `createArchive()`      |
| `deleteEncounter()`    | `deleteArchive()`      |
| `updateEncounter()`    | `updateArchive()`      |
| `duplicateEncounter()` | `duplicateArchive()`   |
| `updateCombatGrid()`   | `updateTacticalGrid()` |
| `setCombatMapUrl()`    | `setTacticalMapUrl()`  |

### 5.5 REST API 路由

| 旧路径                                        | 新路径                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/rooms/:roomId/combat`               | `GET /api/rooms/:roomId/tactical`                                               |
| `PATCH /api/rooms/:roomId/combat`             | `PATCH /api/rooms/:roomId/tactical`                                             |
| `POST /api/rooms/:roomId/combat/start`        | `POST /api/rooms/:roomId/tactical/enter`（写 `room_state.tactical_mode`，广播） |
| `POST /api/rooms/:roomId/combat/end`          | `POST /api/rooms/:roomId/tactical/exit`（写 `room_state.tactical_mode`，广播）  |
| `POST /api/rooms/:roomId/combat/tokens`       | `POST /api/rooms/:roomId/tactical/tokens`                                       |
| `PATCH /api/rooms/:roomId/combat/tokens/:id`  | `PATCH /api/rooms/:roomId/tactical/tokens/:id`                                  |
| `DELETE /api/rooms/:roomId/combat/tokens/:id` | `DELETE /api/rooms/:roomId/tactical/tokens/:id`                                 |
| `GET .../scenes/:sceneId/encounters`          | `GET .../scenes/:sceneId/archives`                                              |
| `POST .../scenes/:sceneId/encounters`         | `POST .../scenes/:sceneId/archives`                                             |
| `PATCH .../encounters/:id`                    | `PATCH .../archives/:id`                                                        |
| `DELETE .../encounters/:id`                   | `DELETE .../archives/:id`                                                       |
| `POST .../encounters/:id/activate`            | `POST .../archives/:id/load`                                                    |
| `POST .../encounters/:id/save-snapshot`       | `POST .../archives/:id/save`                                                    |

### 5.6 Socket.io 事件名

| 旧事件名               | 新事件名                 |
| ---------------------- | ------------------------ |
| `combat:activated`     | `tactical:activated`     |
| `combat:updated`       | `tactical:updated`       |
| `combat:ended`         | `tactical:ended`         |
| `combat:token:added`   | `tactical:token:added`   |
| `combat:token:updated` | `tactical:token:updated` |
| `combat:token:removed` | `tactical:token:removed` |
| `encounter:created`    | `archive:created`        |
| `encounter:updated`    | `archive:updated`        |
| `encounter:deleted`    | `archive:deleted`        |

### 5.7 UI 状态（`uiStore.ts` + `GmSidebar.tsx`）

| 旧名                                        | 新名                                      |
| ------------------------------------------- | ----------------------------------------- |
| `GmSidebarTab = 'encounters' \| 'entities'` | `GmSidebarTab = 'archives' \| 'entities'` |
| `gmSidebarTab: 'encounters'` (默认值)       | `gmSidebarTab: 'archives'`                |
| GM 侧边栏标签 `'遭遇'`                      | `'存档'`                                  |

### 5.8 Tailwind 设计 token（`tailwind.config.ts`）

| 旧名              | 新名                | 用途             |
| ----------------- | ------------------- | ---------------- |
| `z-combat: '100'` | `z-tactical: '100'` | 战术地图层叠层级 |

> 对应 `TacticalPanel.tsx` 中的 `z-combat` → `z-tactical`。

### 5.9 路由注册（`server/index.ts`）

| 旧名                            | 新名                           |
| ------------------------------- | ------------------------------ |
| `import { combatRoutes }`       | `import { tacticalRoutes }`    |
| `import { encounterRoutes }`    | `import { archiveRoutes }`     |
| `app.use(encounterRoutes(...))` | `app.use(archiveRoutes(...))`  |
| `app.use(combatRoutes(...))`    | `app.use(tacticalRoutes(...))` |

## Assumptions

- 每个场景最多一个 tactical_state，1:1 关系不会扩展为 1:N
- 所有 Token 必须关联 Entity（无匿名 Token），简化数据流和权限模型
- Grid snap 计算在客户端完成，服务端不验证坐标合法性（信任客户端）
- 战术模式进出是全局状态（所有客户端同步），不支持 per-client 战术视图

## Edge Cases

- Entity 删除时 Token 通过 FK CASCADE 自动删除，无需手动清理
- Archive load 时 ephemeral Entity 的 original_entity_id 可能已不存在，需从 snapshot_data 重建
- 并发 Token 拖拽：awareness 事件可能交叉，GhostToken 显示以最后收到的位置为准
- 战术模式退出后 tactical_state 和 tokens 保留在数据库，不删除（下次进入时恢复）
