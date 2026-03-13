# 数据层重构实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Yjs 回归实时协同本职，素材元数据迁移到 classic-level，按房间物理隔离数据，精简 Scene 结构，引入 Encounter 战斗预设系统和顶层 combat 运行时。

**Architecture:** 服务端改为按房间隔离的双 LevelDB（y-leveldb + classic-level）+ 按房间隔离的文件上传。客户端 worldStore 同时消费 Yjs 和 REST API 两个数据源。Y.Doc 从 9 个顶层 key 精简到 7 个，Scene 从 22 个字段精简为 5 个（name, sortOrder, atmosphere, entityIds, encounters），战斗运行时提升为顶层 combat 单例。

**Tech Stack:** Node.js + Express 5 + y-leveldb + classic-level (新增) | React 19 + zustand + Yjs v13 + react-konva

**Spec:** `docs/design-discussion/41-数据层重构方案设计.md`

---

## 依赖关系、优先级与并行化分析

### 依赖图

```
Task 1 (按房间隔离 LevelDB)
├── Task 2 (按房间文件上传)      ─┐
├── Task 3 (素材 CRUD API)       ├── 互相独立，可并行
└── Task 4 (延迟 GC)             ─┘

Task 5 (类型定义) ── 无服务端依赖，可与 Chunk 1 并行

Task 3 + Task 5
└── Task 6 (素材 API 客户端)
    └── Task 7 (素材 Store)

Task 5
└── Task 8 (worldStore 重构) ── 最大单体任务，关键路径
    ├── Task 9 (SceneViewer 适配)    ─┐
    ├── Task 10 (KonvaMap 适配)      ├── 互相独立，可并行
    └── Task 12 (ScenePanel 适配)    ─┘

Task 7 + Task 8
└── Task 11 (GmDock 适配素材 store)

Task 4 + Task 8
└── Task 14 (移除客户端 GC)

Tasks 9-12 + Task 14
└── Task 13 (初始化流程 + 清理)
    └── Task 15 (端到端验证)
```

### 关键路径

**Task 1 → Task 3 → Task 6 → Task 7 → Task 11** (服务端 → 素材 API → 素材 Store → UI 适配)

与之并行的第二条路径：**Task 5 → Task 8 → Task 9/10/12** (类型 → worldStore → 组件适配)

两条路径在 **Task 11**（GmDock）处汇合，因为 GmDock 同时依赖 assetStore（路径一）和 worldStore 的新 Scene 结构（路径二）。

### 修改范围分类

| Task | 范围             | 修改文件数 | 影响面                    |
| ---- | ---------------- | ---------- | ------------------------- |
| 1    | 仅服务端         | 2          | 存储拓扑                  |
| 2    | 仅服务端         | 1          | 上传 API                  |
| 3    | 仅服务端         | 1          | 新增 API                  |
| 4    | 仅服务端         | 1          | WebSocket + GC            |
| 5    | 仅客户端（类型） | 4-6        | 类型定义                  |
| 6    | 仅客户端         | 2          | 新增文件 + 修改上传       |
| 7    | 仅客户端         | 1          | 新增 store                |
| 8    | 仅客户端         | 3          | **核心重构**，~771 行文件 |
| 9    | 仅客户端         | 3          | 场景渲染                  |
| 10   | 仅客户端         | 2-3        | 战斗地图                  |
| 11   | 仅客户端         | 4-5        | Dock 面板                 |
| 12   | 仅客户端         | 2          | 场景配置                  |
| 13   | 仅客户端         | 5-8        | 清理 + 初始化             |
| 14   | 仅客户端         | 2          | 删除代码                  |
| 15   | 全栈             | 0          | 验证                      |

### 并行执行方案

**Phase 1（可完全并行）：**

- **Agent A**：Task 1 → Task 2 → Task 3 → Task 4（服务端全部，顺序执行）
- **Agent B**：Task 5（类型定义，无服务端依赖）

**Phase 2（Phase 1 完成后，部分并行）：**

- **Agent A**：Task 6 → Task 7（素材 API + Store，依赖 Task 3 + Task 5）
- **Agent B**：Task 8（worldStore 重构，仅依赖 Task 5）

**Phase 3（Phase 2 完成后，可完全并行）：**

- **Agent A**：Task 9（SceneViewer）
- **Agent B**：Task 10（KonvaMap）
- **Agent C**：Task 12（ScenePanel）
- **Agent D**：Task 11（GmDock，依赖 Task 7 + Task 8）

**Phase 4（Phase 3 完成后，顺序执行）：**

- Task 14 → Task 13 → Task 15

### 风险评估

| 风险                               | 影响                      | 缓解                                     |
| ---------------------------------- | ------------------------- | ---------------------------------------- |
| Task 8 体量大（worldStore 771 行） | 阻塞后续所有客户端 Task   | 可拆分为 Step 级别的子任务，每步独立提交 |
| Task 5 类型变更波及多文件          | 编译错误可能级联          | 先 re-export 保持兼容，最后统一清理      |
| Task 13 清理阶段发现遗漏           | 需要回头修改已提交的 Task | 每个 Task 提交前做 `npm run build` 验证  |

### 测试策略

#### 现有测试盘点（19 个文件，170+ 用例）

重构会直接影响以下测试文件：

| 测试文件                                   | 受影响原因                                                         | 处理方式                                       |
| ------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------- |
| `useScenes.test.ts` (单客户端)             | Scene 结构从 22 字段变为 5 字段（atmosphere 对象、无 grid/combat） | **重写**：适配新 addScene/updateScene API      |
| `useScenes.sync.test.ts` (多客户端)        | 同上 + gridSize 等字段不存在                                       | **重写**：测试 atmosphere 同步、encounter 同步 |
| `useSceneTokens.test.ts` (单客户端)        | Token 从 scene 子 Map 移到顶层 combat Y.Map                        | **重写**为 combat token 测试                   |
| `useSceneTokens.sync.test.ts` (多客户端)   | 同上                                                               | **重写**为 combat token 同步测试               |
| `entityLifecycle.test.ts`                  | GC 移至服务端，客户端不再调用 gcOrphanedEntities                   | **删除** GC 测试，保留 addEntityToAllScenes 等 |
| `entityLifecycle.sync.test.ts`             | GC 相关分布式测试不再适用                                          | **删除** GC 部分，保留 CRDT 冲突测试           |
| `useWorld.test.ts`                         | WorldMaps 接口变更（删 blueprints，加 combat/showcase）            | **更新**：适配新 createWorldMaps               |
| `useRoom.test.ts` / `useRoom.sync.test.ts` | RoomState 新增 activeEncounterId、teamMetrics                      | **更新**：新增字段测试                         |
| `useShowcase.test.ts`                      | key 从 `showcase_items` 改为 `showcase`                            | **微调**：更新 key 名                          |

**不受影响的测试**（无需修改）：

- `combatUtils.test.ts` — 纯函数，不涉及数据结构
- `characterUtils.test.ts` — 纯函数
- `diceUtils.test.ts` — 纯函数
- `entityAdapters.test.ts` — Entity 结构未变
- `panelUtils.test.ts` — 纯 UI 工具函数
- `permissions.test.ts` — 权限逻辑未变
- `useEntities.test.ts` / `useEntities.sync.test.ts` — Entity 结构本身未变
- `useIdentity.sync.test.ts` — seats 未变

#### 测试工具更新

`src/__test-utils__/` 需要同步更新：

| 文件             | 变更                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `fixtures.ts`    | `makeBlueprint()` → 删除（Blueprint 移至 REST API）；新增 `makeScene()`、`makeAtmosphere()`、`makeEncounter()` |
| `yjs-helpers.ts` | `addSceneToDoc()` → 重写，创建新结构（atmosphere + entityIds + encounters 子 Map）                             |

#### 覆盖盲区分析

以下是 TypeScript 编译器**捕获不了**的运行时风险——即使编译通过，这些地方仍可能静默失败：

