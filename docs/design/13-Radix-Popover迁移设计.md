# 13 — Radix Popover 浮层统一迁移设计

**开发分支**：`poc/radix-popover`
**工作目录**：`../myVTT-radix-poc`（git worktree）

阶段一 POC 已完成并提交。后续阶段二、三的开发直接在此分支上继续，完成后提交 PR 合入 main。

## 动机与目标

项目即将开放插件系统（rule-plugin-system），插件需要与主系统保持一致的 UI 行为和视觉风格。当前浮层组件（弹窗、菜单、确认气泡）全部自建，存在两个核心问题：

1. **重复且不完整**：三套组件各自实现 portal / 定位 / 关闭逻辑，但都缺少无障碍支持（ARIA 属性、焦点管理、键盘导航），且 ConfirmPopover 不处理视口碰撞
2. **无法安全导出给插件**：自建组件的行为边界不明确（如 click-outside 监听在复杂布局下可能误触），直接导出给插件使用会带来难以排查的 bug

引入成熟的 headless UI 库统一浮层行为，让基座和插件共享同一套经过社区验证的底层能力。

### 预期收益

- **减少 ~200 行** 重复的底层逻辑（portal、getBoundingClientRect、pointerdown/keydown 监听）
- **自动获得无障碍能力**：ARIA role、焦点陷阱、键盘导航，无需手写
- **视口碰撞检测**：Radix 内置 @floating-ui，自动处理边界翻转，不再溢出屏幕
- **插件 SDK 导出基础**：迁移后的组件行为边界清晰，可安全导出给插件复用

## 为什么选择 Radix UI

评估了三类方案：

| 方案            | 代表库                    | 优点                                 | 缺点                                                     |
| --------------- | ------------------------- | ------------------------------------ | -------------------------------------------------------- |
| 全功能组件库    | Ant Design, MUI, Mantine  | 开箱即用，功能齐全                   | 自带样式系统，与项目 Tailwind + design token 体系冲突    |
| headless 行为库 | **Radix UI**, Headless UI | 只管行为和无障碍，样式完全由项目控制 | 需要自己写样式（但我们已有完整的设计系统，这反而是优势） |
| 保持自建        | 现有代码                  | 无新依赖                             | 持续维护成本高，无障碍缺失，插件导出困难                 |

选择 Radix UI 的理由：

1. **headless 架构**：不引入任何样式，与项目现有的 Tailwind + Alchemy RPG 设计系统零冲突
2. **按组件拆包**：只安装 `@radix-ui/react-popover` 一个包（+21.79 KB gzipped），不需要引入整个库
3. **Popover.Anchor 模式**：提供纯定位锚点（不拦截事件），这是与 Konva canvas 事件模型兼容的关键——Konva 自行处理右键事件，Radix 只负责在指定坐标弹出内容
4. **社区生态成熟**：shadcn/ui 等流行方案都基于 Radix，长期维护有保障

## 现状

项目当前有三套自建浮层组件，各自实现 portal、定位、click-outside、Escape 关闭：

| 组件               | 用途                  | 代码量                           | 调用点                                         |
| ------------------ | --------------------- | -------------------------------- | ---------------------------------------------- |
| `ConfirmPopover`   | 删除确认气泡          | 109 行                           | EntityRow、SceneListPanel、ArchivePanel        |
| `ContextMenu`      | 右键菜单              | 82 行                            | PortraitBar、BlueprintDockTab、MapDockTab、App |
| `TokenContextMenu` | Konva canvas 右键菜单 | 168 行（含 ~63 行定位/关闭逻辑） | KonvaMap                                       |

**问题**：

1. 约 200 行重复的底层逻辑（portal、getBoundingClientRect、pointerdown 监听、keydown 监听）
2. 无 ARIA 属性、无焦点管理、无键盘导航
3. ConfirmPopover 不处理视口边界碰撞（popover 可能溢出屏幕）
4. z-index 使用不规范（详见下文"z-index 层级问题"）

## 约束

1. **样式归属**：Radix 只管行为，所有视觉样式仍通过 Tailwind utility class + 项目 design token 实现，不引入任何 Radix 主题或外部 CSS
2. **Konva 事件模型不可侵入**：Radix 组件不得拦截或修改 Konva canvas 的事件传播链（`e.evt.stopPropagation()`、`e.cancelBubble`）。必须使用 `Popover.Anchor`（纯定位），禁止在 canvas 区域使用 `Popover.Trigger`（会拦截点击）
3. **增量迁移**：逐组件替换，每个调用点独立可验证。不做一次性大规模重写，避免引入回归
4. **Bundle 预算**：总 gzipped 增量不超过 25 KB。当前实测 +21.79 KB（含 @floating-ui），在预算内
5. **不改变外部 API**：迁移是内部实现替换，组件对外的 props 接口和使用方式保持一致（如 RadixContextMenu 仍接受 `{x, y, open, onClose, children}`）
6. **z-index 遵循语义分层**：迁移后所有浮层必须使用项目定义的语义 z-index（`z-popover: 5000`），不得使用硬编码魔法数字。当前 `10001` 是临时方案，需配合 z-index 修复一并解决

