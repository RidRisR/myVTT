# DaggerHeart 掷骰流程验收 + VTTPlugin 迁移设计

> **状态**：共识已达成 — 待转入实现计划 | 2026-04-03
> **前置文档**：`17-插件系统演进路线.md`、`19-DaggerHeart插件演进-头脑风暴.md`、`docs/architecture/rule-plugin-system.md`
> **范围**：完整 DaggerHeart 掷骰链路 + RulePlugin 部分退役 + 基础设施补全 + OOP 模式验证

---

## 总体目标

通过实现一套**完整可用的 DaggerHeart 掷骰流程**，达成三个验收目标：

1. **证明基础设施完备** — SDK 能否支撑完整的掷骰链路（触发 → 交互 → 掷骰 → 判定 → 数据更新 → 渲染）
2. **证明 OOP 可行** — 插件内部能否用类组织领域逻辑，只在边界处使用 SDK 接口
3. **推进 RulePlugin 退役** — 将 `diceSystem` 能力完全迁移到 VTTPlugin，RulePlugin 仅保留 adapters/characterUI

---

## 验收后的插件结构预期

```
当前:
  daggerheart/        (RulePlugin) — adapters, characterUI, diceSystem, surfaces, templates
  daggerheart-core/   (VTTPlugin) — workflows, commands, rollResult config
  daggerheart-cosmetic/ (VTTPlugin) — dice animation

验收后:
  daggerheart/        (RulePlugin 薄壳) — 仅 adapters + characterUI（待后续迁移）
  daggerheart-core/   (VTTPlugin, OOP 重写) — 完整掷骰系统
    ├── DiceJudge      — 判定逻辑（evaluateRoll + DC）
    ├── HopeResolver   — Hope 更新（per-character）
    ├── FearManager    — Fear 全局实体管理 + 面板
    ├── ModifierInput  — requestInput 处理组件
    └── workflows      — dh:action-check, dh:judgment
  daggerheart-cosmetic/ (VTTPlugin) — 保持不变（暂不动）
```

---

## 工作议程

以下是需要逐一讨论和设计的工作项。每项标注了**当前状态**、**需要做什么**、**涉及的基础设施变更**。

---

### 议题 1：OOP 插件模式验证

**目标**：证明 VTTPlugin 接口不限制插件内部的编码风格。

**当前分析**：

现有接口天然支持 OOP：

- `VTTPlugin` 可以是 class instance（`class DaggerHeartCore implements VTTPlugin`）
- `IPluginSDK` 在 `onActivate` 中接收，可存为字段用于注册
- `WorkflowContext` 作为 step 函数参数，可传入类方法（`(ctx) => this.dice.judge(ctx)`）
- 类可持有领域状态（如缓存的 entityId），运行时通过 `ctx.read` 验证

**预期模式**：

```typescript
class DaggerHeartCore implements VTTPlugin {
  id = 'daggerheart-core'
  private dice = new DiceJudge()
  private fear = new FearManager()
  private hope = new HopeResolver()

  onActivate(sdk: IPluginSDK) {
    // 注册 workflow —— 步骤函数委托给类方法
    sdk.defineWorkflow('dh:action-check', [
      { id: 'roll',     run: (ctx) => this.roll(ctx) },
      { id: 'modifier', run: (ctx) => this.collectModifier(ctx) },
      { id: 'judgment', run: (ctx) => this.dice.judge(ctx) },
      { id: 'resolve',  run: (ctx) => this.resolveOutcome(ctx) },
    ])

    // 注册 UI —— 传入类实例供组件调用
    sdk.ui.registerComponent({ ... })       // Fear 面板
    sdk.ui.registerInputHandler('dh:modifier', { ... }) // Modifier 输入
    sdk.registerCommand('.dd', ...)
  }
}
```

**✅ 结论**：

1. **OOP 天然可行，无需额外基础设施。** 插件初始化纯声明，运行时逻辑通过 `WorkflowContext` 参数传入类方法。
2. **UI 组件不需要访问插件实例。** 数据流通过 Store 中介：UI 订阅 `useComponent`/`useEntries` 读取，通过 `runWorkflow(handle)` 写入。计算逻辑通过纯函数模块导入。
3. **跨插件不互访实例。** 一切通过 SDK 契约：workflow 名称、RendererPoint token、component key、entry type。
4. **对象需要运行时数据初始化时采用 lazy init 模式**：首次 workflow 执行时通过 `ctx.read` 查询并缓存。
5. **插件级跨组件瞬态**是唯一理论 gap（一个插件内多个 UI 组件共享非持久状态），但场景极少且本次不涉及，记录为未来议题。

