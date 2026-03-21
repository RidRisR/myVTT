# FVTT 架构缺陷分析与规避策略

## Context

本文档基于 `docs/design/16-插件系统重构三层架构与Pipeline设计.md` 的设计，分析 Foundry VTT (FVTT) 的已知架构缺陷，评估我们的设计是否已经规避，并提出需要补充的改进。

我们的插件系统在概念层面与 FVTT 的三层结构（Core → System → Module）对应：

| FVTT        | myVTT    |
| ----------- | -------- |
| Core        | 基座     |
| Game System | 规则系统 |
| Module      | 扩展插件 |

---

## 总览

| #   | FVTT 缺陷                       | 我们的状态  | 详见 |
| --- | ------------------------------- | ----------- | ---- |
| 1   | Monkey-patching 扩展机制        | ⚠️ 部分规避 | §1   |
| 2   | Hook 无优先级 / 无 async        | ⚠️ 部分规避 | §2   |
| 3   | 固定 prepareData 派生流水线     | ⚠️ 部分规避 | §3   |
| 4   | ActiveEffect 浅层 key-path 覆写 | ✅ 已规避   | §4   |
| 5   | 客户端执行 + 安全模型           | ⚠️ 部分规避 | §5   |
| 6   | Roll async 摩擦 + 结果结构缺失  | ⚠️ 部分规避 | §6   |
| 7   | 模块冲突无检测                  | ❌ 未规避   | §7   |
| 8   | 批量操作缺失                    | ❌ 未规避   | §8   |
| 9   | UI 扩展无正式机制               | ❌ 未涉及   | §9   |

---

## §1 Monkey-Patching 扩展机制

### FVTT 的问题

FVTT 没有正式的扩展 API。模块通过 monkey-patch 核心类方法来改变行为：

```javascript
// Module A
const original = Token.prototype._onClickLeft
Token.prototype._onClickLeft = function (event) {
  // 自定义逻辑
  original.call(this, event)
}

// Module B — 静默覆盖 Module A 的 patch
Token.prototype._onClickLeft = function (event) {
  // 完全不同的逻辑，Module A 的 patch 消失了
}
```

两个模块 patch 同一方法会互相覆盖，社区被迫发明 `libWrapper` 作为第三方补丁调度器。这是 FVTT 最大的架构缺陷，也是模块兼容性问题的根源。

### 我们的设计

Pipeline + Stage + priority 机制解决了**逻辑层**的 monkey-patching 问题。扩展插件不需要 patch 动作执行逻辑，只需注册 handler 到指定 Stage：

```typescript
// 扩展插件注册到已有 Stage，不覆盖任何东西
plugin.registerStageHandler('dh:attack', 'CALC_DAMAGE', {
  priority: 50, // 在规则系统 (p:0) 之后执行
  handler(ctx) {
    /* ... */
  },
})
```

### 状态：⚠️ 部分规避

Pipeline 解决了 FVTT monkey-patching 中最关键的类别（动作执行流程），但 FVTT 模块使用 patch 的场景远不止这一个。逐一分析：

| #   | Patch 场景   | FVTT 示例                | 我们是否覆盖                      |
| --- | ------------ | ------------------------ | --------------------------------- |
| 1   | 动作执行流程 | 修改攻击伤害计算         | ✅ Pipeline + Stage handler       |
| 2   | 被动事件响应 | HP 归零触发死亡检查      | ✅ Hook + System                  |
| 3   | 数据派生     | 修改 HP 上限计算方式     | ⚠️ 无明确机制（→ §3）             |
| 4   | **UI 修改**  | 在角色卡上添加 section   | ❌ 无正式机制（→ §9）             |
| 5   | 核心行为覆写 | 改变目标选择逻辑         | ⚠️ 部分有 Hook（preTargetFilter） |
| 6   | Token 渲染   | 修改 Token 外观/叠加图标 | ❌ 无机制                         |
| 7   | 权限/可见性  | 改变谁能看到什么         | ❌ 无机制                         |

**结论**：数据层和逻辑层的扩展问题已经通过 Pipeline + Hook + System 解决。剩余缺口集中在 **UI 层**（规则系统 → 扩展插件方向）——扩展插件无法修改规则系统已有的 UI 组件。

