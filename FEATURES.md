# myVTT 功能文档

轻量级虚拟桌游（VTT），基于 tldraw v4 + Yjs + y-websocket 实现实时多人协作。

---

## 核心架构

### 技术栈
- **前端**: React 19 + TypeScript 5.9 + Vite 7.3
- **画布引擎**: tldraw v4.4.0（支持无限画布、形状工具、资源管理）
- **实时同步**: Yjs v13.6.29 + y-websocket v2.1.0（WebSocket + Awareness）
- **持久化**: y-leveldb v0.2.0（服务端 LevelDB 存储）
- **服务端**: Node.js 20 + Express 5 + WebSocket Server

### 数据流
```
客户端 A ←→ WebSocket ←→ y-websocket 服务器 ←→ WebSocket ←→ 客户端 B
                              ↓
                          LevelDB 持久化
```

---

## 已实现功能

### 1. 实时多人协作画布

**基础能力**
- ✅ 无限画布（平移、缩放、旋转）
- ✅ 多人实时同步（通过 Yjs CRDT）
- ✅ 自动持久化（服务器重启后数据不丢失）
- ✅ 所有 tldraw 内置形状工具：
  - 选择、手绘、矩形、椭圆、三角形、菱形、六边形
  - 箭头、线条、文本、便签、高亮、框选
  - 图片、视频上传

**同步机制**
- tldraw 画布状态 ↔ Yjs Y.Array 双向绑定（通过 y-utility/YKeyValue）
- 仅同步 `scope: 'document'` 记录（形状、资源），不同步瞬态状态

---

### 2. Token 属性系统

**功能描述**
为画布上的任意形状添加自由键值对元数据，用于记录 Token（角色、怪物、物品）的属性。

**核心功能**
- ✅ **Context Menu 集成**：右键任意形状 → "Edit Token Properties"
- ✅ **自由键值对**：无限制添加属性（例：`HP: 50`, `AC: 15`, `Speed: 30ft`）
- ✅ **增删改操作**：通过侧边栏 TokenPanel 编辑属性
- ✅ **数值调整**：支持 +/- 按钮快速调整数值（按住加速）
- ✅ **颜色标记**：每个属性可设置独立颜色（8 种预设色）

**技术实现**
- 属性存储在 `shape.meta.properties: Array<{key, value, color}>`
- 自动为新形状初始化空属性数组 + 名称字段

**UI 位置**: 右侧侧边栏（固定位置，z-index: 10000）

---

### 3. Token 画布叠加显示

**功能描述**
在画布上方叠加显示 Token 的关键属性，无需打开侧边栏即可查看。

**显示模式**
- ✅ **Name Label**：形状上方显示名称（白底黑字圆角矩形）
- ✅ **HP Bar**：水平血条（红底灰条，动态宽度）
  - 可拖拽调整数值（按住 Shift 每次 ±5）
  - 支持任意键值对作为 HP 源（优先 `HP`, `hp`, `Health`）
- ✅ **名称显示控制**：
  - `hidden`: 不显示名称
  - `label`: 仅显示 Label
  - `label+hp`: 显示 Label + 所有 HP 类属性条
- ✅ **智能定位**：
  - Label 渲染在形状边界内（避免遮挡）
  - HP Bar 自动检测遮挡，垂直堆叠
  - 每个 HP 属性使用独立颜色标识

**技术实现**
- 通过 `InFrontOfTheCanvas` 渲染在画布上层（不影响 tldraw 交互）
- `editor.pageToScreen()` 实时转换坐标
- `useValue()` 响应式监听形状变化

---

### 4. GM/玩家身份管理

**功能描述**
区分 GM（主持人）和 PL（玩家）身份，控制画布内容的可见性。

**核心功能**
- ✅ **座位系统（Seat）**：
  - 用户创建/加入座位（名称 + 角色 + 颜色）
  - 座位信息通过 Yjs Awareness 实时广播
  - 支持删除离线座位（右上角 x 按钮）
