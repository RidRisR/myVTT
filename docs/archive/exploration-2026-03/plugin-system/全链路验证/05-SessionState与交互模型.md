# 阶段 5：Session State 与交互模型

> **状态**：讨论中，部分结论已确认，选中干预机制待深入讨论。
> **本文档**：记录从需求分析中浮现的架构洞察，作为后续设计的基础。

---

## 一、Session State 的 Scope

经需求分析，`sdk.session` 只承担两件事：

| 槽位                 | 内容                             | 写入方                                      |
| -------------------- | -------------------------------- | ------------------------------------------- |
| `selection`          | 当前选中的实体 ID 集合           | `core:set-selection` workflow（地图层调用） |
| `pendingInteraction` | 当前 workflow 等待用户输入的请求 | `ctx.requestInput`（workflow 内部写入）     |

以下内容**不进入** `sdk.session`：

- **激活工具**：「工具」概念已被消解（见第二节），不存在独立的工具状态
- **面板焦点**：布局引擎内部状态，插件不需要感知
- **DnD 持有物**：依赖 `pendingInteraction` 机制，待 DnD 暂存容器模型设计完成后再定

---

## 二、工具系统的消解

**结论：不需要独立的「工具系统」。**

传统 VTT 的「工具」（指针、尺子、目标选择等）在本架构中被统一为：

> **工具 = 触发 workflow 的按钮**

```
工具栏按钮点击
    ↓
sdk.workflow.run(rulerToolHandle, {})
    ↓
workflow 步骤通过 ctx.requestInput 等待用户在地图上操作
    ↓
用户操作完成，workflow 恢复执行，产生结果
```

所谓「工具激活状态」，就是 `session.pendingInteraction` 是否存在。地图层根据这个状态决定鼠标点击事件的路由方向（见第三节）。

**推论：插件自定义工具是平凡的。** 插件定义一个 workflow，注册一个工具栏按钮，即拥有自定义工具能力，无需任何特殊权限或注册机制。

---

## 三、Workflow 暂停机制：ctx.requestInput

### 3.1 问题

某些操作需要用户在执行中途提供输入（如「选择法术目标」），workflow 必须暂停等待，得到输入后再继续。

### 3.2 机制

利用 `async/await`，workflow 天然支持暂停。需要设计的是 Promise 的构造和解决方式：

```ts
// workflow 步骤内
const targetId = await ctx.requestInput(targetSelectionRequest, {
  validTargets: ctx.read.query({ has: ['core:health'] }).map((e) => e.id),
  prompt: 'Select a target for Fire Bolt',
})
// ← 暂停，等待用户在地图上点击
// 点击后自动恢复，targetId 已拿到
ctx.updateComponent(targetId, 'core:health', (current) => ({ ...current, hp: newHp }))
```

### 3.3 实现

```ts
// ctx.requestInput 的内部行为：
// 1. 把 { handle, context } 写入 session.pendingInteraction（UI 组件来读）
// 2. 把 resolve 函数存起来
// 3. 返回 Promise

// 地图层（或任何 UI 组件）在用户完成操作后：
sdk.session.resolveInput(targetId)
// → 调用存好的 resolve(targetId)
// → session.pendingInteraction 清空
// → workflow 从 await 处继续
```

### 3.4 地图层的 click 路由

```
没有 pendingInteraction：
  点击 token → sdk.session.setSelection(tokenId)   ← 记录选中状态

有 pendingInteraction（workflow 等待中）：
  点击 token → sdk.session.resolveInput(tokenId)   ← 解决 Promise，workflow 恢复
```

地图层根据 `session.pendingInteraction` 的存在与否，同一个点击事件走不同路径，无需任何模式切换逻辑。

### 3.5 类型定义

