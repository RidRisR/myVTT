# 数据层重构：Socket.io + SQLite 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 Yjs/y-websocket/y-leveldb，改用 Socket.io + better-sqlite3 实现服务端权威架构。所有数据写入通过 REST API → 服务端验证 → SQLite 持久化 → Socket.io 广播。

**Architecture:** 服务端：Express 5 + Socket.io + better-sqlite3（per-room SQLite 文件）。客户端：zustand store 从 REST 初始加载 + Socket.io 增量更新，取代 Yjs observer 模式。高频实时操作（token 拖动、资源条拖拽）走 Socket.io 事件不持久化。

**Tech Stack:** socket.io (v4) · better-sqlite3 · bcrypt (future auth) · Express 5 · React 19 · zustand 5 · react-konva

**Spec:** [`docs/design-discussion/43-数据层重构：实现架构设计.md`](../../design-discussion/43-数据层重构：实现架构设计.md) + [`42-概念架构设计.md`](../../design-discussion/42-数据层重构：概念架构设计.md)

---

## 关键架构决策

### 命名约定：服务端 camelCase 统一（解决审查 A2）

**⚠ 问题：** DB schema 使用 `snake_case`（`image_url`, `rule_data`），前端 66 个 selector + 所有组件代码使用 `camelCase`（`imageUrl`, `ruleData`）。如果 API 返回 snake_case，需要修改大量前端代码。

**决策：服务端 API 和 WS 事件 payload 统一使用 camelCase。** 转换在服务端 DB 查询层完成。

**实现方式：** 在 `server/db.ts` 中添加通用转换函数，所有 `SELECT` 结果经过转换后再返回：

```typescript
// server/db.ts
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/** 将 DB 行的 snake_case 键转为 camelCase */
export function toCamel<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value
  }
  return result as T
}

/** 批量转换 */
export function toCamelAll<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map(r => toCamel<T>(r))
}

/** 将前端 camelCase 键转为 DB snake_case（用于 PATCH） */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, c => '_' + c.toLowerCase())
}

/** API 请求 body → DB 字段名映射 */
export function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value
  }
  return result
}
```

**使用示例：**
```typescript
// 路由中
const scenes = toCamelAll<Scene>(db.prepare('SELECT * FROM scenes ORDER BY sort_order').all())
res.json(scenes)  // 返回 { sortOrder: 0, gmOnly: false, ... }
```

**JSON 字段处理：** `atmosphere`、`rule_data`、`permissions`、`grid`、`tokens` 等 JSON 字段在 DB 中已经是 camelCase 对象（存入时就用 camelCase），查询后 `JSON.parse()` 即可，无需额外转换。只有列名需要 snake→camel 转换。

**WS 事件：** 服务端 emit 的 payload 来自同一个 `toCamel()` 转换后的对象，因此 WS 事件也是 camelCase。

**影响范围：**
- 服务端：所有 `SELECT` 查询结果经过 `toCamel()`，所有接收 body 的路由对可更新字段用白名单映射
- 客户端：**零修改**——selector 和组件代码保持 camelCase 不变

### 回滚策略（解决审查 M1）

**⚠ 风险缓解：** Phase 3（客户端改造）是不可逆点。一旦开始修改 worldStore，旧 Yjs 代码失效。

**策略：Git worktree 隔离 + 分支保护。**
- 所有工作在 `.worktrees/data-layer-refactor` 分支中进行
- `main` 分支始终保持可用的 Yjs 版本
- Phase 1-2（服务端）纯新增代码，可随时丢弃分支回退
- Phase 3-4（客户端）在同一分支中，如遇到架构问题可 `git stash` 或回退到 Phase 2 完成时的 commit
- Phase 5（清理）在所有功能验证通过后才执行
- **不使用 feature flag**——运行时两套数据层并存的复杂度高于分支隔离的成本

---

## 依赖关系与并行化分析

### 依赖图

```
Phase 1: 服务端基础设施
  ├── Task 1: 依赖安装 + TypeScript 配置
  ├── Task 2: SQLite 连接管理 + Schema
  ├── Task 3: 中间件 + 工具函数
  └── Task 4: Socket.io 集成 + Awareness

Phase 2: 服务端路由（可部分并行）
  ├── Task 5: 房间 + 座位 API
  ├── Task 6: 场景 + 实体 API
  ├── Task 7: 战斗预设 + 运行时 API
  ├── Task 8: 聊天 + 骰子 API
  ├── Task 9: 素材 + 团队追踪器 + 展示 API
  └── Task 10: Socket.io 事件（高频实时）

Phase 3: 客户端架构改造
  ├── Task 11: Socket 连接 + API 工具层
  ├── Task 12: worldStore 重写
  ├── Task 13: identityStore 重写
  └── Task 14: App.tsx 初始化流程

Phase 4: 模块级适配
  ├── Task 15: ChatPanel 适配
  ├── Task 16: useAwarenessResource 重写
  ├── Task 17: Combat 模块适配
  └── Task 18: 其余 UI 组件适配

Phase 5: 清理 + 迁移
  ├── Task 19: Y.Doc → SQLite 迁移脚本
  ├── Task 20: 移除 Yjs 相关代码和依赖
  └── Task 21: 文档更新
```

### 并行化策略

| 并行组 | 可并行任务 | 条件 |
|--------|-----------|------|
| Phase 2 内部 | Task 5-9 | 共享 Phase 1 基础设施，各模块路由独立 |
| Phase 3-4 | Task 15-18 与 Task 12 | 需先完成 Task 11（Socket 连接层），但各 UI 模块可并行 |

### 验证策略

每个 Task 完成后的验证方式：

| 层级 | 验证手段 |
|------|---------|
| 单元测试 | vitest 测试 deepMerge、schema init、API handler 逻辑 |
| API 集成测试 | curl / httpie 手动测试各端点 |
| WS 集成测试 | 浏览器 devtools 观察 Socket.io 事件 |
| 端到端 | 多标签页打开同一房间，验证实时同步 |
| 回归 | 每个 Phase 完成后全量手动测试现有功能 |

---

## Chunk 1: Phase 1 — 服务端基础设施

### Task 1: 依赖安装 + TypeScript 服务端配置

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json` (或新建 `server/tsconfig.json`)
- Create: `server/index.ts` (新入口，与 `index.mjs` 并存)

- [ ] **Step 1: 安装新依赖**

```bash
npm install socket.io better-sqlite3
npm install -D @types/better-sqlite3 tsx
```

- `socket.io`: WebSocket 框架，提供 rooms、reconnect、heartbeat
- `better-sqlite3`: 同步 SQLite 绑定，配合 Node.js 单线程天然串行化
- `tsx`: 让服务端直接运行 TypeScript（开发时）
- `@types/better-sqlite3`: TypeScript 类型

- [ ] **Step 2: 创建服务端 tsconfig**

```json
// server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "../dist-server",
    "rootDir": ".",
    "declaration": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 创建服务端入口骨架 `server/index.ts`**

保留 `server/index.mjs` 不动（迁移期间旧服务器仍可用），新建 `server/index.ts`：

```typescript
// server/index.ts
import express from 'express'
import http from 'http'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { Server as SocketIOServer } from 'socket.io'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.VITE_SERVER_PORT || process.env.PORT || '4444')
const HOST = process.env.HOST || '0.0.0.0'
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data')

// Ensure data directory
fs.mkdirSync(DATA_DIR, { recursive: true })

const app = express()
const server = http.createServer(app)
const io = new SocketIOServer(server, {
  cors: { origin: '*', credentials: true },
})

// JSON body parsing
app.use(express.json())

// TODO: mount routes (Task 5-9)
// TODO: Socket.io middleware (Task 4)

server.listen(PORT, HOST, () => {
  console.log(`myVTT server running on http://${HOST}:${PORT}`)
  console.log(`Data directory: ${DATA_DIR}`)
})

export { app, io, DATA_DIR }
```

- [ ] **Step 4: 更新 package.json scripts**

```json
{
  "scripts": {
    "dev:server:new": "tsx watch server/index.ts",
    "dev:new": "concurrently -n server,vite -c blue,green \"tsx watch --env-file=.env server/index.ts\" \"vite\""
  }
}
```

保留原有 `dev` 和 `dev:server` 不变，迁移完成后替换。

- [ ] **Step 5: 验证服务端启动**

```bash
npm run dev:server:new
# 预期：myVTT server running on http://0.0.0.0:4444
# 预期：Data directory: <path>/data
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/index.ts server/tsconfig.json
git commit -m "feat: add socket.io + better-sqlite3 deps and new server entry"
```

---

### Task 2: SQLite 连接管理 + Schema 初始化

**Files:**
- Create: `server/db.ts`
- Create: `server/schema.ts`
- Test: `server/__tests__/db.test.ts`

- [ ] **Step 1: 编写 schema 测试**

```typescript
// server/__tests__/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initRoomSchema, initGlobalSchema } from '../schema'

describe('schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
  })

  afterEach(() => db.close())

  it('should create all room tables', () => {
    initRoomSchema(db)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)

    expect(tables).toContain('seats')
    expect(tables).toContain('scenes')
    expect(tables).toContain('entities')
    expect(tables).toContain('scene_entities')
    expect(tables).toContain('encounters')
    expect(tables).toContain('assets')
    expect(tables).toContain('chat_messages')
    expect(tables).toContain('room_state')
    expect(tables).toContain('combat_state')
    expect(tables).toContain('team_trackers')
    expect(tables).toContain('showcase_items')
  })

  it('should create global tables', () => {
    initGlobalSchema(db)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)

    expect(tables).toContain('users')
    expect(tables).toContain('rooms')
  })

  it('room_state should have exactly one row after init', () => {
    initRoomSchema(db)
    const row = db.prepare('SELECT * FROM room_state WHERE id = 1').get()
    expect(row).toBeTruthy()
  })

  it('combat_state should have exactly one row after init', () => {
    initRoomSchema(db)
    const row = db.prepare('SELECT * FROM combat_state WHERE id = 1').get()
    expect(row).toBeTruthy()
  })

  it('should enforce scene_entities foreign key on delete cascade', () => {
    initRoomSchema(db)
    db.prepare("INSERT INTO scenes (id, name) VALUES ('s1', 'test')").run()
    db.prepare("INSERT INTO entities (id) VALUES ('e1')").run()
    db.prepare("INSERT INTO scene_entities (scene_id, entity_id) VALUES ('s1', 'e1')").run()

    db.prepare("DELETE FROM scenes WHERE id = 's1'").run()
    const links = db.prepare('SELECT * FROM scene_entities').all()
    expect(links).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run server/__tests__/db.test.ts
# 预期：FAIL — Cannot find module '../schema'
```

- [ ] **Step 3: 实现 schema.ts**

```typescript
// server/schema.ts
import type Database from 'better-sqlite3'

export function initGlobalSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      username    TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      created_by  TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
  `)
}

export function initRoomSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seats (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL,
      role        TEXT NOT NULL CHECK(role IN ('GM', 'PL')),
      user_id     TEXT,
      portrait_url TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      atmosphere  TEXT NOT NULL DEFAULT '{}',
      gm_only     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS entities (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL DEFAULT '',
      image_url   TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL DEFAULT '#888888',
      size        INTEGER NOT NULL DEFAULT 1,
      notes       TEXT NOT NULL DEFAULT '',
      rule_data   TEXT NOT NULL DEFAULT '{}',
      permissions TEXT NOT NULL DEFAULT '{"default":"none","seats":{}}',
      persistent  INTEGER NOT NULL DEFAULT 0,
      blueprint_id TEXT
    );

    CREATE TABLE IF NOT EXISTS scene_entities (
      scene_id    TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      PRIMARY KEY (scene_id, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_scene_entities_entity ON scene_entities(entity_id);

    CREATE TABLE IF NOT EXISTS encounters (
      id          TEXT PRIMARY KEY,
      scene_id    TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      map_url     TEXT,
      map_width   INTEGER,
      map_height  INTEGER,
      grid        TEXT NOT NULL DEFAULT '{}',
      tokens      TEXT NOT NULL DEFAULT '{}',
      gm_only     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS assets (
      id          TEXT PRIMARY KEY,
      url         TEXT NOT NULL,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL CHECK(type IN ('image', 'blueprint', 'handout')),
      tags        TEXT NOT NULL DEFAULT '[]',
      width       INTEGER,
      height      INTEGER,
      created_at  INTEGER NOT NULL,
      extra       TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL CHECK(type IN ('text', 'roll', 'retract', 'system')),
      sender_id   TEXT,
      sender_name TEXT,
      sender_color TEXT,
      portrait_url TEXT,
      content     TEXT,
      roll_data   TEXT,
      target_id   TEXT,
      timestamp   INTEGER NOT NULL,
      retracted   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp);

    CREATE TABLE IF NOT EXISTS room_state (
      id                    INTEGER PRIMARY KEY CHECK(id = 1),
      active_scene_id       TEXT REFERENCES scenes(id) ON DELETE SET NULL,
      active_encounter_id   TEXT REFERENCES encounters(id) ON DELETE SET NULL
    );
    INSERT OR IGNORE INTO room_state (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS combat_state (
      id                INTEGER PRIMARY KEY CHECK(id = 1),
      map_url           TEXT,
      map_width         INTEGER,
      map_height        INTEGER,
      grid              TEXT NOT NULL DEFAULT '{}',
      tokens            TEXT NOT NULL DEFAULT '{}',
      initiative_order  TEXT NOT NULL DEFAULT '[]',
      initiative_index  INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO combat_state (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS team_trackers (
      id          TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      current     INTEGER NOT NULL DEFAULT 0,
      max         INTEGER NOT NULL DEFAULT 0,
      color       TEXT NOT NULL DEFAULT '#3b82f6',
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS showcase_items (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      data        TEXT NOT NULL DEFAULT '{}',
      pinned      INTEGER NOT NULL DEFAULT 0
    );
  `)
}
```

- [ ] **Step 4: 实现 db.ts（连接管理）**

```typescript
// server/db.ts
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { initRoomSchema, initGlobalSchema } from './schema'

let globalDb: Database.Database | null = null
const roomDbs = new Map<string, Database.Database>()

