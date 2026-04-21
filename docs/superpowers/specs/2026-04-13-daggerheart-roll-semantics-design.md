# Daggerheart 掷骰语义补充设计

> **状态**：草案已确认，待实现 | 2026-04-13

## 背景

当前统一掷骰系统已经基本完成，但关于“自由公式输入”、“无 DC 掷骰语义”和“反应掷骰”仍有几个关键规则没有正式落文：

- 插件 workflow 与基座 workflow 是否必须统一
- `ModifierPanel` 是否应支持手写公式
- 无 DC 时二元骰结果应如何判定
- 不触发资源后果的反应掷骰应如何表达

本设计只处理以上语义问题，不重做底部面板整体架构。

## 设计目标

1. 保持玩家已有输入习惯不变
2. 在内部统一 Daggerheart 掷骰语义，避免重复实现
3. 允许同一套掷骰流程同时支持：
   - 有 DC / 无 DC
   - 触发资源后果 / 不触发资源后果
4. 让 `ModifierPanel` 成为统一的图形化 + 文本混合编辑入口

## 非目标

- 不要求把插件 workflow 和基座 workflow 合并成同一个 workflow
- 不要求废弃 `.r` / `.roll`
- 不要求修改聊天系统的基础渲染协议
- 不在本设计中重做底部面板布局

## 核心决策

### 决策 1：插件 workflow 与基座 workflow 不强制统一

结论：

- 基座继续保留通用公式掷骰能力（如 `.r` / `.roll`）
- Daggerheart 插件继续保留自己的规则语义 workflow
- 两者只需要共享底层 primitive，不需要共享同一个入口或 handle

理由：

- 基座关心“公式解析、掷骰、通用展示”
- 插件关心“二元骰语义、DC 判定、资源后果、模板、专用 UI”
- 强行统一 workflow 只会让边界变差

### 决策 2：`ModifierPanel` 应支持手写公式

结论：

- 当前只读 `FormulaBar` 升级为“可编辑公式输入区”
- 玩家既可以通过控件拼公式，也可以直接手写公式
- 底部面板中涉及自由公式的输入，应优先复用 `ModifierPanel`，而不是再造一套独立输入框

理由：

- 现在系统已经支持大量结构化配置，但缺少文本直输入口
- 如果 `CustomTab` / `DiceTab` 再各自做自由公式输入，会出现两套解析和校验逻辑
- 把文本输入合并进 `ModifierPanel`，可以把“图形化编辑”和“高手手写”统一在同一个入口里

### 决策 3：`DC` 与“是否触发资源后果”是两个独立维度

结论：

- `dc?: number` 保持可选
- 新增独立布尔开关：`applyOutcomeEffects: boolean`
- 不能把“无 DC”与“反应掷骰”绑定在一起

理由：

- 无 DC 只影响“能否判定成功 / 失败”
- 是否触发资源后果是另一条规则轴
- 反应掷骰是“不触发资源后果”的一种输入意图，不等于“无 DC”

### 决策 4：无 DC 时仍保留二元骰结果语义

结论：

- 即使没有 DC，也依然可以从二元骰判定出“希望结果”或“恐惧结果”
- 如果两颗二元骰点数相同，依然判定为 `critical_success`
- 无 DC 时只是不再判定“成功 / 失败”

理由：

- 二元骰高低关系本身就是 Daggerheart 结果语义的一部分
- “关键成功就是关键成功”，不应依赖 DC 是否存在
- 无 DC 掷骰不应该退化成只显示总点数的普通掷骰

### 决策 5：反应掷骰是显式 UI 开关，并保留 `.ddr` 传统命令

结论：

- UI 上显式提供“反应掷骰”开关
- `.dd` 继续作为普通行动检定命令
- `.ddr` 继续作为反应掷骰命令
- `.ddr` 只是预置 `applyOutcomeEffects=false` 的便捷入口

理由：

- 玩家不需要改变已有命令习惯
- UI 使用者也能明确看到当前是否会结算资源后果
- 内部实现可以只维护一套流程，通过默认值区分输入来源

## 结果语义模型

### 有 DC

当存在 `dc` 时，结果集合为：

- `critical_success`
- `success_hope`
- `success_fear`
- `failure_hope`
- `failure_fear`

判定逻辑：

- 二元骰相等：`critical_success`
- 二元骰不等：
  - `total >= dc` 时为 `success_*`
  - `total < dc` 时为 `failure_*`
  - 希望骰大于恐惧骰时为 `*_hope`
  - 恐惧骰大于希望骰时为 `*_fear`

### 无 DC

当 `dc` 缺失时，结果集合为：

- `critical_success`
- `hope_unknown`
- `fear_unknown`

判定逻辑：

- 二元骰相等：`critical_success`
- 希望骰大于恐惧骰：`hope_unknown`
- 恐惧骰大于希望骰：`fear_unknown`

语义说明：

- `hope_unknown`：确定是希望结果，但不判断是否成功
- `fear_unknown`：确定是恐惧结果，但不判断是否成功

## 资源后果语义

### 独立开关

新增：

```ts
applyOutcomeEffects: boolean
```

含义：

- `true`：根据结果自动结算 Hope / Fear 等后果
- `false`：只显示掷骰结果，不自动结算资源后果

### 与结果语义的关系

