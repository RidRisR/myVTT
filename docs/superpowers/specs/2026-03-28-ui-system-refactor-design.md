# UI 系统重构设计 Spec

> 日期：2026-03-28
>
> 探索记录：[`docs/archive/exploration-2026-03/plugin-system/ui/06-UI系统重构架构决策.md`](../../archive/exploration-2026-03/plugin-system/ui/06-UI系统重构架构决策.md)

---

## 一、目标

将 myVTT 的 UI 从 App.tsx 硬编码布局，重构为**插件注册 UI + 用户决定布局**的架构。

### 核心理念

- 插件声明"我有什么"，不声明"我在哪里"
- GM 通过编辑模式自由编排面板布局
- 每个 UI 组件严格在自己的容器内工作，不影响外部

### 不在范围内

- Canvas 级效果（Token 光环、攻击动画、地图装饰）— 推后续版本
- 战术画布底层库更换 — V1 保持 react-konva
- 第三方插件动态加载运行时 — V1 仍为预编译，架构为未来动态加载预留
- 玩家自定义布局 — V1 仅 GM 控制，后续渐进增强
- `sdk.events`（非日志事件总线）— V1 无明确使用场景，YAGNI

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────┐
│  Plugin Layer                                           │
│  onActivate(sdk) → registerComponent / registerLayer    │
│                  → contributeToSlot                     │
│                  → sdk.log.subscribe('*.attack', cb)    │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  Registry Layer                                         │
│  UIRegistry        SlotRegistry       LogStreamDispatcher│
│  (组件/层定义)     (碎片贡献)        (日志广播+订阅)     │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  Layout Layer                                           │
│  RoomLayoutConfig { narrative, tactical }                │
│  存储: room.db    同步: REST + Socket.io                 │
│  按需面板位置: localStorage                              │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  Render Layer                                           │
│  LayerRenderer     PanelRenderer      SlotRenderer      │
│                    (容器壳自动注入                       │
│                     @scope + contain:                    │
│                     layout paint)                        │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  Core (不可插件化)                                       │
│  SceneViewer       TacticalPanel + KonvaMap              │
└─────────────────────────────────────────────────────────┘
```

### 四层职责

| 层 | 职责 | 关键特征 |
|---|---|---|
| **Plugin Layer** | 插件只和 SDK 交互 | 不感知布局和渲染细节 |
| **Registry Layer** | 纯数据注册表 | 不做渲染，不持有 React 状态 |
| **Layout Layer** | 布局数据（位置、尺寸、z-order、可见性） | GM 编辑模式操作的目标 |
| **Render Layer** | 根据 Registry + Layout 实际渲染 | 统一注入隔离壳 |

---

## 三、V1 注册原语

### 3.1 三类注册原语

| 类别 | 特征 | 例子 |
|---|---|---|
| **Panel（容器型）** | 有位置/尺寸，插件控制内部渲染 | 角色卡、聊天面板、骰子面板 |
| **Layer（图层型）** | 全屏/画布级，按层叠顺序排列 | 粒子效果、天气、全屏公告 |
| **碎片型贡献（Slot）** | 嵌入宿主 UI 的小块内容，宿主控制位置和渲染 | 右键菜单项、工具栏按钮 |

### 3.2 布局面板 vs 按需面板

**用同一套 Panel 系统**，区别仅在显示策略：

| | 布局面板 | 按需面板 |
|---|---|---|
| 谁控制出现 | GM 在编辑模式放置 | 代码调用 `sdk.ui.openPanel()` |
| 初始状态 | 在 LayoutConfig 中，`visible: true` | 不在 LayoutConfig 中，打开时动态添加 |
| 位置 | LayoutConfig 里的固定坐标 | 首次居中或靠近触发元素；之后记忆上次位置 |
| 位置持久化 | 服务端（GM 配置） | 客户端 localStorage（用户偏好） |

GM 可以在编辑模式中把按需面板固定到布局中，使其变成常驻面板。

### 3.3 Z-ordering：type 分组 + 组内用户排序

- 注册时声明 `type`（如 `'background'` < `'panel'` < `'overlay'`）
- 同 type 内的 z-order 由 GM 在编辑模式中控制
- 系统 UI 无特权 — Toast、Modal 只是注册在 `overlay` type 的普通组件

### 3.4 布局按模式绑定

```typescript
interface RoomLayoutConfig {
  narrative: LayoutConfig   // 叙事模式
  tactical: LayoutConfig    // 战术模式
}
```

切换叙事↔战术时，自动切换对应的 LayoutConfig。与当前 `selectIsTactical` 逻辑对齐。

---

## 四、Registry Layer

### 4.1 UIRegistry

扩展现有 `src/ui-system/registry.ts`：

```typescript
class UIRegistry {
  // 已有
  registerComponent(def: ComponentDef): void
  getComponent(id: string): ComponentDef | undefined
  registerLayer(def: LayerDef): void
  getLayers(): LayerDef[]