```ts
// 类似 WorkflowHandle / EventHandle 的幻影类型
interface InputRequestHandle<TContext, TReturn> {
  readonly key: string
  readonly _phantomContext?: TContext
  readonly _phantomReturn?: TReturn
}

function defineInputRequest<TContext, TReturn>(key: string): InputRequestHandle<TContext, TReturn> {
  return { key } as InputRequestHandle<TContext, TReturn>
}

// 示例
const targetSelectionRequest = defineInputRequest<
  { validTargets: string[]; prompt: string },
  string // 返回选中的 entityId
>('core:target-selection')
```

### 3.6 WorkflowContext 补充

```ts
interface WorkflowContext<TState, TConst = undefined> {
  state: TState
  const?: Readonly<TConst>
  updateComponent<T>(...): void
  patchGlobal(...): void
  read: { ... }
  events: { emit(...): void }

  // 新增：暂停 workflow，等待用户输入
  requestInput<TContext, TReturn>(
    handle: InputRequestHandle<TContext, TReturn>,
    context: TContext
  ): Promise<TReturn>
}
```

---

## 四、ISessionSDK 接口

### 4.1 完整接口

```ts
interface ISessionSDK {
  // --- 选中管理 ---

  /** 写入选中（地图层调用） */
  setSelection(entityId: string | null): void

  /** React hook：订阅选中变化，组件自动重渲染 */
  useSelection(): string[]

  /** 同步读取当前选中（供非 React 代码使用） */
  getSelection(): string[]

  // --- Workflow 暂停机制 ---

  /** React hook：订阅当前等待的输入请求（地图层/提示 UI 使用） */
  usePendingInteraction(): PendingInteraction | null

  /** 同步读取（地图层 click handler 使用） */
  getPendingInteraction(): PendingInteraction | null

  /** 解决当前等待的 Promise，workflow 从 await 处继续 */
  resolveInput(value: unknown): void

  /** 取消当前等待的输入请求（用户按 Escape 或组件 unmount 时） */
  cancelInput(): void

  // --- 未来（POC 暂不实现） ---
  // registerSelectGuard(fn: (entityId: string) => boolean): () => void
}

interface PendingInteraction {
  handle: InputRequestHandle<unknown, unknown>
  context: unknown // 传给 UI 的提示信息（如"请选择目标"、合法目标列表）
}
```

### 4.2 两个完整场景

**场景一：点击选中 token**

```
用户点击地图上的 goblin-01
    ↓
onTokenClick('goblin-01')
    ↓
session.pendingInteraction === null → 走选中路径
    ↓
sdk.workflow.run(setSelectionHandle, { entityId: 'goblin-01' })
    ↓
session.selection = ['goblin-01']
    ↓
所有 useSelection() 订阅者重渲染
布局引擎调用 instanceProps 工厂函数 → entityId = 'goblin-01'
详情面板收到新的 entityId prop，显示地精信息
```

**场景二：workflow 等待目标选择**

```
用户点击"施放火焰箭"按钮
    ↓
sdk.workflow.run(castSpellHandle, { casterId: 'hero-1', spellId: 'fire-bolt' })
    ↓
workflow：const targetId = await ctx.requestInput(targetSelectionRequest, { prompt: '选择目标' })
    ↓
session.pendingInteraction = { handle, context: { prompt: '选择目标' } }
地图显示瞄准光标 + "选择目标"提示
    ↓
用户点击 goblin-01
    ↓
onTokenClick('goblin-01')
session.pendingInteraction !== null → 走 resolveInput 路径
    ↓
sdk.session.resolveInput('goblin-01')
    ↓
session.pendingInteraction = null，地图恢复普通光标
workflow 从 await 处继续：targetId = 'goblin-01'
ctx.updateComponent('goblin-01', 'core:health', (current) => ({ ...current, hp: newHp }))
```

---

## 五、动态上下文绑定

布局配置中，`instanceProps` 的值可以是静态对象，也可以是接收 session 的工厂函数：

```ts
// 静态：面板永远显示 goblin-01
'entity-card#fixed': {
  instanceProps: { entityId: 'goblin-01' }
}

// 动态：面板跟随当前选中（工厂函数）
'entity-card#detail': {
  instanceProps: (session) => ({ entityId: session.selection[0] ?? null })
}
```