这比 FVTT 的情况好很多：FVTT 的 Core UI 也没有扩展点，模块既要 patch Core 又要 patch System。我们的基座 UI 已经是注册式的（`ui.panels`、`ui.dockTabs` 等），问题只出现在规则系统 → 扩展插件这一层。详见 §9 的解决方案分析。

---

## §2 Hook 无优先级 / 无 async

### FVTT 的问题

1. **Hook 不 await async handler** — `Hooks.call()` 检查 `=== false` 来取消链，但 async handler 返回 Promise（truthy），永远无法取消
2. **无优先级系统** — 执行顺序取决于模块加载顺序，两个模块同时修改 `preUpdateActor` 的 patch 数据时结果不确定
3. **无返回值聚合** — `Hooks.callAll()` 忽略所有返回值，无法实现"多个模块投票决定是否允许某操作"
4. **参数引用陷阱** — 对象参数是引用传递，但 handler 重新赋值参数变量会静默断开引用

### 我们的设计

- Pipeline StageHandler 有 `priority` 排序 — ✅
- Handler 签名 `() => void | Promise<void>` 支持 async — ✅
- **但 Hook（基座事件）的优先级和 async 机制未明确定义**
- 干预型 Hook（`preUpdateEntity` 等）如何支持 async 修改 patch？执行模型是什么？

### 状态：⚠️ 部分规避

Pipeline 部分已解决，但 Hook 系统需要补充设计。

### 建议

1. Hook handler 也应支持 priority + async（与 StageHandler 统一模型）
2. 干预型 Hook 使用 `ctx.preventDefault()` 而非 `return false`，避免 FVTT 的 truthy Promise 陷阱
3. 干预型 Hook 的参数修改应通过 ctx 方法（如 `ctx.mutatePatch(fn)`）而非直接修改引用

---

## §3 固定 prepareData 派生流水线

### FVTT 的问题

FVTT 的数据准备是固定三步流水线：

```
prepareBaseData() → applyActiveEffects() → prepareDerivedData()
```

如果 System 需要"先从 items 派生数据 → 再应用 effects → 再派生其他数据"，无法做到。在 `prepareData()` 里调用 `update()` 会无限循环。

这个固定顺序导致许多 Game System（尤其是 dnd5e）不得不 override `applyActiveEffects()` 来重排流水线。

### 我们的设计

我们用 Component 作为纯数据，没有 `prepareData` 概念 — 规避了固定流水线问题。

**但 Component 之间的派生关系未定义。** 比如：

- `health.max` 可能依赖 `attributes.constitution`
- `armorThresholds.major` 可能依赖 `attributes.tier + equipment.armor`

这个派生计算在哪里发生？目前没有机制。

### 状态：⚠️ 部分规避

没有固定流水线的问题，但缺少派生计算机制。

### 建议

可能的方案（需要讨论选择哪个）：

**方案 A：System handler 在 postUpdateEntity 中重新计算**

```typescript
plugin.registerSystem({
  id: 'dh:derive-health-max',
  on: 'postUpdateEntity',
  requires: ['health', 'attributes'],
  handler(ctx, entityId, entity) {
    const con = entity.ruleData.attributes.constitution
    const newMax = 10 + con * 2
    if (entity.ruleData.health.hp.max !== newMax) {
      ctx.updateEntity(entityId, { ruleData: { health: { hp: { max: newMax } } } })
    }
  },
})
```

- 优点：利用现有 System 机制，无需新概念
- 缺点：updateEntity 递归风险（改 max → 触发 postUpdate → 再次检查）

**方案 B：引入 deriveData Pipeline**

- 实体数据变更后自动执行一个轻量 Pipeline
- 优点：明确的执行时机和顺序
- 缺点：增加复杂度

**方案 C：暂不处理，由插件在 RESOLVE 阶段一次性计算所有派生值**

- 优点：最简单
- 缺点：散落在各处的 RESOLVE handler 中，不容易发现和维护

---

## §4 ActiveEffect 浅层 key-path 覆写

### FVTT 的问题

ActiveEffect 通过 dot-notation 路径修改数值：

```javascript
// FVTT ActiveEffect change
{ key: 'system.attributes.hp.max', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: '5' }
```