资源后果不由 `dc` 是否存在决定，而由 `applyOutcomeEffects` 决定。

因此允许以下组合：

- 有 DC + 触发资源后果
- 有 DC + 不触发资源后果
- 无 DC + 触发资源后果
- 无 DC + 不触发资源后果

### 反应掷骰

“反应掷骰”只是以下默认值的组合：

- `applyOutcomeEffects = false`

是否存在 `dc`，由具体场景决定，不由“反应掷骰”身份强制决定。

## 输入设计

### 聊天命令

- `.dd`：普通 Daggerheart 掷骰入口
  - 默认 `applyOutcomeEffects=true`
- `.ddr`：反应掷骰入口
  - 默认 `applyOutcomeEffects=false`

命令的存在是为了保留用户习惯，内部可以复用同一套 workflow。

### ModifierPanel

`ModifierPanel` 需要支持两种编辑模式共存：

1. **结构化编辑**
   - 属性
   - Experience
   - 二元骰
   - 标准骰
   - keep high / low
   - 常量修正
   - 副作用

2. **文本编辑**
   - 允许直接手写公式
   - 文本编辑结果需要可反解或至少可同步为内部 `RollConfig`

### DC 输入

`DC` 输入框应允许清空，表示“无 DC”。

要求：

- UI 上可以明确看到当前是“有 DC”还是“无 DC”
- 不再强制默认 `12`
- 空值不应被自动恢复成数值默认值

### 反应掷骰开关

UI 上显式提供开关，例如：

- `反应掷骰`
- 或 `不触发资源后果`

要求：

- 状态明确可见
- 切换后立即影响当前掷骰配置
- 模板保存后应能复现该开关状态

## 数据模型调整

推荐在 `RollConfig` 中补充：

```ts
interface RollConfig {
  dualityDice: DualityDiceConfig | null
  diceGroups: DiceGroup[]
  modifiers: ModifierSource[]
  constantModifier: number
  sideEffects: SideEffectEntry[]
  dc?: number
  applyOutcomeEffects: boolean
}
```

说明：

- `dc` 继续保持可选
- `applyOutcomeEffects` 表示当前掷骰是否自动结算规则后果

如需更严格地区分输入来源，可在 workflow vars 中额外保留：

```ts
isReactionRoll?: boolean
```

但这只是输入层语义，不应替代 `applyOutcomeEffects`。

## Workflow 设计

### 总体原则

- 外部入口可以有多个：`.dd`、`.ddr`、角色卡、底部面板、模板
- 内部尽量复用同一套 Daggerheart workflow
- 不必新拆一套完整 reaction workflow

### 推荐流程

仍使用：

- `modifier`
- `roll`
- `judge`
- `emit`
- `resolve`

其中：

- `modifier` 负责收集 `dc`、`applyOutcomeEffects`、公式/配置
- `judge` 根据是否存在 `dc` 生成完整判定或部分判定
- `resolve` 只在 `applyOutcomeEffects=true` 时执行 Hope / Fear 等资源后果

### `judge` 步骤新规则

- 无二元骰：不生成 Daggerheart judgment
- 有二元骰且有 `dc`：生成完整 judgment
- 有二元骰且无 `dc`：生成 `critical_success | hope_unknown | fear_unknown`

### `resolve` 步骤新规则

- `applyOutcomeEffects=false` 时，不执行 Hope / Fear 自动结算
- `applyOutcomeEffects=true` 时，按 judgment 类型执行后果

## 模板系统影响

模板配置需要持久化：

- `dc?: number`
- `applyOutcomeEffects: boolean`

这意味着：

- 同一个模板可以保存为普通检定模板
- 也可以保存为反应掷骰模板
- 模板运行时无需再通过名字或命令猜测语义

## 聊天展示影响

聊天卡片需要支持两类部分判定文案：

- `hope_unknown`
- `fear_unknown`

展示要求：

- 明确显示“希望结果”或“恐惧结果”
- 明确不显示“成功 / 失败”措辞
- `critical_success` 继续沿用关键成功展示

## 测试要求

至少补齐以下回归：

1. 无 DC + hope > fear → `hope_unknown`
2. 无 DC + fear > hope → `fear_unknown`
3. 无 DC + 双骰相等 → `critical_success`
4. `applyOutcomeEffects=false` 时不触发 Hope / Fear 自动结算
5. `.dd` 默认开启资源后果
6. `.ddr` 默认关闭资源后果
7. `ModifierPanel` 可清空 DC
8. 模板能正确保存并恢复 `applyOutcomeEffects`

## 迁移策略

### 对现有用户习惯

- `.dd` 保持原行为
- `.ddr` 继续保留为反应掷骰入口
- 现有玩家不需要学习新的命令

### 对现有配置

- 旧模板若缺少 `applyOutcomeEffects`，迁移时默认补为 `true`
- 旧配置若 `dc` 缺失，不应再被自动补成 `12`

## 结论

本设计将当前剩余问题拆成三个独立能力：

1. `ModifierPanel` 支持手写公式
2. `DC` 可空，并支持无 DC 部分判定
3. 反应掷骰作为独立“资源后果开关”存在，并继续保留 `.ddr`

这样可以在不改变用户习惯的前提下，把当前统一掷骰系统从“结构化 action-check”推进到“完整的 Daggerheart 掷骰语义系统”。
