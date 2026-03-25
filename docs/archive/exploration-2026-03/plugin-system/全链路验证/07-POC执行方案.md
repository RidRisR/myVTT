# 全链路验证 POC 执行方案

> **前置阅读**：[00-议程.md](00-议程.md)（阶段一览）、[06-审核意见.md](06-审核意见.md)（设计决策汇总）
>
> 本文档是可直接落地的实施计划。所有设计讨论已在阶段 1–6 文档中完成，此处只记录"怎么做"和"按什么顺序做"。

---

## 一、总体策略

### 1.1 独立沙箱，不触碰现有代码

POC 在 `poc/` 目录下完全独立实现，通过 `/#poc` 路由访问（仅 DEV 模式）。

**原因**：

- 现有 `Entity` 类型仍是 `ruleData: unknown`，POC 需要 `components: Record<string, unknown>`——直接改影响面过大
- 现有 `WorkflowContext` 接口与设计文档的 `ctx.state` / `ctx.read` 模型不同——直接改需连锁修改所有插件
- 独立沙箱验证通过后，再做正式迁移，风险最低

**对 `src/` 的唯一改动**：`App.tsx` 添加一行 DEV-only lazy import（参照现有 `#sandbox` 模式）。

### 1.2 渐进构建贯穿场景

从阶段 1 起使用 **core + status-fx 两个插件**的数据结构，每个阶段在同一个场景上叠加新能力：

| 阶段 | 场景能力                                  |
| ---- | ----------------------------------------- |
| 1    | 只读渲染两个插件的 component 数据         |
| 2    | dealDamage workflow 带 status-fx 抗性拦截 |
| 3    | DnD 拖拽法术触发 dealDamage               |
| 4    | workflow emit 事件 → 受击动画 + 伤害日志  |
| 5a   | 点击 token → selection → 详情面板联动     |

各阶段的独立验收标准作为实现检查点，贯穿场景确保跨插件协作被端到端验证。

### 1.3 Hooks 风格：独立函数

设计文档二审提出的 `sdk.useComponent()` 方案违反 React hooks 规则（`eslint-plugin-react-hooks` 不识别对象方法为合法 hook 调用）。

**POC 采用独立 hooks**：

```ts
// ✅ POC 方案：独立函数，符合 React 规范
import { useComponent } from '../hooks'
const health = useComponent<Health>(entityId, 'core:health')

// ❌ 文档方案（不采用）：对象方法，触发 lint 警告
const health = sdk.useComponent<Health>(entityId, 'core:health')
```

插件面板通过 props 获取 `entityId`，通过 import 获取 hooks 和命令式 `dataReader`。`sdk` 对象仅保留 `workflow`（执行）和 `interaction`（DnD/Layout）。

### 1.4 阶段 5 拆分

| 子阶段 | 内容                       | 验证方式   |
| ------ | -------------------------- | ---------- |
| 5a     | selection + 动态绑定       | e2e + 单测 |
| 5b     | requestInput 暂停/恢复机制 | **仅单测** |

`requestInput` 的 e2e 演示需要实现地图层 click 路由、瞄准 UI 等大量非核心代码，性价比不高。单测足以验证 Promise 暂停/恢复/取消机制。

---

## 二、目录结构

```
poc/
  types.ts                    -- PocEntity, IDataReader, PocWorkflowContext 类型
  store.ts                    -- usePocStore (zustand)
  hooks.ts                    -- useEntity, useComponent, useGlobal 独立 hooks
  dataReader.ts               -- createDataReader(): IDataReader（命令式一次性读取）
  eventBus.ts                 -- EventBus class + EventHandle + createEventBus + useEvent
  sessionStore.ts             -- usePocSessionStore (selection + 写入隔离)
  pocWorkflowContext.ts       -- 创建兼容旧 WorkflowContext 的 POC context
  PocApp.tsx                  -- /poc 路由入口，布局 + 面板渲染
  PocPanelRenderer.tsx        -- 增强版 PanelRenderer（instanceProps factory）
  mockData.ts                 -- 20+ entity 初始数据
  plugins/
    core/
      index.ts                -- core plugin: onActivate（注册 workflow + steps）
      workflows.ts            -- dealDamage + setSelection workflow handles
      events.ts               -- EventHandle 定义（damageDealtEvent 等）
      components.ts           -- Health, StatusTags 类型定义
    status-fx/
      index.ts                -- status-fx plugin: onActivate（拦截步骤 + 事件订阅）
      components.ts           -- Resistances 类型定义
  panels/
    EntityCard.tsx             -- 实体卡（health, resistances, status tags, drop zone, 受击闪烁）
    StatusTagPalette.tsx       -- 法术/标签拖拽源面板
    DamageLog.tsx              -- 伤害日志面板（订阅 damageDealtEvent）
    SelectionDetail.tsx        -- 选中详情面板（动态绑定 session.selection）
  __tests__/
    store.test.ts              -- 阶段 1：响应式数据层
    workflow-write.test.ts     -- 阶段 2：workflow 写入
    dnd-dual-panel.test.ts     -- 阶段 3：DnD 双面板联动
    eventBus.test.ts           -- 阶段 4：EventBus
    session.test.ts            -- 阶段 5a：session state
    requestInput.test.ts       -- 阶段 5b：requestInput（仅单测）
    cross-plugin.test.ts       -- 跨插件降级验证
```

