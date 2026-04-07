# Phase 4: Entity.components 全量迁移

## 目标

将 `Entity.ruleData: unknown` 和预定义字段（name/imageUrl/color/width/height/notes）统一迁移到 `Entity.components: Record<string, unknown>` 模型。所有数据通过 `namespace:key` 格式的组件键访问。

## 当前状态

```typescript
// 当前 Entity 类型
interface Entity {
  id: string
  name: string // 预定义
  imageUrl: string // 预定义
  color: string // 预定义
  width: number // 预定义
  height: number // 预定义
  notes: string // 预定义
  blueprintId?: string
  ruleData: unknown // 插件数据（DHRuleData 等）
  permissions: EntityPermissions
  lifecycle: EntityLifecycle
}
```

## 目标状态

```typescript
// 目标 Entity 类型
interface Entity {
  id: string
  blueprintId?: string
  permissions: EntityPermissions
  lifecycle: EntityLifecycle
  tags: string[] // 资产库分类，junction 表 entity_tags
  components: Record<string, unknown>
}
```

## 组件键映射

| 原字段                            | 组件键                   | 内容                                                |
| --------------------------------- | ------------------------ | --------------------------------------------------- |
| name, imageUrl, color             | `core:identity`          | `{ name: string, imageUrl: string, color: string }` |
| width, height                     | `core:token`             | `{ width: number, height: number }`                 |
| notes                             | `core:notes`             | `{ text: string }`                                  |
| ruleData.hp, ruleData.stress, ... | `daggerheart:health`     | `{ current: number, max: number }`                  |
| ruleData.agility, ...             | `daggerheart:attributes` | `{ agility: number, ... }`                          |
| （其他插件数据）                  | `pluginId:key`           | 各插件自定义                                        |

## 影响范围

### 类型 & Schema

- `src/shared/entityTypes.ts` — Entity、Blueprint 类型定义
- `server/schema.ts` — entities 表结构、entity_components 新表、entity_tags 新表

### 服务端路由

- `server/routes/entities.ts` — CRUD，ruleData deep merge → components UPSERT
- `server/routes/blueprints.ts` — defaults.ruleData → defaults.components
- `server/routes/archives.ts` — snapshot_data 格式
- `server/routes/scenes.ts` — entity 链接逻辑
- `server/tagHelpers.ts` — syncTags() 扩展支持 entity_tags

### 客户端

- `src/stores/worldStore.ts` — entity actions、Socket.io listeners
- `src/data/dataReader.ts` — ruleData → components 查找
- `src/data/hooks.ts` — useComponent 读取路径

### 共享层（删除）

- `src/shared/entityAdapters.ts` — getEntityResources/Attributes/Statuses + updateRuleDataField
  - 文件注释已标注 "Temporary adapters — will be deleted when all callers migrate to plugin.adapters.\*"
  - 本次迁移中删除，所有调用者改用插件 adapters 或 coreComponents 便捷函数

### 插件系统

- `plugins/daggerheart/adapters.ts` — `entity.ruleData as DHRuleData` → components 读取
- `plugins/daggerheart/types.ts` — DHRuleData 拆分
- `plugins/daggerheart-core/rollSteps.ts` — workflow 步骤

### UI 组件（读取/构造 Entity）

- `src/layout/CharacterDetailPanel.tsx` — name, imageUrl, color, notes
- `src/layout/MyCharacterCard.tsx` — entity.imageUrl, entity.color, entity.name
- `src/layout/CharacterEditPanel.tsx` — 编辑 entity 字段（调用 updateRuleDataField → 改用插件 adapters）
- `src/layout/CharacterHoverPreview.tsx` — 通过 entityAdapters 访问 ruleData
- `src/dock/CharacterLibraryTab.tsx` — name, imageUrl, color, lifecycle；**构造 Entity 对象**
- `src/gm/EntityPanel.tsx` — name, lifecycle；**构造 Entity 对象**
- `src/gm/EntityRow.tsx` — name, color, imageUrl
- `src/layout/PortraitBar.tsx` — 通过 adapters 间接访问；**构造 Entity 对象**

### 测试