| 盲区                                    | 风险等级 | 说明                                                                                                                                       | 是否需要新增测试                |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **worldStore readScene/writeScene**     | 🔴 极高  | 771 行文件无任何测试。Y.Map→Plain Object 转换是核心逻辑，atmosphere 嵌套读取如果字段映射错误，场景渲染静默失败（不报错，只是白屏或缺数据） | ✅ 必须新增                     |
| **uploadAsset URL 解析**                | 🔴 高    | 新版从 `window.location.hash` 解析 roomId。如果 URL 格式不匹配正则，`getCurrentRoomId()` 抛异常 → 所有上传功能失效                         | ✅ 必须新增                     |
| **activateEncounter 字段展开**          | 🔴 高    | Encounter JSON → combat Y.Map 的逐字段 set。如果漏写一个字段（如 grid.offsetX），战斗地图加载数据缺失但不报错                              | ✅ 在 combat.test.ts 中覆盖     |
| **selectIsCombat 逻辑变更**             | 🟡 中    | 从 `scene.combatActive` 改为 `room.activeEncounterId != null`。判断错误 = 战斗模式永远不触发或永远触发                                     | ✅ 在 selectors.test.ts 中覆盖  |
| **endCombat 清空完整性**                | 🟡 中    | `combat.forEach → delete` 后还需清空 `room.activeEncounterId`。遗漏 = 下次进房间误入战斗                                                   | ✅ 在 combat.test.ts 中覆盖     |
| **saveEncounter 快照完整性**            | 🟡 中    | `combat.toJSON()` 写回 scene.encounters。如果快照缺少必要字段，下次加载 encounter 崩溃                                                     | ✅ 在 combat.test.ts 中覆盖     |
| **addScene persistent entity 自动加入** | 🟡 中    | 新建场景时需遍历 persistent entity 写入 entityIds。如果逻辑错误，PC 不出现在新场景                                                         | ✅ 在 worldStore.test.ts 中覆盖 |
| **atmosphere 默认值**                   | 🟡 低    | readScene 中 atmosphere 为空时的 fallback 对象。字段缺失 = ParticleLayer/AmbientAudio 收到 undefined                                       | ✅ 在 worldStore.test.ts 中覆盖 |

**不需要新增测试的盲区**（TypeScript 编译器可以保护）：

- UI 组件中的 `scene.atmosphereImageUrl` → `scene.atmosphere.imageUrl` 等字段重命名 — 编译器直接报错
- Blueprint/Handout 从 worldStore 切换到 assetStore 的 import 变更 — 编译器报错
- `showcase_items` → `showcase` 键名变更 — 在 useShowcase.test.ts 中已覆盖

#### 新增测试（更新后）

| 新测试文件                                        | 覆盖内容                                                                                                                                                                                                            | 所属 Task |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `stores/__tests__/worldStore.test.ts`             | **readScene** 正确解析 atmosphere/entityIds/encounters；**addScene** 创建正确结构 + persistent entity 自动加入；**updateScene** atmosphere 部分更新；**deleteScene** 清理 activeSceneId；atmosphere 默认值 fallback | Task 8    |
| `stores/__tests__/worldStore.combat.test.ts`      | **activateEncounter** 全字段展开验证（mapUrl/grid/tokens 逐字段断言）；**endCombat** 清空 combat + room.activeEncounterId；**saveEncounter** 快照完整性（round-trip：save → activate → 数据一致）                   | Task 8    |
| `stores/__tests__/worldStore.combat.sync.test.ts` | 两客户端同时拖 token → 各自位置写入 combat.tokens；activateEncounter 跨客户端同步                                                                                                                                   | Task 8    |
| `stores/__tests__/selectors.test.ts`              | selectIsCombat、selectCombatState、selectActiveScene 等 selector 的逻辑正确性                                                                                                                                       | Task 8    |
| `shared/__tests__/assetUpload.test.ts`            | getCurrentRoomId 解析：正常 hash、无 hash、格式错误 hash；uploadAsset mock fetch 验证 URL 拼接                                                                                                                      | Task 6    |
| `shared/__tests__/assetApi.test.ts`               | fetchAssets/createAsset/updateAsset/deleteAsset（mock fetch，验证请求 URL + 参数）                                                                                                                                  | Task 6    |
| `stores/__tests__/assetStore.test.ts`             | init/upload/update/remove 操作（mock assetApi）                                                                                                                                                                     | Task 7    |

#### 每个 Task 的测试检查点

**原则**：每个 Task 提交前必须保证 `npm test` 全部通过。如果某个 Task 的代码变更导致已有测试失败，**必须在同一个 Task 内修复测试**，不能留到后面。

| Task | 测试要求                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-4  | 服务端变更，不影响客户端测试。`npm test` 应全部通过（无变化）                                                                                                                                                                                                                                                                                                                     |
| 5    | 类型定义变更可能导致测试中的类型导入报错。更新 `fixtures.ts`（删 makeBlueprint，加 makeScene/makeAtmosphere/makeEncounter fixture）。运行 `npm test` 确认                                                                                                                                                                                                                         |
| 6    | 新增 `assetApi.test.ts` + `assetUpload.test.ts`（mock fetch 测试 CRUD + URL 解析）                                                                                                                                                                                                                                                                                                |
| 7    | 新增 `assetStore.test.ts`（mock assetApi 测试 store 行为）                                                                                                                                                                                                                                                                                                                        |
| 8    | **最关键**：新增 `worldStore.test.ts`（readScene/addScene/updateScene）+ `worldStore.combat.test.ts`（encounter 激活/结束/保存）+ `worldStore.combat.sync.test.ts`（combat 多客户端同步）+ `selectors.test.ts`。重写 `useScenes.test.ts`、`useSceneTokens.test.ts`。更新 `yjs-helpers.ts` 的 `addSceneToDoc`、`useWorld.test.ts`、`useRoom.test.ts`。运行 `npm test` 确认全部通过 |
| 9-12 | UI 组件适配，无组件级测试。`npm test` + `npm run build` 确认不破坏现有测试                                                                                                                                                                                                                                                                                                        |
| 13   | 删除旧 hook 后，相关测试文件也删除。全局搜索确认无 import 断裂                                                                                                                                                                                                                                                                                                                    |
| 14   | 删除客户端 GC → 删除 `entityLifecycle.test.ts` 中的 GC 用例                                                                                                                                                                                                                                                                                                                       |
| 15   | `npm test` + `npm run build` + 手动 e2e 验证                                                                                                                                                                                                                                                                                                                                      |

#### 回归保护总结

```
编译检查：每个 Task 提交前 → npm run build（TypeScript strict 捕获字段重命名）
单元测试：每个 Task 提交前 → npm test（全部通过）
核心桥接层：worldStore.test.ts 覆盖 Y.Map↔Plain Object 转换（之前为 0 覆盖）
战斗流程：worldStore.combat.test.ts 验证 encounter 激活/结束/保存的数据完整性
URL 解析：assetUpload.test.ts 覆盖 roomId 提取的边界情况
CRDT 安全：useEntities.sync.test.ts 和 entityLifecycle.sync.test.ts 中的
           并发冲突测试（不受影响）保护 Entity 系统的 CRDT 正确性
手动 e2e：Task 15 覆盖完整用户流程
```

---

## Chunk 1: 服务端基础设施

### Task 1: 安装 classic-level + 按房间隔离 LevelDB

**Files:**

- Modify: `server/index.mjs`
- Modify: `package.json`

- [ ] **Step 1: 安装 classic-level**

```bash
npm install classic-level
```

- [ ] **Step 2: 重构服务端存储拓扑**

将 `server/index.mjs` 从单一全局 LevelDB 改为按房间隔离的双 LevelDB。

**改动要点**：

1. 删除旧的全局 `const ldb = new LeveldbPersistence(PERSISTENCE_DIR)`
2. 新增 `DATA_DIR` 常量（默认 `./data`）
3. 新增 `roomYjsDbs` Map + `getRoomYjsDb(roomId)` 函数
4. 新增 `roomAssetDbs` Map + `getRoomAssetDb(roomId)` 函数
5. 修改 `setPersistence` 的 `bindState` 使用 `getRoomYjsDb(docName)`
6. 删除旧的 `roster → entities` 迁移代码（项目未上线，无需兼容）
7. 修改 `ROOMS_FILE` 路径到 `DATA_DIR/rooms.json`
8. 在 CORS 中间件中添加 `PATCH` 方法：`res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')`