- ✅ **颜色唯一性**：
  - 8 种预设颜色（蓝、红、绿、橙、紫、粉、青、橘）
  - 已使用颜色变灰禁用，自动选择第一个可用颜色
- ✅ **形状可见性控制**：
  - GM 模式：看到所有形状
  - PL 模式：仅看到非隐藏形状
  - 通过 `editor.getShapeVisibility()` + atom 实现响应式隐藏

**UI 位置**
- 左上角座位选择器（固定位置，z-index: 10001）
- Awareness 广播：`{ seat: { id, name, role, color } }`

**未来扩展**: 战争迷雾（Fog of War）系统

---

### 5. 骰子投掷系统

**功能描述**
内置骰子表达式解析和投掷，结果实时同步到所有玩家。

**支持表达式**
- ✅ 标准骰子：`2d6`, `1d20`, `3d8+5`
- ✅ 优势/劣势：`2d20kh1`（优势），`2d20kl1`（劣势）
- ✅ 复杂表达式：`2d6+1d4+3`, `4d6dl1`（投 4 颗取最高 3 颗）
- ✅ 表达式化简：`3*d6` → `3d6`, `d20 + 5` → `1d20+5`

**日志记录**
- ✅ 完整投掷历史（Y.Array 同步）
- ✅ 显示内容：
  - 投掷者名称
  - 原始表达式 + 化简后表达式
  - 每个骰子的结果 + 总和
  - 时间戳
- ✅ 反序显示（最新在上）

**UI 位置**: 右侧边栏（固定位置，z-index: 10002）

**技术实现**
- 自定义骰子解析器（正则匹配 `NdM`, `kh`, `kl`, `dl`, `dh`）
- 投掷记录存储在 `yDoc.getArray('dice_log')`

---

### 6. 测量工具

**功能描述**
在画布上拖拽测量两点间的距离（以网格格数为单位）。

**核心功能**
- ✅ 测量模式：工具栏 → "Measure" 工具
- ✅ 实时显示：
  - 虚线线段（蓝色，4px 间距）
  - 中点圆形标签显示距离
  - 自动转换为网格单位（pageDistance / gridSize）
- ✅ 格式化：
  - 小于 10 格：显示一位小数（`5.3`）
  - 大于 10 格：四舍五入（`15`）
- ✅ 取消：按 Esc 或点击结束

**技术实现**
- 自定义 tldraw StateNode（`MeasureTool`）
- 状态机：`Idle → Measuring → Idle`
- SVG 叠加层渲染在画布外（`position: fixed`）

---

### 7. 多人光标同步

**功能描述**
实时显示所有其他玩家的鼠标位置和名称。

**核心功能**
- ✅ 光标位置广播（通过 Yjs Awareness）
- ✅ 彩色箭头指针 + 名称标签（使用座位颜色）
- ✅ 自动节流（requestAnimationFrame）
- ✅ 离开画布时清除光标

**技术实现**
- `awareness.setLocalStateField('cursor', { x, y })`
- SVG 渲染在画布外（`position: fixed`, z-index: 99996）
- `editor.pageToScreen()` 转换页面坐标到屏幕坐标

---

### 8. 资源上传与管理

**功能描述**
上传图片/视频资源到服务器，自动生成缩略图。

**核心功能**
- ✅ **拖拽上传**：直接拖拽文件到画布 → 自动上传并创建形状
- ✅ **服务端存储**：
  - 文件存储在 `server/uploads/` 目录
  - 随机 UUID 文件名（防冲突）
  - 返回相对 URL：`/uploads/{uuid}.{ext}`
- ✅ **Admin 管理页面**（`/admin`）：
  - 网格展示所有已上传资源
  - 显示缩略图 + 文件大小
  - 批量上传（多选文件）
  - 删除单个资源（DELETE `/api/uploads/{filename}`）

**API 端点**
- `POST /api/upload` — 上传文件（multipart/form-data）
- `DELETE /api/uploads/:filename` — 删除文件
- `GET /uploads/:filename` — 访问资源（静态文件服务）

**限制**: 单文件最大 50MB

---

### 9. 生产部署支持

