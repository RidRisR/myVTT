# Sprint 1 探索文档

> **状态**：探索中 | 2026-03-28
> **范围**：Sprint 1 四个任务的设计讨论与决策记录

---

## 目录

1. [任务总览](#1-任务总览)
2. [A1: LogStreamDispatcher 运行时接入](#2-a1-logstreamdispatcher-运行时接入)
3. [C1: 命令系统](#3-c1-命令系统)
4. [T1: 类型安全改造](#4-t1-类型安全改造)
5. [D1: 偏差文档清理](#5-d1-偏差文档清理)

---

## 1 任务总览

| 任务 | 工作量 | 状态 | 依赖 |
|------|--------|------|------|
| A1: Dispatcher 运行时接入 | S | 🟡 设计中 | 无 |
| C1: 命令系统 | M | 🟡 设计中 | 无 |
| T1: ComponentTypeMap + LogPayloadMap | S | ✅ 已确认 | 无 |
| D1: 偏差文档清理 | S | ✅ 已确认 | 无 |

---

## 2 A1: LogStreamDispatcher 运行时接入

### 2.1 背景

`LogStreamDispatcher` 和 `TriggerRegistry` 两个类已完整实现并有测试，但未接入运行时：

| 组件 | 代码 | 运行时 |
|------|------|--------|
| `LogStreamDispatcher` | 完整（dispatch, updateWatermark） | 从未实例化 |
| `TriggerRegistry` | 完整（register, getMatchingTriggers） | 从未实例化 |
| `PluginSDK.registerTrigger()` | 方法已实现 | 构造时未传入 TriggerRegistry，调用会 throw |
| `worldStore` 的 `log:new` handler | 做数据存储 + snapshot 同步 | 不触发任何 workflow |
| `WorkflowEngine` | 模块级懒加载单例 | 首次由 ChatPanel 的 `useWorkflowRunner()` 触发创建 |

### 2.2 已确定的设计决策

#### 决策 1：初始化时机 — Promise.all 之前，同步执行

**现有问题**：`log:new` handler 从 `worldStore.init()` 完成后开始接收事件，但 WorkflowEngine 要等到 ChatPanel 渲染后才懒加载创建。Dispatcher 消费日志流，必须在第一条日志到达之前就绑定好。

**决策**：所有 workflow 结构（Engine、TriggerRegistry、PluginSDK 激活、Dispatcher）在 `App.tsx` 的 `Promise.all([initWorld, initIdentity])` **之前**同步创建。

```
App.tsx useEffect (socket 就绪):
  │
  ├─ initWorkflowSystem()                          ← 同步，纯结构创建
  │   ├─ getWorkflowEngine() + registerBaseWorkflows
  │   ├─ new TriggerRegistry()
  │   ├─ ensurePluginsActivated(engine, triggerRegistry)  ← 插件注册 workflow + triggers
  │   ├─ new WorkflowRunner(engine, deps)           ← deps 全是懒 getter
  │   └─ new LogStreamDispatcher(...)               ← seatId/watermark 也是懒 getter
  │
  ├─ await Promise.all([initWorld, initIdentity])   ← 异步，填充 store 数据 + 注册 socket 事件
  │   log:new 更新 store → subscribe 触发 → Dispatcher.dispatch()
  │
  ├─ setIsLoading(false)
```

**理由**：
- `onActivate(sdk)` 只做声明式注册（defineWorkflow、registerTrigger），不需要异步操作，不需要 store 数据
- `WorkflowRunner` 的 `buildDeps()` 全部是懒 getter（执行时从 store 读取），构造时不需要 store 已初始化
- 保证 Dispatcher 在第一个 socket 事件到达之前就存在，零时序缝隙

#### 决策 2：Dispatcher 的 seatId / watermark 改为懒读取

**现有问题**：`LogStreamDispatcher` 构造函数接受 `localSeatId: string` 和 `watermark: number` 作为快照值。在 Promise.all 之前创建时这些值还不存在。

**决策**：改为传入 getter 函数，dispatch 时从 store 读取当前值。

```typescript
// 改造前
constructor(opts: {
  localSeatId: string
  watermark: number
  ...
})

// 改造后
constructor(opts: {
  getSeatId: () => string
  getWatermark: () => number
  ...
})
```

**附带收益**：`updateWatermark()` 方法可以删除 — worldStore 的 `log:new` handler 已经在更新 `logWatermark`，Dispatcher 直接读 store 即可，不需要维护自己的副本。

#### 决策 3：Dispatcher 通过 zustand subscribe 接收日志，与 worldStore 解耦

**决策**：Dispatcher 在 `initWorkflowSystem()` 内部通过 `useWorldStore.subscribe()` 监听 logEntries 变化。worldStore 保持为纯数据层，不引入 workflow 依赖。

```typescript
// initWorkflowSystem() 内部
useWorldStore.subscribe((state, prevState) => {
  if (state.logEntries.length > prevState.logEntries.length) {
    for (let i = prevState.logEntries.length; i < state.logEntries.length; i++) {
      dispatcher.dispatch(state.logEntries[i]!)
    }
  }
})
```

**依赖方向**：dispatcher → worldStore（单向），worldStore 无感知。

**代价**：subscribe 在任何 store 变化时触发，每次做一次 `length` 比较。开销可忽略。

### 2.3 待讨论的问题

#### 问题 1：useWorkflowRunner() hook 需要什么变化？

插件激活逻辑移到 `initWorkflowSystem()` 后，`useWorkflowRunner()` 里的 `ensurePluginsActivated()` 调用会被幂等守卫跳过。

- hook 仍然需要返回 `WorkflowRunner` 给 UI 层使用
- `ensurePluginsActivated()` 可以保留（幂等无害）或移除（减少困惑）

**倾向**：保留幂等调用作为防御性代码，但注释说明主初始化在 `initWorkflowSystem()` 中完成。

#### 问题 3：cleanup 和 reinit

- 切换房间 / socket 断连时，`App.tsx` 的 useEffect cleanup 会跑。Dispatcher / Engine 需要清理吗？
- `reinitWorld()` 重新拉取数据时，watermark 自动更新（懒读取），Dispatcher 无需额外处理。
- TriggerRegistry 的注册是幂等的（同一插件不会重复激活），reconnect 不需要重新注册。

**倾向**：当前不需要 cleanup。Engine 和 TriggerRegistry 是应用级单例，不随房间切换而销毁。如果未来支持多房间切换再考虑。

### 2.4 涉及文件

| 文件 | 变更 |
|------|------|
| `src/workflow/logStreamDispatcher.ts` | localSeatId / watermark 改为 getter；删除 updateWatermark() |
| `src/workflow/useWorkflowSDK.ts` | 新增 `initWorkflowSystem()` 导出；TriggerRegistry 单例；修改 ensurePluginsActivated 签名 |
| `src/workflow/pluginSDK.ts` | 无变化（已支持 triggerRegistry 参数） |
| `src/App.tsx` | useEffect 中调用 initWorkflowSystem() |
| `src/stores/worldStore.ts` | 无变化（Dispatcher 通过 subscribe 解耦） |
| 测试文件 | logStreamDispatcher 测试适配新 getter 签名 |

---

## 3 C1: 命令系统

> **状态**：🟡 设计中

### 3.1 背景

ChatInput 通过 `useRulePlugin()` 读取 `diceSystem.rollCommands` 解析聊天命令（`.dd`、`.r`）。这依赖 RulePlugin 接口，需要迁移到 workflow 系统。

当前流程涉及两次 RulePlugin 查找：

1. **ChatInput** (`plugin.diceSystem.rollCommands['daggerheart:dd']`) — formula 预处理：`.dd @agility` → `resolveFormula('@agility')` → `'2d12+@agility'` → 解析 @变量 → tokenize → DiceSpec
2. **ChatPanel** (`plugin.diceSystem.rollWorkflows['daggerheart:dd']`) — workflow 派发：rollType → workflow handle → `runner.runWorkflow()`

### 3.2 已确定的设计决策

#### 决策 1：简单 Map，不需要 Dispatcher/Subscriber 模式

命令与日志触发本质不同：命令是同步用户输入，不需要持续监听或条件路由。一个 `Map<string, WorkflowHandle>` 足够。

#### 决策 2：ChatInput 不做预处理，传入 raw 字符串 + 执行环境（闭包模式）

**现状**：ChatInput 在调用 workflow 前做了 `@variable` 解析、formula tokenize、DiceSpec 校验。

**决策**：所有解析逻辑移入 workflow step。ChatInput 提供两样东西：

1. **raw args** — 用户输入的参数部分（命令名之后的所有内容）
2. **执行环境** — 当前上下文（谁在操作、选中了谁）

```typescript
// ChatInput 检测到命令后
runner.runWorkflow(handle, {
  raw: '@agility',              // 用户输入的参数
  actorId: currentActorId,      // 当前活跃角色
  speakerId: speakerCharId,     // 当前说话者（Tab 切换的 speaker）
  seatId: mySeatId,             // 座位
  origin: activeOrigin,         // 消息来源（头像、颜色等）
})
```

Workflow 拿到的是一个闭包——既有显式参数（raw），又有隐式上下文。Workflow step 用 `ctx.vars.actorId` + `ctx.read.entity()` 来解析 `@agility`，不需要从全局 store 去摸。

**理由**：
- ChatInput 不需要知道参数含义，只提供执行环境
- 不同命令共享同一套环境结构，但各自解析 raw 部分
- Workflow 像 main 函数收到 argv + env，完全自主控制解析和执行

#### 决策 3：`.r` 是基座命令，与插件命令走同一机制

`.r` 在 `registerBaseWorkflows()` 中注册到命令 Map，不做特殊处理。

### 3.3 实施步骤

1. **SDK 加 `registerCommand(trigger, workflowHandle)`** — 往 Map 写入
2. **导出查询接口 `getCommand(name)`** — ChatInput 用来查找
3. **ChatInput 大幅简化** — 删除 `handleRoll`、`handlePluginRoll`、formula 解析、DiceSpec 转换、`@variable` resolve，只保留命令检测 + raw 传递
4. **ChatPanel 简化** — 删除 `handleRoll` 中的 rollType → rollWorkflows 二次查找逻辑
5. **Daggerheart 插件迁移** — `onActivate` 中 `sdk.registerCommand('.dd', wf)`；workflow 第一个 step 自己解析 raw 参数（含 `@variable` → formula → DiceSpec → serverRoll）
6. **基座 `.r` 注册** — `registerBaseWorkflows()` 中注册 `.r` 命令，对应 generic roll workflow

#### 决策 4：命令匹配用精确匹配

提取逻辑：`.` + 第一段连续字母 = 命令名，剩余部分 = raw args。

```
".r 2d6"    → 命令 ".r",    raw "2d6"
".roll 2d6" → 命令 ".roll", raw "2d6"
".dd @agi"  → 命令 ".dd",   raw "@agi"
```

不做前缀匹配。如果想让 `.roll` 也能用，插件注册别名：

```typescript
sdk.registerCommand('.r', rollWorkflow)
sdk.registerCommand('.roll', rollWorkflow)
```

### 3.4 涉及文件

| 文件 | 变更 |
|------|------|
| `src/workflow/pluginSDK.ts` | 新增 `registerCommand()` 方法 |
| `src/workflow/useWorkflowSDK.ts` | 命令 Map 存储 + `getCommand()` 导出 |
| `src/chat/ChatInput.tsx` | 大幅简化：删除所有 formula/dice 处理逻辑 |
| `src/chat/ChatPanel.tsx` | 简化 `handleRoll`，删除 rollType 二次查找 |
| `plugins/daggerheart-core/` | 在 `onActivate` 中 `sdk.registerCommand('.dd', ...)` |
| `src/workflow/baseWorkflows.ts` | 注册 `.r` 命令 |
| `plugins/daggerheart/diceSystem.ts` | `rollCommands` 导出可标记废弃 |

---

## 4 T1: 类型安全改造

> **状态**：✅ 已确认 — 按 Doc 18 §4.1 方案直接推进

### 4.1 背景

**问题**：两大核心数据结构的"值"部分都是 `Record<string, unknown>`，每次读取都需要手动 `as` 强转：

| 数据结构 | 当前类型 | 强转点 |
|----------|----------|--------|
| `Entity.components` | `Record<string, unknown>` | `useComponent<T>()` 调用者手动传 T |
| `GameLogEntry.payload` | `Record<string, unknown>` | ChatPanel、worldStore 等 10+ 处手动 `as` |

编译器无法校验 key → value 类型是否匹配，字段重命名时不会报错。

### 4.2 已确定的设计决策

#### 决策 1：采用 TypeMap 映射表 + 泛型约束

按 Doc 18 §4.1 方案，建立 key → value 类型的对应表，让 TypeScript 自动推导：

```typescript
// ComponentTypeMap — src/shared/componentTypes.ts
interface ComponentTypeMap {
  'core:identity': CoreIdentity   // 已有定义 @ src/shared/coreComponents.ts
  'core:token': CoreToken
  'core:health': { current: number; max: number }
  // 插件通过 module augmentation 扩展
}

// useComponent 改为泛型约束 — 调用者不再需要传 <T>
function useComponent<K extends keyof ComponentTypeMap>(
  entityId: string, key: K
): ComponentTypeMap[K] | undefined

// LogPayloadMap — 扩展 src/shared/logTypes.ts
interface LogPayloadMap {
  'core:text': { content: string }
  'core:roll-result': { formula: string; rolls: number[][]; total: number; dice: DiceSpec[] }
  'core:tracker-update': { snapshot: TeamTracker }
  'core:component-update': { entityId: string; key: string; data: unknown }
}

// emitEntry 泛型化 — type 和 payload 编译时绑定
emitEntry<T extends keyof LogPayloadMap>(partial: { type: T; payload: LogPayloadMap[T]; ... })
```

**效果**：
- `useComponent(id, 'core:health')` 自动推导返回类型，写错 key 编译报红
- `emitEntry({ type: 'core:text', payload: { delta: 5 } })` 编译报红（payload 结构不匹配）

#### 决策 2：插件通过 module augmentation 扩展

```typescript
// plugins/daggerheart/types.ts
declare module '../../src/shared/componentTypes' {
  interface ComponentTypeMap {
    'daggerheart:health': DHHealth
    'daggerheart:attributes': DHAttributes
    'daggerheart:stress': DHStress
  }
}
```

插件不修改核心文件，但类型推导全局生效。核心类型（`CoreIdentity`、`CoreToken` 等）已存在于 `src/shared/coreComponents.ts`，daggerheart 类型已存在于 `plugins/daggerheart/types.ts`。

#### 决策 3：三阶段实施

| Phase | 内容 | 工作量 | 依赖 |
|-------|------|--------|------|
| 1 | `ComponentTypeMap` + `useComponent` 改签名 + 消费端删 `as` | ~50 行 | 无 |
| 2 | `LogPayloadMap` + `emitEntry` 泛型化 + 消费端删 `as` | ~80 行 | 无 |
| 3 | `ctx.updateComponent` 泛型约束 | ~30 行 | Phase 1 |

纯类型层改造，零运行时影响。

### 4.3 涉及文件

| 文件 | 变更 |
|------|------|
| `src/shared/componentTypes.ts` | **新建**：ComponentTypeMap 接口 |
| `src/shared/logTypes.ts` | 新增 LogPayloadMap 接口 |
| `src/shared/entityTypes.ts` | Entity.components 类型引用 ComponentTypeMap（可选） |
| `src/data/hooks.ts` | `useComponent` 泛型约束改签名 |
| `src/data/dataReader.ts` | `component` 方法签名更新 |
| `src/workflow/context.ts` | `emitEntry`、`updateComponent` 泛型化 |
| `src/chat/ChatPanel.tsx` | 删除 `logEntryToChatMessage()` 中的 `as` 强转 |
| `src/stores/worldStore.ts` | 删除 tracker-update / component-update 的 `as` 强转 |
| `plugins/daggerheart/types.ts` | 添加 module augmentation 声明 |

---

## 5 D1: 偏差文档清理

> **状态**：✅ 已确认 — 文档更新任务，无代码变更

### 5.1 背景

Doc 17 §15 已完成主要归档工作（16a 合并入 16 并归档到 `docs/archive/`）。剩余工作是校验和交叉引用。

### 5.2 偏差现状（12 条）

| # | 内容 | 状态 | 备注 |
|---|------|------|------|
| 1-2 | tracker-update 格式 / 重复 ack | ✅ 已接受 | 设计妥协 |
| 3 | 原子 workflow 未实现 | 📋 延后 | TTRPG 低频操作不需要 |
| 4-5 | visibility 过滤限制 | ⚠️ v1 限制 | 社交信任模型可接受 |
| 6 | 输入校验 | ✅ 防御性编程 | |
| 7 | EventBus 迁移 | 📋 延后 | 依赖 Doc 17 Track A |
| 8 | roll-result 缺 total | ✅ **PR #169 修复** | 状态图标需更新 |
| 9 | rowToEntry 提取 | ✅ DRY | |
| 10 | transport wiring | ✅ **PR #169 修复** | 已标记 |
| 11 | Dispatcher 未实例化 | ❌ **Sprint 1 A1** | 需加交叉引用 |
| 12 | 因果链未传播 | ❌ **Sprint 1 A2** | 需加交叉引用 |

### 5.3 清理工作

1. **更新 Doc 16 偏差表状态图标**：偏差 8 从 ⚠️ 改为 ✅（total 字段已在 PR #169 中修复）
2. **添加 Sprint 交叉引用**：偏差 11 → Sprint 1 A1 任务，偏差 12 → Sprint 1 待定
3. **确认 15a 偏差**：7 条 workflow 偏差大部分是接受的设计妥协，确认无遗漏

工作量 S，纯文档更新。
