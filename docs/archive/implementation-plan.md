# 数据结构适配 — 实施计划

> 基于设计讨论（议题 1-6）的所有决策，将现有代码适配到新架构。

---

## 分支策略

**所有合并必须使用 squash merge，禁止 merge commit。**

```
main (受保护，不直接合入)
  └── dev/entity-refactor (开发主线，从 main 创建)
        ├── phase1-core-data      → squash 合入 dev/entity-refactor
        ├── phase2a-creation-flow → squash 合入 dev/entity-refactor
        ├── phase2b-gc-persistent → squash 合入 dev/entity-refactor
        ├── phase3-ui             → squash 合入 dev/entity-refactor
        └── phase4-tests-cleanup  → squash 合入 dev/entity-refactor
  ← 全部完成 + 测试通过后，dev/entity-refactor squash 合入 main
```

**工作流：**

1. 从 main 创建 `dev/entity-refactor` 分支
2. 每个 Phase 从 `dev/entity-refactor` 创建 worktree + feature 分支
3. feature 分支通过 PR squash 合入 `dev/entity-refactor`
4. 所有 Phase 完成后，`dev/entity-refactor` 通过 PR squash 合入 `main`

---

## 现状 → 目标 差距总览

| 维度         | 现状                                | 目标                                         | 涉及文件                    |
| ------------ | ----------------------------------- | -------------------------------------------- | --------------------------- |
| Entity 存储  | `roster` + `scene.entities` 双源    | 全局 `entities` 唯一源                       | useWorld, useEntities       |
| Entity 字段  | 无 persistent                       | 加 `persistent: boolean`                     | entityTypes                 |
| 场景引用     | `scene.entities` 存完整对象         | `scene.entityIds` 存引用                     | useScenes, useEntities      |
| 战斗模式     | `room.mode` + `room.combatSceneId`  | `scene.combatActive` + `scene.battleMapUrl?` | useRoom, useScenes          |
| Token 可见性 | `gmOnly: boolean`                   | `permissions: EntityPermissions`             | entityTypes, useSceneTokens |
| Y.Map 命名   | `roster`                            | `entities`                                   | useWorld                    |
| 废弃操作     | `addSceneEntity`, `promoteToRoster` | 删除                                         | useEntities                 |

---

## Phase 1: 核心数据层重构

> 一个 PR。Layer 0（类型）+ Layer 1（hooks）必须一起做，否则编译不过。

### 1.1 类型定义 — `src/shared/entityTypes.ts`

```typescript
// Entity: 新增 persistent
interface Entity {
  // ... 现有字段不变
  persistent: boolean // ← 新增
}

// MapToken: gmOnly → permissions
interface MapToken {
  id: string
  entityId?: string
  x: number
  y: number
  size: number
  permissions: EntityPermissions // ← 替换 gmOnly
  label?: string
  imageUrl?: string
  color?: string
}
```

**改动清单：**

- Entity 接口加 `persistent: boolean`
- MapToken 接口删 `gmOnly: boolean`，加 `permissions: EntityPermissions`

### 1.2 WorldMaps — `src/yjs/useWorld.ts`

```typescript
// roster → entities
interface WorldMaps {
  scenes: Y.Map<Y.Map<unknown>>
  entities: Y.Map<Y.Map<unknown>> // ← 重命名
  blueprints: Y.Map<unknown>
  seats: Y.Map<unknown>
  room: Y.Map<unknown>
}

function createWorldMaps(yDoc: Y.Doc): WorldMaps {
  return {
    scenes: yDoc.getMap('scenes'),
    entities: yDoc.getMap('entities'), // ← 新 key
    blueprints: yDoc.getMap('blueprints'),
    seats: yDoc.getMap('seats'),
    room: yDoc.getMap('room'),
  }
}
```

**改动清单：**

- WorldMaps 接口 `roster` → `entities`
- createWorldMaps 中 `yDoc.getMap('roster')` → `yDoc.getMap('entities')`

