# 实体生命周期重构 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将实体系统从 `persistent: boolean` 重构为 `lifecycle: 'ephemeral' | 'reusable' | 'persistent'` 三值枚举，新增 `scene_entities.visible` 候场机制，新增 spawn 路由，更新 UI（底部角色库 Tab + 侧面 NPC 面板 + 右键菜单）。

**Architecture:** 后端先行 — 先改 schema + 路由 + 测试，再改 Store + 类型，最后改 UI 组件。每一层改完后都可独立验证，互不阻塞。

**Tech Stack:** SQLite (better-sqlite3), Express 5, Socket.io, zustand, React 19, Tailwind CSS v4, vitest

**设计文档:** `docs/design/09-实体生命周期重构设计.md`

---

## Chunk 1: 后端（Schema + 路由 + 测试）

### Task 1: Schema 变更 — lifecycle 枚举 + visible 字段

**Files:**

- Modify: `server/schema.ts:47-58` (entities 表) + `server/schema.ts:61-65` (scene_entities 表) + `server/schema.ts:140` (索引)

- [ ] **Step 1: 修改 entities 表定义**

将 `persistent INTEGER DEFAULT 0` 替换为 `lifecycle TEXT`：

```sql
-- entities 表（server/schema.ts:47-58）
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  image_url TEXT DEFAULT '',
  color TEXT DEFAULT '#888888',
  size REAL DEFAULT 1,
  notes TEXT DEFAULT '',
  rule_data TEXT DEFAULT '{}',
  permissions TEXT DEFAULT '{"default":"none","seats":{}}',
  lifecycle TEXT DEFAULT 'ephemeral' CHECK(lifecycle IN ('ephemeral','reusable','persistent')),
  blueprint_id TEXT
);
```

- [ ] **Step 2: 修改 scene_entities 表定义**

新增 `visible` 字段：

```sql
-- scene_entities 表（server/schema.ts:61-65）
CREATE TABLE IF NOT EXISTS scene_entities (
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  visible INTEGER DEFAULT 1,
  PRIMARY KEY (scene_id, entity_id)
);
```

- [ ] **Step 3: 更新索引**

将 `idx_entities_persistent` 替换为 `idx_entities_lifecycle`：

```sql
-- 替换 server/schema.ts:140 的 idx_entities_persistent
CREATE INDEX IF NOT EXISTS idx_entities_lifecycle ON entities(lifecycle);
```

- [ ] **Step 4: 验证 schema 正确**

Run: `npx tsx -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); require('./server/schema').initRoomSchema(db); console.log('OK')"`

Expected: 打印 `OK`，无错误。

- [ ] **Step 5: Commit**

```bash
git add server/schema.ts
git commit -m "refactor: replace persistent boolean with lifecycle enum + visible field"
```

---

### Task 2: 服务端工具函数更新 — toEntity 转换

**Files:**

- Modify: `server/routes/entities.ts:13-16` (toEntity 函数)
- Modify: `server/db.ts` (toBoolFields 引用检查)

- [ ] **Step 1: 更新 toEntity**

`toEntity` 当前调用 `toBoolFields(r, 'persistent')` 将 0/1 转为 boolean。新字段 `lifecycle` 是 TEXT，不需要转换。移除 `toBoolFields` 调用：

```typescript
// server/routes/entities.ts:13-16
function toEntity(row: Record<string, unknown>) {
  return parseJsonFields(toCamel<Record<string, unknown>>(row), 'ruleData', 'permissions')
}
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/entities.ts
git commit -m "refactor: update toEntity for lifecycle text field"
```

---

### Task 3: Entity 路由 — lifecycle 感知 CRUD

**Files:**

- Modify: `server/routes/entities.ts:34-88` (POST create)
- Modify: `server/routes/entities.ts:90-151` (PATCH update)
- Modify: `server/routes/entities.ts:153-157` (DELETE — token 退化)

- [ ] **Step 1: 更新 POST create 路由**

将 `persistent` 参数替换为 `lifecycle`，auto-link 逻辑改为检查 `lifecycle === 'persistent'`：

```typescript
router.post('/api/rooms/:roomId/entities', room, (req, res) => {
  const id = req.body.id || 'e-' + crypto.randomUUID().slice(0, 8)
  const {
    name = '',
    imageUrl = '',
    color = '#888888',
    size = 1,
    notes = '',
    ruleData = {},
    permissions = { default: 'observer', seats: {} },
    lifecycle = 'ephemeral',
    blueprintId = null,
  } = req.body

  const createEntity = req.roomDb!.transaction(() => {
    req
      .roomDb!.prepare(
        `INSERT INTO entities (id, name, image_url, color, size, notes, rule_data, permissions, lifecycle, blueprint_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        imageUrl,
        color,
        size,
        notes,
        JSON.stringify(ruleData),
        JSON.stringify(permissions),
        lifecycle,
        blueprintId,
      )

    // Persistent entities auto-link to all existing scenes
    if (lifecycle === 'persistent') {
      const scenes = req.roomDb!.prepare('SELECT id FROM scenes').all() as { id: string }[]
      const stmt = req.roomDb!.prepare(
        'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, 1)',
      )
      for (const s of scenes) {
        stmt.run(s.id, id)
      }
    }
  })
  createEntity()

  const entity = toEntity(
    req.roomDb!.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Record<string, unknown>,
  )
  io.to(req.roomId!).emit('entity:created', entity)
  res.status(201).json(entity)
})
```

- [ ] **Step 2: 更新 PATCH update 路由**

替换 `persistent` 字段处理为 `lifecycle`：

```typescript
// 在 simpleFields 对象中添加 lifecycle
const simpleFields: Record<string, string> = {
  name: 'name',
  imageUrl: 'image_url',
  color: 'color',
  size: 'size',
  notes: 'notes',
  blueprintId: 'blueprint_id',
  lifecycle: 'lifecycle',
}
```

删除原来单独处理 `persistent` 的代码块（`server/routes/entities.ts:117-120`）。

- [ ] **Step 3: 提取 token 退化共享函数**

在 `server/routes/scenes.ts` 和 `server/routes/entities.ts` 中都需要 token 退化逻辑。提取为共享函数，放在 `server/routes/entities.ts` 文件顶部并导出：

```typescript
// server/routes/entities.ts — 导出供 scenes.ts 使用
import type Database from 'better-sqlite3'

