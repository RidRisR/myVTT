# myVTT — 轻量化 tldraw VTT 技术架构文档

## 一、项目核心理念

- **轻量与极速**：以 tldraw v4 无限白板为核心，纯 2D 渲染，无 WebGL 依赖
- **信任机制**：放弃后端权限校验，所有状态全局同步，通过前端本地角色状态（GM / PL）决定渲染与隐藏
- **完全自托管**：后端仅作为数据广播中心和静态资源服务器，可部署在任意 Node.js 环境

## 二、技术栈（已验证）

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2 | UI 框架 |
| Vite | 7.3 | 构建工具 |
| TypeScript | 5.9 | 类型安全 |
| tldraw | v4.4.0 | 画布引擎 |
| yjs | 13.6.29 | CRDT 实时同步 |
| y-websocket | 2.1.0 | WebSocket 传输层 |
| y-utility | 0.1.4 | YKeyValue 绑定 |

> **注意**：tldraw v4 使用自定义许可证，无 license key 时显示 "Made with tldraw" 水印，localhost 开发环境豁免

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 22+ | 运行时 |
| Express | 5.2 | HTTP 服务 |
| ws | — | WebSocket 服务 |
| multer | 2.1 | 文件上传 |
| y-leveldb | 0.2.0 | LevelDB 持久化 |

### 设计决策记录

| 原始方案 | 实际采用 | 原因 |
|----------|----------|------|
| zustand | tldraw `atom` | tldraw 内置响应式原语，无需额外依赖 |
| Tailwind CSS | 内联 style | 组件少，内联更直接 |
| Custom Shape (ShapeUtil) | `shape.meta` | 自由键值属性通过 meta 实现，避免 Shape API 复杂度 |
| raw http + 手写 multipart | Express + multer | 手写解析器浏览器兼容性差，multer 成熟可靠 |

## 三、系统架构

```
┌─────────────────────────────────────────────────────┐
│  浏览器 (localhost:5173)                              │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ <Tldraw>                                     │   │
│  │  ├─ store ← createTLStore({ assets })        │   │
│  │  ├─ getShapeVisibility (GM/PL 过滤)           │   │
│  │  ├─ PropertyContextMenu (右键属性菜单)         │   │
│  │  └─ PropertyOverlay (悬浮属性卡片)             │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐    │
│  │RoleSwitcher│ │DiceSidebar│ │ assetStore.upload│    │
│  └──────────┘ └──────────┘ └──────────────────┘    │
│       │              │               │              │
│       │         Y.Array              │              │
│       atom      ('dice_log')    fetch POST          │
│                      │               │              │
└──────────────────────┼───────────────┼──────────────┘
                       │               │
              WebSocket│          HTTP │
                       ▼               ▼
┌──────────────────────────────────────────────────────┐
│  服务器 (localhost:4444)                               │
│                                                      │
│  Express app                                         │
│  ├─ WebSocket: y-websocket (setupWSConnection)       │
│  ├─ POST /api/upload (multer → server/uploads/)      │
│  ├─ DELETE /api/uploads/:filename                    │
│  ├─ GET /uploads/* (express.static)                  │
│  ├─ GET /admin (资产管理页面)                          │
│  └─ LevelDB persistence (./db)                      │
└──────────────────────────────────────────────────────┘
```

### 数据同步流程

```
tldraw store ──listen()──> YKeyValue.set() ──> Y.Doc ──> WebSocket ──> 其他客户端
                                                              │
                                                         LevelDB (持久化)
```

- **tldraw → Yjs**：`store.listen({ source: 'user' })` 捕获本地操作，写入 YKeyValue
- **Yjs → tldraw**：`yStore.on('change')` 监听远程变更，调用 `store.mergeRemoteChanges()`
- **防循环**：`isSyncing` 标志位 + `transaction.local` 检查

## 四、文件结构