- `src/__test-utils__/fixtures.ts` — makeEntity() 和 makeBlueprint() 使用旧格式（**必须在 4a 同步更新**）
- `server/__tests__/routes.test.ts` — Entity CRUD
- `server/__tests__/scenarios/archive-round-trip.test.ts` — Archive 快照
- `src/stores/__tests__/worldStore.test.ts` — Store actions
- `plugins/daggerheart/__tests__/adapters.test.ts` — 插件 adapters
- `src/data/__tests__/dataReader.test.ts` — dataReader 测试

---

## 执行步骤

### 4a. 类型变更 + fixtures

**文件：** `src/shared/entityTypes.ts`

```typescript
// Entity 删除所有预定义字段和 ruleData
// 添加 components: Record<string, unknown>
export interface Entity {
  id: string
  blueprintId?: string
  permissions: EntityPermissions
  lifecycle: EntityLifecycle
  tags: string[] // 资产库分类（reusable/persistent 用），junction 表 entity_tags
  components: Record<string, unknown>
}

// Blueprint 也统一到 components 模型
// name/imageUrl 不再是顶层字段，而是存在 defaults.components['core:identity'] 中
export interface Blueprint {
  id: string
  tags: string[]
  defaults: {
    components: Record<string, unknown> // 包含 core:identity（name/imageUrl/color）等
  }
  createdAt: number
}
```

**新增文件：** `src/shared/coreComponents.ts`

- 定义 core 组件类型和便捷访问函数

```typescript
export interface CoreIdentity {
  name: string
  imageUrl: string
  color: string
}
export interface CoreToken {
  width: number
  height: number
}
export interface CoreNotes {
  text: string
}

// 默认值
export const DEFAULT_IDENTITY: CoreIdentity = { name: '', imageUrl: '', color: '#888888' }
export const DEFAULT_TOKEN: CoreToken = { width: 1, height: 1 }
export const DEFAULT_NOTES: CoreNotes = { text: '' }

// 便捷访问函数（避免每个调用点都写类型断言）
export function getIdentity(entity: Entity): CoreIdentity {
  return (entity.components['core:identity'] as CoreIdentity) ?? DEFAULT_IDENTITY
}
export function getToken(entity: Entity): CoreToken {
  return (entity.components['core:token'] as CoreToken) ?? DEFAULT_TOKEN
}
export function getNotes(entity: Entity): CoreNotes {
  return (entity.components['core:notes'] as CoreNotes) ?? DEFAULT_NOTES
}
export function getName(entity: Entity): string {
  return getIdentity(entity).name
}
export function getColor(entity: Entity): string {
  return getIdentity(entity).color
}
export function getImageUrl(entity: Entity): string {
  return getIdentity(entity).imageUrl
}
```

**文件：** `src/__test-utils__/fixtures.ts`

- `makeEntity()` — 改为 `{ id, tags: [], components: { 'core:identity': {...}, 'core:token': {...}, 'core:notes': {...} }, permissions, lifecycle }`
- `makeBlueprint()` — 改为 `{ id, tags: [], defaults: { components: {...} }, createdAt }`

**操作：** 修改 Entity/Blueprint 类型 + fixtures 后跟随编译错误修复。

**验证：** `tsc --noEmit`（预期大量编译错误，后续步骤逐步修复）

---

### 4b. 数据库 Schema

**文件：** `server/schema.ts`

```sql
-- entities 表瘦身
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  blueprint_id TEXT REFERENCES blueprints(id) ON DELETE SET NULL,
  permissions TEXT DEFAULT '{"default":"none","seats":{}}',
  lifecycle TEXT DEFAULT 'ephemeral' CHECK(lifecycle IN ('ephemeral','reusable','persistent'))
);

-- 新增 entity_components 表
CREATE TABLE IF NOT EXISTS entity_components (
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  component_key TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (entity_id, component_key)
);
CREATE INDEX IF NOT EXISTS idx_entity_components_entity ON entity_components(entity_id);

-- 新增 entity_tags junction 表（同 blueprint_tags / asset_tags 模式）
CREATE TABLE IF NOT EXISTS entity_tags (
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag_id);

-- blueprints 表瘦身（name/image_url 移入 defaults.components['core:identity']）
CREATE TABLE IF NOT EXISTS blueprints (
  id TEXT PRIMARY KEY,
  defaults TEXT DEFAULT '{"components":{}}',
  created_at INTEGER NOT NULL
);
```

**文件：** `server/tagHelpers.ts`

