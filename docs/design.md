# myVTT — 设计文档

## 一、核心理念

### 场景驱动，非画布驱动

myVTT 的核心体验是**场景氛围**，而非无限画布。

- **场景模式**（Scene Mode）：全屏场景图 + CSS `object-fit: cover`，营造沉浸氛围
- **战斗模式**（Combat Mode）：可缩放/拖拽的战术地图 + 棋子系统，类似 Owlbear Rodeo

早期版本基于 tldraw v4 无限白板，在开发过程中发现画布引擎过重：许可证限制、API 复杂度高、与自定义 UI 层冲突。重构后移除 tldraw，采用纯 HTML/CSS + `react-zoom-pan-pinch`，体积从 ~200KB+ 降至 ~8KB。

### 信任机制

不做后端权限校验。所有状态通过 Yjs CRDT 全局同步，GM/PL 角色仅在前端控制渲染与可见性。适用于朋友间信任场景。

### 完全自托管

后端仅作为：
1. Yjs 数据广播中心（y-websocket）
2. 文件存储服务（Express + multer）
3. 持久化层（y-leveldb → LevelDB）

可部署在任意 Node.js 环境或 Docker 容器。

---

## 二、技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2 | UI 框架 |
| Vite | 7.3 | 构建工具 |
| TypeScript | 5.9 | 类型安全 |
| Yjs | 13.6.29 | CRDT 实时同步 |
| y-websocket | 2.1.0 | WebSocket 传输层 |
| react-zoom-pan-pinch | 3.7.0 | 战斗模式缩放/拖拽 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 22+ | 运行时 |
| Express | 5.2 | HTTP 服务 |
| ws | — | WebSocket 服务 |
| multer | 2.1 | 文件上传 |
| y-leveldb | 0.2.0 | LevelDB 持久化 |

### 设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 画布引擎 | 纯 HTML/CSS + react-zoom-pan-pinch | tldraw 过重，许可证限制，与自定义 UI 冲突 |
| 状态管理 | useSyncExternalStore | 轻量，无外部依赖 |
| CSS 方案 | 内联 style | 组件少，直接；dark glass 主题统一 |
| Token 数据 | 独立 Y.Map('combat_tokens') | 脱离画布 shape，独立 CRUD |
| 棋子库 | Y.Map('token_blueprints') | 上传一次，多次生成，持久化 |

---

## 三、系统架构

```
┌───────────────────────────────────────────────────────┐
│  浏览器 (localhost:5173)                               │
│                                                       │
│  ┌─ App.tsx ─────────────────────────────────────┐    │
│  │                                               │    │
│  │  [scene mode]     [combat mode]               │    │
│  │  SceneViewer      CombatViewer                │    │
│  │  (全屏 <img>)      (TransformWrapper)          │    │
│  │                     ├─ CombatMap (背景+网格)    │    │
│  │                     └─ TokenLayer (棋子拖拽)    │    │
│  │                                               │    │
│  │  ┌────────────┐  ┌──────────┐  ┌──────────┐  │    │
│  │  │PortraitBar │  │ChatPanel │  │BottomDock│  │    │
│  │  │(角色肖像)   │  │(骰子聊天) │  │(素材库)   │  │    │
│  │  └────────────┘  └──────────┘  └──────────┘  │    │
│  │  ┌──────────────┐ ┌─────────────────────┐    │    │
│  │  │MyCharacterCard│ │CharacterDetailPanel │    │    │
│  │  │(我的角色卡)    │ │(查看他人角色)         │    │    │
│  │  └──────────────┘ └─────────────────────┘    │    │
│  └───────────────────────────────────────────────┘    │
│       │                    │                          │
│    Y.Map / Y.Array     fetch POST                     │
│       │                    │                          │
└───────┼────────────────────┼──────────────────────────┘
        │                    │
     WebSocket          HTTP │
        ▼                    ▼
┌───────────────────────────────────────────────────────┐
│  服务器 (localhost:4444)                               │
│                                                       │
│  Express app                                          │
│  ├─ WebSocket: y-websocket (setupWSConnection)        │
│  ├─ POST /api/upload (multer → server/uploads/)       │
│  ├─ DELETE /api/uploads/:filename                     │
│  ├─ GET /uploads/* (express.static)                   │
│  ├─ GET /admin (资产管理页面)                           │
│  └─ LevelDB persistence (./db)                        │
└───────────────────────────────────────────────────────┘
```

