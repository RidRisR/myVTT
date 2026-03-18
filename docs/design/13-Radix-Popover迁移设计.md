# 13 — Radix 浮层统一迁移设计

**开发分支**：`poc/radix-popover`
**工作目录**：`../myVTT-radix-poc`（git worktree）

迁移已完成。所有自建浮层组件已替换为 Radix UI 语义组件。

## 动机与目标

项目即将开放插件系统（rule-plugin-system），插件需要与主系统保持一致的 UI 行为和视觉风格。当前浮层组件（弹窗、菜单、确认气泡）全部自建，存在两个核心问题：

1. **重复且不完整**：三套组件各自实现 portal / 定位 / 关闭逻辑，但都缺少无障碍支持（ARIA 属性、焦点管理、键盘导航），且 ConfirmPopover 不处理视口碰撞
2. **无法安全导出给插件**：自建组件的行为边界不明确（如 click-outside 监听在复杂布局下可能误触），直接导出给插件使用会带来难以排查的 bug

引入成熟的 headless UI 库统一浮层行为，让基座和插件共享同一套经过社区验证的底层能力。

### 预期收益

- **减少 ~200 行** 重复的底层逻辑（portal、getBoundingClientRect、pointerdown/keydown 监听）
- **自动获得无障碍能力**：ARIA role、焦点陷阱、键盘导航（ContextMenu/DropdownMenu 场景），无需手写
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
2. **按语义拆包**：每种交互模式使用对应的包，获得正确的 ARIA 语义和键盘行为
3. **Popover.Anchor 模式**：提供纯定位锚点（不拦截事件），这是与 Konva canvas 事件模型兼容的关键
4. **社区生态成熟**：shadcn/ui 等流行方案都基于 Radix，长期维护有保障

## 架构方案（最终版）

按语义使用三个 Radix 包：

```
┌─────────────────────────────────────────────┐
│            @radix-ui/react-context-menu     │
│  PortraitBar / BlueprintDockTab / MapDockTab / App  │
│  (DOM 右键菜单，完整键盘导航 + ARIA)       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│           @radix-ui/react-dropdown-menu     │
│  EntityRow ⋮ 按钮下拉菜单                  │
│  (按钮触发菜单，完整键盘导航 + ARIA)       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│           @radix-ui/react-popover           │
│  ConfirmPopover (EntityRow/SceneListPanel/  │
│    ArchivePanel) — 确认气泡                 │
│  RadixContextMenu wrapper (KonvaMap) —      │
│    Konva 专用，Popover.Anchor 命令式定位    │
└─────────────────────────────────────────────┘
```

### 为什么不是一个包打天下

POC 阶段用 `react-popover` 一个包处理所有场景。评审发现：手动添加 `role="menu"` 但缺少键盘导航（方向键、typeahead），导致 ARIA 语义与实际行为不匹配——对屏幕阅读器用户比不标注更差。

`react-context-menu` 和 `react-dropdown-menu` 共享 `@radix-ui/react-menu` 内部依赖，第二个包的边际 bundle 成本接近 0。

### Konva 特殊处理

Konva canvas 自行管理右键事件（`e.evt.stopPropagation()`），Radix 的 Trigger 组件会拦截点击事件，与 Konva 冲突。因此 KonvaMap 的 TokenContextMenu 使用 `react-popover` + `Popover.Anchor` 方案：

- 在 `{x, y}` 坐标放置 1×1 虚拟锚点（通过 `createPortal` 到 body）
- Radix 只负责定位和碰撞检测，不干涉 Konva 事件链
- 组件保持命令式 API：`{ x, y, open, onClose, children }`

## 已知坑与解决方案

### 1. 动画 transform 冲突

**问题**：Radix 内部用 `transform` 进行定位。自定义动画中的 `translate` 会与之叠加导致位置跳变。

**解决方案**：动画关键帧仅使用 `opacity` + `scale`，不使用 `translate`：

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

### 2. CSS transform 包含块（containment）

**问题**：PortraitBar 使用 `-translate-x-1/2` 居中，创建新的 CSS 包含块。

**解决方案**：

- DOM 右键菜单：`ContextMenu.Portal` 默认渲染到 body，不受影响
- Konva 菜单：RadixContextMenu 的虚拟锚点通过 `createPortal` 渲染到 body

### 3. DropdownMenu + Popover 多原语时序冲突（已修复）

**问题**：EntityRow 的 ⋮ 菜单使用 DropdownMenu，点击"删除"后需弹出 Popover 确认气泡。DropdownMenu 关闭时派发的 pointer/focus 事件被 Popover 误判为 dismiss 信号，导致确认气泡一闪即逝。

**根因**：Radix 每个原语独立管理 dismiss 生命周期，无跨原语协调机制。

**解决方案**：提取 `ConfirmDropdown` 组件（`src/ui/ConfirmDropdownItem.tsx`），内置两层防护：

1. `requestAnimationFrame` 延迟 Popover 打开，跳过 DropdownMenu 关闭序列
2. `onPointerDownOutside` / `onFocusOutside` 阻止 Popover 被残余事件关闭

**额外坑**：`Popover.Anchor asChild` 必须包裹真实 DOM 节点（如 `<div>`），不能直接包裹 `DropdownMenu.Root`（context provider，无 DOM 输出），否则 anchor 为 null，Popover 不渲染。