布局引擎在渲染前判断 `instanceProps` 是对象还是函数——如果是函数，则传入当前 session 调用，组件始终收到普通值，无需感知绑定来源。当 session 变化时，引擎重新调用工厂函数，组件自动重渲染。

> **审核更新**：原设计使用 `$session.xxx` 字符串表达式语法，已改为函数式 props 工厂。函数式方案无需实现表达式解析器，类型安全更好，且天然支持默认值（`?? null`）和复杂映射逻辑。参见 [06-审核意见.md](06-审核意见.md) §2.3。

**关键点**：组件作者声明"我需要 `entityId: string`"，布局配置者决定这个值是固定的还是跟随 session——两个关注点完全分离。

---

## 六、待定问题

### 6.1 选中的干预机制（已解决）

**结论：`setSelection` 是一个单步 workflow，插件通过 `sdk.addStep` 拦截。**

```ts
// core 定义，默认步骤写入 session
const setSelectionHandle = defineWorkflow<{ entityId: string | null }>(
  'core:set-selection',
  async (ctx) => {
    sessionStore.setSelection(ctx.state.entityId)
  },
)

// 地图层调用（接口不变）
sdk.workflow.run(setSelectionHandle, { entityId: tokenId })

// 插件拦截（复用现有 sdk.addStep，无新 API）
sdk.addStep(setSelectionHandle, {
  id: 'my-plugin:check-curse',
  before: 'core:set-selection',
  run: (ctx) => {
    const status = ctx.read.component(ctx.state.entityId, 'core:status')
    if (status?.cursed) ctx.abort()
  },
})
```

**为什么之前有争议**：曾担心"选中是 session state 不是 game state，不应该是 workflow"。这个担心的根源是把两个问题混淆了：

- workflow 写入的是哪里（game state / session state）— 这决定数据去哪里
- 是否需要 workflow — 这决定操作能否被插件拦截

两者独立。`core:set-selection` 的默认步骤写入 session store（不是 game state），但它仍然是 workflow，因为插件可能需要拦截它。

**性能说明**：零步骤 / 单步骤 workflow 的优化（见下节）使这个开销可以忽略不计。

### 6.2 DnD 暂存容器

`session.pendingInteraction` 机制可以承载「当前持有的 DnD 物品」状态，待 DnD 暂存容器模型设计完成后对接。

---

## 七、Workflow 边界原则（从本阶段讨论中浮现）

### 7.1 修订后的判断标准

> **任何通过 SDK 的操作 → workflow**
> **React 组件内部状态 → 直接 `useState`**

| 操作            | 机制                 | 原因                                     |
| --------------- | -------------------- | ---------------------------------------- |
| `setSelection`  | workflow             | 通过 SDK，可能被插件拦截                 |
| `moveToken`     | workflow             | 同上                                     |
| `incrementStat` | workflow             | 同上                                     |
| `resolveInput`  | 直接调用（内部机制） | 不是外部操作，是 workflow 暂停的基础设施 |
| 按钮 hover 状态 | `useState`           | React 内部，无语义，插件不关心           |
| 地图滚动位置    | 直接写               | 纯机械 UI 状态，不经过 SDK               |

这比「存档测试」更机械：开发者不需要判断"这个操作重不重要"，只需判断"它走不走 SDK"。

### 7.2 之前的「存档测试」哪里错了

「存档测试」把两个独立问题混为一谈：

1. **这个操作要不要 workflow？**（= 是否需要插件拦截）
2. **这个操作写入的是哪里？**（= 数据是否持久化）

`setSelection` 的答案：①需要 workflow（插件可能拦截），②写入 session（不持久化）。这两个答案完全可以共存——workflow 写的目的地不一定是 game store。

### 7.3 零步骤 workflow 作为生命周期钩子

零步骤 workflow 本身不做任何事，但作为具名挂载点，插件可以往里注入行为：

