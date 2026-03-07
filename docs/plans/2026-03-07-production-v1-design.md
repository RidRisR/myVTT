# myVTT 正式版 V1 — 设计文档

## Context

myVTT 已完成技术验证（tldraw v4 + Yjs 同步 + LevelDB 持久化）和核心功能原型（token 属性、GM/PL 身份、骰子系统、图片上传）。现需要：
1. 建立用户身份系统（座位认领）
2. 将属性编辑从悬浮卡片升级为侧边栏面板
3. 补充线上跑团必需的功能（测距、光标、骰子预设）
4. 完成基础设施改造，使项目可通过 Docker 部署到公网

**目标使用场景**：多系统通用线上跑团（Internet），朋友间信任使用。
**暂不实现**：战争迷雾、网格、先攻追踪、多房间、模板系统、事件溯源、权限控制。

---

## 架构总览

```
┌────────────────────────┬───────────────┐
│                        │  Token 面板    │ ← 选中 token 时显示
│                        │  骷髅兵        │
│   画板 (tldraw)         │  HP: 15/30   │
│   纯地图：token 移动、   │  AC: 13      │
│   测距、光标            │  [投骰] [扣血] │
│                        ├───────────────┤
│                        │  共享计数器    │
│                        │  恐惧: 3 [+][-]│
│                        ├───────────────┤
│                        │  骰子日志      │ ← 始终显示
│                        │  小明: 2d12   │
│                        │  Hope > Fear  │
└────────────────────────┴───────────────┘
```

画板（tldraw）是纯地图工具，不含任何游戏规则。所有规则相关的交互在右侧面板中完成。

### Y.Doc 数据结构

```
yDoc
├── getArray('tl_records')    ← tldraw shapes + meta（现有）
├── getArray('dice_log')      ← 骰子日志（现有）
├── getMap('players')         ← 座位/用户身份（新增）
├── getMap('counters')        ← 共享计数器（新增）
└── getMap('settings')        ← 比例尺等设置（新增）
```

---

## 功能 0：用户身份（座位认领）

### 设计

身份是战役数据的一部分，存在 Yjs 中（不依赖浏览器）。玩家连接后从座位列表中认领身份。

**存储**：`yDoc.getMap('players')`

```typescript
interface Seat {
  id: string          // crypto.randomUUID()
  name: string        // '小明'
  color: string       // '#3b82f6'
  role: 'GM' | 'PL'
}
```

**进入流程**：
```
连接到房间
    │
    ├─ localStorage 有上次的 seatId？
    │     ├─ 该 seat 没被占 → 自动入座
    │     └─ 被占了 → 显示选择界面
    │
    └─ 没有缓存 → 显示选择界面
          ├─ 认领已有身份（「我是小明」）
          └─ 创建新身份（输入名字、选颜色、选角色）
```

- 入座后，通过 Yjs awareness 广播 `{ seatId, name, color }` 给其他客户端
- localStorage 缓存 seatId，下次自动入座
- 换浏览器/清缓存 → 重新认领，数据不丢（存在 Yjs 服务器上）
- 信任机制：不做权限控制，任何人可以认领任何座位（包括 GM）

**对现有系统的改造**：
- `roleState.ts` 中的 `atom<'GM'|'PL'>` 改为从已认领 seat 读取，不再手动切换
- `RoleSwitcher.tsx` 替换为座位选择/显示组件
- 骰子日志显示玩家名字（"小明投了 2d12"）而不是角色（"GM"/"PL"）
- 玩家光标使用 seat 的颜色和名字

**新增文件**：
- `src/identity/SeatSelect.tsx` — 座位选择/创建界面
- `src/identity/useIdentity.ts` — 身份管理 hook（认领、awareness 广播、localStorage 缓存）

**修改文件**：
- `src/roleState.ts` — 数据来源从本地切换改为 seat
- `src/RoleSwitcher.tsx` — 重构为身份显示组件
- `src/DiceSidebar.tsx` — 日志显示玩家名字
- `src/App.tsx` — 入座前显示 SeatSelect，入座后显示主界面

---

## 功能 1：Token 面板

