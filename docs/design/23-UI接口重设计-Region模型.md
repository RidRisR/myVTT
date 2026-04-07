# 23 — UI 接口重设计：Region 模型

> **状态**：📝 设计中 | 2026-04-08
> **前置文档**：[20-UI注册系统扩展方案](20-UI注册系统扩展方案.md)、[17-插件系统演进路线](17-插件系统演进路线.md)

---

## 一、背景与动机

当前 UI 注册系统（`registerComponent` + `PanelRenderer`）在 PR #181 后已具备持久面板、输入处理器、响应式数据等能力，但存在三个结构性限制：

| 限制             | 说明                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| **容器形态单一** | 所有面板都是矩形窗口 + 标题栏 chrome，无法表达异形 UI、可折叠面板、内嵌式子面板等形态 |
| **像素绝对定位** | `LayoutEntry` 使用 `{x, y}` 像素坐标，不同分辨率下布局崩溃，无法适配多屏幕尺寸        |
| **生命周期单一** | 所有面板注册后即常驻于布局，缺少"按需触发"的非常驻窗口机制                            |

### 三个具体需求驱动本次重设计

1. **可折叠面板** — 面板可以在完整视图和摘要视图之间切换，折叠后仍展示关键信息
2. **可触发的非常驻窗口** — 通过插件内部按钮触发的临时窗口，关闭后消失
3. **侧边栏** — 多个插件共享一个带图标条的面板，各自贡献一个 tab

---

## 二、设计原则

以下原则在头脑风暴阶段收敛而来，作为所有设计决策的判据。

### 2.1 框架管位置，插件管内容

框架的职责是：区域在屏幕上 **在哪**、**多大**、**何时出现**。

插件的职责是：区域里面 **画什么**、**怎么交互**、**内部状态如何变化**。

框架不提供 chrome（标题栏、关闭按钮），不提供 drawer/accordion/sidebar 等容器原语，不规定折叠行为。这些全部由插件自主决定。

**理由**：框架规定容器行为（如折叠方式）会限制插件作者的自由度。折叠后展示什么是内容相关的——Fear Tracker 折叠后显示 `Fear: 3/5`，法术列表折叠后显示 `3 spells prepared`——这些只有插件作者知道。

### 2.2 透明区域 + pointer-events 穿透

框架分配的是一个透明矩形包围盒，默认 `pointer-events: none`。插件在其中渲染任意形状的内容，通过 `pointer-events: auto` 标记可交互元素。非内容区域的点击/拖拽自动穿透到下层。

```
┌─────────────────────┐  ← 矩形包围盒 (pointer-events: none)
│                     │
│     ╭───────╮       │  ← 实际可见内容 (pointer-events: auto)
│     │ 圆形  │       │
│     │ 面板  │       │
│     ╰───────╯       │
│                     │
│   点击穿透到下层     │
└─────────────────────┘
```

**CSS 实现**：

```css
.region-container {
  pointer-events: none;
}
.region-container > * {
  pointer-events: auto;
}
```

插件如果需要更精细的穿透控制，可以在内部元素上设置 `pointer-events: none`。

### 2.3 复合 UI 通过"布局插件"实现

侧边栏、工具栏等复合 UI 本身是普通插件（Region），它们通过暴露子注册点（Slot）让其他插件贡献内容。框架不知道"侧边栏"的存在——它只看到一个普通区域。

```
框架层 ─── 只管区域
  │
  ├─ Region: "sidebar-shell"（布局插件）
  │    ├─ 渲染：图标条 + 内容区
  │    └─ 暴露 Slot → 其他插件注册 tab 内容
  │
  └─ Region: "fear-tracker"（普通插件）
       └─ 渲染：Fear 面板
```

用户可以把 sidebar-shell 拖到屏幕边缘（看起来像侧边栏），也可以拖到中间（看起来像面板）——布局完全由用户决定。

### 2.4 桌面优先，移动端留接口