---

### 议题 2：基础设施补全 — `createEntity` + 命名空间强制

**目标**：让插件能在 workflow 中创建/删除实体，并从第一天起强制命名空间隔离。

**当前状态**：

- `WorkflowContext` 有 `updateComponent(entityId, key, updater)` — 更新已有实体的组件
- `WorkflowContext` 有 `emitEntry(...)` — 发送日志
- **缺少** `createEntity` / `deleteEntity` — 插件无法从 workflow 管理实体生命周期
- `worldStore.addEntity(entity)` 存在但仅 UI 层直接调用

**已达成共识**：

1. **`createEntity` 和 `deleteEntity` 都需要**，作为 `WorkflowContext` 的运行时能力（非 `IPluginSDK` 注册时能力）
2. **实体发现用确定性 ID** — 插件创建实体时指定 ID（如 `daggerheart-core:fear`），后续通过 ID 直接查找
3. **不引入独立的插件持久化存储（模式 A）** — 当前 ECS 本身就是插件的持久化载体（模式 B），实体 + 组件足以承载插件全局数据（如 Fear tracker、插件配置）
4. **命名空间强制**：SDK 层校验所有持久化 key 必须以 `pluginId:` 为前缀，防止不可逆的数据污染。这是 API 级强制（类似 Foundry VTT 的 `setFlag(moduleId, key, value)`），不依赖开发者自觉

**命名空间强制方案**：

```typescript
// SDK 内部，所有写操作共用校验
function assertNamespaced(pluginId: string, key: string) {
  if (!key.startsWith(pluginId + ':')) {
    throw new Error(`Key "${key}" must be prefixed with "${pluginId}:"`)
  }
}
```

需覆盖的写操作入口（实现时需逐一确认完整性）：

- `createEntity` — entity ID
- `deleteEntity` — entity ID
- `updateComponent` — component key
- `emitEntry` — entry type
- `defineWorkflow` / `registerCommand` / `registerTrigger` 等注册 API — 名称

**`createEntity` API 草案**：

```typescript
interface WorkflowContext {
  createEntity(data: {
    id: string // 确定性 ID，必须 pluginId: 前缀
    components?: Record<string, unknown> // component key 也需命名空间前缀
    lifecycle?: EntityLifecycle // 默认 'persistent'
    tags?: string[]
  }): Promise<string> // 返回 entity ID

  deleteEntity(entityId: string): Promise<void>
}
```

实现路径：走 Socket.io request-response 模式（类似 `serverRoll` 的 ack 模式），服务端创建/删除 → 广播 → 返回结果。

**PR #185 的影响**：lifecycle 重设计后，persistent 实体不再 auto-link 到所有场景。Fear tracker 用 `persistent` 创建后不会出现在 PortraitBar 中，无需 hack。

---

### 议题 3：Fear 迁移 — team_trackers → 全局实体

**目标**：将 Fear 从 `team_trackers` 表迁移为普通实体 + tracker 标记组件。

**✅ 已达成共识**：

#### 插件二阶段生命周期

当前 `onActivate` 只接收 `IPluginSDK`（纯声明），没有运行时数据操作能力。这是一个**关键能力缺失**——业界几乎所有插件系统都有两阶段生命周期（Foundry VTT 的 `init`/`ready`、Unity 的 `Awake`/`Start`）。

新增 `onReady` 生命周期钩子：

```typescript
interface VTTPlugin {
  id: string
  onActivate(sdk: IPluginSDK): void // 阶段1：纯声明
  onReady?(ctx: WorkflowContext): void // 阶段2：运行时初始化
  onDeactivate?(sdk: IPluginSDK): void
}
```

基座执行顺序：

1. 所有插件 `onActivate` → 注册全部完成
2. Store 数据就绪
3. 所有插件 `onReady` → 可以 `ctx.read`、`ctx.createEntity`、`ctx.runWorkflow`