**测试覆盖**：`src/ui/__tests__/ConfirmDropdown.test.tsx`（7 个用例）

### 4. z-index 语义修复（已完成）

**问题**：几乎所有固定 UI 元素都滥用 `z-toast`（10000），导致菜单需要 >10000 才能显示。

**修复**：将所有常驻 UI 从 `z-toast` 降级为 `z-ui`（1000），共 12 个文件 18 处修改。修复后的层级：

```
base:     0      ← 背景
tactical: 100    ← Konva canvas
ui:       1000   ← PortraitBar, GmDock, TacticalToolbar, ChatPanel, etc.
popover:  5000   ← 菜单、确认气泡
overlay:  8000   ← 全屏遮罩
modal:    9000   ← 模态框
toast:    10000  ← 通知提示（仅 ToastProvider）
```

## 迁移结果

### 已删除组件

| 文件                                | 说明                                           |
| ----------------------------------- | ---------------------------------------------- |
| `src/ui/ConfirmPopover.tsx`         | 109 行自建确认气泡，已被 Radix Popover 替代    |
| `src/shared/ContextMenu.tsx`        | 82 行自建右键菜单，已被 Radix ContextMenu 替代 |
| `global.css` 中 `popover-in` 关键帧 | 旧动画，已被 `radix-popover-in` 替代           |

### 迁移文件清单

| 文件                                        | Radix 组件             | 说明                                          |
| ------------------------------------------- | ---------------------- | --------------------------------------------- |
| `src/ui/ConfirmDropdownItem.tsx`            | DropdownMenu + Popover | **新增**：封装多原语时序修复的复合组件        |
| `src/ui/__tests__/ConfirmDropdown.test.tsx` | —                      | **新增**：7 个用例覆盖完整交互契约            |
| `src/gm/EntityRow.tsx`                      | ConfirmDropdown        | ⋮ 下拉菜单 + 删除确认（使用 ConfirmDropdown） |
| `src/layout/PortraitBar.tsx`                | ContextMenu            | 角色头像右键菜单                              |
| `src/dock/BlueprintDockTab.tsx`             | ContextMenu            | 蓝图右键菜单                                  |
| `src/dock/MapDockTab.tsx`                   | ContextMenu            | 地图素材右键菜单                              |
| `src/App.tsx`                               | ContextMenu            | 背景右键添加 NPC                              |
| `src/gm/SceneListPanel.tsx`                 | Popover                | 场景删除确认                                  |
| `src/gm/ArchivePanel.tsx`                   | Popover                | 存档删除/加载确认                             |
| `src/ui/RadixContextMenu.tsx`               | Popover (Konva 专用)   | 简化为 Konva-only wrapper                     |
| `src/combat/TokenContextMenu.tsx`           | —                      | 移除 role 属性，修复硬编码颜色                |

### z-index 修复文件

PortraitBar, GmDock, AmbientAudio, SceneButton, SceneConfigPanel, SceneListPanel, MyCharacterCard, HamburgerMenu, TacticalToolbar, ChatPanel, MessageScrollArea — 共 12 文件 `z-toast` → `z-ui`

## Bundle 影响

| 阶段                      | gzipped size | 增量      |
| ------------------------- | ------------ | --------- |
| 迁移前                    | 236.47 KB    | —         |
| POC（react-popover only） | 258.26 KB    | +21.79 KB |
| 最终（三包）              | 264.59 KB    | +28.12 KB |

+28 KB 超出最初 25 KB 预算约 3 KB，但换来了完整的菜单键盘导航和正确的 ARIA 语义。

## 约束

1. **样式归属**：Radix 只管行为，所有视觉样式仍通过 Tailwind utility class + 项目 design token 实现
2. **Konva 事件模型不可侵入**：Konva 场景使用 `Popover.Anchor`（纯定位），禁止使用 Trigger
3. **z-index 遵循语义分层**：所有浮层使用 `z-popover`（5000），不得硬编码

## 插件 SDK 影响

迁移完成后，可在 `src/rules/sdk.ts` 中导出 Radix-based 的 UI 组件供插件使用：

```ts
// 未来：在 sdk.ts 中导出
export { RadixContextMenu } from '../ui/RadixContextMenu'
```

## Assumptions

1. `Popover.Anchor` 不拦截 DOM 事件传播，不影响 Konva canvas 事件模型（POC 已验证）
2. Radix `@floating-ui` 能正确处理所有视口边界场景
3. `createPortal` 到 `document.body` 不会引入 React 事件冒泡问题
4. `ContextMenu.Portal` / `DropdownMenu.Portal` 默认渲染到 body，绕过 CSS transform 包含块

## Edge Cases

1. **多个 Popover 同时打开**：由组件状态控制，非 Radix 职责
2. **触控设备长按**：Radix ContextMenu 在触控设备上的行为需实测
3. **SSR**：当前为纯 SPA，不受 `createPortal(body)` 影响
4. **Konva 全屏模式**：portal 到 body 的浮层会被全屏元素遮挡，需改 portal target

## 依赖

```json
{
  "@radix-ui/react-popover": "^1.1.15",
  "@radix-ui/react-context-menu": "^2.2.6",
  "@radix-ui/react-dropdown-menu": "^2.1.6"
}
```