```javascript
// server/index.mjs 关键改动

import { ClassicLevel } from 'classic-level' // ESM-only 包，必须用 import 而非 require

const DATA_DIR = process.env.DATA_DIR || './data'
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json')

// 按房间隔离的双 LevelDB
const roomYjsDbs = new Map()
const roomAssetDbs = new Map()

function getRoomYjsDb(roomId) {
  if (!roomYjsDbs.has(roomId)) {
    const dbPath = path.join(DATA_DIR, 'rooms', roomId, 'db', 'yjs')
    fs.mkdirSync(dbPath, { recursive: true })
    roomYjsDbs.set(roomId, new LeveldbPersistence(dbPath))
  }
  return roomYjsDbs.get(roomId)
}

// 使用 pending promise 模式防止并发请求创建重复 ClassicLevel 实例（LEVEL_LOCKED）
const pendingAssetDbs = new Map()

function getRoomAssetDb(roomId) {
  if (roomAssetDbs.has(roomId)) return roomAssetDbs.get(roomId)
  if (pendingAssetDbs.has(roomId)) return pendingAssetDbs.get(roomId)

  const dbPath = path.join(DATA_DIR, 'rooms', roomId, 'db', 'assets')
  fs.mkdirSync(dbPath, { recursive: true })
  const db = new ClassicLevel(dbPath, { valueEncoding: 'json' })
  const ready = db.open().then(() => {
    roomAssetDbs.set(roomId, db)
    pendingAssetDbs.delete(roomId)
    return db
  })
  pendingAssetDbs.set(roomId, ready)
  return ready
}

setPersistence({
  bindState: async (docName, ydoc) => {
    const db = getRoomYjsDb(docName)
    const persistedYdoc = await db.getYDoc(docName)
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc))
    ydoc.on('update', (update) => db.storeUpdate(docName, update))
  },
  writeState: async () => {},
})
```

- [ ] **Step 3: 验证服务端启动正常**

```bash
cd server && node index.mjs
```

预期：服务器正常启动，打印端口信息。创建房间后 `data/rooms/{roomId}/db/yjs/` 目录应被创建。

- [ ] **Step 4: 提交**

```bash
git add server/index.mjs package.json package-lock.json
git commit -m "refactor: per-room isolated LevelDB (yjs + classic-level)"
```

---

### Task 2: 按房间隔离的文件上传

**Files:**

- Modify: `server/index.mjs`

- [ ] **Step 1: 修改上传 API 为房间级**

将 `POST /api/upload` 改为 `POST /api/rooms/:roomId/upload`，文件存储到 `data/rooms/{roomId}/uploads/`。

```javascript
// 动态 multer destination
function getRoomUploadMiddleware(roomId) {
  const uploadsDir = path.join(DATA_DIR, 'rooms', roomId, 'uploads')
  fs.mkdirSync(uploadsDir, { recursive: true })
  const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.bin'
      cb(null, `${crypto.randomUUID()}${ext}`)
    },
  })
  return multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } })
}

app.post('/api/rooms/:roomId/upload', (req, res, next) => {
  const upload = getRoomUploadMiddleware(req.params.roomId)
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: 'No file found' })
    console.log(
      `Uploaded: ${req.file.filename} (${req.file.size} bytes) to room ${req.params.roomId}`,
    )
    res.json({ url: `/api/rooms/${req.params.roomId}/uploads/${req.file.filename}` })
    next()
  })
})
```

- [ ] **Step 2: 修改静态文件服务为房间级**

将 `GET /uploads/:file` 改为 `GET /api/rooms/:roomId/uploads/:filename`。

```javascript
app.get('/api/rooms/:roomId/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename)
  const filePath = path.resolve(DATA_DIR, 'rooms', req.params.roomId, 'uploads', filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
  res.sendFile(filePath, { maxAge: '1y', immutable: true })
})
```

- [ ] **Step 3: 修改文件删除 API 为房间级**

将 `DELETE /api/uploads/:filename` 改为 `DELETE /api/rooms/:roomId/uploads/:filename`。

```javascript
app.delete('/api/rooms/:roomId/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename)
  const filePath = path.join(DATA_DIR, 'rooms', req.params.roomId, 'uploads', filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
  fs.unlinkSync(filePath)
  console.log(`Deleted: ${filename} from room ${req.params.roomId}`)
  res.json({ ok: true })
})
```

- [ ] **Step 4: 删除旧的全局上传/静态文件路由和旧的全局 UPLOADS_DIR 相关代码**

删除：

- `const UPLOADS_DIR = ...`
- `if (!fs.existsSync(UPLOADS_DIR)) ...`
- `app.use('/uploads', express.static(UPLOADS_DIR, ...))`
- `app.post('/api/upload', ...)`
- `app.delete('/api/uploads/:filename', ...)`
- 旧的 `storage` 和 `upload` multer 配置
- `/admin` 页面（引用旧的 UPLOADS_DIR，后续重建）

- [ ] **Step 5: 修改房间删除 API**

```javascript
app.delete('/api/rooms/:id', async (req, res) => {
  const roomId = req.params.id
  const rooms = readRooms()
  const idx = rooms.findIndex((r) => r.id === roomId)
  if (idx === -1) return res.status(404).json({ error: 'Room not found' })
  rooms.splice(idx, 1)
  writeRooms(rooms)

  // 关闭该房间的所有活跃 WebSocket 连接（防止写入已销毁的 LevelDB）
  const conns = roomConnections.get(roomId)
  if (conns) {
    for (const conn of conns) conn.close(4410, 'Room deleted')
    roomConnections.delete(roomId)
  }

  // 关闭两个 LevelDB 连接
  const yjsDb = roomYjsDbs.get(roomId)
  if (yjsDb) {
    await yjsDb.destroy()
    roomYjsDbs.delete(roomId)
  }
  const assetDb = roomAssetDbs.get(roomId)
  if (assetDb) {
    await assetDb.close()
    roomAssetDbs.delete(roomId)
  }

  // 删除整个房间目录
  const roomDir = path.join(DATA_DIR, 'rooms', roomId)
  if (fs.existsSync(roomDir)) fs.rmSync(roomDir, { recursive: true, force: true })

  console.log(`Room deleted: ${roomId}`)
  res.json({ ok: true })
})
```

- [ ] **Step 6: 验证上传功能**

用 curl 测试：

```bash
# 创建房间
curl -X POST http://localhost:4444/api/rooms -H 'Content-Type: application/json' -d '{"name":"test"}'
# 用返回的 roomId 上传文件
curl -X POST http://localhost:4444/api/rooms/{roomId}/upload -F 'file=@test.jpg'
# 验证文件可访问
curl http://localhost:4444/api/rooms/{roomId}/uploads/{filename}
```

- [ ] **Step 7: 提交**

```bash
git add server/index.mjs
git commit -m "refactor: per-room file uploads and static serving"
```

---

### Task 3: 素材元数据 CRUD API

**Files:**

- Modify: `server/index.mjs`

- [ ] **Step 1: 添加素材 CRUD 路由**