---

## 四、Yjs 数据模型

```
yDoc
├── getMap('room')              # 房间全局状态
│   ├── mode: 'scene' | 'combat'
│   ├── activeSceneId: string   # 场景模式当前场景
│   └── combatSceneId: string   # 战斗模式当前地图
│
├── getMap('scenes')            # 场景库 (keyed by scene ID)
│   └── [sceneId]: {
│         name, imageUrl, width, height,
│         gridSize, gridVisible, gridColor,
│         gridOffsetX, gridOffsetY, sortOrder
│       }
│
├── getMap('combat_tokens')     # 战斗棋子实例 (keyed by token ID)
│   └── [tokenId]: {
│         name, imageUrl, x, y, size,
│         ownerId, gmOnly, color,
│         resources, attributes, statuses, notes
│       }
│
├── getMap('token_blueprints')  # 棋子模板库 (上传一次，多次生成)
│   └── [bpId]: { name, imageUrl, defaultSize, defaultColor }
│
├── getArray('chat_log')        # 聊天/骰子日志
│
└── getMap('players')           # 座位/身份系统
    └── [seatId]: {
          name, color, role, portraitUrl,
          resources, attributes, statuses,
          notes, handouts, favorites
        }
```

---

## 五、双模式设计

### 场景模式 (Scene Mode)

- 全屏 `<img>` + CSS `object-fit: cover`
- GM 通过 GmToolbar 切换场景
- 用于叙事、探索、非战斗场景
- 未来可加入场景切换过渡动画

### 战斗模式 (Combat Mode)

- `react-zoom-pan-pinch` 的 `TransformWrapper` 提供缩放/拖拽
- 地图背景 + 可选 SVG 网格叠加层
- 棋子绝对定位在地图像素坐标系
- 拖拽棋子：pointer events → screenToMap 坐标转换 → 网格吸附 → Yjs 写入
- 拖拽期间仅更新本地 React state（60fps），pointerUp 时才写入 Yjs
- GM 可见 gmOnly 棋子（50% 透明），PL 完全不可见

#### 坐标系

- 棋子 `x, y` 是**地图像素坐标**（与 scene.width/height 同一空间）
- TransformComponent 内部自动缩放/平移
- Screen → Map 转换：`mapX = (screenX - wrapperRect.left - positionX) / scale`
- 网格吸附：`snappedX = Math.round((mapX - gridOffsetX) / gridSize) * gridSize + gridOffsetX`

#### 拖拽与缩放冲突

- 棋子 DOM 元素添加 `className="combat-token"`
- `TransformWrapper` 配置 `panning={{ excluded: ['combat-token'] }}`
- 拖拽棋子时不触发画面平移

---

## 六、身份系统

### 座位认领 (Seat Claiming)

- 身份存在 Yjs 中（`Y.Map('players')`），持久化到 LevelDB，不依赖浏览器
- 进入时显示 SeatSelect 界面：认领已有座位或创建新座位
- 每个座位有角色（GM/PL）、名字、颜色、头像
- localStorage 缓存 seatId，下次自动入座
- Yjs awareness 广播在线状态

### 角色卡 (Character Card)

5 分区结构：

| 区域 | 数据类型 | 交互 |
|------|----------|------|
| Resources | `{ key, current, max, color }` | 血条 + 加减按钮（hold-to-repeat） |
| Attributes | `{ key, value }` | 数值 + 加减按钮 |
| Statuses | `{ label }` | 彩色标签，点击删除 |
| Notes | `string` | 自由文本 |
| Handouts | `{ id, title, imageUrl?, description }` | 可分享卡片（法术卡、能力卡等） |

---

## 七、素材库 (Bottom Dock)

受 Owlbear Rodeo 启发，底部浮动控件栏。GM 专属，战斗模式可见。

### 结构

```
[展开内容区]  ← 缩略图网格，最大高度 220px，可滚动
[Maps] [Tokens] [Delete] [Visibility]  ← 标签栏 + 操作按钮
```

