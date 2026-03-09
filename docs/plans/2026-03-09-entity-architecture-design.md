# myVTT 实体架构设计

> 本文档总结了 2026-03-09 关于实体模型、数据架构、权限系统的完整讨论成果。
> 所有决策均已确认。

---

## 1. 核心实体模型：Blueprint → Entity → Stage

### 三层架构

```
Blueprint (模板)          Entity (实例)              Stage (视图)
┌──────────────┐    实例化    ┌──────────────┐         ┌──────────────────┐
│ name         │───────────→│ id           │────────→│ 顶部角色栏 (头像) │
│ imageUrl     │  可多次实例  │ blueprintId? │         │ 地图 token        │
│ defaultSize  │            │ name         │         │ 先攻表            │
│ ruleData模板 │            │ ruleData     │         │ (同一实体不同视图) │
└──────────────┘            │ permissions  │         └──────────────────┘
                            └──────────────┘
```

**Blueprint** — 可重复使用的模板。GM 资产库中的"哥布林"、"治疗药水"都是 Blueprint。

**Entity** — 从 Blueprint 实例化的具体个体，拥有独立状态（HP、状态等）。一个"哥布林"Blueprint 可以实例化出"哥布林 A"、"哥布林 B"。

**Stage** — 实体的可见视图。顶部角色栏、地图 token、先攻表条目都是同一个 Entity 的不同 **视图**，而非独立实体。

### Entity 归属与生命周期

每个 Entity **必须归属于一个容器**：

- **PC** → `party` 容器（永久，不属于任何场景）
- **场景 NPC/怪物** → 对应场景的 `entities` 容器
- **GM 预备实体** → `prepared` 容器（准备好但未放入场景）

**删除规则**：
- 删除场景 → 场景内所有 entity 一起删除
- GM 可将场景内的重要实体"提升"到 `prepared`（从场景移出）
- Token 渲染时如果 entityId 查不到实体 → 不渲染（无需级联删除）

**关键决策**：Entity 存储位置对用户透明。UI 层面用户可以看到所有实体，存储在哪里是实现细节。

---

## 2. Yjs 数据结构

### 单一顶层 Y.Map + 嵌套结构

```
Y.Map('world')                         ← 唯一顶层 shared type
  │
  ├── 'scenes' → Y.Map
  │     └── '<sceneId>' → Y.Map        ← 场景（可删除，嵌套 Y.Map）
  │           ├── 'name' → string       ← 场景配置平铺（不用 config 对象）
  │           ├── 'backgroundUrl' → string
  │           ├── 'mapUrl' → string
  │           ├── 'gridSize' → number
  │           ├── 'gridVisible' → boolean
  │           ├── 'entities' → Y.Map<plainObject>  ← NPC/怪物，值是纯对象
  │           └── 'tokens' → Y.Map<plainObject>    ← token 坐标，值是纯对象
  │
  ├── 'party' → Y.Map<Y.Map>           ← PC 实体，值是嵌套 Y.Map（字段级合并）
  │     └── '<entityId>' → Y.Map
  │           ├── 'name' → string
  │           ├── 'imageUrl' → string
  │           ├── 'ruleData' → { ... }  ← ruleData 本身是纯对象
  │           ├── 'permissions' → { ... }
  │           └── ...
  │
  ├── 'prepared' → Y.Map<plainObject>  ← GM 预备实体，值是纯对象
  ├── 'blueprints' → Y.Map<plainObject>← 蓝图模板
  ├── 'seats' → Y.Map<plainObject>     ← 座位/玩家
  └── 'chat' → Y.Array<plainObject>    ← 聊天记录
```

### 设计要点

**PC vs NPC 存储差异**：
- **PC（party）**：嵌套 Y.Map，支持字段级 CRDT 合并。因为 GM 和玩家可能同时编辑同一个 PC 的不同字段。
- **NPC/怪物（scene entities）**：纯对象，整体替换。因为只有 GM 操作，无并发冲突。且纯对象可以在场景间自由移动（读+写+删），嵌套 Y.Map 不能移动（Yjs 限制）。

**场景配置平铺**：场景的 name、backgroundUrl 等直接作为 Y.Map 的 key，不包在 config 对象里。因为 Yjs 不支持在纯对象内嵌套 Y 类型。

**嵌套 Y.Map 可删除**：`scenes.delete('<sceneId>')` 会完整删除该场景及其所有子 Map（entities、tokens），这是嵌套 Y.Map 相比顶层 shared type 的关键优势。

**创建场景时用 transact**：
```typescript
yDoc.transact(() => {
  const sceneMap = new Y.Map()
  scenes.set(sceneId, sceneMap)
  sceneMap.set('name', '新场景')
  sceneMap.set('entities', new Y.Map())
  sceneMap.set('tokens', new Y.Map())
})
```

---

## 3. Entity 数据结构

### 新 Entity 接口

```typescript
interface Entity {
  id: string
  name: string
  imageUrl: string
  color: string
  size: number               // 格子数 (1=1x1, 2=2x2)
  blueprintId?: string       // 来源蓝图（如有）
  notes: string              // 通用备注
  ruleData: unknown          // 所有游戏数据，由规则系统定义
  permissions: {
    default: 'none' | 'observer' | 'owner'
    seats: Record<string, 'none' | 'observer' | 'owner'>
  }
}
```

