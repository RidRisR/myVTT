# 23 - Workflow 设计审查与开放问题

> **状态**：探索记录
> **前置文档**：`15-Workflow系统设计.md`（综合设计文档）
> **来源**：对当前 workflow 引擎实现和设计文档的深度审查讨论

---

## 目录

1. [讨论过但决定延后的问题](#1-讨论过但决定延后的问题)
   - 1.1 Non-critical step 的 context 能力限制
   - 1.2 original 多次调用的防护
   - 1.3 交互式 workflow（ctx.prompt）⚡ 已有结论转向
   - 1.4 重试与"每个 step 只执行一次"假设
   - 1.5 插件 API 稳定化
   - 1.6 Lifecycle observer
2. [未得出结论的开放问题](#2-未得出结论的开放问题)
   - 2.1 段间状态丢失（模式 A 特有）
   - 2.2 嵌套 workflow + 重试的副作用管理
   - 2.3 Wrapper critical 级别继承
   - 2.4 Workflow 适用边界的形式化
   - 2.5 长 workflow 与中间恢复（三难困境）⚡ 核心问题
   - 2.6 交互式 workflow 的 abort 语义
   - 2.7 Workflow 定位的根本性重新认识
   - 2.8 startFrom 与 Context 自动构建
3. [关键设计洞察](#3-关键设计洞察)
4. [后续行动项](#4-后续行动项)

---

## 1 讨论过但决定延后的问题

### 1.1 Non-critical step 的 context 能力限制

**问题**：non-critical step（美化插件）可以调用 `ctx.updateEntity()` 等 effect 方法产生不可回滚的副作用。设计约定要求 non-critical step 只做动画/音效，但没有强制机制。

**讨论过的方案**：给 non-critical step 传一个阉割版 context（去掉 effect 方法）。实现不难——执行循环里根据 `meta.step.critical` 创建 restricted context。

**延后原因**：`critical` 标记由插件作者自己声明，没有强制机制。不规矩的插件把 critical 标成 true 就绕过了限制，阉割 context 变成"惩罚诚实人"。真正的解决需要完整的权限声明体系（插件声明需要哪些能力，用户审批），这是第三方插件开放时才需要的工作。

**当前应对**：文档约定 + code review。

### 1.2 original 多次调用的防护

**问题**：`wrapStep` 的 wrapper 拿到的 `original` 是普通函数引用，可以调用多次。多次调用意味着内层所有 wrapper + base step 重复执行，副作用重复触发。

**讨论过的方案**：onceGuard 包装——第二次调用 warn 或 throw。成本很低。

**延后原因**：重试场景下多次调用 `original()` 是合理用例（try/catch 后重试）。需要区分"合法重试"和"意外多次调用"，简单的 onceGuard 会误杀合法用例。当前内部开发靠约定即可。

**未来方向**：如果开放第三方插件，考虑带计数器的 guard（允许声明最大调用次数），或至少在 DEV 模式下 warn。

### 1.3 交互式 workflow（ctx.prompt）

**问题**：TTRPG 天然存在多轮交互场景。典型链路：

```
选法术 → 选目标 → 掷骰 → 选修正 → 判定 → 目标回应 → 结算
  ↑人      ↑人     ↑系统   ↑人      ↑系统   ↑另一个人    ↑系统
```

**两种应对模式**：

- **模式 A（拆段）**：把流程拆成多段短 workflow，段间状态由 React 组件层维护。
- **模式 B（统一）**：把交互作为普通 step 放进同一个 workflow，step 内 `await ctx.prompt()`。

**模式 A 的问题（碎片化）**：

流程逻辑散落在 React 组件间的 prop 传递和状态管理里；插件无法参与 workflow 之间的"间隙"（如"掷骰结束后、选修正之前"这个点不在任何 workflow 里）；不同开发者可能实现方式不同。

**模式 B 的关键发现**：

交互和 `serverRoll` 本质上没有区别——都是"await 一个 Promise，等外部返回结果"。从引擎的角度看 `await ctx.serverRoll()` 和 `await ctx.prompt()` 完全等价。**引擎不需要任何改动**，`ctx.prompt` 作为一个新的异步副作用方法加到 context 上即可。

不确定性（超时、取消、验证、多客户端）可以封装在 `ctx.prompt` 的实现内部，对引擎透明。复杂度被**下推到 prompt 实现层**，而不是扩散到引擎。

**模式 B 的实现需求**：

- `ctx.prompt` 方法：创建 Promise，把 resolve 暴露给 UI 层（通过 ContextDeps 注入）
- 全局 prompt 渲染层：订阅 pending prompt 并渲染对应 UI（不依赖触发 workflow 的组件）
- abort 联动：abort 时 reject pending prompt（InternalState 需追踪 pending prompts）
- 超时：`Promise.race([prompt, timeout])`
- 跨客户端（Phase 2+）：Socket.io 转发 + requestId 关联

**模式 B 引入的新问题 → 见 §2.5 长 workflow 与中间恢复**

**当前结论**：模式 B 更优——统一的 workflow 定义，所有环节都可 add/wrap/replace，消除碎片化。但需要配合检查点机制解决"刷新丢失"问题。

### 1.4 重试与"每个 step 只执行一次"假设

**问题**：嵌套子 workflow + 重试会打破线性执行的"只执行一次"假设。子 workflow 内的 step 不知道自己会被重试多少次，副作用可能重复执行。

**当前可用的重试方式**：

- wrapper 内多次调用 `original()`（单 step 级别重试）
- 循环调用 `ctx.runWorkflow()`（子 workflow 级别重试）

**影响**：

- 副作用重复（消息广播多次、数据更新多次）
- depth 累积可能意外触发 MAX_RECURSION_DEPTH
- 失败信息被覆盖（上一次的 result.errors 丢失）

**延后原因**：当前没有实际的重试需求场景。

**未来应对**：SDK 文档明确——可能被重试的 step 的副作用必须幂等。长期可考虑 effect 队列延迟提交机制。

### 1.5 插件 API 稳定化

**问题**：`WorkflowContext` 接口是未来第三方插件开发者的 API 边界。当前 Input 方法只有 `serverRoll`，每新增一个能力都要改三处（WorkflowContext 接口、ContextDeps 接口、createWorkflowContext 实现）。

**延后原因**：当前是内部开发的试错窗口，业务域有限（角色、场景、骰子、聊天），最终可能也就 5-6 个 Input 方法。过早抽象（如通用 query 接口）可能方向错误。

**未来方向**：按需逐个添加，积累真实用例。在插件 API 对外发布前做一轮统一 review，整理成最终的公开接口。

### 1.6 Lifecycle observer

**共识**：需要观测机制让外部（调试工具、日志系统）观测 workflow 的运行时事件（step 添加/移除、workflow 开始/结束/step 执行/错误），这也是硬删除方案下保障可调试性的关键。

**设计文档 §13.5 已有粗略提案**：

```typescript
engine.addObserver({
  onWorkflowStart(name, data): void
  onStepStart(workflowName, stepId): void
  onStepEnd(workflowName, stepId, error?): void
  onWorkflowEnd(name, result): void
})
```

**延后原因**：当前阶段没有调试工具集成需求。

**补充建议**：注册阶段的事件也应纳入（onStepAdded、onStepRemoved、onStepWrapped），不仅是执行阶段。removeStep 的级联删除信息（cascadeFrom、pluginOwner）对调试尤其重要。

---

## 2 未得出结论的开放问题

### 2.1 段间状态丢失（模式 A 特有）

> **注意**：如果采用模式 B（统一 workflow + `ctx.prompt`），此问题被 §2.5 取代。

**场景**：模式 A（拆段 workflow）中，workflow 1 执行完后，中间状态只存在于 UI 组件 state 里。如果此时断线/刷新，用户需要从头来。

**示例**：掷骰 workflow 结束 → 打开 modifier 选择页面 → 断线 → 骰子结果和 modifier 页面都消失。

**初步判断**：TTRPG 场景下可接受（聊天记录有见证，最坏情况重做几秒操作），但未深入讨论长期方案。

**待探索方向**：

- 关键操作结果通过服务端广播持久化到聊天记录（短期改善）
- workflow 执行结果的 localStorage 缓存（中期方案）
- 完整的 workflow 状态持久化（长期，与 1.3 交互式 workflow 相关联）

### 2.2 嵌套 workflow + 重试的副作用管理

**问题**：除了文档约定"副作用须幂等"之外，是否需要更强的机制？

**可能的方向**：

- **Effect 队列延迟提交**：step 内调用 `ctx.updateEntity()` 不立即执行，而是记录到队列，workflow 成功完成后统一提交。失败或重试时丢弃队列。但这改变了 effect 的 fire-and-forget 语义，增加了延迟，且嵌套 workflow 的队列合并逻辑复杂。
- **Execution ID 去重**：每次 workflow 执行有唯一 ID，effect 方法携带此 ID，服务端去重。但需要服务端配合，增加了复杂度。
- **保持现状 + 文档约定**：最简单，但对第三方插件开发者是隐式契约。

**未决定**：哪种方向最适合当前项目的规模和阶段。

### 2.3 Wrapper critical 级别继承

**问题**：美化插件的 wrapper 包在 critical step 上，wrapper 抛错会导致整个 workflow 中断——即使 base step 本身没问题。当前 wrapper 没有自己的 critical 声明，继承了被包裹 step 的级别。

**可能的方向**：

- wrapper 自己声明 `critical: false`，引擎在组合时为 non-critical wrapper 单独加 try/catch
- 保持现状，靠约定（美化插件的 wrapper 内部自己 try/catch）

**未讨论**：这两种方案的具体实现复杂度和对执行模型的影响。

### 2.5 长 workflow 与中间恢复（三难困境）

**背景**：模式 B（统一 workflow + `ctx.prompt`）消除了碎片化，但引入了新问题——workflow 越长，刷新/断线的丢失代价越大。

**三难困境**：

| 方案                      | 碎片化 | 丢失代价 | 中间恢复                        |
| ------------------------- | ------ | -------- | ------------------------------- |
| 多段短 workflow（模式 A） | 高     | 低       | 天然支持（每段独立触发）        |
| 一段长 workflow（模式 B） | 无     | 高       | 不支持（for...of 只能从头执行） |
| 长 workflow + 检查点      | 无     | 低       | 支持，但需要新机制              |

**示例**：attack workflow 包含 7 个 step（选法术 → 选目标 → 掷骰 → 选修正 → 判定 → 目标回应 → 结算）。用户在"选修正"阶段刷新页面，需要从"选法术"重新开始。模式 A 下只需重做"选修正"这一段。

**检查点方案初步思路**：

在交互 step 完成后自动保存 `ctx.data` 快照（localStorage），记录当前 step ID。恢复时跳到对应 step：

```typescript
// 引擎支持 startFrom
engine.runWorkflow('attack', ctx, internal, { startFrom: 'choose-modifiers' })

// 执行循环中跳过前面的 step
for (const meta of steps) {
  if (startFrom && meta.step.id !== startFrom) continue
  startFrom = null
  await composedFn(ctx)
}
```

**检查点方案的已知问题**：

- 跳过的 step 可能有初始化副作用（设置 ctx.data 字段），快照必须完整覆盖这些字段
- 跳过的 step 的 wrapper 也被跳过，插件可能依赖 wrapper 执行的前置逻辑
- ctx.data 必须全部 serializable（localStorage 需要 JSON.stringify）
- 快照存储的生命周期管理（什么时候存、存多久、谁来清理）
- 插件动态注册的 step 可能导致 step 列表与快照时不一致

**与 ctx.data serializable 约束的关联**：设计文档 §13.1 已有 `Cloneable` 类型约束提案，如果未来需要检查点持久化，这个约束从"最好遵守"变成"必须强制"。

**深入分析后的结论**：

经过 §2.8 的多插件场景推演，startFrom 和检查点恢复在多插件场景下都不可靠。因此：

> **长 workflow 必须一次性跑完，中断即丢失，无法可靠恢复。**

这创造了一个自然的**"最优长度"设计压力**：

| workflow 时长            | 丢失代价     | 可接受度   |
| ------------------------ | ------------ | ---------- |
| 2-3 秒（纯计算，无交互） | 几乎为零     | 完全可接受 |
| 10-30 秒（1-2 次交互）   | 低，重做几步 | 基本可接受 |
| 1-2 分钟（多轮交互）     | 中等         | 勉强可接受 |
| 5+ 分钟（复杂多人交互）  | 高           | 不可接受   |

TTRPG 大多数操作落在前两档。甜区约为 **3-8 个 step，0-2 次交互 prompt**。

关键缓解因素：骰子结果、伤害值等关键数据已通过 effect 广播到聊天记录——即使 workflow 中断，"发生了什么"有据可查，GM 可手动修正。

**此问题视为已有结论**：接受"刷新从头来"，通过控制 workflow 长度来限制丢失代价。检查点作为远期 nice-to-have，不作为当前设计的必要组成。

### 2.6 交互式 workflow 的 abort 语义

**问题**：当 workflow 在 `await ctx.prompt()` 处挂起时，abort 的行为需要重新定义。

当前 abort 语义是"请求中止，下一个 step 前才检查"。但如果当前 step 卡在 await prompt 上，引擎永远走不到"下一个 step 前"的检查点。

**需要的行为**：abort 时主动 reject 所有 pending prompt，让当前 step 的 await 抛错或返回特殊值，使执行流继续到下一个 step（然后被 abortCtrl 检查拦下）。

**初步方向**：InternalState 追踪 pending prompts：

```typescript
interface InternalState {
  depth: number
  abortCtrl: { aborted: boolean; reason?: string }
  pendingPrompts: Set<{ reject: (err: Error) => void }> // 新增
}
```

abort 时遍历并 reject：

```typescript
abort: (reason) => {
  internal.abortCtrl.aborted = true
  internal.abortCtrl.reason = reason
  for (const p of internal.pendingPrompts) {
    p.reject(new WorkflowAbortError(reason))
  }
  internal.pendingPrompts.clear()
}
```

**未讨论**：step 内 catch 到 `WorkflowAbortError` 后应该怎么处理——重新抛出（让引擎处理）还是静默忽略（依赖下一轮 abortCtrl 检查）？

### 2.7 Workflow 定位的根本性重新认识

**演进过程**：

讨论初期，workflow 被定位为"替代 FVTT monkey patching 的计算管道"，应保持短暂、非交互。但深入分析后发现：

1. **碎片化问题**：短 workflow 导致流程逻辑散落在 React 组件里，插件无法参与 workflow 间的"间隙"
2. **FVTT 的局限性不应成为我们的设计约束**：FVTT 没有解决交互问题不代表我们不应该解决
3. **交互只是一种异步副作用**：`ctx.prompt` 和 `ctx.serverRoll` 从引擎角度完全等价，引擎不需要知道 Promise 等的是网络还是人类
4. **统一 workflow 的优势**：所有环节（包括交互）都可 add/wrap/replace，插件的扩展能力大幅增强

**当前认识**：workflow 不应局限于"纯计算管道"，而应成为**完整的用户意图执行流程**的可插拔表达。交互是流程的一部分，不是流程之外的东西。

**但需要警惕**：

- 不应把所有内部操作都 workflow 化（§2.4 的边界问题仍然成立）
- 交互引入的不确定性需要配套机制（abort 联动、超时、检查点）
- workflow 越长越需要中间恢复能力（§2.5）

**开放问题**：这个重新定位是否意味着需要修改设计文档 `15-Workflow系统设计.md` 的核心定位？还是作为未来演进方向，当前实施阶段仍以短 workflow 为主？

### 2.8 startFrom 与 Context 自动构建

**背景**：§2.5 提出了 startFrom 作为中间恢复的引擎能力。进一步讨论后，问题聚焦到：从中间步骤开始时，ctx.data 应该怎么构建？

**当前现状**：ctx.data 完全由调用方通过 `initialData` 手动提供（`createWorkflowContext(deps, initialData, internal)` 里的 `{ ...initialData }`），引擎没有任何自动构建能力。

**理想设计**：

**层次一：startFrom 引擎能力**（低成本，确定可行）

```typescript
engine.runWorkflow('attack', ctx, internal, { startFrom: 'roll-dice' })

// 执行循环：
for (const meta of steps) {
  if (startFrom && meta.step.id !== startFrom) continue
  startFrom = null
  await composedFn(ctx)
}
```

**层次二：数据源声明式构建**（中等成本，需要新的 API 设计）

每个 workflow 定义声明数据来源而非数据值，引擎在启动时自动从系统状态拉取：

```typescript
defineWorkflow({
  name: 'attack',
  resolveInitialData: (entityId: string) => ({
    entityId,
    entity: getEntity(entityId),        // 从 store 现抓
    modifiers: getModifiers(entityId),   // 从 store 现抓
  }),
  steps: [...]
})
```

无论从头开始还是从中间开始，初始 context 都一致——来自系统当前真实状态。

**根本性限制：中间产物无法自动构建**

ctx.data 中有两类数据：

- **系统状态衍生的**：entityId、entity 数据、modifier 列表——可随时从 store 重新获取
- **前序 step 产出的**：骰子结果、用户选择的修正项——只存在于执行流中，系统里没有

如果 startFrom 跳过了"掷骰"step，`ctx.data.rollResult` 就不存在。

**核心约定**：

> 能作为 startFrom 目标的 step，必须只依赖"可从系统状态重新获取的数据"，不能依赖"前序 step 的产物"。

示例（attack workflow: 选法术 → 选目标 → 掷骰 → 选修正 → 判定 → 结算）：

- 从"选法术"开始 ✅——不依赖前序产物
- 从"选目标"开始 ✅——法术信息可从 UI state 获取
- 从"掷骰"开始 ✅——目标信息可从 store 获取
- 从"判定"开始 ❌——依赖骰子结果，这是前序 step 的产物

**多插件场景下 startFrom 不可靠（关键发现）**：

通过推演复杂场景（base 6 step + 5 个插件各自 attach/replace/wrap），发现：

```
Base 设计者视角：选法术 → 选目标 → 掷骰 → 选修正 → 判定 → 结算
                "从选目标开始是安全的" ← 基于 base step 的分析

实际执行视角：选法术 → [法术变体(A)] → [目标过滤(B)] → 选目标 → [新掷骰(C)] → ...
              从选目标开始 = 跳过了 [法术变体] 和 [目标过滤]
              但 [目标过滤(B)] 依赖 [法术变体(A)] 的产物
              而 base 设计者根本不知道 A 和 B 的存在
```

- **没有任何一方拥有完整的依赖图**：base 不知道插件加了什么，插件之间互不知道
- startFrom 在**单插件场景下可行**，在**多插件动态组合场景下不可靠**
- 这也意味着检查点恢复方案同样不可靠——即使保存了 ctx.data 快照，跳过的 wrapper/附加 step 的副作用仍然缺失

**结论**：startFrom 退化为"使用者自担风险"的 escape hatch，不能作为系统性的恢复机制。

**未决定**：

- resolveInitialData 的 API 形式（函数签名、参数传递方式）
- 是否仍有必要提供 startFrom 作为 opt-in 能力（明确标注"仅限单插件或 base-only 场景"）

### 2.4 Workflow 适用边界的形式化

**共识**：workflow 应只覆盖"用户意图级别的操作"（掷骰、攻击、施法），不应把所有内部操作都 workflow 化。

**未确定**：如何在架构层面防止过度 workflow 化？目前只是口头约定。是否需要在设计文档或 SDK 指南中给出明确的判断标准（例如："如果一个操作不是由用户直接触发的，不应定义为 workflow"）？

---

## 3 关键设计洞察

以下是讨论中浮现的、对后续设计有指导意义的洞察：

1. **交互只是另一种异步副作用**。`ctx.prompt` 和 `ctx.serverRoll` 从引擎角度完全等价——都是 `await` 一个 Promise。纯计算是确定性的（一定返回、耗时可忽略），交互是不确定性的（可能不返回、耗时不定、可能涉及其他客户端），但这些不确定性可以封装在 prompt 实现层，对引擎透明。
2. **碎片化 vs 完整性是核心矛盾**。短 workflow 简单但导致流程逻辑散落、插件无法参与间隙；长 workflow 完整但需要中间恢复机制。检查点可能是兼顾两者的方案。
3. **workflow 是插件的扩展机制，不是通用控制流抽象**。不是所有函数调用都需要可插拔。但"用户意图级别的操作"应该包含交互环节，不仅是计算环节。
4. **扩展点必须被有意识地设计出来**。Workflow 提供了设计扩展点的工具，但不能强迫插件作者使用。
5. **信任边界决定了防护级别**。内部开发靠约定，第三方插件需要完整的权限体系。当前的 critical 标记、original 调用次数、effect 访问权限等问题，本质上都是同一个信任边界问题。
6. **线性模型的边界**：嵌套 workflow + 重试在引擎层面仍然是线性的（每层 workflow 内部的 for...of 没变），但在语义层面打破了"每个 step 只执行一次"的假设。
7. **ctx.data 和 effect 方法的本质区别**：ctx.data 是 step 间的水平数据传递管道（"算出了什么"），effect 方法是向外部世界的垂直输出（"要做什么"）。两者的回滚语义不同，不应混为一谈。
8. **当前 workflow 系统的真正局限是持久化，不是交互能力**。如果接受"刷新丢失"，交互支持几乎零成本。持久化才是把问题从"加一个方法"变成"重写架构"的分水岭。
9. **startFrom 的合法性是数据依赖问题，不是引擎问题**。引擎可以从任意 step 开始执行（只需 `continue` 跳过），但语义上是否合法取决于该 step 的数据依赖能否从系统当前状态重新获取。引擎不校验——这是 workflow 设计者的责任。
10. **Context 构建应从"调用方预填"演进到"数据源声明"**。当前 `{ ...initialData }` 要求调用方知道 workflow 需要什么数据并手动提供。理想状态是 workflow 自己声明数据源，引擎自动解析。这同时解决了 startFrom 的 context 构建问题和普通启动时的 context 一致性问题。
11. **多插件场景下没有全局可见性**。每个插件只知道自己添加/修改了什么，不知道其他插件的存在。这不是 startFrom 特有的问题——replaceStep/wrapStep 也面临同样的挑战——但 startFrom 将其放大为不可恢复的语义错误。
12. **有副作用的自动化天然不可逆，这是业务复杂性而非模型缺陷**。骰子已掷出、消息已发送、HP 已扣减——这些是物理世界的状态变化。任何同时有"多步骤自动化 + 外部副作用 + 第三方扩展"的系统都面临同样的矛盾。自动化的价值恰恰在于跳过中间控制，完全加回控制权等于去自动化。
13. **TTRPG 有天然的 escape valve：GM**。FVTT/Midi-QOL 的"恢复"就是 GM 手动改角色卡 + 聊天卡片 undo 按钮，没有引擎级回滚。GM 作为人类仲裁者比任何引擎回滚都更灵活。我们不需要在可恢复性上超越行业标准，只要保证 GM 有足够的数据编辑权限。
14. **模式 B（统一 workflow）大幅减少公开 API 表面积**。模式 A 需要每种操作导出多个 workflow handle（`SELECT_SPELL`, `SELECT_TARGET`, `ROLL_ATTACK`...），插件需要知道所有名称才能参与。模式 B 只需一个 handle（`ATTACK`），插件用 step ID 定位。名称数量从 `N×M` 降到 `M`。
15. **Workflow/Step 的命名不可能像 FVTT hook 那样模式化可预测**。FVTT 的 hook 在数据操作层（`pre/post × CRUD × EntityType`），是系统性的、与游戏规则无关的组合。我们的 workflow step 在游戏语义层（`roll-dice`, `apply-modifiers`, `resolve-hope-fear`），完全取决于具体规则系统的设计。不同规则系统（Daggerheart vs D&D 5e）的 step 列表完全不同，没有通用模式可推断。**因此，规则系统必须显式导出所有 workflow handle 和 step ID 常量**，作为插件开发者的正式 API 合约，而不能依赖命名约定的可预测性。

---

## 4 后续行动项

基于以上讨论结论，按优先级排列的后续修改工作：

### P0 — 当前分支合并前

| #   | 任务                 | 说明                                                                                                                                                                                             |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 更新 Doc 15 核心定位 | 从"替代 monkey patching 的计算管道"→"完整的用户意图执行流程的可插拔表达"；明确 workflow 粒度是"一次用户意图"（一次攻击），不是"一整个回合"；加入 workflow 长度指导（3-8 step，0-2 次交互的甜区） |
| 2   | Workflow 注册表导出  | 规则系统插件（如 `daggerheart-core`）维护一个可发现的注册表，列出所有可用 workflow 及其 step 清单，后续插件通过 import 使用而非硬编码字符串。见下方详细方案                                      |

**P0-2 详细方案：Workflow 注册表**

核心思路：基座（规则系统插件）提供一个结构化的清单，说明当前系统中有哪些 workflow 和 step 可以参与。

```typescript
// plugins/daggerheart-core/registry.ts

/** Daggerheart 规则系统的 workflow 注册表 */
export const DH_WORKFLOWS = {
  ROLL: {
    handle: rollWorkflow, // WorkflowHandle<BaseRollData>
    steps: {
      GENERATE: 'generate', // 生成骰子公式
      JUDGE: 'dh:judge', // Hope/Fear 判定
      RESOLVE: 'dh:resolve', // 解析结果
      DISPLAY: 'display', // 展示结果
    },
  },
} as const
```

扩展插件使用：

```typescript
import { DH_WORKFLOWS } from 'daggerheart-core/registry'

const { ROLL } = DH_WORKFLOWS
sdk.attachStep(ROLL.handle, {
  id: 'cos:dice-animation',
  to: ROLL.steps.JUDGE,
  critical: false,
  run: cosmeticDiceAnimationStep,
})
```

好处：

- IDE 自动补全，插件开发者不需要查文档就能发现可用的 workflow 和 step
- 类型安全——拼错 step ID 会在编译期报错
- 当前规模（1 workflow，4 step）只需几行代码，不需要自动化生成
- 未来 step 数量增长后，可考虑加 ESLint 规则禁止在 SDK 方法参数中使用字符串字面量

**补充方案：运行时自动注册表**

引擎内部已有完整数据（`WorkflowRecord.steps` 包含每个 step 的 ID、pluginOwner、dependsOn）。只需暴露查询 API：

```typescript
// 引擎新增 API（数据已有，只需暴露）
engine.listWorkflows(): string[]
engine.inspectWorkflow(name: string): {
  steps: { id: string; pluginOwner: string; dependsOn?: string }[]
  wrappers: Map<string, string[]>
  replacements: Map<string, string>
}

// PluginSDK 新增：每个插件查询自己注册了什么
sdk.getMyRegistrations(): {
  stepsAdded: { workflowName: string; stepId: string }[]
  stepsWrapped: { workflowName: string; stepId: string }[]
  stepsReplaced: { workflowName: string; stepId: string }[]
}
```

**编译期常量 vs 运行时注册表的关系**：

| 需求                  | 运行时注册表  | `as const` 常量 |
| --------------------- | ------------- | --------------- |
| IDE 自动补全          | ❌ 运行时才有 | ✅ 编译期可用   |
| 拼错 step ID 报错时机 | 运行时        | 编译期          |
| 自动发现新增 step     | ✅ 自动       | ❌ 需手动更新   |
| 调试工具 / DevPanel   | ✅            | ❌              |

两者互补：`as const` 解决开发体验，运行时注册表解决调试和自动发现。未来可以写脚本从运行时注册表反向生成 `registry.ts`。

### P1 — 下一个迭代（交互支持）

| #   | 任务                      | 说明                                                                                                                      |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 3   | ctx.prompt 方法设计与实现 | WorkflowContext 新增 `prompt` 方法；Promise + resolve 暴露给 UI 层；全局 prompt 渲染层（订阅 pending prompt 渲染对应 UI） |
| 4   | abort 语义升级            | InternalState 追踪 `pendingPrompts`；abort 时主动 reject 所有 pending prompt；需与 ctx.prompt 同时设计                    |

### P2 — 中期（插件 API 稳定化前）

| #   | 任务                    | 说明                                                                                                     |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| 5   | resolveInitialData API  | workflow 声明数据源而非调用方手动预填；当前 `{ ...initialData }` 够用，API 对外发布前需改                |
| 6   | Lifecycle observer 实现 | 注册阶段（`onStepAdded/Removed/Wrapped`）+ 执行阶段（`onWorkflowStart/End/StepStart/StepEnd`）事件       |
| 7   | SDK 文档                | 每个规则系统的 workflow/step 注册表文档；ctx.data 字段契约（每个 step 期望和产出什么）；副作用幂等性约定 |

### P3 — 远期（第三方插件开放时）

| #   | 任务                           | 说明                                              |
| --- | ------------------------------ | ------------------------------------------------- |
| 8   | 权限声明体系                   | 插件声明需要哪些能力（effect 访问权限），用户审批 |
| 9   | Non-critical step context 限制 | 依赖权限体系，给 non-critical step 阉割版 context |
| 10  | original 调用次数防护          | DEV 模式 warn 或带计数器的 guard                  |