#### Fear 实体

```
实体 ID: 'daggerheart-core:fear'（确定性 ID，命名空间前缀）
lifecycle: 'persistent'
组件:
  'daggerheart-core:fear-tracker': { current: 0, max: 10 }
```

初始化逻辑在 `onReady` 中：

```typescript
async onReady(ctx: WorkflowContext) {
  const existing = ctx.read.entity('daggerheart-core:fear')
  if (!existing) {
    await ctx.createEntity({
      id: 'daggerheart-core:fear',
      components: { 'daggerheart-core:fear-tracker': { current: 0, max: 10 } },
    })
  }
}
```

#### Fear 面板

- `onActivate` 中通过 `sdk.ui.registerRenderer` 注册 Fear 面板组件
- 面板 UI 通过 `useComponent('daggerheart-core:fear', 'daggerheart-core:fear-tracker')` 订阅数据
- 写入通过 workflow 调用 `ctx.updateComponent`

**需在实现时确认**：

- [ ] `onReady` 的错误处理策略——某插件 `onReady` 失败是否影响其他插件？
- [ ] `onReady` 是否需要支持 async（Fear 创建需要 await）？

---

### 议题 4：Hope 更新逻辑

**目标**：掷骰结果为 hope 时，增加**掷骰者**的 hope 值；fear 时增加 Fear 全局实体。

**✅ 已达成共识**：

在 `dh:action-check` workflow 的 resolve step 中，根据 judgment outcome 分发更新：

```typescript
// Hope outcome → 更新掷骰者的角色组件
if (outcome === 'success_hope' || outcome === 'failure_hope') {
  ctx.updateComponent(actorId, 'daggerheart:extras', (prev) => ({
    ...prev,
    hope: (prev?.hope ?? 0) + 1,
  }))
}
// Fear outcome → 更新 Fear 全局实体
if (outcome === 'success_fear' || outcome === 'failure_fear') {
  ctx.updateComponent('daggerheart-core:fear', 'daggerheart-core:fear-tracker', (prev) => ({
    ...prev,
    current: (prev?.current ?? 0) + 1,
  }))
}
```

注意 component key 归属：`daggerheart:extras` 由 RulePlugin（`daggerheart`）创建，保持原 key；`daggerheart-core:fear-tracker` 由 VTTPlugin（`daggerheart-core`）创建。

**需在实现时确认**：

- [ ] Hope 是否有上限？（规则细节）
- [ ] 角色卡上 hope 字段展示是否已足够（`DaggerHeartCard` 已显示 `extras.hope`）

---

### 议题 5：触发方式扩展

**目标**：除 `.dd` 命令外，增加角色卡按钮和 Token 右键菜单触发掷骰。

**✅ 已达成共识 — 本次不需要额外迁移**：

DaggerHeart 的 RulePlugin 实际上**没有注册** `getTokenActions` 和 `getContextMenuItems`。其 `surfaces` 仅有：

- `panels`（全屏角色卡）— 属于 characterUI 迁移，不在本次范围
- `teamPanel`（Fear/Hope 面板）— 已在议题 3 中通过 `sdk.ui.registerRenderer` 迁移

因此本次验收只需 `.dd` 命令作为触发入口。Token action / context menu 的注册 API 迁移（`getTokenActions` / `getContextMenuItems` → `IPluginSDK`）留给未来的 RulePlugin surfaces 退役批次。

---

### 议题 6：Modifier 交互面板（DC 输入）

**目标**：掷骰前弹出面板，让玩家/GM 输入 DC 和选择 modifier。验证 `requestInput` 基础设施。

**✅ 已达成共识**：

本次验收从 `.dd` 命令触发 modifier 面板（requestInput），作为 requestInput 基础设施的首个实际验证。

**⚠️ 临时 workaround（需在代码中标记）**：命令行触发 modifier 面板不是理想设计——面板的正确触发入口是角色卡按钮（用户未预先指定参数时弹出交互面板）。characterUI 迁移后，命令行触发路径应被移除，改由角色卡按钮触发同一个 workflow。

本次验收的 `.dd` 工作流链路：

