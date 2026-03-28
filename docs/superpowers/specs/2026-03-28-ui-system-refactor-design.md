# UI 系统重构设计 Spec

> 日期：2026-03-28
>
> 探索记录：[`docs/archive/exploration-2026-03/plugin-system/ui/06-UI系统重构架构决策.md`](../../archive/exploration-2026-03/plugin-system/ui/06-UI系统重构架构决策.md)

---

## 一、目标

将 myVTT 的 UI 从 App.tsx 硬编码布局，重构为**插件注册 UI + 用户决定布局**的架构。

### 核心理念

- 插件声明"我有什么"，建议"我在哪里"，用户决定最终布局
- 数据与渲染分离：插件产出语义化日志数据，渲染是可选的附加层
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
│                  → contribute(extensionPoint, component) │
│                  → sdk.log.subscribe(pattern, handler)   │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  Registry Layer                                         │
│  UIRegistry          ExtensionRegistry                   │
│  (面板/层定义)       (扩展点贡献:                        │
│                       日志渲染器 + UI碎片 + 视图替换)     │
│                      LogStreamDispatcher                 │
│                      (日志广播+订阅)                      │
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
│  LayerRenderer     PanelRenderer                         │
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

### 3.1 两类注册 + 一类贡献

| 类别 | 特征 | 例子 |
|---|---|---|
| **Panel（容器型）** | 有位置/尺寸，插件控制内部渲染，进 UIRegistry | 角色卡、聊天面板、骰子面板 |
| **Layer（图层型）** | 全屏/画布级，按层叠顺序排列，进 UIRegistry | 粒子效果、天气、全屏公告 |
| **Extension Point 贡献** | 向 UI 声明的扩展点贡献组件，进 ExtensionRegistry | 日志渲染器、右键菜单项、悬浮卡、工具栏按钮 |

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
  defaultPlacement?: DefaultPlacement          // 建议位置（可选）
}

interface DefaultPlacement {
  anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  offsetX?: number
  offsetY?: number
  modes?: ('narrative' | 'tactical')[]   // 不声明 = 两个模式都建议
}
```

`defaultPlacement` 用于"一键应用默认布局"功能：系统遍历所有有 `defaultPlacement` 的组件，按锚点 + 偏移计算实际像素坐标，写入 LayoutConfig。GM 可随时覆盖。重新挂载面板时，优先级：GM 手动调整过的位置 > 组件声明的默认位置 > 居中放置。

### 4.2 ExtensionRegistry

统一替代原 SlotRegistry 和 RendererRegistry（Doc 17 §14）。用类型化 token 保证编译时类型安全：

```typescript
// 创建类型化扩展点（类似 React createContext<T>()）
function createExtensionPoint<TProps>(key: string): ExtensionPoint<TProps> {
  return { key } as ExtensionPoint<TProps>
}