- `syncTags()` 的 `junctionTable` 参数扩展：`'asset_tags' | 'blueprint_tags' | 'entity_tags'`
- `fkColumn` 参数扩展：`'asset_id' | 'blueprint_id' | 'entity_id'`

**验证：** 服务端启动不报错

---

### 4c. 服务端路由 + Blueprint/Archive 格式迁移

**文件：** `server/routes/entities.ts`

- `GET /entities` — JOIN entity_components + entity_tags，组装 components 对象和 tags 数组
- `POST /entities` — INSERT entities + INSERT entity_components（每个组件键一行）+ syncTags
- `PATCH /entities/:id` — body: `{ components?: Record<string, unknown>, permissions?, lifecycle?, tags? }`；UPSERT entity_components（仅更新传入的组件）
- `DELETE /entities/:id` — CASCADE 自动删除 components 和 tags

**新增路由：** `PATCH /entities/:id/components/:key` — 单组件 UPSERT（ctx.updateComponent 的底层）

```typescript
// 组装 entity 从数据库行
function assembleEntity(entityRow, componentRows, tagRows): Entity {
  const components: Record<string, unknown> = {}
  for (const row of componentRows) {
    components[row.component_key] = JSON.parse(row.data)
  }
  const tags = tagRows.map((r) => r.name)
  return {
    id: entityRow.id,
    blueprintId: entityRow.blueprint_id,
    permissions: JSON.parse(entityRow.permissions),
    lifecycle: entityRow.lifecycle,
    tags,
    components,
  }
}
```

**文件：** `server/routes/blueprints.ts`

- `defaults` JSON 格式从 `{ color, width, height, ruleData }` → `{ components: { ... } }`
- Blueprint 创建/更新路由同步修改

**文件：** `server/routes/archives.ts`

- `snapshot_data` 格式：`{ components: { ... }, permissions: { ... } }`（不再有 name/imageUrl/color 等独立字段）
- Save: 从 entity + entity_components 组装 snapshot
- Load: 从 snapshot 恢复 entity + entity_components

**Socket.io `entity:updated` 事件：** 发送完整 Entity 对象（含 assembled components）

**验证：** `pnpm test` 中服务端测试通过

---

### 4d. Store 更新

**文件：** `src/stores/worldStore.ts`

- `createEphemeralNpcInScene()` — 构造 entity 使用 components 格式
- `saveEntityAsBlueprint()` — 提取 components 写入 blueprint defaults
- Socket.io listeners (`entity:created`, `entity:updated`) — 接收新格式 Entity
- `updateEntity()` — API 调用改为发送 `{ components: {...}, permissions?, lifecycle?, tags? }`

**验证：** Store 测试通过

---

### 4f. 插件全量迁移 + entityAdapters 删除

**删除文件：** `src/shared/entityAdapters.ts`

- 所有调用者迁移到插件 adapters（plugin.adapters.\*）或 coreComponents 便捷函数
- `getEntityResources()` → 插件 `dhGetResources(entity)`
- `getEntityAttributes()` → 插件 `dhGetAttributes(entity)`
- `getEntityStatuses()` → 插件 `dhGetStatuses(entity)`
- `updateRuleDataField()` → `ctx.updateComponent()` 或直接构造 components patch

**Daggerheart 插件改动：**

`plugins/daggerheart/types.ts`：

```typescript
// DHRuleData 拆分为独立组件类型
export interface DHHealth {
  current: number
  max: number
}
export interface DHStress {
  current: number
  max: number
}
export interface DHAttributes {
  agility: number
  strength: number
  finesse: number
  instinct: number
  presence: number
  knowledge: number
}
export interface DHMeta {
  tier: 1 | 2 | 3 | 4
  proficiency: number
  className: string
  ancestry: string
}
```

`plugins/daggerheart/adapters.ts`：

```typescript
// entity.ruleData as DHRuleData → entity.components['daggerheart:health'] as DHHealth
export function dhGetMainResource(entity: Entity): ResourceView | null {
  const hp = entity.components['daggerheart:health'] as DHHealth | undefined
  if (!hp) return null
  return { label: 'HP', current: hp.current, max: hp.max, color: '#ef4444' }
}
```

**其他插件文件** — 同模式替换

**验证：** 插件测试通过

---

### 4g. UI 组件迁移

**字段读取迁移：** 所有 `entity.name` → `getName(entity)` 或 `getIdentity(entity).name`

**Entity 构造站点迁移：** 构造 Entity 对象改用 components 格式

