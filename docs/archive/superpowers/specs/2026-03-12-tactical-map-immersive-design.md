# 战术地图沉浸式融合设计规格

**日期**：2026-03-12
**状态**：已批准
**作者**：设计讨论产出

---

## 背景与动机

当前战术地图以独立浮窗（`position: fixed`，70vw × 70vh，`z-index: 10001`）的形式渲染，与全屏背景场景图完全割裂，玩家体验上有强烈的「弹窗感」，违背了项目「沉浸式叙事氛围」的核心设计原则。

目标：让战术地图与背景气氛图达成一体感，战术工具整合进现有 UI 框架，不引入任何新的独立面板。

---

## 设计方案：全屏沉浸层

### 层级结构

```
底层  SceneViewer（atmosphereImageUrl，全屏）
         ↕ combat 激活时：CSS filter blur(8px) + rgba 暗化遮罩
中层  Konva Canvas（position: fixed，全屏，背景透明）
         └─ BackgroundLayer（tacticalMapImageUrl，居中/可缩放平移）
         └─ KonvaGrid
         └─ KonvaTokenLayer
         └─ MeasureTool / RangeTemplate
上层  现有 UI（PortraitBar、HamburgerMenu、BottomDock — 完全不改动）
         └─ GmToolbar（双行扩展，见下）
```

### 气氛图处理（战术模式激活时）

- `filter: blur(8px)` + `transform: scale(1.04)`（防止模糊边缘露白）
- 在 SceneViewer 上叠加 `rgba(8, 5, 18, 0.52)` 暗化遮罩层
- 切换动画：Tailwind class `transition-[filter,opacity] duration-slow ease-out motion-reduce:duration-0`（`slow = 400ms`，符合样式基础设施三档 duration 规范）

### Konva Canvas 全屏化

- `TacticalPanel` 容器改为 `position: fixed; inset: 0; z-index: z-combat`（`z-combat: 100`）
- 背景色改为 `transparent`（不再有深色面板背景）
- 地图未铺满时，Konva Canvas 透明区域自然透出底层模糊气氛图
- `tacticalMapImageUrl` 渲染位置居中，支持缩放/平移（现有 Konva 逻辑不变）
- 地图图片四边加 4 方向渐变遮罩（各 ~5% 宽度），硬边柔和融入背景
- `tacticalMapImageUrl` 为空时，`BackgroundLayer` 渲染为完全透明（**不**兜底到 `atmosphereImageUrl`），否则气氛图会同时出现在 SceneViewer（模糊）和 Canvas（清晰）两个层次产生双重渲染

### 边框与视觉风格

- **移除**：原有的 `border border-border-glass`、`rounded-lg`、`shadow` 容器边框
- **保留**：所有 UI 浮动控件继续使用 Glassmorphism 风格
  - `bg-glass backdrop-blur-[12px] border border-border-glass`（使用 Token，不写硬编码 rgba）
  - 进入动画：`transition-opacity duration-fast ease-out`（150ms）

---

## GmToolbar 双行布局

战术工具**不再**使用独立 `TacticalToolbar` 竖条，整合进 `GmToolbar`。

### 布局（isCombat = true 时）

```
上行（新增，仅 combat 时渲染）:
  [🖱 Select] [📏 Measure] [⭕ Range] | [Grid] [Grid Settings] | [▶ Next Turn]

下行（原有，始终可见）:
  [🖼 Scenes]  [✕ Exit Combat]
```

### 按钮规格

- 图标尺寸：`w-8 h-8`（与原 TacticalToolbar 一致）
- 样式：与现有 `btn-glass` 一致，`backdrop-blur-[12px]`
- 活跃态：`bg-accent text-deep`
- 分隔符：`w-px h-5 bg-border-glass`
- GM 专属按钮（Player View 切换）保留，显示在上行 Range 工具之后
- Range 工具子菜单弹出方向改为**向上**（`bottom-full left-0`），适配水平工具行布局（原竖条用 `left-full` 向右弹出，水平行中会超出屏幕）

### 状态管理

- `activeTool`、`gmViewAsPlayer` 继续由 `useUiStore` 管理（不变）
- `showGridConfig`：状态提升至 `GmToolbar` 内部 `useState`（原在 `TacticalPanel`），`GridConfigPanel` 的 `scene` 和 `onUpdateScene` props 由 `App.tsx` 向下传入 `GmToolbar`
- `onAdvanceInitiative`、`onToggleGrid`、`onToggleGridConfig` 以 props 形式传入
- `GridConfigPanel` 弹出层改为 `position: fixed`，锚定在 GmToolbar 工具行上方（`bottom: 72px; left: 12px`），不再依赖父容器的 `position: relative`

---

## 删除内容