当前只实现桌面端的 Anchor + Offset 定位。定位模型通过 Layout Engine 接口抽象，未来可插入 Zone-based Layout Engine 支持移动端，无需改动插件注册。

---

## 三、核心概念：Region

Region 替代当前的 `ComponentDef`，是所有 UI 面板的统一注册模型。

### 3.1 RegionDef

```ts
interface RegionDef {
  /** 全局唯一 ID，必须带插件前缀 (e.g. 'daggerheart-core:fear-tracker') */
  id: string

  /** 渲染内容的 React 组件 */
  component: React.ComponentType<{ sdk: IRegionSDK }>

  /**
   * 生命周期模式
   * - 'persistent': 始终在布局中，框架自动渲染（现有面板的行为）
   * - 'on-demand':  默认不显示，通过 sdk.ui.openPanel() 触发，关闭后销毁
   */
  lifecycle: 'persistent' | 'on-demand'

  /** 默认尺寸（插件声明，用户/布局引擎可覆盖） */
  defaultSize: { width: number; height: number }

  /** 最小尺寸约束 */
  minSize?: { width: number; height: number }

  /** 默认锚点定位（插件声明，用户可覆盖） */
  defaultPlacement?: {
    anchor: AnchorPoint
    offsetX?: number
    offsetY?: number
  }

  /**
   * z-order 层级分组
   * - 'background': 最底层（如氛围面板）
   * - 'standard':   标准层级（大多数面板）
   * - 'overlay':    最顶层（如临时弹窗）
   */
  layer: 'background' | 'standard' | 'overlay'
}

type AnchorPoint = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
```

### 3.2 与当前 ComponentDef 的差异

| 字段               | 当前 ComponentDef                      | 新 RegionDef                                     | 变更理由                                                          |
| ------------------ | -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `type: PanelType`  | `'background' \| 'panel' \| 'overlay'` | `layer: 'background' \| 'standard' \| 'overlay'` | 语义更清晰，`panel` → `standard`                                  |
| `chromeVisible`    | `boolean`                              | **删除**                                         | 框架不再提供 chrome，插件自主渲染                                 |
| `defaultPlacement` | `{ anchor, offsetX, offsetY, modes }`  | `{ anchor, offsetX, offsetY }`                   | `modes` 移除（Narrative/Tactical 模式控制交给布局引擎或插件自身） |
| —                  | 不存在                                 | `lifecycle: 'persistent' \| 'on-demand'`         | 新增，区分常驻 vs 按需触发                                        |

### 3.3 框架渲染行为

对于每个 Region，框架：

1. 创建一个 `<div>` 包围盒，设置 `pointer-events: none`、`position: absolute`
2. 根据 Anchor + Offset 计算位置（见第五节）
3. 将 `width` 和 `height` 设为当前尺寸（用户可能已调整过）
4. 在包围盒内渲染插件的 `component`
5. **不添加任何 chrome**（无标题栏、无边框、无关闭按钮）

**`persistent` region**：框架启动时根据布局配置自动渲染。
**`on-demand` region**：不渲染，直到通过 `sdk.ui.openPanel(regionId)` 触发。关闭后从 DOM 移除。

---

## 四、注册 API

### 4.1 IUIRegistrationSDK 变更

```ts
interface IUIRegistrationSDK {
  /** 新增 — 注册 Region（替代 registerComponent） */
  registerRegion(def: RegionDef): void

  /** 保留 — 全屏层 */
  registerLayer(def: LayerDef): void

  /** 保留 — 渲染器注册（也用于 UI Slot，见第六节） */
  registerRenderer<T>(point: RendererPoint<T>, value: T): void
  registerRenderer(surface: string, type: string, renderer: React.ComponentType): void

  /** 保留 — 输入处理器 */
  registerInputHandler(inputType: string, def: InputHandlerDef): void

  /** @deprecated 使用 registerRegion 替代 */
  registerComponent(def: ComponentDef): void
}
```

### 4.2 UIRegistry 变更

