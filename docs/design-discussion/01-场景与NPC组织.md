# 议题 1: 场景定义 & NPC 组织模型

---

## 已达成共识

### 场景 = 叙事容器

场景不仅仅是"背景图+网格"，而是一个**叙事单元**，包含：

- 氛围背景（图片/视频）
- 场景内的角色引用（entityIds）
- 战斗地图配置（网格、token）
- 未来可能：场景笔记、音乐、handout 关联

### 新房间自动创建默认场景

当 GM 创建房间并首次进入时，系统应自动创建"场景 1"，避免空白状态。

### 设计哲学：快速创建 + 渐进丰富

GM 应该能以最少操作把东西放到舞台上，然后按需添加细节。系统不应要求用户在创建时做出架构层面的决策。

### 全局唯一 Entity 存储（无 scene.entities）

**核心决策：所有 Entity 统一存储在 entities（全局唯一数据源），场景只持有引用。**

**旧模型（废弃）：**

- entities（全局）+ scene.entities（场景局部）双存储
- 需要 promote 机制、两套 CRUD、两种数据结构

**新模型：**

- entities 是所有 Entity 的唯一存储
- 场景通过 entityIds 引用 Entity
- 无 scene.entities，无 promote

**决策理由：**

- 一套 CRUD、一种数据结构（嵌套 Y.Map）、一条代码路径
- 不需要 promote（所有 Entity 天生全局可引用）
- 删场景时的 GC（遍历清理无引用 Entity）是一次性简单实现，远低于双存储的持续维护成本
- 竞品验证：FVTT、Roll20 都使用全局 Actor 存储

**GC 策略（删场景时）：**

- 遍历所有其他场景的 entityIds，收集仍被引用的 Entity ID 集合
- 被删场景的 entityIds 中，不在上述集合内的非 PC Entity → 自动删除
- 不使用引用计数（分布式环境下有竞态风险），每次实时扫描
- 场景数量 < 100，遍历是微秒级操作

### 场景持有 Entity 引用列表

每个场景通过 `entityIds` 记录哪些 角色出现在本场景。

- PC 在场景创建时自动加入 entityIds
- 新 PC 加入房间时自动添加到所有已有场景的 entityIds
- GM 可以从任何场景移除任何 entityIds 条目（包括 PC）
- NPC 从 blueprint 创建时自动加入当前场景 entityIds

### Linked vs Unlinked（创建行为区别）

参考 FVTT 的 Actor + Token 模型：

- **Unlinked（默认）**：从 blueprint 创建 → 新 Entity（新 ID）→ 加入当前场景 entityIds
  - 例：放 5 个哥布林 = 5 个独立 Entity，各自 HP 独立
- **Linked**：选择已有 Entity → 加入当前场景 entityIds（不创建新的）
  - 例：兽人酋长在 3 个场景出现 = 同一个 Entity，哪里扣血都同步

底层存储完全相同，区别仅在于创建时是"新建"还是"复用已有"。

---

## 最终数据模型

```
blueprints: Y.Map<Blueprint>        ← 全局模板库（纯素材，不参与运行时）

entities: Y.Map<Y.Map>                ← 所有 Entity 的唯一存储
                                       每个 entity 是嵌套 Y.Map（字段级 CRDT）

scene: Y.Map
  ├── name, imageUrl, ...           ← 场景配置
  ├── entityIds: Y.Map<boolean>     ← 本场景引用的 角色 ID
  ├── tokens: Y.Map<MapToken>       ← 战斗棋子（token.entityId → Entity）
  └── gridSize, gridVisible, ...    ← 网格配置
```

### 在场实体的聚合逻辑

```
在场实体 = entities 中 ID 存在于 scene.entityIds 的角色
         → 经权限过滤后呈现
```

### 两个视图

- **Portrait Bar**：显示所有在场实体的头像列表
- **Token Layer**：显示 scene.tokens 中的棋子，每个 token 通过 entityId 引用 Entity

**找不到 Entity → 静默清理引用（entityIds 和 token）。**

### GM 操作流

```
从 blueprint 创建（unlinked） → entities 新建 Entity + 当前场景 entityIds 加引用
从已有 Entity 引入（linked） → 当前场景 entityIds 加引用（不新建）
编辑角色                     → 直接改 entities（一套 CRUD）
"保存为模板"                 → 将 Entity 数据回写到 blueprint
从场景移除角色               → 从 entityIds 删除引用
删除场景                     → entityIds + tokens cascade 消失
                               → GC 清理无引用的非 PC Entity
```

---

## 从 UI 出发的完整视图

```
准备区（场外）                         舞台（场上）
┌──────────────┐                    ┌──────────────────────────────┐
│ 图片素材库    │  ──放到场上──→     │                              │
│ (纯图片)     │  新建 Entity       │  Portrait Bar（视图1）        │
├──────────────┤  + 加 entityIds   │  = entityIds → entities 解析    │
│ 带数据模板   │  ──放到场上──→     │                              │
│ (blueprint)  │  新建 Entity       │  Token Layer（视图2）         │
├──────────────┤  + 加 entityIds   │  = tokens → entityId → entities │
│ 已有角色列表  │  ──放到场上──→     │                              │
│ (entities)     │  只加 entityIds    │  找不到 → 静默清理引用         │
└──────────────┘  (linked复用)     └──────────────────────────────┘
```

