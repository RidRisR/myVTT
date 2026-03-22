# 阶段 4：Event Bus — Workflow 副作用到 UI

> **POC 目标**：验证 Workflow 执行后，除数据写入外，能通过事件总线触发 UI 视觉反馈（动画、Toast 等），两条通路互不干扰。
> **范围**：纯前端，事件总线为模块单例，无持久化。

---

## 一、当前问题

`WorkflowContext` 目前通过硬编码回调处理 UI 副作用：

```ts
ctx.showToast('命中！造成 12 点伤害')
ctx.playAnimation('fire-bolt')
```

问题：

- 宿主需要预先知道「所有可能的 UI 副作用」——插件无法扩展自定义效果
- `playAnimation` 需要知道哪个 DOM 元素在哪个面板里，宿主层根本无从得知
- Workflow 和 UI 表现强耦合，违反「Workflow 不知道 UI 长什么样」的核心约束

---

## 二、设计方案

### 2.1 EventHandle（仿照 WorkflowHandle）

```ts
export interface EventHandle<TPayload> {
  readonly key: string
  readonly _phantom?: TPayload
}

export function defineEvent<TPayload>(key: string): EventHandle<TPayload> {
  return { key } as EventHandle<TPayload>
}
```

运行时只是字符串 key，编译时携带 payload 类型。跨插件共享事件时，import 同一个 handle 即可保证类型安全。

### 2.2 IEventBusSDK 接口

```ts
export interface IEventBusSDK {
  /** 发射事件 */
  emit<T>(handle: EventHandle<T>, payload: T): void

  /** 订阅事件，返回取消订阅函数 */
  on<T>(handle: EventHandle<T>, handler: (payload: T) => void): () => void

  /** React hook：组件内订阅，unmount 时自动清理 */
  useEvent<T>(handle: EventHandle<T>, handler: (payload: T) => void): void
}
```

### 2.3 事件总线实例化：模块单例

事件总线是广播系统，没有「所有者」，也不需要每个面板有独立实例。以模块单例实现：

```ts
// src/event-bus/index.ts
class EventBus {
  private handlers = new Map<string, Set<(payload: unknown) => void>>()

  emit<T>(handle: EventHandle<T>, payload: T): void {
    this.handlers.get(handle.key)?.forEach((h) => h(payload as unknown))
  }

  on<T>(handle: EventHandle<T>, handler: (payload: T) => void): () => void {
    if (!this.handlers.has(handle.key)) {
      this.handlers.set(handle.key, new Set())
    }
    const set = this.handlers.get(handle.key)!
    set.add(handler as (payload: unknown) => void)
    return () => set.delete(handler as (payload: unknown) => void)
  }
}

export const eventBus = new EventBus()

// 工厂函数：用于测试隔离，每次创建独立实例
export function createEventBus(): EventBus {
  return new EventBus()
}
```

> **审核更新**：运行时仍使用模块单例 `eventBus`，但额外导出 `createEventBus()` 工厂函数，供测试用例创建隔离实例，避免测试间的事件串扰。参见 [06-审核意见.md](06-审核意见.md) §3.3。

### 2.4 useEvent 实现（避免闭包陈旧）

```ts
export function useEvent<T>(handle: EventHandle<T>, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  useEffect(() => {
    return eventBus.on(handle, (payload) => handlerRef.current(payload))
  }, [handle.key])
}
```

### 2.5 Workflow 中发射：注入到 WorkflowContext

Workflow 通过 `ctx.events` 发射，与 `ctx.read`、`ctx.updateComponent` 风格一致——所有能力由 context 注入，无隐式全局依赖，单元测试可 mock：

```ts
interface WorkflowContext<TState, TConst = undefined> {
  state: TState
  const?: Readonly<TConst>
  updateComponent<T>(...): void
  patchGlobal(...): void
  read: { ... }

  // 新增
  events: {
    emit<T>(handle: EventHandle<T>, payload: T): void
  }
}

// workflow 步骤中
ctx.events.emit(combatHitEvent, {
  targetId: input.targetId,
  damage: result.damage,
  critical: result.critical,
})
```

### 2.6 组件中订阅

```tsx
function EntityCard({ sdk, entityId }: ComponentProps & { entityId: string }) {
  const [flash, setFlash] = useState(false)

  sdk.events.useEvent(combatHitEvent, (payload) => {
    if (payload.targetId === entityId) {
      setFlash(true)
      setTimeout(() => setFlash(false), 600)
    }
  })

  return <div style={{ outline: flash ? '2px solid red' : 'none' }}>...</div>
}
```

---

## 三、完整数据流（结合阶段 3 场景）

```
拖拽落下 → onDrop 触发
          ↓
sdk.workflow.run(applyTagHandle, { tagId, targetId })
          ↓
workflow 步骤执行：
  ctx.updateComponent(...)           → store 更新 → 所有面板 re-render（通路 2）
  ctx.events.emit(tagAppliedEvent)  → 广播（通路 4）
          ↓（两条通路并行，互不干扰）
  ┌────────────────────────────────┐
  │ store 更新                     │  → 标记列表立即显示新值
  │ tagAppliedEvent 广播           │  → 相关组件播放「添加标记」动画
  └────────────────────────────────┘
```

---

## 四、与 showToast 等现有回调的关系

| 现有回调                | 替换方向                                  | 时机               |
| ----------------------- | ----------------------------------------- | ------------------ |
| `ctx.showToast(msg)`    | `ctx.events.emit(toastEvent, { msg })`    | POC 验证通过后清理 |
| `ctx.playAnimation(id)` | `ctx.events.emit(animationEvent, { id })` | 同上               |

POC 阶段：在 `WorkflowContext` 上**新增** `ctx.events`，旧回调标记废弃但暂不删除。验收通过后统一清理。

---

## 五、边界规则

事件总线只适合**瞬时、错过就算了**的 UI 信号：

| ✅ 适合      | ❌ 不适合                                |
| ------------ | ---------------------------------------- |
| 受击动画触发 | 当前选中的 Token（用 Session State）     |
| Toast / 通知 | 背包物品、HP 等游戏数据（用 Data Layer） |
| 掷骰子演出   | 需要「迟到者」也能读到的任何状态         |
| 法术施放特效 | —                                        |

---

## 六、验收标准

1. **副作用触发**：workflow 调用 `ctx.events.emit`，订阅该事件的组件收到 payload 并执行视觉反馈。

2. **两条通路互不干扰**：同一个 workflow 既写入 store（面板数据更新）又发射事件（动画触发），两者独立执行，互不阻塞。

3. **自动清理**：组件 unmount 后，`useEvent` 订阅自动取消，不产生内存泄漏。

4. **类型安全**：emit 的 payload 类型与 handle 声明的 `TPayload` 一致，不匹配时编译报错。

5. **异常隔离**：某个 handler 抛出异常时，不影响同一事件的其他 subscriber 的执行。

---

## 七、二审补充

> 以下内容来自全链路验证二审讨论，对本阶段设计的修订和补充。

### 7.1 `emit` 实现需要异常隔离

§2.3 中的 `emit` 实现使用 `forEach` 遍历 handler，如果某个 handler 抛异常，`forEach` 中断，后续 handler 不会执行。这违反验收标准 5。

修正后的实现：

```ts
emit<T>(handle: EventHandle<T>, payload: T): void {
  this.handlers.get(handle.key)?.forEach(h => {
    try {
      h(payload as unknown)
    } catch (e) {
      console.error(`[EventBus] handler error for "${handle.key}":`, e)
    }
  })
}
```

每个 handler 独立 try-catch，一个插件的 handler 崩溃不影响其他 subscriber。