**注意：** 这改了 Y.Doc 的 top-level key，已有 LevelDB 数据中的 `roster` 不会自动迁移。见 Phase 4 数据迁移。

### 1.3 Scene 扩展 — `src/yjs/useScenes.ts`

```typescript
interface Scene {
  // ... 现有字段不变
  combatActive: boolean // ← 新增
  battleMapUrl: string // ← 新增（空字符串 = 使用 imageUrl）
}
```

**改动清单：**

- Scene 接口加 `combatActive: boolean`、`battleMapUrl: string`
- `readScenes()` 读取这两个新字段（默认 false / ''）
- `addScene()` 中：
  - 写入 `combatActive: false`、`battleMapUrl: ''`
  - 创建 `entityIds` Y.Map（替代 `entities` Y.Map）
  - 保留 `tokens` Y.Map
  - **删除** `sceneMap.set('entities', new Y.Map())`
- `addScene()` 增加参数：接受要初始加入的 persistent entity IDs
- 新增 `addEntityToScene(sceneId, entityId)` / `removeEntityFromScene(sceneId, entityId)`
- 新增 `getSceneEntityIds(sceneId): string[]`
- 新增 `setCombatActive(sceneId, active: boolean)`

### 1.4 useRoom 简化 — `src/yjs/useRoom.ts`

```typescript
interface RoomState {
  activeSceneId: string | null // ← 保留
  // mode: 废弃（战斗状态移到 scene.combatActive）
  // combatSceneId: 废弃
}
```

**改动清单：**

- RoomState 删 `mode`、`combatSceneId`
- 删除 `setMode`、`setCombatScene`、`enterCombat`、`exitCombat`
- 只保留 `setActiveScene`
- 战斗模式相关操作移到 useScenes

### 1.5 useEntities 单源重构 — `src/entities/useEntities.ts`

这是最大的改动。从双源（roster + scene.entities）变为单源（entities-only）。

**改动清单：**

- 构造参数：`world.roster` → `world.entities`
- `rebuild()`：只从 `world.entities` 读取，删除 scene.entities 分支
- **删除** `addSceneEntity()`
- **删除** `promoteToRoster()`
- `addRosterEntity()` → 重命名为 `addEntity()`
  - 写入 `persistent` 字段
- `updateEntity()`：删除 scene.entities 分支，只操作 world.entities
- `deleteEntity()`：删除 scene.entities 分支，只操作 world.entities
- 新增：`addEntity()` 时自动将 entityId 加入指定场景的 entityIds
- observe 逻辑简化：只 observeDeep world.entities

**预计行数变化：** 310 行 → ~180 行（大幅简化）

### 1.6 useSceneTokens 适配 — `src/combat/useSceneTokens.ts`

**改动清单：**

- `addToken()`：token 默认 permissions 为 `defaultNPCPermissions()`（替代 `gmOnly: false`）
- 类型更新跟随 MapToken 变更
- 其余逻辑不变（tokens 仍然是 plain objects in Y.Map）

### 1.7 permissions 适配 — `src/shared/permissions.ts`

**改动清单：**

- `canSee` / `canEdit` 参数从 `Entity` 改为 `EntityPermissions`（或新增接受 permissions 的重载）
- 这样 Token（无 Entity）也能用同一套函数
- 新增 `getEffectivePermissions(token, getEntity)`: 有 entityId 返回 Entity permissions，否则返回 Token 自身 permissions

### 1.8 全局引用更新

所有引用 `world.roster` 的地方改为 `world.entities`。搜索 `world.roster` 和 `roster` 确认所有引用点：

- `src/App.tsx`
- `src/dock/BottomDock.tsx`（createEntityFromBlueprint 等）
- `src/layout/PortraitBar.tsx`
- 测试文件

所有引用 `gmOnly` 的地方改为 `permissions`：

- `src/dock/BottomDock.tsx`（toggle visibility）
- `src/combat/MapToken.tsx`（视觉样式）
- `src/combat/TokenLayer.tsx`（过滤逻辑）
- 测试文件

---

## Phase 2: 业务逻辑

> 可拆为 2 个 PR。依赖 Phase 1 完成。