---

## 验证场景

### 场景 A：酒馆遭遇战

```
1. GM 创建场景1，PC 自动加入 entityIds
   → Portrait Bar 显示所有 PC

2. GM 从蓝图创建 5 个兽人（unlinked）
   → 5 个新 Entity 进入 entities
   → 5 个 ID 加入场景1 entityIds
   → Portrait Bar 增加 5 个兽人头像

3. 战斗结束，4 个兽人死了 → GM 删除 4 个 Entity
   → 从 entities 删除 + 从 entityIds 删除

4. 俘虏要带走 → 无需 promote，它已经在 entities 里了
   → 切到场景2 时，GM 选择"引入已有角色"（linked）
   → 加入场景2 entityIds
   → 编辑 HP → 直接改 Entity 数据，所有场景同步

5. 回到场景1
   → 俘虏在 entityIds 里 → 显示，HP 是最新值
```

### 场景 B：删除行为

```
- 俘虏从 entities 删除
  → 所有场景的 entityIds 中仍有该 ID，但解析时找不到 → 静默清理
  → 关联 token 也找不到实体 → 降级为无名棋子

- 删除场景1
  → entityIds cascade 消失
  → tokens cascade 消失
  → GC：检查场景1 entityIds 中的 Entity
    → 其他场景还引用的 → 保留
    → 无其他引用且非 PC → 从 entities 删除
```

### 场景 C：新 PC 加入

```
- 游戏进行中，新玩家加入并创建 PC
  → PC 加入 entities
  → 系统检测到新 PC → 自动添加到所有已有场景的 entityIds
  → 所有场景的 Portrait Bar 自动显示新 PC
```

---

## 已确认细节

### D2: Token 降级为无名棋子

Token 引用的实体被删除时，token **不会静默消失**，而是降级为无名棋子：

- 使用 token 自身的 `label`、`imageUrl`、`color` 独立显示
- GM 可手动删除或保留作为视觉标记
- 理由：地图上的棋子是"物理存在"，突然消失不符合直觉

### D3: Portrait Bar 分区显示

Portrait Bar 分为 **PC 区段** 和 **NPC 区段**：

- PC 区段始终展开
- NPC 区段可折叠
- 理由：分区让 GM 一眼区分 PC 和 NPC，折叠能力防止 NPC 过多时挤占空间

### D4: 场景的产品定位

场景 = **内容预设单元**（不是叙事必须切换的单位）。

- GM 可以一个场景走完全程（只切换背景），也可以精心划分多个场景
- 场景的核心价值：GM 提前准备好一套资源预设（背景、NPC、token 布局），开团时一键切换
- 场景内可以随时换背景（白天→夜晚），不需要切场景
- 素材库（图片、模板）是**全局资源**，不按场景划分，用标签组织更灵活

### D5: 战斗模式 → 场景内部状态

战斗是场景内部的开关，不是房间级别的模式切换。

**旧模型（废弃）：**

```
room.mode: 'scene' | 'combat'     ← 房间级别
room.combatSceneId: string         ← 可能和 activeSceneId 不同
```

**新模型：**

```
room.activeSceneId: string         ← 当前场景（唯一的房间级状态）

scene:
  ├── imageUrl                     ← 叙事背景
  ├── combatActive: boolean        ← 是否正在战斗
  ├── battleMapUrl?: string        ← 战斗地图（可选，与叙事背景不同时使用）
  ├── entityIds, tokens, grid...
```

- 进入战斗：`combatActive = true` → 显示战斗地图 + 网格 + token
- 结束战斗：`combatActive = false` → 回到叙事背景，token 数据保留
- 切到另一个场景 → 那个场景有自己的 combatActive
- 切回来 → 战斗状态还在
- `room.mode` 和 `room.combatSceneId` 废弃

### D6: 场景切换时的继承规则

**场景私有（不继承）：**

| 数据                   | 说明                               |
| ---------------------- | ---------------------------------- |
| entityIds              | 每个场景有自己的 entities 引用列表 |
| tokens                 | 每个场景有自己的棋子布局           |
| 背景/网格/combatActive | 每个场景独立                       |

**全局共享（自动继承）：**

| 数据     | 说明                           |
| -------- | ------------------------------ |
| 角色数据 | HP、状态等始终最新，不跟场景走 |
| chat log | 全局聊天记录                   |
| seats    | 座位/身份                      |

### D7: 场景重置（快照机制）

GM 准备好场景后可以"保存预设"，session 结束后"恢复预设"。

```
scene:
  ├── ...当前实时数据...
  └── snapshot?: {entityIds, tokens, config}
```

- 快照内容：entityIds、tokens、场景配置
- 不含 Entity 数据（全局的，不属于场景快照）
- 优先级不高，但数据结构预留空间

---

## 本议题状态：✅ 已完成（v2 — 全局唯一 Entity 存储）

v1 决策（roster + scene.entities 双存储）已被**全局唯一 entities 存储**替代。

核心变更：

- 删除 scene.entities 概念
- 所有 Entity 统一存储在 entities
- 删除 promote 机制
- 新增删场景时的 GC（遍历清理无引用 Entity）
- 新增 linked/unlinked 创建模式（从竞品 FVTT 验证）
