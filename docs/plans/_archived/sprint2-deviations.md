# Sprint 2 实现偏差记录

> 对照设计文档 `docs/plans/sprint2-exploration.md`，记录实现中的偏差及原因。
> **状态**：更新 | 2026-03-30 | PR #174 + 渲染统一追加

---

## 已实现的设计要素

以下设计要素已完整实现，与探索文档一致：

### R1: 服务端 RNG 纯化

- 从 `server/logHandler.ts` 删除 `total` 计算
- 从 `LogPayloadMap['core:roll-result']` 删除 `total` 字段
- 服务端 `core:roll-result` payload 仅包含 `{ dice, rolls, formula, resolvedFormula?, rollType?, actionName? }`

### G1: groupId 分组机制

- `groupId?: string` 添加到 `GameLogEntry`、`LogEntrySubmission`、`RollRequest`
- `group_id TEXT` 列 + 索引添加到 `game_log` 表
- 服务端两处 INSERT 语句均更新
- `rowToEntry` 正确读取 `group_id`
- `createWorkflowContext` 自动生成 `groupId`（`uuidv7()` fallback）
- 四个副作用通道（emitEntry, serverRoll, updateComponent, updateTeamTracker）均自动注入 groupId
- 嵌套 workflow 继承父 groupId
- `ChainContext` 类型定义在 `types.ts`
- `IWorkflowRunner.runWorkflow` 接受可选 `ChainContext` 参数
- `causedBy` 映射到 `parentId`（复用已有列，无需新增）
- `LogStreamDispatcher` 在 trigger 边界：新 groupId + `causedBy = entry.id` + `chainDepth + 1`

### R2: roll workflow 退役 → 已撤销，恢复为独立 workflow

- 初始实现按探索文档删除了 roll workflow 并内联逻辑
- **后经讨论决定恢复**：服务端不再算 total（R1），roll workflow 是唯一计算 total 的地方；公式求值系统复用性强；workflow 提供可 hook 的切面能力
- 恢复了 `roll` workflow、`getRollWorkflow()`、`RollOutput` 类型
- `quick-roll` 和 `dh:action-check` 恢复为 `ctx.runWorkflow(getRollWorkflow(), ...)`

### J1: judgment emitEntry

- `dh:judgment` 添加到 `LogPayloadMap`（module augmentation in `plugins/daggerheart/types.ts`）
- `dh:emit-judgment` step 添加到 `dh:action-check`（在 `dh:judge` 之后）
- `display` step 中 `announceEvent` 删除，`toastEvent` 保留

### §8: Workflow 切面 vs 日志切面

- 确认 workflow 切面三种模式均保留（修改行为、搭便车发日志、最终状态发日志）
- `phase: 'post'` 保留（保证看到 vars 最终状态）
- 日志触发用于观察/响应

---

## 偏差列表

### 偏差 1：R1 和 G1 合并提交

**探索文档描述**：R1 和 G1 是独立任务，可并行。

**实际实现**：合并为一个提交 `97bbac9 feat(R1+G1)`。

**原因**：两个任务都修改 `server/logHandler.ts` 和 `src/shared/logTypes.ts`，分开提交会导致中间状态的类型不一致。合并提交保证了原子性。不影响代码正确性。

---

### 偏差 2：~~roll 逻辑在两处重复~~ → 已通过恢复 roll workflow 解决

**探索文档描述**：§4.2 说"各业务 workflow 直接调用 `ctx.serverRoll()`"。

**初始实现**：@token 解析 → tokenize → serverRoll → buildCompoundResult 在 quick-roll 和 dh:action-check 各重复一次。

**修复**：恢复 roll workflow 后，公式求值逻辑集中在 roll workflow 的 `generate` step 中，quick-roll 和 dh:action-check 均通过 `ctx.runWorkflow(getRollWorkflow(), ...)` 调用。重复消除。

---

### 偏差 3：~~groupId 类型为可选~~ → 已修复

**探索文档描述**：§5.2.1 说"每次用户发起的 workflow 执行生成一个 groupId"。