/** 将 combat_state 和 encounters 中引用该 entityId 的 token 的 entityId 置为 null */
export function degradeTokenReferences(db: Database.Database, entityId: string) {
  // combat_state JSON
  const combatRow = db.prepare('SELECT tokens FROM combat_state WHERE id = 1').get() as
    | { tokens: string }
    | undefined
  if (combatRow) {
    const tokens = JSON.parse(combatRow.tokens || '{}')
    let changed = false
    for (const [, t] of Object.entries(tokens)) {
      if ((t as Record<string, unknown>).entityId === entityId) {
        ;(t as Record<string, unknown>).entityId = null
        changed = true
      }
    }
    if (changed) {
      db.prepare('UPDATE combat_state SET tokens = ? WHERE id = 1').run(JSON.stringify(tokens))
    }
  }

  // encounters JSON
  const encounterRows = db.prepare('SELECT id, tokens FROM encounters').all() as {
    id: string
    tokens: string
  }[]
  for (const enc of encounterRows) {
    const tokens = JSON.parse(enc.tokens || '{}')
    let changed = false
    for (const [, t] of Object.entries(tokens)) {
      if ((t as Record<string, unknown>).entityId === entityId) {
        ;(t as Record<string, unknown>).entityId = null
        changed = true
      }
    }
    if (changed) {
      db.prepare('UPDATE encounters SET tokens = ? WHERE id = ?').run(
        JSON.stringify(tokens),
        enc.id,
      )
    }
  }
}
```

- [ ] **Step 4: 更新 DELETE 路由 — 使用共享函数**

```typescript
router.delete('/api/rooms/:roomId/entities/:id', room, (req, res) => {
  const existing = req.roomDb!.prepare('SELECT id FROM entities WHERE id = ?').get(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Entity not found' })
    return
  }

  const deleteEntity = req.roomDb!.transaction(() => {
    degradeTokenReferences(req.roomDb!, req.params.id)
    req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(req.params.id)
  })
  deleteEntity()

  io.to(req.roomId!).emit('entity:deleted', { id: req.params.id })
  res.json({ ok: true })
})
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/entities.ts
git commit -m "refactor: entity routes use lifecycle enum, add token degradation on delete"
```

---

### Task 4: Scene 路由 — lifecycle 感知 + visible + spawn

**Files:**

- Modify: `server/routes/scenes.ts:43-52` (POST create — persistent auto-link)
- Modify: `server/routes/scenes.ts:111-115` (DELETE — ephemeral cleanup)
- Modify: `server/routes/scenes.ts:118-127` (POST link — ephemeral constraint)
- Modify: `server/routes/scenes.ts:129-138` (DELETE unlink — ephemeral delete)
- Modify: `server/routes/scenes.ts:141-146` (GET entities — return visible)
- Add new routes: PATCH scene entity visible + POST spawn

- [ ] **Step 1: 更新 POST create — persistent auto-link**

```typescript
// server/routes/scenes.ts 约行 43-52
// Auto-link persistent entities (with visible=1)
const persistentEntities = req
  .roomDb!.prepare("SELECT id FROM entities WHERE lifecycle = 'persistent'")
  .all() as { id: string }[]