export function getGlobalDb(dataDir: string): Database.Database {
  if (!globalDb) {
    fs.mkdirSync(dataDir, { recursive: true })
    globalDb = new Database(path.join(dataDir, 'global.db'))
    globalDb.pragma('journal_mode = WAL')
    globalDb.pragma('foreign_keys = ON')
    initGlobalSchema(globalDb)
  }
  return globalDb
}

export function getRoomDb(dataDir: string, roomId: string): Database.Database {
  const existing = roomDbs.get(roomId)
  if (existing) return existing

  const roomDir = path.join(dataDir, 'rooms', roomId)
  fs.mkdirSync(roomDir, { recursive: true })
  const db = new Database(path.join(roomDir, 'room.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initRoomSchema(db)
  roomDbs.set(roomId, db)
  return db
}

export function closeAll(): void {
  globalDb?.close()
  globalDb = null
  for (const db of roomDbs.values()) db.close()
  roomDbs.clear()
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npx vitest run server/__tests__/db.test.ts
# 预期：全部 PASS
```

- [ ] **Step 6: Commit**

```bash
git add server/db.ts server/schema.ts server/__tests__/db.test.ts
git commit -m "feat: SQLite schema and connection management"
```

---

### Task 3: 中间件 + 工具函数

**Files:**
- Create: `server/middleware.ts`
- Create: `server/deepMerge.ts`
- Test: `server/__tests__/deepMerge.test.ts`

- [ ] **Step 1: 编写 deepMerge 测试**

```typescript
// server/__tests__/deepMerge.test.ts
import { describe, it, expect } from 'vitest'
import { deepMerge } from '../deepMerge'

describe('deepMerge', () => {
  it('should merge nested objects', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 }
    const result = deepMerge(target, { a: { b: 10 } })
    expect(result).toEqual({ a: { b: 10, c: 2 }, d: 3 })
  })

  it('should overwrite arrays (not deep merge)', () => {
    const target = { arr: [1, 2, 3] }
    const result = deepMerge(target, { arr: [4, 5] })
    expect(result).toEqual({ arr: [4, 5] })
  })

  it('should overwrite null values directly', () => {
    const target = { a: { b: 1 } }
    const result = deepMerge(target, { a: null })
    expect(result).toEqual({ a: null })
  })

  it('should add new keys', () => {
    const target = { a: 1 }
    const result = deepMerge(target, { b: 2 })
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('should handle deeply nested merges', () => {
    const target = { ruleData: { hp: { current: 20, max: 20 }, str: 14 } }
    const result = deepMerge(target, { ruleData: { hp: { current: 15 } } })
    expect(result).toEqual({ ruleData: { hp: { current: 15, max: 20 }, str: 14 } })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run server/__tests__/deepMerge.test.ts
# 预期：FAIL
```

- [ ] **Step 3: 实现 deepMerge**

```typescript
// server/deepMerge.ts
export function deepMerge<T extends Record<string, unknown>>(target: T, patch: Record<string, unknown>): T {
  const result = { ...target }
  for (const [key, value] of Object.entries(patch)) {
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
    ) {
      ;(result as Record<string, unknown>)[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      )
    } else {
      ;(result as Record<string, unknown>)[key] = value
    }
  }
  return result
}
```

- [ ] **Step 4: 实现 middleware.ts（占位版）**

初期不实现真正的 JWT 验证（身份系统尚未搭建），用占位逻辑：

```typescript
// server/middleware.ts
import type { Request, Response, NextFunction } from 'express'
import { getRoomDb } from './db'

// 扩展 Express Request
declare global {
  namespace Express {
    interface Request {
      roomDb?: import('better-sqlite3').Database
      roomId?: string
      userId?: string
      role?: 'GM' | 'PL'
    }
  }
}

// 注入房间数据库
export function withRoom(dataDir: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const roomId = req.params.roomId
    if (!roomId) return next(new Error('roomId required'))
    req.roomId = roomId
    req.roomDb = getRoomDb(dataDir, roomId)
    next()
  }
}

// 占位 auth — 迁移期间暂不验证，从 query 或 header 读 seatId
export function withAuth(req: Request, _res: Response, next: NextFunction) {
  // TODO: 实现 JWT 验证（Task 后续）
  // 临时方案：从 header 读取
  req.userId = (req.headers['x-user-id'] as string) || 'anonymous'
  next()
}

// 角色查询
export function withRole(req: Request, _res: Response, next: NextFunction) {
  if (!req.roomDb || !req.userId) {
    req.role = 'PL'
    return next()
  }
  const seat = req.roomDb
    .prepare('SELECT role FROM seats WHERE user_id = ? OR id = ?')
    .get(req.userId, req.userId) as { role: string } | undefined
  req.role = (seat?.role as 'GM' | 'PL') || 'PL'
  next()
}
```

- [ ] **Step 5: 运行 deepMerge 测试确认通过**

```bash
npx vitest run server/__tests__/deepMerge.test.ts
# 预期：全部 PASS
```

- [ ] **Step 6: Commit**

```bash
git add server/deepMerge.ts server/middleware.ts server/__tests__/deepMerge.test.ts
git commit -m "feat: add deepMerge utility and Express middleware"
```

---

### Task 4: Socket.io 集成 + Awareness 替代

**Files:**
- Create: `server/ws.ts`
- Create: `server/awareness.ts`
- Modify: `server/index.ts` — 挂载 Socket.io 中间件和事件

- [ ] **Step 1: 实现 awareness.ts**

```typescript
// server/awareness.ts
import type { Server, Socket } from 'socket.io'

interface ClientState {
  roomId: string
  seatId: string | null
  state: Record<string, unknown>
}

const clientStates = new Map<string, ClientState>()

export function setupAwareness(io: Server): void {
  io.on('connection', (socket: Socket) => {
    const roomId = socket.data.roomId as string
    const seatId = socket.data.seatId as string | null

    clientStates.set(socket.id, { roomId, seatId, state: {} })

    // 高频 awareness 事件
    socket.on('awareness:update', ({ field, state }: { field: string; state: unknown }) => {
      const client = clientStates.get(socket.id)
      if (!client) return

      if (state === null) {
        delete client.state[field]
      } else {
        client.state[field] = state
      }

      socket.to(roomId).emit('awareness:update', {
        clientId: socket.id,
        seatId: client.seatId,
        field,
        state,
      })
    })

    // Token 拖动中（高频，不持久化）
    socket.on('token:dragging', (data: { tokenId: string; x: number; y: number }) => {
      socket.to(roomId).emit('token:dragging', {
        ...data,
        clientId: socket.id,
      })
    })

    socket.on('disconnect', () => {
      socket.to(roomId).emit('awareness:remove', {
        clientId: socket.id,
        seatId,
      })
      clientStates.delete(socket.id)
    })
  })
}
```

- [ ] **Step 2: 实现 ws.ts（Socket.io 鉴权中间件）**

```typescript
// server/ws.ts
import type { Server } from 'socket.io'
import { getGlobalDb, getRoomDb } from './db'

export function setupSocketAuth(io: Server, dataDir: string): void {
  io.use((socket, next) => {
    // TODO: 实现 JWT 验证（身份系统搭建后）
    // 临时方案：从 handshake query 读取
    const roomId = socket.handshake.query.roomId as string
    const seatId = socket.handshake.query.seatId as string | null

    if (!roomId) {
      return next(new Error('roomId required'))
    }

    // 验证房间存在
    const globalDb = getGlobalDb(dataDir)
    const room = globalDb.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId)
    if (!room) {
      return next(new Error('Room not found'))
    }

    socket.data = { roomId, seatId, userId: seatId || 'anonymous' }
    socket.join(roomId)
    next()
  })
}
```

- [ ] **Step 3: 更新 server/index.ts 集成 Socket.io**

```typescript
// 在 server/index.ts 中添加：
import { setupSocketAuth } from './ws'
import { setupAwareness } from './awareness'

// ... 在 server 创建后：
setupSocketAuth(io, DATA_DIR)
setupAwareness(io)
```

- [ ] **Step 4: 验证 Socket.io 连接**

启动新服务端后，在浏览器 console 中测试：

```javascript
const socket = io('http://localhost:4444', { query: { roomId: 'test-room' } })
socket.on('connect', () => console.log('connected:', socket.id))
socket.on('connect_error', (err) => console.log('error:', err.message))
```

需要先通过 REST API 创建房间。如果房间不存在，预期看到 `error: Room not found`。

- [ ] **Step 5: Commit**

```bash
git add server/ws.ts server/awareness.ts server/index.ts
git commit -m "feat: Socket.io integration with awareness and auth middleware"
```

---

## Chunk 2: Phase 2 — 服务端路由

### Task 5: 房间 + 座位 REST API

**Files:**
- Create: `server/routes/rooms.ts`
- Create: `server/routes/seats.ts`
- Modify: `server/index.ts` — 挂载路由

- [ ] **Step 1: 实现房间路由**

```typescript
// server/routes/rooms.ts
import { Router } from 'express'
import crypto from 'crypto'
import { getGlobalDb, getRoomDb } from '../db'

export function roomRoutes(dataDir: string): Router {
  const router = Router()

  router.get('/api/rooms', (_req, res) => {
    const db = getGlobalDb(dataDir)
    const rooms = db.prepare('SELECT * FROM rooms ORDER BY created_at DESC').all()
    res.json(rooms)
  })

  router.post('/api/rooms', (req, res) => {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    const id = crypto.randomUUID().slice(0, 8)
    const db = getGlobalDb(dataDir)
    db.prepare('INSERT INTO rooms (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      name,
      req.userId || 'anonymous',
      Date.now(),
    )
    // 创建房间数据库（触发 schema 初始化）
    getRoomDb(dataDir, id)
    res.status(201).json({ id, name, created_at: Date.now() })
  })

  router.delete('/api/rooms/:roomId', (req, res) => {
    const db = getGlobalDb(dataDir)
    const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(req.params.roomId)
    if (!room) return res.status(404).json({ error: 'Room not found' })
    db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.roomId)
    // TODO: 清理房间目录
    res.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 2: 实现座位路由**

```typescript
// server/routes/seats.ts
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'

export function seatRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/seats', room, (req, res) => {
    const seats = req.roomDb!.prepare('SELECT * FROM seats ORDER BY sort_order').all()
    res.json(seats)
  })

  router.post('/api/rooms/:roomId/seats', room, (req, res) => {
    const { name, color, role, user_id, portrait_url } = req.body
    if (!name || !color || !role) {
      return res.status(400).json({ error: 'name, color, role required' })
    }
    const id = 's-' + crypto.randomUUID().slice(0, 8)
    const count = (req.roomDb!.prepare('SELECT COUNT(*) as c FROM seats').get() as any).c
    req.roomDb!
      .prepare(
        'INSERT INTO seats (id, name, color, role, user_id, portrait_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, name, color, role, user_id || null, portrait_url || null, count)

    const seat = req.roomDb!.prepare('SELECT * FROM seats WHERE id = ?').get(id)
    io.to(req.roomId!).emit('seat:created', { seat })
    res.status(201).json(seat)
  })

  router.patch('/api/rooms/:roomId/seats/:id', room, (req, res) => {
    const existing = req.roomDb!.prepare('SELECT * FROM seats WHERE id = ?').get(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Seat not found' })

    const fields: string[] = []
    const values: unknown[] = []
    for (const key of ['name', 'color', 'role', 'user_id', 'portrait_url', 'sort_order']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(req.body[key])
      }
    }
    if (fields.length > 0) {
      values.push(req.params.id)
      req.roomDb!.prepare(`UPDATE seats SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = req.roomDb!.prepare('SELECT * FROM seats WHERE id = ?').get(req.params.id)
    io.to(req.roomId!).emit('seat:updated', { id: req.params.id, changes: req.body })
    res.json(updated)
  })

  router.delete('/api/rooms/:roomId/seats/:id', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM seats WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('seat:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 3: 挂载路由到 index.ts**

```typescript
import { roomRoutes } from './routes/rooms'
import { seatRoutes } from './routes/seats'

app.use(roomRoutes(DATA_DIR))
app.use(seatRoutes(DATA_DIR, io))
```

- [ ] **Step 4: 验证**

```bash
# 创建房间
curl -X POST http://localhost:4444/api/rooms -H 'Content-Type: application/json' -d '{"name":"test"}'
# 预期：201 { "id": "...", "name": "test", ... }

# 创建座位
curl -X POST http://localhost:4444/api/rooms/<roomId>/seats -H 'Content-Type: application/json' \
  -d '{"name":"GM","color":"#3b82f6","role":"GM"}'
# 预期：201 { "id": "s-...", "name": "GM", ... }
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/rooms.ts server/routes/seats.ts server/index.ts
git commit -m "feat: rooms and seats REST API with WS broadcast"
```

---

### Task 6: 场景 + 实体 REST API

**Files:**
- Create: `server/routes/scenes.ts`
- Create: `server/routes/entities.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 实现场景路由**

```typescript
// server/routes/scenes.ts
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom, withRole } from '../middleware'

export function sceneRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/scenes', room, withRole, (req, res) => {
    const where = req.role === 'GM' ? '' : 'WHERE gm_only = 0'
    const scenes = req.roomDb!.prepare(`SELECT * FROM scenes ${where} ORDER BY sort_order`).all()
    res.json(scenes)
  })

  router.post('/api/rooms/:roomId/scenes', room, (req, res) => {
    const { name, sort_order, atmosphere, gm_only } = req.body
    const id = crypto.randomUUID()
    req.roomDb!
      .prepare('INSERT INTO scenes (id, name, sort_order, atmosphere, gm_only) VALUES (?, ?, ?, ?, ?)')
      .run(id, name || 'New Scene', sort_order ?? 0, JSON.stringify(atmosphere || {}), gm_only ? 1 : 0)

    const scene = req.roomDb!.prepare('SELECT * FROM scenes WHERE id = ?').get(id)
    io.to(req.roomId!).emit('scene:created', { scene })
    res.status(201).json(scene)
  })

  router.patch('/api/rooms/:roomId/scenes/:id', room, (req, res) => {
    const existing = req.roomDb!.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id) as any
    if (!existing) return res.status(404).json({ error: 'Scene not found' })

    const fields: string[] = []
    const values: unknown[] = []
    for (const key of ['name', 'sort_order', 'gm_only']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(req.body[key])
      }
    }
    if (req.body.atmosphere !== undefined) {
      // Deep merge atmosphere JSON
      const existingAtmo = JSON.parse(existing.atmosphere || '{}')
      const merged = { ...existingAtmo, ...req.body.atmosphere }
      fields.push('atmosphere = ?')
      values.push(JSON.stringify(merged))
    }
    if (fields.length > 0) {
      values.push(req.params.id)
      req.roomDb!.prepare(`UPDATE scenes SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    io.to(req.roomId!).emit('scene:updated', { id: req.params.id, changes: req.body })
    res.json({ ok: true })
  })

  router.delete('/api/rooms/:roomId/scenes/:id', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM scenes WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('scene:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  // 场景-实体关联
  router.post('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
    req.roomDb!
      .prepare('INSERT OR IGNORE INTO scene_entities (scene_id, entity_id) VALUES (?, ?)')
      .run(req.params.sceneId, req.params.entityId)
    io.to(req.roomId!).emit('scene:entity:linked', {
      sceneId: req.params.sceneId,
      entityId: req.params.entityId,
    })
    res.json({ ok: true })
  })

  router.delete('/api/rooms/:roomId/scenes/:sceneId/entities/:entityId', room, (req, res) => {
    req.roomDb!
      .prepare('DELETE FROM scene_entities WHERE scene_id = ? AND entity_id = ?')
      .run(req.params.sceneId, req.params.entityId)
    io.to(req.roomId!).emit('scene:entity:unlinked', {
      sceneId: req.params.sceneId,
      entityId: req.params.entityId,
    })
    res.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 2: 实现实体路由**

```typescript
// server/routes/entities.ts
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'
import { deepMerge } from '../deepMerge'

export function entityRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/entities', room, (req, res) => {
    const sceneId = req.query.scene_id as string | undefined
    if (sceneId) {
      const entities = req.roomDb!
        .prepare(
          `SELECT e.* FROM entities e
           JOIN scene_entities se ON se.entity_id = e.id
           WHERE se.scene_id = ?`,
        )
        .all(sceneId)
      return res.json(entities)
    }
    const entities = req.roomDb!.prepare('SELECT * FROM entities').all()
    res.json(entities)
  })

  router.get('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    const entity = req.roomDb!.prepare('SELECT * FROM entities WHERE id = ?').get(req.params.id)
    if (!entity) return res.status(404).json({ error: 'Entity not found' })
    res.json(entity)
  })

  router.post('/api/rooms/:roomId/entities', room, (req, res) => {
    const id = req.body.id || 'e-' + crypto.randomUUID().slice(0, 8)
    const {
      name = '',
      image_url = '',
      color = '#888888',
      size = 1,
      notes = '',
      rule_data = {},
      permissions = { default: 'none', seats: {} },
      persistent = false,
      blueprint_id = null,
    } = req.body

    req.roomDb!
      .prepare(
        `INSERT INTO entities (id, name, image_url, color, size, notes, rule_data, permissions, persistent, blueprint_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, name, image_url, color, size, notes,
        JSON.stringify(rule_data), JSON.stringify(permissions),
        persistent ? 1 : 0, blueprint_id,
      )

    // persistent 实体自动关联所有场景
    if (persistent) {
      const scenes = req.roomDb!.prepare('SELECT id FROM scenes').all() as { id: string }[]
      const insert = req.roomDb!.prepare('INSERT OR IGNORE INTO scene_entities (scene_id, entity_id) VALUES (?, ?)')
      for (const scene of scenes) {
        insert.run(scene.id, id)
      }
    }

    const entity = req.roomDb!.prepare('SELECT * FROM entities WHERE id = ?').get(id)
    io.to(req.roomId!).emit('entity:created', { entity })
    res.status(201).json(entity)
  })

  router.patch('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    const existing = req.roomDb!.prepare('SELECT * FROM entities WHERE id = ?').get(req.params.id) as any
    if (!existing) return res.status(404).json({ error: 'Entity not found' })

    const fields: string[] = []
    const values: unknown[] = []

    // Simple fields
    for (const key of ['name', 'image_url', 'color', 'size', 'notes', 'blueprint_id']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(req.body[key])
      }
    }
    if (req.body.persistent !== undefined) {
      fields.push('persistent = ?')
      values.push(req.body.persistent ? 1 : 0)
    }

    // JSON fields — deep merge
    if (req.body.rule_data !== undefined) {
      const merged = deepMerge(JSON.parse(existing.rule_data), req.body.rule_data)
      fields.push('rule_data = ?')
      values.push(JSON.stringify(merged))
    }
    if (req.body.permissions !== undefined) {
      const merged = deepMerge(JSON.parse(existing.permissions), req.body.permissions)
      fields.push('permissions = ?')
      values.push(JSON.stringify(merged))
    }

    if (fields.length > 0) {
      values.push(req.params.id)
      req.roomDb!.prepare(`UPDATE entities SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    io.to(req.roomId!).emit('entity:updated', { id: req.params.id, changes: req.body })
    res.json({ ok: true })
  })

  router.delete('/api/rooms/:roomId/entities/:id', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM entities WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('entity:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 3: 挂载路由并验证**

```typescript
import { sceneRoutes } from './routes/scenes'
import { entityRoutes } from './routes/entities'

app.use(sceneRoutes(DATA_DIR, io))
app.use(entityRoutes(DATA_DIR, io))
```

验证：创建场景 → 创建实体 → 关联实体到场景 → 查询场景内实体。

- [ ] **Step 4: Commit**

```bash
git add server/routes/scenes.ts server/routes/entities.ts server/index.ts
git commit -m "feat: scenes and entities REST API with deep merge PATCH"
```

---

### Task 7: 战斗预设 + 运行时 API

**Files:**
- Create: `server/routes/encounters.ts`
- Create: `server/routes/combat.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 实现 encounters 路由**

包含：GET/POST/PATCH/DELETE encounter，POST activate，POST end，POST save-snapshot。

```typescript
// server/routes/encounters.ts
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'

export function encounterRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/scenes/:sceneId/encounters', room, (req, res) => {
    const encounters = req.roomDb!
      .prepare('SELECT * FROM encounters WHERE scene_id = ?')
      .all(req.params.sceneId)
    res.json(encounters)
  })

  router.post('/api/rooms/:roomId/scenes/:sceneId/encounters', room, (req, res) => {
    const id = crypto.randomUUID()
    const { name, map_url, map_width, map_height, grid, tokens, gm_only } = req.body
    req.roomDb!
      .prepare(
        `INSERT INTO encounters (id, scene_id, name, map_url, map_width, map_height, grid, tokens, gm_only)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, req.params.sceneId, name || 'Encounter',
        map_url || null, map_width || null, map_height || null,
        JSON.stringify(grid || {}), JSON.stringify(tokens || {}),
        gm_only ? 1 : 0,
      )
    const encounter = req.roomDb!.prepare('SELECT * FROM encounters WHERE id = ?').get(id)
    io.to(req.roomId!).emit('encounter:created', { encounter })
    res.status(201).json(encounter)
  })

  router.patch('/api/rooms/:roomId/encounters/:id', room, (req, res) => {
    const existing = req.roomDb!.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id) as any
    if (!existing) return res.status(404).json({ error: 'Encounter not found' })

    const fields: string[] = []
    const values: unknown[] = []
    for (const key of ['name', 'map_url', 'map_width', 'map_height', 'gm_only']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(req.body[key])
      }
    }
    for (const key of ['grid', 'tokens']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(JSON.stringify(req.body[key]))
      }
    }
    if (fields.length > 0) {
      values.push(req.params.id)
      req.roomDb!.prepare(`UPDATE encounters SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
    io.to(req.roomId!).emit('encounter:updated', { id: req.params.id, changes: req.body })
    res.json({ ok: true })
  })

  router.delete('/api/rooms/:roomId/encounters/:id', room, (req, res) => {
    req.roomDb!.prepare('DELETE FROM encounters WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('encounter:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  // 激活 encounter → 展开到 combat_state
  router.post('/api/rooms/:roomId/encounters/:id/activate', room, (req, res) => {
    const encounter = req.roomDb!.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id) as any
    if (!encounter) return res.status(404).json({ error: 'Encounter not found' })

    req.roomDb!.prepare('UPDATE room_state SET active_encounter_id = ? WHERE id = 1').run(req.params.id)
    req.roomDb!
      .prepare(
        `UPDATE combat_state SET
          map_url = ?, map_width = ?, map_height = ?,
          grid = ?, tokens = ?,
          initiative_order = '[]', initiative_index = 0
        WHERE id = 1`,
      )
      .run(encounter.map_url, encounter.map_width, encounter.map_height, encounter.grid, encounter.tokens)

    const combatState = req.roomDb!.prepare('SELECT * FROM combat_state WHERE id = 1').get()
    io.to(req.roomId!).emit('combat:activated', { combatState })
    io.to(req.roomId!).emit('room:state:updated', { active_encounter_id: req.params.id })
    res.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 2: 实现 combat 路由**

```typescript
// server/routes/combat.ts
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'

export function combatRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  router.get('/api/rooms/:roomId/combat', room, (req, res) => {
    const state = req.roomDb!.prepare('SELECT * FROM combat_state WHERE id = 1').get()
    res.json(state)
  })

  router.patch('/api/rooms/:roomId/combat', room, (req, res) => {
    const fields: string[] = []
    const values: unknown[] = []
    for (const key of ['map_url', 'map_width', 'map_height', 'initiative_index']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(req.body[key])
      }
    }
    for (const key of ['grid', 'tokens', 'initiative_order']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(JSON.stringify(req.body[key]))
      }
    }
    if (fields.length > 0) {
      req.roomDb!.prepare(`UPDATE combat_state SET ${fields.join(', ')} WHERE id = 1`).run(...values)
    }
    io.to(req.roomId!).emit('combat:updated', { changes: req.body })
    res.json({ ok: true })
  })

  // Token CRUD within combat_state.tokens JSON
  router.post('/api/rooms/:roomId/combat/tokens', room, (req, res) => {
    const tokenId = req.body.id || crypto.randomUUID()
    const state = req.roomDb!.prepare('SELECT tokens FROM combat_state WHERE id = 1').get() as any
    const tokens = JSON.parse(state.tokens || '{}')
    tokens[tokenId] = { id: tokenId, ...req.body }
    req.roomDb!.prepare('UPDATE combat_state SET tokens = ? WHERE id = 1').run(JSON.stringify(tokens))
    io.to(req.roomId!).emit('combat:token:added', { token: tokens[tokenId] })
    res.status(201).json(tokens[tokenId])
  })

  router.patch('/api/rooms/:roomId/combat/tokens/:tokenId', room, (req, res) => {
    const state = req.roomDb!.prepare('SELECT tokens FROM combat_state WHERE id = 1').get() as any
    const tokens = JSON.parse(state.tokens || '{}')
    if (!tokens[req.params.tokenId]) return res.status(404).json({ error: 'Token not found' })
    tokens[req.params.tokenId] = { ...tokens[req.params.tokenId], ...req.body }
    req.roomDb!.prepare('UPDATE combat_state SET tokens = ? WHERE id = 1').run(JSON.stringify(tokens))
    io.to(req.roomId!).emit('combat:token:updated', { tokenId: req.params.tokenId, changes: req.body })
    res.json({ ok: true })
  })

  router.delete('/api/rooms/:roomId/combat/tokens/:tokenId', room, (req, res) => {
    const state = req.roomDb!.prepare('SELECT tokens FROM combat_state WHERE id = 1').get() as any
    const tokens = JSON.parse(state.tokens || '{}')
    delete tokens[req.params.tokenId]
    req.roomDb!.prepare('UPDATE combat_state SET tokens = ? WHERE id = 1').run(JSON.stringify(tokens))
    io.to(req.roomId!).emit('combat:token:removed', { tokenId: req.params.tokenId })
    res.json({ ok: true })
  })

  // 结束战斗
  router.post('/api/rooms/:roomId/combat/end', room, (req, res) => {
    req.roomDb!.prepare('UPDATE room_state SET active_encounter_id = NULL WHERE id = 1').run()
    req.roomDb!
      .prepare(
        `UPDATE combat_state SET
          map_url = NULL, map_width = NULL, map_height = NULL,
          grid = '{}', tokens = '{}', initiative_order = '[]', initiative_index = 0
        WHERE id = 1`,
      )
      .run()
    io.to(req.roomId!).emit('combat:ended', {})
    io.to(req.roomId!).emit('room:state:updated', { active_encounter_id: null })
    res.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 3: 挂载并验证**

```bash
# 激活 encounter → 查看 combat state → 添加 token → 结束战斗
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/encounters.ts server/routes/combat.ts server/index.ts
git commit -m "feat: encounters and combat runtime REST API"
```

---

### Task 8: 聊天 + 骰子 API

**Files:**
- Create: `server/routes/chat.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 实现聊天路由**

```typescript
// server/routes/chat.ts
import { Router } from 'express'
import crypto from 'crypto'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'

export function chatRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  // 获取聊天记录（支持增量拉取）
  router.get('/api/rooms/:roomId/chat', room, (req, res) => {
    const after = parseInt(req.query.after as string) || 0
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000)
    const messages = req.roomDb!
      .prepare('SELECT * FROM chat_messages WHERE timestamp > ? ORDER BY timestamp ASC LIMIT ?')
      .all(after, limit)
    res.json(messages)
  })

  // 发送文本消息
  router.post('/api/rooms/:roomId/chat', room, (req, res) => {
    const { type = 'text', sender_id, sender_name, sender_color, portrait_url, content } = req.body
    const id = crypto.randomUUID()
    const timestamp = Date.now()

    req.roomDb!
      .prepare(
        `INSERT INTO chat_messages (id, type, sender_id, sender_name, sender_color, portrait_url, content, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, type, sender_id, sender_name, sender_color, portrait_url || null, content, timestamp)

    const message = req.roomDb!.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id)
    io.to(req.roomId!).emit('chat:new', { message })
    res.status(201).json(message)
  })

  // 服务端掷骰
  router.post('/api/rooms/:roomId/roll', room, async (req, res) => {
    const { formula, resolvedExpression, sender_id, sender_name, sender_color, portrait_url, actionName, modifiers } =
      req.body

    // 动态导入客户端的骰子逻辑（tsx 允许导入 .ts 文件）
    const { rollCompound } = await import('../../src/shared/diceUtils')

    const expression = resolvedExpression || formula
    const result = rollCompound(expression)
    if (!result || result.error) {
      return res.status(400).json({ error: result?.error || 'Invalid expression' })
    }

    const id = crypto.randomUUID()
    const timestamp = Date.now()
    const rollData = {
      expression: formula,
      resolvedExpression: expression !== formula ? expression : undefined,
      terms: result.termResults,
      total: result.total,
      actionName,
      modifiersApplied: modifiers,
    }

    req.roomDb!
      .prepare(
        `INSERT INTO chat_messages (id, type, sender_id, sender_name, sender_color, portrait_url, roll_data, timestamp)
         VALUES (?, 'roll', ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, sender_id, sender_name, sender_color, portrait_url || null, JSON.stringify(rollData), timestamp)

    const message = req.roomDb!.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id)
    io.to(req.roomId!).emit('chat:new', { message })
    res.status(201).json(message)
  })

  // 撤回消息
  router.post('/api/rooms/:roomId/chat/retract/:id', room, (req, res) => {
    const original = req.roomDb!.prepare('SELECT * FROM chat_messages WHERE id = ?').get(req.params.id) as any
    if (!original) return res.status(404).json({ error: 'Message not found' })
    if (original.type === 'roll') return res.status(400).json({ error: 'Cannot retract roll messages' })

    req.roomDb!.prepare('UPDATE chat_messages SET retracted = 1 WHERE id = ?').run(req.params.id)

    // 插入 retract 记录
    const retractId = crypto.randomUUID()
    req.roomDb!
      .prepare(
        `INSERT INTO chat_messages (id, type, sender_id, target_id, timestamp) VALUES (?, 'retract', ?, ?, ?)`,
      )
      .run(retractId, req.body.sender_id || null, req.params.id, Date.now())

    io.to(req.roomId!).emit('chat:retracted', { id: req.params.id })
    res.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 2: 挂载并验证**

发送文本 → 查看聊天记录 → 掷骰（需要 diceUtils 可被服务端导入）→ 撤回。

- [ ] **Step 3: Commit**

```bash
git add server/routes/chat.ts server/index.ts
git commit -m "feat: chat, dice rolling, and retract REST API"
```

---

### Task 9: 素材 + 团队追踪器 + 展示 + 房间状态 API

**Files:**
- Create: `server/routes/assets.ts`
- Create: `server/routes/trackers.ts`
- Create: `server/routes/showcase.ts`
- Create: `server/routes/state.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 实现素材路由**

素材路由整合原有 upload 端点，增加元数据管理：

```typescript
// server/routes/assets.ts
import { Router } from 'express'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import type { Server } from 'socket.io'
import { withRoom } from '../middleware'

export function assetRoutes(dataDir: string, io: Server): Router {
  const router = Router()
  const room = withRoom(dataDir)

  // Per-room uploads directory
  function getUploadsDir(roomId: string): string {
    const dir = path.join(dataDir, 'rooms', roomId, 'uploads')
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  router.get('/api/rooms/:roomId/assets', room, (req, res) => {
    let query = 'SELECT * FROM assets WHERE 1=1'
    const params: unknown[] = []
    if (req.query.type) {
      query += ' AND type = ?'
      params.push(req.query.type)
    }
    query += ' ORDER BY created_at DESC'
    res.json(req.roomDb!.prepare(query).all(...params))
  })

  router.post('/api/rooms/:roomId/assets', room, (req, res, next) => {
    const uploadsDir = getUploadsDir(req.roomId!)
    const storage = multer.diskStorage({
      destination: uploadsDir,
      filename: (_r, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || '.bin'}`),
    })
    multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } }).single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message })
      if (!req.file) return res.status(400).json({ error: 'No file' })

      const id = crypto.randomUUID()
      const url = `/api/rooms/${req.roomId}/uploads/${req.file.filename}`
      const assetType = (req.body.type as string) || 'image'
      const name = req.body.name || req.file.originalname
      const extra = req.body.extra ? JSON.parse(req.body.extra) : {}

      req.roomDb!
        .prepare('INSERT INTO assets (id, url, name, type, created_at, extra) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, url, name, assetType, Date.now(), JSON.stringify(extra))

      const asset = req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(id)
      io.to(req.roomId!).emit('asset:created', { asset })
      res.status(201).json(asset)
    })
  })

  router.delete('/api/rooms/:roomId/assets/:id', room, (req, res) => {
    const asset = req.roomDb!.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id) as any
    if (!asset) return res.status(404).json({ error: 'Asset not found' })

    // Delete file
    const filename = path.basename(asset.url)
    const filePath = path.join(getUploadsDir(req.roomId!), filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    req.roomDb!.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id)
    io.to(req.roomId!).emit('asset:deleted', { id: req.params.id })
    res.json({ ok: true })
  })

  // Static file serving for room uploads
  router.get('/api/rooms/:roomId/uploads/:filename', (req, res) => {
    const filePath = path.join(dataDir, 'rooms', req.params.roomId, 'uploads', path.basename(req.params.filename))
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
    res.sendFile(filePath)
  })

  return router
}
```

- [ ] **Step 2: 实现 trackers、showcase、state 路由**

这些路由结构简单，遵循相同 CRUD + WS 广播模式。篇幅原因省略完整代码，实现时参照 Task 5-6 的模式：

- `server/routes/trackers.ts`: GET/POST/PATCH/DELETE `/api/rooms/:roomId/team-trackers(/:id)`，广播 `tracker:*`
- `server/routes/showcase.ts`: GET/POST/PATCH/DELETE + clear + pin/unpin `/api/rooms/:roomId/showcase(/:id)`，广播 `showcase:*`
- `server/routes/state.ts`: GET/PATCH `/api/rooms/:roomId/state`，广播 `room:state:updated`

- [ ] **Step 3: 挂载所有路由并验证**

- [ ] **Step 4: Commit**

```bash
git add server/routes/assets.ts server/routes/trackers.ts server/routes/showcase.ts server/routes/state.ts server/index.ts
git commit -m "feat: assets, trackers, showcase, and room state REST API"
```

---

### Task 10: 服务端路由完整性集成测试

- [ ] **Step 1: 编写集成测试脚本**

创建 `server/__tests__/integration.test.ts`，用 in-memory SQLite 测试完整 API 流程：

```
创建房间 → 创建座位 → 创建场景 → 创建实体 → 关联实体到场景 →
创建 encounter → 激活 encounter → 添加 token → 发送聊天 → 掷骰 → 结束战斗
```

- [ ] **Step 2: 运行集成测试**

```bash
npx vitest run server/__tests__/integration.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/integration.test.ts
git commit -m "test: server API integration tests"
```

---

## Chunk 3: Phase 3 — 客户端架构改造

### Task 11: Socket 连接 + API 工具层

**Files:**
- Create: `src/shared/api.ts` — fetch 封装
- Create: `src/shared/hooks/useSocket.ts` — Socket.io 连接 hook
- Modify: `src/shared/config.ts` — 确保 API_BASE 导出

- [ ] **Step 1: 创建 API 工具函数**

```typescript
// src/shared/api.ts
import { API_BASE } from './config'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  // ⚠ 处理空响应体（I16）：DELETE 等操作可能返回 204 或空 body
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
```

- [ ] **Step 2: 创建 Socket.io 连接 hook**

```typescript
// src/shared/hooks/useSocket.ts
import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_BASE } from '../config'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export function useSocket(roomId: string) {  // ⚠ 移除 seatId 依赖（I15）
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const s = io(API_BASE || window.location.origin, {
      query: { roomId },  // ⚠ 不传 seatId，claim 后通过 socket.emit 通知（I15）
      // TODO: auth: { token: getCookie('myvtt-auth') },
    })

    s.on('connect', () => setConnectionStatus('connected'))
    s.on('disconnect', () => setConnectionStatus('disconnected'))

    // ⚠ 重连后全量刷新 store 数据（A5）
    s.io.on('reconnect', () => {
      setConnectionStatus('connected')
      // reinit 由 store 提供，在 App.tsx 中通过 useEffect 监听 connectionStatus 变化触发
    })

    socketRef.current = s
    setSocket(s)

    return () => {
      s.disconnect()
      socketRef.current = null
      setSocket(null)
    }
  }, [roomId])  // ⚠ 只依赖 roomId（I15）

  return { socket, connectionStatus }
}
```

- [ ] **Step 3: 安装客户端 socket.io-client**

```bash
npm install socket.io-client
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/api.ts src/shared/hooks/useSocket.ts package.json package-lock.json
git commit -m "feat: API wrapper and Socket.io connection hook"
```

---

### Task 12: worldStore 重写

**Files:**
- Modify: `src/stores/worldStore.ts` — 完全重写
- Modify: `src/stores/selectors.ts` — 适配新数据结构

这是最大的改造。核心变化：

1. 移除所有 `_yDoc`、`_yScenes`、`_yEntities` 等 Yjs 引用
2. `init()` 从 REST API **并行**加载初始数据 + 注册 Socket.io 事件监听
3. 所有 action 改为 `async`，**不做乐观更新**——等 WS 事件统一更新 store
4. WS 事件回调是 store 的**唯一更新路径**（见下方设计决策）

#### 设计决策：Store 更新策略

**⚠ 统一规则（解决审查 A3/A4）：初期不做乐观更新。所有 store 状态变更只通过 WS 事件触发。**

数据流：`客户端 action → REST API → 服务端写 DB → Socket.io emit → WS 事件回调更新 store`

- REST 响应仅用于错误处理（HTTP 4xx/5xx），不用于更新 store
- 自己发起的操作也通过 WS 事件更新（Socket.io 会将事件广播回发送者）
- 好处：**store 更新路径唯一**，无需去重逻辑，无需乐观更新回滚
- 代价：UI 有 ~50-100ms 延迟（服务端 RTT），对于大部分操作可接受
- 例外：token 拖动中间状态走 ref（不经 store），不受此规则影响
- 后期优化：稳定后可对 **个别高频操作** 选择性加乐观更新 + 快照回滚（参考附录 I12 模式）

**⚠ 服务端广播必须包含发送者（解决自更新问题）：** Socket.io 路由中使用 `io.to(roomId).emit()` 而非 `socket.broadcast.to(roomId).emit()`，确保发起操作的客户端也收到 WS 事件。

- [ ] **Step 1: 定义完整的 WorldState 接口**

**⚠ 关键数据结构变更（解决审查 R2/R4）：**
- `entities` 从 `Entity[]` 改为 `Record<string, Entity>`：O(1) 查找 + 单实体更新不触发全量 re-render
- `tokens` 从 `MapToken[]` 改为 `Record<string, MapToken>`：同理
- `combatState.tokens` 在 store 层存为 `Record<string, MapToken>`（非 JSON 字符串），DB 层负责 JSON 序列化

```typescript
import type { Socket } from 'socket.io-client'
import type { Entity, EntityPermissions, MapToken, Blueprint } from '../shared/entityTypes'
import type { ShowcaseItem } from '../showcase/showcaseTypes'