**初始实现**：`GameLogEntry.groupId?: string`（可选），理由是"兼容旧数据"。

**修复**：数据库中没有旧 entry（每个房间使用独立数据库，schema 已包含 `group_id` 列）。"兼容旧数据"是毫无根据的假设。已改为 `groupId: string`（必选）。类型检查和全部测试通过。

---

### 偏差 4：quick-roll 仍然发送 announceEvent

**探索文档描述**：§6.2 说"删除 announceEvent emit"。

**实际实现**：`dh:action-check` 的 `display` step 已删除 `announceEvent`，但 `quick-roll` 的 `display` step 仍保留。

**原因**：探索文档 §6 只讨论了 `dh:action-check`。`quick-roll` 的 `announceEvent` 目前是用户看到通用骰子结果的唯一方式——在 A3 渲染器完成之前（ChatPanel 迁移到 RendererRegistry），删除它会导致通用骰子结果不可见。延迟到 A3 Step 4（ChatPanel 迁移）时一并处理。

---

### 偏差 5：A3 ChatPanel 迁移保留了 MessageCard fallback

**探索文档描述**：§7.7 "渐进式迁移"说 LogEntryCard 内部做 fallback，迁移完成后删除旧路径。

**实际实现**：`LogEntryCard` 包含 `logEntryToChatMessage` + `MessageCard` 的 fallback 路径。`ChatMessage` 类型和 `MessageCard` 组件保留。

**原因**：当前只注册了 `core:text`、`core:roll-result`、`dh:judgment` 三个渲染器。其他未注册的类型仍通过旧路径渲染。完全删除旧路径需要确保所有 `CHAT_TYPES` 中的类型都有对应渲染器。Sprint 2 范围内不做删除，留到后续清理。

---

### 偏差 6：`LogEntryRendererProps` 包含 `animationStyle`

**探索文档描述**：§7.4 渲染器接口只有 `{ entry, isNew }`��

**实际实现**：增加了 `animationStyle?: 'toast' | 'scroll'`。所有渲染器透传给 `CardShell`。

**原因**：Code review 发现 toast 场景需要不同的入场动画。不传递 `animationStyle` 会导致 toast 和 scroll 区域的 entry 使用相同动画（视觉回退）。`CardShell` 已支持该 prop，渲染器只需透传，不增加渲染器的业务复杂度。

---

### 偏差 7：~~RendererRegistry 接口使用 `any`~~ → 已修复

**探索文档描述**：§7.4 RendererRegistry API 用 `LogEntryRenderer = React.ComponentType<LogEntryRendererProps>` 注册。

**初始实现**：`IUIRegistrationSDK.registerRenderer` 的 `renderer` 参数类型用 `{ entry: any }`。

**修复**：改为 `{ entry: unknown }`，与项目中 `ComponentDef` 的 `sdk: unknown` 模式一致。注册点使用 `as React.ComponentType<{ entry: unknown; isNew?: boolean }>` cast（`rollSteps.ts` 已在这样做）。`any` 不应出现在项目类型定义中。

---

### 偏差 8：roll workflow 退役决策撤销 — 已恢复

**探索文档描述**：§4 确认 roll workflow 退役，理由是"观察用 trigger，业务逻辑属于调用方，没有消费者 hook 它"。

**最终决策**：恢复 roll workflow。探索文档 §4 R2 决策被推翻。

**原因**（三个互相加强的理由）：

1. **服务端纯 RNG 后，roll workflow 是唯一计算 total 的地方**——R1 删除了服务端 total，调用方必须通过 runWorkflow 拿到计算结果
2. **公式求值系统复用性强**——即使 Daggerheart 也需要加法（Hope+Fear+modifier），不同游戏系统都复用同一套 @token 解析 + tokenize + serverRoll + buildCompoundResult 流程
3. **workflow 提供可 hook 的切面**——§8 确认了 pre-execution modification 的不可替代价值，roll workflow 正是掷骰前修改骰子的切面点

