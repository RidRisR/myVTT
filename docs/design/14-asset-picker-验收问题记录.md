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

---

## 复盘：15 个 Bug 的系统性分析

### 根因模式分类

将 15 个 bug 按技术根因归类，呈现 5 个集群：

#### 模式 A：Radix Portal + z-index 隔离（#6, #10, #14）

| Bug | 本质                                                                           |
| --- | ------------------------------------------------------------------------------ |
| #6  | DragOverlay `position: fixed` 在 transform 容器内失效                          |
| #10 | ContextMenu.Portal 渲染在 Dialog.Portal 外，被 `pointer-events: none` 阻断     |
| #14 | Popover.Portal 的 `z-popover(5000)` 低于 Dialog 的 `z-modal(9000)`，被完全遮挡 |

**共同根因**：Radix UI 的每个 overlay 组件都通过 Portal 渲染到 `document.body`，脱离了父组件的 z-index 上下文。当 Dialog 里嵌套 ContextMenu 或 Popover 时，Portal 之间互相不知道对方的存在，z-index、pointer-events、focus trap 三层机制各自独立运作，产生冲突。

**为什么反复出现**：单独测试每个组件时都正常，只有在嵌套组合时才暴露——单元测试和单组件开发阶段不会发现。Radix 的 `modal` 模式是全有或全无的——没有「只锁定 Dialog 背后、但允许 Dialog 内的 Portal 交互」这种中间状态。

#### 模式 B：CSS 副作用链（#3 → #4 → #5 → #7）

四个 bug 形成因果链：

```
#3 遮罩太暗 → 去掉遮罩
    → #4 背景透明 → 加背景色
        → #5 transform 居中 + useDraggable 冲突 → 改用 left/top
            → #7 意识到 transform 是所有问题的根源 → 系统性重构为 flex 居中
```

**为什么反复出现**：每次修复都是对前一个修复的补丁，而不是退一步审视整体设计。`transform` 居中方式在 CLAUDE.md 的 Architecture Gotchas 中已有记录（CSS containing block），但在实现 DialogContent 时没有被考虑到。

#### 模式 C：@dnd-kit 行为假设错误（#8, #9）

| Bug | 错误假设                                                                 |
| --- | ------------------------------------------------------------------------ |
| #8  | 假设 `over.id` 始终是 sortable ID，忽略了 droppable 也会成为 `over` 目标 |
| #9  | 假设 DragOverlay 只影响 tag 拖拽，不知道它会全局切换拖拽渲染模式         |

**为什么出现**：@dnd-kit 的 sortable + droppable 双重注册是非典型用法，官方文档没有明确说明 `over` 的解析优先级。DragOverlay 的全局模式切换是隐式行为——只要组件存在于 DOM 树中（即使渲染 null），就会改变所有拖拽项的行为。

**技术选型反思**：拖拽排序本身不少见，问题在于「排序 + 标签拖放」两种拖拽共存于同一个元素。每个 AssetGridItem 既是 sortable（可排序）又是标签的 droppable（放置目标），同一个 DOM 元素上注册了 `useSortable` + `useDroppable` 两个 hook。这是从需求侧分别实现两个独立功能，没有意识到它们在同一个元素上会产生交互冲突。

**更好的方案**：

- **方案 A**：分离拖拽系统——排序用 @dnd-kit sortable（标准用法），标签打标用原生 HTML drag-and-drop 或 pointer event + `elementFromPoint`，两套系统完全独立
- **方案 B**：统一为一个 DndContext，通过 `active.data.current.type` 区分「排序」和「打标」，图片只注册 `useSortable`（自带 droppable 能力），不额外注册 `useDroppable`，消除 `over.id` 歧义

**判断标准**：当需要在同一个 DOM 元素上注册同一个库的两个独立 hook 时，这是一个需要停下来调研的信号——库的作者很可能没有设计这种组合。

#### 模式 D：布局/视觉不匹配（#1, #4, #12, #15）

| Bug | 本质                                         |
| --- | -------------------------------------------- |
| #1  | 空状态文字和按钮挤在一行                     |
| #4  | 去遮罩后背景透明                             |
| #12 | 搜索框和 tabs 分属两行                       |
| #15 | TagFilterBar pills + DraggableTag pills 重复 |

**为什么出现**：

- #1：开发时只测试了「有数据」场景，没有测试空状态。空状态下的 flex 布局行为和有内容时不同
- #4：去遮罩后对话框没有可见背景色，是对 CSS 层叠效果的预见不足
- #12：TagFilterBar API 设计没有预留行尾插槽（`categoryTrailing`），搜索框只能作为兄弟元素渲染。多消费场景的组件应预留插槽 props
- #15：TagFilterBar 同时承担了「category tabs」和「tag pills」两个职责，而 AssetPickerDialog 只需要前者（pills 由 DraggableTag 行承担）。这是「一个组件做了太多事」的信号——如果拆分为 `CategoryTabs` 和 `TagPills` 两个组件，#15 不会发生

