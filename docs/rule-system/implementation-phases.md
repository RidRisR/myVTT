# 分阶段实施计划

## 概述

当前只做 Daggerheart 一个规则。在过程中摸索基座与规则的真实边界，不做房间选择、不做 CoC、不做模板系统。

## Phase 1: 基座清理 + Daggerheart 实现

### Step 1: 类型定义与接口

创建规则系统的类型基础。

**新增文件：**
- `src/rules/types.ts` — RuleSystem 接口、RollAction、ModifierOption、JudgmentResult、JudgmentDisplay、DieStyle、RollContext、CharacterCardProps

**修改文件：**
- `src/shared/tokenTypes.ts` — Attribute 加 `category?: string`
- `src/chat/chatTypes.ts` — ChatRollMessage 加 `actionName?`, `judgment?`, `modifiersApplied?`

### Step 2: 基座扩展点

给基座组件添加规则需要的接口/slot。

**修改文件：**
- `src/chat/DiceReel.tsx` — 加 `color?: string` prop
- `src/chat/DiceResultCard.tsx` — 判定区域：如果 `message.judgment` 存在，渲染 JudgmentBadge
- `src/layout/MyCharacterCard.tsx` — 重构为容器壳，内容由 props 的规则组件填充

**新增文件：**
- `src/dice/JudgmentBadge.tsx` — 基座通用组件，接收 JudgmentDisplay 渲染彩色标签
- `src/dice/RollConfirmPanel.tsx` — 投掷确认面板（公式预览 + 临时修正 + 修正选项 + DC + 投掷按钮）

### Step 3: Daggerheart 规则模块

实现 DaggerheartRuleSystem。

**新增文件：**
- `src/rules/registry.ts` — `getRuleSystem(id)` 注册表
- `src/rules/daggerheart/index.ts` — DaggerheartRuleSystem 实现
- `src/rules/daggerheart/judgment.ts` — Hope/Fear 判定逻辑
- `src/rules/daggerheart/DaggerheartCard.tsx` — 角色卡组件

### Step 4: 集成

把规则系统接入应用。

**修改文件：**
- `src/App.tsx` — 获取当前 RuleSystem（暂时硬编码 Daggerheart）；角色创建时用 `getDefaultAttributes/Resources` 初始化；传递 `onRollAction` 回调
- `src/chat/ChatPanel.tsx` — 掷骰流程集成判定：roll → evaluateRoll → getDieStyles + getJudgmentDisplay → 构造 ChatRollMessage

### 关键文件索引

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/rules/types.ts` | 新增 | 接口 + 类型 |
| `src/rules/registry.ts` | 新增 | 规则注册表 |
| `src/rules/daggerheart/index.ts` | 新增 | 规则实现 |
| `src/rules/daggerheart/judgment.ts` | 新增 | 判定逻辑 |
| `src/rules/daggerheart/DaggerheartCard.tsx` | 新增 | 角色卡 |
| `src/dice/JudgmentBadge.tsx` | 新增 | 判定标签 |
| `src/dice/RollConfirmPanel.tsx` | 新增 | 确认面板 |
| `src/shared/tokenTypes.ts` | 修改 | Attribute 加 category |
| `src/chat/chatTypes.ts` | 修改 | ChatRollMessage 扩展 |
| `src/chat/DiceReel.tsx` | 修改 | 加 color prop |
| `src/chat/DiceResultCard.tsx` | 修改 | 判定区域 |
| `src/chat/ChatPanel.tsx` | 修改 | 掷骰流程集成 |
| `src/layout/MyCharacterCard.tsx` | 修改 | 重构为容器壳 |
| `src/App.tsx` | 修改 | 规则系统接入 |

### 复用清单

| 现有代码 | 路径 | 用途 |
|----------|------|------|
| `rollCompound()` | `src/shared/diceUtils.ts` | 掷骰核心，不改 |
| `resolveFormula()` | `src/shared/diceUtils.ts` | @变量替换，不改 |
| `ResourceBar` | `src/shared/ui/ResourceBar.tsx` | Daggerheart 卡复用 |
| `MiniHoldButton` | `src/shared/ui/MiniHoldButton.tsx` | Daggerheart 卡复用 |
| `useHoldRepeat` | `src/shared/useHoldRepeat.ts` | 长按加速 |

### 验证方法

1. 角色创建 → 自动带 Daggerheart 的 6 属性 + 4 资源
2. 角色卡显示 Daggerheart 专属布局 + 每个属性旁的掷骰按钮
3. 点击 [🎲] → RollConfirmPanel 弹出 → 可输入 DC → 投掷
4. 骰子动画：两个 d12 分别显示金色(Hope)/紫色(Fear)
5. 判定标签正确显示（如 "成功 (Hope)"，双骰相等显示 "大成功！"）
6. 聊天消息中包含判定数据
7. 手动 `.r` 命令仍正常工作（基座掷骰引擎不受影响）

---

## Phase 2: 目标系统 + 半自动攻击（后续再细化）

方向记录，不做详细设计：

- 扩展 `resolveFormula` 支持 `@target.KEY`
- 战斗模式目标选择 UI
- RuleSystem 接口加 `getTargetActions`, `calculateDamage`
- 半自动攻击流程：投掷 → 判定命中 → 投伤害 → 确认面板 → 扣除 HP
- Daggerheart 阈值伤害计算