```ts
// core 定义一个"实体被创建"的生命周期钩子（零步骤）
const onEntityCreatedHandle = defineWorkflow<{ entityId: string }>('core:on-entity-created')

// core 在创建 entity 后触发（什么都不执行，但插件会响应）
sdk.workflow.run(onEntityCreatedHandle, { entityId: newId })

// 插件响应这个钩子
sdk.addStep(onEntityCreatedHandle, {
  id: 'my-plugin:init-inventory',
  run: (ctx) => {
    ctx.updateComponent(ctx.state.entityId, 'my-plugin:inventory', () => ({ items: [] }))
  },
})
```

这与 `ctx.events.emit` 的区别：

|                                | 零步骤 workflow | `ctx.events.emit` |
| ------------------------------ | --------------- | ----------------- |
| 步骤间有顺序、可 abort         | ✅              | ❌                |
| 步骤可以 `ctx.updateComponent` | ✅              | ❌                |
| 适合"错过就算了"的 UI 信号     | ❌              | ✅                |

### 7.4 零步骤快速路径优化

engine 内部对零步骤 workflow 做提前返回，避免创建 WorkflowContext：

```ts
// engine.runWorkflow 内部
const record = this.workflows.get(name)
if (!record?.steps.length) {
  return { status: 'completed', data: ctx.state, errors: [] }
}
// ... 正常执行路径
```

优化后零步骤成本：1 次 Map 查找 + 1 次数组长度判断，可忽略不计。

---

## 八、可拦截性保障机制

### 8.1 两个独立问题

"如何确保所有操作都可被插件拦截"包含两个不同的问题：

**问题 A：写入路径**（store 写入）
→ 通过模块封装强制保证

**问题 B：触发路径**（UI 事件 → 状态变更）
→ 通过架构设计间接保证

### 8.2 写入路径：模块封装

Store 的写入方法**不对外导出**。任何组件或插件都无法绕过 workflow 直接写入 store。

```ts
// session-store.ts
const _store = create<SessionState>(() => ({ selection: [], pendingInteraction: null }))

// ✅ 公开：只读
export const useSessionStore = _store

// 🔒 私有：写入函数不导出
function _setSelection(entityId: string | null) { ... }

// 唯一的写入出口：仅供 core:set-selection workflow 步骤使用
// ESLint no-restricted-imports 防止其他文件导入
export function _issueWriteAPI_internal() {
  return { setSelection: _setSelection }
}
```

ESLint `no-restricted-imports` 规则：除 `src/workflow/` 内的指定文件外，禁止任何文件导入 `_issueWriteAPI_internal`。

**效果**：accidental bypass 在 lint 阶段报错，intentional bypass 需要显式写 `eslint-disable`，在 PR review 中可见。

### 8.3 触发路径：架构设计

地图层点击 token 这类 UI 事件，语言层面无法强制其走 workflow。但架构设计使"不走 workflow"等同于"功能坏掉"：

```
onTokenClick('goblin-01')
    ↓
如果不调用 sdk.session.setSelection()
    → sessionStore.selection 不变
    → 其他所有订阅 useSelection() 的组件看不到变化
    → 功能坏掉，开发者自然发现
```

选中状态**只有一个合法住所**（`sessionStore.selection`），而写入这个住所只能通过 `sdk.session.setSelection()` → workflow。因此正确的实现路径和可被拦截的路径是同一条。

### 8.4 与 libWrapper 的真实对比

libWrapper 是 Foundry VTT 生态的事后包装方案，常被用作对比参照。

|                  | libWrapper                        | 本架构                            |
| ---------------- | --------------------------------- | --------------------------------- |
| 拦截范围         | 任何对象原型方法，无需提前设计    | 只有显式声明的 workflow           |
| 类型安全         | ❌ 无（字符串 key + 手动断言）    | ✅ 完整 TInput / TData 类型       |
| 重构自由度       | ❌ 方法名被隐性冻结为公共 API     | ✅ step 内部实现可随意修改        |
| 失效可见性       | ❌ 静默失效，无报错无提示         | ✅ step id 变更立即定位受影响插件 |
| 数据流           | ❌ 包装层靠参数传递，无共享上下文 | ✅ ctx.state 在 step 间共享       |
| 对核心开发者要求 | 低（事后可补）                    | 高（必须提前路由）                |

