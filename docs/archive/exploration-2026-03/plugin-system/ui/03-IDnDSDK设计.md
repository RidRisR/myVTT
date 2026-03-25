# IDnDSDK：跨组件数据拖放

## 背景

组件内部有可被拖动的数据项（如卡牌、道具），需要能拖到另一个组件的特定区域内。这类拖放（DnD）与面板位移拖动（`ILayoutSDK`）是两套不同的需求：

|            | 面板位移                          | 数据 DnD                      |
| ---------- | --------------------------------- | ----------------------------- |
| 拖的是什么 | 整个面板容器                      | 数据项（卡牌、实体引用）      |
| 目标       | 面板在画布上的坐标                | 另一个组件内的 drop zone      |
| 副作用     | 更新 LayoutConfig                 | 触发 workflow（转移所有权等） |
| 模式限制   | 仅 play 模式（edit 模式系统接管） | 仅 play 模式                  |

## 设计原则

### 组件透明于底层机制

组件只调用 `sdk.dnd.makeDraggable()` 和 `sdk.dnd.makeDropZone()`，**不直接接触 HTML5 DnD API**（不写 `draggable` 属性，不读 `e.dataTransfer`）。

这使得系统内部可以在不改动任何插件代码的前提下，从 HTML5 DnD 升级到自定义 mouse 追踪实现。

### 数据引用语义

拖动的 payload 传递引用（entityId），而非完整数据拷贝。drop 后由接收方通过 `sdk.data.entity(id)` 取数据。

原因：实体数据有单一来源，拷贝会导致数据不一致；引用语义与 `IDataSDK` 天然契合。

### Drop = Workflow 触发器

`onDrop` 不在组件内处理业务逻辑，而是调用 `sdk.workflow.emit()`。这使得：

- 同一业务逻辑（如"装备道具"）可被 DnD 触发，也可被按钮触发
- 副作用进入 workflow，天然可审计

## 接口设计

```ts
// src/ui-system/types.ts

export interface DnDPayload {
  /** 标识拖动内容的类型，drop zone 用于过滤 */
  type: string
  /** 引用语义的数据，通常是 entityId 或类似标识符 */
  data: unknown
}

export interface DraggableProps {
  draggable?: boolean
  onDragStart?: React.DragEventHandler
  onMouseDown?: React.MouseEventHandler
  // 未来升级时可能改变，但调用方只 spread，不依赖具体 key
}

export interface DropZoneProps {
  onDragOver?: React.DragEventHandler
  onDragEnter?: React.DragEventHandler
  onDragLeave?: React.DragEventHandler
  onDrop?: React.DragEventHandler
  ref?: React.Ref<HTMLElement>
}

export interface IDnDSDK {
  /**
   * 返回可 spread 到 draggable 元素上的 props。
   * 组件不直接操作 dataTransfer。
   */
  makeDraggable(payload: DnDPayload): DraggableProps

  /**
   * 返回可 spread 到 drop zone 元素上的 props。
   * accept 为空数组时接受所有类型。
   * canDrop 为同步函数，用于实时视觉反馈（高亮/拒绝）。
   * onDrop 为副作用入口，通常调用 sdk.workflow.emit()。
   */
  makeDropZone(spec: {
    accept: string[]
    canDrop?: (payload: DnDPayload) => boolean
    onDrop: (payload: DnDPayload) => void
  }): DropZoneProps
}

export interface IComponentSDK {
  data: IDataSDK
  workflow: IWorkflowRunner
  context: ComponentContext
  layout?: ILayoutSDK
  /** play 模式下注入；edit 模式下数据拖放不可用 */
  dnd?: IDnDSDK
}
```

`dnd` 为可选字段，和 `layout` 同理：edit 模式下系统浮层接管所有鼠标事件，数据 DnD 无法操作。

## 组件使用方式

```tsx
function HandPanel({ sdk }: ComponentProps) {
  const cards = ['fire-bolt', 'shield']

  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>手牌</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {cards.map((cardId) => (
          <CardItem key={cardId} cardId={cardId} sdk={sdk} />
        ))}
      </div>
    </div>
  )
}

function CardItem({ cardId, sdk }: { cardId: string; sdk: IComponentSDK }) {
  const dragProps = sdk.dnd?.makeDraggable({ type: 'card', data: { cardId } }) ?? {}

  return (
    <div {...dragProps} style={{ padding: '4px 8px', background: '#374151', cursor: 'grab' }}>
      {cardId}
    </div>
  )
}
```

