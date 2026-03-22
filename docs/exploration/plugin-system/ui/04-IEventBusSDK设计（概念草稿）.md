# IEventBusSDK 设计（概念草稿）

> **状态**：设计讨论中，尚未实现
> **动机**：解决 Workflow 无法规定 UI 副作用的问题

---

## 一、核心问题：Workflow 的副作用困境

当前 `IWorkflowRunner` 通过硬编码回调处理副作用：

```ts
interface WorkflowContext {
  showToast(msg: string): void // 硬编码到宿主
  playAnimation(target: string): void // 宿主层不一定知道如何找到正确的 DOM
  announce(text: string): void
}
```

这带来两个问题：

1. **宿主实现困难**：`playAnimation('fire-bolt')` 需要知道哪个面板在显示这个法术——宿主层根本不知道
2. **插件无法扩展**：插件自定义的 UI 效果无法通过这套接口传递给自己的组件

**理想模型**：Workflow 描述"发生了什么"，UI 组件自主决定如何响应。

---

## 二、事件总线的定位

### 适用场景：瞬时动作（Transient Actions）

事件总线适合传递**不需要持久化、错过就算了**的 UI 事件：

| 场景       | 事件                | 处理方             |
| ---------- | ------------------- | ------------------ |
| 掷骰子结果 | `ui.roll.completed` | 动画层播放滚动动画 |
| Toast 提示 | `ui.toast.show`     | Toast 管理器       |
| 攻击命中   | `combat.hit`        | 角色卡播放受击动画 |
| 法术施放   | `combat.cast`       | 法术效果面板       |

### 不适用场景：持久状态（Persistent State）

以下情况**不应使用**事件总线（详见 `Temp-另一种通讯方式`）：

- 当前选中的 Token/Entity（迟到者问题）
- 激活的工具/面板状态（多重事实来源）
- 背包物品、HP 等游戏数据（这是 Data Layer 的职责）

---

## 三、类型安全设计

### EventHandle（仿照 WorkflowHandle）

```ts
// 类型句柄：运行时只是字符串 key，编译时携带 payload 类型
export interface EventHandle<TPayload> {
  readonly key: string
  readonly _phantom?: TPayload // 仅类型层面，运行时不存在
}

export function defineEvent<TPayload>(key: string): EventHandle<TPayload> {
  return { key } as EventHandle<TPayload>
}
```

### 插件中定义事件

```ts
// plugins/poc-combat/events.ts
export const combatHitEvent = defineEvent<{
  targetId: string
  damage: number
  critical?: boolean
}>('combat.hit')

export const rollCompletedEvent = defineEvent<{
  rolls: number[]
  total: number
  formula: string
}>('ui.roll.completed')
```

### SDK 接口

```ts
export interface IEventBusSDK {
  /** 发射事件（Workflow 或组件中调用） */
  emit<T>(handle: EventHandle<T>, payload: T): void

  /** 订阅事件（组件中调用，返回取消订阅函数） */
  on<T>(handle: EventHandle<T>, handler: (payload: T) => void): () => void

  /** React hook：在组件内订阅，自动在 unmount 时清理 */
  useEvent<T>(handle: EventHandle<T>, handler: (payload: T) => void): void
}
```

### Workflow 中发射

```ts
// Workflow 实现中
async function castSpellWorkflow(
  ctx: WorkflowContext,
  input: { spellId: string; targetId: string },
) {
  const result = await ctx.resolveSpell(input)

  // 不再调用 ctx.showToast()，而是发射语义事件
  ctx.events.emit(combatHitEvent, {
    targetId: input.targetId,
    damage: result.damage,
    critical: result.critical,
  })
}
```

### 组件中订阅

```ts
// 角色卡组件
function CharacterCard({ sdk }: ComponentProps) {
  const [flashState, setFlashState] = useState<'hit' | null>(null)

  sdk.events?.useEvent(combatHitEvent, (payload) => {
    if (payload.targetId === myEntityId) {
      setFlashState('hit')
      setTimeout(() => setFlashState(null), 600)
    }
  })
  // ...
}
```

---

## 四、边界规则

```
               ┌──────────────────────────────────────┐
               │      事件总线适合的数据类型           │
               │                                      │
               │  ✅ 瞬时触发的 UI 演出               │
               │  ✅ 动画/音效触发信号                 │
               │  ✅ Toast / notification              │
               │  ✅ 跨组件的一次性通知               │
               │                                      │
               │  ❌ 选中状态（用 Session State）      │
               │  ❌ 游戏数据（用 Data Layer）         │
               │  ❌ 需要"迟到者"也能读到的任何东西   │
               └──────────────────────────────────────┘
```

---

## 五、与其他 SDK 的关系

```
IComponentSDK
├── data          → 持久游戏数据（Entity、HP 等）
├── workflow      → 业务逻辑执行
├── dnd           → 拖拽交互（瞬时，但由浏览器 API 驱动）
├── layout        → 面板位置（play 模式）
└── events        → 瞬时 UI 信号（本文档）
    （未来）
└── session       → 持久 UI 状态（选中、激活工具等）
```

---

## 六、开放问题

1. **事件总线的实例化方式**：模块单例 vs. 每个 `makeDnDSDK()` 创建实例？
   - 建议：模块单例（同 `activeDragPayload` 的处理方式）

2. **`useEvent` 的 React 集成**：需要 `useEffect` + `useRef(handler)` 避免闭包陈旧
   - 参考：`useEventCallback` 模式

3. **Workflow 中如何获取 events SDK**：目前 `WorkflowContext` 不含 UI 能力
   - 选项 A：`ctx.emit(handle, payload)` 作为 WorkflowContext 的一部分
   - 选项 B：事件总线作为全局单例，Workflow 直接 `import { eventBus }`

4. **是否真的需要**：见下节。

---

_本文档为概念草稿，待与 Session State 方案对比后决定是否实现。_