---

## 三、可复用的现有代码

| 模块               | 来源文件                               | 用法                         |
| ------------------ | -------------------------------------- | ---------------------------- |
| WorkflowEngine     | `src/workflow/engine.ts`               | 直接 import，不修改          |
| PluginSDK          | `src/workflow/pluginSDK.ts`            | addStep / attachStep         |
| makeDnDSDK         | `src/ui-system/dnd.ts`                 | DnD 原语（makeDraggable 等） |
| UIRegistry         | `src/ui-system/registry.ts`            | 组件注册                     |
| PanelErrorBoundary | `src/ui-system/PanelErrorBoundary.tsx` | 面板错误隔离                 |

---

## 四、分阶段实施

### 阶段 0：基础脚手架

**任务**：

1. **路由入口**：`src/App.tsx` 添加 DEV-only 分支：

   ```ts
   if (import.meta.env.DEV && hash === '#poc') {
     const PocApp = React.lazy(() => import('../poc/PocApp'))
     return <React.Suspense fallback={null}><PocApp /></React.Suspense>
   }
   ```

2. **`poc/types.ts`**：核心类型定义：

   ```ts
   interface PocEntity {
     id: string
     name: string
     imageUrl: string
     color: string
     components: Record<string, unknown> // ECS 风格，替代 ruleData
   }

   interface PocGlobal {
     key: string
     [k: string]: unknown
   }

   // 命令式一次性读取（非 hook，任何地方可用）
   interface IDataReader {
     entity(id: string): PocEntity | undefined
     component<T>(entityId: string, key: string): T | undefined
     global(key: string): PocGlobal | undefined
     query(spec: { has?: string[] }): PocEntity[]
   }
   ```

3. **`poc/PocApp.tsx`**：空壳页面

**出口标准**：`/#poc` 显示空白页面；`pnpm test` 能发现 `poc/` 下的测试文件。

---

### 阶段 1：响应式数据层

**目标**：验证 zustand store → hook 订阅 → 自动 re-render 链路。

**核心文件**：

| 文件                        | 职责                                            |
| --------------------------- | ----------------------------------------------- |
| `poc/store.ts`              | zustand store：entities + globals + 两个 action |
| `poc/hooks.ts`              | `useEntity`, `useComponent`, `useGlobal`        |
| `poc/dataReader.ts`         | `createDataReader()` 命令式读取                 |
| `poc/mockData.ts`           | 初始 mock 数据                                  |
| `poc/panels/EntityCard.tsx` | 只读实体卡面板                                  |

**store 关键实现**：

```ts
// updateEntityComponent：函数式更新器，在 set() 内原子完成读+写
updateEntityComponent(entityId, key, updater) {
  set(state => ({
    entities: {
      ...state.entities,
      [entityId]: {
        ...state.entities[entityId],
        components: {
          ...state.entities[entityId]?.components,
          [key]: updater(state.entities[entityId]?.components?.[key]),
        },
      },
    },
  }))
}
```

**hooks 关键设计**：精确 selector 避免无关 re-render：

```ts
export function useComponent<T>(entityId: string, key: string): T | undefined {
  return usePocStore((s) => s.entities[entityId]?.components[key] as T | undefined)
}
```

**mock 数据**：

- `goblin-01`：`core:health { hp:20, maxHp:30 }` + `status-fx:resistances { fire:5, ice:0 }`
- `hero-01`：`core:health { hp:45, maxHp:50 }` + `status-fx:resistances { fire:0, ice:10 }`
- 额外 18 个 entity（循环生成，满足审核意见 §3.2 性能代表性要求）
- Globals：`Fear { current:0 }`、`Hope { current:3 }`

**PocApp 布局**：两个 EntityCard 绑定同一 entityId + "直接改 store"按钮（验证响应式）。

**测试**（`poc/__tests__/store.test.ts`）：