### 设计

将现有的 PropertyOverlay（悬浮属性卡片）升级为右侧边栏面板。

**Token 数据继续存在 shape.meta 中**（V1 最简方案）：

```
tldraw Shape
├─ x, y, rotation, 图片 URL    ← tldraw 管理
├─ meta.name: string           ← token 名称（新增，存在即为 token）
├─ meta.properties: [{key, value}, ...]  ← 游戏数据（现有结构不变）
└─ meta.gmOnly: boolean        ← GM/PL 可见性（现有）
```

**判定规则**：`shape.meta.name` 存在 → 是 token → 选中时显示面板

**Token 生命周期**：
- 创建：拖入图片 → 右键「创建 Token」→ 输入名字 → 写入 `meta.name`
- 复制：右键 →「复制 Token」→ 新 shape 拷贝 meta（名字加 " 副本"）
- 删除：删 shape → meta 随之消失 → 无需额外清理

**面板交互**：
- 选中 token → 面板显示名称和属性（可编辑）
- 选中非 token shape 或取消选中 → 面板显示空态
- 属性增删改同现有 PropertyOverlay 功能

**新增文件**：
- `src/panel/TokenPanel.tsx` — token 面板组件

**修改文件**：
- `src/App.tsx` — 布局调整，集成 TokenPanel
- `src/PropertyContextMenu.tsx` — 重构菜单项（创建 Token、复制 Token、GM 隐藏）

**废弃**：
- `src/PropertyOverlay.tsx` — 功能合并到 TokenPanel

---

## 功能 2：骰子预设与共享计数器

### 2a. 骰子预设

扩展现有骰子系统，支持可配置的投骰模板（如 Daggerheart 的 Hope/Fear 双 d12）。

```typescript
interface DicePreset {
  name: string
  dice: Array<{ id: string; sides: number; color: string }>
  outcomes: Array<{
    when: string        // 'hope > fear'
    label: string       // 'Fear'
    effect: 'notify' | 'increment_counter' | 'decrement_counter'
    counter?: string    // 'fear_tokens'
  }>
}
```

V1 硬编码常用预设（通用 NdM、Daggerheart），后续可做 UI 编辑器。

**交互**：选择预设 → 投骰 → 自动判定结果 → 触发 effect（通知或操作计数器）

**修改文件**：
- `src/diceUtils.ts` — 扩展支持多骰模板
- `src/DiceSidebar.tsx` — 增加预设选择 UI + 结果判定 + 显示玩家名字

### 2b. 共享计数器

全局可见的计数器（如恐惧标记），通过 Yjs 同步。

**存储**：`yDoc.getMap('counters')` → `{ 'fear_tokens': 3, 'round': 5 }`

**交互**：
- 显示在右侧面板中
- 手动 +/- 按钮 + 骰子预设自动增减

**新增文件**：
- `src/panel/CounterBar.tsx` — 计数器组件

---

## 功能 3：测距工具

自定义 tldraw tool，拖拽两点显示距离。

**技术方案**：
- `MeasureTool extends StateNode`，含 `Idle` 和 `Measuring` 子状态
- 测量数据存在 tldraw `atom` 中
- 通过 `InFrontOfTheCanvas` 渲染虚线 + 距离标签
- 距离 = 像素距离 ÷ 比例尺（比例尺存储在 `yDoc.getMap('settings')`）

**交互**：
1. 点击工具栏「测距」→ 光标变十字准星
2. 按住拖拽 → 显示虚线 + 实时距离
3. 松开 → 结果保持显示
4. Esc 或切换工具 → 清除

**新增文件**：
- `src/tools/MeasureTool.ts`
- `src/tools/MeasureOverlay.tsx`
- `src/tools/measureState.ts`

**修改文件**：
- `src/App.tsx` — 注册 MeasureTool

---

## 功能 4：玩家光标显示

使用 Yjs awareness 协议实时同步鼠标位置。

**技术方案**：
- 从 `useYjsStore` 导出 awareness
- `useCursors` hook：上报本地光标 + 监听远程光标
- 使用 seat 的颜色渲染光标