```tsx
function EquipmentPanel({ sdk }: ComponentProps) {
  const [isOver, setIsOver] = useState(false)

  const dropProps =
    sdk.dnd?.makeDropZone({
      accept: ['card'],
      canDrop: (payload) => {
        const { cardId } = payload.data as { cardId: string }
        // 同步判断：此卡牌是否可装备（纯函数，无副作用）
        return cardId !== 'shield' // 示例：盾牌不能装备到此槽
      },
      onDrop: (payload) => {
        // 副作用交给 workflow
        sdk.workflow.emit('card.equipped', payload.data)
      },
    }) ?? {}

  return (
    <div
      {...dropProps}
      onDragEnter={() => setIsOver(true)}
      onDragLeave={() => setIsOver(false)}
      style={{
        padding: 12,
        border: `2px dashed ${isOver ? '#6366f1' : '#374151'}`,
        minHeight: 60,
      }}
    >
      {isOver ? '松开以装备' : '装备槽（拖卡牌到此处）'}
    </div>
  )
}
```

## V1 系统实现（HTML5 DnD）

```ts
// src/ui-system/dnd.ts

export function makeDnDSDK(): IDnDSDK {
  return {
    makeDraggable(payload) {
      return {
        draggable: true,
        onDragStart(e) {
          e.dataTransfer.setData('application/vtt-dnd', JSON.stringify(payload))
          e.dataTransfer.effectAllowed = 'move'
        },
      }
    },

    makeDropZone({ accept, canDrop, onDrop }) {
      return {
        onDragOver(e) {
          // 必须 preventDefault() 才能触发 onDrop
          const raw = e.dataTransfer.getData('application/vtt-dnd')
          if (!raw) return
          const payload = JSON.parse(raw) as DnDPayload
          if (accept.length > 0 && !accept.includes(payload.type)) return
          if (canDrop && !canDrop(payload)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        },
        onDrop(e) {
          e.preventDefault()
          const raw = e.dataTransfer.getData('application/vtt-dnd')
          if (!raw) return
          const payload = JSON.parse(raw) as DnDPayload
          if (accept.length > 0 && !accept.includes(payload.type)) return
          onDrop(payload)
        },
      }
    },
  }
}
```

`makeSDK` 在 play 模式下注入：

```ts
dnd: mode === 'play' ? makeDnDSDK() : undefined
```

## V2 升级路径（custom mouse，按需）

当出现以下需求时升级：

- ghost 需要自定义样式或动画（如"拖到有效区域时变绿"）
- 需要支持触屏（`ontouchstart`）
- 浏览器 DnD ghost 样式不一致必须统一

**升级范围**：仅替换 `makeDnDSDK()` 的内部实现，所有插件组件代码**零修改**。

```ts
// V2：替换 makeDnDSDK 内部实现
// makeDraggable 返回 { onMouseDown: ... }（而非 draggable: true）
// makeDropZone 返回 { ref: ... }（注册到 global DnD store）
// 全局 store 追踪鼠标位置，渲染 portal ghost
// 组件 spread {...dragProps} 的代码完全不变
```

## 与 ILayoutSDK 的关系

|           | ILayoutSDK                              | IDnDSDK                               |
| --------- | --------------------------------------- | ------------------------------------- |
| 用途      | 面板位移                                | 数据传递                              |
| 发起方式  | `onMouseDown → sdk.layout.startDrag(e)` | `{...sdk.dnd.makeDraggable(payload)}` |
| 接收方    | 系统（更新坐标）                        | 组件的 drop zone（触发 workflow）     |
| 可用模式  | play                                    | play                                  |
| edit 模式 | 系统浮层接管，不注入                    | 系统浮层接管，不注入                  |

两者互不干扰：面板位移用 `mousedown`，数据 DnD 用 `dragstart`，事件机制正交。

## 边界情况

- `sdk.dnd` 为 `undefined`（edit 模式）：组件用 `??  {}` 降级，dragProps/dropProps 为空对象，元素正常渲染但不响应拖放
- `canDrop` 返回 `false`：`onDragOver` 不调用 `preventDefault()`，浏览器显示禁止光标，`onDrop` 不触发
- `accept` 为空数组：接受所有 type（通配符语义）
- 同一个元素既是 draggable 又是 drop zone：合法，spread 两份 props 即可（注意 `onDragOver` 中要排除自身 payload 以防止自己拖到自己）