```ts
class UIRegistry {
  /** 新增 */
  registerRegion(def: RegionDef): void
  getRegion(id: string): RegionDef | undefined
  listRegions(): RegionDef[]
  listRegionsByLifecycle(lifecycle: 'persistent' | 'on-demand'): RegionDef[]

  /** 保留 */
  registerLayer(def: LayerDef): void
  getLayers(): LayerDef[]
  registerInputHandler(inputType: string, def: InputHandlerDef): void
  getInputHandler(inputType: string): InputHandlerDef | undefined

  /** @deprecated */
  registerComponent(def: ComponentDef): void
  getComponent(id: string): ComponentDef | undefined
  listComponents(): ComponentDef[]
  listComponentsByType(type: PanelType): ComponentDef[]
}
```

### 4.3 向后兼容

`registerComponent` 保留为 deprecated wrapper，内部转换为 `registerRegion` 调用：

```ts
registerComponent(def: ComponentDef): void {
  this.registerRegion({
    id: def.id,
    component: def.component,
    lifecycle: 'persistent',
    defaultSize: def.defaultSize,
    minSize: def.minSize,
    defaultPlacement: def.defaultPlacement
      ? { anchor: def.defaultPlacement.anchor, offsetX: def.defaultPlacement.offsetX, offsetY: def.defaultPlacement.offsetY }
      : undefined,
    layer: def.type === 'panel' ? 'standard' : def.type,
  })
}
```

---

## 五、Anchor + Offset 定位模型

### 5.1 LayoutEntry 重设计

```ts
interface LayoutEntry {
  /** 锚点 — 相对于视口的参考点 */
  anchor: AnchorPoint

  /** 偏移量 — 从锚点出发的偏移（像素） */
  offsetX: number
  offsetY: number

  /** 当前尺寸 */
  width: number
  height: number

  /** z-order（同一 layer 内的排序值） */
  zOrder: number

  /** 可见性 */
  visible?: boolean

  /** on-demand region 的实例 props */
  instanceProps?: InstancePropsOrFactory
}
```

### 5.2 坐标计算

给定视口尺寸 `(vw, vh)` 和 LayoutEntry，面板左上角的实际像素坐标为：

```ts
function resolvePosition(
  entry: LayoutEntry,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const { anchor, offsetX, offsetY, width, height } = entry
  const { width: vw, height: vh } = viewport

  // 锚点基准坐标
  const base = {
    'top-left': { x: 0, y: 0 },
    'top-right': { x: vw - width, y: 0 },
    'bottom-left': { x: 0, y: vh - height },
    'bottom-right': { x: vw - width, y: vh - height },
    center: { x: (vw - width) / 2, y: (vh - height) / 2 },
  }[anchor]

  return {
    x: base.x + offsetX,
    y: base.y + offsetY,
  }
}
```

**行为特征**：

- **1080p → 4K**：面板保持与锚点的相对距离，自然适配大屏
- **用户拖拽**：拖拽结束时，计算最近的锚点 + 对应偏移值保存（而非保存像素坐标）
- **窗口缩放**：面板位置自动跟随锚点重算，不会跑出屏幕

### 5.3 拖拽结束时的锚点推断

用户拖拽面板到新位置后，框架需要推断最合适的锚点：

```ts
function inferAnchor(
  panelCenter: { x: number; y: number },
  viewport: { width: number; height: number },
): AnchorPoint {
  const { x, y } = panelCenter
  const { width: vw, height: vh } = viewport
  const cx = vw / 2
  const cy = vh / 2

  // 以视口中心为分界，判断面板在哪个象限
  if (x < cx && y < cy) return 'top-left'
  if (x >= cx && y < cy) return 'top-right'
  if (x < cx && y >= cy) return 'bottom-left'
  return 'bottom-right'
}
```

### 5.4 LayoutConfig 持久化

```ts
type LayoutConfig = Record<string, LayoutEntry>
// key = region instance key (e.g. "daggerheart-core:fear-tracker#1")
```