// ── 新版 Scene（氛围相关字段内嵌，战斗字段移至 CombatState）──
export interface Scene {
  id: string
  name: string
  sortOrder: number
  gmOnly: boolean
  atmosphere: {
    imageUrl: string
    width: number
    height: number
    particlePreset: string
    ambientPreset: string
    ambientAudioUrl: string
    ambientAudioVolume: number
  }
}

export interface RoomState {
  activeSceneId: string | null
  activeEncounterId: string | null  // 新增：战斗状态判断依据
}

export interface CombatState {
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
  tokens: Record<string, MapToken>  // ⚠ 已解析的对象，非 JSON 字符串
  initiativeOrder: string[]
  initiativeIndex: number
}

export interface HandoutAsset {
  id: string
  imageUrl: string
  title?: string
  description?: string
  createdAt: number
}

export interface TeamTracker {
  id: string
  label: string
  current: number
  max: number
  color: string
  sortOrder: number
}

export interface ChatMessage {
  id: string
  type: 'text' | 'roll'
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string
  content?: string
  rollData?: { expression: string; terms: unknown[]; total: number }
  timestamp: number
  retracted?: boolean
}

// ── WorldState 完整接口 ──
interface WorldState {
  // ── 数据切片 ──
  room: RoomState
  scenes: Scene[]
  entities: Record<string, Entity>          // ⚠ 改为 Record（R4）
  sceneEntityMap: Record<string, string[]>  // 新增：场景→实体ID列表映射
  chatMessages: ChatMessage[]
  combatState: CombatState | null
  showcaseItems: ShowcaseItem[]
  showcasePinnedItemId: string | null
  handoutAssets: HandoutAsset[]
  blueprints: Blueprint[]
  teamTrackers: TeamTracker[]
  assets: AssetRecord[]                     // 统一素材管理

