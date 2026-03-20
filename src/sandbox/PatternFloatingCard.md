# FloatingCard

## 问题背景

Radix Popover 无法满足 PortraitBar 角色卡片的需求：多实例钉住、拖拽、动态锚点切换。
需要一个自定义浮动卡片原语，支持 anchored（锚定模式）和 floating（自由拖拽模式）。

## 架构原则

- **`position: fixed + left/top`** — 绝对不用 transform 定位，避免 CSS containing block 陷阱
- **`createPortal(card, document.body)`** — 脱离任何父级 transform 容器
- **`posRef + useState` 拖拽模式** — ref 持有权威值避免回调重建，state 驱动渲染
- **三种 dismiss 策略** — `mouseleave`（hover 卡）、`clickoutside`（click 卡）、`manual`（钉住卡）

## 约束清单

| Design Rule                                                              | Source                                       | Code                        |
| ------------------------------------------------------------------------ | -------------------------------------------- | --------------------------- |
| 浮动层用 `fixed + left/top`，不用 transform                              | `CLAUDE.md` CSS containing block gotcha      | `FloatingCard.tsx:L140-142` |
| z-popover (5000) 用于浮动卡片，`!important` 防止 consumer className 覆盖 | `tailwind.config.ts:L26`                     | `FloatingCard.tsx:L155`     |
| `useClickOutside` 用于 click-outside dismiss                             | `useClickOutside.ts` (Radix Portal-aware)    | `FloatingCard.tsx:L102`     |
| `stopPropagation` 阻止事件穿透到战术画布                                 | `PopoverContent.tsx` event isolation pattern | `FloatingCard.tsx:L146-152` |
| 拖拽 cleanup 防止 unmount 泄漏                                           | `PatternFloatingPanelOverlay.tsx:L89-93`     | `FloatingCard.tsx:L105-108` |
| `createPortal` 渲染到 body                                               | Radix Portal 同等策略                        | `FloatingCard.tsx:L163`     |

## 陷阱清单

- ❌ 用 `transform: translate(x, y)` 定位 → 子元素 `position: fixed` 会相对于父级而非 viewport
- ✅ 用 `left/top` 定位 → 子元素 `position: fixed` 正确相对于 viewport

- ❌ 拖拽回调依赖 `pos` state → 每次拖拽帧都重建回调
- ✅ 拖拽回调读 `posRef` → 稳定回调，零依赖重建

- ❌ unmount 时不清理 document 事件监听器 → 监听器泄漏
- ✅ `dragCleanupRef` + `useEffect` cleanup → 安全清理

- ❌ Tailwind v4 `fixed` class 被 consumer `className="relative"` 覆盖（同 `@layer utilities`，CSS 源码顺序决定优先级）
- ✅ 用 `fixed!` / `z-popover!`（Tailwind v4 `!important` 修饰符）保护关键定位属性

## 适用场景

**适用：**

- 需要拖拽的浮动卡片/面板
- 需要多实例同时存在
- 需要不同的 dismiss 策略
- 需要从 anchored 切换到 floating 模式

**不适用：**

- 简单的下拉菜单/工具提示 → 用 Radix Popover/Tooltip
- 模态对话框 → 用 Radix Dialog
- 固定位置的侧边栏 → 直接 CSS