**影响**：偏差 2（代码重复）同时解决。探索文档 §4 R2 决策标记为"已推翻"。

---

### 偏差 9：ExtensionRegistry 删除，合并进 RendererRegistry

**探索文档描述**：§7.4 提到新建 `ExtensionRegistry` 类，ChatPanel 通过 `ExtensionRegistry.get(type)` 查询渲染器。

**实际实现**：`ExtensionRegistry` 在 Sprint 2 A3 中创建后，在渲染统一重构中被删除。渲染器注册直接使用 `RendererRegistry` 的 `(surface, type)` keying + `RendererPoint<T>` typed token API。

**原因**：`ExtensionRegistry` 的 `contribute()` API 是为通用 Slot 设计的，但实际只有渲染器在用。将两个 registry 合并为一个更简单。typed token 提供编译时类型安全，避免 string key 拼写错误。

---

### 偏差 10：dh:judgment 不再作为独立日志发出

**探索文档描述**：J1 设计 `dh:judgment` 为独立日志条目，由 `dh:emit-judgment` step 在 `dh:action-check` 中发出。

**实际实现**：`dh:judgment` 改为 reusable sub-workflow（`judge` + `resolve` steps），被 `dh:action-check` 的 `judgment` step 内部调用。判定结果存储在 `ctx.vars.judgment` 中供 `display` step 使用，但不发独立日志。渲染时由 `RollResultRenderer` 调用 `plugin.diceSystem.evaluateRoll()` 实时计算。

**原因**：一次掷骰发 3 条日志（roll + judgment + tracker）导致聊天面板显示 3 张卡。用户期望一次掷骰只看到一张卡。判定是从骰子结果确定性推导的纯函数，不必持久化。

---

### 偏差 11：diceSystem 接口大幅精简

**探索文档描述**：未涉及 `diceSystem` 接口变更。

**实际实现**：删除 `getRollActions`、`getDieStyles`、`getModifierOptions`、`rollCommands`、`rollWorkflows` 五个方法。删除 `surfaces.rollCardRenderers`。仅保留 `evaluateRoll` + `getJudgmentDisplay`。

**原因**：这些方法在 `src/` 中没有任何消费者（全是死代码）。`rollCommands` 被 `commandRegistry` 替代（Sprint 1 C1）；`rollCardRenderers` 被 `RendererRegistry` typed token 替代。

---

### 偏差 12：context.ts origin 自动解析

**探索文档描述**：未涉及 origin 传播机制。

**实际实现**：`createWorkflowContext` 新增 `buildOriginFromActor()` 逻辑：当 `initialData` 包含 `origin` 时直接使用（ChatPanel speaker picker 路径）；否则从 `actorId` 查 entity 构建完整的 `{ seat, entity }` origin（角色卡路径）。嵌套 workflow 继承父级 caller-provided origin。

**原因**：角色卡掷骰传 `actorId` 但不传 `origin`，导致日志显示 seat 而非 entity。ChatPanel 传 `origin` 但被 `getActiveOrigin()` 覆盖。两个 bug 统一修复。

---

## 与 16a 偏差文档的交叉更新

| 16a 偏差 # | 原状态                        | Sprint 2 后状态     | 说明                                                                                                      |
| ---------- | ----------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| 8          | ✅ PR #169 修复（加了 total） | ⚠️ 重新设计         | Sprint 2 R1 删除了 total——这不是回退，而是架构升级。total 由业务 entry 承载，不属于 RNG 层                |
| 11         | ✅ Sprint 1 A1 修复           | ✅ 保持             | Dispatcher 已接入运行时                                                                                   |
| 12         | ❌ 因果链未传播               | ✅ Sprint 2 G1 替代 | parentId chain 被 groupId + causedBy 替代。groupId 用于组内分组，causedBy（复用 parentId 列）用于跨组因果 |
| 7          | 📋 延后                       | 🔄 部分进行         | J1 开始了 EventBus → 日志的迁移（dh:judgment 走 emitEntry 而非 EventBus）                                 |