  // ── 内部引用 ──
  _socket: Socket | null
  _roomId: string | null

  // ── 生命周期 ──
  init: (roomId: string, socket: Socket) => Promise<() => void>
  reinit: () => Promise<void>  // 重连后重新加载（A5）

  // ── Actions（全部 async，仅发 REST 请求，不修改 store）──
  // 场景
  setActiveScene: (sceneId: string) => Promise<void>
  createScene: (data: Partial<Scene>) => Promise<void>
  updateScene: (id: string, updates: Partial<Scene>) => Promise<void>
  deleteScene: (id: string) => Promise<void>

  // 实体
  createEntity: (data: Partial<Entity>) => Promise<string>  // 返回新 ID
  updateEntity: (id: string, updates: Partial<Entity>) => Promise<void>
  deleteEntity: (id: string) => Promise<void>
  linkEntityToScene: (sceneId: string, entityId: string) => Promise<void>
  unlinkEntityFromScene: (sceneId: string, entityId: string) => Promise<void>

  // 战斗
  activateEncounter: (encounterId: string) => Promise<void>
  endCombat: () => Promise<void>
  updateCombat: (changes: Partial<CombatState>) => Promise<void>
  addToken: (token: Partial<MapToken>) => Promise<void>
  updateToken: (tokenId: string, changes: Partial<MapToken>) => Promise<void>
  removeToken: (tokenId: string) => Promise<void>

