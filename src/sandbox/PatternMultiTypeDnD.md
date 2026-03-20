# MultiType DnD 模式

## 问题背景

当一个面板需要同时支持多种拖拽交互（如标签拖拽分配 + 列表排序），常见的错误做法是使用多个 `DndContext`。这导致跨类型 drop 完全不工作——标签无法拖到排序列表的 item 上，因为它们在不同的 DnD 上下文中。

AssetPickerPanel（PR #138）通过单 `DndContext` + `data.type` 区分的方式解决了这个问题。本 sandbox 模式提取了经过生产验证的核心技巧。

## 架构原则

### 1. 单 DndContext 包裹所有拖拽类型

所有拖拽交互必须在同一个 `DndContext` 内。`DndContext` 定义了一个拖拽"世界"——只有同一个 context 内的 draggable 和 droppable 才能互相感知。

### 2. `data.type` 字段区分拖拽类型

每个 draggable 的 `data` 对象必须包含 `type` 字段。`onDragStart` 和 `onDragEnd` 通过 `event.active.data.current.type` 路由到正确的处理逻辑。

```tsx
// 标签：useDraggable + type: 'tag'
useDraggable({ id: `tag-${tag}`, data: { type: 'tag', tag } })

// 列表项：useSortable + type: 'item'
useSortable({ id: item.id, data: { type: 'item', itemId: item.id } })
```

### 3. DragOverlay 必须处理每个拖拽类型

`DragOverlay` 是全局的——当存在于 DOM 中时，它会接管**所有**拖拽项的渲染。如果只渲染了 tag 的预览而漏掉了 item，那 item 在拖拽时会消失。

### 4. `useSortable` 的双重角色

`useSortable` 同时提供 sortable（可拖拽排序）和 droppable（可接收 drop）行为。通过 `isOver` 可以检测是否有其他 draggable 悬停在上方，用于显示 drop 目标的视觉反馈。

### 5. 批量 drop

当 drop 目标在当前 selection 中时，操作应用到所有选中项，而不仅是目标项：

```tsx
const targetIds = selection.has(overItemId) ? Array.from(selection) : [overItemId]
```

### 6. PointerSensor + distance 约束

`distance: 5` 确保 5px 以内的移动被视为 click 而非 drag，防止点击操作（如切换选中）被误拦截。

## 约束清单

| 设计规则                                      | 来源                                          | 代码                                                                      |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| 单 DndContext 包裹所有类型                    | `AssetPickerPanel.tsx:250` 生产验证           | `PatternMultiTypeDnD.tsx:L189` `<DndContext>`                             |
| `PointerSensor` + `distance: 5`               | `AssetPickerPanel.tsx:163`                    | `PatternMultiTypeDnD.tsx:L103` `activationConstraint: { distance: 5 }`    |
| `data.type` 区分拖拽类型                      | `DraggableTag.tsx:12`, `AssetGridItem.tsx:42` | `PatternMultiTypeDnD.tsx:L255` `type: 'tag'`, `L291` `type: 'item'`       |
| 单 DragOverlay 按类型渲染                     | `AssetPickerPanel.tsx:300-314`                | `PatternMultiTypeDnD.tsx:L212-226` `draggedTag ? ... : draggedItem ? ...` |
| `useSortable` 双重角色（排序 + drop target）  | `AssetGridItem.tsx:39-43`                     | `PatternMultiTypeDnD.tsx:L289-291` `useSortable` + `isOver`               |
| 批量 drop 通过 `selection.has` 判断           | `AssetPickerPanel.tsx:196-203`                | `PatternMultiTypeDnD.tsx:L141` `selection.has(overItemId)`                |
| 不参与渲染的可变值用 `useRef` 而非 `useState` | React 闭包陷阱（PR #141 code review 发现）    | `PatternMultiTypeDnD.tsx:L88` `logCounterRef = useRef(0)`                 |
| Tailwind design tokens                        | `docs/conventions/ui-patterns.md:1-8`         | 全文件无 inline color，使用 `bg-accent`, `text-muted` 等                  |

## 陷阱清单

1. **不要使用多个 DndContext** — 跨 context 的 draggable 和 droppable 互相不可见。标签拖到 item 上没反应。
   - ❌ `<DndContext>` 包标签 + 另一个 `<DndContext>` 包排序列表
   - ✅ 单 `<DndContext>` 包全部

2. **DragOverlay 必须覆盖每个拖拽类型** — 它全局接管渲染。漏掉一个类型 = 该类型拖拽时元素消失。
   - ❌ `<DragOverlay>{draggedTag && <TagPill />}</DragOverlay>`（item 拖拽时空白）
   - ✅ `<DragOverlay>{draggedTag ? <TagPill /> : draggedItem ? <ItemPreview /> : null}</DragOverlay>`

3. **`onDragEnd` 必须清除 drag state** — 不管 drop 是否成功。否则 DragOverlay 会残留。
   - ❌ 只在成功 drop 时 `setDraggedTag(null)`
   - ✅ 在 handler 开头无条件清除

4. **`arrayMove` 必须用在完整数组上** — 不能用在 filtered 后的子数组上，否则 index 对不上。
   - ❌ `arrayMove(filteredItems, oldIdx, newIdx)` → index 错位
   - ✅ `arrayMove(allItems, oldIdx, newIdx)` → 用完整数组的 index

5. **必须设置 `distance` 约束** — 否则所有 click 都被 PointerSensor 拦截为 drag。
   - ❌ `useSensor(PointerSensor)` → click 事件丢失
   - ✅ `useSensor(PointerSensor, { activationConstraint: { distance: 5 } })`

6. **不要在 `useCallback` 中混用函数式更新器和闭包直接读取同一 state** — `setX(prev => prev + 1)` 能拿到最新值，但同一回调中直接读 `x` 是渲染时快照，会导致值差一。不参与渲染的可变值应使用 `useRef`。
   - ❌ `const [counter, setCounter] = useState(0)` + `useCallback(() => { setCounter(c => c+1); setLog(prev => [{ id: counter+1 }]) }, [counter])` → `counter` 是旧值，且每次递增都重建回调
   - ✅ `const counterRef = useRef(0)` + `useCallback(() => { counterRef.current += 1; setLog(prev => [{ id: counterRef.current }]) }, [])` → 始终读最新值，零依赖不重建

## 适用场景

- ✅ 素材库——标签拖拽分配 + 资产排序（AssetPickerPanel）
- ✅ 看板——不同类型卡片在同一面板中拖拽
- ✅ 任何需要两种以上拖拽操作共存的场景
- ❌ 单类型拖拽（直接用 `useSortable` 或 `useDraggable`，不需要类型区分）
- ❌ 跨容器拖拽到外部（如拖到画布）——需要不同的架构
