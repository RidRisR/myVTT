# 轻量化 tldraw VTT 技术架构文档

## 一、项目核心理念

- **轻量与极速**：以纯 2D 无限白板为核心，摒弃重度 WebGL 计算。
- **信任机制（防君子不防小人）**：放弃后端权限校验与数据阻断。所有状态全局同步，通过前端本地状态（Role: GM / PL）决定组件的渲染与隐藏。极大降低后端复杂度。
- **完全自托管**：后端仅作为"无脑"数据广播中心和图片静态资源服务器，可轻易部署在个人电脑或廉价云服务器上。

## 二、技术栈选型

### 前端 (Frontend)

- **核心框架**：React 18 + Vite + TypeScript
- **画布引擎**：@tldraw/tldraw v4
  - 注意：tldraw v4 使用自定义许可证，不提供 license key 时画布角落会显示 "Made with tldraw" 水印，功能不受影响
  - tldraw 官方同步方案已迁移至 `@tldraw/sync`，但 Yjs 集成仍然可用。本项目选择 Yjs，因为可以一套方案同步画布 + 聊天 + 骰子
- **本地状态管理**：zustand（存储当前用户身份、选中 Token 等，不参与网络同步）
- **UI 组件库**：Tailwind CSS / Radix UI

### 后端与数据同步 (Backend & Sync)

- **同步核心**：Yjs（基于 CRDT 的数据同步库）
- **网络传输**：y-websocket（Yjs 官方 WebSocket 实现）
- **数据持久化**：y-leveldb（LevelDB 持久化，防止服务器重启丢失数据）
- **后端服务**：Node.js + Express
  - 作用 1：挂载 y-websocket 服务 + LevelDB 持久化
  - 作用 2：提供图片上传接口和静态文件服务

### 部署 (Deployment)

- **服务器**：2G2C 云服务器（资源绰绰有余，整个项目运行约 100-150MB 内存）
- **HTTPS**：Nginx 反向代理 + Let's Encrypt 免费 SSL（需要域名）
- **访问控制**：URL 房间 ID + 密码（`?room=session1&pwd=xxx`），WebSocket 握手时验证

## 三、核心功能与技术实现方案

### 1. 实时同步架构

**实现**：参考 tldraw 官方的 yjs 集成示例。

**逻辑**：
- 前端实例化一个 Y.Doc，通过 y-websocket 连接到 Node 服务端。
- 通过 tldraw 提供的 useSync hook 或手动将 tldraw 的 store 与 Y.Doc 双向绑定。
- 结果：任何人在画布上的拖拽、画笔，都会在 10ms-50ms 内同步给所有人。

**持久化**：
```bash
# 最简方式：环境变量启用 LevelDB
HOST=0.0.0.0 PORT=1234 YPERSISTENCE=./db npx y-websocket
```
```js
// 或代码集成
const { LeveldbPersistence } = require('y-leveldb')
const persistence = new LeveldbPersistence('./db')
```

### 2. 用户身份与前端视图隔离 (GM vs PL)

**本地状态**：在前端用 Zustand 维护一个全局状态 usePlayerStore:

```typescript
interface PlayerState {
  role: 'GM' | 'PL';
  playerName: string;
  setRole: (role: 'GM' | 'PL') => void;
}
```

**UI 隔离**：在侧边栏加一个下拉菜单切换身份。所有敏感 UI（如"隐藏怪物"按钮、GM 专属笔记）仅当 `role === 'GM'` 时渲染。

### 3. 自定义跑团元素 (Custom Shapes)

利用 tldraw 的 Custom Shape API（ShapeUtil），扩展原有组件库。

#### A. 角色标记 (Token Shape)

**数据结构 (props/meta)**：

```typescript
{
  imgUrl: string;     // 头像地址
  hp: number;         // 当前血量
  maxHp: number;      // 最大血量
  name: string;       // 角色名
  isHidden: boolean;  // 是否对玩家隐藏 (GM 专用)
}
```

**渲染逻辑**：
- `isHidden === true` 且 `role === 'PL'`：返回 null（直接不渲染）
- `isHidden === true` 且 `role === 'GM'`：渲染 Token，增加 `opacity: 0.5` 和红色边框
- 血条组件：Shape 底部渲染进度条和加减血按钮，调用 `editor.updateShape()` 自动触发同步

#### B. 手动战争迷雾 (Fog Block Shape)

- **表现**：纯黑色矩形或多边形
- **作用**：GM 在开局时拖拽黑块盖住未探索区域
- **机制**：默认 locked，zIndex 置顶层。玩家开门时 GM 手动删除黑块
- **交互隔离**：PL 视角下，迷雾 Shape 设置 `pointerEvents: 'none'`，让点击穿透到下方地图/Token，防止框选等意外操作