- `updateEntityComponent` 原子更新
- `patchGlobal` shallow merge
- hook re-render 精确性：改 entity A 不触发 entity B 的 hook
- `query({ has: ['core:health'] })` 返回正确子集

**验收标准**：

- [x] 点击"扣血"按钮 → 两个面板同时显示新 HP
- [x] `query({ has: ['core:health'] })` 返回所有有 health 组件的实体
- [x] `patchGlobal('Fear', { current: 3 })` → 显示 Fear 的组件立即更新

---

### 阶段 2：Workflow 写入数据

**目标**：验证 UI → Workflow → Data → re-render 完整闭环。

**核心文件**：

| 文件                             | 职责                          |
| -------------------------------- | ----------------------------- |
| `poc/pocWorkflowContext.ts`      | 兼容旧接口的 POC context 工厂 |
| `poc/plugins/core/workflows.ts`  | `dealDamage` workflow 定义    |
| `poc/plugins/core/components.ts` | Health, StatusTags 等类型     |
| `poc/plugins/status-fx/index.ts` | 拦截步骤：抗性减免            |

**兼容策略**（关键设计）：

`WorkflowEngine.runWorkflow(name, ctx, internal)` 接受旧 `WorkflowContext` 类型，但只把 `ctx` 原样传给 step 的 `run(ctx)`。POC context 作为旧接口的**超集**：

```ts
function createPocWorkflowContext(deps, initialState, internal) {
  const stateObj = { ...initialState }
  return {
    // 旧接口兼容——engine 访问 .data
    get data() {
      return stateObj
    },

    // 新接口——步骤代码用 .state
    get state() {
      return stateObj
    },

    // 新能力
    read: deps.dataReader,
    updateComponent: (eid, key, updater) => deps.store.updateEntityComponent(eid, key, updater),
    patchGlobal: (key, patch) => deps.store.patchGlobal(key, patch),
    events: { emit: (handle, payload) => deps.eventBus.emit(handle, payload) },

    // 旧接口 stub（engine 不主动调用，但类型要求存在）
    updateEntity: () => {},
    updateTeamTracker: () => {},
    serverRoll: () => Promise.resolve({ rolls: [], total: 0 }),
    showToast: () => {},
    announce: () => {},
    playAnimation: () => Promise.resolve(),
    playSound: () => {},

    // 流程控制
    abort: (reason) => {
      internal.abortCtrl.aborted = true
      internal.abortCtrl.reason = reason
    },
    runWorkflow: (handle, data) => {
      /* 嵌套 workflow 支持 */
    },
  } as WorkflowContext // 类型断言，实际是超集
}
```

**dealDamage workflow**（两步，由 core 定义）：

```ts
const dealDamageHandle = engine.defineWorkflow<DealDamageState>('core:deal-damage', [
  {
    id: 'core:calc-damage',
    run: (ctx) => {
      ctx.state.finalDamage = ctx.state.rawDamage // 默认无减免
    },
  },
  {
    id: 'core:apply-damage',
    run: (ctx) => {
      ctx.updateComponent(ctx.state.targetId, 'core:health', (current) => ({
        hp: Math.max(0, (current?.hp ?? 0) - ctx.state.finalDamage),
        maxHp: current?.maxHp ?? 0,
      }))
    },
  },
])
```

**status-fx 拦截**：

```ts
sdk.addStep(dealDamageHandle, {
  id: 'status-fx:apply-resistance',
  before: 'core:apply-damage', // 在扣血之前
  run: (ctx) => {
    const resistances = ctx.read.component<Resistances>(ctx.state.targetId, 'status-fx:resistances')
    const resistance = resistances?.[ctx.state.damageType] ?? 0
    ctx.state.finalDamage = Math.max(0, ctx.state.finalDamage - resistance)
  },
})
```

**测试**（`poc/__tests__/workflow-write.test.ts`）：

- workflow 执行后 store 数据变化
- `ctx.read.component()` 在 workflow 内读取数据
- status-fx 拦截正确减免伤害
- 双面板同步更新

**验收标准**：

- [x] 点击按钮 → workflow 执行 → Entity HP 变化 → 面板立即显示新值
- [x] 火焰箭攻击 goblin（火焰抗性 5）→ 实际扣血 = rawDamage - 5
- [x] 两个绑定同一 entity 的面板同步更新

---

### 阶段 3：DnD → Workflow → 双面板联动

**目标**：验证"面板不直接通信、通过数据层间接联动"在 DnD 场景下成立。

**核心文件**：