  // 新增
  listComponents(): ComponentDef[]
  listComponentsByType(type: PanelType): ComponentDef[]
}
```

`ComponentDef` 扩展：

```typescript
interface ComponentDef {
  id: string
  component: React.ComponentType<ComponentProps>
  type: 'background' | 'panel' | 'overlay'   // z-order 分组
  defaultSize: { width: number; height: number }
  minSize?: { width: number; height: number }
}
```

### 4.2 SlotRegistry

新增。处理静态 UI 碎片贡献（不处理日志渲染——日志走 Dispatcher）：

```typescript
class SlotRegistry {
  contribute(slotId: string, contribution: SlotContribution): void
  getContributions(slotId: string): SlotContribution[]
}

interface SlotContribution {
  pluginId: string
  component: React.ComponentType
  priority?: number
}
```

两个 Registry 都是纯数据结构，不做渲染，不持有 React 状态。

---

## 五、Render Layer — 隔离容器

### 5.1 PanelRenderer 容器壳

每个面板自动注入隔离：

```tsx
<div
  className="plugin-panel"
  data-plugin={pluginId}
  data-type={def.type}
  style={{
    position: 'absolute',
    left: entry.x, top: entry.y,
    width: entry.width, height: entry.height,
    contain: 'layout paint',
    zIndex: entry.zOrder,
  }}
>
  <PanelErrorBoundary panelId={instanceKey}>
    <PanelComponent sdk={sdk} />
  </PanelErrorBoundary>
  {layoutMode === 'edit' && <DragHandle ... />}
</div>
```

### 5.2 隔离能力

| 属性 | 防御目标 | 效果 |
|---|---|---|
| `contain: layout` | 布局逃逸 + z-index 泄漏 | 创建 stacking context + containing block |
| `contain: paint` | 视觉溢出 | 超出容器的内容被裁剪 |
| `data-plugin` | CSS 样式溢出 | 配合 `@scope` 限制插件 CSS 作用域 |
| `PanelErrorBoundary` | JS 崩溃传播 | 单面板错误不影响全局 |

### 5.3 CSS 隔离实现

**V1（第一方插件）：** 插件直接使用宿主的 Tailwind + 设计 token（`bg-glass`、`text-primary`），无自定义 CSS。`contain: layout paint` 在容器上直接生效。无需 CSS 注入/包裹。

**未来（动态加载第三方插件）：** 宿主加载器自动包裹插件 CSS：

```typescript
function injectPluginCSS(pluginId: string, cssString: string) {
  const style = document.createElement('style')
  style.dataset.plugin = pluginId
  style.textContent = `@scope (.plugin-panel[data-plugin="${pluginId}"]) {
    ${cssString}
  }`
  document.head.appendChild(style)
}
```

纯字符串拼接，不需要 CSS 解析或正则替换。配合 CSS Layers 控制优先级：

```css
@layer plugin { /* 插件样式，低优先级 */ }
@layer host   { /* 宿主样式，高优先级 */ }
```

### 5.4 已知限制与缓解

| 限制 | 影响 | 缓解方案 |
|---|---|---|
| `@keyframes` 名称不被 `@scope` 隔离 | 跨插件动画名冲突 | V1：命名约定；未来：加载器自动加前缀 |
| `contain: layout` 使 `position: fixed` 相对于容器 | 插件不能用 fixed 定位到 viewport | SDK 提供覆盖层原语；现有 Radix Portal 天然逃逸容器 |
| DOM querySelector 可穿透 | 插件可查询其他插件 DOM | SDK 规范约束；刻意绕过是信任问题 |

### 5.5 隔离边界哲学

> **UI 系统负责让"正确的事容易做"，让"错误的事不会意外发生"。刻意绕过 SDK 的行为属于信任层面的问题，不在 UI 架构的防御范围内。**

---

## 六、日志/事件渲染

### 6.1 广播 + 隐式监听

**日志是广播，不是路由。** 不需要显式注册 renderer。

```
Workflow 产生日志 → LogStreamDispatcher 广播
  → 角色卡组件：我关心 *.damage → 更新血量显示
  → 聊天面板组件：我关心 *.attack → 渲染攻击卡片
  → 不关心的组件：忽略