### 4. 侧边栏：聊天与自动化掷骰

**机制隔离**：聊天记录不存入 tldraw 画布 store，而是存入 Yjs 中独立的 Y.Array。

**流程**：
1. 玩家点击侧边栏的【掷 1d20】按钮
2. 前端执行本地随机数计算：`Math.floor(Math.random() * 20) + 1`
3. 构造消息对象：`{ user: 'Alice', action: '1d20', result: 15, time: Date.now() }`
4. 将消息 push 到 Yjs 的 chatList 数组中
5. 所有人的侧边栏监听 chatList 变化，重新渲染聊天记录

**注意**：Y.Array 为 CRDT 结构，只增不减，但 VTT 场景增长很慢（约 100KB/session），一年内不会成为问题。长期可前端只渲染最近 500 条消息。

### 5. 媒体资产管理 (地图/Token 上传)

**拦截默认行为**：监听 tldraw 的 onAssetCreate 或拖拽事件。

**处理流程**：
1. GM 拖入本地图片到画布
2. 前端拦截文件，POST 到 Node 后端 `/upload` 接口
3. Node 后端保存文件至 `./public/uploads`，返回**相对路径** `/uploads/map.jpg`（前端拼接 `window.location.origin`，不写死 localhost）
4. 前端拿到 URL 后，调用 tldraw API 生成 Image Shape 或 Token Shape

**存储管理**：
- multer 限制上传大小（20MB）
- 可选：用 `sharp` 后端压缩大图

## 四、开发路线图 (Roadmap)

### Step 0: 技术验证 (1-2 天)
- 跑通 tldraw v4 + Yjs 最小多人同步 demo
- 验证 Custom Shape API (ShapeUtil) 在 v4 下的用法
- 确认 y-leveldb 持久化正常工作

### Step 1: 基础设施搭建 (1-2 天)
- 搭建 Vite + React 环境，引入 tldraw，跑通本地白板
- 搭建 Node 服务，集成 y-websocket + y-leveldb 持久化
- 实现多开浏览器窗口的实时多人作画
- 基本房间密码验证

### Step 2: 自定义跑团组件 (3-5 天)
- 阅读官方 Custom Shape 文档
- 实现 TokenShape（带头像、名称、血条）
- 实现点击 Token 扣血并在多端同步

### Step 3: 身份控制与迷雾 (2-3 天)
- 引入 Zustand，实现 GM/PL 身份切换
- TokenShape 内部 isHidden 判断逻辑
- 实现迷雾方块 + PL 视角 `pointerEvents: 'none'` 穿透

### Step 4: 侧边栏与骰子 (2-3 天)
- CSS Grid 分左右两栏（左 tldraw，右 Sidebar）
- 新建 Yjs Array，实现多人实时同步聊天框
- 掷骰子按钮 + 聊天框发送结果

### Step 5: 资产上传机制 (1-2 天)
- Node 后端 multer 处理图片上传（限制 20MB）
- 联调图片拖入画布流程
- 可选：sharp 图片压缩

### Step 6: 云部署 (1 天)
- Nginx + Let's Encrypt (HTTPS/WSS)
- 部署验证

## 五、潜在增强功能

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 网格 / 测距 | TTRPG 核心需求，tldraw 原生无 D&D 方格网格 | 高 |
| 先攻轮次追踪 | 战斗核心功能，侧边栏组件 | 中 |
| 玩家光标显示 | Yjs awareness 原生支持，实现成本低 | 中 |
| 多房间 / 多战役 | y-websocket 天然支持（不同 docName） | 中 |

## 六、已知风险

| 风险 | 缓解措施 |
|------|----------|
| tldraw-Yjs 绑定不再是官方主推 | Yjs 本身稳定，绑定层代码量小，可自行维护 |
| tldraw Custom Shape API 版本变动 | Step 0 技术验证时确认 |
| tldraw v4 许可证 | 水印不影响功能，必要时可申请免费 Hobby License |

## 七、关键参考资料

- tldraw 官方文档：https://tldraw.dev/
- Custom Shapes 教程：https://tldraw.dev/docs/shapes
- tldraw yjs example：https://github.com/tldraw/tldraw-yjs-example
- Yjs 核心文档：https://docs.yjs.dev/
- y-websocket：https://github.com/yjs/y-websocket
- y-leveldb：https://github.com/yjs/y-leveldb
- Zustand：https://github.com/pmndrs/zustand