只能做 ADD / MULTIPLY / OVERRIDE / UPGRADE / DOWNGRADE / CUSTOM 等简单操作，无法表达：

- 条件逻辑（"如果目标在 10 尺内，AC +2"）
- 跨属性依赖（"伤害 = 力量 × 武器骰"）
- 效果之间的交互（"免疫毒素时忽略中毒效果"）

`CUSTOM` mode 是一个逃生口，但每个 System 必须自行实现，导致行为不一致。

### 我们的设计

我们没有 ActiveEffect 系统。条件/buff 是 Component 数据（`conditions.active: ['vulnerable']`），效果的实际影响通过 Pipeline Stage handler 在运行时计算：

```typescript
// 效果语义是代码，不是声明式路径覆写
registerStageHandler('dh:attack', 'CALC_DAMAGE', {
  priority: 50,
  handler(ctx) {
    if (conditions.includes('vulnerable') && ctx.data.rawDamage) {
      ctx.data.rawDamage *= 2
    }
  },
})
```

### 状态：✅ 已规避

效果语义在代码中，比 FVTT 灵活得多。

### 潜在权衡

代码化意味着每个"效果"都需要对应的 Stage handler。对于简单的数值修改（"HP 上限 +5"），是否需要一个轻量的声明式 modifier 系统？

这是一个设计取舍，不一定现在就要决定。如果大多数效果都是"数值 +N"类型，声明式 modifier 能显著减少样板代码。如果效果大多是条件逻辑，代码化反而更清晰。

---

## §5 客户端执行 + 安全模型

### FVTT 的问题

几乎所有逻辑在客户端执行：

- **掷骰客户端执行** — 玩家可以用浏览器控制台篡改结果
- **权限检查主要在客户端** — 恶意客户端可以绕过大部分限制
- **TypeDataModel 验证仅客户端** — 服务端不构造 System 数据模型
- 服务端本质上是数据库 + Socket.io 中继

### 我们的设计

- `ctx.roll()` 设计为服务端掷骰 — ✅
- `ctx.updateEntity()` 走 REST API，写入经过服务端 — ✅
- **但 Pipeline 本身在哪里执行？** 文档没有明确说明

如果 Pipeline 在客户端执行（当前隐含假设），扩展插件仍然可以篡改 `ctx.data`。

### 状态：⚠️ 部分规避

服务端掷骰 + REST 写入已提供基础安全保障，但 Pipeline 执行位置需要明确。

### 建议

1. **短期**：Pipeline 在客户端执行（最简单，当前已足够）。RESOLVE 阶段的 `updateEntity` 经过服务端校验（已有）
2. **中期**：服务端可以校验 Pipeline 结果的合理性（如伤害值不超过某个上限）
3. **长期**：关键 Pipeline（如攻击）可选择服务端执行，客户端只提交"我要执行 dh:attack，目标 = X"

明确记录当前选择：**Pipeline 客户端执行，安全边界在服务端 REST API 层**。

---

## §6 Roll async 摩擦 + 结果结构缺失

### FVTT 的问题

1. **`Roll.evaluate()` 是 async** — 但很多调用点（Hook、同步渲染）无法 await，强制开发者使用笨拙的同步替代方案
2. **Roll 结果是黑盒** — 主要输出是总数或 HTML，程序化访问单个骰子结果需要深入未文档化的内部结构
3. **括号表达式丢失数据** — 括号内的公式和骰子数据在求值后被丢弃
4. **爆炸骰追加而非替换** — 导致"从爆炸集合中取最高"无法实现

### 我们的设计

- `ctx.roll(formula)` 返回 `Promise<RollResult>` — async ✅
- Pipeline handler 原生支持 async — 可以自然 await — ✅
- **但 `RollResult` 的结构未定义**。示例中直接访问 `result.terms[0].results`，没有标准化

### 状态：⚠️ 部分规避

async 摩擦已解决，但 RollResult 结构需要定义。

### 建议

定义 `RollResult` 标准结构：

```typescript
interface RollResult {
  total: number
  formula: string
  terms: DiceTermResult[] // 每个 term 的详细结果
}

interface DiceTermResult {
  type: 'dice' | 'modifier' | 'operator'
  faces?: number // 骰子面数
  count?: number // 骰子数量
  results?: number[] // 每个骰子的结果
  value: number // 该 term 的计算值
}
```