持久化格式不变（仍为 JSON），但字段从 `{x, y}` 变为 `{anchor, offsetX, offsetY}`。需要一次性迁移现有布局数据。

---

## 六、Region SDK（运行时 API）

### 6.1 IRegionSDK

`IRegionSDK` 扩展现有 `IComponentSDK`，新增区域控制能力。

```ts
interface IRegionSDK extends IComponentSDK {
  /** 数据访问 — 继承自 IComponentSDK */
  read: IDataReader
  data: IReactiveDataSDK
  workflow: IWorkflowRunner
  context: ComponentContext
  interaction?: IInteractionSDK
  awareness: IAwarenessSDK
  log: ILogSDK

  /** UI 控制 — 扩展 */
  ui: {
    /**
     * 打开一个 region 实例
     * - on-demand region：创建新实例并渲染
     * - persistent region：将已有实例的 visible 设为 true（如果当前隐藏）
     * @param regionId - 已注册的 region ID
     * @param instanceProps - 传递给 region 组件的 props
     * @param position - 可选的定位覆盖（优先于 defaultPlacement）
     * @returns instanceKey - 用于 closePanel
     */
    openPanel(
      regionId: string,
      instanceProps?: Record<string, unknown>,
      position?: { anchor: AnchorPoint; offsetX?: number; offsetY?: number },
    ): string

    /** 关闭一个 region 实例 */
    closePanel(instanceKey: string): void

    /**
     * 动态调整当前 region 的尺寸
     * 框架平滑过渡到新尺寸，更新 LayoutEntry
     */
    resize(size: { width?: number; height?: number }): void
  }
}
```

### 6.2 resize() 行为规范

- 只能修改自身 region 的尺寸（不能修改其他 region）
- 尺寸受 `minSize` 约束，低于 minSize 时 clamp 到 minSize
- 框架更新 LayoutEntry 的 `width`/`height`，触发重布局
- resize 后位置保持锚点不变（即 offsetX/offsetY 不因尺寸变化而改变）
- 建议配合 CSS transition 实现平滑过渡（由插件的 CSS 控制）

### 6.3 可折叠面板示例

```tsx
function FearTracker({ sdk }: { sdk: IRegionSDK }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    sdk.ui.resize(collapsed ? { width: 180, height: 36 } : { width: 220, height: 200 })
  }, [collapsed, sdk])

  if (collapsed) {
    return (
      <div className="fear-bar" style={{ pointerEvents: 'auto' }}>
        <span>Fear: 3/5</span>
        <button onClick={() => setCollapsed(false)}>▼</button>
      </div>
    )
  }

  return (
    <div className="fear-panel" style={{ pointerEvents: 'auto' }}>
      <div className="header">
        <span>Fear Tracker</span>
        <button onClick={() => setCollapsed(true)}>▲</button>
      </div>
      <div className="body">{/* 完整面板内容 */}</div>
    </div>
  )
}
```

### 6.4 可触发的非常驻窗口示例

```ts
// 注册阶段（onActivate）
sdk.ui.registerRegion({
  id: 'daggerheart-core:spell-detail',
  component: SpellDetailWindow,
  lifecycle: 'on-demand',
  defaultSize: { width: 400, height: 500 },
  defaultPlacement: { anchor: 'center' },
  layer: 'overlay',
})

// 运行时（在另一个面板的按钮点击中）
function SpellListPanel({ sdk }: { sdk: IRegionSDK }) {
  const handleViewDetail = (spellId: string) => {
    sdk.ui.openPanel('daggerheart-core:spell-detail', { spellId })
  }

  return (
    <div style={{ pointerEvents: 'auto' }}>
      {spells.map(s => (
        <div key={s.id} onClick={() => handleViewDetail(s.id)}>
          {s.name}
        </div>
      ))}
    </div>
  )
}
```

---

## 七、UI Slot —— 复用 RendererRegistry

### 7.1 设计决策：不新建 Slot 机制

