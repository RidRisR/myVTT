# ILayoutSDK：组件自定义拖动把手

## 背景

在 play 模式下，系统的编辑浮层不存在（只有 edit 模式才有）。如果一个组件希望在 play 模式下也能被玩家自由拖动，它需要一个机制来发起面板位移——但目前 `IComponentSDK` 没有任何 layout 相关接口。

## 设计原则

- **edit 模式**：系统全权负责。系统浮层覆盖整个面板，组件不参与。
- **play 模式**：组件可以选择自己定义把手位置。组件通过 `sdk.layout?.startDrag(e)` 将一个 `onMouseDown` 事件交给系统，系统完成后续的 delta 追踪和位置更新。

组件完全控制把手的形态（位置、视觉、交互方式），系统只做数学计算。

## 接口设计

```ts
// src/ui-system/types.ts
export interface ILayoutSDK {
  startDrag(e: React.MouseEvent): void
}

export interface IComponentSDK {
  data: IDataSDK
  workflow: IWorkflowRunner
  context: ComponentContext
  layout?: ILayoutSDK  // play 模式且面板支持拖动时注入；edit 模式下不注入
}
```

`layout` 是可选字段，因为：
1. edit 模式下不注入（系统浮层接管）
2. 未来可能有"固定面板"不允许拖动，届时也不注入

## 组件使用方式

```tsx
function MyWindowPanel({ sdk }: ComponentProps) {
  const { layoutMode } = sdk.context
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 自定义把手：只在 play 模式显示，位置和样式完全自主 */}
      {layoutMode === 'play' && (
        <div
          onMouseDown={(e) => sdk.layout?.startDrag(e)}
          style={{ cursor: 'move', padding: '4px 8px' }}
        >
          ⠿ 标题栏
        </div>
      )}
      <div style={{ flex: 1 }}>
        {/* 可交互的内容区 */}
      </div>
    </div>
  )
}
```

## 系统实现

`createDragInitiator(instanceKey, onDrag)` 是从 `DragHandle` 中提取出来的纯函数，返回一个可直接用作 `onMouseDown` 的函数。`DragHandle` 内部也改用它，消除重复逻辑。

```ts
// src/ui-system/LayoutEditor.ts（导出）
export function createDragInitiator(
  instanceKey: string,
  onDrag: (instanceKey: string, delta: { dx: number; dy: number }) => void,
): (e: { clientX: number; clientY: number; preventDefault(): void }) => void
```

`makeSDK` 在 play 模式下注入：
```ts
layout: mode === 'play'
  ? { startDrag: createDragInitiator(instanceKey, handleDrag) }
  : undefined
```

## 和跨组件 DnD 的关系

`ILayoutSDK.startDrag` 只处理**面板位移**，不涉及数据传递。
跨组件卡牌拖动（数据 DnD）是另一套机制（`sdk.dnd`），需要单独设计，见后续文档。
