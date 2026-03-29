# Sprint 2 实现偏差记录

> 对照设计文档 `docs/plans/sprint2-exploration.md`，记录实现中的偏差及原因。
> **状态**：定稿 | 2026-03-29

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

### R2: roll workflow 退役
- 删除 `roll` workflow 定义、`getRollWorkflow()` 导出、`RollOutput` 类型
- `quick-roll` 内联：@token 解析 → tokenize → toDiceSpecs → serverRoll → buildCompoundResult
- `dh:action-check` 直接调用 `ctx.serverRoll()` + 自己的 judgment 逻辑
- SDK 导出更新（`toDiceSpecs` 新增导出，`getRollWorkflow` 移除）

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

### 偏差 2：roll 逻辑在两处重复

**探索文档描述**：§4.2 说"各业务 workflow 直接调用 `ctx.serverRoll()`"。

**实际实现**：@token 解析 → tokenizeExpression → toDiceSpecs → serverRoll → buildCompoundResult 的完整序列在 `baseWorkflows.ts`（quick-roll）和 `rollSteps.ts`（dh:action-check）各出现一次。

**原因**：探索文档的设计意图是"公式解析和求和是业务假设，各调用方应自己处理"。这是正确的——但实际上 @token 解析和 tokenize 的逻辑完全相同。可以提取一个工具函数（如 `resolveAndRoll(ctx, formula)` → `{ rolls, terms, total }`）来消除重复，同时保持各调用方对业务结果的独立控制。

**影响**：代码重复，不影响功能。列入后续优化。

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

### 偏差 8：roll workflow 退役可能过早 — 待重新评估

**探索文档描述**：§4 确认 roll workflow 退役，理由是"观察用 trigger，业务逻辑属于调用方，没有消费者 hook 它"。

**实际实现**：按照探索文档执行——删除了 `roll` workflow，各调用方内联 roll 逻辑。

**问题**：讨论中同时确认了 pre-execution modification 的不可替代价值（§8 Foundry VTT 调研）。roll workflow 作为独立 workflow 提供的切面能力（插件在掷骰前修改骰子，如优势/劣势骰）正是这种 pre-execution modification。退役它等于放弃了这个切面点。

此外，退役导致 @token 解析 + tokenize + serverRoll + buildCompoundResult 在 `baseWorkflows.ts` 和 `rollSteps.ts` 中完全重复（偏差 2）。如果 roll 仍是 workflow，这个重复就不存在。

**需要重新评估**：roll workflow 是否应该恢复？或者保持退役但提供一个共享工具函数？这涉及对 Sprint 2 探索文档 §4 决策的修正。

---

## 与 16a 偏差文档的交叉更新

| 16a 偏差 # | 原状态 | Sprint 2 后状态 | 说明 |
|-------------|--------|-----------------|------|
| 8 | ✅ PR #169 修复（加了 total） | ⚠️ 重新设计 | Sprint 2 R1 删除了 total——这不是回退，而是架构升级。total 由业务 entry 承载，不属于 RNG 层 |
| 11 | ✅ Sprint 1 A1 修复 | ✅ 保持 | Dispatcher 已接入运行时 |
| 12 | ❌ 因果链未传播 | ✅ Sprint 2 G1 替代 | parentId chain 被 groupId + causedBy 替代。groupId 用于组内分组，causedBy（复用 parentId 列）用于跨组因果 |
| 7 | 📋 延后 | 🔄 部分进行 | J1 开始了 EventBus → 日志的迁移（dh:judgment 走 emitEntry 而非 EventBus） |