```
.dd 命令触发 → dh:action-check workflow
  ├─ modifier step: ctx.requestInput('daggerheart-core:modifier', { actorId })
  │   → 面板弹出，用户填 DC、选属性
  │   → 返回 { dc, attribute, bonuses }
  │   → 取消则 workflow abort
  │   ⚠️ TEMP: 命令行触发此面板是临时路径，characterUI 迁移后删除
  ├─ roll step: ctx.serverRoll([{ sides: 12, count: 2 }]) → rolls
  ├─ compute step: total + judgment（插件纯函数）
  ├─ emit step: emitEntry('daggerheart-core:action-check', { 完整上下文 })
  └─ resolve step: 更新 Hope/Fear
```

`ModifierPanel` 通过 `registerInputHandler('daggerheart-core:modifier', ...)` 注册。

**需在实现时确认**：

- [ ] Modifier 面板的具体字段（DC、属性选择等，规则细节）
- [ ] characterUI 迁移后，角色卡按钮直接调用同一个 workflow，体验一致

---

### 议题 7+8+10：判定数据流 + 渲染 + diceSystem 退役（合并讨论）

**目标**：重新设计从掷骰到渲染的完整数据流，同时退役 `RulePlugin.diceSystem`。

**✅ 已达成共识**：

#### 核心原则：分层职责

1. **`serverRoll` 精简为纯 RNG 服务** — 基座在掷骰这件事上叠加了太多业务信息，这是错误的抽象。`serverRoll` 只负责生成随机数，不承载上层语义。

   ```typescript
   // 改造后的 serverRoll — WorkflowContext 上唯一的掷骰接口
   serverRoll(dice: DiceSpec[]): Promise<number[][]>
   // 输入骰子规格，输出随机数，副作用仅产生精简审计记录
   ```

2. **`core:roll-result` 退化为 RNG 审计记录** — 只保留 `{ dice, rolls }`，不含 formula/rollType/actionName 等上层语义。用于审计和防作弊，不驱动 UI 渲染。

3. **插件自有 entry type 驱动卡片渲染** — 每个规则插件发自己的 entry type（如 `daggerheart-core:action-check`），携带完整上下文（rolls、total、DC、judgment、display），一条 entry 驱动一张完整卡片。

4. **不对外暴露纯函数** — 基座的 formula 解析、@token 替换等工具不直接暴露给插件。所有能力通过 `WorkflowContext` 暴露。插件自己编写自己需要的计算逻辑。

5. **简单掷骰（`.r 2d6`）保持不变** — 基座的 `quick-roll` workflow 内部使用自己的 formula 解析，`core:roll-result` 对无规则判定的简单掷骰同时承担审计和展示角色。

#### 渲染架构变更

6. **`ChatPanel` 的 `CHAT_TYPES` 白名单改为动态注册** — 当前硬编码 `new Set(['core:text', 'core:roll-result'])`，导致插件自定义 entry type 被过滤掉。改为：插件注册 `chat` surface 渲染器时，type 自动加入可见集合。这是唯一需要的基础设施变更，改动量很小。

7. **`RulePlugin.diceSystem` 可完全删除** — 渲染器不再运行时计算判定，直接从 entry payload 读取。`RollResultRenderer` 对 RulePlugin 的最后一个硬依赖被切断。

#### DaggerHeart 掷骰链路（改造后）

```
dh:action-check workflow
  ├─ modifier step: ctx.requestInput → 拿到 DC
  ├─ roll step: ctx.serverRoll([{ sides: 12, count: 2 }]) → 拿到 rolls
  │            （serverRoll 只产生精简审计记录，不含业务语义）
  ├─ compute step: 算 total、judgment（插件自有纯函数）
  └─ emit step: ctx.emitEntry({
  │    type: 'daggerheart-core:action-check',
  │    payload: { rolls, total, dc, formula, judgment, display, ... },
  │    triggerable: true
  │  })
  │  ↑ 一条 entry 携带完整上下文，驱动一张卡片
  └─ resolve step: 更新 Hope/Fear
```

插件注册渲染器：

```typescript
sdk.ui.registerRenderer('chat', 'daggerheart-core:action-check', DHActionCheckCard)
```

#### 日志去重