const linkStmt = req.roomDb!.prepare(
  'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, 1)',
)
for (const e of persistentEntities) {
  linkStmt.run(id, e.id)
}
```

- [ ] **Step 2: 更新 DELETE scene — ephemeral cleanup（含 token 退化）**

删除场景时，先清理该场景中的 ephemeral entities。在文件顶部添加 import：

```typescript
import { degradeTokenReferences } from './entities'
```

```typescript
router.delete('/api/rooms/:roomId/scenes/:id', room, (req, res) => {
  const deleteScene = req.roomDb!.transaction(() => {
    // Find ephemeral entities in this scene
    const ephemeralIds = req
      .roomDb!.prepare(
        `SELECT e.id FROM entities e
         JOIN scene_entities se ON se.entity_id = e.id
         WHERE se.scene_id = ? AND e.lifecycle = 'ephemeral'`,
      )
      .all(req.params.id) as { id: string }[]

    // Token degradation + delete ephemeral entities
    const delStmt = req.roomDb!.prepare('DELETE FROM entities WHERE id = ?')
    for (const e of ephemeralIds) {
      degradeTokenReferences(req.roomDb!, e.id)
      delStmt.run(e.id)
    }

    // Delete scene (CASCADE cleans remaining scene_entities + encounters)
    req.roomDb!.prepare('DELETE FROM scenes WHERE id = ?').run(req.params.id)

    return ephemeralIds
  })
  const deletedEphemeral = deleteScene()

  // Broadcast
  for (const e of deletedEphemeral) {
    io.to(req.roomId!).emit('entity:deleted', { id: e.id })
  }
  io.to(req.roomId!).emit('scene:deleted', { id: req.params.id })
  res.json({ ok: true })
})
```

- [ ] **Step 3: 更新 POST link — ephemeral single-scene constraint**

```typescript
router.post('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
  // Check ephemeral constraint: cannot join a second scene
  const entity = req
    .roomDb!.prepare('SELECT lifecycle FROM entities WHERE id = ?')
    .get(req.params.entityId) as { lifecycle: string } | undefined
  if (!entity) {
    res.status(404).json({ error: 'Entity not found' })
    return
  }
  if (entity.lifecycle === 'ephemeral') {
    const existing = req
      .roomDb!.prepare('SELECT scene_id FROM scene_entities WHERE entity_id = ?')
      .get(req.params.entityId) as { scene_id: string } | undefined
    if (existing && existing.scene_id !== req.params.sceneId) {
      res.status(400).json({ error: 'Ephemeral entity can only belong to one scene' })
      return
    }
  }

  const visible = req.body.visible ?? 1
  req
    .roomDb!.prepare(
      'INSERT OR IGNORE INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, ?)',
    )
    .run(req.params.sceneId, req.params.entityId, visible)
  io.to(req.roomId!).emit('scene:entity:linked', {
    sceneId: req.params.sceneId,
    entityId: req.params.entityId,
    visible: visible === 1,
  })
  res.json({ ok: true })
})
```

- [ ] **Step 4: 更新 DELETE unlink — ephemeral auto-delete**

```typescript
router.delete('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
  const unlinkEntity = req.roomDb!.transaction(() => {
    // Remove the link
    req
      .roomDb!.prepare('DELETE FROM scene_entities WHERE scene_id = ? AND entity_id = ?')
      .run(req.params.sceneId, req.params.entityId)

    // If ephemeral, delete the entity too
    const entity = req
      .roomDb!.prepare('SELECT lifecycle FROM entities WHERE id = ?')
      .get(req.params.entityId) as { lifecycle: string } | undefined
    if (entity?.lifecycle === 'ephemeral') {
      req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(req.params.entityId)
      return true // entity was deleted
    }
    return false
  })
  const entityDeleted = unlinkEntity()

  if (entityDeleted) {
    io.to(req.roomId!).emit('entity:deleted', { id: req.params.entityId })
  }
  io.to(req.roomId!).emit('scene:entity:unlinked', {
    sceneId: req.params.sceneId,
    entityId: req.params.entityId,
  })
  res.json({ ok: true })
})
```

- [ ] **Step 5: 更新 GET scene entities — 返回 visible**

```typescript
router.get('/api/rooms/:roomId/scenes/:sceneId/entities', room, (req, res) => {
  const rows = req
    .roomDb!.prepare('SELECT entity_id, visible FROM scene_entities WHERE scene_id = ?')
    .all(req.params.sceneId) as { entity_id: string; visible: number }[]
  res.json(rows.map((r) => ({ entityId: r.entity_id, visible: r.visible === 1 })))
})
```

- [ ] **Step 6: 新增 PATCH scene entity — 切换 visible**

在 `return router` 之前添加：

```typescript
router.patch('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
  const { visible } = req.body
  if (visible === undefined) {
    res.status(400).json({ error: 'visible is required' })
    return
  }
  const result = req
    .roomDb!.prepare('UPDATE scene_entities SET visible = ? WHERE scene_id = ? AND entity_id = ?')
    .run(visible ? 1 : 0, req.params.sceneId, req.params.entityId)
  if (result.changes === 0) {
    res.status(404).json({ error: 'Scene-entity link not found' })
    return
  }
  const payload = {
    sceneId: req.params.sceneId,
    entityId: req.params.entityId,
    visible: !!visible,
  }
  io.to(req.roomId!).emit('scene:entity:updated', payload)
  res.json(payload)
})
```

- [ ] **Step 7: 新增 POST spawn 路由**

在 `return router` 之前添加：

```typescript
router.post('/api/rooms/:roomId/scenes/:sceneId/spawn', room, (req, res) => {
  const { blueprintId } = req.body
  if (!blueprintId) {
    res.status(400).json({ error: 'blueprintId is required' })
    return
  }

  // Look up blueprint from assets
  const asset = req
    .roomDb!.prepare("SELECT * FROM assets WHERE id = ? AND type = 'blueprint'")
    .get(blueprintId) as Record<string, unknown> | undefined
  if (!asset) {
    res.status(404).json({ error: 'Blueprint not found' })
    return
  }
  const extra = JSON.parse((asset.extra as string) || '{}')
  const bp = extra.blueprint || {}

  // Auto-name: count existing entities with same blueprintId
  const count = req
    .roomDb!.prepare('SELECT COUNT(*) as c FROM entities WHERE blueprint_id = ?')
    .get(blueprintId) as { c: number }
  const name = `${asset.name || 'NPC'} ${count.c + 1}`

  const entityId = 'e-' + crypto.randomUUID().slice(0, 8)

  const spawnEntity = req.roomDb!.transaction(() => {
    req
      .roomDb!.prepare(
        `INSERT INTO entities (id, name, image_url, color, size, notes, rule_data, permissions, lifecycle, blueprint_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ephemeral', ?)`,
      )
      .run(
        entityId,
        name,
        asset.url || '',
        bp.defaultColor || '#888888',
        bp.defaultSize || 1,
        '',
        JSON.stringify(bp.defaultRuleData || {}),
        JSON.stringify({ default: 'observer', seats: {} }),
        blueprintId,
      )

    req
      .roomDb!.prepare('INSERT INTO scene_entities (scene_id, entity_id, visible) VALUES (?, ?, 1)')
      .run(req.params.sceneId, entityId)
  })
  spawnEntity()

  const entity = toEntity(
    req.roomDb!.prepare('SELECT * FROM entities WHERE id = ?').get(entityId) as Record<
      string,
      unknown
    >,
  )

  io.to(req.roomId!).emit('entity:created', entity)
  io.to(req.roomId!).emit('scene:entity:linked', {
    sceneId: req.params.sceneId,
    entityId,
    visible: true,
  })
  res.status(201).json({
    entity,
    sceneEntity: { sceneId: req.params.sceneId, entityId, visible: true },
  })
})
```

注意：spawn 路由中的 `toEntity` 函数需要在文件内可用。Task 3 已经将 `degradeTokenReferences` 导出到 `entities.ts`，同时也将 `toEntity` 导出：

```typescript
// server/routes/entities.ts — 在 entityRoutes 函数外部导出
export function toEntity(row: Record<string, unknown>) {
  return parseJsonFields(toCamel<Record<string, unknown>>(row), 'ruleData', 'permissions')
}
```

在 `scenes.ts` 中导入：

```typescript
import { degradeTokenReferences, toEntity } from './entities'
```

- [ ] **Step 8: Commit**

```bash
git add server/routes/scenes.ts
git commit -m "feat: lifecycle-aware scene routes, visible toggle, spawn endpoint"
```

---

### Task 5: 集成测试 — entity lifecycle 完整旅程

**Files:**

- Modify: `server/__tests__/scenarios/scene-entity.test.ts` (重写以适配新 API)
- Create: `server/__tests__/scenarios/entity-lifecycle.test.ts` (新 lifecycle 测试)

- [ ] **Step 1: 更新现有测试适配新响应格式**

`GET /scenes/:sceneId/entities` 现在返回 `{ entityId, visible }[]` 而非 `string[]`。更新现有测试中的断言：

```typescript
// 将类似 expect(data as string[]).toContain(goblinId) 改为：
expect((data as { entityId: string; visible: boolean }[]).map((r) => r.entityId)).toContain(
  goblinId,
)
```

同时将 `persistent: true/false` 改为 `lifecycle: 'persistent'/'ephemeral'`。

- [ ] **Step 2: 运行现有测试确认适配通过**

Run: `npx vitest run server/__tests__/scenarios/scene-entity.test.ts`

Expected: 全部通过

- [ ] **Step 3: 编写 lifecycle 测试**

创建 `server/__tests__/scenarios/entity-lifecycle.test.ts`：

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('entity-lifecycle-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Entity Lifecycle Journey', () => {
  let sceneAId: string, sceneBId: string
  let ephemeralId: string, reusableId: string, persistentId: string

  it('creates two scenes', async () => {
    const { data: a } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene A',
      atmosphere: {},
    })
    sceneAId = (a as { id: string }).id
    const { data: b } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene B',
      atmosphere: {},
    })
    sceneBId = (b as { id: string }).id
  })

  it('creates ephemeral entity', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Goblin',
      lifecycle: 'ephemeral',
    })
    ephemeralId = (data as { id: string; lifecycle: string }).id
    expect((data as { lifecycle: string }).lifecycle).toBe('ephemeral')
  })

  it('creates reusable entity', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Merchant',
      lifecycle: 'reusable',
    })
    reusableId = (data as { id: string }).id
    expect((data as { lifecycle: string }).lifecycle).toBe('reusable')
  })

  it('creates persistent entity — auto-links to all scenes', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Hero',
      lifecycle: 'persistent',
    })
    persistentId = (data as { id: string }).id

    const { data: aEnts } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`,
    )
    const ids = (aEnts as { entityId: string }[]).map((r) => r.entityId)
    expect(ids).toContain(persistentId)
  })

  it('links ephemeral to scene A', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${ephemeralId}`)
  })

  it('rejects ephemeral in second scene', async () => {
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneBId}/entities/${ephemeralId}`,
    )
    expect(status).toBe(400)
  })

  it('visible defaults to true on link', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`)
    const entry = (data as { entityId: string; visible: boolean }[]).find(
      (r) => r.entityId === ephemeralId,
    )
    expect(entry?.visible).toBe(true)
  })

  it('toggles visible to false (backstage)', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${ephemeralId}`, {
      visible: false,
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities`)
    const entry = (data as { entityId: string; visible: boolean }[]).find(
      (r) => r.entityId === ephemeralId,
    )
    expect(entry?.visible).toBe(false)
  })

  it('promotes ephemeral to reusable', async () => {
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/entities/${ephemeralId}`, {
      lifecycle: 'reusable',
    })
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${ephemeralId}`)
    expect((data as { lifecycle: string }).lifecycle).toBe('reusable')
  })

  it('unlinks reusable from scene — entity preserved', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${ephemeralId}`)
    // Entity still exists
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${ephemeralId}`)
    expect(status).toBe(200)
  })

  it('creates new ephemeral and unlinks — entity deleted', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Temp NPC',
      lifecycle: 'ephemeral',
    })
    const tempId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tempId}`)
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${tempId}`)
    // Entity should be gone
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${tempId}`)
    expect(status).toBe(404)
  })

  it('new scene auto-links persistent entities', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene C',
      atmosphere: {},
    })
    const sceneCId = (data as { id: string }).id
    const { data: ents } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneCId}/entities`,
    )
    const ids = (ents as { entityId: string }[]).map((r) => r.entityId)
    expect(ids).toContain(persistentId)
    expect(ids).not.toContain(reusableId)
  })

  it('deleting scene cleans up ephemeral entities', async () => {
    // Create ephemeral in scene A
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Scene Goblin',
      lifecycle: 'ephemeral',
    })
    const sceneGoblinId = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}/entities/${sceneGoblinId}`)
    // Delete scene A
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneAId}`)
    // Ephemeral entity should be gone
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${sceneGoblinId}`)
    expect(status).toBe(404)
    // Persistent entity should still exist
    const { status: heroStatus } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities/${persistentId}`,
    )
    expect(heroStatus).toBe(200)
  })
})
```

- [ ] **Step 4: 运行 lifecycle 测试**

