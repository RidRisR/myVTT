# 实体生命周期重设计

## 背景

Issue #184: `Entity.lifecycle` 字段（`'ephemeral' | 'reusable' | 'persistent'`）将三个独立关注点耦合在一个 enum 上：清理策略、场景亲和（自动链接）、存档策略。当实体从"角色"泛化为任意物品（tracker、能力、状态标记等）后，假设失效。

## 设计决策

### 核心变更：重新定义 lifecycle 值

```typescript
// 旧
type EntityLifecycle = 'ephemeral' | 'reusable' | 'persistent'

// 新
type EntityLifecycle = 'persistent' | 'tactical' | 'scene'
```

| 值           | 语义                   | 清理时机                           |
| ------------ | ---------------------- | ---------------------------------- |
| `persistent` | 长期实体，用户手动管理 | 用户显式删除或房间删除             |
| `tactical`   | 战术临时实体           | 战术清场、存档加载、场景删除时清理 |
| `scene`      | 场景级实体             | 场景删除时清理                     |

### 与旧值的对应关系

| 旧值         | 新值         | 说明                               |
| ------------ | ------------ | ---------------------------------- |
| `persistent` | `persistent` | 保留，但移除自动链接所有场景的行为 |
| `reusable`   | `persistent` | 合并，语义等同                     |
| `ephemeral`  | `tactical`   | 重命名，语义不变                   |
| （新增）     | `scene`      | 新增值                             |

无需数据迁移 — 没有正在运行的实例。直接替换类型定义和逻辑即可。

### 共享约束

`tactical` 和 `scene` 实体都保持**单场景约束** — 只能被链接到一个场景。

### 适用实体类型举例

| 实体类型             | lifecycle    | 说明                           |
| -------------------- | ------------ | ------------------------------ |
| PC 角色              | `persistent` | 用户创建和管理                 |
| 可复用 NPC           | `persistent` | 存在于实体库，可被放入多个场景 |
| Fear tracker         | `persistent` | 全局数据实体，用户/插件管理    |
| 战场临时标记         | `tactical`   | 战术清场时自动清理             |
| 场景级 NPC（一次性） | `scene`      | 场景删除时自动清理             |

## 行为变更

### 1. 移除：persistent 自动链接所有场景

**现状**：两个位置的对称行为。

- `entities.ts:112-121`：创建 `persistent` 实体时自动插入所有场景的 `scene_entities`
- `scenes.ts:50-59`：创建新场景时自动链接所有 `persistent` 实体

**变更**：两处都删除。场景关联由上层（未来的肖像栏插件等）通过 API 显式操作。

### 2. 移除：persistent 不可从场景移除

**现状** (`PortraitBar.tsx:471-480`)：`persistent` 实体的右键菜单不显示「移除」选项。

**变更**：移除此限制。自动链接已删除，persistent 实体的场景关联由用户手动管理，自然应允许移除。

### 3. 修改：战术清场孤儿清理

**现状** (`tactical.ts:178`, `archives.ts:275`)：

```sql
WHERE e.lifecycle = 'ephemeral'
  AND NOT EXISTS (SELECT 1 FROM scene_entities se WHERE se.entity_id = e.id)
```

**变更**：条件改为 `e.lifecycle = 'tactical'`，逻辑不变。

### 4. 修改：场景删除时的实体清理

**现状** (`scenes.ts:130-137`)：场景删除时只清理 `ephemeral` 实体。

**变更**：场景删除时清理 `scene` 和 `tactical` 两种类型的实体。

```sql
SELECT e.id FROM entities e
  JOIN scene_entities se ON se.entity_id = e.id
  WHERE se.scene_id = ? AND e.lifecycle IN ('scene', 'tactical')
```

同时清理该场景中仅有 tactical_token（无 scene_entities 链接）的 `tactical` 实体：

```sql
SELECT e.id FROM entities e
  JOIN tactical_tokens t ON t.entity_id = e.id
  WHERE t.scene_id = ? AND e.lifecycle = 'tactical'
    AND NOT EXISTS (SELECT 1 FROM scene_entities se WHERE se.entity_id = e.id)
```

删除后需为每个被清理的实体发送 `entity:deleted` Socket 事件。

### 5. 修改：单场景约束

**现状** (`scenes.ts:169-187`)：`ephemeral` 实体只能链接到一个场景。

**变更**：`tactical` 和 `scene` 实体都保持单场景约束。`persistent` 实体可链接多个场景。

```typescript
if (entity.lifecycle === 'tactical' || entity.lifecycle === 'scene') {
  // 单场景约束检查
}
```

### 6. 修改：场景取消链接时的清理

**现状** (`scenes.ts:207-230`)：取消链接 `ephemeral` 实体时，如果没有 tactical token 则删除实体。

**变更**：对 `tactical` 和 `scene` 实体执行相同逻辑。

```typescript
const shouldDeleteEntity =
  (entity.lifecycle === 'tactical' || entity.lifecycle === 'scene') && !hasTacticalToken
```

### 7. 修改：存档快照策略

**现状** (`archives.ts:172`, `archives.ts:311`)：`ephemeral` → 完整快照，其他 → 引用。

**变更**：`tactical` → 完整快照，其他 → 引用。逻辑映射直接替换。

### 8. 修改：右键菜单「保存为角色」

**现状** (`PortraitBar.tsx:462-469`)：`ephemeral` 实体可通过右键菜单升级为 `reusable`。

**变更**：`tactical` 和 `scene` 实体可升级为 `persistent`。

### 9. 修改：实体库过滤