```javascript
// GET /api/rooms/:roomId/assets — 列出素材
app.get('/api/rooms/:roomId/assets', async (req, res) => {
  const db = await getRoomAssetDb(req.params.roomId)
  const assets = []
  for await (const value of db.values()) {
    assets.push(value)
  }
  const tag = req.query.tag
  res.json(tag ? assets.filter((a) => a.tags?.includes(tag)) : assets)
})

// GET /api/rooms/:roomId/assets/:id — 获取单个
app.get('/api/rooms/:roomId/assets/:id', async (req, res) => {
  try {
    const db = await getRoomAssetDb(req.params.roomId)
    const asset = await db.get(req.params.id)
    res.json(asset)
  } catch (e) {
    if (e.code === 'LEVEL_NOT_FOUND') return res.status(404).json({ error: 'Asset not found' })
    throw e
  }
})

// POST /api/rooms/:roomId/assets — 创建素材（配合上传）
app.post('/api/rooms/:roomId/assets', (req, res, next) => {
  const upload = getRoomUploadMiddleware(req.params.roomId)
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: 'No file found' })

    const db = await getRoomAssetDb(req.params.roomId)
    const id = crypto.randomUUID().slice(0, 8)
    const url = `/api/rooms/${req.params.roomId}/uploads/${req.file.filename}`

    const asset = {
      id,
      url,
      name: req.body.name || req.file.originalname,
      type: req.body.type || 'image',
      tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      width: req.body.width ? parseInt(req.body.width) : undefined,
      height: req.body.height ? parseInt(req.body.height) : undefined,
      createdAt: Date.now(),
    }

    // 类型特有数据
    if (req.body.blueprint) asset.blueprint = JSON.parse(req.body.blueprint)
    if (req.body.handout) asset.handout = JSON.parse(req.body.handout)

    await db.put(id, asset)
    console.log(`Asset created: ${id} "${asset.name}" (${asset.type}) in room ${req.params.roomId}`)
    res.status(201).json(asset)
  })
})

// PATCH /api/rooms/:roomId/assets/:id — 更新元数据
app.patch('/api/rooms/:roomId/assets/:id', async (req, res) => {
  try {
    const db = await getRoomAssetDb(req.params.roomId)
    const existing = await db.get(req.params.id)
    const updated = { ...existing, ...req.body }
    await db.put(req.params.id, updated)
    res.json(updated)
  } catch (e) {
    if (e.code === 'LEVEL_NOT_FOUND') return res.status(404).json({ error: 'Asset not found' })
    throw e
  }
})

// DELETE /api/rooms/:roomId/assets/:id — 删除素材
app.delete('/api/rooms/:roomId/assets/:id', async (req, res) => {
  try {
    const db = await getRoomAssetDb(req.params.roomId)
    const asset = await db.get(req.params.id)
    // 删除文件
    const filePath = path.join(
      DATA_DIR,
      'rooms',
      req.params.roomId,
      'uploads',
      path.basename(asset.url),
    )
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    // 删除元数据
    await db.del(req.params.id)
    console.log(`Asset deleted: ${req.params.id} from room ${req.params.roomId}`)
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'LEVEL_NOT_FOUND') return res.status(404).json({ error: 'Asset not found' })
    throw e
  }
})
```

- [ ] **Step 2: 用 curl 验证 CRUD 全流程**

```bash
# 上传素材
curl -X POST http://localhost:4444/api/rooms/{roomId}/assets \
  -F 'file=@test.jpg' -F 'name=酒馆外景' -F 'type=image' -F 'tags=["地图","酒馆"]'

# 列出素材
curl http://localhost:4444/api/rooms/{roomId}/assets

# 按 tag 过滤
curl 'http://localhost:4444/api/rooms/{roomId}/assets?tag=地图'

# 更新元数据
curl -X PATCH http://localhost:4444/api/rooms/{roomId}/assets/{assetId} \
  -H 'Content-Type: application/json' -d '{"name":"酒馆外景(夜)"}'

# 删除
curl -X DELETE http://localhost:4444/api/rooms/{roomId}/assets/{assetId}
```

- [ ] **Step 3: 提交**

```bash
git add server/index.mjs
git commit -m "feat: asset metadata CRUD API with classic-level"
```

---

### Task 4: 延迟 GC（服务端）

**Files:**

- Modify: `server/index.mjs`

- [ ] **Step 1: 添加房间连接计数和 GC**

在 WebSocket connection handler 中添加 per-room 连接计数和延迟 GC：

```javascript
const roomConnections = new Map() // roomId → Set<ws>

wss.on('connection', (conn, req) => {
  const roomId = req.url?.slice(1)?.split('?')[0]
  if (!roomId) {
    conn.close(4400, 'No room specified')
    return
  }

  const rooms = readRooms()
  if (!rooms.some((r) => r.id === roomId)) {
    console.warn(`Rejected connection to unknown room: ${roomId}`)
    conn.close(4404, 'Room not found')
    return
  }

  // 追踪连接
  if (!roomConnections.has(roomId)) roomConnections.set(roomId, new Set())
  roomConnections.get(roomId).add(conn)

  setupWSConnection(conn, req)

  conn.on('close', () => {
    const conns = roomConnections.get(roomId)
    if (conns) {
      conns.delete(conn)
      if (conns.size === 0) {
        roomConnections.delete(roomId)
        // 延迟 GC
        setTimeout(async () => {
          if (!roomConnections.has(roomId) || roomConnections.get(roomId).size === 0) {
            await performGC(roomId)
          }
        }, 5000)
      }
    }
  })
})

async function performGC(roomId) {
  try {
    const db = getRoomYjsDb(roomId)
    const ydoc = await db.getYDoc(roomId)
    const entities = ydoc.getMap('entities')
    const scenes = ydoc.getMap('scenes')

    // 收集所有场景引用的 entityIds
    const referencedIds = new Set()
    scenes.forEach((sceneMap) => {
      const entityIds = sceneMap.get('entityIds')
      if (entityIds) entityIds.forEach((_, id) => referencedIds.add(id))
    })

    // 删除孤儿非持久 entity
    const orphans = []
    entities.forEach((entityMap, id) => {
      if (!entityMap.get('persistent') && !referencedIds.has(id)) {
        orphans.push(id)
      }
    })

    // 清理断裂的 encounter token 引用
    let tokensCleaned = false
    scenes.forEach((sceneMap) => {
      const encounters = sceneMap.get('encounters')
      if (!encounters) return
      encounters.forEach((enc, encId) => {
        const tokens = enc.tokens
        if (!tokens) return
        let changed = false
        for (const [tid, t] of Object.entries(tokens)) {
          if (t.entityId && !entities.has(t.entityId)) {
            delete tokens[tid].entityId
            changed = true
          }
        }
        if (changed) {
          encounters.set(encId, enc)
          tokensCleaned = true
        }
      })
    })

    if (orphans.length === 0 && !tokensCleaned) {
      ydoc.destroy()
      return
    }

    // 安全持久化策略：只追加增量 update，不做 compaction
    //
    // 为什么不用 clearDocument + storeUpdate（compaction）：
    // - y-leveldb 不暴露底层 LevelDB batch API，无法原子化
    // - clearDocument 按 key 前缀批量删除，会连带删掉刚写入的 update
    // - 两步之间 crash = Y.Doc 数据永久丢失
    //
    // 增量追加方案：
    // - 先注册 update 监听器，再在 transact 中做变更
    // - 变更产生的 delta update 通过监听器自动持久化
    // - 如果 crash，最坏情况是部分变更未写入，下次 GC 重新处理
    // - update 历史会逐渐增长，但 Y.Doc 加载时自动合并，性能影响极小
    ydoc.on('update', (update) => {
      db.storeUpdate(roomId, update)
    })

    ydoc.transact(() => {
      orphans.forEach((id) => entities.delete(id))
      // encounter token 清理已在上面完成（通过 encounters.set 写入 Y.Map）
    })

    console.log(
      `[GC] Room ${roomId}: cleaned ${orphans.length} orphaned entities, tokensCleaned=${tokensCleaned}`,
    )
    ydoc.destroy()
  } catch (e) {
    console.warn(`[GC] Room ${roomId} failed:`, e.message)
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add server/index.mjs
git commit -m "feat: delayed entity GC on room empty"
```

---

## Chunk 2: 客户端类型与素材层

### Task 5: 更新共享类型定义 + 统一 Scene 导入源

**Files:**

- Create: `src/shared/assetTypes.ts`
- Modify: `src/shared/entityTypes.ts`
- Modify: `src/stores/worldStore.ts` (删除重复的 Scene 接口)
- Modify: `src/yjs/useScenes.ts` (删除重复的 Scene 接口，改为 re-export)
- Modify: 所有导入 `Scene` 的组件文件

**背景**：当前 `Scene` 接口在 `src/yjs/useScenes.ts` 和 `src/stores/worldStore.ts` 中各有一份定义。多个组件从 `useScenes` 导入 `Scene`。本 task 统一为从 `src/shared/entityTypes.ts` 导出，避免后续 task 出现类型不一致。