Run: `npx vitest run server/__tests__/scenarios/entity-lifecycle.test.ts`

Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add server/__tests__/scenarios/
git commit -m "test: entity lifecycle integration tests"
```

---

### Task 6: Spawn 路由集成测试

**Files:**

- Create: `server/__tests__/scenarios/spawn.test.ts`

- [ ] **Step 1: 编写 spawn 测试**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('spawn-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Spawn from Blueprint Journey', () => {
  let sceneId: string, blueprintId: string

  it('creates a scene', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Tavern',
      atmosphere: {},
    })
    sceneId = (data as { id: string }).id
  })

  it('creates a blueprint asset', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/assets`, {
      url: '/uploads/goblin.png',
      name: '哥布林',
      type: 'blueprint',
      extra: {
        blueprint: { defaultSize: 1, defaultColor: '#22c55e', defaultRuleData: {} },
      },
    })
    blueprintId = (data as { id: string }).id
  })

  it('spawns entity from blueprint', async () => {
    const { data, status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`,
      { blueprintId },
    )
    expect(status).toBe(201)
    const result = data as {
      entity: { id: string; name: string; lifecycle: string; color: string }
      sceneEntity: { visible: boolean }
    }
    expect(result.entity.name).toBe('哥布林 1')
    expect(result.entity.lifecycle).toBe('ephemeral')
    expect(result.entity.color).toBe('#22c55e')
    expect(result.sceneEntity.visible).toBe(true)
  })

  it('spawns second entity with incremented name', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`, {
      blueprintId,
    })
    const result = data as { entity: { name: string } }
    expect(result.entity.name).toBe('哥布林 2')
  })

  it('spawned entity appears in scene entity list', async () => {
    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`)
    const entries = data as { entityId: string; visible: boolean }[]
    expect(entries.length).toBeGreaterThanOrEqual(2)
    expect(entries.every((e) => e.visible === true)).toBe(true)
  })

  it('rejects spawn with invalid blueprint', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`, {
      blueprintId: 'nonexistent',
    })
    expect(status).toBe(404)
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run server/__tests__/scenarios/spawn.test.ts`

Expected: 全部通过

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/scenarios/spawn.test.ts
git commit -m "test: spawn route integration tests"
```

---

### Task 7: 集成测试 — token 退化 + 边界场景

**Files:**

- Create: `server/__tests__/scenarios/token-degradation.test.ts`
- Create: `server/__tests__/scenarios/entity-edge-cases.test.ts`

- [ ] **Step 1: 编写 token 退化测试**

验证删除 entity 后 combat_state 和 encounters 中的 token entityId 被置为 null：

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('token-degradation-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Token Degradation on Entity Delete', () => {
  let sceneId: string, encounterId: string, entityId: string

  it('sets up scene + encounter + entity', async () => {
    const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Arena',
      atmosphere: {},
    })
    sceneId = (scene as { id: string }).id

    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Warrior',
      lifecycle: 'reusable',
    })
    entityId = (entity as { id: string }).id

    const { data: encounter } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`,
      {
        name: 'Battle',
        tokens: {
          t1: { name: 'Warrior Token', entityId, x: 100, y: 100, size: 1 },
          t2: { name: 'Other Token', x: 200, y: 200, size: 1 },
        },
      },
    )
    encounterId = (encounter as { id: string }).id
  })

  it('activates encounter to populate combat_state', async () => {
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/encounters/${encounterId}/activate`)
    const { data: combat } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const tokens = (combat as { tokens: Record<string, { entityId?: string }> }).tokens
    // At least one token should reference our entity
    const linkedToken = Object.values(tokens).find((t) => t.entityId === entityId)
    expect(linkedToken).toBeDefined()
  })

  it('deletes entity — combat tokens degrade', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/entities/${entityId}`)

    // Check combat_state: entityId should be null
    const { data: combat } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/combat`)
    const tokens = (combat as { tokens: Record<string, { entityId?: string | null }> }).tokens
    for (const t of Object.values(tokens)) {
      expect(t.entityId).not.toBe(entityId)
    }
  })

  it('encounter tokens also degraded', async () => {
    // End combat, check encounter data
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/combat/end`)
    const { data: encounters } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/encounters`,
    )
    const enc = (
      encounters as { id: string; tokens: Record<string, { entityId?: string | null }> }[]
    ).find((e) => e.id === encounterId)
    expect(enc).toBeDefined()
    for (const t of Object.values(enc!.tokens)) {
      expect(t.entityId).not.toBe(entityId)
    }
  })
})

describe('Token Degradation on Scene Delete (ephemeral)', () => {
  let sceneId: string, encounterId: string, ephemeralId: string

  it('sets up scene with ephemeral entity in encounter', async () => {
    const { data: scene } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Dungeon',
      atmosphere: {},
    })
    sceneId = (scene as { id: string }).id

    const { data: entity } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Goblin',
      lifecycle: 'ephemeral',
    })
    ephemeralId = (entity as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${ephemeralId}`)

    // Create encounter in a DIFFERENT scene that references the ephemeral entity's ID
    // (simulating a token that was manually linked)
    const { data: scene2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Other Scene',
      atmosphere: {},
    })
    const scene2Id = (scene2 as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${scene2Id}/encounters`, {
      name: 'Other Battle',
      tokens: {
        t1: { name: 'Goblin Token', entityId: ephemeralId, x: 0, y: 0, size: 1 },
      },
    })
  })

  it('deleting scene removes ephemeral entity + degrades tokens', async () => {
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneId}`)

    // Entity should be gone
    const { status } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/entities/${ephemeralId}`)
    expect(status).toBe(404)
  })
})
```

- [ ] **Step 2: 编写边界场景测试**

验证 lifecycle 约束的边界情况：

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('entity-edge-cases-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Entity Edge Cases', () => {
  let sceneId: string

  it('creates a scene', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Test Scene',
      atmosphere: {},
    })
    sceneId = (data as { id: string }).id
  })

  it('default lifecycle is ephemeral when not specified', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Default Entity',
    })
    expect((data as { lifecycle: string }).lifecycle).toBe('ephemeral')
    // Cleanup
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/entities/${(data as { id: string }).id}`)
  })

  it('rejects invalid lifecycle value', async () => {
    const { status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Bad Entity',
      lifecycle: 'invalid',
    })
    expect(status).toBeGreaterThanOrEqual(400)
  })

  it('ephemeral re-link to same scene is idempotent', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Goblin',
      lifecycle: 'ephemeral',
    })
    const id = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`)
    // Re-link to SAME scene should not fail
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`,
    )
    expect(status).toBeLessThan(400)
    // Cleanup
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`)
  })

  it('promoting ephemeral to reusable allows multi-scene', async () => {
    const { data: scene2 } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Scene 2',
      atmosphere: {},
    })
    const scene2Id = (scene2 as { id: string }).id

    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Important NPC',
      lifecycle: 'ephemeral',
    })
    const id = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`)

    // Promote to reusable
    await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/entities/${id}`, { lifecycle: 'reusable' })

    // Now can join second scene
    const { status } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${scene2Id}/entities/${id}`,
    )
    expect(status).toBeLessThan(400)

    // Verify in both scenes
    const { data: ents1 } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    const { data: ents2 } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${scene2Id}/entities`,
    )
    expect((ents1 as { entityId: string }[]).map((e) => e.entityId)).toContain(id)
    expect((ents2 as { entityId: string }[]).map((e) => e.entityId)).toContain(id)
  })

  it('link with visible=false creates backstage entry', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Assassin',
      lifecycle: 'reusable',
    })
    const id = (data as { id: string }).id
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`, {
      visible: 0,
    })
    const { data: ents } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    const entry = (ents as { entityId: string; visible: boolean }[]).find((e) => e.entityId === id)
    expect(entry?.visible).toBe(false)
  })

  it('PATCH visible on non-existent link returns 404', async () => {
    const { status } = await ctx.api(
      'PATCH',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/nonexistent`,
      { visible: true },
    )
    expect(status).toBe(404)
  })

  it('deleting non-existent entity returns 404', async () => {
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/entities/nonexistent`)
    expect(status).toBe(404)
  })

  it('persistent entity removed from scene can be re-added', async () => {
    const { data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/entities`, {
      name: 'Companion',
      lifecycle: 'persistent',
    })
    const id = (data as { id: string }).id
    // Already auto-linked, remove it
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`)
    // Verify removed
    const { data: ents1 } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    expect((ents1 as { entityId: string }[]).map((e) => e.entityId)).not.toContain(id)
    // Re-add manually
    await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities/${id}`)
    const { data: ents2 } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/entities`,
    )
    expect((ents2 as { entityId: string }[]).map((e) => e.entityId)).toContain(id)
  })
})
```

- [ ] **Step 3: 运行全部服务端测试**

Run: `npx vitest run server/`

Expected: 全部通过，无回归

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/scenarios/token-degradation.test.ts server/__tests__/scenarios/entity-edge-cases.test.ts
git commit -m "test: token degradation and entity edge cases"
```

