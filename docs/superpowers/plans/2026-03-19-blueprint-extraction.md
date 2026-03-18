# Blueprint 独立建表实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Blueprint 从 assets 表提取为独立的 blueprints 表，消除 `type='blueprint'` + `extra.blueprint` 的职责混用。

**Architecture:** 新建 `blueprints` 表（id, name, image_url, tags, defaults, created_at），实现完整 CRUD 路由 + Socket.io 广播，更新 worldStore 和 UI 数据源。entities.blueprint_id 外键改指向 blueprints 表（ON DELETE SET NULL）。清空 room.db 重建，不需要迁移脚本。

**Tech Stack:** Express 5 + better-sqlite3 + Socket.io + zustand + React + vitest

**Spec:** `docs/design/14-资产系统重构实施规格.md`（分支 `docs/asset-impl-spec`）

---

## 文件结构

### 新建文件
| 文件 | 职责 |
|------|------|
| `server/routes/blueprints.ts` | Blueprint CRUD 路由 + Socket.io 广播 |
| `server/__tests__/scenarios/blueprints-crud.test.ts` | Blueprint 服务端集成测试 |

### 修改文件
| 文件 | 改动摘要 |
|------|---------|
| `server/schema.ts` | 新增 blueprints 表 DDL；entities.blueprint_id 外键改指向 |
| `server/routes/scenes.ts` | spawn 路由改读 blueprints 表 |
| `server/routes/bundle.ts` | bundle 响应加 blueprints 数组 |
| `server/__tests__/helpers/test-server.ts` | 注册 blueprintRoutes |
| `src/shared/entityTypes.ts` | Blueprint 接口改用 defaults blob |
| `src/shared/assetTypes.ts` | AssetMeta.type 移除 'blueprint'，移除 blueprint? 字段 |
| `src/shared/bundleTypes.ts` | BundleResponse 新增 blueprints 字段 |
| `src/shared/socketEvents.ts` | 新增 blueprint:created/updated/deleted 事件 |
| `src/stores/worldStore.ts` | 新增 blueprints slice + 改 saveEntityAsBlueprint + socket 监听 |
| `src/dock/BlueprintDockTab.tsx` | 数据源改为 blueprints store |
| `src/layout/PortraitBar.tsx` | saveEntityAsBlueprint 调用适配 |
| `server/__tests__/scenarios/spawn.test.ts` | 改用 POST /blueprints 创建蓝图 |
| `server/__tests__/bundle.test.ts` | 验证 bundle 含 blueprints |
| `server/__tests__/scenarios/asset-roundtrip.test.ts` | 移除 blueprint 相关断言 |
| `server/__tests__/schema.test.ts` | 验证 blueprints 表存在 |
| `src/stores/__tests__/worldStore.test.ts` | 移除 `type:'blueprint'` 和 `blueprint?` 字段引用 |

---

### Task 1: Schema — 新增 blueprints 表

**Files:**
- Modify: `server/schema.ts:60-68` (entities 表 FK) + L148 附近 (新增表)
- Test: `server/__tests__/schema.test.ts`

- [ ] **Step 1: Write failing test — blueprints 表存在**

在 `server/__tests__/schema.test.ts` 的 `initRoomSchema` describe 块中，在 `creates all expected tables` 测试里新增断言：

```typescript
expect(names).toContain('blueprints')
```

- [ ] **Step 2: Write failing test — blueprint FK cascade**

在同一 describe 块新增测试：

```typescript
it('enforces entities.blueprint_id ON DELETE SET NULL', () => {
  initRoomSchema(db)
  db.prepare("INSERT INTO blueprints (id, name, image_url, created_at) VALUES ('bp1', 'Goblin', '', 1)").run()
  db.prepare("INSERT INTO entities (id, name, blueprint_id) VALUES ('e1', 'Goblin 1', 'bp1')").run()

  db.prepare("DELETE FROM blueprints WHERE id = 'bp1'").run()
  const entity = db.prepare("SELECT blueprint_id FROM entities WHERE id = 'e1'").get() as { blueprint_id: string | null }
  expect(entity.blueprint_id).toBeNull()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/schema.test.ts --reporter=verbose`