**现状** (`CharacterLibraryTab.tsx:32`)：排除 `ephemeral` 实体。

**变更**：排除 `tactical` 和 `scene` 实体（它们不应出现在实体库中）。

### 10. 修改：实体库默认创建 lifecycle

**现状** (`CharacterLibraryTab.tsx:52`)：新建角色默认 `lifecycle: 'reusable'`。

**变更**：默认 `lifecycle: 'persistent'`。

### 11. 修改：NPC 快速创建 lifecycle

**现状** (`worldStore.ts:811`)：快速创建 NPC 默认 `lifecycle: 'ephemeral'`。

**变更**：默认 `lifecycle: 'tactical'`。

### 12. 修改：实体分组逻辑

**现状** (`entity-filtering.test.ts`)：按 `persistent` / 非 `persistent` 分组为 party / sceneNpcs / other。

**变更**：分组逻辑保持不变 — `persistent` 仍然是 party 的标志。但 party 不再隐含「在所有场景中」，只是表示长期实体。

### 13. 修改：UI 标签显示

**现状**：

- `CharacterLibraryTab.tsx:168-171`：显示「persistent」或「reusable」标签
- `EntityRow.tsx:105`：显示「persistent」标签

**变更**：标签映射到新值。`persistent` 保持不变。

### 14. 修改：Session 信息面板

**现状** (`SessionInfoPanel.tsx:6`)：只显示 `lifecycle === 'persistent'` 的实体。

**变更**：逻辑不变，值名不变。

## Schema 变更

### entities 表

```sql
-- CHECK 约束更新
lifecycle TEXT DEFAULT 'persistent' CHECK(lifecycle IN ('persistent', 'tactical', 'scene'))
```

### archive_tokens 表

```sql
-- CHECK 约束更新
snapshot_lifecycle TEXT NOT NULL CHECK(snapshot_lifecycle IN ('persistent', 'tactical', 'scene'))
```

`snapshot_lifecycle` 列直接使用新值，无需兼容旧值（无运行实例）。

## 类型变更

### `src/shared/entityTypes.ts`

```typescript
export type EntityLifecycle = 'persistent' | 'tactical' | 'scene'
```

## 完整影响范围

### 服务端

| 文件                        | 变更                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/schema.ts`          | entities 和 archive_tokens 的 CHECK 约束；entities 默认值改为 `'persistent'`；lifecycle 索引保留                                                                                               |
| `server/routes/entities.ts` | 移除 persistent 自动链接逻辑 (L112-121)；默认 lifecycle 改为 `'persistent'` (L85)                                                                                                              |
| `server/routes/scenes.ts`   | 移除场景创建时自动链接 persistent (L50-59)；场景删除清理 `scene` + `tactical` (L130-137)；单场景约束适用于 `tactical` + `scene` (L169-187)；取消链接清理适用于 `tactical` + `scene` (L207-230) |
| `server/routes/tactical.ts` | 孤儿清理条件 `ephemeral` → `tactical` (L178)                                                                                                                                                   |
| `server/routes/archives.ts` | 快照/引用判断 `ephemeral` → `tactical` (L172, L311)；孤儿清理 `ephemeral` → `tactical` (L275)；加载时恢复实体 lifecycle 为 `'tactical'` (L302)                                                 |

### 客户端

| 文件                                   | 变更                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/shared/entityTypes.ts`            | `EntityLifecycle` 类型定义                                                                                     |
| `src/stores/worldStore.ts`             | NPC 创建默认 `'ephemeral'` → `'tactical'` (L811)                                                               |
| `src/dock/CharacterLibraryTab.tsx`     | 库过滤排除 `tactical` + `scene` (L32)；默认创建改为 `'persistent'` (L52)；标签显示更新 (L168-171)              |
| `src/layout/PortraitBar.tsx`           | 「保存为角色」条件改为 `tactical` + `scene` → `persistent` (L462-469)；移除 persistent 不可移除限制 (L471-480) |
| `src/gm/EntityRow.tsx`                 | 标签显示更新 (L105)                                                                                            |
| `plugins/core-ui/SessionInfoPanel.tsx` | 无变更 — 已使用 `persistent`                                                                                   |

### 测试

| 文件                                                  | 变更                          |
| ----------------------------------------------------- | ----------------------------- |
| `src/__test-utils__/fixtures.ts`                      | 默认 lifecycle 更新 (L7)      |
| `src/gm/__tests__/entity-filtering.test.ts`           | 分组逻辑中的 lifecycle 值更新 |
| `server/__tests__/scenarios/entity-lifecycle.test.ts` | 全面更新测试用例              |

## 不在此次范围

| 议题                           | 原因                                         |
| ------------------------------ | -------------------------------------------- |
| PortraitBar 过滤（只显示角色） | UI 层问题，未来肖像栏插件化时解决            |
| 插件数据清理                   | 依赖插件管理体系，当前不存在                 |
| 存档系统重构                   | 独立议题，当前存档功能范围（纯战术快照）不变 |
| 插件命名空间强制               | 独立议题，需要插件沙箱基础设施               |
| 自动链接所有场景的替代方案     | 未来肖像栏插件负责，通过组件或 API 实现      |

## 风险

1. **自动链接移除后的用户体验** — 创建 PC 后不再自动出现在所有场景。短期需要用户手动关联，长期由肖像栏插件解决。
2. **scene 清理的跨场景影响** — `scene` 类型实体如果被链接到多个场景，删除任一场景会删除实体。这是 by design — 声明 `scene` 就意味着"我的生命跟随场景"。