### 2.1 Entity 创建流程统一 (PR A)

**改动文件：** BottomDock.tsx, App.tsx, ContextMenu 相关

- 所有 NPC 创建统一走：`addEntity()` + `addEntityToScene(currentSceneId, entityId)`
- PC 创建：`addEntity({ persistent: true })` → 自动加入所有已有场景
- 从 blueprint 创建（unlinked）：新 Entity + 当前场景 entityIds
- 删除 blueprint 时不需要清理（blueprint 和 entity 已解耦）

### 2.2 权限判断统一 (PR A)

**改动文件：** TokenLayer.tsx, PortraitBar.tsx, combatUtils.ts

- TokenLayer 过滤：`canSee(getEffectivePermissions(token, getEntity), seatId, role)`
- PortraitBar 过滤：entityIds → entities 解析 → `canSee(entity.permissions, seatId, role)`
- canDragToken：使用统一 permissions

### 2.3 GC — 删场景时清理 (PR B)

**改动文件：** useScenes.ts 或新建 `src/entities/entityGC.ts`

```typescript
function gcEntitiesOnSceneDelete(
  deletedSceneEntityIds: string[],
  allScenes: Map<string, string[]>, // 其他场景的 entityIds
  entities: Y.Map,
): string[] {
  // 收集仍被引用的 ID
  const referenced = new Set<string>()
  for (const ids of allScenes.values()) {
    ids.forEach((id) => referenced.add(id))
  }
  // 删除无引用 + 非 persistent 的 Entity
  const deleted: string[] = []
  for (const id of deletedSceneEntityIds) {
    if (!referenced.has(id)) {
      const entity = readEntity(entities.get(id))
      if (entity && !entity.persistent) {
        entities.delete(id)
        deleted.push(id)
      }
    }
  }
  return deleted
}
```

- 在 `deleteScene()` 中调用
- 遍历所有其他场景的 entityIds（< 100 场景，微秒级）
- persistent Entity 永远不被 GC

### 2.4 persistent 自动加入逻辑 (PR B)

**改动文件：** useScenes.ts, useEntities.ts

- `addScene()` 时：遍历 entities，将所有 `persistent: true` 的 Entity 加入新场景 entityIds
- `addEntity({ persistent: true })` 时：遍历所有场景，将 entityId 加入每个场景的 entityIds
- Entity 的 persistent 从 false 改为 true 时：遍历所有场景加入

---

## Phase 3: UI 适配

> 可拆为 2 个 PR。依赖 Phase 2 完成。

### 3.1 主要 UI (PR C)

**PortraitBar（`src/layout/PortraitBar.tsx`）：**

- 输入数据源变化：不再接收所有 entities，而是接收"当前场景的 entityIds → 解析后的 Entity 列表"
- PC/NPC 分区：用 `persistent` 标记区分（而非当前的 seats owner 检查）
- 可见性：统一用 `canSee(entity.permissions, ...)`

**TokenLayer（`src/combat/TokenLayer.tsx`）：**

- 过滤逻辑：`if (gmOnly) return false` → 使用 `getEffectivePermissions()` + `canSee()`
- Token 视觉样式（MapToken.tsx）：`gmOnly` 的虚线/半透明效果改为基于 permissions.default === 'none'

**BottomDock（`src/dock/BottomDock.tsx`）：**

- 删除 "Toggle visibility" 按钮的 gmOnly 逻辑
- 替换为 permissions 切换（none ↔ observer）
- 创建 token 时用 `permissions: defaultNPCPermissions()` 替代 `gmOnly: false`

### 3.2 战斗模式切换 (PR D)

**GmToolbar（`src/gm/GmToolbar.tsx`）：**

- 战斗按钮：不再调 `enterCombat()` / `exitCombat()`
- 改为调 `setCombatActive(currentSceneId, true/false)`

**App.tsx：**

- 删除 `room.mode` / `room.combatSceneId` 的使用
- 判断战斗模式：`currentScene.combatActive`
- CombatViewer 的 sceneId：直接用 `activeSceneId`（不再有独立 combatSceneId）

