# 系统架构全貌

## 技术栈

| 层         | 技术                                    | 版本        |
| ---------- | --------------------------------------- | ----------- |
| 前端框架   | React + ReactDOM                        | 19.2        |
| 构建工具   | Vite                                    | 7.3         |
| 类型系统   | TypeScript                              | 5.9         |
| 样式       | Tailwind CSS                            | v4          |
| Canvas     | konva + react-konva                     | 10.2 / 19.2 |
| 图标       | lucide-react                            | 0.577       |
| 状态管理   | zustand                                 | 5.0         |
| 实时通信   | socket.io-client                        | 4.8         |
| 服务端框架 | Express                                 | 5.2         |
| 实时广播   | Socket.io                               | 4.8         |
| 数据库     | better-sqlite3                          | 12.6        |
| 文件上传   | multer                                  | 2.1         |
| 测试       | vitest + @testing-library/react + jsdom | 4.0         |

## 数据流

```
┌─────────────┐     REST API (init)     ┌────────────────┐     SQLite
│   Browser    │ ◄──────────────────────►│  Express 5.2   │ ◄──────────► room.db
│              │                         │                │              (per-room)
│  zustand     │     Socket.io (live)    │  Socket.io 4.8 │
│  stores      │ ◄──────────────────────►│                │
│     ↓        │                         └────────────────┘
│  React 19    │
│  components  │
└─────────────┘
```

**初始化**：前端 `init()` 调用 REST API 批量加载数据 → 写入 zustand stores → React 组件订阅渲染

**实时更新**：用户操作 → REST API 修改 SQLite → 服务端广播 Socket.io 事件 → 所有客户端 store 更新

**乐观更新**：仅 3 处使用（`createEphemeralNpcInScene`、`spawnEphemeralTokenAtPosition`、`pinShowcaseItem`），其余均等待 Socket.io 事件确认

## 前端模块地图

```
src/
├── App.tsx                # 应用入口，初始化 stores + Socket.io
├── main.tsx               # Vite 入口
├── stores/                # zustand 状态管理（详见 state-management.md）
│   ├── worldStore.ts      # 核心数据：scenes, entities, room state
│   ├── identityStore.ts   # 座位/身份
│   ├── assetStore.ts      # 素材管理
│   ├── uiStore.ts         # 客户端 UI 状态
│   └── selectors.ts       # 派生数据选择器
├── combat/                # 战术模式（详见 tactical-system.md）
│   ├── KonvaMap.tsx        # react-konva 主画布
│   ├── TacticalPanel.tsx   # 战术面板（浮层容器）
│   └── ...                 # Token 组件、工具组件
├── scene/                 # 场景模式
│   ├── SceneViewer.tsx     # 全屏氛围图
│   ├── AmbientAudio.tsx    # 环境音频
│   └── particles.ts        # 粒子效果（6 种预设）
├── chat/                  # 聊天系统
│   ├── ChatPanel.tsx       # 消息面板
│   └── DiceResultCard.tsx  # 骰子结果卡片
├── gm/                    # GM 工具（11 个组件）
│   ├── GmSidebar.tsx       # GM 侧边栏
│   ├── GmDock.tsx          # GM 底栏
│   ├── SceneLibrary.tsx    # 场景库
│   └── EntityPanel.tsx     # 实体管理
├── identity/              # 座位/身份系统
│   ├── PortraitBar.tsx     # 头像栏
│   └── SeatPanel.tsx       # 座位面板
├── dock/                  # 底部素材栏
├── layout/                # 应用布局
├── rules/                 # 规则插件框架（详见 rule-plugin-system.md）
├── shared/                # 共享工具 + UI 组件
│   ├── diceUtils.ts        # 骰子引擎
│   ├── permissions.ts      # 权限检查
│   ├── entityAdapters.ts   # Entity 数据适配（过渡层）
│   └── ui/                 # ResourceBar, MiniHoldButton 等
├── showcase/              # 展示材料
├── team/                  # 团队追踪器
├── admin/                 # 管理面板
└── styles/                # 全局样式 + Tailwind 配置
```

## 服务端模块

### 入口

`server/index.ts`：创建 Express app + HTTP server + Socket.io → 注册中间件 → 挂载 11 个路由模块 → 生产环境托管前端静态文件

### 路由模块