| 文件                              | 职责                |
| --------------------------------- | ------------------- |
| `poc/panels/StatusTagPalette.tsx` | 法术/标签拖拽源面板 |
| `poc/panels/EntityCard.tsx` 增强  | 添加 drop zone      |

**复用**：`makeDnDSDK` 从 `src/ui-system/dnd.ts` 直接 import。

**EntityCard drop zone**：

```tsx
const dropZoneProps = dnd.makeDropZone({
  accept: ['spell'],
  canDrop: (payload) => {
    // 命令式 API（非 hook），在事件回调中使用
    const health = dataReader.component<Health>(entityId, 'core:health')
    return health !== undefined && health.hp > 0
  },
  onDrop: (payload) => {
    const spell = payload.data as SpellPayload
    runner.runWorkflow(dealDamageHandle, {
      targetId: entityId,
      rawDamage: spell.damage,
      damageType: spell.damageType,
    })
  },
})
```

**布局**：StatusTagPalette + 两个 EntityCard（绑定同一 entityId）。

**测试**（`poc/__tests__/dnd-dual-panel.test.ts`）：

- onDrop 触发 workflow
- canDrop 拒绝已死亡实体（hp=0）
- 跨面板拖放数据同步

**验收标准**：

- [x] 从法术面板拖"火焰箭"到 goblin → 两个面板同时更新 HP
- [x] 对 hp=0 的实体拖拽时视觉显示不可放置
- [x] 从面板 A 拖到面板 B，数据同步

---

### 阶段 4：EventBus 副作用

**目标**：验证 Workflow 的数据写入（通路 2）和事件副作用（通路 4）互不干扰。

**核心文件**：

| 文件                         | 职责                              |
| ---------------------------- | --------------------------------- |
| `poc/eventBus.ts`            | EventBus + EventHandle + useEvent |
| `poc/plugins/core/events.ts` | `damageDealtEvent` 定义           |
| `poc/panels/DamageLog.tsx`   | 伤害日志面板                      |

**EventBus 实现要点**：

```ts
// emit 必须异常隔离（审核意见 §2.1 验收项）
emit<T>(handle: EventHandle<T>, payload: T): void {
  this.handlers.get(handle.key)?.forEach(h => {
    try { h(payload as unknown) }
    catch (e) { console.error(`[EventBus] handler error for "${handle.key}":`, e) }
  })
}

// useEvent 避免闭包陈旧
function useEvent<T>(handle: EventHandle<T>, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler)
  useEffect(() => { handlerRef.current = handler })
  useEffect(() => eventBus.on(handle, (p) => handlerRef.current(p)), [handle.key])
}

// 测试隔离（审核意见 §3.3）
export function createEventBus(): EventBus { return new EventBus() }
```

**接入**：

- `core:apply-damage` 步骤末尾添加 `ctx.events.emit(damageDealtEvent, { targetId, damage, damageType, critical })`
- `EntityCard` 添加受击闪烁：`useEvent(damageDealtEvent, ...)` + CSS transition
- `DamageLog` 订阅 `damageDealtEvent`，累积显示伤害记录

**测试**（`poc/__tests__/eventBus.test.ts`）：

- emit/on 基本流程
- 异常隔离：handler A 抛异常不影响 handler B
- useEvent unmount 自动清理
- createEventBus 测试隔离

**验收标准**：

- [x] 拖拽 → HP 更新（数据通路）+ 受击闪烁 + 日志显示（事件通路），两通路互不干扰
- [x] status-fx 的 handler 抛异常 → core 的 handler 仍正常执行
- [x] 组件 unmount 后不再收到事件

---

### 阶段 5a：Session State — 选中与动态绑定

**目标**：验证 session state 驱动跨面板联动 + instanceProps 动态绑定。

**核心文件**：

| 文件                                 | 职责                       |
| ------------------------------------ | -------------------------- |
| `poc/sessionStore.ts`                | `usePocSessionStore`       |
| `poc/plugins/core/workflows.ts` 新增 | `setSelection` workflow    |
| `poc/PocPanelRenderer.tsx`           | instanceProps factory 支持 |
| `poc/panels/SelectionDetail.tsx`     | 选中详情面板               |

**session store**（写入隔离）：

```ts
interface SessionState {
  selection: string[]
}
const usePocSessionStore = create<SessionState>(() => ({ selection: [] }))

// 写入函数不对外导出——仅供 core:set-selection workflow 步骤内部调用
function _setSelection(entityIds: string[]) {
  usePocSessionStore.setState({ selection: entityIds })
}
```

**setSelection 作为单步 workflow**（可被插件拦截）：

