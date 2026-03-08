# Hocuspocus 详解

**一句话总结**: Hocuspocus = Yjs 的企业级服务器,提供权限验证、多房间管理、水平扩展等生产级功能

---

## 1. Hocuspocus 是什么?

### 1.1 官方定位

> **Hocuspocus** is a batteries-included WebSocket server for Yjs documents

翻译: Hocuspocus 是一个"开箱即用"的 Yjs WebSocket 服务器

**关键词解析**:
- **batteries-included**: 包含电池,即"功能齐全,无需额外配置"
- **WebSocket server**: 专门为 Yjs 设计的 WebSocket 服务器
- **for Yjs documents**: 100% 兼容 Yjs,不是替代品

### 1.2 开发背景

**创建者**: [Tiptap](https://tiptap.dev/) 团队(富文本编辑器公司)

**创建原因**:
```
Tiptap 团队遇到的问题:
  1. y-websocket 太简单,缺少企业级功能
  2. 需要权限验证 → y-websocket 不支持
  3. 需要多租户 → y-websocket 不支持
  4. 需要水平扩展 → y-websocket 不支持

解决方案:
  → 自研 Hocuspocus(2021 年)
  → 开源(MIT 许可)
  → 商业友好
```

**使用者**:
- Tiptap Cloud(自家产品)
- 多家 SaaS 公司
- 协作文档应用

---

## 2. Hocuspocus vs y-websocket

### 2.1 架构对比

```
┌─────────────────────────────────────────────────────────┐
│  当前架构: y-websocket (简单,但功能有限)                   │
└─────────────────────────────────────────────────────────┘

客户端 A ─┐
客户端 B ─┼─→ WebSocket 服务器 (y-websocket/bin/utils)
客户端 C ─┘         │
                    ├─→ Y.Doc (内存)
                    └─→ LevelDB (持久化)

特点:
  ✅ 简单,易上手
  ✅ 单文件启动
  ❌ 无权限验证
  ❌ 无多房间管理
  ❌ 无水平扩展
  ❌ 无监控指标


┌─────────────────────────────────────────────────────────┐
│  Hocuspocus 架构 (企业级,功能齐全)                        │
└─────────────────────────────────────────────────────────┘

客户端 A ─┐
客户端 B ─┼─→ Hocuspocus 服务器
客户端 C ─┘         │
                    ├─→ 钩子系统
                    │   ├─ onAuthenticate (权限验证)
                    │   ├─ onChange (数据变更监听)
                    │   ├─ onLoadDocument (加载文档)
                    │   └─ onStoreDocument (保存文档)
                    │
                    ├─→ 扩展系统
                    │   ├─ Database (PostgreSQL/MongoDB)
                    │   ├─ Redis (多服务器同步)
                    │   ├─ Logger (日志)
                    │   └─ Throttle (限流)
                    │
                    ├─→ Y.Doc (内存,自动管理)
                    │
                    └─→ 监控指标 (Prometheus)

特点:
  ✅ 权限验证
  ✅ 多房间自动管理
  ✅ 水平扩展 (Redis 集群)
  ✅ 监控指标
  ✅ 插件式扩展
  ⚠️ 复杂度增加
```

### 2.2 功能对比表

| 功能 | y-websocket | Hocuspocus | 说明 |
|------|-------------|------------|------|
| **基础功能** |
| WebSocket 同步 | ✅ | ✅ | 两者都支持 |
| Y.Doc 管理 | ✅ 手动 | ✅ 自动 | Hocuspocus 自动管理生命周期 |
| 持久化 | ✅ LevelDB | ✅ 多种 | PostgreSQL/MongoDB/自定义 |
| **权限控制** |
| 身份验证 | ❌ | ✅ onAuthenticate | JWT/OAuth/自定义 |
| 字段级权限 | ❌ | ✅ onChange 验证 | 可拦截非法操作 |
| 审计日志 | ❌ | ✅ onChange 记录 | 记录谁改了什么 |
| **扩展性** |
| 多房间管理 | ❌ 手动 | ✅ 自动 | 自动创建/销毁房间 |
| 房间 LRU 缓存 | ❌ | ✅ 内置 | 自动卸载不活跃房间 |
| 水平扩展 | ❌ | ✅ Redis | 多服务器同步 |
| 负载均衡 | ❌ | ✅ | 房间粘性路由 |
| **开发体验** |
| 钩子系统 | ❌ | ✅ 10+ 钩子 | 生命周期完整 |
| 插件系统 | ❌ | ✅ Extensions | 可组合扩展 |
| 监控指标 | ❌ | ✅ Prometheus | 实时性能监控 |
| TypeScript | ⚠️ 部分 | ✅ 完整 | 类型安全 |
| **运维** |
| 优雅关闭 | ❌ | ✅ | 等待连接关闭 |
| 健康检查 | ❌ | ✅ 内置 | /health 端点 |
| 日志系统 | ❌ | ✅ 可配置 | 结构化日志 |
| 错误处理 | ⚠️ 基础 | ✅ 完善 | 详细错误信息 |

---

## 3. 代码对比: y-websocket vs Hocuspocus

### 3.1 服务端代码

#### **y-websocket (当前使用)**

```javascript
// server/index.mjs (简单,但功能有限)
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils')
const { LeveldbPersistence } = require('y-leveldb')

const ldb = new LeveldbPersistence('./db')

setPersistence({
  provider: ldb,
  bindState: async (docName, ydoc) => {
    const persistedYdoc = await ldb.getYDoc(docName)
    const newUpdates = Y.encodeStateAsUpdate(persistedYdoc)
    Y.applyUpdate(ydoc, newUpdates)
    ydoc.on('update', (update) => {
      ldb.storeUpdate(docName, update)
    })
  },
  writeState: async (_docName, _ydoc) => {}
})

// WebSocket 连接处理
wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req)  // 就这么简单!
})

// 问题:
// ❌ 无权限验证 - 任何人都能连接
// ❌ 无法区分 GM 和玩家
// ❌ 无法追踪谁做了什么操作
// ❌ 无法限制操作频率(防 DDoS)
```

#### **Hocuspocus (功能齐全)**

```typescript
// server/hocuspocus.ts (强大,但稍复杂)
import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { Logger } from '@hocuspocus/extension-logger'
import { Throttle } from '@hocuspocus/extension-throttle'

const server = Server.configure({
  port: 4444,

  // 🔐 权限验证钩子
  async onAuthenticate({ token, documentName, connection }) {
    // 验证 JWT token
    const user = await verifyJWT(token)

    if (!user) {
      throw new Error('Unauthorized')
    }

    // 检查用户是否有权限访问该房间
    const hasAccess = await db.checkRoomAccess(user.id, documentName)
    if (!hasAccess) {
      throw new Error('Access denied')
    }

    // 返回用户信息(会传递给后续钩子)
    return {
      user: {
        id: user.id,
        name: user.name,
        role: user.role  // 'GM' or 'PL'
      }
    }
  },

  // 📝 数据变更钩子
  async onChange({ document, context, requestHeaders, requestParameters }) {
    const user = context.user

    // 审计日志
    await db.auditLog.insert({
      userId: user.id,
      userName: user.name,
      documentName: document.name,
      timestamp: Date.now(),
      action: 'update'
    })

    // 权限验证示例
    const changes = getChanges(document)
    if (changes.modifiedPath === 'room.mode' && user.role !== 'GM') {
      console.warn(`Unauthorized attempt by ${user.name} to change room mode`)
      // 可选: 回滚操作或断开连接
    }
  },

  // 💾 文档加载钩子
  async onLoadDocument({ documentName }) {
    // 从 PostgreSQL 加载文档
    const data = await db.documents.findOne({ name: documentName })

    if (!data) {
      return null  // 文档不存在,Hocuspocus 会创建新的
    }

    return data.state  // 返回 Y.Doc 二进制数据
  },

  // 💾 文档保存钩子
  async onStoreDocument({ documentName, state, context }) {
    // 保存到 PostgreSQL
    await db.documents.upsert({
      name: documentName,
      state: state,  // Y.Doc 二进制数据
      updatedAt: new Date(),
      updatedBy: context.user?.id
    })
  },

  // 🔌 断开连接钩子
  async onDisconnect({ documentName, context }) {
    console.log(`User ${context.user?.name} disconnected from ${documentName}`)
  },

  // 📦 扩展插件
  extensions: [
    // 数据库扩展
    new Database({
      fetch: async ({ documentName }) => {
        return await db.loadDocument(documentName)
      },
      store: async ({ documentName, state }) => {
        await db.saveDocument(documentName, state)
      }
    }),

    // 日志扩展
    new Logger({
      onLoadDocument: true,
      onChange: true,
      onConnect: true
    }),

    // 限流扩展 (防 DDoS)
    new Throttle({
      throttle: 10,  // 每秒最多 10 条消息
      banTime: 30    // 超过限制后封禁 30 秒
    })
  ]
})

server.listen()
```

### 3.2 客户端代码

#### **y-websocket (当前使用)**

```typescript
// src/yjs/useYjsConnection.ts
import { WebsocketProvider } from 'y-websocket'

const WEBSOCKET_URL = 'ws://localhost:4444'
const ROOM_NAME = 'vtt-room-1'

const yDoc = new Y.Doc()
const wsProvider = new WebsocketProvider(WEBSOCKET_URL, ROOM_NAME, yDoc)

// 无身份验证 ❌
// 任何人都能连接
```

#### **Hocuspocus (需要修改,但变化小)**

```typescript
// src/yjs/useYjsConnection.ts
import { HocuspocusProvider } from '@hocuspocus/provider'

const WEBSOCKET_URL = 'ws://localhost:4444'
const ROOM_NAME = 'vtt-room-1'

const yDoc = new Y.Doc()

// 唯一变化: 添加 token 参数
const provider = new HocuspocusProvider({
  url: WEBSOCKET_URL,
  name: ROOM_NAME,
  document: yDoc,
  token: getUserToken(),  // 🔐 传递 JWT token
})

// 可选: 监听认证失败
provider.on('authenticationFailed', ({ reason }) => {
  console.error('Authentication failed:', reason)
  // 提示用户重新登录
})
```

**客户端迁移成本**: 极低(仅需添加 token 参数)

---

## 4. Hocuspocus 的核心优势

### 4.1 钩子系统(Hooks)

Hocuspocus 提供 **10+ 生命周期钩子**,覆盖所有关键时刻:

```typescript
Server.configure({
  // 连接生命周期
  onConfigure: () => {},           // 服务器启动时
  onListen: () => {},              // 监听端口时
  onUpgrade: () => {},             // WebSocket 握手时
  onConnect: () => {},             // 客户端连接时
  onAuthenticate: () => {},        // 🔐 身份验证时
  onLoadDocument: () => {},        // 📥 加载文档时
  onCreateDocument: () => {},      // 📄 创建新文档时

  // 数据变更
  onChange: () => {},              // 📝 文档修改时
  onStoreDocument: () => {},       // 💾 保存文档时

  // 断开连接
  onDisconnect: () => {},          // 🔌 客户端断开时
  onDestroy: () => {},             // 🗑️ 文档销毁时

  // 其他
  onStateless: () => {},           // 无状态消息时
})
```

**实际应用**:

```typescript
// 场景 1: 记录用户活动
onChange: async ({ context }) => {
  await analytics.track({
    userId: context.user.id,
    event: 'document_edited',
    timestamp: Date.now()
  })
}

// 场景 2: 自动备份
onStoreDocument: async ({ documentName, state }) => {
  // 每次保存时,同步备份到 S3
  await s3.upload({
    Bucket: 'vtt-backups',
    Key: `${documentName}-${Date.now()}.backup`,
    Body: state
  })
}

// 场景 3: 实时通知
onChange: async ({ documentName, context }) => {
  // 通知其他服务(如 Discord bot)
  await discord.sendMessage({
    channel: documentName,
    message: `${context.user.name} updated the room`
  })
}
```

### 4.2 扩展系统(Extensions)

Hocuspocus 采用**插件式架构**,功能可组合:

```typescript
import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { Redis } from '@hocuspocus/extension-redis'
import { Logger } from '@hocuspocus/extension-logger'
import { Throttle } from '@hocuspocus/extension-throttle'
import { Webhook } from '@hocuspocus/extension-webhook'

const server = Server.configure({
  extensions: [
    // 🗄️ 数据库持久化
    new Database({
      fetch: async ({ documentName }) => { /* ... */ },
      store: async ({ documentName, state }) => { /* ... */ }
    }),

    // 🔴 Redis 多服务器同步
    new Redis({
      host: 'localhost',
      port: 6379,
      // 多个 Hocuspocus 服务器通过 Redis 同步
      // 实现水平扩展
    }),

    // 📊 日志
    new Logger({
      log: (message) => console.log(`[Hocuspocus] ${message}`)
    }),

    // 🚦 限流 (防 DDoS)
    new Throttle({
      throttle: 10,  // 每秒最多 10 条消息
      banTime: 30    // 超限封禁 30 秒
    }),

    // 🪝 Webhook (通知外部服务)
    new Webhook({
      url: 'https://yourapi.com/webhook',
      events: ['onChange', 'onConnect']
    })
  ]
})
```

**官方扩展**:
- `@hocuspocus/extension-database` - 数据库持久化
- `@hocuspocus/extension-redis` - Redis 集群同步
- `@hocuspocus/extension-logger` - 日志
- `@hocuspocus/extension-throttle` - 限流
- `@hocuspocus/extension-webhook` - Webhook 通知
- `@hocuspocus/extension-monitor` - Prometheus 监控

**自定义扩展**:
```typescript
class CustomExtension {
  async onLoadDocument({ documentName }) {
    console.log('Loading:', documentName)
  }

  async onChange({ document, context }) {
    console.log('Changed by:', context.user.name)
  }
}

const server = Server.configure({
  extensions: [new CustomExtension()]
})
```

### 4.3 Redis 水平扩展

**问题**: 单个 y-websocket 服务器无法扩展

**解决**: Hocuspocus + Redis 实现多服务器同步

```
┌─────────────────────────────────────────────────────┐
│  多服务器架构 (Redis 集群同步)                        │
└─────────────────────────────────────────────────────┘

客户端 A ─┐
客户端 B ─┼─→ Nginx 负载均衡
客户端 C ─┘       │
                  ├─→ Hocuspocus 服务器 1 ─┐
                  │                        │
                  ├─→ Hocuspocus 服务器 2 ─┼─→ Redis Pub/Sub
                  │                        │   (同步文档更新)
                  └─→ Hocuspocus 服务器 3 ─┘

工作流程:
  1. 客户端 A 连接到服务器 1
  2. 客户端 B 连接到服务器 2
  3. 客户端 A 修改文档
     → 服务器 1 发布更新到 Redis
     → Redis 广播给所有服务器
     → 服务器 2 接收更新
     → 客户端 B 看到变化

效果:
  - 支持数千并发用户
  - 服务器故障时自动切换
  - 水平扩展(添加更多服务器)
```

**配置**:

```typescript
import { Server } from '@hocuspocus/server'
import { Redis } from '@hocuspocus/extension-redis'

const server = Server.configure({
  extensions: [
    new Redis({
      host: 'localhost',
      port: 6379,
      // Hocuspocus 自动处理 Pub/Sub
      // 无需手动编写广播逻辑
    })
  ]
})
```

---

## 5. 对比总结

### 5.1 适用场景

| 场景 | y-websocket | Hocuspocus |
|------|-------------|------------|
| **小型私人游戏** (< 10 人) | ✅ **推荐** | ⚠️ 过度工程 |
| **中型社区** (10-50 人) | ⚠️ 可用,但缺权限 | ✅ **推荐** |
| **大型服务** (> 50 人) | ❌ 无法扩展 | ✅ **必需** |
| **商业 SaaS** (多租户) | ❌ 功能不足 | ✅ **必需** |
| **需要权限验证** | ❌ 不支持 | ✅ **推荐** |
| **需要审计日志** | ❌ 手动实现 | ✅ **推荐** |
| **快速原型开发** | ✅ **推荐** | ⚠️ 稍复杂 |

### 5.2 迁移成本

```
y-websocket → Hocuspocus 迁移

服务端:
  - 工作量: 3-5 天
  - 难度: 中等
  - 需要重写服务器代码
  - 需要配置钩子和扩展

客户端:
  - 工作量: 1-2 小时
  - 难度: 低
  - 仅需添加 token 参数
  - API 99% 兼容

数据库:
  - 工作量: 2-3 天
  - 难度: 中等
  - 从 LevelDB 迁移到 PostgreSQL
  - 或编写 LevelDB 适配器
```

---

## 6. 你需要 Hocuspocus 吗?

### 6.1 决策树

```
开始
  │
  ├─ 当前用户 < 10 人? ─YES→ 继续使用 y-websocket ✅
  │                     NO↓
  ├─ 需要权限验证? ─────YES→ 考虑 Hocuspocus 🟡
  │                     NO↓
  ├─ 需要多房间(>10)? ──YES→ 考虑 Hocuspocus 🟡
  │                     NO↓
  ├─ 需要商业化? ───────YES→ 使用 Hocuspocus ✅
  │                     NO↓
  └─ 继续使用 y-websocket ✅
```

### 6.2 对于 myVTT 项目的建议

**当前状态**:
- 用户数: 4-7 人(典型桌游)
- 房间数: 1 个(固定房间名)
- 权限: 无验证(信任所有玩家)

**短期(0-6 个月)**: ❌ **不需要 Hocuspocus**

**理由**:
- y-websocket 完全够用
- 迁移成本 > 收益
- 专注于业务功能

**中期(6-12 个月)**: 🟡 **可以考虑**

**触发条件**:
- 房间数 > 10(需要多房间隔离)
- 需要权限验证(防止恶意玩家)
- 需要审计日志(追溯操作)

**长期(12+ 个月)**: 🟢 **可能需要**

**触发条件**:
- 并发用户 > 50
- 商业化运营
- 需要 SLA 保证

---

## 7. 总结

### Hocuspocus 一句话总结

> **Hocuspocus = Yjs 的生产级服务器**
>
> 就像 Express 之于 Node.js http 模块:
> - http 模块: 简单,但功能有限
> - Express: 功能齐全,生产就绪
>
> y-websocket: 简单,但功能有限
> - Hocuspocus: 功能齐全,生产就绪

### 核心要点

1. **不是 Yjs 替代品** - 是 y-websocket 的增强版
2. **客户端几乎无需修改** - 只需添加 token 参数
3. **服务端需要重写** - 但功能更强大
4. **主要解决问题**: 权限、扩展、监控
5. **适合场景**: 商业化、多租户、大规模

### 推荐路径

```
阶段 1: 使用 y-websocket(当前)
  ↓ 触发条件: 房间数 > 10 或需要权限
阶段 2: 迁移到 Hocuspocus
  ↓ 触发条件: 并发用户 > 50
阶段 3: Hocuspocus + Redis 集群
```

---

## 8. 快速开始(如果你想尝试)

### 安装

```bash
npm install @hocuspocus/server @hocuspocus/provider
```

### 最小服务器

```typescript
// server.ts
import { Server } from '@hocuspocus/server'

const server = Server.configure({
  port: 4444,
  async onAuthenticate({ token }) {
    // 简单验证(生产环境应使用 JWT)
    if (token === 'secret-token') {
      return { user: { name: 'Alice' } }
    }
    throw new Error('Unauthorized')
  }
})

server.listen()
```

### 最小客户端

```typescript
// client.ts
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const yDoc = new Y.Doc()
const provider = new HocuspocusProvider({
  url: 'ws://localhost:4444',
  name: 'my-room',
  document: yDoc,
  token: 'secret-token'
})
```

---

**参考资源**:
- [Hocuspocus 官方文档](https://tiptap.dev/hocuspocus)
- [GitHub 仓库](https://github.com/ueberdosis/hocuspocus)
- [示例项目](https://github.com/ueberdosis/hocuspocus/tree/main/demos)

---

**文档版本**: 1.0
**最后更新**: 2026-03-09