## POC 验证结论

在 `poc/radix-popover` 分支上，用 `@radix-ui/react-popover`（一个包）统一替换了三个场景，全部验证通过：

| 场景                                                   | 结果                    |
| ------------------------------------------------------ | ----------------------- |
| EntityRow 删除确认（Popover.Anchor + Popover.Content） | 通过                    |
| PortraitBar 右键菜单（RadixContextMenu wrapper）       | 通过（修复两个 bug 后） |
| KonvaMap Token 右键菜单（RadixContextMenu wrapper）    | 通过                    |
| build 无 TypeScript 错误                               | 通过                    |
| 动画流畅                                               | 通过                    |
| 双主题样式正确                                         | 通过                    |

**Bundle 影响**：+21.79 KB gzipped（236.47 → 258.26 KB），主要来自 `@floating-ui` 依赖。

## 架构方案

```
@radix-ui/react-popover
        │
   ┌────┴────┐
   │         │
直接使用    RadixContextMenu wrapper
   │         │ (保持命令式 {x,y} API)
   │         │
ConfirmPopover    ┌────┴────┐
(3处使用)          │         │
              ContextMenu  TokenContextMenu
              (DOM 触发)    (Konva canvas 触发)
```

### 核心技术：Popover.Anchor

Radix Popover 提供两种锚定方式：

- **Popover.Trigger**：声明式，自动处理点击事件打开/关闭
- **Popover.Anchor**：纯定位锚点，不拦截任何事件

使用 `Popover.Anchor` 配合 `open` controlled mode，可以：

1. 在任意 `{x, y}` 坐标放置一个 1×1 像素的虚拟锚点
2. 让 Radix 自动处理 Content 的定位、碰撞检测、翻转
3. 完全不干涉 Konva canvas 的事件模型

### RadixContextMenu wrapper

```tsx
// src/shared/ui/RadixContextMenu.tsx (~30 行)
// 保持命令式 API：{ x, y, open, onClose, children }
// 内部用 Popover.Anchor 在坐标处放置虚拟锚点
// 虚拟锚点通过 createPortal 渲染到 document.body（避免 CSS transform 包含块问题）
```

### ConfirmPopover 场景

不使用 RadixContextMenu wrapper，而是直接用 Radix Popover 原语：

- `Popover.Anchor asChild` 包裹触发按钮（自动锚定，不需要 ref）
- `Popover.Content` 渲染确认气泡
- `Popover.Arrow` 渲染箭头指向锚点

## 已知坑与解决方案

### 1. 动画 transform 冲突

**问题**：现有 `popover-in` 关键帧使用 `transform: translate(-50%, -100%) scale(0.95)`，但 Radix 内部也用 `transform` 进行定位（通过 CSS 变量 `--radix-popover-content-transform-origin`）。两个 transform 叠加导致位置跳变。

**解决方案**：为 Radix 组件创建独立的动画关键帧，仅使用 `opacity` + `scale`，不使用 `translate`：

```css
@keyframes radix-popover-in {
  from {
    opacity: 0;
    scale: 0.96;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}
```

在 Radix Content 的 className 中使用 `animate-[radix-popover-in_150ms_ease-out]`。

### 2. CSS transform 包含块（containment）

**问题**：PortraitBar 使用 `-translate-x-1/2` 居中，这会创建一个新的 CSS 包含块（containing block）。在其内部渲染的 `position: fixed` 子元素，定位参考系变为 PortraitBar 而非 viewport，导致虚拟锚点位置偏移到屏幕最右侧。

**解决方案**：RadixContextMenu 的虚拟锚点通过 `createPortal` 渲染到 `document.body`，绕过所有父级 transform 的影响：

```tsx
{
  createPortal(
    <Popover.Anchor asChild>
      <div style={{ position: 'fixed', left: x, top: y, width: 1, height: 1 }} />
    </Popover.Anchor>,
    document.body,
  )
}
```

**适用范围**：任何父组件使用了 `transform`、`perspective`、`filter`、`contain: paint` 的场景都会触发此问题。portal 方案是通用解法。

### 3. z-index 层级问题（现有 bug，非 Radix 引入）

**问题**：PortraitBar（角色栏）使用了 `z-toast`（10000），但它是一个常驻 UI 元素，不是 toast。这导致需要在其上弹出的菜单必须使用 > 10000 的 z-index 才能显示，违反了项目的 z-index 语义分层：

```
popover: 5000   ← 菜单应该在这一层
...
toast:   10000  ← PortraitBar 错误地在这一层
```

**当前临时方案**：RadixContextMenu Content 使用 `style={{ zIndex: 10001 }}`。

**建议修复**：将 PortraitBar 的 z-index 从 `z-toast` 降级为 `z-ui`（1000）。PortraitBar 是常驻 UI 元素，不应占用 toast 层。这需要同步检查是否有其他元素依赖 PortraitBar 的高 z-index 来实现层叠效果。