  // 聊天
  sendMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => Promise<void>
  sendRoll: (data: { formula: string; resolvedExpression?: string; senderId: string; senderName: string; senderColor: string; portraitUrl?: string }) => Promise<void>
  retractMessage: (id: string) => Promise<void>

  // 展示
  addShowcaseItem: (item: Partial<ShowcaseItem>) => Promise<void>
  removeShowcaseItem: (id: string) => Promise<void>
  clearShowcase: () => Promise<void>
  pinShowcaseItem: (id: string) => Promise<void>
  unpinShowcaseItem: () => Promise<void>

  // 追踪器
  createTracker: (data: Partial<TeamTracker>) => Promise<void>
  updateTracker: (id: string, changes: Partial<TeamTracker>) => Promise<void>
  deleteTracker: (id: string) => Promise<void>
}
```

**⚠ Selector 适配说明（解决审查 R5）：**

由于 `entities` 从数组改为 Record，以下 selector 需要更新：

```typescript
// selectors.ts 变更清单
// 旧：export const selectEntities = (s) => s.entities
// 新：export const selectEntities = (s) => Object.values(s.entities)  // 组件仍拿到数组
// 说明：只影响需要遍历的地方，单实体查找更高效

// 旧：export function selectEntityById(id) { return (s) => s.entities.find(e => e.id === id) ?? null }
// 新：export function selectEntityById(id) { return (s) => id ? s.entities[id] ?? null : null }
// 说明：O(1) 查找，且只有该实体变化时才 re-render

// 旧：export const selectIsCombat = (s) => selectActiveScene(s)?.combatActive ?? false
// 新：export const selectIsCombat = (s) => s.room.activeEncounterId != null
// 说明：derived boolean，不订阅整个 room 对象

// 旧：export const selectTokens = (s) => s.tokens
// 新：export const selectTokens = (s) => s.combatState ? Object.values(s.combatState.tokens) : []
// 说明：tokens 现在嵌套在 combatState 中

// ⚠ derived selector 原则（R5）：
// 所有从 room 读取的地方都应用 derived selector，避免订阅整个 room 对象
export const selectActiveSceneId = (s: { room: RoomState }) => s.room.activeSceneId
export const selectActiveEncounterId = (s: { room: RoomState }) => s.room.activeEncounterId
export const selectIsCombat = (s: { room: RoomState }) => s.room.activeEncounterId != null
```

- [ ] **Step 2: 重写 init() 方法**

```typescript
init: async (roomId, socket) => {
  set({ _socket: socket, _roomId: roomId })

  // ⚠ 并行加载所有初始数据（R1: async-parallel）
  const [scenesArr, entitiesArr, chat, combat, trackers, state, assets, showcase] = await Promise.all([
    api.get<Scene[]>(`/api/rooms/${roomId}/scenes`),
    api.get<Entity[]>(`/api/rooms/${roomId}/entities`),
    api.get<ChatMessage[]>(`/api/rooms/${roomId}/chat?limit=200`),
    api.get<CombatState | null>(`/api/rooms/${roomId}/combat`),
    api.get<TeamTracker[]>(`/api/rooms/${roomId}/team-trackers`),
    api.get<RoomState>(`/api/rooms/${roomId}/state`),
    api.get<AssetRecord[]>(`/api/rooms/${roomId}/assets`),
    api.get<ShowcaseItem[]>(`/api/rooms/${roomId}/showcase`),
  ])

  // 转换数组为 Record（R4）
  const entities: Record<string, Entity> = {}
  for (const e of entitiesArr) entities[e.id] = e

  // 构建 sceneEntityMap（I10）
  const sceneEntityMap: Record<string, string[]> = {}
  for (const scene of scenesArr) {
    sceneEntityMap[scene.id] = (scene as any).entityIds ?? []
  }

  set({
    scenes: scenesArr, entities, sceneEntityMap,
    chatMessages: chat, combatState: combat,
    teamTrackers: trackers, room: state,
    assets, showcaseItems: showcase,
  })

  // 注册 Socket.io 事件监听器（完整列表见附录 C6）
  // 实体：使用 Record 更新，只改变一个 key
  socket.on('entity:created', ({ entity }: { entity: Entity }) => set(s => ({
    entities: { ...s.entities, [entity.id]: entity }
  })))
  socket.on('entity:updated', ({ id, changes }: { id: string; changes: Partial<Entity> }) => set(s => {
    const existing = s.entities[id]
    if (!existing) return s
    const merged = { ...existing }
    // deep merge rule_data 和 permissions
    if (changes.ruleData) merged.ruleData = deepMerge(existing.ruleData || {}, changes.ruleData)
    if (changes.permissions) merged.permissions = deepMerge(existing.permissions, changes.permissions)
    for (const [k, v] of Object.entries(changes)) {
      if (k !== 'ruleData' && k !== 'permissions') (merged as any)[k] = v
    }
    return { entities: { ...s.entities, [id]: merged } }
  }))
  socket.on('entity:deleted', ({ id }: { id: string }) => set(s => {
    const { [id]: _, ...rest } = s.entities
    return { entities: rest }
  }))
  // ... 同理注册 scene:*, combat:*, chat:*, showcase:*, tracker:*, room:* 等
  // 完整事件列表见附录 A.3 [C6]

  return () => {
    // cleanup all listeners
    const events = [
      'entity:created', 'entity:updated', 'entity:deleted',
      'scene:created', 'scene:updated', 'scene:deleted',
      'scene:entity:linked', 'scene:entity:unlinked',
      'chat:new', 'chat:retracted',
      'combat:activated', 'combat:updated', 'combat:ended',
      'combat:token:added', 'combat:token:updated', 'combat:token:removed',
      'showcase:created', 'showcase:updated', 'showcase:deleted', 'showcase:cleared', 'showcase:pinned', 'showcase:unpinned',
      'room:state:updated',
      'tracker:created', 'tracker:updated', 'tracker:deleted',
      'asset:created', 'asset:updated', 'asset:deleted',
    ]
    events.forEach(e => socket.off(e))
  }
}
```

- [ ] **Step 3: 实现 reinit()（断线重连后重新加载）**

**⚠ 重连状态同步（解决审查 A5）：** Socket.io 断线期间丢失的 WS 事件无法恢复。必须在重连后全量拉取最新数据。

```typescript
reinit: async () => {
  const { _roomId: roomId, _socket: socket } = get()
  if (!roomId || !socket) return
  // 复用 init 的并行加载逻辑，但不重新注册 WS 事件（已在 init 中注册）
  const [scenesArr, entitiesArr, chat, combat, trackers, state, assets, showcase] = await Promise.all([
    api.get<Scene[]>(`/api/rooms/${roomId}/scenes`),
    api.get<Entity[]>(`/api/rooms/${roomId}/entities`),
    api.get<ChatMessage[]>(`/api/rooms/${roomId}/chat?limit=200`),
    api.get<CombatState | null>(`/api/rooms/${roomId}/combat`),
    api.get<TeamTracker[]>(`/api/rooms/${roomId}/team-trackers`),
    api.get<RoomState>(`/api/rooms/${roomId}/state`),
    api.get<AssetRecord[]>(`/api/rooms/${roomId}/assets`),
    api.get<ShowcaseItem[]>(`/api/rooms/${roomId}/showcase`),
  ])
  const entities: Record<string, Entity> = {}
  for (const e of entitiesArr) entities[e.id] = e
  const sceneEntityMap: Record<string, string[]> = {}
  for (const scene of scenesArr) sceneEntityMap[scene.id] = (scene as any).entityIds ?? []
  set({ scenes: scenesArr, entities, sceneEntityMap, chatMessages: chat, combatState: combat, teamTrackers: trackers, room: state, assets, showcaseItems: showcase })
}
```

- [ ] **Step 4: 重写 action 方法**

**⚠ 所有 action 只发 REST 请求，不修改 store。Store 更新由 WS 事件回调处理。**

```typescript
// 示例：updateEntity — 只发请求，不改 store
updateEntity: async (id, updates) => {
  const roomId = get()._roomId
  if (!roomId) return
  await api.patch(`/api/rooms/${roomId}/entities/${id}`, updates)
  // store 更新由 socket.on('entity:updated') 处理
},

// 示例：createScene
createScene: async (data) => {
  const roomId = get()._roomId
  if (!roomId) return
  await api.post(`/api/rooms/${roomId}/scenes`, data)
  // store 更新由 socket.on('scene:created') 处理
},

// 示例：setActiveScene
setActiveScene: async (sceneId) => {
  const roomId = get()._roomId
  if (!roomId) return
  await api.patch(`/api/rooms/${roomId}/state`, { activeSceneId: sceneId })
  // store 更新由 socket.on('room:state:updated') 处理
},
```
```

- [ ] **Step 4: 处理 Scene 字段迁移**

旧 `Scene` 接口有 22 个字段（含 grid/combat/initiative），新 `Scene` 只有 5 个（id, name, sort_order, atmosphere, gm_only）。grid/token/initiative 移到 `combatState`。

需要更新 `Scene` 接口 + 所有读取 `scene.gridSize`、`scene.combatActive` 等的组件改为读 `combatState`。

- [ ] **Step 5: 编写 selector 适配 + 单元测试（解决审查 T1）**

**⚠ worldStore 重写影响 66 个 selector 调用和所有组件。必须有自动化回归测试。**

修改 `src/stores/selectors.ts`，适配 `entities: Record` 和新 `RoomState`。同时编写测试：

```typescript
// src/stores/__tests__/selectors.test.ts
import { describe, it, expect } from 'vitest'
import {
  selectEntities, selectEntityById, selectActiveScene,
  selectIsCombat, selectTokens, selectActiveSceneId,
} from '../selectors'

const mockState = {
  room: { activeSceneId: 's1', activeEncounterId: null },
  scenes: [
    { id: 's1', name: 'Tavern', sortOrder: 0, gmOnly: false, atmosphere: { imageUrl: '', width: 0, height: 0, particlePreset: 'none', ambientPreset: 'none', ambientAudioUrl: '', ambientAudioVolume: 0.5 } },
  ],
  entities: {
    'e1': { id: 'e1', name: 'Hero', imageUrl: '', color: '#f00', size: 1, notes: '', ruleData: null, permissions: { default: 'observer', seats: {} }, persistent: true },
    'e2': { id: 'e2', name: 'Goblin', imageUrl: '', color: '#0f0', size: 1, notes: '', ruleData: null, permissions: { default: 'observer', seats: {} }, persistent: false },
  },
  combatState: null,
}

describe('selectors with Record-based entities', () => {
  it('selectEntities returns array', () => {
    const result = selectEntities(mockState)
    expect(result).toHaveLength(2)
    expect(result.map(e => e.id).sort()).toEqual(['e1', 'e2'])
  })

  it('selectEntityById returns entity by ID (O(1))', () => {
    expect(selectEntityById('e1')(mockState)?.name).toBe('Hero')
    expect(selectEntityById('nonexistent')(mockState)).toBeNull()
    expect(selectEntityById(null)(mockState)).toBeNull()
  })

  it('selectActiveScene returns correct scene', () => {
    expect(selectActiveScene(mockState)?.name).toBe('Tavern')
  })

  it('selectIsCombat uses activeEncounterId', () => {
    expect(selectIsCombat(mockState)).toBe(false)
    expect(selectIsCombat({ room: { activeSceneId: 's1', activeEncounterId: 'enc1' } })).toBe(true)
  })

  it('selectTokens returns empty when no combat', () => {
    expect(selectTokens(mockState)).toEqual([])
  })

  it('selectTokens returns token array from combatState', () => {
    const withCombat = {
      ...mockState,
      combatState: {
        tokens: { 't1': { id: 't1', x: 0, y: 0, size: 1, permissions: { default: 'observer', seats: {} } } },
        mapUrl: null, mapWidth: null, mapHeight: null,
        grid: { size: 50, snap: true, visible: true, color: '#fff', offsetX: 0, offsetY: 0 },
        initiativeOrder: [], initiativeIndex: 0,
      },
    }
    expect(selectTokens(withCombat)).toHaveLength(1)
    expect(selectTokens(withCombat)[0].id).toBe('t1')
  })
})
```

```typescript
// src/stores/__tests__/deepMerge.test.ts
import { describe, it, expect } from 'vitest'
import { deepMerge } from '../../server/deepMerge'  // 或 src/shared/deepMerge

describe('deepMerge', () => {
  it('merges flat objects', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 })
  })

  it('deep merges nested objects', () => {
    expect(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3, z: 4 } }))
      .toEqual({ a: { x: 1, y: 3, z: 4 } })
  })

  it('handles null/undefined in target', () => {
    expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 })
    expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 })
  })

  it('overwrites arrays (no array merge)', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
  })

  it('handles empty source', () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 })
  })
})
```

- [ ] **Step 6: 验证**

启动新服务端 + 客户端，验证：
- 进入房间 → 加载数据 → 显示场景列表
- 修改实体 → 另一个标签页看到更新（通过 WS 事件，非直接更新）
- 添加场景 → 列表更新
- 运行 `npx vitest run src/stores/__tests__/` → 全部通过

- [ ] **Step 7: Commit**

```bash
git add src/stores/worldStore.ts src/stores/selectors.ts src/stores/__tests__/
git commit -m "feat: rewrite worldStore for REST + Socket.io with selector tests"
```

---

### Task 13: identityStore 重写

**Files:**
- Modify: `src/stores/identityStore.ts`

- [ ] **Step 1: 移除 Yjs 依赖**

```typescript
// 删除：
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'

// 替换为：
import type { Socket } from 'socket.io-client'
import { api } from '../shared/api'
```

- [ ] **Step 2: 重写 init() 和 actions**