- **Maps 标签**：场景缩略图网格，点击切换战斗地图，上传新地图
- **Tokens 标签**：棋子模板库（圆形缩略图），点击生成棋子实例，上传新模板
- **操作按钮**：选中棋子时显示 Delete 和 Visibility 切换

### 棋子模板 (TokenBlueprint)

上传一次图片 → 保存为模板 → 之后点击即可生成新棋子实例。
模板持久化在 `Y.Map('token_blueprints')`，跨页面刷新不丢失。

---

## 八、UI 风格

### Dark Glass 主题

统一的视觉风格：

```css
background: rgba(15, 15, 25, 0.92);
backdrop-filter: blur(16px);
border: 1px solid rgba(255, 255, 255, 0.08);
border-radius: 12px;
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
color: rgba(255, 255, 255, 0.87);
font-family: sans-serif;
```

### 交互规范

- **Hover 反馈**：border-color / box-shadow 变化，0.15s transition
- **激活状态**：蓝色高亮 (`#3b82f6`)
- **危险操作**：红色 (`#f87171`)
- **GM 专属**：黄色 (`#fbbf24`)
- **层级**：所有浮动 UI 使用 `position: fixed` + z-index 10000+
- **点击外部关闭**：document pointerdown 监听，检查 contains

### 布局

```
┌──────────────────────────────────────────────┐
│ [☰]           [👤 👤 👤 👤]                    │ ← 汉堡菜单 + 肖像栏
│                                              │
│ [角色卡]                     [角色详情]        │ ← 左侧自己，右侧查看他人
│ (可折叠)                     (点击肖像打开)     │
│                                              │
│              [场景/战斗地图]                    │ ← 主内容区
│                                              │
│                                   [聊天面板]   │ ← 右下角
│                                   (可折叠)     │
│                                              │
│         [Maps] [Tokens] [Actions]            │ ← 底部 Dock（GM 战斗模式）
└──────────────────────────────────────────────┘
```

---

## 九、服务器 API

| 方法 | 路径 | 说明 |
|------|------|------|
| WS | `ws://host:4444` | y-websocket 同步 |
| POST | `/api/upload` | 上传文件（multipart/form-data） |
| DELETE | `/api/uploads/:filename` | 删除上传文件 |
| GET | `/uploads/*` | 静态文件服务 |
| GET | `/admin` | 资产管理页面 |

服务器是**数据无关**的：它只转发 Yjs 更新，不理解数据结构。数据结构完全由客户端定义。

---

## 十、关键技术要点

### y-websocket 版本

- **必须用 v2**：v3 是纯客户端，服务器代码移至 `@y/websocket-server`（依赖 yjs v14 pre-release，与 yjs v13 冲突）
- 服务器端导入：`require('y-websocket/bin/utils')`

### ESM/CJS 兼容

- 项目使用 `"type": "module"`
- 服务器用 `createRequire(import.meta.url)` 加载 CJS 模块
- `ws` 包默认导出是 WebSocket class，用 `ws.Server` 而非 `WebSocketServer`

### Y.Doc 生命周期

- yDoc 在 `useState(() => new Y.Doc())` 中创建，可跨组件共享
- **不能**在 useEffect cleanup 中调用 `yDoc.destroy()`（StrictMode 双挂载会销毁共享 doc）

### 聊天 @key 引用

- 聊天输入支持 `@key` 语法引用角色属性值
- 属性来源：当前座位的 resources + attributes + 选中棋子的 resources + attributes
- 后者覆盖前者（同名属性棋子优先）

---

## 十一、未来增强

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 场景过渡动画 | CSS crossfade 切换场景 | 中 |
| 测距工具 | pointer-event 画线 + 距离显示 | 中 |
| 光标同步 | awareness 实时鼠标位置 | 低 |
| 棋子上下文菜单 | 右键编辑/删除/复制 | 中 |
| 先攻追踪 | 战斗回合管理 | 中 |
| 战争迷雾 | 可见区域控制 | 低 |
| 键盘快捷键 | Esc 取消选中，M 测距 | 低 |
| 移动端适配 | 触控手势 | 低 |
| 云部署 | Nginx + HTTPS + Docker | 高 |