这样规则系统可以可靠地访问 Hope/Fear 双骰的各自结果，扩展插件也可以实现"所有 1 重掷"等效果。

---

## §7 模块冲突无检测

### FVTT 的问题

- **无传递依赖解析** — 只支持一级依赖声明
- **无冲突声明系统** — 没有 manifest 字段声明"与 X 不兼容"
- **二分查找调试** — 社区发明 "Find the Culprit" 模块来二分定位冲突
- **版本更新级联** — 每个大版本破坏大量模块生态，用户必须等所有模块更新

### 我们的设计

- `sdkVersion: '2'` 字段存在但含义未定义
- 无插件间依赖声明、无冲突检测

### 状态：❌ 未规避

### 建议

VTTPlugin 接口增加：

```typescript
interface VTTPlugin {
  // ... 现有字段

  // 依赖与兼容性
  sdkVersion: '2' // 语义：基座 SDK 主版本，决定 API 兼容性
  dependencies?: PluginDependency[] // 依赖声明
  conflicts?: string[] // 已知冲突的插件 id
}

interface PluginDependency {
  pluginId: string
  versionRange?: string // semver range, e.g. '>=1.0.0'
  optional?: boolean // 可选依赖（缺失时功能降级）
}
```

基座在加载插件时：

1. 检查 `sdkVersion` 兼容性
2. 解析依赖图，按拓扑排序加载
3. 冲突检测并报错

---

## §8 批量操作缺失

### FVTT 的问题

批量更新 20 个 token 的 HP 会产生 20 个独立的 socket 事件和数据库写入，无事务支持。

### 我们的设计

RESOLVE 阶段可能调用多次 `ctx.updateEntity()`，每次都是独立的 REST 调用。多目标 Pipeline 的执行策略也未定义。

### 状态：❌ 未规避

### 建议

**方案 A：RESOLVE 阶段自动收集批量提交**

Pipeline 执行器在 RESOLVE 阶段开始时启用"收集模式"，所有 `ctx.updateEntity()` 调用被收集而非立即执行，阶段结束后批量提交：

```typescript
// Pipeline 执行器内部
async function executeResolveStage(ctx, handlers) {
  ctx._startBatch()
  for (const handler of handlers) {
    await handler(ctx)
  }
  await ctx._commitBatch() // 批量 REST 调用 + 批量 Socket 广播
}
```

- 优点：对 handler 代码透明，不需要改 API
- 缺点：handler 在同一阶段内无法读取自己刚写入的数据

**方案 B：提供显式批量 API**

```typescript
ctx.batchUpdate([
  { entityId: target1.id, patch: { ... } },
  { entityId: target2.id, patch: { ... } },
])
```

- 优点：语义明确
- 缺点：改变 handler 的编写模式

---

## §9 UI 扩展无正式机制

### FVTT 的问题

FVTT 的 UI 扩展完全依赖 monkey-patching：

```javascript
// 模块通过 patch Application.render 来注入 UI
const original = ActorSheet.prototype._renderInner
ActorSheet.prototype._renderInner = async function (data) {
  const html = await original.call(this, data)
  html.find('.header').append('<div class="my-module-widget">...</div>')
  return html
}
```

这导致了与逻辑层相同的冲突问题——多个模块同时 patch 同一个 Sheet 时互相覆盖。

### 问题的精确范围

UI 扩展问题分两个层次：

**层次 1：基座 UI → 插件（已解决）**

基座提供 UI 骨架，插件往里面"填内容"。当前设计已经是注册式的：

- `ui.panels` — 添加新面板
- `ui.dockTabs` — 添加 Dock 标签页
- `ui.menuItems` — 添加右键菜单项
- `adapters` — 为 Token/Portrait 提供数据

这部分不需要 patch，设计是对的。

**层次 2：规则系统 UI → 扩展插件（未解决）**

扩展插件想**修改规则系统已有的 UI**。规则系统的 UI 组件（`EntityCard`、`RollCard`、`TeamPanel`）是整体注册的 React 组件，扩展插件没有注入点。

具体场景：

- 在 Daggerheart 角色卡上添加一个"条件追踪器"区域
- 在掷骰结果卡片中追加一行伤害日志
- 在 Token 上叠加规则系统定义的条件图标