8. **一次掷骰产生两条 entry**：`core:roll-result`（审计）+ `daggerheart-core:action-check`（展示）。它们共享同一 `groupId`。面板只渲染有注册渲染器的 entry。`core:roll-result` 在有更高层 entry 的同组中不渲染（因为无规则插件时它才承担展示角色）。具体的去重策略需要在实现时确认。

---

### 议题 9：日志去重 / 分组优化

**目标**：同一次掷骰流程只展示一张卡片。

**背景变更**：议题 7+8+10 的共识已经从架构层面减少了去重需求——插件自有 entry 驱动渲染，`core:roll-result` 审计记录不参与渲染。但仍可能存在其他重复来源。

**需在实现时确认**：

- [ ] `core:roll-result` 在有同组更高层 entry 时是否需要显式隐藏机制，还是 `CHAT_TYPES` 动态化后自然不显示
- [ ] 是否存在同一 entry 双重到达（ack + broadcast）的问题——需要实际运行诊断
- [ ] groupId 的 UI 策略：完全隐藏审计 entry？还是提供展开查看原始数据的能力？

---

## 基础设施变更汇总

| 变更                                                | 涉及文件                                                | 议题    |
| --------------------------------------------------- | ------------------------------------------------------- | ------- |
| `WorkflowContext.createEntity()` / `deleteEntity()` | `src/workflow/types.ts`, `context.ts`                   | #2, #3  |
| `VTTPlugin.onReady(ctx)` 二阶段生命周期             | `src/rules/types.ts`, `src/workflow/useWorkflowSDK.ts`  | #3      |
| 命名空间强制（SDK 层校验 pluginId: 前缀）           | `src/workflow/pluginSDK.ts`, `context.ts`               | #2      |
| `serverRoll` 精简为纯 RNG（只接收 DiceSpec[]）      | `src/workflow/types.ts`, `context.ts`, 服务端           | #7+8+10 |
| `core:roll-result` payload 精简（仅 dice + rolls）  | `src/shared/logTypes.ts`, 服务端 roll handler           | #7+8+10 |
| `CHAT_TYPES` 白名单改为动态注册                     | `src/chat/ChatPanel.tsx`, `src/log/rendererRegistry.ts` | #7+8+10 |
| `RulePlugin.diceSystem` 接口删除                    | `src/rules/types.ts`, `RollResultRenderer.tsx`          | #7+8+10 |
| Token action / context menu 注册                    | `src/ui-system/registrationTypes.ts`                    | #5      |
| 日志去重 / groupId 策略                             | `src/chat/`, `src/log/`                                 | #9      |

---

## 不在本次范围

- **characterUI 迁移**（EntityCard + FullCharacterSheet + 角色卡掷骰按钮）— **紧跟本次验收之后**，需要基座暴露 entityCard / panel 注册点。迁移后 modifier 面板从角色卡按钮触发，替换当前的命令行 workaround
- **adapters 迁移**（17 处基座消费点）— 独立议题，不阻塞掷骰流程
- **dataTemplates 迁移** — 同上
- **骰子动画完善**（daggerheart-cosmetic）— 暂不重要
- **team_trackers 表删除** — Fear 迁移后 deprecate，但不在本次删除

---

## 共识总结

所有 10 个议题已讨论完毕（2026-04-03）。关键架构决策：

1. **OOP 天然可行**，无需额外基础设施（议题 1 ✅）
2. **`createEntity` / `deleteEntity`** 作为 `WorkflowContext` 运行时能力，确定性 ID + 命名空间强制（议题 2 ✅）
3. **`onReady(ctx)` 二阶段生命周期**——声明与初始化分离，Fear 在 onReady 中幂等创建（议题 3 ✅）
4. **Hope per-character + Fear 全局实体**，resolve step 分发更新（议题 4 ✅）
5. **触发入口本次只用 `.dd`**，token action/context menu 留给后续（议题 5 ✅）
6. **modifier 面板从命令行临时触发**（⚠️ workaround），验证 requestInput 基础设施（议题 6 ✅）
7. **`serverRoll` 精简为纯 RNG**，插件自有 entry type 驱动卡片渲染，`CHAT_TYPES` 动态化（议题 7+8+10 ✅）
8. **日志去重**由架构变更自然解决，实现时确认细节（议题 9 ✅）

下一步：转入实现计划（writing-plans skill）。
