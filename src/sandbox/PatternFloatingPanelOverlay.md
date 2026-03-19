# FloatingPanel + NestedOverlay 模式

## 问题背景

AssetPickerDialog 开发中出现 15 个 bug，其中 73% 可追溯到一个核心错误：**用 Radix Dialog 作为复杂交互面板的容器**。

Dialog 设计上就不适合承载嵌套 overlay（Popover、ContextMenu）或拖拽交互。问题不是 Dialog 有 bug，而是它的架构约束与这些交互系统根本冲突。

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

### 2. 定位方式：fixed + left/top，不用 transform

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

### 3. z-index 分层与 Portal

项目 z-index scale（参见 `tailwind.config.ts`）：

```
base(0) → tactical(100) → ui(1000) → popover(5000) → overlay(8000) → modal(9000) → toast(10000)
```

浮层面板用 `z-overlay`(8000)，内部的 Popover/ContextMenu 用 `z-popover`(5000)。

**为什么 5000 < 8000 但 Popover 视觉上在面板上方？** 因为 Radix overlay 通过 Portal 渲染到 `<body>` 的末尾，DOM 顺序在面板之后。在同一 stacking context 中，**DOM 顺序晚 = 视觉层级高**（当 z-index 未在同一 stacking context 比较时）。Portal 让 overlay 脱离了面板的 stacking context，进入 root stacking context。

### 4. 事件隔离：stopPropagation 策略

项目的 Radix wrapper（`PopoverContent`、`ContextMenuContent`）已内置 `stopPropagation`：

- `onClick` → `e.stopPropagation()` — 防止点击冒泡到父级 click handler
- `onPointerDown` → `e.stopPropagation()` — 防止触发父级的 `useClickOutside`

`useClickOutside` hook（`src/hooks/useClickOutside.ts`）自动检测 `[data-radix-popper-content-wrapper]`，将 Radix Portal 内的点击视为"内部点击"，不触发关闭。

## 陷阱清单

1. **不要在浮层上用 `transform` 做定位或动画** — 会破坏所有子级的 fixed 定位
2. **不要用 Dialog 包装复杂面板** — modal 行为和 transform 居中都是地雷
3. **不要手写 click-outside 逻辑** — 用 `useClickOutside`，它已处理 Radix Portal
4. **不要在 Radix wrapper 之外直接用 `@radix-ui/*`** — 会丢失内置的 stopPropagation 保护
5. **不要给浮层加 `will-change: transform`** — 同样会创建 containing block

## 适用场景

- ✅ 素材选择器（AssetPicker）— 内部有标签筛选、拖拽排序、右键菜单
- ✅ 属性编辑面板 — 内部有 Popover 颜色选择器、下拉菜单
- ✅ 任何内部有 2+ 交互系统的浮层
- ❌ 简单确认弹窗 — 用 Dialog
- ❌ 纯表单填写 — 用 Dialog
- ❌ 需要强制焦点陷阱的场景 — 用 Dialog
