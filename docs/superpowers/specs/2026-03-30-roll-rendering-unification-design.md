# 掷骰渲染与注册系统统一设计

## 背景

Sprint 2 (#174) 和 UI System Phase 1+2 (#173) 合并后，掷骰卡片的渲染存在三条冗余路径和两套注册系统。一次 `.dd` 掷骰产生 3 条日志条目（`core:roll-result`、`dh:judgment`、`core:tracker-update`），其中 `dh:judgment` 的 payload 与 `core:roll-result` 数据完全重复（judgment 可从 rolls 纯计算得出）。

### 当前问题

1. **渲染路径冲突**：`RollResultRenderer`（新系统）短路了 `MessageCard` → `DHRollCard`（旧系统），导致卡片不显示 Hope/Fear judgment
2. **日志投递不可靠**：`dh:judgment` 条目写入数据库但未到达客户端 store，groupId 过滤机制失效
3. **注册系统冗余**：`registerRenderer`（rendererRegistry.ts）和 `ExtensionRegistry.contribute`（extensionRegistry.ts）功能重叠（Issue #177）

## 设计目标

- 一次掷骰 = 一条 `core:roll-result` 日志 = 一张卡片
- 一套渲染器注册系统
- 消除 ChatPanel 中的 ad-hoc groupId 过滤逻辑

## 架构决策

### 决策 1：删除 `dh:judgment` 日志条目 + 提取可复用的 judgment workflow

**核心原则**：我们不需要中心化的 judgment 广播机制，我们需要的是**可复用的组合单元**。

Judgment（Hope/Fear）是从 rolls 数据纯计算得出的确定性结果。同一个计算存在两个消费场景：

| 消费场景 | 性质 | 复用方式 |
| --- | --- | --- |
| UI 渲染（卡片显示 Hope/Fear） | 只读，无副作用 | `dhEvaluateRoll()` 纯函数 — 任何组件按需调用 |
| Tracker 更新（Hope/Fear ±1） | 写操作，有副作用 | `dh:judgment` 子 workflow — 任何 workflow 按需组合 |

**提取 \****`dh:judgment`**\*\* 为独立子 workflow**，与现有的 `roll` 子 workflow 模式一致：

```typescript
// 现有模式：roll 是可复用子 workflow
const result = await ctx.runWorkflow(getRollWorkflow(), { formula, actorId })

// 新增：judgment 也是可复用子 workflow
const result = await ctx.runWorkflow(getDHJudgmentWorkflow(), { rolls, total })
```

`dh:judgment` workflow 内部包含两步：
1. `judge` — 调用 `dhEvaluateRoll()` 计算 judgment
2. `resolve` — 根据 judgment 更新 Hope/Fear tracker

`dh:action-check` 重构为纯粹的组合：

```typescript
// 重构前
dh:action-check = [roll步骤, dh:judge, dh:emit-judgment, dh:resolve, display]

// 重构后
dh:action-check = [
  roll步骤       → ctx.runWorkflow(getRollWorkflow(), ...)
  judgment步骤   → ctx.runWorkflow(getDHJudgmentWorkflow(), ...)
  display步骤    → toast 通知
]
```

未来任何需要 Hope/Fear 判定 + tracker 更新的 workflow 都可以直接组合 `getDHJudgmentWorkflow()`。

**删除范围**：
- workflow 步骤 `dh:emit-judgment`（冗余日志条目的来源）
- `DHJudgmentRenderer` 组件
- ChatPanel 的 groupId 过滤逻辑和 `CHAT_TYPES` 中的 `'dh:judgment'`

### 决策 2：`RollResultRenderer` 插件感知路由 + 双模式注册

当前 `RollResultRenderer` 只渲染纯骰子。改造后，支持两种插件注册方式，通过统一的 `sdk.registerRenderer()` API 注册，不依赖 `RulePlugin` 接口。

**插件 API — 通过 SDK 导出的 typed token 注册**

SDK 导出预定义的 token 工厂函数，插件引用即可，类型安全自动生效：

```typescript
import { rollResult } from '@myvtt/sdk'

// 简单路径：语义化配置（推荐）
// IDE 自动补全 RollResultConfig 的字段，传错结构编译报错
sdk.registerRenderer(rollResult('daggerheart:dd'), {
  dieConfigs: [
    { color: '#fbbf24', label: 'die.hope' },
    { color: '#dc2626', label: 'die.fear' },
  ]
})

// 高级路径：完整组件覆盖（escape hatch）
sdk.registerRenderer(rollResult('daggerheart:dd'), DHRollCard)
```

插件作者不需要知道 `RendererPoint<T>`、phantom type、`createRendererPoint` 等内部概念。`rollResult()` 返回一个 typed token，TypeScript 通过它的类型参数隐式检查注册数据是否合法。

**系统内部 — `RollResultRenderer` 路由逻辑**

`RollResultRenderer` 是系统注册的 renderer，对插件不可见。它从 registry 查询插件注册的配置/组件：

```typescript
function RollResultRenderer({ entry, isNew, animationStyle }: LogEntryRendererProps) {
  const { rollType, rolls } = entry.payload

  // 从 registry 查询（插件通过 sdk.registerRenderer 注册的数据）
  const slot = rollType ? getRenderer('rollResult', rollType) : undefined

  // 1. 语义化配置（简单路径）
  if (slot && typeof slot !== 'function') {
    const config = slot as RollResultConfig
    const judgment = diceSystem.evaluateRoll(rolls, total)
    const display = judgment ? diceSystem.getJudgmentDisplay(judgment) : null
    return (
      <CardShell ...>
        <DiceAnimContent
          dieConfigs={config.dieConfigs}
          footer={display ? { text: t(display.text), color: display.color } : undefined}
          totalColor={display?.color}
          ...
        />
      </CardShell>
    )
  }

  // 2. 完整组件覆盖（高级路径）
  if (slot && typeof slot === 'function') {
    const CustomCard = slot
    return (
      <CardShell ...>
        <CustomCard message={rollEntryToChatRoll(entry)} isNew={isNew} renderDice={...} />
      </CardShell>
    )
  }

  // 3. 无插件注册 → 默认纯骰子渲染
  return (
    <CardShell ...>
      <DiceAnimContent formula={...} rolls={...} isNew={!!isNew} />
    </CardShell>
  )
}
```

**注册架构总览**

```
registry (统一的 Map<string, T>):
  'chat::core:roll-result'       → RollResultRenderer          (系统注册)
  'chat::core:text'              → TextEntryRenderer            (系统注册)
  'rollResult::daggerheart:dd'   → { dieConfigs: [...] }       (插件注册)
```

- `'chat'` surface：系统内部使用，路由日志条目类型到 renderer
- `'rollResult'` surface：插件使用，声明 rollType 的渲染配置/组件
- 同一个 registry，同一个 `registerRenderer` API，不同 surface 服务不同层级

**影响**：Daggerheart 插件可以从当前的 `DHRollCard` 组件简化为纯配置注册，因为 `diceSystem` 上已有 `evaluateRoll` + `getJudgmentDisplay`。`DHRollCard` 组件保留但不再是必需路径。注册不依赖 `RulePlugin` 接口，未来移除 `RulePlugin` 时零改动。

### 决策 3：统一注册系统 — `RendererPoint<T>` + 删除 `ExtensionRegistry`

两套注册系统对比：

|  | `registerRenderer` | `ExtensionRegistry` |
| --- | --- | --- |
| 当前使用 | 生产代码 | 仅测试 |
| surface 维度 | 内建 | 无 |
| 多优先级注册 | 不支持 | 支持 |
| 类型安全 | 字符串键 | 泛型 token |

**方案**：保留 `registerRenderer` 并吸收 `ExtensionRegistry` 的类型安全能力，然后删除 `ExtensionRegistry`。

选择保留 `registerRenderer` 的理由：
- 是当前唯一的生产路径，改动最小
- 多优先级注册目前无使用场景（YAGNI）
- surface 维度已内建，无需手动编码

**系统内部机制：`RendererPoint<T>`**

```typescript
// rendererRegistry.ts — 系统内部，插件不直接接触
interface RendererPoint<T> {
  readonly surface: string
  readonly type: string
  readonly __phantom?: T  // 编译时类型约束，运行时不存在
}

function createRendererPoint<T>(surface: string, type: string): RendererPoint<T> {
  return { surface, type } as RendererPoint<T>
}

function registerRenderer<T>(point: RendererPoint<T>, value: T): void
function getRenderer<T>(point: RendererPoint<T>): T | undefined
```

**SDK 导出的 token 工厂函数（插件接触的 API）**

```typescript
// @myvtt/sdk — 系统预定义，插件直接 import 使用
type RollResultSlot = RollResultConfig | ComponentType<RollCardProps>

export function rollResult(rollType: string): RendererPoint<RollResultSlot> {
  return createRendererPoint<RollResultSlot>('rollResult', rollType)
}

// 系统内部使用的 token（不导出给插件）
export const chatRollResult = createRendererPoint<LogEntryRendererProps>('chat', 'core:roll-result')
export const chatText = createRendererPoint<LogEntryRendererProps>('chat', 'core:text')
```

类型安全分为两层：
- **系统层**：`chatRollResult` 等 token 保证系统 renderer 的 props 匹配
- **插件层**：`rollResult()` 返回的 token 保证插件提供的数据匹配 `RollResultConfig | ComponentType<RollCardProps>`

**删除范围**：
- `src/ui-system/extensionRegistry.ts`
- `src/ui-system/__tests__/extensionRegistry.test.ts`
- `PluginSDK` 构造函数中的 `extensionRegistry` 参数
- `IUIRegistrationSDK` 中的 `contribute` 方法
- `initWorkflowSystem` 中传递 `getExtensionRegistry()` 的调用
- `uiSystemInit.ts` 中的 `getExtensionRegistry()` 函数（如无其他使用）

### 决策 4：清理 `LogEntryCard` 的 fallback 路径

当前 `LogEntryCard` 有两条路径：
1. RendererRegistry 查找 → 使用注册的 renderer
2. Fallback → `logEntryToChatMessage()` → `MessageCard`

改造后，所有 chat-visible 类型都通过 RendererRegistry 注册了 renderer：
- `core:text` → `TextEntryRenderer`（已有）
- `core:roll-result` → `RollResultRenderer`（增强后）

`MessageCard` 的 dice 渲染路径（`CustomCard` / `DiceResultCard`）删除。`RollResultRenderer` 自身已提供三层 fallback（config → component → 默认纯骰子），`MessageCard` 的 dice 路径不会被触发，保留只增加理解成本。`MessageCard` 保留 text 渲染作为 `core:text` 的 fallback。

## 数据流

```
用户 .dd 2d12+@agility
  ↓
dh:action-check workflow（纯组合，无自有逻辑）
  ├─ ctx.runWorkflow(getRollWorkflow())       ← 可复用子 workflow
  │   └─ serverRoll() → 服务器创建 core:roll-result
  │                      (rollType='daggerheart:dd', rolls=[[9,1]])
  ├─ ctx.runWorkflow(getDHJudgmentWorkflow()) ← 可复用子 workflow
  │   ├─ judge  → dhEvaluateRoll(rolls, total) → judgment
  │   └─ resolve → updateTeamTracker (Hope/Fear ±1)
  └─ display → toast 通知
  ↓
客户端收到 1 条 core:roll-result (+ 1 条 core:tracker-update，不在 chat 显示)
  ↓
ChatPanel → logEntries.filter(CHAT_TYPES) → 无需 groupId 过滤
  ↓
LogEntryCard → getRenderer('chat', 'core:roll-result') → RollResultRenderer
  ↓
RollResultRenderer: rollType='daggerheart:dd'
  ├─ getRenderer('rollResult', 'daggerheart:dd') → 找到插件注册的配置
  ├─ diceSystem.evaluateRoll(rolls, total) → judgment
  ├─ diceSystem.getJudgmentDisplay(judgment) → { text, color }
  └─ 渲染 DiceAnimContent(dieConfigs + footer) → "Success with Hope" ✅
     （系统自动组装，插件只提供语义化配置）
```

**可复用单元一览**：

```
dhEvaluateRoll()          — 纯函数，系统和 workflow 都使用
getRollWorkflow()         — 子 workflow，处理掷骰 + 日志
getDHJudgmentWorkflow()   — 子 workflow，处理判定 + tracker 更新
rollResult() token        — SDK 导出，插件通过它注册语义化配置或组件覆盖
registerRenderer()        — 统一注册 API，系统和插件共用
```

## 改动文件清单

### 删除

| 文件 | 理由 |
| --- | --- |
| `plugins/daggerheart-core/DHJudgmentRenderer.tsx` | 不再有 `dh:judgment` 条目 |
| `src/ui-system/extensionRegistry.ts` | 统一到 `registerRenderer` |
| `src/ui-system/__tests__/extensionRegistry.test.ts` | 随 extensionRegistry 删除 |

### 修改

| 文件 | 改动 |
| --- | --- |
| `src/log/rendererRegistry.ts` | API 改为泛型 `RendererPoint<T>` token，运行时行为不变 |
| `src/log/renderers/RollResultRenderer.tsx` | 增加 rollType → 插件委托逻辑（config 优先 → 组件 → 默认） |
| `src/rules/types.ts` | 新增 `RollResultConfig` 接口 |
| SDK 导出（`@myvtt/sdk`） | 新增 `rollResult()` token 工厂函数 |
| `src/log/LogEntryCard.tsx` | 移除临时 console.log |
| `src/chat/MessageCard.tsx` | 删除 dice 渲染路径（`CustomCard` / `DiceResultCard` 分支），保留 text 渲染 |
| `src/chat/ChatPanel.tsx` | 删除 groupId 过滤、`dh:judgment` 从 `CHAT_TYPES`、临时 console.log |
| `plugins/daggerheart-core/rollSteps.ts` | 提取 `dh:judgment` 为独立子 workflow（judge + resolve），删除 `dh:emit-judgment`，`dh:action-check` 改为组合两个子 workflow |
| `src/workflow/pluginSDK.ts` | 移除 `extensionRegistry` 参数和 `contribute` |
| `src/workflow/useWorkflowSDK.ts` | `initWorkflowSystem` 不再传 `getExtensionRegistry()` |
| `src/ui-system/uiSystemInit.ts` | 移除 `getExtensionRegistry()` |
| `src/ui-system/registrationTypes.ts` | 移除 `IUIRegistrationSDK.contribute` |

### 保留不变

| 文件 | 理由 |
| --- | --- |
| `plugins/daggerheart/ui/DHRollCard.tsx` | 保留作为高级路径 escape hatch；Daggerheart 可选择迁移到纯配置 |
| `src/log/CardShell.tsx` | 通用卡片外壳 |
| `src/chat/DiceResultCard.tsx` | `DiceAnimContent` 被 RollResultRenderer 使用 |
| `plugins/daggerheart/diceSystem.ts` 中的 `dhEvaluateRoll` | 可复用纯函数，UI 和 workflow 共享 |

## 测试策略

### 单元测试
- `RollResultRenderer`：验证有 rollType 时委托给插件、无 rollType 时渲染纯骰子
- `DHRollCard`：验证 judgment 计算和渲染（已有测试）

### 集成测试
- workflow 只产生 `core:roll-result` + `core:tracker-update`，不产生 `dh:judgment`

### E2E 测试
- `.dd` 命令 → 聊天面板显示带 Hope/Fear 的骰子卡片
- `.r` 命令 → 聊天面板显示纯骰子卡片（无 judgment）
- 双客户端 → 两端看到相同的 judgment 卡片

## 已决定事项（原开放问题）

1. **历史 \****`dh:judgment`**\*\* 条目** — 保留不迁移，从 `CHAT_TYPES` 移除后自然不再显示
2. **`MessageCard` dice 路径** — 删除。`RollResultRenderer` 内部已有三层 fallback（config → component → 默认纯骰子），`MessageCard` 的 dice 路径是死代码
3. **`renderDice`**** 回调** — 简单路径（配置注册）完全不暴露 `renderDice`，系统内部处理。高级路径（组件注册）仍需提供 `renderDice`，由 `RollResultRenderer` 内部构建（从 MessageCard 搬运逻辑）