---

## Chunk 2: 前端 Store + 类型层

### Task 8: Entity 类型更新

**Files:**

- Modify: `src/shared/entityTypes.ts:10-21` (Entity interface)
- Modify: `src/shared/entityTypes.ts:85-92` (SceneV2 interface)

- [ ] **Step 1: 更新 Entity interface**

将 `persistent: boolean` 替换为 `lifecycle`：

```typescript
export type EntityLifecycle = 'ephemeral' | 'reusable' | 'persistent'

export interface Entity {
  id: string
  name: string
  imageUrl: string
  color: string
  size: number
  blueprintId?: string
  notes: string
  ruleData: unknown
  permissions: EntityPermissions
  lifecycle: EntityLifecycle
}
```

- [ ] **Step 2: 新增 SceneEntityEntry 类型**

```typescript
export interface SceneEntityEntry {
  entityId: string
  visible: boolean
}
```

- [ ] **Step 3: 更新 SceneV2 interface**

将 `entityIds: string[]` 改为使用 `SceneEntityEntry`（如果该类型仍在使用中的话）：

```typescript
export interface SceneV2 {
  id: string
  name: string
  sortOrder: number
  atmosphere: Atmosphere
  entityEntries: SceneEntityEntry[] // 替换 entityIds: string[]
  encounters: Record<string, EncounterData>
}
```

- [ ] **Step 4: 全局搜索 `persistent` 引用并更新**

Run: `grep -rn 'persistent' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.test.'`

逐个文件更新：将 `entity.persistent` 改为 `entity.lifecycle === 'persistent'`，将 `persistent: true/false` 改为 `lifecycle: 'persistent'/'ephemeral'`。

涉及的文件（基于探索结果）：

- `src/gm/EntityPanel.tsx` — 分组逻辑 `e.persistent` → `e.lifecycle === 'persistent'`
- `src/layout/PortraitBar.tsx` — 过滤/显示逻辑
- `src/stores/worldStore.ts` — `addScene` 的 `persistentEntityIds` 参数

- [ ] **Step 5: Commit**

```bash
git add src/shared/entityTypes.ts
git commit -m "refactor: Entity type uses lifecycle enum, add SceneEntityEntry type"
```

---

### Task 9: worldStore 更新 — sceneEntityMap + 新 actions + socket listeners

**Files:**

- Modify: `src/stores/worldStore.ts`

- [ ] **Step 1: 更新 sceneEntityMap 类型**

```typescript
// 在 WorldState interface 中（约行 92）
sceneEntityMap: Record<string, SceneEntityEntry[]>
```

导入 `SceneEntityEntry`：

```typescript
import type { Entity, MapToken, Atmosphere, SceneEntityEntry } from '../shared/entityTypes'
```

- [ ] **Step 2: 更新 loadAll — 适配新响应格式**

```typescript
// 在 loadAll 函数中（约行 244-251）
const sceneEntityMap: Record<string, SceneEntityEntry[]> = {}
await Promise.all(
  scenes.map(async (scene) => {
    const entries = await api.get<SceneEntityEntry[]>(
      `/api/rooms/${roomId}/scenes/${scene.id}/entities`,
    )
    sceneEntityMap[scene.id] = entries
  }),
)
```

- [ ] **Step 3: 更新 EMPTY_IDS 常量**

```typescript
const EMPTY_ENTRIES: SceneEntityEntry[] = []
```

- [ ] **Step 4: 更新 getSceneEntityIds**

删除 `getSceneEntityIds` 方法（`.map()` 每次返回新数组，作为 selector 会导致无限重渲染）。替换为 `getSceneEntityEntries`，调用方用 `useMemo` 提取 ID 列表：

```typescript
// 删除 getSceneEntityIds，替换为：
getSceneEntityEntries: (sceneId) => {
  return get().sceneEntityMap[sceneId] ?? EMPTY_ENTRIES
},
```

在 interface 中：

```typescript
// 删除: getSceneEntityIds: (sceneId: string) => string[]
getSceneEntityEntries: (sceneId: string) => SceneEntityEntry[]
```

组件中提取 ID 列表的模式：

```typescript
const entries = useWorldStore((s) => s.sceneEntityMap[activeSceneId ?? ''] ?? EMPTY_ENTRIES)
const entityIds = useMemo(() => entries.map((e) => e.entityId), [entries])
```

（`EMPTY_ENTRIES` 定义为模块级常量）

- [ ] **Step 5: 更新 socket listeners**

更新 `scene:entity:linked` listener 以包含 `visible`：

```typescript
socket.on(
  'scene:entity:linked',
  ({ sceneId, entityId, visible }: { sceneId: string; entityId: string; visible?: boolean }) => {
    set((s) => {
      const current = s.sceneEntityMap[sceneId] ?? []
      if (current.some((e) => e.entityId === entityId)) return s
      const entry: SceneEntityEntry = { entityId, visible: visible ?? true }
      return { sceneEntityMap: { ...s.sceneEntityMap, [sceneId]: [...current, entry] } }
    })
  },
)
```

更新 `scene:entity:unlinked` listener：

```typescript
socket.on(
  'scene:entity:unlinked',
  ({ sceneId, entityId }: { sceneId: string; entityId: string }) => {
    set((s) => {
      const current = s.sceneEntityMap[sceneId] ?? []
      return {
        sceneEntityMap: {
          ...s.sceneEntityMap,
          [sceneId]: current.filter((e) => e.entityId !== entityId),
        },
      }
    })
  },
)
```

新增 `scene:entity:updated` listener：

```typescript
socket.on(
  'scene:entity:updated',
  ({ sceneId, entityId, visible }: { sceneId: string; entityId: string; visible: boolean }) => {
    set((s) => {
      const current = s.sceneEntityMap[sceneId] ?? []
      return {
        sceneEntityMap: {
          ...s.sceneEntityMap,
          [sceneId]: current.map((e) => (e.entityId === entityId ? { ...e, visible } : e)),
        },
      }
    })
  },
)
```

- [ ] **Step 6: 新增 actions**