- [ ] **Step 1: 创建 AssetMeta 类型**

```typescript
// src/shared/assetTypes.ts
export interface AssetMeta {
  id: string
  url: string
  name: string
  type: 'image' | 'blueprint' | 'handout'
  tags: string[]
  width?: number
  height?: number
  createdAt: number
  blueprint?: {
    defaultSize: number
    defaultColor: string
    defaultRuleData?: unknown
  }
  handout?: {
    title: string
    description: string
  }
}
```

- [ ] **Step 2: 在 entityTypes.ts 中新增 Atmosphere/EncounterData/CombatState 类型（不替换旧 Scene）**

**重要**：本 Step 只新增类型，**不修改现有 Scene 接口**。Scene 接口替换延迟到 Task 8（worldStore 重构），因为在 Task 8 适配 readScene/writeScene 之前，替换 Scene 会导致所有消费方编译失败。

```typescript
// 追加到 src/shared/entityTypes.ts

export interface Atmosphere {
  imageUrl: string
  width: number
  height: number
  particlePreset: 'none' | 'embers' | 'snow' | 'dust' | 'rain' | 'fireflies'
  ambientPreset: string
  ambientAudioUrl: string
  ambientAudioVolume: number
}

export interface EncounterData {
  name: string
  mapUrl: string
  mapWidth: number
  mapHeight: number
  grid: {
    size: number
    snap: boolean
    visible: boolean
    color: string
    offsetX: number
    offsetY: number
  }
  tokens: Record<
    string,
    {
      name: string
      imageUrl: string
      color: string
      size: number
      x: number
      y: number
      entityId?: string
      ruleData?: unknown
      blueprintId?: string
    }
  >
}

// 新版 Scene 接口（Task 8 中替换旧 Scene）
export interface SceneV2 {
  id: string
  name: string
  sortOrder: number
  atmosphere: Atmosphere
  entityIds: string[]
  encounters: Record<string, EncounterData>
}

export interface CombatState {
  mapUrl: string
  mapWidth: number
  mapHeight: number
  grid: {
    size: number
    snap: boolean
    visible: boolean
    color: string
    offsetX: number
    offsetY: number
  }
  tokens: MapToken[]
  initiativeOrder: string[]
  initiativeIndex: number
}
```

删除旧的 `Blueprint` 接口（现在在 `AssetMeta` 中），保留 `Entity.blueprintId` 字段。

**注意**：旧 Scene 接口保持不动，新版命名为 `SceneV2`。在 Task 8 中，当 readScene/writeScene 和所有消费方都适配完成后，再将 `SceneV2` 重命名为 `Scene` 并删除旧接口。

- [ ] **Step 3: 验证构建通过**

新类型只是新增，不改变现有代码，构建应无影响：

```bash
npm run build && npm test
```

- [ ] **Step 4: 提交**

```bash
git add src/shared/assetTypes.ts src/shared/entityTypes.ts src/yjs/useScenes.ts src/stores/worldStore.ts
git commit -m "refactor: unify Scene/Combat/Asset type definitions in entityTypes.ts"
```

---

### Task 6: 客户端素材 API 层

**Files:**

- Create: `src/shared/assetApi.ts`（新文件，素材 REST API 客户端）
- Modify: `src/shared/assetUpload.ts`（更新 `uploadAsset` 指向新的房间级 API，保持旧签名兼容）

**注意**：`uploadAsset(file: File): Promise<string>` 被 8+ 个组件直接调用。为了保证每个 task 独立可构建，本 task **保留旧的 `uploadAsset` 函数签名**，仅修改其内部实现指向新 API。新的素材管理函数放在独立的 `assetApi.ts` 中。

- [ ] **Step 1: 创建 assetApi.ts（素材 REST API 客户端）**

```typescript
// src/shared/assetApi.ts
import { API_BASE } from './config'
import type { AssetMeta } from './assetTypes'

export async function fetchAssets(roomId: string, tag?: string): Promise<AssetMeta[]> {
  const url = `${API_BASE}/api/rooms/${roomId}/assets${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetchAssets failed: ${res.status}`)
  return res.json()
}

export async function createAsset(
  roomId: string,
  file: File,
  meta: {
    name?: string
    type?: 'image' | 'blueprint' | 'handout'
    tags?: string[]
    blueprint?: object
    handout?: object
  },
): Promise<AssetMeta> {
  const fd = new FormData()
  fd.append('file', file)
  if (meta.name) fd.append('name', meta.name)
  if (meta.type) fd.append('type', meta.type)
  if (meta.tags) fd.append('tags', JSON.stringify(meta.tags))
  if (meta.blueprint) fd.append('blueprint', JSON.stringify(meta.blueprint))
  if (meta.handout) fd.append('handout', JSON.stringify(meta.handout))

  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/assets`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`createAsset failed: ${res.status}`)
  return res.json()
}

export async function updateAsset(
  roomId: string,
  assetId: string,
  updates: Partial<AssetMeta>,
): Promise<AssetMeta> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/assets/${assetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`updateAsset failed: ${res.status}`)
  return res.json()
}