```
myVTT/
├── server/
│   ├── index.mjs          # Express + WebSocket + multer + 管理页面
│   └── uploads/            # 上传文件存储目录
├── src/
│   ├── main.tsx            # React 入口
│   ├── App.tsx             # 主组件：Tldraw + 各功能模块
│   ├── useYjsStore.ts      # Yjs ↔ tldraw 双向绑定 hook
│   ├── assetStore.ts        # TLAssetStore：图片上传到服务器
│   ├── roleState.ts         # atom<'GM'|'PL'> 全局角色状态
│   ├── RoleSwitcher.tsx     # GM/PL 切换下拉菜单
│   ├── PropertyContextMenu.tsx  # 右键菜单：添加属性、隐藏/显示
│   ├── PropertyOverlay.tsx  # 悬浮属性卡片（可编辑）
│   ├── DiceSidebar.tsx      # 骰子侧边栏
│   └── diceUtils.ts         # NdM 表达式解析 + 投骰逻辑
├── db/                      # LevelDB 持久化数据
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 五、核心功能实现

### 1. 实时同步 ✅

- Y.Doc 通过 y-websocket 连接服务器，自动广播变更
- YKeyValue 包装 Y.Array，提供 key-value 语义映射 tldraw record
- LevelDB 持久化所有 Y.Doc 更新，服务器重启不丢数据
- 同步延迟：10-50ms（局域网）

### 2. Token 属性系统 ✅

- 利用 tldraw 的 `shape.meta` 存储自由键值对
- 右键菜单添加/清除属性，自动通过 Yjs 同步
- 悬浮属性卡片支持点击编辑和删除单个属性
- 数据结构：`shape.meta.properties = [{ key, value }]`

### 3. GM/PL 身份控制 ✅

- `atom<'GM'|'PL'>('currentRole', 'GM')` 全局状态
- `getShapeVisibility(shape)` 回调：`shape.meta.gmOnly` + PL 角色 → `'hidden'`
- 隐藏的 shape 不渲染且不参与点击测试
- 右键菜单提供 "Hide from Players" / "Show to Players" 切换

### 4. 骰子系统 ✅

- 解析 NdM±X 格式（正则：`/^(\d*)d(\d+)([+-]\d+)?$/i`）
- 支持：`1d20`, `2d6+5`, `3d8-2`, `d20`（省略 1）
- 快捷按钮：d4, d6, d8, d10, d12, d20, d100
- 投骰结果通过 Y.Array(`dice_log`) 同步，所有人可见
- 日志显示：投骰人(GM/PL)、表达式、各骰结果、总计、时间

### 5. 图片上传 ✅

- tldraw `TLAssetStore` 接口：`upload()` POST 文件到服务器，`resolve()` 返回 URL
- Express + multer 处理上传，文件名 UUID 化，存储到 `server/uploads/`
- 静态文件服务：`express.static` + 长期缓存
- 管理页面 `GET /admin`：查看、上传、删除资产

### 6. 服务器 API

| 方法 | 路径 | 说明 |
|------|------|------|
| WS | `ws://host:4444` | y-websocket 同步 |
| POST | `/api/upload` | 上传文件（multipart/form-data） |
| DELETE | `/api/uploads/:filename` | 删除上传文件 |
| GET | `/uploads/*` | 静态文件服务 |
| GET | `/admin` | 资产管理页面 |

## 六、关键技术要点

### tldraw 响应式

- `editor.getSelectedShapes()` / `editor.getHoveredShapeId()` **不是**响应式的
- 必须用 `useValue('name', () => editor.getXxx(), [editor])` 包装才能触发组件更新

### Y.Doc 生命周期

- yDoc 在 `useState(() => new Y.Doc())` 中创建，可跨组件共享
- **不能**在 useEffect cleanup 中调用 `yDoc.destroy()`（StrictMode 双挂载会销毁共享 doc）
- 骰子日志用 `yDoc.getArray('dice_log')`，tldraw 数据用 `yDoc.getArray('tl_records')`

### UI 层级

- `InFrontOfTheCanvas` 组件渲染在 tldraw UI 层**下方**
- 需要浮于 tldraw 之上的 UI → 放在 `<Tldraw>` 外部，用 `position: fixed` + 高 z-index

### y-websocket 版本

- **必须用 v2**（v3 是纯客户端，服务器代码移至 `@y/websocket-server`，依赖 yjs v14 pre-release）
- 服务器端导入：`require('y-websocket/bin/utils')`

## 七、开发路线图

| Step | 内容 | 状态 |
|------|------|------|
| 0 | 技术验证：tldraw + Yjs 同步 + LevelDB 持久化 | ✅ 完成 |
| 1 | 基础设施：房间密码、相对图片 URL | ⬜ 待做 |
| 2 | Token 属性：shape.meta 键值对、右键菜单、悬浮编辑 | ✅ 完成 |
| 3 | GM/PL 身份：getShapeVisibility + atom 角色状态 | ✅ 完成 |
| 4 | 骰子系统：NdM 解析、侧边栏、Yjs 同步日志 | ✅ 完成 |
| 5 | 图片上传：express + multer、TLAssetStore、管理页面 | ✅ 完成 |
| 6 | 云部署：Nginx + HTTPS | ⬜ 待做 |

## 八、潜在增强功能

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 网格 / 测距 | TTRPG 核心需求，tldraw 原生无 D&D 方格网格 | 高 |
| 先攻轮次追踪 | 战斗核心功能，侧边栏组件 | 中 |
| 玩家光标显示 | Yjs awareness 原生支持 | 中 |
| 多房间 / 多战役 | y-websocket 不同 docName 即可 | 中 |
| 战争迷雾 | 黑色方块覆盖 + PL 视角 pointerEvents 穿透 | 中 |
| 房间密码 | WebSocket 握手时验证 `?room=xxx&pwd=xxx` | 低 |

## 九、参考资料

- tldraw 官方文档：https://tldraw.dev/
- Yjs 核心文档：https://docs.yjs.dev/
- y-websocket：https://github.com/yjs/y-websocket
- y-leveldb：https://github.com/yjs/y-leveldb