```

UI 组件通过 `sdk.log.subscribe(pattern, handler)` 监听，底层走 LogStreamDispatcher。多个组件监听同一事件完全正常——各自在隔离容器内渲染。

### 6.2 与 Slot 的职责分离

| 场景 | 机制 | 原因 |
|---|---|---|
| 日志/事件渲染 | `sdk.log.subscribe`（Dispatcher 广播） | 数据已有结构，天然适合隐式监听 |
| 菜单项、工具栏按钮 | `sdk.ui.contributeToSlot`（SlotRegistry） | 没有数据流可匹配，必须主动注册 |

### 6.3 协议分层

| 层级 | 协议来源 | 例子 |
|---|---|---|
| 插件内部 | 插件自己定义 | `daggerheart.fear-check` |
| 跨插件 | 社区约定 / 强势插件带动 | 流行插件的数据格式成为事实标准 |
| 框架级 | TypeScript interface（可选，改善 IDE 体验） | `AttackPayload`、`RollPayload` |

框架不强制协议，只提供便利。

### 6.4 关键规则

- **不允许 `return false` 阻断广播**（Foundry VTT 教训）
- 事件 payload 建议加 `source` 字段（CloudEvents 实践），方便调试

---

## 七、Layout Layer — 数据模型与持久化

### 7.1 数据结构

```typescript
interface LayoutEntry {
  x: number
  y: number
  width: number
  height: number
  zOrder: number
  visible?: boolean
  instanceProps?: InstancePropsOrFactory
}

// key = "componentId#instanceId"，如 "core.chat-panel#1"
type LayoutConfig = Record<string, LayoutEntry>

interface RoomLayoutConfig {
  narrative: LayoutConfig
  tactical: LayoutConfig
}
```

### 7.2 存储与同步

| 数据 | 存储位置 | 同步方式 |
|---|---|---|
| `RoomLayoutConfig` | room.db（新表 `layout`） | REST 保存 + Socket.io 广播 |
| 按需面板位置记忆 | 客户端 localStorage | 不同步 |

### 7.3 编辑模式数据流

```
GM 编辑模式拖拽面板
  → uiStore 本地更新（即时反馈）
  → debounce 300ms → REST PUT /api/layout
  → 服务端写 room.db
  → Socket.io 广播 layout:updated
  → 其他客户端 uiStore 更新 → PanelRenderer 重渲染
```

### 7.4 冲突处理

- **编辑模式下屏蔽远端更新** — 本地修改是权威，远端 `layout:updated` 忽略
- **退出编辑模式时保存** — REST PUT → 本地版本成为远端权威
- **Last-write-wins** — 单 GM 控制布局，无需复杂冲突解决

---

## 八、插件 SDK 接口

### 8.1 两个 SDK，两个阶段

| SDK | 阶段 | 谁拿到 | 用途 |
|---|---|---|---|
| `IPluginSDK` | `onActivate` 插件激活时 | 插件入口 | 注册组件、层、slot 贡献 |
| `IComponentSDK` | 面板渲染时 | 每个面板实例 | 读数据、触发 workflow、监听日志、开关面板 |

### 8.2 IPluginSDK（插件激活阶段）

```typescript
interface IPluginSDK {
  ui: {
    registerComponent(def: ComponentDef): void
    registerLayer(def: LayerDef): void
    contributeToSlot(slotId: string, contribution: SlotContribution): void
    openPanel(componentId: string, instanceProps?: Record<string, unknown>): string
    closePanel(instanceKey: string): void
  }
  workflow: IWorkflowRunner
  commands: ICommandRegistry    // Track C
}
```

### 8.3 IComponentSDK（面板渲染阶段）

```typescript
interface IComponentSDK {
  read: IDataReader
  workflow: IWorkflowRunner
  context: ComponentContext
  interaction?: IInteractionSDK   // play 模式注入；edit 模式不注入
  log: {
    subscribe(pattern: string, handler: (entry: LogEntry) => void): () => void
  }
  ui: {
    openPanel(componentId: string, instanceProps?: Record<string, unknown>): string
    closePanel(instanceKey: string): void
  }
}
```

### 8.4 插件开发者完整体验

```typescript
const myPlugin: VTTPlugin = {
  id: 'daggerheart',

  onActivate(sdk: IPluginSDK) {
    sdk.ui.registerComponent({
      id: 'character-card',
      type: 'panel',
      component: CharacterCard,
      defaultSize: { width: 320, height: 480 },
    })

    sdk.ui.contributeToSlot('token:context-menu', {
      component: SmiteMenuItem,
    })
  }
}