class ExtensionRegistry {
  contribute<T>(point: ExtensionPoint<T>, component: ComponentType<T>, priority?: number): void
  get<T>(point: ExtensionPoint<T>): ComponentType<T> | undefined       // 取优先级最高的一个
  getAll<T>(point: ExtensionPoint<T>): ComponentType<T>[]              // 取全部
}
```

**扩展点命名规约**：

- `:` = 命名空间分隔（谁拥有）
- `.` = 路径层级（结构位置）

```
core:token.hover-card        → core 定义，token 区域，悬浮卡
core:token.context-menu      → core 定义，token 区域，右键菜单
core:toolbar.tactical.left   → core 定义，战术工具栏，左侧
dh:character.summary         → dh 插件定义，角色摘要视图
```

**日志渲染器**直接复用日志条目的 `type` 作为 key（无 `.`）：

```
dh:judgment                  → 日志 type 本身
core:text                    → 日志 type 本身
core:roll-result             → 日志 type 本身
```

**区分规则**：有 `.` 的是 UI 扩展点，无 `.` 的是日志渲染器 key。两者共用同一个 ExtensionRegistry，key 空间天然不碰撞。

**扩展点由消费者定义**：UI 组件在代码中调用 `registry.get(point)` 就隐式创建了扩展点。插件向扩展点 contribute 组件。双方通过扩展点 key（稳定契约）连接，不直接耦合。

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

## 六、数据通路与日志渲染

### 6.1 三条数据通路

| 数据性质 | 来源 | 插件消费方式 | 例子 |
|---|---|---|---|
| **持久状态**（HP、属性） | zustand store | `sdk.read`（`useEntity` / `useComponent`） | 角色卡显示当前 HP |
| **日志流**（游戏事件记录） | game_log | `sdk.log.subscribe` / ExtensionRegistry 渲染器 | 战斗日志面板、ChatPanel |
| **实时感知**（光标、拖拽） | awareness Socket.io | ⚠️ V1 待设计（`sdk.awareness`） | Token 拖拽预览、在线状态 |

**关键原则**：持久状态变更（如 HP 减少）应通过 store 订阅感知，不应通过日志订阅。日志是事件记录，store 是状态权威。

### 6.2 日志渲染：数据与渲染分离

**日志条目是语义化数据**，插件 Workflow 产出日志后数据职责即结束：

```typescript
// 插件只管产出语义化数据
ctx.emitEntry({
  type: 'dh:judgment',
  payload: { outcome: 'success_hope', hopeDie: 5, fearDie: 7 }
})
```

**渲染是可选的附加层**，通过 ExtensionRegistry contribute：

```typescript
// 插件可选择性地告诉 UI 怎么画（高级接口）
sdk.ui.contribute(logRenderer('dh:judgment'), JudgmentCard)
```

如果不 contribute 渲染器，ChatPanel 使用 DefaultLogCard 兜底展示 payload 结构化数据。功能完整，只是不定制。

**ChatPanel 的渲染流程**：

```tsx
function LogEntryView({ entry }: { entry: GameLogEntry }) {
  const Card = extensionRegistry.get(logRenderer(entry.type))
  return Card ? <Card entry={entry} /> : <DefaultLogCard entry={entry} />
}
```

### 6.3 sdk.log.subscribe 的使用场景

`sdk.log.subscribe` 的正确用途是：**构建自定义日志视图**（如过滤后的战斗日志面板），不是监听状态变更。

```
✅ 战斗日志面板 subscribe('dh:judgment') → 构建自己的日志滚动列表
✅ 统计面板 subscribe('core:roll-result') → 统计骰子分布
❌ 角色卡 subscribe('*.damage') → 更新 HP  ← 应该用 sdk.read 订阅 store
```

### 6.4 协议分层

| 层级 | 协议来源 | 例子 |
|---|---|---|
| 插件内部 | 插件自己定义 | `daggerheart.fear-check` |
| 跨插件 | 社区约定 / 强势插件带动 | 流行插件的数据格式成为事实标准 |
| 框架级 | TypeScript interface（可选，改善 IDE 体验） | `AttackPayload`、`RollPayload` |

框架不强制协议，只提供便利。

### 6.5 关键规则

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
| `IPluginSDK` | `onActivate` 插件激活时 | 插件入口 | 注册组件、层、扩展点贡献 |
| `IComponentSDK` | 面板渲染时 | 每个面板实例 | 读数据、触发 workflow、监听日志、开关面板 |

### 8.2 IPluginSDK（插件激活阶段）

```typescript
interface IPluginSDK {
  ui: {
    registerComponent(def: ComponentDef): void
    registerLayer(def: LayerDef): void
    contribute<T>(point: ExtensionPoint<T>, component: ComponentType<T>, priority?: number): void
    openPanel(componentId: string, instanceProps?: Record<string, unknown>): string
    closePanel(instanceKey: string): void
  }
  workflow: IWorkflowRunner
  commands: ICommandRegistry       // Track C
  registerTrigger: ITriggerRegistrar  // Track A
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
// ---- 扩展点定义（可由核心或插件导出） ----
const tokenContextMenu = createExtensionPoint<{ token: Token }>('core:token.context-menu')
const tokenHoverCard = createExtensionPoint<{ entity: Entity }>('core:entity.hover-card')

// ---- 插件注册 ----
const myPlugin: VTTPlugin = {
  id: 'dh',

  onActivate(sdk: IPluginSDK) {
    // 注册面板组件（有布局属性，进 UIRegistry）
    sdk.ui.registerComponent({
      id: 'dh:character-card',
      type: 'panel',
      component: CharacterCard,
      defaultSize: { width: 320, height: 480 },
      defaultPlacement: { anchor: 'top-right', offsetX: 20, offsetY: 20 },
    })

    // 向扩展点贡献（无布局，进 ExtensionRegistry）
    sdk.ui.contribute(tokenContextMenu, SmiteMenuItem)           // 右键菜单项
    sdk.ui.contribute(tokenHoverCard, DHCharacterHoverCard)      // 悬浮卡
    sdk.ui.contribute(logRenderer('dh:judgment'), JudgmentCard)  // 日志渲染器（可选）
  }
}

// ---- 面板组件 ----
function CharacterCard({ sdk }: { sdk: IComponentSDK }) {
  // 持久状态通过 store 订阅（不是日志订阅）
  const entity = sdk.read.entity(sdk.context.instanceProps.entityId as string)
  const health = sdk.read.component(entity?.id, 'daggerheart:health')

  return <div className="bg-glass p-4">HP: {health?.current}/{health?.max}</div>
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

- 扩展 UIRegistry，新增 ExtensionRegistry
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

## 十二、与 Track A 的依赖关系

本 spec 为 Doc 17 轨道 B（UI 插件化），与轨道 A（事件日志）有以下依赖：

| 本 spec 功能 | 依赖 Track A | 说明 |
|---|---|---|
| 日志渲染器（ExtensionRegistry 的 `logRenderer` 扩展点） | A1 Dispatcher 运行时接入 | Dispatcher 将日志广播到客户端 |
| `sdk.log.subscribe` | A1 Dispatcher 运行时接入 | subscribe 底层走 Dispatcher |
| ChatPanel 迁移到 ExtensionRegistry 渲染 | A3 日志条目渲染器 | 需要 RendererRegistry → ExtensionRegistry 统一 |

**布局引擎、PanelRenderer、编辑模式、CSS 隔离等核心基础设施不依赖 Track A，可独立先行。**

---

## 十三、未来扩展方向

以下为 V1 之后的渐进增强，不影响 V1 架构：

1. **玩家自定义布局** — GM 基线 + 玩家覆盖，仅权限和存储层扩展
2. **Canvas 级效果原语** — Token 光环、攻击动画、地图装饰，依赖底层渲染库稳定后设计
3. **动态插件加载** — 运行时 ESM import + CSS 自动 @scope 包裹
4. **响应式布局** — 像素定位迁移到视口百分比或相对单位
5. **编辑模式 UX 细化** — 组件目录、对齐/网格、撤销/重做
6. **`sdk.events`** — 非日志的插件间通信，等出现明确使用场景后引入
7. **`sdk.awareness`** — 实时感知数据（光标位置、拖拽预览、在线状态）暴露给插件，V1 未覆盖