核心原因：React 组件是不透明的函数，无法从外部"插入"到组件内部，除非组件主动开放入口。

### 状态：❌ 层次 2 未涉及

### 方案分析

#### 方案 A：Slot 注册（推荐的长期方向）

基座提供 `<PluginSlot>` 组件，规则系统在 UI 中埋入命名插槽，扩展插件往插槽注册内容：

```tsx
// ── 基座提供 ──
function PluginSlot({ name, props }) {
  const slots = usePluginSlots(name) // 从注册表读取
  return slots
    .sort((a, b) => a.priority - b.priority)
    .map((slot) => <slot.component key={slot.pluginId} {...props} />)
}

// ── 规则系统的角色卡 ──
function DaggerheartCard({ entity }) {
  return (
    <div>
      <AttributeSection entity={entity} />
      <HealthSection entity={entity} />
      <PluginSlot name="dh:character-card:after-health" props={{ entity }} />
      <ConditionsSection entity={entity} />
      <PluginSlot name="dh:character-card:after-conditions" props={{ entity }} />
    </div>
  )
}

// ── 扩展插件注册 ──
const plugin: VTTPlugin = {
  ui: {
    slots: [
      {
        name: 'dh:character-card:after-conditions',
        priority: 0,
        component: ConditionTrackerWidget,
      },
    ],
  },
}
```

**优点：**

- 模式成熟（WordPress hooks、VS Code contribution points、Figma plugin API）
- 规则系统完全控制哪些位置可扩展
- 多个扩展插件可以往同一个 Slot 注册，有 priority 排序，不冲突
- 与三层架构一致 — Pipeline 是逻辑层的"扩展点"，Slot 是 UI 层的"扩展点"

**缺点：**

- 规则系统必须主动埋 Slot — 没有 Slot 的位置无法扩展
- Slot 的 props 接口需要规则系统定义和文档化

#### 方案 B：Section 组合

规则系统不直接提供完整的 `EntityCard` 组件，而是声明一个 section 列表，基座渲染和排序。扩展插件可以插入新 section：

```typescript
// 规则系统
ui: {
  entityCardSections: [
    { id: 'dh:attributes', priority: 0, component: AttributeSection },
    { id: 'dh:health', priority: 10, component: HealthSection },
  ],
}

// 扩展插件追加
ui: {
  entityCardSections: [
    { id: 'dh-ext:tracker', priority: 25, component: TrackerWidget },
  ],
}
```

**优点：** 扩展插件天然可以插入，不需要规则系统主动埋 Slot
**缺点：** 规则系统丧失对整体布局的控制；复杂布局（两列、嵌套）难以用扁平列表表达；只解决角色卡一种 UI

#### 方案 C：不解决 — 扩展插件用独立 UI

扩展插件不修改规则系统的 UI，而是通过独立面板展示内容。

**优点：** 最简单，无需新机制
**缺点：** 用户体验碎片化，无法实现紧密集成的场景

### 建议

**方案 A（Slot）作为长期方向，方案 C 作为短期现实。**

理由：

1. 短期内只有 Daggerheart 一个规则系统，没有真实的扩展插件需求，方案 C 足够
2. Slot 模式与三层架构完全一致 — 规则系统作为二层基座，在逻辑层（Pipeline）和 UI 层（Slot）都为扩展插件提供入口
3. 方案 B 看似更"开放"，但实际会让规则系统丧失布局控制，得不偿失
4. 当第一个真实的扩展插件需求出现时再实现 Slot

---

## Assumptions

- FVTT 的架构缺陷分析基于 V10-V12 版本（截至 2025）
- 我们的产品定位为轻量 VTT，扩展插件生态的规模远小于 FVTT
- 部分"未规避"的问题可以在有真实需求时再解决，不需要全部前置设计

## Edge Cases

- 如果未来需要支持第三方开发者编写扩展插件，§7（冲突检测）和 §9（UI 扩展）的优先级会显著提高
- 如果需要支持公开对战（非信任玩家），§5（安全模型）需要重新评估
- 如果规则系统需要大量声明式 buff（如 D&D 5e 的大量数值修改），§4（ActiveEffect 替代方案）需要再设计
