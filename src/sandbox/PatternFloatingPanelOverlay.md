# FloatingPanel + NestedOverlay 模式

## 问题背景

AssetPickerDialog 开发中出现 15 个 bug，其中 73% 可追溯到一个核心错误：**用 Radix Dialog 作为复杂交互面板的容器**。

Dialog 设计上就不适合承载嵌套 overlay（Popover、ContextMenu）或拖拽交互。问题不是 Dialog 有 bug，而是它的架构约束与这些交互系统根本冲突。

PR #138 验收测试又发现：即使用了自定义浮层，如果**inline 渲染在有 `transform`/`backdrop-filter` 的祖先内**，`position: fixed` 同样会失效。`createPortal(jsx, document.body)` 是必须的。

## 架构原则

### 1. 容器选择：Dialog vs 自定义浮层

**Dialog 的 3 个隐性约束：**

| 约束                 | 表现                                                         | 与嵌套 overlay 的冲突                                               |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Portal 隔离          | Dialog 内容渲染在 `<body>` 下的独立 Portal                   | 内部的 Popover/ContextMenu 再次 Portal 时，DOM 层级关系断裂         |
| Modal pointer-events | `pointer-events: none` 阻塞 Dialog 外的所有交互              | DragOverlay、外部 drop target 全部失效                              |
| transform 居中       | `transform: translate(-50%, -50%)` 创建 CSS containing block | 子级 `position: fixed` 变成相对于 Dialog 定位，Popover 位置完全错位 |

**判断标准：**

- 内部只有表单/文本/按钮 → Dialog 合适
- 内部有嵌套 overlay（Popover、ContextMenu）→ **自定义浮层**
- 内部有拖拽（@dnd-kit、原生 drag）→ **自定义浮层**
- 需要不阻塞背景交互 → **自定义浮层**

### 2. createPortal 逃逸 containing block

浮层面板**必须**通过 `createPortal(jsx, document.body)` 渲染，不能 inline 渲染在触发组件内。

**为什么：** 当面板的触发组件（按钮、菜单项）位于有 `transform`、`backdrop-filter`、`filter` 或 `will-change` 的祖先内时，这些 CSS 属性会创建 CSS containing block。此时 inline 渲染的 `position: fixed` 元素的定位不再相对于 viewport，而是相对于该祖先。

**真实案例**（PR #138 Bug 1）：

- `MyCharacterCard.tsx` — `-translate-y-1/2`（transform）+ `backdrop-blur-[16px]`（backdrop-filter）
- `HamburgerMenu.tsx` — `backdrop-blur-[16px]`（backdrop-filter）

从这些组件内打开 AssetPickerPanel 时，面板被限制在组件区域内，无法作为独立浮层。

```tsx
// ❌ 错误：inline 渲染 — 如果祖先有 transform，fixed 定位会被困住
{
  open && <FloatingPanel onClose={handleClose} />
}

// ✅ 正确：createPortal 渲染到 <body> — 完全脱离 DOM 树
{
  open && createPortal(<FloatingPanel onClose={handleClose} />, document.body)
}
```

**这不是条件性的** — 即使当前触发组件没有 transform 祖先，未来重构可能会引入。始终使用 `createPortal` 是安全的默认选择。

### 3. 定位方式：fixed + left/top，不用 transform

**CSS containing block 陷阱：**

当父元素有 `transform`、`filter` 或 `will-change` 时，会创建新的 containing block。此时子元素的 `position: fixed` 不再相对于 viewport，而是相对于该父元素。

```tsx
// ❌ 错误：transform 创建 containing block
<div style={{ transform: `translate(${x}px, ${y}px)` }}>
  <Popover>  {/* Popover 的 fixed 定位相对于这个 div，不是 viewport */}
</div>

// ✅ 正确：left/top 不创建 containing block
<div style={{ position: 'fixed', left: x, top: y }}>
  <Popover>  {/* Popover 的 fixed 定位正确相对于 viewport */}
</div>
```

### 4. z-index 分层与 Portal

项目 z-index scale（参见 `tailwind.config.ts`）：

```
base(0) → tactical(100) → ui(1000) → popover(5000) → overlay(8000) → modal(9000) → toast(10000)
```

浮层面板用 `z-ui`(1000)，内部的 Popover/ContextMenu 用 `z-popover`(5000)。

**关键规则：面板的 z-index 必须低于 z-popover。** 面板通过 `position: fixed` 渲染，Radix overlay 通过 Portal 渲染到 `<body>`——两者都在 root stacking context 中。在同一 stacking context 内，**z-index 数值直接比较，DOM 顺序不起作用**。如果面板用 `z-overlay`(8000) > `z-popover`(5000)，Popover 和 ContextMenu 会被面板遮挡。

### 5. 事件隔离：stopPropagation 策略

**核心原则：只在交互级使用 stopPropagation，禁止在容器级使用。**

Radix 的 `DismissableLayer`（DropdownMenu、Popover、ContextMenu 共用）依赖 `document` 级别的 `pointerdown` 监听来检测"外部点击"并关闭 overlay。如果容器级 `stopPropagation` 阻断了事件冒泡到 `document`，**所有嵌套的 Radix overlay 都无法通过外部点击关闭**。

```tsx
// ❌ 容器级 stopPropagation — 阻断 Radix dismiss，DropdownMenu/Popover 无法关闭
<div onPointerDown={(e) => { e.stopPropagation() }}>
  <DropdownMenu.Root>...</DropdownMenu.Root>  {/* 点击面板其他区域无法关闭 */}
</div>

// ✅ 交互级 stopPropagation — 只在特定按钮/输入框上阻止父级 handler
<div>
  <button onClick={(e) => { e.stopPropagation() }}>Edit</button>  {/* 防止触发行的 onClick */}
  <DropdownMenu.Root>...</DropdownMenu.Root>  {/* 正常关闭 */}
</div>
```