export async function deleteAsset(roomId: string, assetId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/assets/${assetId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteAsset failed: ${res.status}`)
}
```

- [ ] **Step 2: 更新 assetUpload.ts**

保留 `uploadAsset(file): Promise<string>` 签名不变，但内部改为调用新的房间级 API。需要从某处获取当前 roomId——从 URL hash 或全局 store 获取：

```typescript
// src/shared/assetUpload.ts
import { API_BASE } from './config'

// 获取当前房间 ID（从 URL hash 解析，格式为 #room=abc123）
function getCurrentRoomId(): string {
  const hash = window.location.hash
  const match = hash.match(/^#room=([a-zA-Z0-9_-]+)/)
  if (!match) throw new Error('No room context')
  return match[1]
}

// 保持旧签名兼容——所有现有调用方无需修改
export async function uploadAsset(file: File): Promise<string> {
  const roomId = getCurrentRoomId()
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  const data = await res.json()
  return data.url // 返回 URL 字符串，与旧行为一致
}

// getMediaDimensions 和 isVideoUrl 保持不变
```

这样 `CharacterEditPanel`、`HamburgerMenu`、`SceneConfigPanel` 等 8+ 个调用 `uploadAsset(file)` 的组件无需修改。

- [ ] **Step 3: 提交**

```bash
git add src/shared/assetApi.ts src/shared/assetUpload.ts
git commit -m "feat: asset API client + backward-compatible uploadAsset"
```

---

### Task 7: 素材 Store

**Files:**

- Create: `src/stores/assetStore.ts`

- [ ] **Step 1: 创建独立的素材 store**

素材数据来自 REST API，不属于 Yjs，所以用独立 store 管理：

```typescript
// src/stores/assetStore.ts
import { create } from 'zustand'
import type { AssetMeta } from '../shared/assetTypes'
import { fetchAssets, createAsset, updateAsset, deleteAsset } from '../shared/assetApi'

interface AssetStore {
  assets: AssetMeta[]
  loading: boolean
  roomId: string | null

  init: (roomId: string) => Promise<void>
  refresh: () => Promise<void>
  upload: (file: File, meta: Parameters<typeof createAsset>[2]) => Promise<AssetMeta>
  update: (assetId: string, updates: Partial<AssetMeta>) => Promise<void>
  remove: (assetId: string) => Promise<void>

  // 便捷 getter
  imageAssets: () => AssetMeta[]
  blueprintAssets: () => AssetMeta[]
  handoutAssets: () => AssetMeta[]
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  assets: [],
  loading: false,
  roomId: null,

  init: async (roomId) => {
    set({ roomId, loading: true })
    const assets = await fetchAssets(roomId)
    set({ assets, loading: false })
  },

  refresh: async () => {
    const { roomId } = get()
    if (!roomId) return
    const assets = await fetchAssets(roomId)
    set({ assets })
  },

  upload: async (file, meta) => {
    const { roomId } = get()
    if (!roomId) throw new Error('No room')
    const asset = await createAsset(roomId, file, meta)
    set((s) => ({ assets: [...s.assets, asset] }))
    return asset
  },

  update: async (assetId, updates) => {
    const { roomId } = get()
    if (!roomId) throw new Error('No room')
    const updated = await updateAsset(roomId, assetId, updates)
    set((s) => ({ assets: s.assets.map((a) => (a.id === assetId ? updated : a)) }))
  },

  remove: async (assetId) => {
    const { roomId } = get()
    if (!roomId) throw new Error('No room')
    await deleteAsset(roomId, assetId)
    set((s) => ({ assets: s.assets.filter((a) => a.id !== assetId) }))
  },

  imageAssets: () => get().assets.filter((a) => a.type === 'image'),
  blueprintAssets: () => get().assets.filter((a) => a.type === 'blueprint'),
  handoutAssets: () => get().assets.filter((a) => a.type === 'handout'),
}))
```

- [ ] **Step 2: 提交**

```bash
git add src/stores/assetStore.ts
git commit -m "feat: asset store for REST API-backed assets"
```

---

## Chunk 3: Y.Doc 结构重设计 + worldStore 重构

### Task 8: 更新 createWorldMaps 和 worldStore 初始化

**Files:**

- Modify: `src/yjs/useWorld.ts`
- Modify: `src/stores/worldStore.ts`

- [ ] **Step 1: 更新 WorldMaps 接口**

```typescript
// src/yjs/useWorld.ts
export interface WorldMaps {
  scenes: Y.Map<Y.Map<unknown>>
  entities: Y.Map<Y.Map<unknown>>
  combat: Y.Map<unknown> // 新增
  showcase: Y.Map<unknown> // 从 showcase_items 重命名
  seats: Y.Map<unknown>
  room: Y.Map<unknown>
}

export function createWorldMaps(yDoc: Y.Doc): WorldMaps {
  return {
    scenes: yDoc.getMap('scenes') as Y.Map<Y.Map<unknown>>,
    entities: yDoc.getMap('entities') as Y.Map<Y.Map<unknown>>,
    combat: yDoc.getMap('combat'), // 新增顶层
    showcase: yDoc.getMap('showcase'), // 重命名
    seats: yDoc.getMap('seats'),
    room: yDoc.getMap('room'),
  }
}
```

注意：删除了 `blueprints`（迁移到 REST API）。`showcase` 使用新的 key 名 `'showcase'`（而非旧的 `'showcase_items'`）。

- [ ] **Step 2: 重构 worldStore Scene 读取逻辑**

修改 `worldStore.ts` 中的 `readScene()` 函数，适配新的 Scene 结构（atmosphere JSON、无 grid/combat 字段）：

```typescript
function readScene(sceneMap: Y.Map<unknown>, id: string): Scene {
  const atmosphere = sceneMap.get('atmosphere') as Atmosphere | undefined
  const entityIds = sceneMap.get('entityIds') as Y.Map<boolean> | undefined
  const encounters = sceneMap.get('encounters') as Y.Map<EncounterData> | undefined

  return {
    id,
    name: readTextField(sceneMap, 'name'),
    sortOrder: (sceneMap.get('sortOrder') as number) ?? 0,
    atmosphere: atmosphere ?? {
      imageUrl: '',
      width: 0,
      height: 0,
      particlePreset: 'none',
      ambientPreset: 'none',
      ambientAudioUrl: '',
      ambientAudioVolume: 0.5,
    },
    entityIds: entityIds ? Array.from(entityIds.keys()) : [],
    encounters: encounters
      ? Object.fromEntries(Array.from(encounters.entries()).map(([k, v]) => [k, v]))
      : {},
  }
}
```

- [ ] **Step 3: 重构 worldStore Scene 写入逻辑**

修改 `addScene()`、`updateScene()`、`deleteScene()`、`duplicateScene()` 等 action 适配新结构：

```typescript
addScene: () => {
  const { _yScenes, _yDoc } = get()
  const id = crypto.randomUUID().slice(0, 8)
  const sceneMap = new Y.Map()
  _yDoc.transact(() => {
    _yScenes.set(id, sceneMap)
    writeTextField(sceneMap, 'name', '新场景')
    sceneMap.set('sortOrder', get().scenes.length)
    sceneMap.set('atmosphere', {
      imageUrl: '', width: 0, height: 0,
      particlePreset: 'none', ambientPreset: 'none',
      ambientAudioUrl: '', ambientAudioVolume: 0.5,
    })
    sceneMap.set('entityIds', new Y.Map())
    sceneMap.set('encounters', new Y.Map())
    // 添加所有 persistent entities
    const entityIds = sceneMap.get('entityIds') as Y.Map<boolean>
    get().entities.filter(e => e.persistent).forEach(e => entityIds.set(e.id, true))
  })
  return id
},

updateScene: (id, updates) => {
  const sceneMap = get()._yScenes.get(id)
  if (!sceneMap) return
  get()._yDoc.transact(() => {
    if (updates.name !== undefined) updateTextField(sceneMap, 'name', updates.name)
    if (updates.sortOrder !== undefined) sceneMap.set('sortOrder', updates.sortOrder)
    if (updates.atmosphere !== undefined) sceneMap.set('atmosphere', updates.atmosphere)
  })
},
```

- [ ] **Step 4: 添加 combat Y.Map 相关 state 和 observer**

在 worldStore 中添加 combat 状态管理：

```typescript
// State
combatState: null as CombatState | null,
_yCombat: null as Y.Map<unknown> | null,

// 在 init() 中添加 combat observer
const combat = worldMaps.combat
const combatObserver = () => {
  const mapUrl = combat.get('mapUrl') as string | undefined
  if (!mapUrl) {
    set({ combatState: null })
    return
  }
  const tokensMap = combat.get('tokens') as Y.Map<unknown> | undefined
  set({
    combatState: {
      mapUrl,
      mapWidth: (combat.get('mapWidth') as number) ?? 0,
      mapHeight: (combat.get('mapHeight') as number) ?? 0,
      grid: (combat.get('grid') as CombatState['grid']) ?? { size: 50, snap: true, visible: true, color: '#000000', offsetX: 0, offsetY: 0 },
      tokens: tokensMap ? Array.from(tokensMap.entries()).map(([id, v]) => ({ id, ...(v as object) } as MapToken)) : [],
      initiativeOrder: (combat.get('initiativeOrder') as string[]) ?? [],
      initiativeIndex: (combat.get('initiativeIndex') as number) ?? 0,
    },
  })
}
combat.observeDeep(combatObserver)
```

- [ ] **Step 5: 添加 Encounter 和 Combat actions**

```typescript
activateEncounter: (sceneId, encounterId) => {
  const { _yDoc, _yScenes } = get()
  const sceneMap = _yScenes.get(sceneId)
  if (!sceneMap) return
  const encounters = sceneMap.get('encounters') as Y.Map<EncounterData>
  const encounter = encounters.get(encounterId) as EncounterData
  if (!encounter) return
  const combat = _yDoc.getMap('combat')
  const room = _yDoc.getMap('room')

  _yDoc.transact(() => {
    combat.forEach((_, key) => combat.delete(key))
    combat.set('mapUrl', encounter.mapUrl)
    combat.set('mapWidth', encounter.mapWidth)
    combat.set('mapHeight', encounter.mapHeight)
    combat.set('grid', encounter.grid)
    const tokens = new Y.Map()
    combat.set('tokens', tokens)
    for (const [id, t] of Object.entries(encounter.tokens ?? {})) {
      tokens.set(id, t)
    }
    combat.set('initiativeOrder', [])
    combat.set('initiativeIndex', 0)
    room.set('activeEncounterId', encounterId)
  })
},

endCombat: () => {
  const { _yDoc } = get()
  const combat = _yDoc.getMap('combat')
  const room = _yDoc.getMap('room')
  _yDoc.transact(() => {
    combat.forEach((_, key) => combat.delete(key))
    room.set('activeEncounterId', null)
  })
},

saveEncounter: (name) => {
  const { _yDoc, room } = get()
  const activeSceneId = room.activeSceneId
  if (!activeSceneId) return
  const sceneMap = get()._yScenes.get(activeSceneId)
  if (!sceneMap) return
  const combat = _yDoc.getMap('combat')
  const snapshot = combat.toJSON()
  delete snapshot.initiativeOrder
  delete snapshot.initiativeIndex
  const encounters = sceneMap.get('encounters') as Y.Map<EncounterData>
  encounters.set(crypto.randomUUID().slice(0, 8), { name, ...snapshot } as EncounterData)
},
```

- [ ] **Step 6: 删除旧的 combat 相关 action**

删除旧的 `setCombatActive()`、`setInitiativeOrder()`、`advanceInitiative()` 以及从 scene 读取 grid/tokens 的逻辑。token 操作现在写入 `combat.tokens` Y.Map 而非 scene 的 tokens。

- [ ] **Step 7: 标记旧的 blueprints/handoutAssets/teamMetrics 为废弃（不删除）**

**重要**：这些 state slice 在 Task 11（GmDock 适配）完成前仍被 dock 组件引用。如果此处删除，Task 8 到 Task 11 之间 build 会报错。因此本步骤只添加 `@deprecated` 注释，实际删除推迟到 Task 11 中一并完成。

在 worldStore 中标注废弃：

- `blueprints` state slice → `/** @deprecated 由 assetStore 替代，Task 11 后删除 */`
- `handoutAssets` state slice → 同上
- `teamTrackers` state slice 和相关 actions（teamMetrics 合并到 room）
- 对应的 Yjs observers

这些数据现在分别由 `assetStore`（blueprints, handouts）和 `room.teamMetrics`（team trackers）管理。

- [ ] **Step 8: 更新 room state 读取**

```typescript
// RoomState 更新
interface RoomState {
  activeSceneId: string | null
  activeEncounterId: string | null
  teamMetrics: unknown // 合并自旧 team_metrics
}

// readRoom
function readRoom(roomMap: Y.Map<unknown>): RoomState {
  return {
    activeSceneId: (roomMap.get('activeSceneId') as string | null) ?? null,
    activeEncounterId: (roomMap.get('activeEncounterId') as string | null) ?? null,
    teamMetrics: roomMap.get('teamMetrics') ?? {},
  }
}
```

- [ ] **Step 9: 更新 selectors.ts**

更新 `selectIsCombat` 等 selector：

```typescript
export const selectIsCombat = (s: { room: RoomState }) => s.room.activeEncounterId != null
export const selectCombatState = (s: { combatState: CombatState | null }) => s.combatState
```

- [ ] **Step 10: 提交**

```bash
git add src/yjs/useWorld.ts src/stores/worldStore.ts src/stores/selectors.ts
git commit -m "refactor: Y.Doc restructure - Scene, Combat, Room"
```

---

## Chunk 4: 客户端组件适配

### Task 9: SceneViewer + AmbientAudio 适配

**Files:**

- Modify: `src/scene/SceneViewer.tsx`
- Modify: `src/scene/AmbientAudio.tsx`
- Modify: `src/scene/ParticleLayer.tsx`

- [ ] **Step 1: 更新 SceneViewer 读取 atmosphere**

将所有 `scene.atmosphereImageUrl` 替换为 `scene.atmosphere.imageUrl`，`scene.width` 替换为 `scene.atmosphere.width` 等：

```typescript
// 旧: scene.atmosphereImageUrl
// 新: scene.atmosphere.imageUrl
const imageUrl = activeScene?.atmosphere.imageUrl
const isVideo = imageUrl ? isVideoUrl(imageUrl) : false
```

- [ ] **Step 2: 更新 AmbientAudio**

```typescript
// 旧: scene.ambientAudioUrl, scene.ambientAudioVolume
// 新: scene.atmosphere.ambientAudioUrl, scene.atmosphere.ambientAudioVolume
const audioUrl = activeScene?.atmosphere.ambientAudioUrl
const volume = activeScene?.atmosphere.ambientAudioVolume ?? 0.5
```

- [ ] **Step 3: 更新 ParticleLayer**

```typescript
// 旧: scene.particlePreset
// 新: scene.atmosphere.particlePreset
const preset = activeScene?.atmosphere.particlePreset ?? 'none'
```

- [ ] **Step 4: 更新 combat 模式判断**

```typescript
// 旧: scene.combatActive
// 新: useWorldStore(selectIsCombat)
const isCombat = useWorldStore(selectIsCombat)
```

- [ ] **Step 5: 提交**

```bash
git add src/scene/
git commit -m "refactor: scene components read from atmosphere object"
```

---

### Task 10: KonvaMap 适配 combat Y.Map

**Files:**

- Modify: `src/combat/KonvaMap.tsx`
- Modify: `src/combat/KonvaTokenLayer.tsx` (如果存在)
- Modify: `src/combat/useSceneTokens.ts`

- [ ] **Step 1: KonvaMap 从 combatState 读取地图和 grid**

```typescript
// 旧: scene.tacticalMapImageUrl, scene.gridSize, etc.
// 新: combatState.mapUrl, combatState.grid.size, etc.
const combatState = useWorldStore(selectCombatState)
if (!combatState) return null // 没有激活的战斗

const { mapUrl, mapWidth, mapHeight, grid, tokens } = combatState
```

- [ ] **Step 2: Token 操作写入 combat.tokens**

```typescript
// 旧: worldStore.updateToken(id, { x, y }) 写入 scene tokens Y.Map
// 新: 写入 combat.tokens Y.Map
updateToken: (tokenId, updates) => {
  const combat = get()._yDoc.getMap('combat')
  const tokens = combat.get('tokens') as Y.Map<unknown>
  if (!tokens) return
  const existing = tokens.get(tokenId) as object
  tokens.set(tokenId, { ...existing, ...updates })
},

addToken: (token) => {
  const combat = get()._yDoc.getMap('combat')
  const tokens = combat.get('tokens') as Y.Map<unknown>
  if (!tokens) return
  const id = crypto.randomUUID().slice(0, 8)
  tokens.set(id, token)
  return id
},

deleteToken: (tokenId) => {
  const combat = get()._yDoc.getMap('combat')
  const tokens = combat.get('tokens') as Y.Map<unknown>
  if (!tokens) return
  tokens.delete(tokenId)
},
```

- [ ] **Step 3: 删除旧的 useSceneTokens.ts**

旧的 hook 设置了 per-scene token observer。现在 token 在 combat Y.Map 中，由 worldStore 的 combat observer 统一管理。如果 `useSceneTokens.ts` 还被引用，需要逐一替换为 worldStore 的 combatState。

- [ ] **Step 4: 提交**

```bash
git add src/combat/
git commit -m "refactor: KonvaMap reads from combat Y.Map singleton"
```

---

### Task 11: GmDock 适配素材 store

**Files:**

- Modify: `src/dock/MapDockTab.tsx`
- Modify: `src/dock/TokenDockTab.tsx`
- Modify: `src/dock/HandoutDockTab.tsx`
- Modify: `src/gm/GmDock.tsx`
- Delete: `src/dock/useHandoutAssets.ts`

- [ ] **Step 1: MapDockTab 从 assetStore 获取图片素材**

**注意**：`.filter()` 每次返回新数组引用，导致不必要重渲染。使用 zustand 的 `useShallow` 做浅比较：

```typescript
import { useShallow } from 'zustand/react/shallow'

// 旧: 从 scenes 列表获取图片
// 新: 从 assetStore 获取 type='image' 的素材
const imageAssets = useAssetStore(useShallow((s) => s.assets.filter((a) => a.type === 'image')))
const upload = useAssetStore((s) => s.upload)

// 上传图片
const handleUpload = async (file: File) => {
  const { w, h } = await getMediaDimensions(URL.createObjectURL(file))
  await upload(file, { type: 'image', tags: [], width: w, height: h })
}

// 设为当前场景背景
const handleSetBackground = (asset: AssetMeta) => {
  updateScene(activeSceneId, {
    atmosphere: {
      ...activeScene.atmosphere,
      imageUrl: asset.url,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
    },
  })
}
```

- [ ] **Step 2: TokenDockTab 从 assetStore 获取 blueprint 素材**

```typescript
// 旧: 从 worldStore.blueprints 获取
// 新: 从 assetStore 获取 type='blueprint' 的素材
const blueprintAssets = useAssetStore(
  useShallow((s) => s.assets.filter((a) => a.type === 'blueprint')),
)
```

- [ ] **Step 3: HandoutDockTab 从 assetStore 获取讲义素材**

```typescript
// 旧: 从 worldStore.handoutAssets 或 useHandoutAssets hook 获取
// 新: 从 assetStore 获取 type='handout' 的素材
const handoutAssets = useAssetStore(useShallow((s) => s.assets.filter((a) => a.type === 'handout')))
```

- [ ] **Step 4: 删除 useHandoutAssets.ts**

不再需要，功能由 assetStore 覆盖。

- [ ] **Step 5: 从 worldStore 中删除已废弃的 blueprints/handoutAssets state 和 actions**

Task 8 Step 7 中标记为 `@deprecated` 的代码，现在 dock 组件已适配 assetStore，可以安全删除：

- `blueprints` state slice 和 `addBlueprint()`/`updateBlueprint()`/`deleteBlueprint()` actions
- `handoutAssets` state slice 和相关 actions
- 对应的 Yjs observers

- [ ] **Step 6: 提交**

```bash
git add src/dock/ src/gm/GmDock.tsx
git commit -m "refactor: dock tabs read from asset store"
```

---

### Task 12: SceneListPanel + SceneConfigPanel 适配

**Files:**

- Modify: `src/gm/SceneListPanel.tsx`
- Modify: `src/gm/SceneConfigPanel.tsx`

- [ ] **Step 1: SceneListPanel 使用 atmosphere.imageUrl 作为缩略图**

```typescript
// 旧: scene.atmosphereImageUrl
// 新: scene.atmosphere.imageUrl
<img src={scene.atmosphere.imageUrl} />
```

- [ ] **Step 2: SceneConfigPanel 编辑 atmosphere 对象**

将各字段的编辑改为更新 `atmosphere` 整体对象：

```typescript
const handleAtmosphereChange = (key: string, value: unknown) => {
  updateScene(scene.id, {
    atmosphere: { ...scene.atmosphere, [key]: value }
  })
}

// 粒子预设
<select value={scene.atmosphere.particlePreset} onChange={e => handleAtmosphereChange('particlePreset', e.target.value)}>

// 音频音量
<input type="range" value={scene.atmosphere.ambientAudioVolume} onChange={e => handleAtmosphereChange('ambientAudioVolume', parseFloat(e.target.value))} />
```

- [ ] **Step 3: 从 SceneConfigPanel 中移除 grid 配置**

Grid 配置现在属于 encounter/combat，不在 scene 级别。从 SceneConfigPanel 中删除 gridSize、gridSnap、gridVisible、gridColor 等控件。

- [ ] **Step 4: 提交**

```bash
git add src/gm/SceneListPanel.tsx src/gm/SceneConfigPanel.tsx
git commit -m "refactor: scene panels use atmosphere object, remove grid from scene"
```

---

### Task 13: 初始化流程 + 清理

**Files:**

- Modify: `src/App.tsx` 或 RoomSession 组件
- Delete or update: `src/yjs/useScenes.ts`, `src/yjs/useRoom.ts`, `src/entities/useEntities.ts`

- [ ] **Step 1: 在 RoomSession 初始化时同时加载素材**

```typescript
// 在 RoomSession 或 App 中
useEffect(() => {
  if (roomId && !isLoading) {
    useAssetStore.getState().init(roomId)
  }
}, [roomId, isLoading])
```

- [ ] **Step 2: 删除不再使用的旧 hooks**

检查以下文件是否还有引用，如果没有则删除：

- `src/yjs/useScenes.ts` — 被 worldStore 替代
- `src/yjs/useRoom.ts` — 被 worldStore 替代
- `src/entities/useEntities.ts` — 被 worldStore 替代

如果还有组件引用这些 hook，逐一替换为 worldStore 调用。

- [ ] **Step 3: 更新 showcase 引用**

将所有 `yDoc.getMap('showcase_items')` 替换为 `yDoc.getMap('showcase')`。

检查并更新这些文件：

- `src/stores/worldStore.ts`（observer 和 state）
- `src/showcase/useShowcase.ts`（如果存在独立 hook）

- [ ] **Step 4: 更新 team_metrics 引用**

将 teamMetrics 相关逻辑改为读写 `room.teamMetrics`。

检查并更新这些文件：

- `src/stores/worldStore.ts`（observer 和 state）
- `src/team/useTeamMetrics.ts`（如果存在独立 hook）
- `src/team/TeamDashboard.tsx`

- [ ] **Step 5: 全局搜索确认无遗漏**

搜索以下旧引用，确保全部替换：

- `atmosphereImageUrl` → `atmosphere.imageUrl`
- `tacticalMapImageUrl` → 通过 combatState
- `battleMapUrl` → 通过 combatState
- `combatActive` → `selectIsCombat`
- `gridSize`, `gridSnap`, `gridVisible` → combatState.grid
- `blueprints` Y.Map → assetStore
- `handout_assets` Y.Map → assetStore
- `showcase_items` → `showcase`
- `team_metrics` → `room.teamMetrics`

```bash
# 在项目根目录运行（包括测试文件和 test-utils）
grep -rn 'atmosphereImageUrl\|tacticalMapImageUrl\|battleMapUrl\|combatActive\|showcase_items\|handout_assets\|team_metrics\|blueprints' src/
```

注意也要修复测试文件和 `src/__test-utils__/` 中的旧引用。

- [ ] **Step 6: 确保构建通过**

```bash
npm run build
```

- [ ] **Step 7: 确保测试通过**

```bash
npm test
```

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "refactor: cleanup legacy hooks and old Y.Doc references"
```

---

## Chunk 5: entity GC 迁移 + 最终验证

### Task 14: 客户端移除实时 GC

**Files:**

- Modify: `src/entities/entityLifecycle.ts`
- Modify: `src/stores/worldStore.ts`

- [ ] **Step 1: 从 deleteScene action 中移除 gcOrphanedEntities 调用**

```typescript
// 旧: deleteScene 调用了 gcOrphanedEntities()
// 新: 只删除 scene，不做 GC（服务端在房间空闲时自动 GC）
deleteScene: (id) => {
  const { _yScenes, _yDoc, room } = get()
  _yDoc.transact(() => {
    _yScenes.delete(id)
    if (room.activeSceneId === id) {
      _yDoc.getMap('room').set('activeSceneId', null)
    }
  })
},
```

- [ ] **Step 2: 清理 entityLifecycle.ts**

`gcOrphanedEntities` 不再在客户端调用。可以保留文件但标注为服务端使用，或者直接删除（因为服务端有自己的 GC 实现）。

- [ ] **Step 3: 提交**

```bash
git add src/entities/entityLifecycle.ts src/stores/worldStore.ts
git commit -m "refactor: remove client-side entity GC (now server-side)"
```

---

### Task 15: 端到端验证

- [ ] **Step 1: 启动服务端**

```bash
cd server && node index.mjs
```

验证：

- 创建房间 → `data/rooms/{id}/` 目录生成
- WebSocket 连接正常
- 断线后5秒日志打印 GC 信息（如果有孤儿 entity）

- [ ] **Step 2: 启动客户端**

```bash
npm run dev
```

验证：

- 进入房间 → 素材列表加载（assetStore）+ Y.Doc 同步
- Gallery tab 显示从 REST API 加载的素材
- 上传图片 → 在 Gallery 中出现
- 设为场景背景 → SceneViewer 显示
- Scene 配置面板 → 粒子/音频正常
- Token tab → blueprint 素材显示
- 创建 entity 从 blueprint → 正常
- 删除房间 → `data/rooms/{id}/` 目录消失

- [ ] **Step 3: 确保所有测试通过**

```bash
npm test
```

更新失败的测试以适配新的 Scene/Combat 结构。

- [ ] **Step 4: 最终构建验证**

```bash
npm run build
```

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "chore: fix tests for new data layer"
```