**删除的字段及原因**：
- `type: 'pc' | 'npc'` → 移入 `ruleData.kind`
- `seatId` → 由 `permissions.seats` 替代
- `resources[]`, `attributes[]`, `statuses[]` → 全部移入 `ruleData`
- `handouts[]` → 删除
- `favorites[]` → 删除
- `featured` → 由 Stage 机制替代
- `saved: boolean` → 不再需要。归属容器本身决定生命周期（场景实体随场景删除，prepared/party 实体持久保留）

### ruleData 结构示例（Daggerheart）

```typescript
interface DaggerheartPCData {
  kind: 'pc'
  class: string
  subclass: string
  level: number
  resources: { hp: {cur, max}, stress: {cur, max}, armor: {cur, max}, hope: {cur, max} }
  attributes: { agility: number, strength: number, finesse: number, ... }
  statuses: StatusEffect[]
  experiences: string[]
}

interface DaggerheartNPCData {
  kind: 'npc'
  difficulty: number
  resources: { hp: {cur, max} }
  actions: NPCAction[]
}
```

### MapToken 接口

```typescript
interface MapToken {
  id: string
  entityId?: string    // 可选 — 纯标记物无 entityId
  x: number
  y: number
  size: number
  gmOnly: boolean
  // 无 entityId 时的备用显示
  label?: string
  imageUrl?: string
  color?: string
}
```

**Token = 纯坐标**：不持有任何游戏状态。名字、HP、状态全部从 Entity 读取。
**entityId 查不到 → 不渲染**：无需级联删除，渲染时容错处理。

---

## 4. Adapter 模式：通用 UI 访问规则数据

### 问题

通用 UI（角色栏 HP 环、token HP 条、掷骰公式解析）需要访问 resources/attributes 等数据，但这些数据在 `ruleData` 里，结构由规则定义。

### 解决方案

RuleSystem 接口提供 adapter 方法：

```typescript
interface RuleSystem {
  id: string
  name: string

  // Adapter — 通用 UI 调用这些
  getMainResource(entity: Entity): { current: number, max: number } | null
  getPortraitResources(entity: Entity): { label: string, current: number, max: number }[]
  getFormulaTokens(entity: Entity): Record<string, number>
  getStatuses(entity: Entity): { label: string }[]

  // 规则专属 UI
  CharacterCard: React.ComponentType<{ entity: Entity }>
}
```

- 通用 UI 不直接读 `ruleData`，只通过 adapter
- 不同规则自定义"主资源"是什么（HP? 理智?）
- 规则没有某概念时 adapter 返回空数组

---

## 5. 权限系统

### 三级权限

| 级别 | 含义 |
|------|------|
| `none` | 看不到（GM-only 实体） |
| `observer` | 能看、不能改（名字、头像、公开状态可见） |
| `owner` | 完全控制（编辑、移动 token、以角色发言） |

### 权限存储

权限作为 Entity 的 `permissions` 字段，跟着实体走：

```typescript
permissions: {
  default: 'observer',                    // 未明确列出的座位
  seats: { 'seat-1': 'owner' }            // 特定座位的权限
}
```

### 默认权限

- **新建 PC**：`{ default: 'observer', seats: { [创建者seatId]: 'owner' } }`
- **新建 NPC**：`{ default: 'observer' }` — 所有人可见
- **隐藏 NPC**：`{ default: 'none' }` — GM 手动设置

### GM 隐式全权

GM 不存在权限记录中，代码层直接绕过：

```typescript
function canEdit(entity, seatId, role) {
  if (role === 'GM') return true
  return getPermission(entity, seatId) === 'owner'
}

function canSee(entity, seatId, role) {
  if (role === 'GM') return true
  return getPermission(entity, seatId) !== 'none'
}
```

**不自动创建角色**：无论 GM 还是 PL，都不自动创建角色。GM 通过资产库管理，PL 由 GM 分配。

---

## 6. Seat 接口

```typescript
interface Seat {
  id: string
  name: string
  color: string
  role: 'GM' | 'PL'
  portraitUrl?: string
  activeCharacterId?: string  // UI 焦点状态
}
```

保持精简，不承载权限信息。

---

## 7. 聊天记录

聊天消息不依赖实体的实时存在。写入时冗余存储发言者信息：

```typescript
interface ChatMessage {
  id: string
  senderName: string       // 快照
  senderImageUrl: string   // 快照
  senderColor: string      // 快照
  // ... message content
}
```

---

## 8. Yjs 注意事项

1. **observe() vs observeDeep()**：`observe()` 不响应嵌套 Y.Map 的变化。每个 hook 必须在需要监听的具体子 Map 上 `observe()`。
2. **嵌套 Y.Map 不能移动**：PC 永远在 `party`，不存在移动需求。NPC 用纯对象，读+写+删即可移动。
3. **场景配置平铺**：不能把 Y 类型藏在纯 JS 对象里。场景的字段直接作为 Y.Map 的 key。
4. **创建嵌套结构用 transact()**：`new Y.Map()` 必须先集成到文档再设值。
5. **Y.Map key 历史永久保留**：空间影响可忽略，使用 UUID 避免 key 复用。

---

## 附录：与 Foundry VTT 的对照

| Foundry VTT | myVTT (新) | 说明 |
|-------------|-----------|------|
| Actor | Entity | 实体，持有完整状态 |
| Token (linked) | MapToken (有 entityId) | 地图上的实体视图 |
| Token (unlinked) | 不采用 | |
| Actor.system | Entity.ruleData | 规则专属数据 |
| User | Seat | 玩家身份 |
| User.ownership | Entity.permissions | Per-entity 权限 |
| Compendium | Blueprint | 可重用模板 |
| Prototype Token | Blueprint.defaultSize 等 | token 默认配置 |