**面板与 canvas 的隔离不需要 stopPropagation：**

固定定位面板（sidebar、dock、toolbar）和 Konva canvas 是 DOM 树的**兄弟子树**——事件只沿祖先链冒泡，永远不会从一个兄弟冒泡到另一个兄弟。CSS `pointer-events: none`（容器）+ `pointer-events: auto`（内容）已经足够实现隔离。

**三种 stopPropagation 的正确使用层级：**

| 层级               | 示例                                | 目的                                    | 对 Radix 的影响                |
| ------------------ | ----------------------------------- | --------------------------------------- | ------------------------------ |
| Radix wrapper 内置 | `PopoverContent` 的 `onPointerDown` | 防止 Popover 内的点击冒泡到父级 handler | 无影响（在 Portal 内部）       |
| 交互级             | 按钮、输入框的 `onClick`            | 防止触发父级行/卡片的 click handler     | 无影响（精确隔离）             |
| ~~容器级~~         | ~~面板外层 div 的 `onPointerDown`~~ | ~~防止 canvas 交互~~                    | **破坏所有嵌套 Radix overlay** |

`ContextMenuContent` **没有**内置 `stopPropagation`——它依赖 Radix 内部的 dismissal 机制管理关闭行为。

两者共同依赖的安全网：`useClickOutside` hook（`src/hooks/useClickOutside.ts`）自动检测 `[data-radix-popper-content-wrapper]`，将 Radix Portal 内的点击视为"内部点击"，不触发面板关闭。

## 约束清单

| 设计规则                                                   | 来源                                                                                           | 代码                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 浮层必须用 `createPortal` 渲染到 `document.body`           | `CLAUDE.md:33` CSS containing block gotcha, PR #138 Bug 1 验证                                 | `PatternFloatingPanelOverlay.tsx:L88` `createPortal(<FloatingPanel />, document.body)`   |
| 浮层用 `fixed + left/top` 定位，不用 `transform`           | `CLAUDE.md:33` CSS containing block gotcha                                                     | `PatternFloatingPanelOverlay.tsx:L161` `style={{ left, top }}`                           |
| 面板 z-index 必须低于 z-popover                            | `docs/conventions/ui-patterns.md:10` z-index Scale                                             | `PatternFloatingPanelOverlay.tsx:L160` `z-ui` (1000 < 5000)                              |
| 嵌套 overlay 用项目 wrapper，不直接用 `@radix-ui/*`        | `docs/conventions/ui-patterns.md:36` Radix wrappers 表                                         | `PatternFloatingPanelOverlay.tsx:L188` `<PopoverContent>`, `L208` `<ContextMenuContent>` |
| click-outside 必须感知 Radix Portal                        | `src/hooks/useClickOutside.ts:24` `data-radix-popper-content-wrapper` 检测                     | `PatternFloatingPanelOverlay.tsx:L115` `useClickOutside(panelRef, onClose, true)`        |
| PopoverContent 有 stopPropagation，ContextMenuContent 没有 | `src/ui/primitives/PopoverContent.tsx:29,33` vs `ContextMenuContent.tsx`（无 stopPropagation） | 文档记录，非代码实现                                                                     |
| 高频 handler 用 ref 持有可变状态，callback 零依赖          | React 性能最佳实践（避免每帧重建闭包）                                                         | `PatternFloatingPanelOverlay.tsx:L107` `posRef` + `L127` `useCallback(…, [])`            |
| 组件卸载时清理 document 事件监听                           | React useEffect cleanup 规范                                                                   | `PatternFloatingPanelOverlay.tsx:L110` `dragCleanupRef` + `L119-123` cleanup effect      |
| 禁止容器级 stopPropagation（阻断 Radix dismiss）           | Radix DismissableLayer 依赖 document 级 pointerdown                                            | 文档记录：面板与 canvas 隔离用 CSS `pointer-events`，不用 stopPropagation                |

## 陷阱清单

1. **不要在 `transform`/`backdrop-filter` 祖先内 inline 渲染浮层** — 必须用 `createPortal(jsx, document.body)` 逃逸 containing block
2. **不要在浮层上用 `transform` 做定位或动画** — 会破坏所有子级的 fixed 定位
3. **不要用 Dialog 包装复杂面板** — modal 行为和 transform 居中都是地雷
4. **不要手写 click-outside 逻辑** — 用 `useClickOutside`，它已处理 Radix Portal
5. **不要在 Radix wrapper 之外直接用 `@radix-ui/*`** — 会丢失内置的 stopPropagation 保护
6. **不要给浮层加 `will-change: transform`** — 同样会创建 containing block
7. **不要在包含 Radix overlay 的容器上加 `onPointerDown` + `stopPropagation`** — 阻断 `document` 级事件冒泡，导致 DropdownMenu/Popover/ContextMenu 无法通过外部点击关闭。面板与 canvas 的隔离应用 CSS `pointer-events: none/auto`

## 适用场景

- ✅ 素材选择器（AssetPicker）— 内部有标签筛选、拖拽排序、右键菜单
- ✅ 属性编辑面板 — 内部有 Popover 颜色选择器、下拉菜单
- ✅ 任何内部有 2+ 交互系统的浮层
- ❌ 简单确认弹窗 — 用 Dialog
- ❌ 纯表单填写 — 用 Dialog
- ❌ 需要强制焦点陷阱的场景 — 用 Dialog