UI Slot 的本质是"插件 A 暴露扩展点，插件 B 注册内容"——这与 `RendererRegistry` 的 `RendererPoint<T>` + `getAllRenderers()` 完全一致。因此直接复用现有机制，不引入新 API。

### 7.2 Slot 定义（由布局插件导出）

```ts
// core-ui/slots.ts — sidebar 布局插件导出的 slot 定义

export interface SidebarTabDef {
  id: string
  icon: string // icon name（图标库 key）
  label: string // tooltip 文字
  component: React.ComponentType<{ sdk: IRegionSDK }>
}

/** Sidebar 的 tab 注册点 */
export const SIDEBAR_TAB_SLOT = createRendererPoint<SidebarTabDef>('ui-slot', 'core-sidebar:tabs')
```

### 7.3 注册（由内容插件调用）

```ts
// daggerheart-core/index.ts

import { SIDEBAR_TAB_SLOT } from 'core-ui/slots'

export function onActivate(sdk: IPluginSDK) {
  sdk.ui.registerRenderer(SIDEBAR_TAB_SLOT, {
    id: 'spell-list',
    icon: 'book-open',
    label: 'Spells',
    component: SpellListPanel,
  })
}
```

### 7.4 消费（在布局插件内部）

```tsx
// core-ui/SidebarShell.tsx

import { SIDEBAR_TAB_SLOT } from './slots'
import { getAllRenderers } from '@myvtt/sdk'

function SidebarShell({ sdk }: { sdk: IRegionSDK }) {
  const tabs = getAllRenderers(SIDEBAR_TAB_SLOT)
  const [activeId, setActiveId] = useState(tabs[0]?.id)
  const activeTab = tabs.find((t) => t.id === activeId)

  return (
    <div className="sidebar" style={{ pointerEvents: 'auto' }}>
      {/* 图标条 */}
      <div className="icon-strip">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === activeId ? 'active' : ''}
            onClick={() => setActiveId(tab.id)}
            title={tab.label}
          >
            <Icon name={tab.icon} />
          </button>
        ))}
      </div>
      {/* 内容区 */}
      <div className="content">{activeTab && <activeTab.component sdk={sdk} />}</div>
    </div>
  )
}
```

### 7.5 为什么不需要 useRenderers hook

所有插件注册发生在 `onActivate`（同步），先于任何 React 渲染。`getAllRenderers` 在组件首次渲染时即可拿到完整列表。如果未来需要支持动态注册（插件延迟加载），可以补充 `useRenderers<T>(point): T[]` hook，API 兼容。

---

## 八、RegionRenderer（替代 PanelRenderer）

### 8.1 职责

`RegionRenderer` 替代当前 `PanelRenderer`，渲染所有 persistent regions。

```tsx
interface RegionRendererProps {
  registry: UIRegistry
  layout: LayoutConfig
  makeSDK: (instanceKey: string, instanceProps: Record<string, unknown>) => IRegionSDK
  viewport: { width: number; height: number }
  onDragEnd?: (instanceKey: string, newEntry: Partial<LayoutEntry>) => void
}
```

### 8.2 渲染逻辑

```tsx
function RegionRenderer({ registry, layout, makeSDK, viewport, onDragEnd }: RegionRendererProps) {
  const regions = registry.listRegionsByLifecycle('persistent')

  return (
    <>
      {regions.map((def) => {
        const entry = layout[def.id]
        if (!entry || entry.visible === false) return null

        const pos = resolvePosition(entry, viewport)
        const Comp = def.component

        return (
          <div
            key={def.id}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              width: entry.width,
              height: entry.height,
              zIndex: layerBaseZ(def.layer) + entry.zOrder,
              pointerEvents: 'none',
            }}
          >
            <Comp sdk={makeSDK(def.id, entry.instanceProps ?? {})} />
          </div>
        )
      })}
    </>
  )
}

/** 各 layer 的基准 z-index */
function layerBaseZ(layer: RegionDef['layer']): number {
  switch (layer) {
    case 'background':
      return 0
    case 'standard':
      return 1000
    case 'overlay':
      return 2000
  }
}
```