**新增文件**：
- `src/cursors/useCursors.ts`
- `src/cursors/CursorOverlay.tsx`

**修改文件**：
- `src/useYjsStore.ts` — 导出 awareness
- `src/App.tsx` — 集成 CursorOverlay

---

## 功能 5：基础设施改造

### 5a. URL 环境化

```typescript
const WS_URL = import.meta.env.VITE_WS_URL ||
  `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
const API_URL = import.meta.env.VITE_API_URL || ''
```

**修改文件**：`src/useYjsStore.ts`, `src/assetStore.ts`
**新增文件**：`.env`, `.env.production`

### 5b. 生产模式单服务器

Express serve 前端静态文件 + WebSocket + API。

**修改文件**：`server/index.mjs`, `package.json`

### 5c. Docker 部署

多阶段构建：Node build → Node runtime，单容器 + 持久化 volume。

**新增文件**：`Dockerfile`, `docker-compose.yml`, `.dockerignore`

---

## 架构决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 用户身份 | 座位认领（Yjs 持久化） | 不依赖浏览器，换设备可重新认领，无需账号系统 |
| GM/PL 角色 | 绑定在座位上 | 替代本地手动切换，更自然 |
| 权限控制 | V1 不做 | 信任机制，任何人可认领任何座位 |
| Token 数据存储 | shape.meta | 最简单，一对一，删除自动级联，将来可迁移到独立 Y.Map |
| 事件溯源 | V1 不做 | 并发冲突在朋友间跑团中极少发生 |
| 图层系统 | V1 不做 | 底层能力（gmOnly + isLocked）已具备，交互层后续讨论 |
| 角色模板 | V1 不做 | 「复制 Token」覆盖多数场景 |
| ECS 规则引擎 | 不采纳 | 过度工程，用骰子预设 + 计数器替代 |

---

## 实现顺序

### Phase 1：身份与面板（架构基础）
1. 用户身份 — 座位认领 + awareness 广播 + localStorage 缓存
2. TokenPanel — 右侧边栏，显示选中 token 的属性
3. 右键菜单重构 — 创建 Token、复制 Token、GM 隐藏
4. 废弃 PropertyOverlay — 功能合并到面板
5. 共享计数器 — CounterBar + Y.Map('counters')
6. 骰子预设 — 扩展 DiceSidebar 支持多骰模板 + 显示玩家名

### Phase 2：画板增强
7. 测距工具 — MeasureTool + MeasureOverlay
8. 玩家光标 — awareness + CursorOverlay（复用 seat 颜色）

### Phase 3：部署
9. URL 环境化 — .env + import.meta.env
10. 生产模式 — Express serve 静态文件
11. Docker — Dockerfile + docker-compose

---

## 验证计划

### 身份系统
1. 首次进入 → 显示座位选择 → 创建新身份 → 进入主界面
2. 刷新页面 → 自动入座（localStorage 缓存）
3. 换浏览器 → 显示座位选择 → 认领已有身份 → 数据完整
4. 两人同时在线 → 各自有独立座位 → awareness 广播正常

### 面板体系
5. 拖入图片 → 右键「创建 Token」→ 输入名字 → 面板显示 token 信息
6. 点击 token → 面板加载属性 → 编辑 → 其他客户端同步看到
7. 右键「复制 Token」→ 新 token 有独立属性
8. 删除 token → 数据自动消失
9. 点击非 token shape → 面板不显示

### 骰子预设
10. 选择 Daggerheart 预设 → 投骰 → 自动判定 Hope/Fear → 恐惧计数器自动 +1
11. 骰子日志显示"小明投了 2d12"

### 测距工具
12. 选择测距 → 拖拽两点 → 显示距离 → 修改比例尺 → 距离值更新

### 玩家光标
13. 两个浏览器标签 → 移动鼠标 → 对方看到带 seat 颜色的光标

### 部署
14. `docker-compose up --build` → 访问 `http://localhost:4444` → 功能正常
15. 容器重启 → 数据不丢失（座位、token、计数器、骰子日志）

### 回归测试
16. 画布同步、GM/PL 可见性、骰子日志 — 现有功能不受影响