```typescript
init: async (roomId: string, socket: Socket) => {
  set({ _socket: socket, _roomId: roomId })

  // 加载座位
  const seats = await api.get<Seat[]>(`/api/rooms/${roomId}/seats`)
  set({ seats })

  // WS 事件
  socket.on('seat:created', ({ seat }) => set(s => ({ seats: [...s.seats, seat] })))
  socket.on('seat:updated', ({ id, changes }) => set(s => ({
    seats: s.seats.map(seat => seat.id === id ? { ...seat, ...changes } : seat)
  })))
  socket.on('seat:deleted', ({ id }) => set(s => ({
    seats: s.seats.filter(seat => seat.id !== id)
  })))

  // Awareness online tracking
  socket.on('awareness:update', ({ seatId }) => {
    if (seatId) set(s => ({ onlineSeatIds: new Set([...s.onlineSeatIds, seatId]) }))
  })
  socket.on('awareness:remove', ({ seatId }) => {
    if (seatId) set(s => {
      const next = new Set(s.onlineSeatIds)
      next.delete(seatId)
      return { onlineSeatIds: next }
    })
  })

  // Auto-claim from sessionStorage
  const cached = sessionStorage.getItem('myvtt-seat-id')
  if (cached && seats.some(s => s.id === cached)) {
    set({ mySeatId: cached })
  }

  return () => {
    socket.off('seat:created')
    socket.off('seat:updated')
    socket.off('seat:deleted')
    socket.off('awareness:update')
    socket.off('awareness:remove')
  }
},

createSeat: async (name, role, color) => {
  const roomId = get()._roomId
  if (!roomId) return ''
  const seatColor = color || SEAT_COLORS[get().seats.length % SEAT_COLORS.length]
  const seat = await api.post<Seat>(`/api/rooms/${roomId}/seats`, { name, color: seatColor, role })
  get().claimSeat(seat.id)
  return seat.id
},
```

- [ ] **Step 3: 验证座位选择流程**

创建座位 → claim → 查看在线状态。

- [ ] **Step 4: Commit**

---

### Task 14: App.tsx 初始化流程改造

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 替换 useYjsConnection 为 useSocket**

```typescript
// 旧：
const { yDoc, isLoading, awareness } = useYjsConnection(roomId)
const world = useWorld(yDoc)

// 新：
const { socket, connectionStatus } = useSocket(roomId)  // ⚠ 不传 seatId（I15）
const [isLoading, setIsLoading] = useState(true)

// ⚠ 初始化（含 cancelled 竞态保护 — I11）
useEffect(() => {
  if (!socket) return
  let cancelled = false
  let cleanups: (() => void)[] = []

  ;(async () => {
    const [cw, ci] = await Promise.all([
      useWorldStore.getState().init(roomId, socket),
      useIdentityStore.getState().init(roomId, socket),
    ])
    if (cancelled) { cw(); ci(); return }
    cleanups = [cw, ci]
    setIsLoading(false)
  })()

  return () => {
    cancelled = true
    cleanups.forEach(fn => fn())
  }
}, [socket, roomId])

// ⚠ 重连后全量刷新（A5）
useEffect(() => {
  if (connectionStatus !== 'connected' || isLoading) return
  // connectionStatus 从 disconnected → connected 时，说明发生了重连
  useWorldStore.getState().reinit()
}, [connectionStatus])
```

- [ ] **Step 2: 移除 yDoc 相关的 prop 传递**

所有传 `yDoc` 的组件需要改为不接收 yDoc：
- `ChatPanel` — 不再接收 `yDoc`，改为从 store 读数据
- `TeamDashboard` — 同上
- `ShowcaseOverlay` — 同上

- [ ] **Step 3: 验证完整初始化流程**

启动 → 选座位 → 进入房间 → 看到场景 → 聊天 → 切场景。

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: replace Yjs initialization with Socket.io + REST"
```

---

## Phase 4 — 模块级适配

### Task 15: ChatPanel 适配

**Files:**
- Modify: `src/chat/ChatPanel.tsx`
- Modify: `src/chat/ChatInput.tsx`

- [ ] **Step 1: ChatPanel 改为从 store 读消息**

```typescript
// 旧：
const yChat = yDoc.getArray<ChatMessage>('chat_log')
useEffect(() => {
  setMessages(yChat.toArray())
  yChat.observe(observer)
  ...
})

// 新：
const messages = useWorldStore(s => s.chatMessages)
// WS 事件监听已在 store init() 中注册
// toast 逻辑改为响应 messages 变化
```

- [ ] **Step 2: ChatInput handleSend 改为 POST**

```typescript
// 旧：
const handleSend = (msg) => yChat.push([msg])

// 新：
const handleSend = async (msg) => {
  await api.post(`/api/rooms/${roomId}/chat`, {
    sender_id: msg.senderId,
    sender_name: msg.senderName,
    sender_color: msg.senderColor,
    portrait_url: msg.portraitUrl,
    content: msg.content,
  })
}
```

- [ ] **Step 3: handleRoll 改为 POST /roll**

```typescript
// 旧：
const result = rollCompound(expression)
yChat.push([{ type: 'roll', ... }])

// 新：
await api.post(`/api/rooms/${roomId}/roll`, {
  formula, resolvedExpression, sender_id, sender_name, sender_color, portrait_url
})
```

- [ ] **Step 4: 验证聊天和骰子功能**

- [ ] **Step 5: Commit**

---

### Task 16: useAwarenessResource 重写

**Files:**
- Modify: `src/shared/hooks/useAwarenessResource.ts`

- [ ] **Step 1: 用 Socket.io 替代 Yjs Awareness（含节流）**

接口保持不变（`broadcastEditing`, `clearEditing`, `remoteEdits`），内部实现改为 Socket.io events。

**⚠ 节流策略（CRITICAL）：** Socket.io `emit()` 没有内建节流，必须在客户端显式 throttle。复用当前 `useAwarenessResource` 中已有的 16ms throttle 逻辑（`lastBroadcastRef` + `pendingBroadcastRef` 模式），仅替换底层传输。

```typescript
const THROTTLE_MS = 16 // ~60fps，与当前实现一致

export function useAwarenessResource(
  socket: Socket | null,  // 改为 Socket
  mySeatId: string | null,
  mySeatColor: string | null,
) {
  const lastBroadcastRef = useRef(0)
  const pendingBroadcastRef = useRef<{ timeoutId: number } | null>(null)

  const broadcastEditing = useCallback((entityId: string, field: string, value: number) => {
    if (!socket || !mySeatId) return

    const broadcast = () => {
      lastBroadcastRef.current = Date.now()
      socket.emit('awareness:update', {
        field: 'resourceDrag',
        state: { entityId, field, value, seatId: mySeatId, color: mySeatColor ?? '#3b82f6' },
      })
    }

    // 复用现有 throttle 逻辑：立即发送 or 延迟到下一个 16ms 窗口
    const timeSince = Date.now() - lastBroadcastRef.current
    if (timeSince >= THROTTLE_MS) {
      broadcast()
      if (pendingBroadcastRef.current) {
        clearTimeout(pendingBroadcastRef.current.timeoutId)
        pendingBroadcastRef.current = null
      }
    } else {
      if (pendingBroadcastRef.current) clearTimeout(pendingBroadcastRef.current.timeoutId)
      const timeoutId = window.setTimeout(() => {
        broadcast()
        pendingBroadcastRef.current = null
      }, THROTTLE_MS - timeSince)
      pendingBroadcastRef.current = { timeoutId }
    }
  }, [socket, mySeatId, mySeatColor])

  const clearEditing = useCallback(() => {
    if (!socket) return
    if (pendingBroadcastRef.current) {
      clearTimeout(pendingBroadcastRef.current.timeoutId)
      pendingBroadcastRef.current = null
    }
    socket.emit('awareness:update', { field: 'resourceDrag', state: null })
  }, [socket])

  // remoteEdits ← socket.on('awareness:update', ...)
}
```

- [ ] **Step 2: 更新所有调用点的参数**

将 `awareness` 参数改为 `socket`。

- [ ] **Step 3: 验证资源条拖拽实时同步**

- [ ] **Step 4: Commit**

---

### Task 17: Combat 模块适配

**Files:**
- Modify: `src/combat/KonvaMap.tsx`
- Modify: `src/combat/KonvaTokenLayer.tsx`
- Modify: `src/combat/TacticalPanel.tsx`

- [ ] **Step 1: Token 数据源从 scene.tokens 改为 store.combatState.tokens**

```typescript
// 旧：从 worldStore.tokens 读取（通过 Yjs scene map）
// 新：使用 selectTokens selector（内部从 combatState.tokens Record 转为数组）
const tokens = useWorldStore(selectTokens)
// selectTokens 已在 selectors.ts 中定义：
// (s) => s.combatState ? Object.values(s.combatState.tokens) : []
```

**⚠ 注意：** `combatState.tokens` 在 store 中已经是 `Record<string, MapToken>`（非 JSON 字符串），DB 序列化在服务端 `toCamel()` 层处理。组件层**永远不需要** `JSON.parse()`。

- [ ] **Step 2: Token 拖动提交改为 REST + WS（含节流）**

**⚠ 高频事件节流（CRITICAL）：** Token 拖动产生 ~60fps 的 pointermove 事件。必须：
1. 拖动中的中间位置用 `useRef` 存储（不触发 re-render，符合 `rerender-use-ref-transient-values` 规则）
2. Socket.io 广播使用 **50ms throttle**（~20fps，足够流畅且不过载网络）
3. 松手时发一次 REST PATCH 持久化最终位置

```typescript
// 拖动中：
//   - posRef.current = { x, y }  （ref 存中间值，不 re-render）
//   - 50ms throttle: socket.emit('token:dragging', { tokenId, x, y })  （广播给其他客户端）
// 松手：
//   - api.patch(`/api/rooms/${roomId}/combat/tokens/${tokenId}`, { x: snappedX, y: snappedY })
//   - 服务端持久化 + 广播 combat:token:updated
```

这与当前 token drag 模式完全一致（拖动中只更新本地状态，松手才写入 Yjs），仅增加了 Socket.io 广播层。

- [ ] **Step 3: Grid 配置读取改为 combatState.grid**

原来从 `scene.gridSize` 等读取，现在从 `combatState.grid` JSON 读取。

- [ ] **Step 4: Initiative 改为 combatState**

原来从 `scene.initiativeOrder` 读取，现在从 `combatState.initiative_order` 读取。

- [ ] **Step 5: 验证战斗完整流程**

进入战斗 → 看到地图和 token → 拖动 token → 两个客户端同步 → 先攻追踪 → 结束战斗。

- [ ] **Step 6: Commit**

---

### Task 18: 其余 UI 组件适配

**Files:**
- Modify: `src/showcase/ShowcaseOverlay.tsx` — 移除 yDoc prop
- Modify: `src/showcase/useShowcase.ts` — 从 store 读数据
- Modify: `src/team/TeamDashboard.tsx` — 移除 yDoc prop
- Modify: `src/team/useTeamMetrics.ts` — 从 store 读数据
- Modify: `src/dock/useHandoutAssets.ts` — 从 store 读数据
- Modify: `src/gm/GmDock.tsx` — blueprint 数据源变更
- Modify: `src/entities/entityLifecycle.ts` — 调用改为 REST API
- Modify: `src/entities/useEntities.ts` — 如仍需要

- [ ] **Step 1: 更新 Showcase 模块**

ShowcaseOverlay 和 useShowcase 不再接收 yDoc，改为 useWorldStore 读数据 + actions。

- [ ] **Step 2: 更新 Team 模块**

TeamDashboard 和 useTeamMetrics 同理。

- [ ] **Step 3: 更新 Dock 模块**

useHandoutAssets 改为从 store 读 handoutAssets + REST actions。

- [ ] **Step 4: 更新 entityLifecycle**

gcOrphanedEntities、addEntityToAllScenes 改为调用 REST API。

- [ ] **Step 5: 全量手动测试**

逐个功能手动测试：
- 场景切换 + 氛围（图片、粒子、音频）
- 角色卡查看和编辑
- 战斗模式进入/退出
- Token 拖拽和属性修改
- 聊天发消息和掷骰
- 展示功能
- 团队追踪器
- 素材上传和管理

- [ ] **Step 6: Commit**

---

## Chunk 4: Phase 5 — 清理 + 迁移

### Task 19: Y.Doc → SQLite 迁移脚本

**Files:**
- Create: `scripts/migrate-ydoc-to-sqlite.ts`

- [ ] **Step 1: 实现迁移脚本**

```typescript
// scripts/migrate-ydoc-to-sqlite.ts
// 读取旧 LevelDB 中的 Y.Doc → 写入新 SQLite
//
// 用法: tsx scripts/migrate-ydoc-to-sqlite.ts <roomId>
// 前提: ./db/ 中有旧的 LevelDB 数据

import { LeveldbPersistence } from 'y-leveldb'
import * as Y from 'yjs'
import Database from 'better-sqlite3'
import { initRoomSchema } from '../server/schema'
import path from 'path'
import fs from 'fs'

const roomId = process.argv[2]
if (!roomId) { console.error('Usage: tsx scripts/migrate-ydoc-to-sqlite.ts <roomId>'); process.exit(1) }

const DATA_DIR = process.env.DATA_DIR || './data'
const OLD_DB = process.env.YPERSISTENCE || './db'