---

## 九、二审补充

> 以下内容来自全链路验证二审讨论，对本阶段设计的修订和补充。

### 9.1 `pendingInteraction` 从单槽位改为 Map

§四设计的 `pendingInteraction: PendingInteraction | null` 是单槽位，但两个独立并行 workflow 可能同时需要 `requestInput`（如玩家施法等待选目标 + DM 做 Hope/Fear 决定），任何一个都不应 cancel 另一个。

**具体场景**：

```
1. workflow A: 玩家施法 → ctx.requestInput("选择目标")
   → session.pendingInteraction = { handle: targetSelection }

2. 同时 DM 需要做 Hope/Fear 决定
   → workflow B: ctx.requestInput("选择 Hope 或 Fear")
   → 💥 单槽位下覆盖了 workflow A 的请求，A 的 Promise 成为僵尸
```

**修改**：

```ts
// 改造前（单槽位）
session.pendingInteraction: PendingInteraction | null

// 改造后（并行槽位）
session.pendingInteractions: Map<string, PendingInteraction>
// key = workflow execution id（唯一标识一次 workflow 运行）
```

### 9.2 `ISessionSDK` 接口更新

§4.1 中 `resolveInput` / `cancelInput` 增加 `interactionId` 参数：

```ts
interface ISessionSDK {
  // --- 选中管理（不变）---
  setSelection(entityId: string | null): void
  useSelection(): string[]
  getSelection(): string[]

  // --- Workflow 暂停机制（修改）---

  /** React hook：订阅所有当前等待的输入请求 */
  usePendingInteractions(): Map<string, PendingInteraction>

  /** 同步读取 */
  getPendingInteractions(): Map<string, PendingInteraction>

  /** 解决指定 interaction 的 Promise */
  resolveInput(interactionId: string, value: unknown): void

  /** 取消指定 interaction */
  cancelInput(interactionId: string): void
}
```

**POC 决策**：先实现 Map 结构但只验证单 interaction 场景。多 interaction 的 UI 展示和优先级逻辑推迟到生产阶段。

### 9.3 插件自定义交互 UI

`InputRequestHandle` 的 key 是命名空间化的（如 `my-plugin:choose-spell`），任何组件都可以通过 `usePendingInteractions()` 订阅并检查 handle key。插件定义 `requestInput` 的同时注册对应的 UI 组件来响应，系统不需要知道有哪些交互类型。

```tsx
// 插件自定义交互面板
function SpellPickerPanel({ sdk }) {
  const interactions = sdk.usePendingInteractions()
  // 找到自己关心的 interaction
  const myInteraction = [...interactions.entries()].find(
    ([_, p]) => p.handle.key === 'my-plugin:choose-spell',
  )

  if (!myInteraction) return null
  const [id, pending] = myInteraction

  return (
    <Dialog open>
      <h3>{pending.context.prompt}</h3>
      {pending.context.spells.map((spell) => (
        <button key={spell.id} onClick={() => sdk.session.resolveInput(id, spell.id)}>
          {spell.name}
        </button>
      ))}
      <button onClick={() => sdk.session.cancelInput(id)}>取消</button>
    </Dialog>
  )
}
```

### 9.4 增加验收标准：动态绑定链路

§五的 `instanceProps` 工厂函数依赖 session store 变化触发重求值。增加验收标准：

> 点击地图 token → `session.selection` 变化 → 动态绑定的面板 `instanceProps` 工厂函数重新求值 → 面板显示新选中 entity 的数据。

PanelRenderer 需要订阅 session store 才能在 selection 变化时重新调用工厂函数。