| 文件 / 功能                         | 处理方式                         |
| ----------------------------------- | -------------------------------- |
| `TacticalPanel` 浮窗容器样式        | 改为全屏透明容器                 |
| `TacticalToolbar.tsx` 竖条组件      | **删除**，内容迁移至 `GmToolbar` |
| `TacticalPanel` 内嵌的 toolbar 渲染 | **移除**                         |

---

## 改动文件清单

| 文件                                   | 改动描述                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scene/SceneViewer.tsx`            | 接收 `blurred?: boolean` prop；combat 激活时加 filter + 遮罩                                                                                                                                      |
| `src/combat/TacticalPanel.tsx`         | 去掉固定尺寸浮窗，改为全屏 fixed 透明容器；移除 TacticalToolbar 引用                                                                                                                              |
| `src/combat/KonvaMap.tsx`              | 内部 `width: 100%; height: 100%` 逻辑不变（由父容器全屏决定）；将固定背景色 `background: '#111'` 改为 `transparent`；`BackgroundLayer` 边缘添加渐变遮罩；`tacticalMapImageUrl` 为空时不渲染背景图 |
| `src/combat/TacticalToolbar.tsx`       | **删除**                                                                                                                                                                                          |
| `src/gm/GmToolbar.tsx`                 | 增加双行布局；接收 `scene`、`onUpdateScene`、`onAdvanceInitiative`、`onToggleGrid` 等新 props；维持 `z-toast` 层级不变                                                                            |
| `src/combat/tools/GridConfigPanel.tsx` | 定位改为 `position: fixed`，锚定至 GmToolbar 上方（`bottom: 72px`），不再依赖父容器 relative                                                                                                      |
| `src/App.tsx`                          | 向 `SceneViewer` 传入 `blurred={isCombat}`；向 `GmToolbar` 传入战术工具 props                                                                                                                     |

---

## UI/UX 设计准则（本次实施）

基于 UI/UX Pro Max 检索结果：

### 层叠与 Z-index

- 使用项目已定义的 z-index 分级，**不使用**硬编码大数值
- Konva Canvas：`z-combat: 100`
- GmToolbar（含战术工具行）：**维持现有 `z-toast: 10000` 不变**，不降级为 `z-ui`
- 避免在同一 stacking context 内混用 fixed 和 absolute 定位

### 动画

- 战术模式切换（进入）：`duration-slow`（400ms）`ease-out`
- 战术模式切换（退出）：`duration-normal`（250ms）`ease-in`（注：300ms 不在三档规范内，改为 normal 250ms）
- 工具按钮激活态切换：`transition-colors duration-fast`（150ms）
- `prefers-reduced-motion`：统一使用 Tailwind `motion-reduce:duration-0` 前缀，**不使用**内联 CSS 媒体查询
- **禁止** `transition: all`，必须显式列出动画属性（如 `transition-[filter,opacity]`）

### Glassmorphism 规格

- 使用 Tailwind Token，**不写硬编码 rgba 值**
- 背景：`bg-glass`（Token: `rgba(15,15,25,0.92)`）
- 边框：`border-border-glass`（Token: `rgba(255,255,255,0.08)`）
- 模糊：`backdrop-blur-[12px]`
- 新增代码遵循 Tailwind 迁移策略，动态运行时值（如用户选色）才保留 `style={}`
- 避免在 Konva Canvas 本身使用 backdrop-filter（性能影响）

### 可访问性

- 工具按钮保留 `focus:ring-2 focus:ring-accent` 焦点环（键盘导航可用）
- 不单独依赖颜色区分激活状态（同时使用背景色 + 图标颜色变化）

---

## 验证方式

1. **叙事模式**：进入页面，确认场景背景图全屏显示，无网格，无战术浮窗
2. **战术模式激活**：点击 GmToolbar → Combat，确认：
   - 气氛图做模糊+暗化处理
   - 战术地图图片全屏铺满（或居中显示并透出模糊背景）
   - 网格正确叠加
   - Token 可拖拽
   - GmToolbar 出现第二行战术工具
3. **工具切换**：测试 Select / Measure / Range 三种工具功能正常
4. **网格控制**：Toggle Grid / Grid Settings 正常工作
5. **未铺满场景**：设置小尺寸战术地图，确认画布透明区域显示模糊气氛图
6. **退出战术模式**：点击 Exit Combat，气氛图恢复清晰，Konva Canvas 卸载，工具行消失
7. **多用户同步**：两个客户端同时进入战术模式，确认 Yjs 状态同步正常
8. **减弱动画**：在系统设置中开启「减少动作」，确认切换无过渡动画
9. **玩家视角**：以玩家身份进入战术模式，确认 Konva Canvas 全屏显示、SceneViewer 模糊正常，GmToolbar（含战术工具行）不可见