### 8.3 On-Demand Region 渲染

On-demand regions 通过独立的 `OnDemandHost` 管理（类似现有 `InputHandlerHost`）。每个 open instance 携带 regionId、instanceKey、instanceProps 和可选的 position 覆盖。

定位优先级：`openPanel()` 传入的 position > `RegionDef.defaultPlacement` > `{ anchor: 'center' }`。

```tsx
function OnDemandHost({ registry, openInstances, makeSDK, viewport }) {
  return (
    <>
      {openInstances.map(({ regionId, instanceKey, instanceProps }) => {
        const def = registry.getRegion(regionId)
        if (!def || def.lifecycle !== 'on-demand') return null

        const entry = resolveOnDemandEntry(def, openInstance)
        const pos = resolvePosition(entry, viewport)
        const Comp = def.component

        return (
          <div
            key={instanceKey}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              width: entry.width,
              height: entry.height,
              zIndex: layerBaseZ(def.layer) + entry.zOrder,
              pointerEvents: 'none',
            }}
          >
            <Comp sdk={makeSDK(instanceKey, instanceProps)} />
          </div>
        )
      })}
    </>
  )
}
```

---

## 九、Edit Mode 拖拽交互

### 9.1 拖拽行为变更

当前的 edit mode 拖拽直接修改 `{x, y}` 像素坐标。新系统需要：

1. 拖拽过程中仍使用像素坐标实时跟踪（性能考虑）
2. **拖拽结束时**，根据面板中心位置推断最佳锚点，计算相应偏移值，写入 LayoutEntry

### 9.2 resize 手柄

由于框架不再提供 chrome，edit mode 下框架需要在 region 包围盒外围绘制 resize 手柄（不在包围盒内部，避免与插件内容冲突）：

```
  ○─────────────────────○   ← resize 手柄（edit mode only）
  │                     │
  │   [插件内容区域]     │
  │                     │
  ○─────────────────────○
```

Play mode 下不显示 resize 手柄。

---

## 十、迁移计划

### 10.1 涉及的现有插件

| 插件                   | 当前注册                           | 迁移工作                            |
| ---------------------- | ---------------------------------- | ----------------------------------- |
| `core-ui`              | `registerComponent` (session-info) | 改为 `registerRegion` + 自绘 chrome |
| `daggerheart-core`     | `registerComponent` (fear-panel)   | 改为 `registerRegion` + 自绘 chrome |
| `daggerheart-cosmetic` | 无 UI 组件                         | 无需改动                            |
| `generic-bindings`     | 无 UI 组件                         | 无需改动                            |

### 10.2 迁移步骤

1. **实现 `registerRegion` + `RegionRenderer`**，与现有 `registerComponent` + `PanelRenderer` 并存
2. **实现 Anchor + Offset `LayoutEntry`**，写迁移脚本将现有 `{x, y}` 转换为 `{anchor, offsetX, offsetY}`
3. **实现 `sdk.ui.resize()`**
4. **迁移 `core-ui` 和 `daggerheart-core`** 到 `registerRegion`，自绘 chrome
5. **废弃 `registerComponent` + `PanelRenderer`**，标记 deprecated
6. **移除旧代码**（可延后到确认稳定之后）

### 10.3 向后兼容

过渡期间 `registerComponent` 作为 deprecated wrapper 保留（见第四节 4.3），内部转换为 `registerRegion` 调用。现有插件在不修改代码的情况下仍可工作。

---

## 十一、Layout Engine 接口（为移动端预留）

当前只实现桌面端的 Anchor + Offset 引擎。但定位逻辑通过 `LayoutEngine` 接口抽象，为未来移动端留出扩展点。