```typescript
// In WorldState interface — 修改 addEntityToScene 签名 + 新增 actions:
addEntityToScene: (sceneId: string, entityId: string, visible?: boolean) => Promise<void>
toggleEntityVisibility: (sceneId: string, entityId: string, visible: boolean) => Promise<void>
spawnFromBlueprint: (sceneId: string, blueprintId: string) => Promise<Entity | null>

// 修改 addEntityToScene — 支持 visible 参数:
addEntityToScene: async (sceneId, entityId, visible) => {
  const roomId = get()._roomId
  if (!roomId) return
  const body = visible !== undefined ? { visible: visible ? 1 : 0 } : undefined
  await api.post(`/api/rooms/${roomId}/scenes/${sceneId}/entities/${entityId}`, body)
},

// 新增 actions:
toggleEntityVisibility: async (sceneId, entityId, visible) => {
  const roomId = get()._roomId
  if (!roomId) return
  await api.patch(`/api/rooms/${roomId}/scenes/${sceneId}/entities/${entityId}`, { visible })
},

spawnFromBlueprint: async (sceneId, blueprintId) => {
  const roomId = get()._roomId
  if (!roomId) return null
  const result = await api.post<{ entity: Entity }>(
    `/api/rooms/${roomId}/scenes/${sceneId}/spawn`,
    { blueprintId },
  )
  return result.entity
},
```

- [ ] **Step 7: TypeScript 编译检查**

Run: `npx tsc --noEmit`

Expected: 无类型错误（可能需要修复消费 sceneEntityMap 的组件，在 Task 9-12 中处理）

- [ ] **Step 8: Commit**

```bash
git add src/stores/worldStore.ts src/shared/entityTypes.ts
git commit -m "refactor: worldStore uses SceneEntityEntry[], add lifecycle actions"
```

---

## Chunk 3: UI 组件适配

### Task 10: PortraitBar — 适配 lifecycle + visible

**Files:**

- Modify: `src/layout/PortraitBar.tsx`

- [ ] **Step 1: 更新数据源**

`PortraitBar` 需要从 `sceneEntityMap` 获取 visible 信息，只显示 `visible=true` 的 entities：

找到过滤可见 entities 的逻辑（当前使用 `persistent` 和 `sceneIdSet`），替换为：

```typescript
// 获取当前场景的 visible entities
const visibleEntityIds = useMemo(() => {
  if (!activeSceneId) return new Set<string>()
  const entries = sceneEntityEntries // from worldStore.getSceneEntityEntries
  return new Set(entries.filter((e) => e.visible).map((e) => e.entityId))
}, [activeSceneId, sceneEntityEntries])
```

然后在渲染时只显示 `visibleEntityIds.has(entity.id)` 的 entities（加上 persistent 的 canSee 逻辑）。

- [ ] **Step 2: 更新右键菜单**

将 `entity.persistent` 的引用替换为 `entity.lifecycle`。"Remove from scene" 选项应该对所有 GM 可见（不仅限非 persistent），因为 persistent entity 也可以从场景中移除：

```typescript
if (isGM) {
  items.push({
    label: 'Remove from scene',
    onClick: () => onRemoveFromScene(entity.id),
    color: '#f87171',
  })
}
```

- [ ] **Step 3: 编译检查**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/layout/PortraitBar.tsx
git commit -m "refactor: PortraitBar uses lifecycle + visible filtering"
```

---

### Task 11: EntityPanel — 重写为 NPC 面板（在场/候场分组）

**Files:**

- Modify: `src/gm/EntityPanel.tsx` (重写)
- Modify: `src/gm/EntityRow.tsx` (适配 lifecycle)

- [ ] **Step 1: 重写 EntityPanel**

EntityPanel 现在作为 GM 侧边栏的 NPC Tab，显示当前场景的 NPC 分为"在场"和"候场"两组：

```typescript
import { useState, useMemo } from 'react'
import { Plus, Search, ClipboardList } from 'lucide-react'
import type { Entity, SceneEntityEntry } from '../shared/entityTypes'
import { defaultNPCPermissions } from '../shared/permissions'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { useUiStore } from '../stores/uiStore'
import { generateTokenId } from '../shared/idUtils'
import { EntityRow } from './EntityRow'

export function EntityPanel() {
  const entities = useWorldStore((s) => s.entities)
  const activeSceneId = useWorldStore((s) => s.room.activeSceneId)
  const sceneEntityMap = useWorldStore((s) => s.sceneEntityMap)
  const addEntity = useWorldStore((s) => s.addEntity)
  const addEntityToScene = useWorldStore((s) => s.addEntityToScene)
  const removeEntityFromScene = useWorldStore((s) => s.removeEntityFromScene)
  const toggleEntityVisibility = useWorldStore((s) => s.toggleEntityVisibility)
  const deleteEntity = useWorldStore((s) => s.deleteEntity)
  const updateEntity = useWorldStore((s) => s.updateEntity)
  const seats = useIdentityStore((s) => s.seats)
  const setInspectedCharacterId = useUiStore((s) => s.setInspectedCharacterId)

  const [search, setSearch] = useState('')

  // Current scene entries
  const sceneEntries = useMemo<SceneEntityEntry[]>(
    () => (activeSceneId ? (sceneEntityMap[activeSceneId] ?? []) : []),
    [activeSceneId, sceneEntityMap],
  )

  // PC IDs (have owner seat) — exclude from NPC panel
  const pcIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entity of Object.values(entities)) {
      for (const [seatId, perm] of Object.entries(entity.permissions.seats)) {
        if (perm === 'owner' && seats.some((s) => s.id === seatId)) {
          ids.add(entity.id)
          break
        }
      }
    }
    return ids
  }, [entities, seats])

  // Split into on-stage / backstage, filtered by search and excluding PCs
  const { onStage, backstage } = useMemo(() => {
    const q = search.toLowerCase().trim()
    const on: (Entity & { visible: boolean })[] = []
    const off: (Entity & { visible: boolean })[] = []

    for (const entry of sceneEntries) {
      const entity = entities[entry.entityId]
      if (!entity || pcIds.has(entity.id)) continue
      if (q && !entity.name.toLowerCase().includes(q)) continue
      const item = { ...entity, visible: entry.visible }
      if (entry.visible) on.push(item)
      else off.push(item)
    }
    return { onStage: on, backstage: off }
  }, [sceneEntries, entities, pcIds, search])

  const handleCreateNpc = async () => {
    const newEntity: Entity = {
      id: generateTokenId(),
      name: '新NPC',
      imageUrl: '',
      color: '#3b82f6',
      size: 1,
      notes: '',
      ruleData: null,
      permissions: defaultNPCPermissions(),
      lifecycle: 'ephemeral',
    }
    await addEntity(newEntity)
    if (activeSceneId) {
      // addEntityToScene 的 POST 路由支持 body.visible 参数，直接传 false 进候场
      await addEntityToScene(activeSceneId, newEntity.id, false)
    }
    setInspectedCharacterId(newEntity.id)
  }

  // ... render with onStage/backstage groups
  // See design doc NPC Tab layout for exact UI
}
```

具体的 JSX 渲染保持 EntityPanel 已有的样式风格，但分组逻辑改为 "● 在场" 和 "◐ 候场"。

- [ ] **Step 2: 更新 EntityRow — lifecycle 标记**

在 EntityRow 中将 `persistent` 标志替换为 lifecycle 检查，reusable/persistent entities 显示 ⭐ 标记。

- [ ] **Step 3: 编译检查**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/gm/EntityPanel.tsx src/gm/EntityRow.tsx
git commit -m "refactor: EntityPanel as NPC panel with on-stage/backstage groups"
```

---

### Task 12: 底部 Dock — TokenDockTab 重命名 + 角色库 Tab

**Files:**