| 文件                 | 前缀                          | 职责                    |
| -------------------- | ----------------------------- | ----------------------- |
| `routes/rooms.ts`    | `/api/rooms`                  | 房间 CRUD（全局库）     |
| `routes/seats.ts`    | `/api/rooms/:roomId/seats`    | 座位管理                |
| `routes/scenes.ts`   | `/api/rooms/:roomId/scenes`   | 场景 CRUD + Entity 关联 |
| `routes/entities.ts` | `/api/rooms/:roomId/entities` | Entity CRUD             |
| `routes/archives.ts` | `/api/rooms/:roomId/archives` | 战术存档 save/load      |
| `routes/tactical.ts` | `/api/rooms/:roomId/tactical` | 战术状态 + Token CRUD   |
| `routes/chat.ts`     | `/api/rooms/:roomId/chat`     | 聊天消息 + 骰子         |
| `routes/assets.ts`   | `/api/rooms/:roomId/assets`   | 文件上传 + 素材管理     |
| `routes/trackers.ts` | `/api/rooms/:roomId/trackers` | 团队追踪器              |
| `routes/showcase.ts` | `/api/rooms/:roomId/showcase` | 展示材料                |
| `routes/state.ts`    | `/api/rooms/:roomId/state`    | 房间状态（活动场景等）  |

### 核心服务

| 文件                   | 职责                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `server/db.ts`         | SQLite 连接管理、`toCamel`/`parseJsonFields`/`toBoolFields` 命名转换 |
| `server/schema.ts`     | 13 张表的 DDL + 迁移（详见 data-model.md）                           |
| `server/ws.ts`         | Socket.io auth 中间件（当前仅验证 roomId）                           |
| `server/awareness.ts`  | 感知事件中继（cursor、token drag、presence）                         |
| `server/middleware.ts` | `withRole` 等 Express 中间件                                         |

## 部署拓扑

```
data/
├── global.db                          # 全局房间列表
└── rooms/
    ├── {roomId}/
    │   ├── room.db                    # 房间数据（13 张表，WAL 模式）
    │   └── uploads/                   # 用户上传的文件（图片/音频）
    └── {roomId2}/
        ├── room.db
        └── uploads/
```

- 每个房间完全隔离的 SQLite 数据库
- WAL 模式 + foreign_keys=ON
- 文件上传存储在房间目录下，删除资产时同步清理磁盘文件

## Socket.io 事件全景

### 数据广播事件（35 个）

服务端在 REST API 修改数据后，通过 `io.to(roomId).emit()` 广播。

| 命名空间          | 事件                                                 |
| ----------------- | ---------------------------------------------------- |
| `seat:`           | created, updated, deleted                            |
| `scene:`          | created, updated, deleted                            |
| `scene:entity:`   | linked, unlinked, updated                            |
| `entity:`         | created, updated, deleted                            |
| `tactical:`       | activated, updated                                   |
| `tactical:token:` | added, updated, removed                              |
| `archive:`        | created, updated, deleted                            |
| `chat:`           | new, retracted                                       |
| `showcase:`       | created, updated, deleted, pinned, unpinned, cleared |
| `tracker:`        | created, updated, deleted                            |
| `asset:`          | created, updated, deleted                            |
| `room:state:`     | updated                                              |

### 感知事件（6 个）

服务端中继，不持久化。客户端 → 服务端 → 同房间其他客户端。

| 事件                     | 用途               |
| ------------------------ | ------------------ |
| `awareness:update`       | 光标位置、在线状态 |
| `awareness:editing`      | 资源拖拽编辑中     |
| `awareness:clear`        | 资源拖拽结束       |
| `awareness:tokenDrag`    | Token 拖拽位置同步 |
| `awareness:tokenDragEnd` | Token 拖拽结束     |
| `awareness:remove`       | 客户端断开连接     |

## 安全限制（当前状态）

> ⚠️ **当前系统无身份鉴权**。Socket.io auth 只验证 roomId 存在，`withRole` 中间件读取 `X-MyVTT-Role` header 可被伪造。身份系统和权限隔离方案已设计（见 design/06、design/07），但尚未实现。

## 相关文档

- 数据模型详情 → [data-model.md](data-model.md)
- 状态管理详情 → [state-management.md](state-management.md)
- 战术系统详情 → [tactical-system.md](tactical-system.md)
- 规则插件详情 → [rule-plugin-system.md](rule-plugin-system.md)