#### 模式 E：DOM 事件委托假设（#13）

`e.target.tagName === 'BUTTON'` 对 SVG 图标子元素无效。经典的浅层 DOM 假设 bug。

#### 独立问题（#2, #11）

- #2（aria-describedby 警告）：Radix Dialog 要求 `Dialog.Content` 内有 `Dialog.Description` 或手动设置 `aria-describedby`，否则打印控制台警告。对 Radix 原语的创建契约不熟悉——每次引入新的 Radix 原语包裹层时，应检查其必需子组件和 accessibility 要求
- #11（标签系统不完整）：功能缺失而非 bug。MVP 阶段的功能裁剪没有留下清晰的「未完成」标记，导致验收时被当作 bug 发现。未完成功能应在文档中显式标注

### 数据总结

| 根因模式               | Bug 数量          | 占比 | 可预防性                      |
| ---------------------- | ----------------- | ---- | ----------------------------- |
| A: Portal z-index 隔离 | 3 (#6,#10,#14)    | 20%  | 高——加入检查清单后可预见      |
| B: CSS 副作用链        | 4 (#3,#4,#5,#7)   | 27%  | 中——需要逐步验证打断补丁链    |
| C: 库隐式行为          | 2 (#8,#9)         | 13%  | 低——需要深入了解库源码        |
| D: 布局不匹配          | 4 (#1,#4,#12,#15) | 27%  | 高——组件 API 设计时考虑插槽   |
| E: DOM 假设            | 1 (#13)           | 7%   | 高——用 closest() 替代 tagName |
| 独立                   | 1 (#2)            | 7%   | 低——Radix 文档细节            |

### 更高层面的问题

#### 1. Dialog 是错误的容器选择

15 个 bug 中有 **9 个**（#3, #4, #5, #6, #7, #10, #13, #14, #15）直接或间接来自于用 Radix Dialog 作为 AssetPicker 的容器。

Radix Dialog 的设计意图是：弹出一个需要用户注意力的模态窗口，完成一个简单交互（确认、填写表单），然后关闭。它不是为了承载一个内嵌多层 overlay + 拖拽的迷你应用而设计的。

AssetPickerDialog 需要同时组合：Dialog、DndContext（sortable + droppable + DragOverlay）、ContextMenu、Popover、useDraggable——这超过了 Radix Dialog 的设计承载能力。当你发现需要 `modal={false}` + `!z-context` + 移除 `stopPropagation` + `onInteractOutside={e.preventDefault()}` 这种组合时，说明你已经在对抗框架的设计意图。

**理想方案**：使用自定义浮动面板（`position: fixed` + `useDraggable` + `left/top` 定位），不涉及 Portal、modal、transform，内层的 ContextMenu/Popover Portal 可以正常工作。

```
当前方案（Radix Dialog）问题链：
  Dialog Portal → 创建隔离上下文
    → modal 模式 → pointer-events: none 阻断内层 Portal
    → transform 居中 → 创建 containing block → 破坏 fixed 定位
    → z-modal(9000) → 遮挡 z-popover(5000) 的 Portal

自定义浮动面板：
  position: fixed + left/top → 无 Portal、无 modal、无 transform
    → 内层 ContextMenu/Popover Portal 正常工作
    → z-index 层级自然继承
    → 9 个 bug 直接消失
```

#### 2. 从 UI 库组件目录出发 vs 从需求出发

错误的思维过程：「需要浮动窗口」→「Radix 有 Dialog」→「用 Dialog」

正确的思维过程：「需要浮动窗口，内嵌拖拽 + 右键菜单 + 弹出编辑器」→「这比 Dialog 的设计意图复杂得多」→「用自定义面板，只在内部使用 Radix 子组件」

#### 3. Patch-on-patch 修复模式

#3→#4→#5→#7 反映出修 bug 时倾向于最小改动，而不是先问「为什么这里需要 transform？」。缺少「修了第二个相关 bug 时，应该停下来审视是否存在共同根因」的习惯。

#### 4. 验收集中在最后而非逐步进行

15 个 bug 全部在最终手动验收时发现。如果每个 task 完成后就在 Docker 预览中验证，模式 B 的因果链可以在 #3 就被识别和系统性解决。

#### 5. 同一元素双 hook 注册的选型盲区

#8 和 #9 来自于把「排序」和「标签拖放」当作两个独立需求分别实现，没有意识到它们共享同一个 DOM 元素时 @dnd-kit 的 hook 会互相干扰。需求分析时应识别出「同一元素承担多重拖拽角色」这种非标准场景，并在选型阶段做专门调研。

#### 6. 测试体系的结构性盲区

15 个 bug 中只有 1 个（#2 aria-describedby 警告）能被现有自动化测试可靠发现，3 个可以部分发现，11 个完全不可能。

| 测试体系能覆盖的     | 测试体系不能覆盖的                   |
| -------------------- | ------------------------------------ |
| 元素是否存在         | 元素是否对齐、是否溢出、间距是否正确 |
| 事件是否触发         | 拖拽时幽灵图是否跟随鼠标             |
| 回调参数是否正确     | Popover 在 Dialog 内是否可见         |
| 组件单独渲染是否正确 | 组件嵌套组合后是否工作               |

**核心问题**：当前 TDD 流程对数据流和业务逻辑有效，但对 UI 视觉正确性基本无效。这不是 TDD 的问题——TDD 本来就不是为 CSS 布局和组件组合副作用设计的。对于 UI 密集型工作，自动化测试需要被「视觉验证清单 + 逐步验证」补充。

**可测试性分析**：

| Bug                 | 能被逻辑测试发现？ | 原因                                |
| ------------------- | ------------------ | ----------------------------------- |
| #1 空状态布局       | 否                 | CSS 布局问题                        |
| #2 aria-describedby | **是**             | 控制台警告可断言                    |
| #3 遮罩过暗         | 否                 | 视觉问题                            |
| #4 背景透明         | 否                 | CSS 问题                            |
| #5 拖动跳变         | 否                 | 运行时 transform 冲突               |
| #6 标签拖动跳变     | 否                 | CSS containing block                |
| #7 系统重构         | —                  | 不是 bug                            |
| #8 排序回弹         | 部分               | 可测 onDragEnd 逻辑，不可测视觉回弹 |
| #9 幽灵图不跟随     | 否                 | DragOverlay 渲染行为                |
| #10 右键菜单不可用  | 否                 | pointer-events 阻断                 |
| #11 标签不完整      | —                  | 功能缺失                            |
| #12 不在同一行      | 否                 | CSS 布局                            |
| #13 X 按钮不可点    | 部分               | 需模拟完整 pointer 序列             |
| #14 Popover 不可见  | 否                 | z-index + Portal 组合               |
| #15 重复 pills      | 部分               | 可断言渲染数量，但需集成测试        |

### 系统化预防措施

#### 预防 1：容器选择原则

当一个浮动 UI 需要内嵌 2 个以上 Radix overlay 类型（Popover、ContextMenu、DropdownMenu）或拖拽系统时，不要用 Radix Dialog 作为容器。改用自定义浮动面板（`position: fixed` + `useDraggable`），只在内部使用 Radix 的子组件。

#### 预防 2：集成上下文检查清单

在计划阶段，如果一个组件需要嵌套多个 overlay/拖拽系统，计划中必须包含「集成上下文」章节，明确列出：

- 这个组件里有哪些 Portal 渲染？
- 它们的 z-index 层级关系是什么？
- 有没有 `modal` 模式会设置 `pointer-events: none`？
- 有没有 `transform`/`filter`/`will-change` 会创建 containing block？
- 同一个元素上是否注册了同一个库的多个 hook？

#### 预防 3：逐步验证 + 视觉验证清单

每个涉及 UI 的 task 完成后，应在 Docker 预览中做一次快速视觉验证，打断 patch-on-patch 链。

UI 组件必须验证的关键状态（自动化测试无法覆盖）：

- **数据边界**：空状态、少量数据、大量数据（滚动）
- **组合上下文**：组件在 Dialog/Popover 内是否正常工作
- **交互链路**：拖拽→放下→反馈、右键→菜单→操作→结果
- **层级关系**：overlay 之间的 z-index 和 pointer-events 是否正确

#### 预防 4：CLAUDE.md Architecture Gotchas 补充

- Radix overlay 嵌套规则（Dialog 内使用 Popover/ContextMenu 时的 modal、z-index、Anchor 要求）
- Tailwind z-index 覆盖必须用 `!` modifier
- Drag handle 内用 `closest()` 而非 `tagName`
- @dnd-kit DragOverlay 的全局模式切换效应
- 同一元素上注册同一库的多个 hook 前需专门调研交互行为

#### 预防 5：组件 API 扩展性

- 当一个组件会被多个不同上下文使用时，API 设计应预留插槽 props（`leading`/`trailing`/`children`）
- 单一职责——如果一个组件同时管理两种不同的 UI 关注点（如 tabs + pills），考虑拆分
- 引入新 Radix 原语包裹层时检查其必需子组件和 accessibility 契约

#### 预防 6：功能裁剪显式标注

MVP 阶段有意裁剪的功能必须在代码或文档中显式标注「Phase N 再做」，避免在验收时被当作 bug 发现。

### TODO

- [ ] 将 AssetPickerDialog 从 Radix Dialog 迁移到自定义浮动面板（GitHub Issue 追踪）
- [ ] CLAUDE.md Architecture Gotchas 补充预防 4 的规则
- [ ] 评估 PortraitBar 是否有同样的 Dialog 容器问题（#136）
- [ ] 评估 @dnd-kit sortable + droppable 双重注册是否重构为方案 A 或 B
- [ ] `ui-patterns.md` Overlay Components 表格增加「必需 props/子组件」列
