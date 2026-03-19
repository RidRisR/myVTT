# AssetPicker 验收问题记录

Phase 3（AssetPicker + Dock 统一）手动验收过程中发现的问题及修复记录。

## 已修复问题

### 1. 空状态布局错乱

**现象**：Maps 面板空状态时 "No images yet" 文字和上传按钮错位挤在一行；Blueprints 面板空状态时出现大块 "No token blueprints / Upload token images..." 占据过多空间。
**修复**：移除空状态文字提示，保留 "+" 上传按钮作为唯一入口。两个面板统一为：标签过滤栏 + 圆形缩略图列表 + 上传按钮。

### 2. Radix Dialog aria-describedby 警告

**现象**：打开 AssetPicker 对话框时控制台出现 `Missing Description or aria-describedby` 警告。
**修复**：在 DialogContent 原语中添加 `aria-describedby={undefined}` 显式抑制。

### 3. 对话框叠加过暗

**现象**：AssetPicker 对话框使用标准暗色遮罩，叠加在已经较暗的 VTT 界面上导致画面几乎全黑。
**修复**：添加 `noOverlay` prop 到 DialogContent，AssetPicker 使用无遮罩模式。

### 4. 对话框背景透明

**现象**：去除遮罩后对话框没有可见背景色，内容无法和背景区分。
**修复**：添加 `bg-surface border border-border-glass rounded-xl p-5 shadow-xl` 给对话框实体背景。

### 5. 拖动对话框时跳变（transform 覆盖）

**现象**：拖动对话框标题栏时，对话框瞬间跳到左上方。
**根因**：`useDraggable` 设置 `style.transform` 覆盖了 Tailwind 的 `-translate-x-1/2 -translate-y-1/2` 居中 transform，导致居中偏移丢失。
**临时修复**：改用 `style.left`/`style.top` 调整位置。
**系统性修复**：见问题 #7。

### 6. 拖动标签时跳变（CSS containing block）

**现象**：在 AssetPicker 内拖动标签时，标签预览出现位置跳变。
**根因**：DialogContent 的 `transform: translate(-50%, -50%)` 居中方式创建了 CSS containing block，导致 @dnd-kit DragOverlay 的 `position: fixed` 相对于对话框而非视口，坐标系不匹配。
**临时修复**：`createPortal(DragOverlay, document.body)` + `zIndex={9100}`。
**系统性修复**：见问题 #7。

### 7. DialogContent 系统性重构（根因修复）

**问题**：问题 #5 和 #6 的 patch-on-patch 方案（portal + z-index hack）不够优雅。
**系统性修复**：重构 DialogContent 居中方式：

- **之前**：`left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`（transform 居中）
- **之后**：`fixed inset-0 flex items-center justify-center pointer-events-none`（flex 居中）+ 内层 `pointer-events-auto` div
- 消除了所有 `transform`，不再创建 containing block
- @dnd-kit DragOverlay 无需 portal 或手动 z-index
- useDraggable 改用 `position: relative` + `left`/`top`（不创建 fixed 子元素的 containing block）
- 更新 CLAUDE.md Architecture Gotchas 记录两条新规则

### 8. 图片排序回弹

**现象**：拖动图片排序后，放下鼠标图片回到原位。
**根因**：

1. AssetGridItem 同时注册 `useSortable`（id=`asset.id`）和 `useDroppable`（id=`drop-${asset.id}`），@dnd-kit 可能解析 `over` 为 droppable，导致 `over.id = "drop-xxx"`，`filteredAssets.findIndex` 返回 -1，整个 reorder 被静默跳过。
2. `reorderAssets` 等待 API 响应后才更新 store，@dnd-kit 动画结束时 UI 已回到旧数组顺序。
   **修复**：
3. 统一用 `overData.assetId` 解析真实资产 ID，兼容 sortable 和 droppable 两种 over 目标。
4. 添加乐观更新：先在本地更新 `sortOrder` 并重排数组，再发 API 请求。

### 9. 拖拽图片时幽灵图不跟随鼠标

**现象**：拖动图片排序时，被拖动的图片不跟随光标移动。
**根因**：DragOverlay 组件存在于 DndContext 树中，@dnd-kit 检测到后全局切换到 overlay 模式——不再通过 `useSortable` 的 transform 移动原始元素。但 DragOverlay 只渲染了 tag 预览，asset 拖拽时渲染 `null`。
**修复**：在 `handleDragStart` 中也追踪被拖拽的 asset，DragOverlay 同时处理 tag 和 asset 两种拖拽预览。

### 10. 右键上下文菜单在对话框内不可用

**现象**：在 AssetPicker 对话框内右击图片，上下文菜单不出现（或出现后不可交互）。
**根因**：Radix Dialog 默认为 `modal` 模式，`DialogContentModal` 向 `DismissableLayer` 传递 `disableOutsidePointerEvents: true`。这会对 Dialog.Content 之外的所有 DOM 元素设置 `pointer-events: none`。由于 `ContextMenu.Portal` 在 `document.body` 层级渲染（在 Dialog.Portal 之外），其内容被标记为不可交互。即使 `z-context`(9500) 在数值上高于 `z-modal`(9000)，菜单也无法响应指针事件。
**修复**：三层问题需同时解决：