主要文件：

- `CharacterDetailPanel.tsx` — name, imageUrl, color, notes 读取
- `MyCharacterCard.tsx` — imageUrl, color, name 读取
- `CharacterEditPanel.tsx` — 编辑字段（updateRuleDataField → 插件 adapters / updateComponent）
- `CharacterHoverPreview.tsx` — entityAdapters → 插件 adapters
- `CharacterLibraryTab.tsx` — name, imageUrl, color 读取；**Entity 构造改为 components 格式**
- `EntityPanel.tsx` — name 读取；**Entity 构造改为 components 格式**
- `EntityRow.tsx` — name, color, imageUrl 读取
- `PortraitBar.tsx` — 通过 adapters 间接（adapters 已在 4f 修复）；**Entity 构造改为 components 格式**

**验证：** `tsc --noEmit && pnpm test`

---

### 4h. Data layer 更新

**文件：** `src/data/dataReader.ts`、`src/data/hooks.ts`

- `ruleData[key]` → `entity.components[key]`
- `query({ has: [...] })` — filter by `components` key presence

**文件：** `src/data/__tests__/dataReader.test.ts`

- `makeEntity()` 调用更新为 components 格式
- component() 测试改为从 components 读取

**文件：** `src/workflow/context.ts`

- `updateComponent` 临时实现从 ruleData 改为 components

**验证：** dataReader 测试 + workflow 测试通过

---

## 执行策略

整个 Phase 4 作为一个大变更执行。中间步骤不要求可编译/运行，最终验证点是全部完成后 `pnpm check && pnpm test`。

| 步骤                                      | 依赖    | 说明                          |
| ----------------------------------------- | ------- | ----------------------------- |
| 4a（类型 + coreComponents + fixtures）    | 无      | 改完后 tsc 报大量错误是预期的 |
| 4b（数据库 schema + tagHelpers）          | 4a      | 服务端表结构                  |
| 4c（服务端路由 + blueprint/archive 格式） | 4a + 4b | 合并原 4c + 4e                |
| 4d（store 更新）                          | 4a + 4c | 客户端 store                  |
| 4f（插件迁移 + entityAdapters 删除）      | 4a      | 插件层                        |
| 4g（UI 组件迁移）                         | 4a + 4f | UI 层（含 Entity 构造站点）   |
| 4h（data layer 更新）                     | 4a      | 数据读取层                    |

**执行顺序：** 4a → 4h → 4f → 4g → 4b → 4c → 4d

理由：先改类型、data layer、插件、UI（纯客户端，模式单一），最后改服务端（schema + 路由 + store 联动），减少中间不一致的调试成本。

**最终验证：** `pnpm check && pnpm test`

## API 契约变化

### PATCH /entities/:id（通用更新）

```typescript
// 旧 body
{ name?: string, color?: string, ruleData?: unknown, ... }

// 新 body
{ components?: Record<string, unknown>, permissions?: EntityPermissions, lifecycle?: EntityLifecycle, tags?: string[] }
// components 按键合并（shallow merge），不传的键不变
```

### PATCH /entities/:id/components/:key（新增，单组件更新）

```typescript
// body 即组件数据
{ current: 10, max: 20 }  // 例：更新 daggerheart:health
```

### Socket.io entity:updated

```typescript
// 发送完整 Entity 对象（含 assembled components + tags）
{ id, blueprintId, permissions, lifecycle, tags, components: { 'core:identity': {...}, ... } }
```

## 不在本 Phase 范围

- `IEntityRegistrationSDK` / `registerComponent()` — 当前无插件需要动态注册组件 schema，推迟到后续
- POC 目录 (`poc/`) — PocEntity 是独立类型，不需要同步更新，保持原样作为历史参考

## 风险

1. **编译错误雪崩** — 改 Entity 类型后全项目编译错误。通过 coreComponents 便捷函数和 fixtures 同步更新缓解。
2. **Archive 格式兼容** — 现有 archive 数据格式变化。无需数据迁移（假设无生产数据）。
3. **深合并逻辑** — 服务端 ruleData deep merge 需替换为 entity_components UPSERT。语义变化：从整体合并变为按组件键更新。
4. **entityAdapters 调用者迁移** — CharacterEditPanel/CharacterHoverPreview 依赖 entityAdapters，需确保所有调用者完成迁移后再删除文件。