```ts
interface LayoutEngine {
  /** 根据 LayoutEntry 和视口计算实际像素位置 */
  resolvePosition(
    entry: LayoutEntry,
    viewport: { width: number; height: number },
  ): { x: number; y: number }

  /** 拖拽结束时，根据实际像素位置反算 LayoutEntry */
  inferPlacement(
    panelRect: { x: number; y: number; width: number; height: number },
    viewport: { width: number; height: number },
  ): Pick<LayoutEntry, 'anchor' | 'offsetX' | 'offsetY'>
}
```

桌面端实现（`AnchorOffsetEngine`）如第五节所述。未来移动端可实现 `ZoneLayoutEngine`，将 `LayoutEntry` 映射到 Zone-based 布局，接口保持不变。

---

## 十二、开放问题

### 12.1 插件如何自绘 chrome？

框架不再提供标题栏 chrome 后，每个插件都需要自己画标题栏、关闭按钮、折叠按钮等。这可能导致视觉不一致。

**可能的缓解方案**：SDK 导出一套 UI 组件库（`<RegionHeader>`, `<CloseButton>`, `<CollapseToggle>` 等），插件可以选择性使用，但不强制。

### 12.2 拖拽交互由谁提供？

当前 edit mode 下框架提供面板拖拽。框架不再提供 chrome 后，拖拽的 grab handle 由谁渲染？

**建议方案**：Edit mode 下，框架在 region 包围盒上方叠加一个透明拖拽层（不在包围盒内部），用于拖拽和 resize。Play mode 下此层不存在。

### 12.3 on-demand region 的定位

`openPanel()` 触发的 on-demand region 出现在哪里？

**建议方案**：

- 如果 RegionDef 有 `defaultPlacement`，用它
- 如果 `openPanel()` 传了 position 参数，用它覆盖
- 否则默认 `{ anchor: 'center' }`（屏幕中央）

### 12.4 Layout 数据迁移

现有 `{x, y}` 格式的 LayoutConfig 需要一次性迁移到 `{anchor, offsetX, offsetY}`。迁移时需要知道当时的视口尺寸才能正确推断锚点。

**建议方案**：迁移在客户端首次加载时执行（此时有真实视口尺寸），迁移完成后标记版本号，不再重复执行。

---

## 附录：完整类型一览

```ts
// ---- 核心类型 ----

type AnchorPoint = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

interface RegionDef {
  id: string
  component: React.ComponentType<{ sdk: IRegionSDK }>
  lifecycle: 'persistent' | 'on-demand'
  defaultSize: { width: number; height: number }
  minSize?: { width: number; height: number }
  defaultPlacement?: { anchor: AnchorPoint; offsetX?: number; offsetY?: number }
  layer: 'background' | 'standard' | 'overlay'
}

interface LayoutEntry {
  anchor: AnchorPoint
  offsetX: number
  offsetY: number
  width: number
  height: number
  zOrder: number
  visible?: boolean
  instanceProps?: InstancePropsOrFactory
}

type LayoutConfig = Record<string, LayoutEntry>

// ---- SDK 类型 ----

interface IRegionSDK extends IComponentSDK {
  ui: {
    openPanel(regionId: string, instanceProps?: Record<string, unknown>): string
    closePanel(instanceKey: string): void
    resize(size: { width?: number; height?: number }): void
  }
}

// ---- 注册类型 ----

interface IUIRegistrationSDK {
  registerRegion(def: RegionDef): void
  registerLayer(def: LayerDef): void
  registerRenderer<T>(point: RendererPoint<T>, value: T): void
  registerRenderer(surface: string, type: string, renderer: React.ComponentType): void
  registerInputHandler(inputType: string, def: InputHandlerDef): void
  /** @deprecated */ registerComponent(def: ComponentDef): void
}

// ---- Layout Engine 接口 ----

interface LayoutEngine {
  resolvePosition(
    entry: LayoutEntry,
    viewport: { width: number; height: number },
  ): { x: number; y: number }
  inferPlacement(
    panelRect: { x: number; y: number; width: number; height: number },
    viewport: { width: number; height: number },
  ): Pick<LayoutEntry, 'anchor' | 'offsetX' | 'offsetY'>
}
```