async function migrate() {
  // 读取旧 Y.Doc
  const ldb = new LeveldbPersistence(OLD_DB)
  const yDoc = await ldb.getYDoc(roomId)

  // 创建新 SQLite
  const roomDir = path.join(DATA_DIR, 'rooms', roomId)
  fs.mkdirSync(roomDir, { recursive: true })
  const db = new Database(path.join(roomDir, 'room.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initRoomSchema(db)

  // 迁移 scenes
  const yScenes = yDoc.getMap('scenes')
  yScenes.forEach((sceneMap: any, sceneId: string) => {
    if (!(sceneMap instanceof Y.Map)) return
    const atmosphere = {
      imageUrl: sceneMap.get('atmosphereImageUrl') || sceneMap.get('imageUrl') || '',
      width: sceneMap.get('width') || 0,
      height: sceneMap.get('height') || 0,
      particlePreset: sceneMap.get('particlePreset') || 'none',
      ambientPreset: sceneMap.get('ambientPreset') || 'none',
      ambientAudioUrl: sceneMap.get('ambientAudioUrl') || '',
      ambientAudioVolume: sceneMap.get('ambientAudioVolume') ?? 0.5,
    }
    db.prepare('INSERT OR IGNORE INTO scenes (id, name, sort_order, atmosphere) VALUES (?, ?, ?, ?)')
      .run(sceneId, sceneMap.get('name') || '', sceneMap.get('sortOrder') || 0, JSON.stringify(atmosphere))

    // 迁移 scene → entity 关联
    const entityIds = sceneMap.get('entityIds')
    if (entityIds instanceof Y.Map) {
      entityIds.forEach((_: any, eid: string) => {
        db.prepare('INSERT OR IGNORE INTO scene_entities (scene_id, entity_id) VALUES (?, ?)').run(sceneId, eid)
      })
    }
  })

  // 迁移 entities
  const yEntities = yDoc.getMap('entities')
  yEntities.forEach((yMap: any, entityId: string) => {
    if (!(yMap instanceof Y.Map)) return
    // 读取 permissions 和 ruleData（可能是 Y.Map）
    let permissions = { default: 'none', seats: {} }
    const permYMap = yMap.get('permissions')
    if (permYMap instanceof Y.Map) {
      const seats: Record<string, string> = {}
      const seatsYMap = permYMap.get('seats')
      if (seatsYMap instanceof Y.Map) seatsYMap.forEach((v: any, k: string) => { seats[k] = v })
      permissions = { default: (permYMap.get('default') as string) || 'none', seats }
    }

    let ruleData = {}
    const ruleYMap = yMap.get('ruleData')
    if (ruleYMap instanceof Y.Map) {
      ruleYMap.forEach((v: any, k: string) => { (ruleData as any)[k] = v })
    }

    // 读取 Y.Text fields
    const readText = (key: string) => {
      const v = yMap.get(key)
      if (v instanceof Y.Text) return v.toString()
      if (typeof v === 'string') return v
      return ''
    }

    db.prepare(
      `INSERT OR IGNORE INTO entities (id, name, image_url, color, size, notes, rule_data, permissions, persistent, blueprint_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entityId,
      readText('name'),
      yMap.get('imageUrl') || '',
      yMap.get('color') || '#888888',
      yMap.get('size') ?? 1,
      readText('notes'),
      JSON.stringify(ruleData),
      JSON.stringify(permissions),
      yMap.get('persistent') ? 1 : 0,
      yMap.get('blueprintId') || null,
    )
  })

  // 迁移 chat_log
  const yChat = yDoc.getArray('chat_log')
  const chatInsert = db.prepare(
    `INSERT OR IGNORE INTO chat_messages (id, type, sender_id, sender_name, sender_color, portrait_url, content, roll_data, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const msg of yChat.toArray()) {
    if (!msg || typeof msg !== 'object') continue
    const m = msg as any
    chatInsert.run(
      m.id, m.type || 'text', m.senderId, m.senderName, m.senderColor,
      m.portraitUrl || null, m.content || null,
      m.type === 'roll' ? JSON.stringify({ expression: m.expression, terms: m.terms, total: m.total }) : null,
      m.timestamp || Date.now(),
    )
  }

  // 迁移 seats
  const ySeats = yDoc.getMap('seats')
  ySeats.forEach((seat: any, seatId: string) => {
    if (!seat || typeof seat !== 'object') return
    db.prepare('INSERT OR IGNORE INTO seats (id, name, color, role) VALUES (?, ?, ?, ?)')
      .run(seatId, seat.name || '', seat.color || '#3b82f6', seat.role || 'PL')
  })

  // 迁移 team_metrics
  const yMetrics = yDoc.getMap('team_metrics')
  yMetrics.forEach((tracker: any, trackerId: string) => {
    if (!tracker || typeof tracker !== 'object') return
    db.prepare('INSERT OR IGNORE INTO team_trackers (id, label, current, max, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
      .run(trackerId, tracker.label, tracker.current || 0, tracker.max || 0, tracker.color || '#3b82f6', tracker.sortOrder || 0)
  })

  // 迁移 room state
  const yRoom = yDoc.getMap('room')
  const activeSceneId = yRoom.get('activeSceneId') as string | null
  if (activeSceneId) {
    db.prepare('UPDATE room_state SET active_scene_id = ? WHERE id = 1').run(activeSceneId)
  }

  // 迁移 showcase_items
  const yShowcase = yDoc.getMap('showcase_items')
  yShowcase.forEach((item: any, itemId: string) => {
    if (!item || typeof item !== 'object') return
    db.prepare('INSERT OR IGNORE INTO showcase_items (id, type, data, pinned) VALUES (?, ?, ?, ?)')
      .run(itemId, item.type || 'image', JSON.stringify(item), item.pinned ? 1 : 0)
  })

  db.close()
  console.log(`Migration complete for room "${roomId}"`)
  console.log(`  Scenes: ${yScenes.size}`)
  console.log(`  Entities: ${yEntities.size}`)
  console.log(`  Chat messages: ${yChat.length}`)
  console.log(`  Seats: ${ySeats.size}`)
}

migrate().catch(console.error)
```

- [ ] **Step 2: 测试迁移脚本**

用一个有数据的旧房间运行，验证 SQLite 数据正确。

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-ydoc-to-sqlite.ts
git commit -m "feat: Y.Doc to SQLite migration script"
```

---

### Task 20: 移除 Yjs 相关代码和依赖

**Files:**
- Delete: `src/yjs/useYjsConnection.ts`
- Delete: `src/yjs/useWorld.ts`
- Delete: `src/yjs/useRoom.ts`
- Delete: `src/yjs/useScenes.ts`
- Delete: `src/shared/yTextHelper.ts`
- Delete: `server/index.mjs`
- Modify: `package.json` — 移除 yjs, y-websocket, y-leveldb

- [ ] **Step 1: 删除不再使用的文件**

```bash
rm src/yjs/useYjsConnection.ts src/yjs/useWorld.ts src/yjs/useRoom.ts src/yjs/useScenes.ts
rm src/shared/yTextHelper.ts
rm server/index.mjs
```

- [ ] **Step 2: 卸载 Yjs 依赖**

```bash
npm uninstall yjs y-websocket y-leveldb
```

- [ ] **Step 3: 全量编译验证**

```bash
npm run build
# 预期：零 TypeScript 错误
```

- [ ] **Step 4: 运行所有测试**

```bash
npm test
# 修复任何因 Yjs 移除导致的测试失败
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Yjs, y-websocket, y-leveldb dependencies"
```

---

### Task 21: 文档更新

**Files:**
- Modify: `CLAUDE.md` — 更新技术栈、架构说明
- Delete/Update: `docs/design-discussion/50-54` — 标记为已被新架构替代

- [ ] **Step 1: 更新 CLAUDE.md**

关键变更：
- Tech Stack: 移除 yjs/y-websocket/y-leveldb，添加 socket.io/better-sqlite3
- Critical Architecture Notes: 移除 y-websocket version 注意事项和 Y.Doc Shared State 说明
- 添加新的 Server Architecture 说明（Socket.io + SQLite + per-room isolation）
- 更新 State Management 说明（REST + WS 替代 Yjs observers）

- [ ] **Step 2: 更新安全文档**

在 doc 50-54 开头标注"已被新架构（doc 42/43）替代"：
- doc 50: 聊天防伪 → 架构固有（服务端唯一写入者）
- doc 51: 骰子防伪 → 服务端掷骰，无需 HMAC
- doc 52: 聊天完整性 → 客户端无法直写 SQLite
- doc 53: 身份系统 → JWT + Socket.io auth（基本保留）
- doc 54: 权限隔离 → API 角色过滤（无需 AES-GCM）

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/design-discussion/
git commit -m "docs: update architecture docs for Socket.io + SQLite migration"
```

---

## 验证清单

### Phase 完成后的验收标准

| Phase | 验收标准 |
|-------|---------|
| Phase 1 | 新服务端可启动，Socket.io 连接成功，SQLite 数据库创建正常 |
| Phase 2 | 所有 REST 端点可用 curl 测试，返回正确数据，WS 事件广播正常 |
| Phase 3 | 客户端可通过新 store 加载和显示数据，修改操作同步到服务端 |
| Phase 4 | 聊天、战斗、资源条拖拽、展示等全部功能正常，多客户端实时同步 |
| Phase 5 | 旧数据可迁移，Yjs 完全移除，`npm run build` 和 `npm test` 通过 |

### 端到端测试场景（Happy Path）

1. **基础流程**：创建房间 → 创建座位 → claim → 进入房间
2. **场景管理**：创建/编辑/删除/切换场景，氛围图+粒子+音频
3. **角色系统**：创建实体 → 编辑属性 → 拖资源条 → 多客户端同步
4. **战斗模式**：进入战斗 → 放 token → 拖动 → 先攻追踪 → 结束
5. **聊天系统**：发文本 → 掷骰 → 切换说话人 → 撤回
6. **素材管理**：上传图片 → 设为战斗地图 → 删除
7. **展示功能**：展示图片 → 置顶 → 清除
8. **数据迁移**：用旧房间数据运行迁移脚本 → 新系统正常加载

### 错误路径 + 边界测试场景（解决审查 T2）

9. **网络断开恢复**：正常操作中 → 断开网络 / 关闭服务端 → UI 显示 disconnected → 恢复网络 → Socket.io 自动重连 → `reinit()` 拉取最新数据 → 断线期间其他客户端的操作全部同步到位
10. **并发编辑冲突**：两个客户端同时修改同一实体不同字段（如 A 改 name，B 改 color） → 两个修改都生效（deep merge）；同时修改同一字段 → last-write-wins，两端最终一致
11. **大量数据加载**：创建 50+ 实体、200+ 聊天消息 → 初始加载正常完成（Promise.all 并行，不超时）→ 滚动和交互流畅
12. **API 错误处理**：服务端返回 4xx → 客户端 action 的 Promise reject → 调用方可 catch 处理（如显示 toast）→ store 状态不变（因为 WS 事件不会到来）
13. **无效操作**：删除不存在的实体 → 404 → 无异常；PATCH 空 body → 200 ok（无字段更新）→ 无 WS 事件
14. **Token 拖动中断线**：拖动 token 过程中网络断开 → 本地 ref 中间状态保留 → 松手后 REST PATCH 失败 → token 回弹到拖动前位置

---

## 时间估计与风险

### 各 Phase 估计工作量

| Phase | 估计 | 风险 |
|-------|------|------|
| Phase 1: 基础设施 | 小 | 低 — 纯新增代码 |
| Phase 2: 服务端路由 | 中 | 低 — 独立模块，可逐个实现 |
| Phase 3: 客户端 store | 大 | **高** — worldStore 是核心，改错会影响所有组件 |
| Phase 4: 模块适配 | 中 | 中 — 组件多但改动模式一致 |
| Phase 5: 清理迁移 | 小 | 中 — 迁移脚本需处理各种边界情况 |

### 关键风险

1. **worldStore 重写**（Task 12）是最危险的步骤。建议：先完成所有服务端路由和测试（Phase 1-2），确认 API 稳定后再改客户端
2. **diceUtils 服务端导入**（Task 8）：tsx 运行时允许导入客户端 .ts 文件，但需确保 diceUtils 无浏览器依赖
3. **乐观更新 vs 等待响应**：初期建议不做乐观更新（等 API 响应后再更新 store），稳定后再加

---

## 附录 A：审查修正清单

本计划经过三轮独立审查，以下是所有 Critical 和 Important 级别问题的修正说明。实现时**必须**参照此附录。

### A.1 Phase 1 修正

**[C1] Vitest 无法发现 `server/__tests__/` 测试**

当前 vitest 配置 include 只匹配 `src/**`。在 Task 1 中需额外操作：

```typescript
// vitest.config.ts（或 vite.config.ts 的 test 配置）添加：
test: {
  include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  // 服务端测试用 node 环境（better-sqlite3 原生模块在 jsdom 下会崩溃）
  environmentMatchGlobs: [
    ['server/**', 'node'],
  ],
}
```

**[C2] 端口冲突**

新旧服务器不能同时运行在 4444。在 Task 1 的 `server/index.ts` 中，将默认端口改为读取 `.env`，开发时用不同端口运行。或者明确约定：**同一时间只运行一个服务端**，`dev:new` 替代 `dev` 使用。

**[I1] Socket.io CORS `origin: '*'` + `credentials: true` 违反规范**

修正为：

```typescript
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
})
```

**[I2] `setupAwareness` 依赖 `socket.data` 已被 `setupSocketAuth` 设置**

在 `awareness.ts` 开头加运行时守卫：

```typescript
if (!socket.data?.roomId) {
  console.warn('awareness: socket.data.roomId missing, skipping')
  return
}
```

### A.2 Phase 2 修正

**[C3] 缺失 3 个端点**

实现时必须补充：

1. **`POST /api/rooms/:roomId/seats/:id/claim`** — 在 `seats.ts` 中添加。匿名用户认领空座位，签发临时身份。

   **⚠ 安全风险（S1 — 已知问题，暂不阻塞）：** 当前 claim 端点没有身份验证——任何知道 seatId 的人都能 claim GM 座位，获得所有 GM-only 数据和写权限。这与当前 Yjs 架构有相同缺陷，但在服务端权威模型下影响更大（服务端基于 `socket.data.role` 做权限过滤）。**解决方案在 doc 53（身份系统与WebSocket鉴权方案设计）中设计，属于后续独立工作项。** 实现时在代码中添加 `// TODO: [S1] 实现 JWT 验证后替换此临时 claim 逻辑（参考 doc 53）` 注释。
2. **`POST /api/rooms/:roomId/combat/save-snapshot`** — 在 `combat.ts` 中添加。读取当前 `combat_state`，写入 `encounters` 表作为新预设。
3. **`PATCH /api/rooms/:roomId/assets/:id`** — 在 `assets.ts` 中添加。更新素材名称、标签等元数据，广播 `asset:updated`。

**[I3] 场景 atmosphere 合并应用 deepMerge 而非浅展开**

`scenes.ts` PATCH 中修正：

```typescript
// 旧（有 bug）：const merged = { ...existingAtmo, ...req.body.atmosphere }
// 新：
import { deepMerge } from '../deepMerge'
const merged = deepMerge(JSON.parse(existing.atmosphere || '{}'), req.body.atmosphere)
```

**[I4] Encounter grid 也应 deep merge**

`encounters.ts` PATCH 中，`grid` 字段改为 deep merge（同 entity 的 rule_data 处理方式），`tokens` 保持整体替换。

**[I5] GM-only 场景/预设的 WS 广播泄露给玩家**

修正广播逻辑——不使用 `io.to(roomId).emit()`，而是根据内容过滤：

```typescript
// GM-only 场景只广播给 GM 连接
if (scene.gm_only) {
  // 获取房间内所有 GM socket
  const sockets = await io.in(roomId).fetchSockets()
  for (const s of sockets) {
    if (s.data.role === 'GM') s.emit('scene:created', { scene })
  }
} else {
  io.to(roomId).emit('scene:created', { scene })
}
```

同理适用于 encounter 的 `gm_only` 广播。

**[I6] 变更路由缺少 `withRole` 中间件**

所有 POST/PATCH/DELETE 场景、预设、座位管理路由必须加 `withRole` 中间件 + GM 权限检查：

```typescript
router.post('/api/rooms/:roomId/scenes', room, withRole, (req, res) => {
  if (req.role !== 'GM') return res.status(403).json({ error: 'GM only' })
  // ...
})
```

**[I7] 座位创建缺少 `role` 字段校验**

```typescript
if (!['GM', 'PL'].includes(role)) {
  return res.status(400).json({ error: 'role must be GM or PL' })
}
```

**[I8] `encounters/:id/activate` 和 `combat/end` 应包在 SQLite 事务中**

```typescript
const activate = db.transaction(() => {
  db.prepare('UPDATE room_state SET active_encounter_id = ? WHERE id = 1').run(id)
  db.prepare('UPDATE combat_state SET map_url = ?, ... WHERE id = 1').run(...)
})
activate()
```

### A.3 Phase 3 修正

**[C4] 同步→异步 action 签名变更的完整影响分析**

所有当前同步调用 store action 的地方都需要改造。关键影响点：

| 旧调用模式 | 新调用模式 | 文件 |
|-----------|-----------|------|
| `addScene(scene, persistentEntityIds)` | `await createScene(data)` — persistent 实体的自动关联由服务端处理 | `App.tsx:200-203` |
| `deleteSceneRaw(id)` 后立即 `gcOrphanedEntities(...)` | `await deleteScene(id)` — 服务端 `ON DELETE CASCADE` 自动清理 scene_entities，GC 改为服务端逻辑或 API 调用 | `App.tsx:189-198` |
| `addEntity(entity)` + `addEntityToAllScenes(id, scenes)` | `await createEntity(data)` — 服务端在 `persistent=true` 时自动关联所有场景 | `App.tsx:205-209` |
| `setCombatActive(sceneId, active)` | `await activateEncounter(encounterId)` / `await endCombat()` | `App.tsx:371-373` |
| `setInitiativeOrder(sceneId, order)` | `await updateCombat({ initiative_order: order })` | `App.tsx:332-334` |
| `advanceInitiative(sceneId)` | `await updateCombat({ initiative_index: next })` | `App.tsx:335-337` |

**实现建议：** 对于需要立即反馈的操作（如删除），可以先乐观更新 store 再发 API。但初期建议不做乐观更新，等 API 响应后由 WS 事件更新 store。

**[C5] `useWorld` hook 和 `world.*` 直接 Yjs 引用的移除**

当前 `App.tsx` 中 `world.scenes`、`world.entities`、`world.blueprints` 是 Y.Map 引用，传给了 `entityLifecycle.ts` 函数。改造方案：

- **删除 `useWorld` hook** — 所有数据从 zustand store 读取
- **重写 `entityLifecycle.ts`：**
  - `gcOrphanedEntities` → 改为服务端逻辑。删除场景时 `ON DELETE CASCADE` 清理 `scene_entities`，非 persistent 且不被任何场景引用的 entity 由服务端定时 GC 或在删除场景的 API handler 中同步处理
  - `addEntityToAllScenes` → 服务端在创建 entity 时自动处理（`persistent=true` 分支已在 Task 6 实现）
  - `getPersistentEntityIds` → 不再需要，服务端处理

**[C6] 完整的 WS 事件处理器列表**

`worldStore.init()` 中必须注册的所有事件处理器：

```typescript
// 场景
socket.on('scene:created', ({ scene }) => set(s => ({ scenes: [...s.scenes, scene] })))
socket.on('scene:updated', ({ id, changes }) => set(s => ({
  scenes: s.scenes.map(sc => sc.id === id ? { ...sc, ...changes } : sc)
})))
socket.on('scene:deleted', ({ id }) => set(s => ({
  scenes: s.scenes.filter(sc => sc.id !== id)
})))

// 场景-实体关联
socket.on('scene:entity:linked', ({ sceneId, entityId }) => set(s => ({
  sceneEntityMap: { ...s.sceneEntityMap, [sceneId]: [...(s.sceneEntityMap[sceneId] || []), entityId] }
})))
socket.on('scene:entity:unlinked', ({ sceneId, entityId }) => set(s => ({
  sceneEntityMap: { ...s.sceneEntityMap, [sceneId]: (s.sceneEntityMap[sceneId] || []).filter(id => id !== entityId) }
})))

// 实体（⚠ 使用 Record 更新模式 — R4，只改变一个 key，不触发无关组件 re-render）
socket.on('entity:created', ({ entity }) => set(s => ({
  entities: { ...s.entities, [entity.id]: entity }
})))
socket.on('entity:updated', ({ id, changes }) => set(s => {
  const existing = s.entities[id]
  if (!existing) return s
  // deep merge ruleData 和 permissions（⚠ 已统一为 camelCase — A2）
  const merged = { ...existing }
  if (changes.ruleData) merged.ruleData = deepMerge(existing.ruleData || {}, changes.ruleData)
  if (changes.permissions) merged.permissions = deepMerge(existing.permissions, changes.permissions)
  for (const [k, v] of Object.entries(changes)) {
    if (k !== 'ruleData' && k !== 'permissions') (merged as any)[k] = v
  }
  return { entities: { ...s.entities, [id]: merged } }
}))
socket.on('entity:deleted', ({ id }) => set(s => {
  const { [id]: _, ...rest } = s.entities
  return { entities: rest }
}))

// 聊天
socket.on('chat:new', ({ message }) => set(s => ({
  chatMessages: [...s.chatMessages, message]
})))
socket.on('chat:retracted', ({ id }) => set(s => ({
  chatMessages: s.chatMessages.map(m => m.id === id ? { ...m, retracted: true } : m)
})))

// 战斗
socket.on('combat:activated', ({ combatState }) => set({ combatState }))
socket.on('combat:updated', ({ changes }) => set(s => ({
  combatState: s.combatState ? { ...s.combatState, ...changes } : null
})))
socket.on('combat:ended', () => set({ combatState: null }))
// ⚠ tokens 在 store 中已是 Record<string, MapToken>，无需 JSON.parse（R2）
socket.on('combat:token:added', ({ token }) => set(s => {
  if (!s.combatState) return s
  return { combatState: { ...s.combatState, tokens: { ...s.combatState.tokens, [token.id]: token } } }
}))
socket.on('combat:token:updated', ({ tokenId, changes }) => set(s => {
  if (!s.combatState) return s
  const existing = s.combatState.tokens[tokenId]
  if (!existing) return s
  return { combatState: { ...s.combatState, tokens: { ...s.combatState.tokens, [tokenId]: { ...existing, ...changes } } } }
}))
socket.on('combat:token:removed', ({ tokenId }) => set(s => {
  if (!s.combatState) return s
  const { [tokenId]: _, ...rest } = s.combatState.tokens
  return { combatState: { ...s.combatState, tokens: rest } }
}))

// 展示
socket.on('showcase:created', ({ item }) => set(s => ({ showcaseItems: [...s.showcaseItems, item] })))
socket.on('showcase:updated', ({ id, changes }) => set(s => ({
  showcaseItems: s.showcaseItems.map(i => i.id === id ? { ...i, ...changes } : i)
})))
socket.on('showcase:deleted', ({ id }) => set(s => ({
  showcaseItems: s.showcaseItems.filter(i => i.id !== id)
})))
socket.on('showcase:cleared', () => set({ showcaseItems: [], showcasePinnedItemId: null }))
socket.on('showcase:pinned', ({ id }) => set({ showcasePinnedItemId: id }))
socket.on('showcase:unpinned', () => set({ showcasePinnedItemId: null }))

// 房间状态
socket.on('room:state:updated', ({ changes }) => set(s => ({
  room: { ...s.room, ...changes }
})))

// 团队追踪器
socket.on('tracker:created', ({ tracker }) => set(s => ({
  teamTrackers: [...s.teamTrackers, tracker]
})))
socket.on('tracker:updated', ({ id, changes }) => set(s => ({
  teamTrackers: s.teamTrackers.map(t => t.id === id ? { ...t, ...changes } : t)
})))
socket.on('tracker:deleted', ({ id }) => set(s => ({
  teamTrackers: s.teamTrackers.filter(t => t.id !== id)
})))

// 素材
socket.on('asset:created', ({ asset }) => set(s => ({ assets: [...(s.assets || []), asset] })))
socket.on('asset:updated', ({ id, changes }) => set(s => ({
  assets: (s.assets || []).map(a => a.id === id ? { ...a, ...changes } : a)
})))
socket.on('asset:deleted', ({ id }) => set(s => ({
  assets: (s.assets || []).filter(a => a.id !== id)
})))
```

**[I9] `selectIsCombat` selector 和 `RoomState` 接口变更**

```typescript
// 新 RoomState 接口
export interface RoomState {
  activeSceneId: string | null
  activeEncounterId: string | null  // 新增
}

// 新 selectIsCombat
export const selectIsCombat = (s: { room: RoomState }): boolean =>
  s.room.activeEncounterId != null
```

**[I10] `getSceneEntityIds` 的替代方案**

Store 新增 `sceneEntityMap: Record<string, string[]>` 字段，从 API 初始化时填充：

```typescript
// init 中加载：
const allScenes = await api.get<any[]>(`/api/rooms/${roomId}/scenes`)
const sceneEntityMap: Record<string, string[]> = {}
for (const scene of allScenes) {
  // 服务端 GET /scenes 应在响应中包含 entityIds 字段
  // 或单独请求：const ids = await api.get(`/api/rooms/${roomId}/entities?scene_id=${scene.id}`)
  sceneEntityMap[scene.id] = scene.entityIds || []
}
set({ sceneEntityMap })
```

WS 事件 `scene:entity:linked` / `unlinked` 更新此 map。

**[I11] `useEffect` 异步初始化的清理函数竞态**

Task 14 Step 1 修正为：

```typescript
useEffect(() => {
  if (!socket) return
  let cancelled = false
  let cleanups: (() => void)[] = []

  ;(async () => {
    const [cw, ci] = await Promise.all([
      useWorldStore.getState().init(roomId, socket),
      useIdentityStore.getState().init(roomId, socket),
    ])
    if (cancelled) { cw(); ci(); return }
    cleanups = [cw, ci]
    setIsLoading(false)
  })()

  return () => {
    cancelled = true
    cleanups.forEach(fn => fn())
  }
}, [socket, roomId])
```

**[I12] 乐观更新回滚改为快照恢复（延迟实施）**

**⚠ 初期不实施乐观更新（见 Task 12 设计决策 A3/A4）。** 以下模式作为后期优化参考，当特定操作的 ~50-100ms 延迟影响体验时选择性启用：

```typescript
// 后期优化示例：updateEntity（带乐观更新 + 快照回滚）
updateEntity: async (id, updates) => {
  const snapshot = { ...get().entities }  // ⚠ 使用 Record 快照
  // 乐观更新
  const existing = get().entities[id]
  if (existing) set(s => ({ entities: { ...s.entities, [id]: { ...existing, ...updates } } }))
  try {
    await api.patch(`/api/rooms/${get()._roomId}/entities/${id}`, updates)
    // ⚠ 此时 WS 事件也会到达，需要去重：
    // 如果 WS 事件的数据与乐观更新一致，不产生额外 re-render（zustand 浅比较）
  } catch {
    set({ entities: snapshot }) // 回滚到快照
  }
}
```

### A.4 Phase 5 修正

**[I13] 迁移脚本缺少 blueprint 和 handout_assets 的 assets 表迁移**

在 Task 19 迁移脚本中添加：

```typescript
// 迁移 blueprints → assets (type='blueprint')
const yBlueprints = yDoc.getMap('blueprints')
yBlueprints.forEach((bp: any, bpId: string) => {
  if (!bp || typeof bp !== 'object') return
  db.prepare('INSERT OR IGNORE INTO assets (id, url, name, type, created_at, extra) VALUES (?, ?, ?, ?, ?, ?)')
    .run(bpId, bp.imageUrl || '', bp.name || '', 'blueprint', Date.now(),
      JSON.stringify({ defaultSize: bp.defaultSize, defaultColor: bp.defaultColor, defaultRuleData: bp.defaultRuleData }))
})

// 迁移 handout_assets → assets (type='handout')
const yHandouts = yDoc.getMap('handout_assets')
yHandouts.forEach((h: any, hId: string) => {
  if (!h || typeof h !== 'object') return
  db.prepare('INSERT OR IGNORE INTO assets (id, url, name, type, created_at, extra) VALUES (?, ?, ?, ?, ?, ?)')
    .run(hId, h.imageUrl || '', h.title || '', 'handout', h.createdAt || Date.now(),
      JSON.stringify({ title: h.title, description: h.description }))
})
```

**[I14] 清理步骤遗漏**

Task 20 额外操作：
- `rm -rf src/yjs/` — 删除整个目录
- `npm uninstall y-protocols` — Awareness 类型的传递依赖
- 删除 `src/__test-utils__/yjs-helpers.ts` — Yjs 测试工具

**[I15] `useSocket` 的 `seatId` 依赖导致重连**

修正：初始连接时不传 seatId，claim 后通过 `socket.emit('auth:update', { seatId })` 通知服务端，避免因 seatId 变化导致 Socket 重建。

```typescript
// useSocket.ts — dependency 只有 roomId
useEffect(() => {
  const s = io(API_BASE || window.location.origin, {
    query: { roomId },
  })
  // ...
}, [roomId]) // 不再依赖 seatId
```

**[I16] `api.ts` 需处理空响应体**

```typescript
if (res.status === 204 || res.headers.get('content-length') === '0') {
  return undefined as T
}
return res.json()
```

---

_本计划基于 [43-数据层重构：实现架构设计](../../design-discussion/43-数据层重构：实现架构设计.md)。替代旧计划 `2026-03-13-data-layer-refactor.md`（基于 doc 41 的 LevelDB 方案）。_
