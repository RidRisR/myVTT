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

| Design Rule                                                  | Source                                                     | Code pattern                                    |
| ------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| 浮动层用 `fixed + left/top`，不用 transform                  | `CLAUDE.md` CSS containing block gotcha                    | `style={{ left: pos.x, top: pos.y }}`           |
| z-popover (5000) + `!important` 防止 consumer className 覆盖 | `tailwind.config.ts` z-index scale                         | `'fixed! z-popover!'`                           |
| `useClickOutside` 用于 click-outside dismiss                 | `useClickOutside.ts` (Radix Portal-aware)                  | `useClickOutside(cardRef, onClose, ...)`        |
| `stopPropagation` 阻止事件穿透到战术画布                     | `src/ui/primitives/PopoverContent.tsx` event isolation     | `onClick/onPointerDown/onWheel` handlers        |
| 拖拽 cleanup 防止 unmount 泄漏                               | `src/sandbox/PatternFloatingPanelOverlay.tsx` drag pattern | `dragCleanupRef` + `useEffect` return           |
| `createPortal` 渲染到 body                                   | Radix Portal 同等策略                                      | `createPortal(card, document.body)`             |
| 拖拽用 capture phase，不依赖 bubble                          | 子组件可能 `stopPropagation` 阻断冒泡                      | `onPointerDownCapture={handleDragStart}`        |
| `useClickOutside` mount-frame guard                          | 防止触发 mount 的 pointerdown 被自身捕获                   | `requestAnimationFrame(() => { armed = true })` |

## 陷阱清单

- ❌ 用 `transform: translate(x, y)` 定位 → 子元素 `position: fixed` 会相对于父级而非 viewport
- ✅ 用 `left/top` 定位 → 子元素 `position: fixed` 正确相对于 viewport

- ❌ 拖拽回调依赖 `pos` state → 每次拖拽帧都重建回调
- ✅ 拖拽回调读 `posRef` → 稳定回调，零依赖重建

- ❌ unmount 时不清理 document 事件监听器 → 监听器泄漏
- ✅ `dragCleanupRef` + `useEffect` cleanup → 安全清理

- ❌ Tailwind v4 `fixed` class 被 consumer `className="relative"` 覆盖（同 `@layer utilities`，CSS 源码顺序决定优先级）
- ✅ 用 `fixed!` / `z-popover!`（Tailwind v4 `!important` 修饰符）保护关键定位属性

- ❌ 拖拽挂在 root `onPointerDown`（bubble phase）→ 子组件 `stopPropagation` 阻断事件冒泡，拖拽失效
- ✅ 用 `onPointerDownCapture`（capture phase）→ root 先于子组件收到事件，`handleDragStart` 内部通过 `closest('button, input, ...')` 跳过交互元素

- ❌ `useClickOutside` 在 mount 帧立即 armed → 触发 mount 的那次 pointerdown 被自身监听器捕获，组件瞬间关闭
- ✅ `requestAnimationFrame` 延迟 arming → mount 帧的事件被忽略，下一帧开始正常监听

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