```ts
const setSelectionHandle = defineWorkflow<{ entityId: string | null }>(
  'core:set-selection',
  (ctx) => {
    _setSelection(ctx.state.entityId ? [ctx.state.entityId] : [])
  },
)
```

**PocPanelRenderer 增强**（instanceProps factory）：

```tsx
const session = usePocSessionStore()
const resolvedProps =
  typeof entry.instanceProps === 'function'
    ? entry.instanceProps(session)
    : (entry.instanceProps ?? {})
```

**布局配置**：

```ts
// 静态绑定
'entity-card#fixed': { instanceProps: { entityId: 'goblin-01' } }

// 动态绑定——跟随选中
'entity-detail#selected': {
  instanceProps: (session) => ({ entityId: session.selection[0] ?? null })
}
```

**PocApp 新增**：entity 列表（模拟 token 点击），点击 → `runner.runWorkflow(setSelectionHandle, { entityId })`

**测试**（`poc/__tests__/session.test.ts`）：

- setSelection workflow 更新 session store
- instanceProps factory 在 session 变化时重求值
- 动态面板跟随 selection 变化

**验收标准**：

- [x] 点击 entity 列表中 goblin → 详情面板显示 goblin 信息
- [x] 再点 hero → 详情面板切换为 hero
- [x] 静态绑定的面板不受 selection 影响

---

### 阶段 5b：requestInput 暂停机制（仅单测）

**目标**：验证 workflow 暂停/恢复/取消的核心机制。

**仅单测**（`poc/__tests__/requestInput.test.ts`），不做 e2e 视觉演示：

- `requestInput` 暂停 workflow（Promise 挂起，步骤不继续）
- `resolveInput(interactionId, value)` 恢复（Promise resolve → workflow 继续）
- `cancelInput(interactionId)` 取消（workflow 状态 = `'cancelled'`）
- `pendingInteractions: Map<string, PendingInteraction>` 支持多个并行 workflow 同时等待输入

---

### 跨插件集成测试

`poc/__tests__/cross-plugin.test.ts`：

1. **两插件激活** → dealDamage 执行：goblin 受火焰箭 → 扣血 = rawDamage - 火焰抗性
2. **禁用 status-fx**（`engine.deactivatePlugin('status-fx')`）→ dealDamage 仍正常执行，扣血 = rawDamage（无抗性计算）
3. **status-fx 的 EventBus handler 抛异常** → core 的 damage toast handler 不受影响

---

## 五、依赖关系与实施顺序

```
阶段 0（脚手架）
  ↓
阶段 1（store + hooks + 只读渲染）
  ↓
阶段 2（PocWorkflowContext + workflow 写入 + 跨插件拦截）
  ↓
阶段 3（DnD + drop zone + 双面板联动）
  ↓
阶段 4（EventBus + 受击动画 + 伤害日志）
  ↓
阶段 5a（session store + setSelection workflow + 动态绑定）
  ↓
阶段 5b（requestInput 单测）

跨插件集成测试 ← 阶段 4 完成后即可执行
```

阶段 3 和阶段 4 之间无强依赖，但建议按顺序实施——阶段 4 需要修改阶段 3 的 workflow 步骤添加 `ctx.events.emit`。

---

## 六、验证方式

| 方式     | 命令 / 操作                      | 覆盖范围            |
| -------- | -------------------------------- | ------------------- |
| 自动化   | `pnpm test poc/`                 | 每个阶段的单元/集成 |
| 视觉验证 | `pnpm dev` → 浏览器 `/#poc`      | UI 响应、动画、DnD  |
| 性能     | mockData 20+ entity + 4-5 个面板 | re-render cascade   |
| 降级     | 禁用 status-fx 后重复操作        | 插件独立性          |

---

## 七、POC 成功后的下一步

本 POC 验证的是**接口设计和数据流通路**。验证通过后，正式迁移需要：

| 迁移项                                | 说明                                           |
| ------------------------------------- | ---------------------------------------------- |
| `Entity.ruleData` → `components`      | 修改 `shared/entityTypes.ts`，更新所有消费方   |
| `WorkflowContext` 接口升级            | `ctx.data` → `ctx.state`，添加 `ctx.read` 等   |
| 后端 schema                           | `entity_components` 表、REST 路由、Socket 事件 |
| 现有插件适配                          | daggerheart 插件迁移到新 component 模型        |
| `registerComponent` 注册机制          | schema + default 值（POC 中硬编码）            |
| `IDataReader.query()` 的 `where` 条件 | POC 只实现 `has`，生产可能需要属性过滤         |

这些迁移项独立于 POC，在另一个分支上执行。