**SceneViewer / CombatViewer：**

- 根据 `scene.combatActive` 决定渲染哪个
- 战斗地图：`scene.battleMapUrl || scene.imageUrl`

---

## Phase 4: 测试 & 清理

> 一个 PR。依赖所有前置 Phase 完成。

### 4.1 测试更新

**需要更新的测试文件：**

- `src/entities/__tests__/useEntities.test.ts` — 删除双源测试、promote 测试
- `src/entities/__tests__/useEntities.sync.test.ts` — 适配单源
- `src/yjs/__tests__/useScenes.test.ts` — 新增 entityIds、combatActive 测试
- `src/yjs/__tests__/useRoom.test.ts` — 简化，删除 mode/combatSceneId
- `src/combat/__tests__/useSceneTokens.sync.test.ts` — 适配 permissions
- `src/shared/__tests__/permissions.test.ts` — 适配新函数签名
- `src/__test-utils__/fixtures.ts` — 更新 token fixture（gmOnly → permissions）

**新增测试：**

- GC 逻辑测试
- persistent 自动加入测试
- getEffectivePermissions 测试

### 4.2 废弃代码清理

- 删除 `addSceneEntity()`
- 删除 `promoteToRoster()`
- 删除 `EntityWithSource` 类型和 `_source` 字段
- 删除 `room.mode`、`room.combatSceneId` 相关代码
- 删除所有 `gmOnly` 引用

### 4.3 LevelDB 数据迁移

**问题：** `yDoc.getMap('roster')` → `yDoc.getMap('entities')` 改了 top-level key。已有持久化数据仍在 `roster` 下。

**方案 A（推荐）：** 服务端启动时迁移

```javascript
// server/index.mjs 启动时
const roster = yDoc.getMap('roster')
const entities = yDoc.getMap('entities')
if (roster.size > 0 && entities.size === 0) {
  yDoc.transact(() => {
    roster.forEach((val, key) => entities.set(key, val))
    // 不删 roster，保持兼容
  })
}
```

**方案 B：** 清空 LevelDB 重新开始（开发阶段可接受）

---

## 执行顺序 & 并行性

```
Phase 1 (一个 PR)
├── 1.1 entityTypes.ts          ─┐
├── 1.2 useWorld.ts             ─┤ 全部并行改动
├── 1.3 useScenes.ts            ─┤ 但必须一起提交
├── 1.4 useRoom.ts              ─┤ （编译依赖）
├── 1.5 useEntities.ts          ─┤
├── 1.6 useSceneTokens.ts       ─┤
├── 1.7 permissions.ts          ─┤
└── 1.8 全局引用更新             ─┘

Phase 2 (1-2 个 PR，依赖 Phase 1)
├── PR A: 2.1 创建流程 + 2.2 权限统一   ← 核心功能
└── PR B: 2.3 GC + 2.4 persistent       ← 增强功能

Phase 3 (1-2 个 PR，依赖 Phase 2)
├── PR C: 3.1 PortraitBar + TokenLayer + BottomDock
└── PR D: 3.2 战斗模式切换

Phase 4 (一个 PR，依赖 Phase 3)
└── 4.1 测试 + 4.2 清理 + 4.3 迁移
```

**总计 PR 数：** 4-6 个（取决于是否拆分 Phase 2 和 3）

**预估改动文件数：** ~20 个

**风险点：**

1. Phase 1 体量大（~10 文件同时改），但无法拆分
2. LevelDB 数据迁移需要在 Phase 1 合并后立即处理
3. 测试在 Phase 1 后会大面积失败，Phase 4 集中修复

---

## 不在本次范围内

以下功能已在设计讨论中确认，但**不在本次实施计划中**：

- 场景重置 / 快照机制（优先级低）
- 素材库标签系统（等素材量增长）
- Linked 放置 UI（延后设计）
- Initiative 系统（延后）
- 权限修改 UI（实现时再设计）
- "保存为模板"功能（依赖创建流程完成后再做）