Expected: FAIL — "blueprints" table not found, FK test fails

- [ ] **Step 4: Add blueprints table to schema.ts**

在 `server/schema.ts` 的 `initRoomSchema` 函数中，在 `showcase_items` 表定义之后、索引定义之前，新增：

```sql
-- Blueprints (entity template factory)
CREATE TABLE IF NOT EXISTS blueprints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  image_url TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  defaults TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL
);
```

- [ ] **Step 5: Update entities table FK**

在 `server/schema.ts` 中，将 entities 表的 `blueprint_id TEXT` 改为：

```sql
blueprint_id TEXT REFERENCES blueprints(id) ON DELETE SET NULL
```

- [ ] **Step 6: Add blueprints index**

在索引区域新增：

```sql
CREATE INDEX IF NOT EXISTS idx_blueprints_created ON blueprints(created_at);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/schema.test.ts --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add server/schema.ts server/__tests__/schema.test.ts
git commit -m "feat: add blueprints table and blueprint_id FK"
```

---

### Task 2: 共享类型定义更新

**Files:**
- Modify: `src/shared/entityTypes.ts:42-49`
- Modify: `src/shared/assetTypes.ts:1-19`
- Modify: `src/shared/bundleTypes.ts:17-28`
- Modify: `src/shared/socketEvents.ts:74-77`

**注意：** 类型改动会导致下游编译错误。本 task 只改类型定义，下游文件在后续 task 中逐一修复。在本 task 完成后，`tsc -b` 会报错，这是预期的——类型系统在帮我们找到所有需要改的地方。

- [ ] **Step 1: Update Blueprint interface**

在 `src/shared/entityTypes.ts` 中，将 Blueprint 接口改为：

```typescript
export interface Blueprint {
  id: string
  name: string
  imageUrl: string
  tags: string[]
  defaults: {
    color: string
    width: number
    height: number
    ruleData?: unknown
  }
  createdAt: number
}
```

- [ ] **Step 2: Update AssetMeta type**

在 `src/shared/assetTypes.ts` 中：
- `type` 联合改为 `'image' | 'handout'`
- 移除 `blueprint?` 可选字段

```typescript
export interface AssetMeta {
  id: string
  url: string
  name: string
  type: 'image' | 'handout'
  tags: string[]
  width?: number
  height?: number
  createdAt: number
  handout?: {
    title: string
    description: string
  }
}
```

- [ ] **Step 3: Update BundleResponse**

在 `src/shared/bundleTypes.ts` 中，在 import 区域新增 `Blueprint` import，然后在 `BundleResponse` 接口中新增 `blueprints` 字段：

```typescript
import type { Entity, SceneEntityEntry, Blueprint } from './entityTypes'
```

```typescript
export interface BundleResponse {
  room: BundleRoomInfo
  scenes: Scene[]
  entities: Entity[]
  sceneEntityMap: Record<string, SceneEntityEntry[]>
  seats: unknown[]
  assets: Record<string, unknown>[]
  blueprints: Blueprint[]
  chat: ChatMessage[]
  teamTrackers: TeamTracker[]
  showcase: ShowcaseItem[]
  tactical: (TacticalInfo & { tokens: unknown[] }) | null
}
```

- [ ] **Step 4: Add blueprint Socket.io events**

在 `src/shared/socketEvents.ts` 中，在 `ServerToClientEvents` 接口的 Assets 区段之后新增：

```typescript
// ── Blueprints ──
'blueprint:created': (blueprint: Blueprint) => void
'blueprint:updated': (blueprint: Blueprint) => void
'blueprint:deleted': (data: { id: string }) => void
```

同时在文件顶部 import 中加入 Blueprint：

```typescript
import type { Entity, MapToken, Blueprint } from './entityTypes'
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/entityTypes.ts src/shared/assetTypes.ts src/shared/bundleTypes.ts src/shared/socketEvents.ts
git commit -m "feat: update shared types for blueprint extraction"
```

---

### Task 3: Blueprint CRUD 路由

**Files:**
- Create: `server/routes/blueprints.ts`
- Modify: `server/__tests__/helpers/test-server.ts` (注册路由)
- Test: `server/__tests__/scenarios/blueprints-crud.test.ts`