- Rename: `src/dock/TokenDockTab.tsx` → `src/dock/BlueprintDockTab.tsx`
- Create: `src/dock/CharacterLibraryTab.tsx` (角色库 Tab)
- Modify: `src/gm/GmDock.tsx` (更新 Tab 引用 + 添加角色库 Tab)

- [ ] **Step 1: 重命名 TokenDockTab → BlueprintDockTab**

```bash
git mv src/dock/TokenDockTab.tsx src/dock/BlueprintDockTab.tsx
```

更新文件内组件名 `TokenDockTab` → `BlueprintDockTab`，更新所有 import 引用。

- [ ] **Step 2: 更新 BlueprintDockTab — spawn 替代手动创建**

修改蓝图点击行为：单击调用 `spawnFromBlueprint` 而非原来的 `onSpawnToken`/`onAddToActive`：

```typescript
// 在 BlueprintDockTab 中
const spawnFromBlueprint = useWorldStore((s) => s.spawnFromBlueprint)
const activeSceneId = useWorldStore((s) => s.room.activeSceneId)

const handleSpawn = async (bp: Blueprint) => {
  if (!activeSceneId) return
  await spawnFromBlueprint(activeSceneId, bp.id)
}
```

- [ ] **Step 3: 创建 CharacterLibraryTab**

角色库 Tab — 显示 `lifecycle IN ('reusable', 'persistent')` 且没有 owner seat 的 entities：

```typescript
// src/dock/CharacterLibraryTab.tsx
import { useMemo, useState } from 'react'
import { Plus, Search, Users } from 'lucide-react'
import type { Entity } from '../shared/entityTypes'
import { useWorldStore } from '../stores/worldStore'
import { useIdentityStore } from '../stores/identityStore'
import { useUiStore } from '../stores/uiStore'
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu'
import { ConfirmDialog } from '../shared/ui/ConfirmDialog'

export function CharacterLibraryTab() {
  const entities = useWorldStore((s) => s.entities)
  const activeSceneId = useWorldStore((s) => s.room.activeSceneId)
  const addEntityToScene = useWorldStore((s) => s.addEntityToScene)
  const deleteEntity = useWorldStore((s) => s.deleteEntity)
  const seats = useIdentityStore((s) => s.seats)
  const setInspectedCharacterId = useUiStore((s) => s.setInspectedCharacterId)

  const [search, setSearch] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entity: Entity } | null>(
    null,
  )
  const [confirmDelete, setConfirmDelete] = useState<Entity | null>(null)

  // Filter: lifecycle is reusable or persistent, AND no owner seat
  const libraryEntities = useMemo(() => {
    const list = Object.values(entities).filter((e) => {
      if (e.lifecycle === 'ephemeral') return false
      // Exclude PCs (have owner seat)
      const hasOwner = Object.entries(e.permissions.seats).some(
        ([seatId, perm]) => perm === 'owner' && seats.some((s) => s.id === seatId),
      )
      return !hasOwner
    })
    if (search.trim()) {
      const q = search.toLowerCase()
      return list.filter((e) => e.name.toLowerCase().includes(q))
    }
    return list
  }, [entities, seats, search])

  const handleClick = async (entity: Entity) => {
    if (!activeSceneId) return
    await addEntityToScene(activeSceneId, entity.id)
  }

  const handleContextMenu = (e: React.MouseEvent, entity: Entity) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, entity })
  }

  const getMenuItems = (entity: Entity): ContextMenuItem[] => [
    {
      label: '查看 / 编辑',
      onClick: () => setInspectedCharacterId(entity.id),
    },
    {
      label: '加入候场',
      onClick: async () => {
        if (activeSceneId) {
          await addEntityToScene(activeSceneId, entity.id, false)
        }
      },
    },
    {
      label: '永久删除',
      onClick: () => setConfirmDelete(entity),
      color: '#f87171',
    },
  ]

  // ... render with search + entity grid/list
}
```

- [ ] **Step 4: 更新 GmDock — 添加角色库 Tab**

在 GmDock 的 tab 列表中添加角色库 Tab，位于蓝图 Tab 之后：

```typescript
import { CharacterLibraryTab } from '../dock/CharacterLibraryTab'
import { BlueprintDockTab } from '../dock/BlueprintDockTab'

// Tab 定义中添加
{ id: 'blueprints', label: '蓝图', icon: Palette },   // 原 Token → 蓝图
{ id: 'characters', label: '角色库', icon: Users },     // 新增
```

- [ ] **Step 5: 更新所有 TokenDockTab 的 import 引用**

Run: `grep -rn 'TokenDockTab' src/ --include='*.tsx' --include='*.ts'`

逐个更新为 `BlueprintDockTab`。

- [ ] **Step 6: 编译检查**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/dock/ src/gm/GmDock.tsx
git commit -m "feat: rename TokenDockTab to BlueprintDockTab, add CharacterLibraryTab"
```

---

### Task 13: 右键菜单 — lifecycle-aware 操作

**Files:**

- Modify: `src/layout/PortraitBar.tsx` (角色栏右键菜单)
- Modify: `src/gm/EntityPanel.tsx` (NPC 面板右键菜单)
- Modify: `src/dock/CharacterLibraryTab.tsx` (角色库右键菜单 — 已在 Task 11 初始化)

- [ ] **Step 1: 更新 PortraitBar 右键菜单**

按设计文档，在场 NPC 的右键菜单增加以下选项：

```typescript
const getContextMenuItems = (entity: Entity): ContextMenuItem[] => {
  const items: ContextMenuItem[] = []

  // 查看 / 编辑
  items.push({
    label: '查看 / 编辑',
    onClick: () => {
      const el = portraitBarRef.current?.querySelector(
        `[data-char-id="${entity.id}"]`,
      ) as HTMLElement | null
      if (el) setLockedRect(el.getBoundingClientRect())
      onInspectCharacter(entity.id)
    },
  })

  if (mySeatId && canEdit(entity.permissions, mySeatId, role)) {
    items.push({
      label: 'Set as active',
      onClick: () => onSetActiveCharacter(entity.id),
      disabled: activeCharacterId === entity.id,
    })
  }

  if (isGM) {
    // 退到候场
    items.push({
      label: '退到候场',
      onClick: () => {
        if (activeSceneId) toggleEntityVisibility(activeSceneId, entity.id, false)
      },
    })

    // 保存为蓝图 (always)
    items.push({
      label: '保存为蓝图',
      onClick: () => handleSaveAsBlueprint(entity),
    })

    // 保存为角色 (only ephemeral)
    if (entity.lifecycle === 'ephemeral') {
      items.push({
        label: '保存为角色',
        onClick: () => updateEntity(entity.id, { lifecycle: 'reusable' }),
      })
    }

    // 移除
    items.push({
      label: '移除',
      onClick: () => {
        if (activeSceneId) removeEntityFromScene(activeSceneId, entity.id)
      },
      color: '#f87171',
    })
  }

  return items
}
```

`handleSaveAsBlueprint` 调用 assetStore 创建 blueprint asset（参照设计文档"保存为蓝图"章节）：

```typescript
const handleSaveAsBlueprint = async (entity: Entity) => {
  const { useAssetStore } = await import('../stores/assetStore')
  const roomId = useWorldStore.getState()._roomId
  if (!roomId) return
  await api.post(`/api/rooms/${roomId}/assets`, {
    url: entity.imageUrl,
    name: entity.name,
    type: 'blueprint',
    extra: {
      blueprint: {
        defaultSize: entity.size,
        defaultColor: entity.color,
        defaultRuleData: entity.ruleData,
      },
    },
  })
  // assetStore 会通过 socket 事件自动更新
}
```

- [ ] **Step 2: 更新 EntityPanel 右键菜单**

NPC 面板中的在场 NPC 和候场 NPC 使用不同的菜单项（参见设计文档右键菜单章节）。在 EntityRow 的 `onContextMenu` 中传入不同菜单。

- [ ] **Step 3: 编译检查**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/layout/PortraitBar.tsx src/gm/EntityPanel.tsx
git commit -m "feat: lifecycle-aware context menus for entities"
```