function CharacterCard({ sdk }: { sdk: IComponentSDK }) {
  const entity = sdk.read.entity(sdk.context.instanceProps.entityId as string)

  sdk.log.subscribe('*.damage', (entry) => {
    if (entry.data.target === entity?.id) { /* 受击反馈 */ }
  })

  return <div className="bg-glass p-4">...</div>
}
```

---

## 九、编辑/运行双模式

### 9.1 模式切换

- **编辑模式**：GM 可拖拽、缩放、添加/移除面板。系统接管交互，面板内部的 `interaction` SDK 不注入
- **运行模式**：布局锁定，`interaction` SDK 注入，面板正常工作

### 9.2 已有 POC

`src/sandbox/PatternUISystem.tsx` 已验证核心机制：
- `layoutMode` 状态切换
- `DragHandle` 编辑模式覆盖层
- `PanelRenderer` 条件渲染
- `makeSDK` 根据模式注入/不注入 `interaction`

### 9.3 编辑模式 UX（待后续细化）

- 面板发现与添加方式（组件目录 / 右键 / 工具栏 "+"）
- 对齐/网格吸附
- 撤销/重做

---

## 十、增量迁移策略

### 阶段 1：基础设施就位

- 扩展 UIRegistry，新增 SlotRegistry
- PanelRenderer 加入隔离容器（`contain: layout paint`）
- App.tsx 中插入 PanelRenderer + LayerRenderer（与现有 UI 并列）
- LayoutConfig 持久化（room.db 新表 + REST/Socket.io）
- 编辑/运行模式切换

此阶段结束后：框架可用，但未迁移任何现有组件。

### 阶段 2：逐组件迁移

按依赖关系从简到复杂：

| 顺序 | 组件 | 理由 |
|---|---|---|
| 1 | 插件面板（PluginPanelContainer） | 已经是插件注册的，改造最小 |
| 2 | ChatPanel | 独立性强，和其他面板无耦合 |
| 3 | PortraitBar | 相对独立 |
| 4 | GmDock + dock tabs | GM 工具集，内部有 tab 结构 |
| 5 | GmSidebar + 子面板 | 类似 GmDock |
| 6 | TacticalToolbar | 和战术画布有交互，但 UI 本身可独立 |
| 7 | TeamDashboard | 插件特定 UI |

每迁移一个组件：
1. 改造为接受 `IComponentSDK` 的插件组件
2. 在内置插件的 `onActivate` 中用 `sdk.ui.registerComponent()` 注册
3. 从 App.tsx 中删除对应的硬编码渲染
4. 验证功能不变

### 阶段 3：App.tsx 瘦身完成

```tsx
function App() {
  return (
    <div>
      <SceneViewer />
      <TacticalPanel />
      <LayerRenderer />
      <PanelRenderer />
      <EditModeToolbar />
    </div>
  )
}
```

**关键约束：任何阶段都可以停下来。** 新旧 UI 共存是完全可用的状态。

---

## 十一、兼容性

| 技术 | 浏览器支持 |
|---|---|
| `@scope` | Baseline Newly Available（2026-01）：Chrome 118+、Safari 17.4+、Firefox 146+ 含移动端 |
| `contain: layout paint` | 广泛支持：Chrome 52+、Firefox 69+、Safari 15.4+ 含移动端 |
| CSS Layers (`@layer`) | Baseline：Chrome 99+、Firefox 97+、Safari 15.4+ |

V1 无浏览器兼容性阻断问题。

---

## 十二、未来扩展方向

以下为 V1 之后的渐进增强，不影响 V1 架构：

1. **玩家自定义布局** — GM 基线 + 玩家覆盖，仅权限和存储层扩展
2. **Canvas 级效果原语** — Token 光环、攻击动画、地图装饰，依赖底层渲染库稳定后设计
3. **动态插件加载** — 运行时 ESM import + CSS 自动 @scope 包裹
4. **响应式布局** — 像素定位迁移到视口百分比或相对单位
5. **编辑模式 UX 细化** — 组件目录、对齐/网格、撤销/重做
6. **`sdk.events`** — 非日志的插件间通信，等出现明确使用场景后引入