- [ ] **Step 1: Write blueprints-crud.test.ts**

新建 `server/__tests__/scenarios/blueprints-crud.test.ts`：

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestRoom, waitForSocketEvent, type TestContext } from '../helpers/test-server'

let ctx: TestContext

beforeAll(async () => {
  ctx = await setupTestRoom('blueprint-crud-test')
})
afterAll(async () => {
  await ctx.cleanup()
})

describe('Blueprint CRUD', () => {
  let bpId: string

  it('creates a blueprint', async () => {
    const promise = waitForSocketEvent(ctx.socket, 'blueprint:created')
    const { status, data } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/blueprints`, {
      name: 'Goblin',
      imageUrl: '/uploads/goblin.png',
      defaults: { color: '#22c55e', width: 1, height: 1 },
      tags: ['Humanoid'],
    })
    expect(status).toBe(201)
    const bp = data as Record<string, unknown>
    bpId = bp.id as string
    expect(bp.name).toBe('Goblin')
    expect(bp.imageUrl).toBe('/uploads/goblin.png')
    expect(bp.tags).toEqual(['Humanoid'])
    const defaults = bp.defaults as Record<string, unknown>
    expect(defaults.color).toBe('#22c55e')

    const event = await promise
    expect((event as Record<string, unknown>).id).toBe(bpId)
  })

  it('lists blueprints', async () => {
    const { status, data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/blueprints`)
    expect(status).toBe(200)
    const list = data as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]!.name).toBe('Goblin')
  })

  it('updates a blueprint', async () => {
    const promise = waitForSocketEvent(ctx.socket, 'blueprint:updated')
    const { status, data } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/blueprints/${bpId}`, {
      name: 'Goblin Chief',
      defaults: { color: '#ff0000', width: 2, height: 2 },
    })
    expect(status).toBe(200)
    expect((data as Record<string, unknown>).name).toBe('Goblin Chief')

    const event = await promise
    expect((event as Record<string, unknown>).name).toBe('Goblin Chief')
  })

  it('returns 404 for non-existent blueprint', async () => {
    const { status } = await ctx.api('PATCH', `/api/rooms/${ctx.roomId}/blueprints/nonexistent`, {
      name: 'nope',
    })
    expect(status).toBe(404)
  })

  it('deletes a blueprint', async () => {
    const promise = waitForSocketEvent(ctx.socket, 'blueprint:deleted')
    const { status } = await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/blueprints/${bpId}`)
    expect(status).toBe(204)

    const event = await promise
    expect((event as Record<string, unknown>).id).toBe(bpId)

    const { data } = await ctx.api('GET', `/api/rooms/${ctx.roomId}/blueprints`)
    expect(data as unknown[]).toHaveLength(0)
  })

  it('ON DELETE SET NULL — entity.blueprint_id nulled when blueprint deleted', async () => {
    // Create blueprint
    const { data: bpData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/blueprints`, {
      name: 'Skeleton',
      imageUrl: '/uploads/skeleton.png',
      defaults: { color: '#888', width: 1, height: 1 },
    })
    const skeletonBpId = (bpData as Record<string, unknown>).id as string

    // Create a scene, then spawn from blueprint
    const { data: sceneData } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/scenes`, {
      name: 'Dungeon',
    })
    const sceneId = (sceneData as Record<string, unknown>).id as string
    const { data: spawnData } = await ctx.api(
      'POST',
      `/api/rooms/${ctx.roomId}/scenes/${sceneId}/spawn`,
      { blueprintId: skeletonBpId },
    )
    const entityId = ((spawnData as Record<string, unknown>).entity as Record<string, unknown>)
      .id as string

    // Delete blueprint
    await ctx.api('DELETE', `/api/rooms/${ctx.roomId}/blueprints/${skeletonBpId}`)

    // Verify entity still exists but blueprint_id is null
    const { data: entityData } = await ctx.api(
      'GET',
      `/api/rooms/${ctx.roomId}/entities/${entityId}`,
    )
    const entity = entityData as Record<string, unknown>
    expect(entity.id).toBe(entityId)
    expect(entity.blueprintId).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/scenarios/blueprints-crud.test.ts --reporter=verbose`
Expected: FAIL — route not found (404)

- [ ] **Step 3: Create server/routes/blueprints.ts**

```typescript
// server/routes/blueprints.ts — Blueprint CRUD routes
import { Router } from 'express'
import crypto from 'crypto'
import type { TypedServer } from '../socketTypes'
import type { Blueprint } from '../../src/shared/entityTypes'
import { withRoom } from '../middleware'
import { toCamel, parseJsonFields } from '../db'

function toBlueprint(row: Record<string, unknown>): Blueprint {
  return parseJsonFields(toCamel(row), 'defaults', 'tags') as unknown as Blueprint
}

export function blueprintRoutes(dataDir: string, io: TypedServer): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/blueprints', room, (req, res) => {
    const rows = req
      .roomDb!.prepare('SELECT * FROM blueprints ORDER BY created_at DESC')
      .all() as Record<string, unknown>[]
    res.json(rows.map(toBlueprint))
  })

  router.post('/api/rooms/:roomId/blueprints', room, (req, res) => {
    const body = req.body as Record<string, unknown>
    const id = crypto.randomUUID()
    const name = (body.name as string) || ''
    const imageUrl = (body.imageUrl as string) || ''
    const tags = body.tags ? JSON.stringify(body.tags) : '[]'
    const defaults = body.defaults ? JSON.stringify(body.defaults) : '{}'

    req
      .roomDb!.prepare(
        'INSERT INTO blueprints (id, name, image_url, tags, defaults, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, name, imageUrl, tags, defaults, Date.now())

    const bp = toBlueprint(
      req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('blueprint:created', bp)
    res.status(201).json(bp)
  })

  router.patch('/api/rooms/:roomId/blueprints/:id', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
    if (!row) {
      res.status(404).json({ error: 'Blueprint not found' })
      return
    }

    const body = req.body as Record<string, unknown>
    const updates: string[] = []
    const params: unknown[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      params.push(body.name)
    }
    if (body.imageUrl !== undefined) {
      updates.push('image_url = ?')
      params.push(body.imageUrl)
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?')
      params.push(JSON.stringify(body.tags))
    }
    if (body.defaults !== undefined) {
      updates.push('defaults = ?')
      params.push(JSON.stringify(body.defaults))
    }

    if (updates.length === 0) {
      res.json(toBlueprint(row))
      return
    }

    params.push(req.params.id)
    req.roomDb!.prepare(`UPDATE blueprints SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    const updated = toBlueprint(
      req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(req.params.id) as Record<
        string,
        unknown
      >,
    )
    io.to(req.roomId!).emit('blueprint:updated', updated)
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/blueprints/:id', room, (req, res) => {
    const row = req.roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined
    if (!row) {
      res.status(404).json({ error: 'Blueprint not found' })
      return
    }
    req.roomDb!.prepare('DELETE FROM blueprints WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('blueprint:deleted', { id: req.params.id as string })
    res.status(204).end()
  })

  return router
}
```

- [ ] **Step 4: Register blueprint routes in test-server.ts**

在 `server/__tests__/helpers/test-server.ts` 中：
1. 顶部新增 import：`import { blueprintRoutes } from '../../routes/blueprints'`
2. 在 `app.use(assetRoutes(dataDir, io))` 之后添加：`app.use(blueprintRoutes(dataDir, io))`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/__tests__/scenarios/blueprints-crud.test.ts --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add server/routes/blueprints.ts server/__tests__/scenarios/blueprints-crud.test.ts server/__tests__/helpers/test-server.ts
git commit -m "feat: blueprint CRUD routes with integration tests"
```

---

### Task 4: Spawn 路由改读 blueprints 表

**Files:**
- Modify: `server/routes/scenes.ts:272-345`
- Test: `server/__tests__/scenarios/spawn.test.ts`

- [ ] **Step 1: Rewrite spawn.test.ts**

替换 `server/__tests__/scenarios/spawn.test.ts` 中的 blueprint 创建方式。将 `creates a blueprint asset` 测试改为：

```typescript
it('creates a blueprint', async () => {
  const { data, status } = await ctx.api('POST', `/api/rooms/${ctx.roomId}/blueprints`, {
    name: '哥布林',
    imageUrl: '/uploads/goblin.png',
    defaults: { color: '#22c55e', width: 1, height: 1, ruleData: {} },
  })
  expect(status).toBe(201)
  blueprintId = (data as { id: string }).id
})
```

同时更新 spawn 结果断言（entity.color 等依然成立）。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/scenarios/spawn.test.ts --reporter=verbose`
Expected: FAIL — spawn route still reads from assets table, blueprint not found

- [ ] **Step 3: Update spawn route in scenes.ts**

在 `server/routes/scenes.ts` 的 spawn 路由（L272-345）中，将 asset 查询替换为 blueprint 查询：

```typescript
// OLD:
const asset = req
  .roomDb!.prepare("SELECT * FROM assets WHERE id = ? AND type = 'blueprint'")
  .get(blueprintId) as Record<string, unknown> | undefined
if (!asset) { ... }
const extra = JSON.parse((asset.extra as string) || '{}') as Record<string, unknown>
const bp = (extra.blueprint || {}) as Record<string, unknown>

// NEW:
const bpRow = req
  .roomDb!.prepare('SELECT * FROM blueprints WHERE id = ?')
  .get(blueprintId) as Record<string, unknown> | undefined
if (!bpRow) {
  res.status(404).json({ error: 'Blueprint not found' })
  return
}
const defaults = JSON.parse((bpRow.defaults as string) || '{}') as Record<string, unknown>
```

将 entity INSERT 中的字段引用改为：

```typescript
const count = req
  .roomDb!.prepare('SELECT COUNT(*) as c FROM entities WHERE blueprint_id = ?')
  .get(blueprintId) as { c: number }
const name = `${(bpRow.name as string) || 'NPC'} ${count.c + 1}`

// INSERT 参数:
.run(
  entityId,
  name,
  bpRow.image_url || '',         // was: asset.url
  defaults.color || '#888888',   // was: bp.defaultColor
  defaults.width || 1,           // was: bp.defaultSize
  defaults.height || 1,          // was: bp.defaultSize (now separate)
  '',
  JSON.stringify(defaults.ruleData || {}),
  JSON.stringify({ default: 'observer', seats: {} }),
  blueprintId,
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/scenarios/spawn.test.ts --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/scenes.ts server/__tests__/scenarios/spawn.test.ts
git commit -m "feat: spawn route reads from blueprints table"
```

---

### Task 5: Bundle 路由新增 blueprints

**Files:**
- Modify: `server/routes/bundle.ts:16-114`
- Test: `server/__tests__/bundle.test.ts`

- [ ] **Step 1: Write failing test**

在 `server/__tests__/bundle.test.ts` 的 `returns all required top-level keys` 测试中新增断言：

```typescript
expect(body).toHaveProperty('blueprints')
```

同时新增一个独立测试：

```typescript
it('blueprints array is present and parsed', async () => {
  const res = await request(testApp).get(`/api/rooms/${roomId}/bundle`)
  const { blueprints } = res.body as { blueprints: unknown[] }
  expect(Array.isArray(blueprints)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/bundle.test.ts --reporter=verbose`
Expected: FAIL — no "blueprints" key in bundle response

- [ ] **Step 3: Add blueprints query to bundle.ts**

在 `server/routes/bundle.ts` 的 `getBundle` 函数中，在 transaction 内（showcase 查询之后）新增：

```typescript
const blueprints = (
  roomDb.prepare('SELECT * FROM blueprints ORDER BY created_at DESC').all() as Record<string, unknown>[]
).map((r) => parseJsonFields(toCamel(r), 'defaults', 'tags'))
```

在 transaction return 对象中加入 `blueprints`。在最终 return 的 BundleResponse 中加入 `blueprints: data.blueprints`。

**还需要在 bundle.test.ts 的 `beforeAll` 中注册 blueprintRoutes：**

在 bundle.test.ts 中：
1. 新增 import：`import { blueprintRoutes } from '../routes/blueprints'`
2. 在 `app.use(bundleRoutes(dataDir, io))` 之前添加：`app.use(blueprintRoutes(dataDir, io))`
（bundle.test.ts 使用独立 server 而非 test-server.ts helper）

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/bundle.test.ts --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/bundle.ts server/__tests__/bundle.test.ts
git commit -m "feat: include blueprints in bundle response"
```

---

### Task 6: 注册 Blueprint 路由到主应用

**Files:**
- Modify: `server/index.ts:20,96`

- [ ] **Step 1: 注册路由**

在 `server/index.ts` 中：
1. L20 附近新增 import：`import { blueprintRoutes } from './routes/blueprints'`
2. L96（`app.use(assetRoutes(DATA_DIR, io))` 之后）新增：`app.use(blueprintRoutes(DATA_DIR, io))`

- [ ] **Step 2: Commit**

```bash
git add server/index.ts
git commit -m "chore: register blueprint routes in server"
```

---

### Task 7: worldStore — blueprints slice

**Files:**
- Modify: `src/stores/worldStore.ts`

- [ ] **Step 1: 新增 Blueprint import 和 state 字段**

在 `src/stores/worldStore.ts` 顶部 import 中加入 Blueprint：
```typescript
import type { Entity, MapToken, Atmosphere, SceneEntityEntry, Blueprint } from '../shared/entityTypes'
```

在 `WorldState` 接口中新增：
```typescript
blueprints: Blueprint[]
```

在 store 初始状态中新增：
```typescript
blueprints: [],
```

在 `WorldState` 接口中新增 actions：
```typescript
// Blueprint actions
createBlueprint: (data: { name: string; imageUrl: string; defaults: Blueprint['defaults']; tags?: string[] }) => Promise<Blueprint | null>
updateBlueprint: (id: string, updates: Partial<Pick<Blueprint, 'name' | 'imageUrl' | 'defaults' | 'tags'>>) => Promise<void>
deleteBlueprint: (id: string) => Promise<void>
```

- [ ] **Step 2: 更新 loadAll — 加载 blueprints**

在 `loadAll` 函数的 return 对象中新增：

```typescript
blueprints: bundle.blueprints,
```

- [ ] **Step 3: 更新 normalizeAsset — 移除 blueprint 逻辑**

在 `normalizeAsset` 函数中，移除 blueprint 展开逻辑：

```typescript
// REMOVE this line:
...(extra.blueprint ? { blueprint: extra.blueprint as AssetMeta['blueprint'] } : {}),
```

- [ ] **Step 4: 新增 blueprint socket 事件监听**

在 `registerSocketEvents` 函数中，在 Asset 事件区段之后新增：

```typescript
// ── Blueprint events ──
socket.on('blueprint:created', (bp: Blueprint) => {
  set((s) => ({ blueprints: [bp, ...s.blueprints] }))
})
socket.on('blueprint:updated', (bp: Blueprint) => {
  set((s) => ({
    blueprints: s.blueprints.map((b) => (b.id === bp.id ? bp : b)),
  }))
})
socket.on('blueprint:deleted', ({ id }: { id: string }) => {
  set((s) => ({ blueprints: s.blueprints.filter((b) => b.id !== id) }))
})
```

- [ ] **Step 5: 新增 blueprint CRUD actions**

在 store actions 中新增：

```typescript
createBlueprint: async (data) => {
  const roomId = get()._roomId
  if (!roomId) return null
  return api.post<Blueprint>(`/api/rooms/${roomId}/blueprints`, data)
},

updateBlueprint: async (id, updates) => {
  const roomId = get()._roomId
  if (!roomId) return
  await api.patch(`/api/rooms/${roomId}/blueprints/${id}`, updates)
},

deleteBlueprint: async (id) => {
  const roomId = get()._roomId
  if (!roomId) return
  await api.del(`/api/rooms/${roomId}/blueprints/${id}`)
},
```

- [ ] **Step 6: 改 saveEntityAsBlueprint**

将 `saveEntityAsBlueprint` 改为调用 blueprint API：

```typescript
saveEntityAsBlueprint: async (entity) => {
  const roomId = get()._roomId
  if (!roomId) return
  await api.post(`/api/rooms/${roomId}/blueprints`, {
    name: entity.name,
    imageUrl: entity.imageUrl,
    defaults: {
      color: entity.color,
      width: entity.width,
      height: entity.height,
      ruleData: entity.ruleData,
    },
  })
},
```

- [ ] **Step 7: 验证 tsc 编译**

Run: `npx tsc -b --noEmit`
Expected: 可能有 BlueprintDockTab 的类型错误（下一 task 修复），worldStore 本身应该通过

- [ ] **Step 8: Commit**

```bash
git add src/stores/worldStore.ts
git commit -m "feat: worldStore blueprints slice with CRUD and socket events"
```

---

### Task 8: UI 适配 — BlueprintDockTab + PortraitBar

**Files:**
- Modify: `src/dock/BlueprintDockTab.tsx`
- Modify: `src/layout/PortraitBar.tsx:322-328`

- [ ] **Step 1: Rewrite BlueprintDockTab data source**

在 `src/dock/BlueprintDockTab.tsx` 中：

1. 移除 `assetToBlueprint` 辅助函数（L19-33）
2. 将数据源从 assets 改为 blueprints：

```typescript
// OLD:
const allAssets = useWorldStore((s) => s.assets)
const upload = useWorldStore((s) => s.uploadAsset)
const softRemove = useWorldStore((s) => s.softRemoveAsset)
const updateAssetMeta = useWorldStore((s) => s.updateAsset)

const blueprintAssets = useMemo(
  () => allAssets.filter((a) => a.type === 'blueprint'),
  [allAssets],
)

// NEW:
const blueprints = useWorldStore((s) => s.blueprints)
const createBlueprint = useWorldStore((s) => s.createBlueprint)
const updateBlueprint = useWorldStore((s) => s.updateBlueprint)
const deleteBlueprintAction = useWorldStore((s) => s.deleteBlueprint)
const uploadAsset = useWorldStore((s) => s.uploadAsset)
```

3. `availableTags` 的计算改为基于 `blueprints`（直接读 `bp.tags`）
4. `filteredAssets` → `filteredBlueprints`：基于 `blueprints` 做标签过滤
5. 移除 `blueprints = filteredAssets.map(assetToBlueprint)` 行——直接使用 filteredBlueprints
6. `handleDelete` 改为调用 `deleteBlueprintAction(bp.id)`。**注意行为变更**：当前 `softRemoveAsset` 支持 undo（乐观删除 + 延迟确认），新的 `deleteBlueprint` 是立即删除。若需保持 undo 体验，需在 store 中实现乐观删除 + undo 恢复。MVP 阶段可接受直接删除，后续按需加 undo
7. `handleUpload` 改为：先上传文件获取 URL，再调用 `createBlueprint`：

```typescript
const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  setUploading(true)
  try {
    const asset = await uploadAsset(file, {
      name: file.name.replace(/\.[^.]+$/, ''),
      type: 'image',
    })
    if (!asset) return
    await createBlueprint({
      name: asset.name,
      imageUrl: asset.url,
      defaults: { color: '#3b82f6', width: 1, height: 1 },
    })
  } finally {
    setUploading(false)
  }
}
```

8. `commitEdit` 改为调用 `updateBlueprint(editingId, { name: editName.trim() })`
9. `handleAddTag` / `handleRemoveTag` 改为调用 `updateBlueprint(id, { tags: [...] })`。同时更新 tag editor panel（L340-422 区域）中的 `blueprintAssets.find(...)` → `blueprints.find(...)`，所有 `asset.tags` / `asset.name` / `asset.id` 引用改为对应的 Blueprint 字段（字段名相同，仅数据源变量名需改）
10. 渲染中 `bp.defaultColor` → `bp.defaults.color`、`bp.imageUrl` 保持不变

- [ ] **Step 2: Update PortraitBar.tsx**

在 `src/layout/PortraitBar.tsx` 中，`saveEntityAsBlueprint` 调用（L326）无需改动——它接受 Entity 对象，store action 内部已经适配了新 API。确认无编译错误即可。

- [ ] **Step 3: 验证 tsc 编译**

Run: `npx tsc -b --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/dock/BlueprintDockTab.tsx src/layout/PortraitBar.tsx
git commit -m "feat: BlueprintDockTab reads from blueprints store"
```

---

### Task 9: 修复受影响的测试

**Files:**
- Modify: `server/__tests__/scenarios/asset-roundtrip.test.ts`
- Modify: `src/stores/__tests__/worldStore.test.ts`

- [ ] **Step 1: 清理 asset-roundtrip.test.ts**

移除 `server/__tests__/scenarios/asset-roundtrip.test.ts` 中所有 blueprint 相关测试：
- 移除 L64-158（测试 3.5 到 3.12）
- 这些测试的功能已被 `blueprints-crud.test.ts` 取代

保留测试 3.1-3.4（纯 image asset CRUD）和 3.13（security test）。

- [ ] **Step 2: 修复 worldStore.test.ts**

在 `src/stores/__tests__/worldStore.test.ts` 中，有两处引用了旧的 `type: 'blueprint'` 和 `blueprint?` 字段：

**L665-676 区域（asset:created with string extra 测试）：**
- 将 `type: 'blueprint'` 改为 `type: 'image'`
- 将 `extra: JSON.stringify({ tags: ['warrior'], blueprint: { defaultSize: 2 } })` 改为 `extra: JSON.stringify({ tags: ['warrior'] })`
- 移除 `expect(added?.blueprint?.defaultSize).toBe(2)` 断言

**L1066-1091 区域（normalizeAsset bundle loading 测试）：**
- 将 `type: 'blueprint'` 改为 `type: 'image'`
- 将 `extra: { tags: ['warrior', 'npc'], blueprint: { defaultSize: 2, defaultColor: '#ff0000' } }` 改为 `extra: { tags: ['warrior', 'npc'] }`
- 移除 `expect(assets[0]?.blueprint?.defaultSize).toBe(2)` 断言
- 将 `expect(assets[0]?.type).toBe('blueprint')` 改为 `expect(assets[0]?.type).toBe('image')`

- [ ] **Step 3: 运行所有测试验证**

Run: `npx vitest run --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/scenarios/asset-roundtrip.test.ts src/stores/__tests__/worldStore.test.ts
git commit -m "test: remove blueprint references from asset and worldStore tests"
```

---

### Task 10: 全量验证 + 编译检查

**Files:** 无新改动

- [ ] **Step 1: TypeScript 编译检查**

Run: `npx tsc -b --noEmit`
Expected: 无错误

- [ ] **Step 2: ESLint 检查**

Run: `npx eslint . --max-warnings 0`
Expected: 无错误

- [ ] **Step 3: 全量测试**

Run: `npx vitest run --reporter=verbose`
Expected: ALL PASS

- [ ] **Step 4: Vite 构建**

Run: `npx vite build`
Expected: 构建成功

- [ ] **Step 5: 清空 room.db 手动端到端测试**

1. 删除 `data/rooms/*/room.db`
2. 启动 dev server
3. 创建房间 → BlueprintDockTab 上传蓝图 → spawn → 确认 entity 创建
4. 验证 "Save as Blueprint" 从角色卡右键菜单可用

---

### Task 11: 创建 PR

- [ ] **Step 1: 推送分支**

```bash
git push -u origin feat/blueprint-extraction
```

- [ ] **Step 2: 创建 PR**

```bash
gh pr create --title "feat: extract Blueprint into independent table" --body "$(cat <<'EOF'
## Summary
- New `blueprints` table with typed columns (name, image_url, tags, defaults JSON blob)
- Full CRUD API at `/api/rooms/:roomId/blueprints` with Socket.io broadcast
- Spawn route reads from blueprints table instead of assets
- worldStore: new blueprints slice with socket listeners
- BlueprintDockTab data source switched from `assets.filter(type==='blueprint')` to blueprints store
- `AssetMeta.type` union: removed `'blueprint'`

## Test plan
- [x] New integration test: `blueprints-crud.test.ts` (CRUD + ON DELETE SET NULL)
- [x] Updated: `spawn.test.ts` uses POST /blueprints
- [x] Updated: `bundle.test.ts` verifies blueprints in response
- [x] Updated: `asset-roundtrip.test.ts` removed blueprint tests
- [x] Updated: `schema.test.ts` verifies blueprints table
- [ ] Manual: upload blueprint → spawn → verify entity → save entity as blueprint
EOF
)"
```