**功能描述**
完整的生产环境部署方案，支持 Docker 和 VPS 部署。

**自动环境检测**
- ✅ **WebSocket URL**：
  - 开发环境：`ws://localhost:4444`
  - 生产环境：`ws(s)://{location.host}`（自动检测 HTTPS）
- ✅ **API URL**：
  - 开发环境：`http://localhost:4444`
  - 生产环境：同源（相对路径）

**单服务器架构**
- ✅ 单端口（4444）同时提供：
  - 前端静态文件（`dist/`）
  - WebSocket（Yjs 同步）
  - RESTful API（上传/删除）
  - SPA fallback（所有非 API 路由返回 `index.html`）

**Docker 支持**
- ✅ Multi-stage Dockerfile（构建 + 运行时分离）
- ✅ docker-compose.yml（命名卷持久化）
- ✅ .dockerignore（优化构建上下文）
- ✅ 数据持久化：
  - `vtt-data`：LevelDB 数据库
  - `vtt-uploads`：上传文件

**部署命令**
```bash
# 直接部署（VPS）
npm ci && npm run build && npm run start

# Docker 部署
docker compose up --build -d
```

**兼容性修复**
- ✅ `crypto.randomUUID()` polyfill（HTTP 非安全上下文降级）
- ✅ Express 5 兼容性（middleware SPA fallback）

---

## 技术细节

### tldraw 集成要点

**响应式陷阱**
- `editor.getSelectedShapes()` 和 `editor.getHoveredShapeId()` **不是响应式的**
- 必须用 `useValue('name', () => editor.getXxx(), [editor])` 包裹才能触发重渲染

**Y.Doc 生命周期**
- 在 `useState` 中创建（不是 `useEffect`），便于跨组件共享
- **不要**在 cleanup 中调用 `yDoc.destroy()`（生命周期由 useState 管理）

**InFrontOfTheCanvas 限制**
- 受 `.tl-canvas` 的 `contain: strict` CSS 影响
- `position: fixed` 在其内部不会相对 viewport 定位
- **解决方案**：叠加层渲染在 `<Tldraw>` 外部，传递 `editor` prop

### Yjs 同步架构

**两个独立同步通道**
1. **tldraw 画布状态**：`yDoc.getArray('tl_records')` + YKeyValue
2. **骰子日志**：`yDoc.getArray('dice_log')` + Y.Array.observe()

**Awareness 广播**
- 座位信息：`{ seat: { id, name, role, color } }`
- 光标位置：`{ cursor: { x, y } }`

### 安全注意事项
- 无认证/授权机制（所有用户平等访问）
- 无房间密码（ROOM_NAME 硬编码）
- 无数据加密（明文传输）
- 适用场景：**小范围私人游戏**，不推荐公开部署

---

## 未来规划

### Stage 6: 战争迷雾（Fog of War）
- [ ] GM 绘制可见区域
- [ ] PL 视野限制
- [ ] 动态照明系统

### Stage 7: 房间系统
- [ ] 多房间支持（URL 路由 `/room/:id`）
- [ ] 房间密码保护
- [ ] 房间列表页面

### 其他优化
- [ ] 移动端适配
- [ ] 离线编辑支持（本地持久化）
- [ ] 撤销/重做历史记录
- [ ] 音效支持（骰子音、提示音）
- [ ] 自定义骰子宏

---

## 开发与部署

### 开发环境
```bash
npm install
npm run dev          # 前端开发服务器（端口 5173）
npm run server       # 后端 WebSocket 服务器（端口 4444）
```

### 生产构建
```bash
npm run build        # 构建前端到 dist/
npm run start        # 启动生产服务器
```

### Docker 部署
```bash
docker compose up --build -d
```

### 环境变量
- `PORT`：服务器端口（默认 4444）
- `HOST`：监听地址（默认 0.0.0.0）
- `YPERSISTENCE`：LevelDB 数据目录（默认 `./db`）

---

**最后更新**: 2026-03-07
**当前版本**: Stage 5 完成（生产部署就绪）