1. **指针事件层**：`Dialog.Root` 设置 `modal={false}`，移除 Dialog 的 `disableOutsidePointerEvents`
2. **视觉层级层**：新增 `z-context`(9500) > `z-modal`(9000)，ContextMenuContent 使用 `z-context` class
3. **菜单关闭层**：`ContextMenu.Root` 设置 `modal={false}`，移除 ContextMenu 自身的 `disableOutsidePointerEvents`（否则 body 上 `pointer-events: none` 阻止外部点击产生事件）
4. **外部交互层**：DialogContent 移除 `stopPropagation()`（阻止了 DismissableLayer 的 document 级 pointerdown 监听），`onInteractOutside={(e) => e.preventDefault()}` 防止点击外部时关闭对话框

### 11. 标签系统不完整

**现象**：界面只显示系统预置标签（autoTags），不显示用户自定义标签，也不显示每张图片上已有的标签。标签系统形同虚设。
**状态**：待讨论方案。

### 12. Category tabs 和搜索框不在同一行

**现象**：AssetPicker 对话框中，category tabs（All / Maps / Tokens）和搜索框分属两行，与设计稿不符。
**根因**：搜索框在独立的 `<div>` 中渲染，位于 `TagFilterBar` 上方，两者是兄弟元素无法共享一行。
**修复**：

1. TagFilterBar 新增 `categoryTrailing` 插槽 prop，在 category tab 行尾部渲染（flex spacer 推到右侧）
2. AssetPickerDialog 将搜索框传入 `categoryTrailing`，移除独立搜索 div
3. 同时简化逻辑：categories 在所有模式下始终显示，移除 `mode === 'manage'` 条件判断

### 13. X 关闭按钮被拖拽劫持无法点击

**现象**：AssetPicker 对话框标题栏的 X 关闭按钮点击无反应，无法关闭对话框。
**根因**：`useDraggable` hook 在 `handlePointerDown` 中用 `e.target.tagName === 'BUTTON'` 判断是否跳过拖拽。但 Lucide `<X />` 图标渲染为 `<svg><path/></svg>`，点击图标时 `e.target` 是 `<svg>` 或 `<path>`，tagName 不匹配 `'BUTTON'`，导致拖拽 handler 捕获了 pointer 事件，阻止了 Dialog.Close 的 click 触发。
**修复**：将 `tagName` 直接比较改为 `target.closest('button, input, a, [role="button"]')` 向上查找祖先元素，确保点击按钮内部任何子元素（包括 SVG 图标）时都能正确跳过拖拽。
**系统性预防**：此模式适用于所有 drag handle 内嵌交互元素的场景，`closest()` 比 `tagName` 更健壮。

### 14. TagEditorPopover 在 Dialog 内不可见

**现象**：AssetPicker 对话框内右键 → Edit Tags，Popover 状态为 open 但完全不可见。
**根因**：三层问题叠加：

1. **z-index 层级**：PopoverContent 默认 `z-popover`(5000)，低于 Dialog 的 `z-modal`(9000)。Popover.Portal 渲染在 `document.body`，不继承 Dialog 的 z-index 上下文，导致 Popover 被 Dialog 完全遮挡。
2. **Tailwind class 冲突**：传入 `className="z-context"` 无效，因为 PopoverContent 内部已有 `z-popover`，两个 z-index class 共存时 Tailwind 按 CSS 生成顺序决定优先级，`z-popover` 可能胜出。
3. **Popover.Trigger 点击切换**：最初使用 `Popover.Trigger asChild` 包裹 grid item，ContextMenu 关闭后焦点回到 Trigger 可能触发 toggle 导致 Popover 立即关闭。
   **修复**：
4. `Popover.Trigger` → `Popover.Anchor`（只定位，不响应点击切换）
5. `!z-context` (Tailwind `!important` modifier) 强制覆盖 `z-popover`
6. 移除 `asChild`，让 Anchor 渲染自己的 wrapper 元素确保 ref 可达
   **系统性预防**：Dialog 内使用 Popover 时必须提升 z-index 到 `z-context` 以上；使用 Anchor（定位）而非 Trigger（切换）处理程序化打开。

### 15. TagFilterBar 和 DraggableTag 行重复显示 tag pills

**现象**：AssetPicker 对话框内出现三层结构：category tabs、TagFilterBar pills、DraggableTag pills，后两层显示相同的标签。
**根因**：TagFilterBar 自带 tag pills 行（用于 dock 面板的筛选场景），同时 AssetPickerDialog 有独立的 DraggableTag 行（支持拖拽标签到图片）。两者在 AssetPickerDialog 中同时渲染。
**修复**：在 AssetPickerDialog 中传入 `availableTags={[]}` 给 TagFilterBar，使其只渲染 category tabs + search 行，tag pills 完全由 DraggableTag 行承担（保留拖拽功能）。

## 待修复问题

（后续验收中发现的问题将追加在此处）

## Assumptions

- DialogContent flex 居中方案兼容所有现有对话框使用场景（目前只有 2 个使用点）
- AssetPicker 使用非模态 Dialog（`modal={false}`），不锁定焦点也不阻止外部交互，Context menu 等 Portal 组件可正常工作
- @dnd-kit DragOverlay 在无 transform 容器内的 `position: fixed` 正确相对于视口

## Edge Cases

- 对话框拖拽后再次打开应重置位置（通过 `resetPosition` + `useEffect` 实现）
- 双重 droppable 注册（useSortable + useDroppable）需要通过 `overData.assetId` 而非 `over.id` 解析
- 乐观更新的排序结果可能被 API 响应覆盖（正确行为：API 响应是权威源）

## 相关 Issue

- [#135](https://github.com/RidRisR/myVTT/issues/135) — 防抖和乐观更新审计
- [#136](https://github.com/RidRisR/myVTT/issues/136) — PortraitBar transform 居中重构