**影响分析**：PortraitBar 使用 `z-toast` 的原因可能是要盖住 Konva canvas（`z-tactical: 100`）和其他 UI 元素。使用 `z-ui`（1000）同样能满足这一需求，且语义正确。降级后，菜单可以正常使用 `z-popover`（5000），GmToolbar 也应一并检查（当前同样使用 `z-toast`）。

## 迁移范围

### 阶段一：核心迁移（POC 已完成，6 个文件）

| 文件                                 | 操作 | 说明                                      |
| ------------------------------------ | ---- | ----------------------------------------- |
| `src/shared/ui/RadixContextMenu.tsx` | 新建 | 命令式 {x,y} 定位 wrapper                 |
| `src/gm/EntityRow.tsx`               | 修改 | ConfirmPopover → Radix Popover            |
| `src/layout/PortraitBar.tsx`         | 修改 | ContextMenu → RadixContextMenu            |
| `src/combat/KonvaMap.tsx`            | 修改 | 用 RadixContextMenu 包裹 TokenContextMenu |
| `src/combat/TokenContextMenu.tsx`    | 修改 | 移除定位/关闭逻辑（~63 行），保留内容     |
| `src/styles/global.css`              | 修改 | 添加 `radix-popover-in` 关键帧            |

### 阶段二：剩余调用点迁移

| 文件                            | 当前组件       | 迁移方式                             |
| ------------------------------- | -------------- | ------------------------------------ |
| `src/gm/SceneListPanel.tsx`     | ConfirmPopover | → Radix Popover（同 EntityRow 模式） |
| `src/gm/ArchivePanel.tsx`       | ConfirmPopover | → Radix Popover（同 EntityRow 模式） |
| `src/dock/BlueprintDockTab.tsx` | ContextMenu    | → RadixContextMenu                   |
| `src/dock/MapDockTab.tsx`       | ContextMenu    | → RadixContextMenu                   |
| `src/App.tsx`                   | ContextMenu    | → RadixContextMenu                   |

### 阶段三：清理

- 删除 `src/ui/ConfirmPopover.tsx`
- 删除 `src/shared/ContextMenu.tsx`
- 删除 `global.css` 中旧的 `popover-in` 关键帧（确认无其他使用后）

## z-index 语义修复（建议与迁移一并执行）

| 组件                     | 当前              | 建议               | 理由                     |
| ------------------------ | ----------------- | ------------------ | ------------------------ |
| PortraitBar              | `z-toast` (10000) | `z-ui` (1000)      | 常驻 UI，非 toast        |
| GmToolbar                | `z-toast` (10000) | `z-ui` (1000)      | 常驻 UI，非 toast        |
| RadixContextMenu Content | `10001`（硬编码） | `z-popover` (5000) | z-index 修复后可用语义值 |

修复后的层级关系将回归规范：

```
base:     0      ← 背景
tactical: 100    ← Konva canvas
ui:       1000   ← PortraitBar, GmToolbar, Dock
popover:  5000   ← 菜单、确认气泡
overlay:  8000   ← 全屏遮罩
modal:    9000   ← 模态框
toast:    10000  ← 通知提示
```

## 插件 SDK 影响

迁移完成后，可在 `src/rules/sdk.ts` 中导出 Radix-based 的 UI 组件供插件使用：

```ts
// 未来：在 sdk.ts 中导出
export { RadixContextMenu } from '../shared/ui/RadixContextMenu'
```

插件使用基座的 UI 组件，自动获得一致的行为（定位、关闭、无障碍）和视觉风格（design token），无需自行实现浮层逻辑。

## Assumptions

1. `@radix-ui/react-popover` 的 `Popover.Anchor` 不会拦截或修改 DOM 事件传播，因此不影响 Konva canvas 的事件模型（POC 已验证）
2. Radix 的 `@floating-ui` 依赖能正确处理所有视口边界场景（碰撞翻转、滚动容器），无需手写边界检测逻辑
3. `createPortal` 到 `document.body` 是绕过 CSS transform 包含块的通用解法，不会引入新的 React 事件冒泡问题（portal 内事件仍沿 React 树冒泡）
4. 现有组件的 `items: ContextMenuItem[]` 数组 API 可以安全迁移为 JSX children 模式，无需保持向后兼容（无外部消费者）

## Edge Cases

1. **多个 Popover 同时打开**：Radix Popover 不互斥，如果同一页面有多个 `Popover.Root`（如 EntityRow 列表中多个删除确认），需确保同时只打开一个（由组件状态控制，非 Radix 职责）
2. **触控设备长按**：Radix 的 `onPointerDownOutside` 在触控设备上可能与长按手势冲突，需实测移动端表现
3. **SSR / React 18 hydration**：`createPortal(... , document.body)` 在 SSR 环境会报错。当前项目为纯 SPA，不受影响，但如果未来迁移到 SSR 框架需要条件渲染
4. **Konva Stage 全屏模式**：如果 Konva canvas 进入浏览器全屏 API（`requestFullscreen`），portal 到 `document.body` 的浮层会被全屏元素遮挡，需要将 portal target 改为全屏容器

## 依赖

```json
{
  "@radix-ui/react-popover": "^1.1.6"
}
```

仅此一个包。Radix 按组件拆包，不需要安装整个库。