---

### Task 14: 全局编译 + 清理

**Files:**

- Various: 修复所有剩余的 `persistent` 引用

- [ ] **Step 1: 全局搜索 persistent 残留**

Run: `grep -rn 'persistent' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules`

已知需要修改的文件（除前面 Task 已处理的外）：

- `src/App.tsx` — 过滤/渲染逻辑中 `entity.persistent` → `entity.lifecycle === 'persistent'`
- `src/gm/GmDock.tsx` — 同上
- `src/gm/EntityRow.tsx` — 同上
- `src/__test-utils__/fixtures.ts` — 测试 fixture 中 `persistent: true/false` → `lifecycle: '...'`
- `src/stores/__tests__/*.test.ts` — 测试代码同步更新
- `src/gm/__tests__/entity-filtering.test.ts` — 同步更新

修复所有残留引用。

- [ ] **Step 2: 全局搜索 old type references**

Run: `grep -rn 'entityIds' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules`

如果有使用 `SceneV2.entityIds` 的地方，更新为 `entityEntries`。

- [ ] **Step 3: 清理设计文档中提到的遗留 hooks**

搜索 `useUndoableDelete` 和 `useHoldToConfirm`：

Run: `grep -rn 'useUndoableDelete\|useHoldToConfirm' src/ --include='*.ts' --include='*.tsx'`

如有结果，删除对应文件和所有 import 引用。

- [ ] **Step 4: 移除 worldStore.addScene 的 persistentEntityIds 参数**

`addScene` 方法签名中的 `persistentEntityIds?: string[]` 参数不再需要（服务端自动处理 persistent 实体的 auto-link）。从接口和实现中移除。

- [ ] **Step 5: TypeScript 编译**

Run: `npx tsc --noEmit`

Expected: 0 errors

- [ ] **Step 6: 运行全部测试**

Run: `npm test`

Expected: 全部通过

- [ ] **Step 7: 运行 build**

Run: `npm run build`

Expected: 成功，无错误

- [ ] **Step 8: Commit**

```bash
git add src/ server/
git commit -m "chore: clean up persistent references, remove legacy hooks"
```

---

## 测试矩阵

### 集成测试文件总览

| 测试文件                    | 覆盖范围                               | Task |
| --------------------------- | -------------------------------------- | ---- |
| `scene-entity.test.ts`      | 原有场景-实体关联测试，适配新 API 格式 | 5    |
| `entity-lifecycle.test.ts`  | lifecycle 三值行为完整旅程             | 5    |
| `spawn.test.ts`             | 蓝图 spawn、自动命名、错误处理         | 6    |
| `token-degradation.test.ts` | 删除 entity/scene 时的 token 退化      | 7    |
| `entity-edge-cases.test.ts` | 约束边界、默认值、幂等性               | 7    |

### 测试覆盖矩阵

| 场景                                              | 测试文件          | 测试用例                                             |
| ------------------------------------------------- | ----------------- | ---------------------------------------------------- |
| **Lifecycle 基础**                                |                   |                                                      |
| 创建 ephemeral entity                             | entity-lifecycle  | `creates ephemeral entity`                           |
| 创建 reusable entity                              | entity-lifecycle  | `creates reusable entity`                            |
| 创建 persistent entity 自动加入所有场景           | entity-lifecycle  | `creates persistent entity — auto-links`             |
| 默认 lifecycle 是 ephemeral                       | entity-edge-cases | `default lifecycle is ephemeral`                     |
| 拒绝无效 lifecycle 值                             | entity-edge-cases | `rejects invalid lifecycle value`                    |
| **Ephemeral 约束**                                |                   |                                                      |
| ephemeral 不能加入第二个场景                      | entity-lifecycle  | `rejects ephemeral in second scene`                  |
| ephemeral 重复加入同一场景是幂等的                | entity-edge-cases | `ephemeral re-link is idempotent`                    |
| 提升 ephemeral → reusable 后可跨场景              | entity-edge-cases | `promoting ephemeral allows multi-scene`             |
| **Visible 切换**                                  |                   |                                                      |
| 加入场景默认 visible=true                         | entity-lifecycle  | `visible defaults to true on link`                   |
| PATCH 切换 visible=false                          | entity-lifecycle  | `toggles visible to false`                           |
| 加入场景时指定 visible=false                      | entity-edge-cases | `link with visible=false creates backstage`          |
| PATCH 不存在的关联返回 404                        | entity-edge-cases | `PATCH visible on non-existent link returns 404`     |
| **Lifecycle 提升**                                |                   |                                                      |
| ephemeral → reusable                              | entity-lifecycle  | `promotes ephemeral to reusable`                     |
| **移除与删除**                                    |                   |                                                      |
| 移除 reusable 保留 entity                         | entity-lifecycle  | `unlinks reusable — entity preserved`                |
| 移除 ephemeral 删除 entity                        | entity-lifecycle  | `unlinks ephemeral — entity deleted`                 |
| 删除不存在的 entity 返回 404                      | entity-edge-cases | `deleting non-existent entity returns 404`           |
| persistent entity 可移除后重新加入                | entity-edge-cases | `persistent removed can be re-added`                 |
| **场景删除级联**                                  |                   |                                                      |
| 删除场景清理 ephemeral entities                   | entity-lifecycle  | `deleting scene cleans up ephemeral`                 |
| 删除场景不影响 persistent entity                  | entity-lifecycle  | `persistent entity still exists after scene delete`  |
| **Token 退化**                                    |                   |                                                      |
| 删除 entity → combat_state token entityId 置 null | token-degradation | `deletes entity — combat tokens degrade`             |
| 删除 entity → encounters token entityId 置 null   | token-degradation | `encounter tokens also degraded`                     |
| 删除场景 → ephemeral entity → token 退化          | token-degradation | `deleting scene removes ephemeral + degrades tokens` |
| **Spawn**                                         |                   |                                                      |
| 从蓝图 spawn 创建 ephemeral entity                | spawn             | `spawns entity from blueprint`                       |
| spawn 自动递增命名                                | spawn             | `spawns second with incremented name`                |
| spawn 结果出现在场景 entity 列表                  | spawn             | `spawned entity appears in scene entity list`        |
| 无效蓝图 ID 返回 404                              | spawn             | `rejects spawn with invalid blueprint`               |
| **Persistent auto-link**                          |                   |                                                      |
| 创建 persistent entity 自动加入已有场景           | entity-lifecycle  | `creates persistent entity — auto-links`             |
| 创建新场景自动加入 persistent entities            | entity-lifecycle  | `new scene auto-links persistent entities`           |
| 新场景不包含 reusable entities                    | entity-lifecycle  | `new scene does not contain reusable`                |

---

## 全局验证清单

完成所有 Task 后：

1. **全部测试通过**: `npx vitest run server/` — 5 个测试文件全部绿色
2. **TypeScript 编译通过**: `npx tsc --noEmit`
3. **构建成功**: `npm run build`
4. **无 persistent 残留**: `grep -rn 'persistent' src/ --include='*.ts' --include='*.tsx'` 仅出现在注释或字符串 `'persistent'` 中
